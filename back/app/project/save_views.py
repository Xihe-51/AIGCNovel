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

from flask import jsonify, request

from .. import db
from ..models import Project, SaveSlot
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


def _slot_summary(row):
    return {
        'slot': row.slot,
        'summary': row.summary or '',
        'updated_at': row.updated_at.isoformat() if row.updated_at else None,
    }


@project.route('/saves/<int:project_id>', methods=['GET'])
def list_saves(project_id):
    """列出当前用户在该项目的所有存档位（不含 state，减小响应体）。"""
    _, err = _owned_project(project_id)
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
    _, err = _owned_project(project_id)
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
    _, err = _owned_project(project_id)
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
    _, err = _owned_project(project_id)
    if err:
        return err

    uid = current_user_id()
    row = SaveSlot.query.filter_by(user_id=uid, project_id=project_id, slot=slot).first()
    if not row:
        return jsonify({'success': False, 'message': '存档不存在'}), 404

    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True, 'message': '存档已删除'})
