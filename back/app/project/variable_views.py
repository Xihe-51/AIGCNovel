# -*- coding: utf-8 -*-
"""
项目变量（好感度/数值/开关）与节点数值变化。

- project_variables：变量定义（name 为英文 key，label 为展示名）
- content_effects：某条剧情节点被到达时，给变量加/减 delta
- 运行时变量值不落库，随存档 state_json.variables 一起保存
"""
import re

from flask import jsonify, request

from .. import db
from ..models import ContentEffect, ProjectVariable, ScriptContent, BranchPath
from ..security import current_user_id
from . import project
from .save_views import _owned_project

NAME_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,49}$')
MAX_DELTA = 9999


def _var_to_dict(v):
    return {
        'variable_id': v.variable_id,
        'project_id': v.project_id,
        'name': v.name,
        'label': v.label,
        'initial_value': v.initial_value,
        'min_value': v.min_value,
        'max_value': v.max_value,
        'description': v.description,
    }


def _parse_int(value, field, default=None):
    if value is None or value == '':
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f'{field} 必须是整数')


@project.route('/variables/<int:project_id>', methods=['GET'])
def list_variables(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    rows = (ProjectVariable.query
            .filter_by(project_id=project_id)
            .order_by(ProjectVariable.variable_id.asc())
            .all())
    return jsonify({'success': True, 'data': [_var_to_dict(v) for v in rows]})


@project.route('/variables/<int:project_id>', methods=['POST'])
def create_variable(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    name = str(data.get('name') or '').strip()
    label = str(data.get('label') or '').strip()
    if not NAME_RE.match(name):
        return jsonify({'success': False, 'message': '变量名只能包含字母/数字/下划线，且以字母或下划线开头'}), 400
    if not label:
        return jsonify({'success': False, 'message': '请填写变量展示名'}), 400
    if ProjectVariable.query.filter_by(project_id=project_id, name=name).first():
        return jsonify({'success': False, 'message': f'变量名 {name} 已存在'}), 400

    try:
        initial = _parse_int(data.get('initial_value'), 'initial_value', 0)
        min_value = _parse_int(data.get('min_value'), 'min_value')
        max_value = _parse_int(data.get('max_value'), 'max_value')
    except ValueError as e:
        return jsonify({'success': False, 'message': str(e)}), 400
    if min_value is not None and max_value is not None and min_value > max_value:
        return jsonify({'success': False, 'message': '最小值不能大于最大值'}), 400

    row = ProjectVariable(
        project_id=project_id,
        name=name,
        label=label,
        initial_value=initial,
        min_value=min_value,
        max_value=max_value,
        description=str(data.get('description') or '') or None,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'success': True, 'data': _var_to_dict(row), 'message': '变量已创建'})


@project.route('/variables/<int:project_id>/<int:variable_id>', methods=['PUT'])
def update_variable(project_id, variable_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    row = ProjectVariable.query.filter_by(project_id=project_id, variable_id=variable_id).first()
    if not row:
        return jsonify({'success': False, 'message': '变量不存在'}), 404

    data = request.get_json(silent=True) or {}
    old_name = row.name
    if 'name' in data:
        name = str(data.get('name') or '').strip()
        if not NAME_RE.match(name):
            return jsonify({'success': False, 'message': '变量名格式不合法'}), 400
        exists = ProjectVariable.query.filter(
            ProjectVariable.project_id == project_id,
            ProjectVariable.name == name,
            ProjectVariable.variable_id != variable_id,
        ).first()
        if exists:
            return jsonify({'success': False, 'message': f'变量名 {name} 已存在'}), 400
        row.name = name
    if 'label' in data:
        label = str(data.get('label') or '').strip()
        if not label:
            return jsonify({'success': False, 'message': '请填写变量展示名'}), 400
        row.label = label
    try:
        if 'initial_value' in data:
            row.initial_value = _parse_int(data.get('initial_value'), 'initial_value', 0)
        if 'min_value' in data:
            row.min_value = _parse_int(data.get('min_value'), 'min_value')
        if 'max_value' in data:
            row.max_value = _parse_int(data.get('max_value'), 'max_value')
    except ValueError as e:
        return jsonify({'success': False, 'message': str(e)}), 400
    if row.min_value is not None and row.max_value is not None and row.min_value > row.max_value:
        return jsonify({'success': False, 'message': '最小值不能大于最大值'}), 400
    if 'description' in data:
        row.description = str(data.get('description') or '') or None

    # 变量改名时同步更新分支条件里引用的变量名
    if row.name != old_name:
        for bp in BranchPath.query.filter_by(project_id=project_id).all():
            cond = bp.conditions
            if isinstance(cond, dict) and cond.get('variable') == old_name:
                bp.conditions = {**cond, 'variable': row.name}

    db.session.commit()
    return jsonify({'success': True, 'data': _var_to_dict(row), 'message': '变量已更新'})


@project.route('/variables/<int:project_id>/<int:variable_id>', methods=['DELETE'])
def delete_variable(project_id, variable_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    row = ProjectVariable.query.filter_by(project_id=project_id, variable_id=variable_id).first()
    if not row:
        return jsonify({'success': False, 'message': '变量不存在'}), 404

    ContentEffect.query.filter_by(variable_id=variable_id).delete(synchronize_session=False)
    # 分支条件引用该变量时清空，避免留下永远不成立的死条件
    for bp in BranchPath.query.filter_by(project_id=project_id).all():
        cond = bp.conditions
        if isinstance(cond, dict) and cond.get('variable') == row.name:
            bp.conditions = None
    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True, 'message': '变量已删除'})


# ==================== 节点数值变化 ====================

@project.route('/effects/<int:project_id>', methods=['GET'])
def list_effects(project_id):
    """返回项目内全部节点的数值变化（播放器一次加载）。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    rows = (db.session.query(ContentEffect, ProjectVariable)
            .join(ProjectVariable, ProjectVariable.variable_id == ContentEffect.variable_id)
            .join(ScriptContent, ScriptContent.content_id == ContentEffect.content_id)
            .filter(ScriptContent.project_id == project_id)
            .all())
    return jsonify({'success': True, 'data': [{
        'content_id': e.content_id,
        'variable_id': e.variable_id,
        'name': v.name,
        'label': v.label,
        'delta': e.delta,
    } for e, v in rows]})


@project.route('/effects/<int:project_id>/<int:content_id>', methods=['GET'])
def get_content_effects(project_id, content_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    content = ScriptContent.query.filter_by(project_id=project_id, content_id=content_id).first()
    if not content:
        return jsonify({'success': False, 'message': '剧情节点不存在'}), 404

    rows = (db.session.query(ContentEffect, ProjectVariable)
            .join(ProjectVariable, ProjectVariable.variable_id == ContentEffect.variable_id)
            .filter(ContentEffect.content_id == content_id)
            .all())
    return jsonify({'success': True, 'data': [{
        'variable_id': e.variable_id,
        'name': v.name,
        'label': v.label,
        'delta': e.delta,
    } for e, v in rows]})


@project.route('/effects/<int:project_id>/<int:content_id>', methods=['PUT'])
def replace_content_effects(project_id, content_id):
    """整条替换某节点的数值变化。body: { effects: [{variable_id, delta}] }"""
    _, err = _owned_project(project_id)
    if err:
        return err

    content = ScriptContent.query.filter_by(project_id=project_id, content_id=content_id).first()
    if not content:
        return jsonify({'success': False, 'message': '剧情节点不存在'}), 404

    data = request.get_json(silent=True) or {}
    raw = data.get('effects')
    if not isinstance(raw, list):
        return jsonify({'success': False, 'message': 'effects 必须是数组'}), 400

    allowed_vars = {
        v.variable_id for v in ProjectVariable.query.filter_by(project_id=project_id).all()
    }
    cleaned = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            vid = int(item.get('variable_id'))
            delta = int(item.get('delta', 0))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': 'variable_id / delta 必须是整数'}), 400
        if vid not in allowed_vars:
            return jsonify({'success': False, 'message': f'变量 {vid} 不属于该项目'}), 400
        if abs(delta) > MAX_DELTA:
            return jsonify({'success': False, 'message': f'delta 绝对值不能超过 {MAX_DELTA}'}), 400
        if delta == 0:
            continue
        cleaned[vid] = delta

    try:
        ContentEffect.query.filter_by(content_id=content_id).delete(synchronize_session=False)
        db.session.add_all([
            ContentEffect(content_id=content_id, variable_id=vid, delta=delta)
            for vid, delta in cleaned.items()
        ])
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'保存失败: {e}'}), 500

    return jsonify({'success': True, 'data': {'count': len(cleaned)}, 'message': '数值变化已保存'})
