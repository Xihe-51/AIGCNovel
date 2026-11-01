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
import shutil
from collections import Counter
from datetime import datetime

from flask import jsonify, request
from werkzeug.utils import secure_filename

from .. import db
from ..models import Character, CharacterAvatar, Scene, ScriptContent, BranchPath, \
    ProjectCG, ContentDirective, MarketResource, ResourceReference, AIGeneration
from ..security import current_user_id
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
    'choice': '选项配图',
    'unreferenced': '未引用文件',
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

    for b in BranchPath.query.filter_by(project_id=project_id).all():
        add('choice', f'选项配图（节点 #{b.source_content_id}）', b.image_url,
            path_id=b.path_id, content_id=b.source_content_id)

    for d in ContentDirective.query.filter_by(project_id=project_id).all():
        payload = d.payload or {}
        add('directive',
            f'演出指令 #{d.directive_id}（{d.directive_type}）',
            payload.get('url'),
            directive_id=d.directive_id)

    return items


def _collect_unreferenced(project_id, known_urls):
    """项目素材目录里存在、但没有被任何字段引用的文件（市场入库/手工上传后可见）。"""
    root = os.path.join(STATIC_ROOT, 'project', str(project_id))
    if not os.path.isdir(root):
        return []

    image_ext = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'}
    audio_ext = {'mp3', 'wav', 'ogg'}
    out = []
    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            if fn.startswith('.'):
                continue
            ext = os.path.splitext(fn)[1].lower().lstrip('.')
            if ext in image_ext:
                asset_kind = 'image'
            elif ext in audio_ext:
                asset_kind = 'audio'
            else:
                continue
            full = os.path.join(dirpath, fn)
            url = '/static/' + os.path.relpath(full, STATIC_ROOT).replace('\\', '/')
            if url in known_urls:
                continue
            out.append({
                'kind': 'unreferenced',
                'kind_label': KIND_LABELS['unreferenced'],
                'asset_kind': asset_kind,
                'where': '未引用文件',
                'url': url,
                'status': 'ok',
            })
    out.sort(key=lambda x: x['url'])
    return out


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
    known_urls = {it['url'] for it in items}
    unreferenced = _collect_unreferenced(project_id, known_urls)
    items.extend(unreferenced)
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

    # 同一文件被多个字段复用时的引用计数（未引用文件为 0）
    usage = Counter(it['url'] for it in items if it.get('kind') != 'unreferenced')
    for it in items:
        it['usage_count'] = usage.get(it['url'], 0)

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
            'unreferenced_count': len(unreferenced),
            'market_references': market,
            'market_missing': market_missing,
        },
    })


@project.route('/assets/replace/<int:project_id>', methods=['POST'])
def replace_project_asset(project_id):
    """
    就地替换项目素材：用新上传的文件覆盖原 URL 对应的磁盘文件。

    仅允许替换 /static/project/<project_id>/ 下的文件，避免越权覆盖其他项目/系统文件。
    """
    _, err = _owned_project(project_id)
    if err:
        return err

    url = str(request.form.get('url') or '').strip()
    file = request.files.get('file')
    if not url:
        return jsonify({'success': False, 'message': '缺少素材地址'}), 400
    if not file or not file.filename:
        return jsonify({'success': False, 'message': '请选择要上传的文件'}), 400

    path = _disk_path(url)
    if not path:
        return jsonify({'success': False, 'message': '只能替换项目内的静态素材'}), 400

    project_root = os.path.abspath(os.path.join(STATIC_ROOT, 'project', str(project_id)))
    target = os.path.abspath(path)
    if not (target == project_root or target.startswith(project_root + os.sep)):
        return jsonify({'success': False, 'message': '该素材不属于当前项目，无法替换'}), 400

    ext = os.path.splitext(target)[1].lower()
    if not ext:
        return jsonify({'success': False, 'message': '素材地址缺少扩展名'}), 400

    try:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        file.save(target)
    except OSError as e:
        return jsonify({'success': False, 'message': f'写入文件失败：{e}'}), 500

    return jsonify({'success': True, 'data': {'url': url}, 'message': '素材已替换'})


AI_ASSET_TYPES = {'image': 'image', 'music': 'music', 'voice': 'voice'}


