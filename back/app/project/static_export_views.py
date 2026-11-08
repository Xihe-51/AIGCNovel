# -*- coding: utf-8 -*-
"""
静态网页发布包导出。

生成一个可独立部署的 zip：
  index.html / player.html   离线播放器（front/dist-player 构建产物）
  assets/...                 播放器 JS / CSS
  story.js                   项目只读数据快照 + 本地状态适配所需元信息
  static/...                 项目引用的图片 / 音频 / 立绘等素材

播放器不需要连接后端：所有只读接口由 story.js 快照提供，
存档、已读、结局、成就、BGM 解锁等玩家状态保存在浏览器 localStorage。
"""
import io
import json
import os
import re
import zipfile
from datetime import datetime
from urllib.parse import quote

from flask import current_app, jsonify, make_response, request

from .. import STATIC_ROOT
from ..models import Project
from ..security import current_user_id
from . import project

# back/app/project/static_export_views.py -> 仓库根目录
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
_PLAYER_DIST = os.path.join(_REPO_ROOT, 'front', 'dist-player')
_ABSOLUTE_STATIC_RE = re.compile(r'^https?://[^/]+(/static/.*)$')


def _rewrite_url(value):
    """把后端静态地址改成发布包内的相对路径。"""
    if not isinstance(value, str):
        return value
    matched = _ABSOLUTE_STATIC_RE.match(value)
    if matched:
        value = matched.group(1)
    if value.startswith('/static/'):
        return 'static/' + value[len('/static/'):]
    return value


