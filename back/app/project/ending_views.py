# -*- coding: utf-8 -*-
"""
结局定义与收集。

- endings：标题 + 描述 + 触发节点 content_id + 条件列表（全部成立才触发）
- ending_unlocks：按用户记录已解锁结局，用于结局收集
"""
from flask import jsonify, request

from .. import db
from ..models import Ending, EndingUnlock, ProjectVariable, ScriptContent, ProjectCG
from ..security import current_user_id
from . import project
from .save_views import _owned_project

CONDITION_OPS = ('>', '>=', '<', '<=', '==', '!=')


def _validate_conditions(project_id, raw):
    if raw in (None, [], ''):
        return [], None
    if not isinstance(raw, list):
        return None, 'conditions 必须是数组'

    variables = {v.name for v in ProjectVariable.query.filter_by(project_id=project_id).all()}
    cleaned = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            return None, f'第 {i + 1} 个条件格式不正确'
        variable = str(item.get('variable') or '').strip()
        op = str(item.get('op') or '').strip()
        if variable not in variables:
            return None, f'第 {i + 1} 个条件的变量 {variable} 不属于该项目'
        if op not in CONDITION_OPS:
            return None, f'第 {i + 1} 个条件的运算符不支持：{op}'
        try:
            value = int(item.get('value'))
        except (TypeError, ValueError):
            return None, f'第 {i + 1} 个条件的比较值必须是整数'
        cleaned.append({'variable': variable, 'op': op, 'value': value})
    return cleaned, None


def _ending_to_dict(e, unlocked_ids=None):
    return {
        'ending_id': e.ending_id,
        'project_id': e.project_id,
        'title': e.title,
        'description': e.description,
        'content_id': e.content_id,
        'conditions': e.conditions or [],
        'unlocked': bool(unlocked_ids and e.ending_id in unlocked_ids),
    }


@project.route('/endings/<int:project_id>', methods=['GET'])
def list_endings(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    uid = current_user_id()
    rows = (Ending.query
            .filter_by(project_id=project_id)
            .order_by(Ending.ending_id.asc())
            .all())
    unlocked = {
        r[0] for r in db.session.query(EndingUnlock.ending_id)
        .filter_by(user_id=uid, project_id=project_id).all()
    }
    return jsonify({'success': True, 'data': [_ending_to_dict(e, unlocked) for e in rows]})


@project.route('/endings/<int:project_id>', methods=['POST'])
def create_ending(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    title = str(data.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'message': '请填写结局标题'}), 400

    try:
        content_id = int(data.get('content_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': '请选择触发节点'}), 400
    content = ScriptContent.query.filter_by(project_id=project_id, content_id=content_id).first()
    if not content:
        return jsonify({'success': False, 'message': '触发节点不属于该项目'}), 400

    conditions, cerr = _validate_conditions(project_id, data.get('conditions'))
    if cerr:
        return jsonify({'success': False, 'message': cerr}), 400

    row = Ending(
        project_id=project_id,
        title=title,
        description=str(data.get('description') or '') or None,
        content_id=content_id,
        conditions=conditions,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'success': True, 'data': _ending_to_dict(row), 'message': '结局已创建'})


@project.route('/endings/<int:project_id>/<int:ending_id>', methods=['PUT'])
def update_ending(project_id, ending_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    row = Ending.query.filter_by(project_id=project_id, ending_id=ending_id).first()
    if not row:
        return jsonify({'success': False, 'message': '结局不存在'}), 404

    data = request.get_json(silent=True) or {}
    if 'title' in data:
        title = str(data.get('title') or '').strip()
        if not title:
            return jsonify({'success': False, 'message': '请填写结局标题'}), 400
        row.title = title
    if 'description' in data:
        row.description = str(data.get('description') or '') or None
    if 'content_id' in data:
        try:
            content_id = int(data.get('content_id'))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': '触发节点不合法'}), 400
        content = ScriptContent.query.filter_by(project_id=project_id,
                                                content_id=content_id).first()
        if not content:
            return jsonify({'success': False, 'message': '触发节点不属于该项目'}), 400
        row.content_id = content_id
    if 'conditions' in data:
        conditions, cerr = _validate_conditions(project_id, data.get('conditions'))
        if cerr:
            return jsonify({'success': False, 'message': cerr}), 400
        row.conditions = conditions

    db.session.commit()
    return jsonify({'success': True, 'data': _ending_to_dict(row), 'message': '结局已更新'})


@project.route('/endings/<int:project_id>/<int:ending_id>', methods=['DELETE'])
def delete_ending(project_id, ending_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    row = Ending.query.filter_by(project_id=project_id, ending_id=ending_id).first()
    if not row:
        return jsonify({'success': False, 'message': '结局不存在'}), 404

    # CG 图鉴若绑定该结局，解绑为「初始可见」，避免外键约束报错
    ProjectCG.query.filter_by(unlock_ending_id=ending_id).update(
        {'unlock_ending_id': None}, synchronize_session=False)
    EndingUnlock.query.filter_by(ending_id=ending_id).delete(synchronize_session=False)
    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True, 'message': '结局已删除'})


@project.route('/endings/<int:project_id>/<int:ending_id>/unlock', methods=['POST'])
def unlock_ending(project_id, ending_id):
    """标记当前用户达成某结局（幂等）。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    row = Ending.query.filter_by(project_id=project_id, ending_id=ending_id).first()
    if not row:
        return jsonify({'success': False, 'message': '结局不存在'}), 404

    uid = current_user_id()
    existed = EndingUnlock.query.filter_by(user_id=uid, ending_id=ending_id).first()
    if not existed:
        db.session.add(EndingUnlock(user_id=uid, project_id=project_id, ending_id=ending_id))
        db.session.commit()

    return jsonify({
        'success': True,
        'data': {'ending_id': ending_id, 'unlocked': True},
        'message': '已记录结局',
    })