@project.route('/assets/ai_history/<int:project_id>', methods=['GET'])
def ai_asset_history(project_id):
    """当前用户的 AI 生成历史（图片/音乐/配音），供素材库导入。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    kind = str(request.args.get('kind') or 'image').strip().lower()
    gen_type = AI_ASSET_TYPES.get(kind, 'image')
    uid = current_user_id()

    rows = (AIGeneration.query
            .filter_by(user_id=uid, type=gen_type)
            .order_by(AIGeneration.created_at.desc())
            .limit(60)
            .all())

    items = []
    for r in rows:
        url = str(r.generated_text or '').strip()
        if not url.startswith('/static/'):
            continue
        items.append({
            'generation_id': r.generation_id,
            'url': url,
            'prompt': r.prompt_text or '',
            'status': _status_of(url),
            'created_at': r.created_at.isoformat() if r.created_at else None,
        })

    return jsonify({'success': True, 'data': {'kind': kind, 'items': items}})


@project.route('/assets/ai_import/<int:project_id>', methods=['POST'])
def import_ai_asset(project_id):
    """把 AI 历史文件复制到项目素材位置（覆盖 target_url 指向的文件）。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    target_url = str(data.get('target_url') or '').strip()
    source_url = str(data.get('source_url') or '').strip()
    if not target_url or not source_url:
        return jsonify({'success': False, 'message': '缺少目标或来源地址'}), 400

    target_path = _disk_path(target_url)
    if not target_path:
        return jsonify({'success': False, 'message': '目标地址不是项目静态素材'}), 400

    project_root = os.path.abspath(os.path.join(STATIC_ROOT, 'project', str(project_id)))
    target = os.path.abspath(target_path)
    if not target.startswith(project_root + os.sep):
        return jsonify({'success': False, 'message': '目标素材不属于当前项目'}), 400

    source_path = _disk_path(source_url)
    if not source_path:
        return jsonify({'success': False, 'message': '来源必须是本机 AI 素材'}), 400

    uid = current_user_id()
    allowed_roots = [
        os.path.abspath(os.path.join(STATIC_ROOT, 'images', str(uid))),
        os.path.abspath(os.path.join(STATIC_ROOT, 'music', str(uid))),
    ]
    source = os.path.abspath(source_path)
    if not any(source.startswith(root + os.sep) for root in allowed_roots):
        return jsonify({'success': False, 'message': '只能导入自己的 AI 生成素材'}), 403
    if not os.path.isfile(source):
        return jsonify({'success': False, 'message': 'AI 素材文件已丢失'}), 404

    try:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(source, target)
    except OSError as e:
        return jsonify({'success': False, 'message': f'复制失败：{e}'}), 500

    return jsonify({
        'success': True,
        'data': {'url': target_url, 'source_url': source_url},
        'message': '已从 AI 历史导入',
    })


@project.route('/assets/market_import/<int:project_id>', methods=['POST'])
def import_market_asset(project_id):
    """素材工坊一键入库：把市场资源文件复制到当前项目素材目录。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    try:
        resource_id = int(data.get('resource_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': '缺少有效的素材 ID'}), 400

    res = db.session.get(MarketResource, resource_id)
    if not res:
        return jsonify({'success': False, 'message': '素材不存在'}), 404

    source_path = _disk_path(res.file_url)
    if not source_path:
        return jsonify({'success': False, 'message': '仅支持导入本站素材'}), 400
    if not os.path.isfile(source_path):
        return jsonify({'success': False, 'message': '素材文件已丢失'}), 404

    ext = os.path.splitext(source_path)[1].lower().lstrip('.')
    if ext in {'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'}:
        sub_folder = 'image'
    elif ext in {'mp3', 'wav', 'ogg'}:
        sub_folder = 'audio'
    else:
        return jsonify({'success': False, 'message': '该素材格式不支持入库'}), 400

    base = secure_filename(os.path.splitext(os.path.basename(source_path))[0]) or 'asset'
    filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:-3]}_{base}.{ext}"
    target_dir = os.path.join(STATIC_ROOT, 'project', str(project_id), sub_folder)
    target_path = os.path.join(target_dir, filename)

    try:
        os.makedirs(target_dir, exist_ok=True)
        shutil.copyfile(source_path, target_path)
    except OSError as e:
        return jsonify({'success': False, 'message': f'入库失败：{e}'}), 500

    url = '/static/project/{}/{}/{}'.format(project_id, sub_folder, filename)

    uid = current_user_id()
    existed = ResourceReference.query.filter_by(
        resource_id=resource_id, user_id=uid, project_id=project_id).first()
    if not existed:
        db.session.add(ResourceReference(
            resource_id=resource_id, user_id=uid, project_id=project_id))
    res.download_count = (res.download_count or 0) + 1
    db.session.commit()

    return jsonify({
        'success': True,
        'data': {'url': url, 'title': res.title, 'sub_folder': sub_folder},
        'message': '已入库到当前项目',
    })
