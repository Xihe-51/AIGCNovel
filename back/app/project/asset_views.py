# -*- coding=utf-8 -*-
"""素材体检：把项目里所有「指向素材」的字段收拢起来，逐条核对磁盘上是否真的存在。

为什么要单独做：
- 上传的背景/音乐/立绘/配音都是**项目本地文件**（/static/project/<pid>/...），
  它们不落在 market_resources 上，所以不会进 resource_references 引用表；
- 市场素材（CG 或手动引用）才有 resource_references 记录，需要单独看引用数与文件状态。

因此这里做两件事：
1. 扫描项目内全部素材字段（场景背景/音乐、立绘、配音、CG、演出指令、封面），
   把 `/static/...` 映射到磁盘路径并判断存在性，列出缺失项；
2. 汇总该项目引用的市场素材（含引用计数），并给出文件状态。

路由：GET /project/assets/check/<project_id>（仅作者本人可读）
"""
import os

from flask import jsonify

from .. import db
from ..models import Character, CharacterAvatar, Scene, ScriptContent, \
    ProjectCG, ContentDirective, MarketResource, ResourceReference
from . import project
from .save_views import _owned_project

# app/static 的绝对路径：不依赖进程工作目录
STATIC_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'static')

# 素材类型的中文名，前端直接展示
KIND_LABELS = {
    'cover': '项目封面',
    'background': '场景背景',
    'music': '场景音乐',
    'avatar': '角色立绘',
    'voice': '节点配音',
    'cg': 'CG 图片',
    'directive': '演出素材',
}


def _disk_path(url):
    """把落库的 URL 映射为磁盘路径；外链（http/https）返回 None。"""
    if not url:
        return None
    u = str(url).strip()
    if not u:
        return None
    if u.startswith('http://') or u.startswith('https://'):
        return None
    if u.startswith('/static/'):
        rel = u[len('/static/'):]
    elif u.startswith('static/'):
        rel = u[len('static/'):]
    else:
        return None
    rel = rel.replace('\\', '/').lstrip('/')
    parts = [p for p in rel.split('/') if p and p != '..']
    if not parts:
        return None
    return os.path.join(STATIC_ROOT, *parts)


def _status_of(url):
    """ok / missing / external。"""
    path = _disk_path(url)
    if path is None:
        return 'external'
    return 'ok' if os.path.exists(path) else 'missing'


def _collect_items(project_row):
    """收拢项目内全部素材字段：[(kind, 位置说明, url, 定位信息)]。"""
    project_id = project_row.project_id
    items = []

    def add(kind, where, url, **extra):
        if not url:
            return
        row = {'kind': kind, 'kind_label': KIND_LABELS.get(kind, kind),
               'where': where, 'url': url}
        row.update(extra)
        items.append(row)

    add('cover', '项目封面', project_row.cover_url)

    for s in Scene.query.filter_by(project_id=project_id).order_by(Scene.order_num).all():
        add('background', f'场景「{s.title}」背景', s.background_url, scene_id=s.scene_id)
        add('music', f'场景「{s.title}」音乐', s.music_url, scene_id=s.scene_id)

    for c in Character.query.filter_by(project_id=project_id).all():
        avatars = CharacterAvatar.query.filter_by(character_id=c.character_id).all()
        for a in avatars:
            add('avatar', f'角色「{c.name}」立绘（{a.avatar_type}）', a.image_url,
                character_id=c.character_id, avatar_id=a.avatar_id)

    for ct in ScriptContent.query.filter_by(project_id=project_id).all():
        add('voice', f'节点 #{ct.content_id} 配音', ct.voice_url, content_id=ct.content_id)

    for cg in ProjectCG.query.filter_by(project_id=project_id).all():
        add('cg', f'CG「{cg.title}」', cg.image_url, cg_id=cg.cg_id)

    for d in ContentDirective.query.filter_by(project_id=project_id).all():
        payload = d.payload or {}
        add('directive',
            f'演出指令 #{d.directive_id}（{d.directive_type}）',
            payload.get('url'),
            directive_id=d.directive_id)

    return items


def _collect_market_references(project_id):
    """该项目引用的市场素材 + 引用数 + 文件状态。"""
    rows = (db.session.query(ResourceReference, MarketResource)
            .join(MarketResource, MarketResource.resource_id == ResourceReference.resource_id)
            .filter(ResourceReference.project_id == project_id).all())
    out = []
    for ref, res in rows:
        out.append({
            'reference_id': ref.reference_id,
            'resource_id': res.resource_id,
            'title': res.title,
            'resource_type': res.resource_type,
            'file_url': res.file_url,
            'status': _status_of(res.file_url),
            'reference_count': ResourceReference.query.filter_by(
                resource_id=res.resource_id).count(),
        })
    return out


@project.route('/assets/check/<int:project_id>', methods=['GET'])
def check_project_assets(project_id):
    """素材体检：返回缺失素材清单与市场素材引用情况。"""
    row, err = _owned_project(project_id)
    if err:
        return err

    items = _collect_items(row)
    missing = []
    ok_count = 0
    external_count = 0
    for it in items:
        status = _status_of(it['url'])
        it['status'] = status
        if status == 'ok':
            ok_count += 1
        elif status == 'external':
            external_count += 1
        else:
            missing.append(it)

    market = _collect_market_references(project_id)
    market_missing = [m for m in market if m['status'] == 'missing']

    return jsonify({
        'success': True,
        'data': {
            'project_id': project_id,
            'title': row.title,
            'total': len(items),
            'ok_count': ok_count,
            'external_count': external_count,
            'missing_count': len(missing),
            'healthy': not missing and not market_missing,
            'missing': missing,
            'items': items,
            'market_references': market,
            'market_missing': market_missing,
        },
    })
