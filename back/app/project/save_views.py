# -*- coding: utf-8 -*-
"""
玩家存档（云端）：多存档位 + 自动存档。

- slot = 0：自动存档
- slot = 1..3：手动存档
- 每个 (user_id, project_id, slot) 唯一；保存时 upsert

state_json 由播放器决定，当前包含：
  { sceneIndex, dialogueIndex, historyDialogues, savedAt }
后续变量系统会在这里追加 variables。
"""
import json
from collections import defaultdict

from flask import jsonify, request

from .. import db
from ..models import Project, SaveSlot, Scene, ScriptContent, User
from ..security import current_user_id
from . import project

MAX_MANUAL_SLOT = 3
MAX_STATE_BYTES = 512 * 1024


def _owned_project(project_id):
    uid = current_user_id()
    if not uid:
        return None, (jsonify({'success': False, 'message': '未登录'}), 401)
    row = db.session.get(Project, int(project_id))
    if not row or int(row.user_id) != int(uid):
        return None, (jsonify({'success': False, 'message': '项目不存在或无权访问'}), 404)
    return row, None


def _readable_project(project_id):
    """只读场景：作者本人，或公开项目的任意登录用户（玩家预览/试玩）。

    写操作仍必须走 _owned_project。
    """
    uid = current_user_id()
    if not uid:
        return None, (jsonify({'success': False, 'message': '未登录'}), 401)
    row = db.session.get(Project, int(project_id))
    if not row:
        return None, (jsonify({'success': False, 'message': '项目不存在'}), 404)
    if int(row.user_id) != int(uid) and not bool(row.is_public):
        return None, (jsonify({'success': False, 'message': '项目不存在或无权访问'}), 404)
    return row, None


def _slot_summary(row):
    state = row.state_json if isinstance(row.state_json, dict) else {}
    return {
        'slot': row.slot,
        'summary': row.summary or '',
        'updated_at': row.updated_at.isoformat() if row.updated_at else None,
        # 存档画面缩略图：当前场景背景地址（旧存档可能没有该字段）
        'thumbnail_url': (state.get('thumbnail_url') or '')[:255] or None,
        'scene_title': (state.get('scene_title') or '')[:100] or None,
        # 场景 ID 用于存档列表按当前阅读语言实时显示场景译名
        'scene_id': state.get('scene_id'),
    }


@project.route('/saves/<int:project_id>', methods=['GET'])
def list_saves(project_id):
    """列出当前用户在该项目的所有存档位（不含 state，减小响应体）。"""
    _, err = _readable_project(project_id)
    if err:
        return err

    uid = current_user_id()
    rows = (SaveSlot.query
            .filter_by(user_id=uid, project_id=project_id)
            .order_by(SaveSlot.slot.asc())
            .all())
    return jsonify({'success': True, 'data': [_slot_summary(r) for r in rows]})


@project.route('/saves/<int:project_id>/<int:slot>', methods=['GET'])
def load_save(project_id, slot):
    """读取指定存档位的完整快照。"""
    _, err = _readable_project(project_id)
    if err:
        return err

    uid = current_user_id()
    row = SaveSlot.query.filter_by(user_id=uid, project_id=project_id, slot=slot).first()
    if not row:
        return jsonify({'success': False, 'message': '存档不存在'}), 404

    return jsonify({
        'success': True,
        'data': {
            **_slot_summary(row),
            'state': row.state_json,
        },
    })


@project.route('/saves/<int:project_id>/<int:slot>', methods=['PUT'])
def upsert_save(project_id, slot):
    """写入/覆盖存档。slot=0 为自动存档，1-3 为手动存档。"""
    _, err = _readable_project(project_id)
    if err:
        return err

    if slot < 0 or slot > MAX_MANUAL_SLOT:
        return jsonify({'success': False, 'message': f'存档位必须在 0~{MAX_MANUAL_SLOT} 之间'}), 400

    data = request.get_json(silent=True) or {}
    state = data.get('state')
    if not isinstance(state, dict):
        return jsonify({'success': False, 'message': 'state 必须是对象'}), 400

    raw = json.dumps(state, ensure_ascii=False)
    if len(raw.encode('utf-8')) > MAX_STATE_BYTES:
        return jsonify({'success': False, 'message': '存档数据过大'}), 413

    summary = str(data.get('summary') or '')[:255]
    uid = current_user_id()

    row = SaveSlot.query.filter_by(user_id=uid, project_id=project_id, slot=slot).first()
    if row:
        row.state_json = state
        row.summary = summary
    else:
        row = SaveSlot(user_id=uid, project_id=project_id, slot=slot,
                       state_json=state, summary=summary)
        db.session.add(row)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'保存失败: {e}'}), 500

    return jsonify({'success': True, 'data': _slot_summary(row), 'message': '存档成功'})