def _rewrite_tree(value):
    if isinstance(value, dict):
        return {key: _rewrite_tree(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_rewrite_tree(item) for item in value]
    return _rewrite_url(value)


def _collect_assets(value, bucket):
    if isinstance(value, dict):
        for item in value.values():
            _collect_assets(item, bucket)
    elif isinstance(value, list):
        for item in value:
            _collect_assets(item, bucket)
    elif isinstance(value, str) and value.startswith('static/'):
        bucket.add(value.split('?', 1)[0].split('#', 1)[0])


def _snapshot_endpoints(project_id):
    """
    用 Flask 测试客户端抓取播放器依赖的 GET 接口快照。

    复用现有视图的序列化逻辑，避免静态包与在线播放器的数据结构漂移。
    """
    app = current_app._get_current_object()
    auth = request.headers.get('Authorization', '')
    headers = {'Authorization': auth} if auth else {}
    client = app.test_client()
    missing = []
    endpoints = {}

    def fetch(path, required=False, fallback=None):
        response = client.get(path, headers=headers)
        if response.status_code != 200:
            missing.append(f'{path} ({response.status_code})')
            if required:
                return None
            data = fallback
        else:
            data = response.get_json()
        endpoints[path] = data
        return data

    project_payload = fetch(f'/project/project/{project_id}', required=True)
    scenes_payload = fetch(f'/project/scenes/{project_id}', required=True)
    if project_payload is None or scenes_payload is None:
        return None, '读取项目基础数据失败：' + ', '.join(missing)

    scene_ids = [
        int(scene['scene_id'])
        for scene in (scenes_payload.get('data') or [])
        if scene.get('scene_id') is not None
    ]
    for scene_id in scene_ids:
        if fetch(f'/project/dialogues/{scene_id}', required=True) is None:
            return None, '读取场景台词失败：' + ', '.join(missing)

    fetch(f'/project/branches/{project_id}', fallback={'success': True, 'data': []})
    fetch(f'/project/directives/{project_id}', fallback={'success': True, 'data': []})
    fetch(f'/project/chapters/{project_id}',
          fallback={'success': True, 'data': {'chapters': [], 'scene_map': {}}})
    fetch(f'/project/variables/{project_id}', fallback={'success': True, 'data': []})
    fetch(f'/project/effects/{project_id}', fallback={'success': True, 'data': []})
    fetch(f'/project/scene_locks/{project_id}', fallback={'success': True, 'data': {}})
    fetch(f'/project/endings/{project_id}', fallback={'success': True, 'data': []})
    fetch(f'/project/achievements/{project_id}', fallback={'success': True, 'data': []})
    fetch(f'/project/cgs/{project_id}', fallback={'success': True, 'data': []})
    fetch(f'/project/music_gallery/{project_id}',
          fallback={'success': True, 'data': {'items': [], 'total': 0, 'unlocked_count': 0}})
    # 未公开作品没有玩家更新日志，静态包里留空即可
    fetch(f'/project/public_releases/{project_id}',
          fallback={'success': True, 'data': {'releases': []}})

    characters_payload = fetch(f'/project/characters/{project_id}',
                               fallback={'success': True, 'data': []})
    for character in characters_payload.get('data') or []:
        character_id = character.get('character_id')
        if character_id is None:
            continue
        fetch(f'/project/avatars/{int(character_id)}',
              fallback={'success': True, 'data': []})

    # 静态包从零开始：不继承导出者本人的解锁进度
    for ending in (endpoints.get(f'/project/endings/{project_id}') or {}).get('data') or []:
        ending['unlocked'] = False
    for achievement in (endpoints.get(f'/project/achievements/{project_id}') or {}).get('data') or []:
        achievement['unlocked'] = False
    music_payload = endpoints.get(f'/project/music_gallery/{project_id}') or {}
    for item in (music_payload.get('data') or {}).get('items') or []:
        item['unlocked'] = False
    if isinstance(music_payload.get('data'), dict):
        music_payload['data']['unlocked_count'] = 0

    return endpoints, None


def _iter_player_dist(dist_dir):
    for root, _, files in os.walk(dist_dir):
        for name in files:
            full_path = os.path.join(root, name)
            rel_path = os.path.relpath(full_path, dist_dir).replace(os.sep, '/')
            yield full_path, rel_path


@project.route('/project/<int:project_id>/static_export', methods=['GET'])
def export_static_package(project_id):
    """
    导出可独立部署的静态网页包（zip）。
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({'success': False, 'message': '未提供用户ID'}), 401

    project_row = Project.query.filter_by(project_id=project_id, user_id=user_id).first()
    if not project_row:
        return jsonify({'success': False, 'message': '项目不存在或无权导出'}), 404

    player_html = os.path.join(_PLAYER_DIST, 'player.html')
    if not os.path.isfile(player_html):
        return jsonify({
            'success': False,
            'message': '静态播放器尚未构建，请先在 front 目录执行 npm run build:player',
        }), 503

    try:
        endpoints, error = _snapshot_endpoints(project_id)
        if error:
            return jsonify({'success': False, 'message': error}), 502

        endpoints = _rewrite_tree(endpoints)
        assets = set()
        _collect_assets(endpoints, assets)

        title = project_row.title or f'project_{project_id}'
        story = {
            'version': 1,
            'project_id': int(project_id),
            'title': title,
            'generated_at': datetime.now().isoformat(timespec='seconds'),
            'endpoints': endpoints,
        }
        story_json = json.dumps(story, ensure_ascii=False, separators=(',', ':'))
        # 避免 JSON 文本里出现 </script> 提前闭合内联脚本
        story_json = story_json.replace('</', '<\\/')
        story_js = (
            'window.__AIGC_STATIC__ = true;\n'
            'window.__AIGC_STATIC_STORY__ = ' + story_json + ';\n'
        )

        static_root = os.path.realpath(STATIC_ROOT)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as bundle:
            for full_path, rel_path in _iter_player_dist(_PLAYER_DIST):
                if rel_path == 'player.html':
                    with open(full_path, 'rb') as handle:
                        html_bytes = handle.read()
                    bundle.writestr('index.html', html_bytes)
                    bundle.writestr('player.html', html_bytes)
                else:
                    bundle.write(full_path, rel_path)

            bundle.writestr('story.js', story_js)

            for asset in sorted(assets):
                fs_path = os.path.realpath(
                    os.path.join(static_root, asset[len('static/'):]))
                if not fs_path.startswith(static_root + os.sep):
                    continue
                if os.path.isfile(fs_path):
                    bundle.write(fs_path, asset)

        response = make_response(buffer.getvalue())
        response.headers['Content-Type'] = 'application/zip'
        response.headers['Content-Disposition'] = (
            f"attachment; filename=project_{project_id}_web.zip; "
            f"filename*=UTF-8''{quote(f'{title}-网页版.zip')}"
        )
        return response
    except Exception as exc:  # pragma: no cover - 兜底日志
        current_app.logger.exception('导出静态网页包失败')
        return jsonify({'success': False, 'message': f'导出失败: {exc}'}), 500
