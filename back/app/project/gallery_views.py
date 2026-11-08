# -*- coding: utf-8 -*-
"""BGM 鉴赏：曲目从场景背景音乐自动汇总，玩家进入场景时解锁。"""
from flask import jsonify, request

from .. import db
from ..models import MusicUnlock, Scene
from ..security import current_user_id
from . import project


def _project_music(project_id):
    """按 music_url 去重汇总项目 BGM，标题取首次出现的场景名。"""
    scenes = (Scene.query
              .filter_by(project_id=project_id)
              .order_by(Scene.order_num.asc())
              .all())
    tracks = {}
    for s in scenes:
        url = (s.music_url or '').strip()
        if not url or url in tracks:
            continue
        tracks[url] = {
            'music_url': url,
            'title': s.title or '未命名场景',
            'scene_id': s.scene_id,
        }
    return tracks


@project.route('/music_gallery/<int:project_id>', methods=['GET'])
def list_music_gallery(project_id):
    tracks = _project_music(project_id)
    uid = current_user_id()
    unlocked = set()
    if uid:
        unlocked = {
            r.music_url for r in MusicUnlock.query.filter_by(
                user_id=uid, project_id=project_id).all()
        }

    items = []
    for url, t in tracks.items():
        items.append({
            **t,
            'unlocked': url in unlocked,
        })

    return jsonify({
        'success': True,
        'data': {
            'items': items,
            'total': len(items),
            'unlocked_count': sum(1 for i in items if i['unlocked']),
        },
    })


@project.route('/music_gallery/<int:project_id>/unlock', methods=['POST'])
def unlock_music(project_id):
    uid = current_user_id()
    if not uid:
        return jsonify({'success': False, 'message': '请先登录'}), 401

    data = request.get_json(silent=True) or {}
    url = str(data.get('music_url') or '').strip()
    if not url:
        return jsonify({'success': False, 'message': '缺少音乐地址'}), 400
    if url not in _project_music(project_id):
        return jsonify({'success': False, 'message': '该音乐不属于当前项目'}), 400

    existed = MusicUnlock.query.filter_by(
        user_id=uid, project_id=project_id, music_url=url).first()
    if not existed:
        db.session.add(MusicUnlock(user_id=uid, project_id=project_id, music_url=url))
        db.session.commit()
    return jsonify({'success': True, 'data': {'music_url': url, 'unlocked': True}})