@project.route('/saves/<int:project_id>/<int:slot>', methods=['DELETE'])
def delete_save(project_id, slot):
    """删除存档位。"""
    _, err = _readable_project(project_id)
    if err:
        return err

    uid = current_user_id()
    row = SaveSlot.query.filter_by(user_id=uid, project_id=project_id, slot=slot).first()
    if not row:
        return jsonify({'success': False, 'message': '存档不存在'}), 404

    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True, 'message': '存档已删除'})


# ==================== 存档检查器（作者侧） ====================
# 作者需要看到项目内所有玩家的存档，而不只是自己的。

def _scene_content_index(project_id):
    """按播放器同一排序返回场景列表与每个场景的节点列表。"""
    scenes = (Scene.query.filter_by(project_id=project_id)
              .order_by(Scene.order_num.asc(), Scene.scene_id.asc()).all())
    contents = (ScriptContent.query.filter_by(project_id=project_id)
                .order_by(ScriptContent.scene_id.asc(),
                          ScriptContent.order_num.asc(),
                          ScriptContent.content_id.asc()).all())
    by_scene = defaultdict(list)
    for c in contents:
        by_scene[int(c.scene_id)].append(c)
    return scenes, by_scene


def _resolve_save_state(state, scenes, by_scene):
    """把存档里的 sceneIndex/dialogueIndex 折算成可直接定位的 scene_id/content_id。"""
    state = state if isinstance(state, dict) else {}
    try:
        scene_index = int(state.get('sceneIndex') or 0)
        dialogue_index = int(state.get('dialogueIndex') or 0)
    except (TypeError, ValueError):
        scene_index, dialogue_index = 0, 0

    scene = scenes[scene_index] if 0 <= scene_index < len(scenes) else None
    nodes = by_scene.get(int(scene.scene_id), []) if scene else []
    node = nodes[dialogue_index] if 0 <= dialogue_index < len(nodes) else None

    return {
        'scene_id': int(scene.scene_id) if scene else None,
        'content_id': int(node.content_id) if node else None,
        'scene_order': scene_index + 1 if scene else None,
        'resolved_scene_title': scene.title if scene else None,
        'content_text': (node.content_text or '')[:120] if node else None,
    }


def _inspector_item(row, username, scene_ctx):
    state = row.state_json if isinstance(row.state_json, dict) else {}
    variables = state.get('variables') if isinstance(state.get('variables'), dict) else {}
    history = state.get('historyDialogues')
    # 播放器快照里用的是 triggeredEndings（驼峰），兼容旧字段 triggered_endings
    endings = state.get('triggered_endings')
    if not isinstance(endings, list):
        endings = state.get('triggeredEndings')
    return {
        **_slot_summary(row),
        'save_id': int(row.save_id),
        'user_id': int(row.user_id),
        'username': username or f'用户 {row.user_id}',
        'slot_label': '自动存档' if int(row.slot) == 0 else f'存档位 {row.slot}',
        **scene_ctx,
        'variables_count': len(variables),
        'history_count': len(history) if isinstance(history, list) else 0,
        'playthrough': state.get('playthrough') or 1,
        'triggered_endings': endings if isinstance(endings, list) else [],
    }


def _find_save(project_id, user_id, slot):
    return SaveSlot.query.filter_by(
        project_id=project_id, user_id=user_id, slot=slot
    ).first()


@project.route('/save_inspector/<int:project_id>', methods=['GET'])
def list_project_saves(project_id):
    """作者查看项目内所有玩家存档（按最近更新倒序）。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    rows = (db.session.query(SaveSlot, User.username)
            .outerjoin(User, SaveSlot.user_id == User.user_id)
            .filter(SaveSlot.project_id == project_id)
            .order_by(SaveSlot.updated_at.desc())
            .all())
    scenes, by_scene = _scene_content_index(project_id)

    items = [
        _inspector_item(row, username, _resolve_save_state(row.state_json, scenes, by_scene))
        for row, username in rows
    ]
    players = len({item['user_id'] for item in items})
    return jsonify({
        'success': True,
        'data': {
            'total': len(items),
            'players': players,
            'items': items,
        },
    })


@project.route('/save_inspector/<int:project_id>/<int:user_id>/<int:slot>', methods=['GET'])
def load_project_save(project_id, user_id, slot):
    """作者读取任意玩家存档的完整快照。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    row = _find_save(project_id, user_id, slot)
    if not row:
        return jsonify({'success': False, 'message': '存档不存在'}), 404

    scenes, by_scene = _scene_content_index(project_id)
    username = db.session.get(User, user_id)
    item = _inspector_item(
        row,
        username.username if username else '',
        _resolve_save_state(row.state_json, scenes, by_scene),
    )
    return jsonify({
        'success': True,
        'data': {**item, 'state': row.state_json},
    })


@project.route('/save_inspector/<int:project_id>/<int:user_id>/<int:slot>', methods=['DELETE'])
def delete_project_save(project_id, user_id, slot):
    """作者删除任意玩家的存档位。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    row = _find_save(project_id, user_id, slot)
    if not row:
        return jsonify({'success': False, 'message': '存档不存在'}), 404

    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True, 'message': '存档已删除'})
