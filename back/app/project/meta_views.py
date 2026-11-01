"""玩家跨周目元数据：只读写标记为 persist 的变量。"""
from flask import jsonify, request

from .. import db
from ..models import Project, ProjectMeta, ProjectVariable
from ..security import current_user_id
from . import project


def _clamp(variable, value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = int(variable.initial_value or 0)
    if variable.min_value is not None:
        number = max(int(variable.min_value), number)
    if variable.max_value is not None:
        number = min(int(variable.max_value), number)
    return number


def _persist_variables(project_id):
    return (ProjectVariable.query
            .filter_by(project_id=project_id, persist=True)
            .order_by(ProjectVariable.variable_id.asc())
            .all())


def _guard_project(project_id):
    row = db.session.get(Project, project_id)
    if not row:
        return None, (jsonify({'success': False, 'message': '项目不存在'}), 404)
    uid = current_user_id()
    if not bool(row.is_public) and int(row.user_id) != int(uid):
        return None, (jsonify({'success': False, 'message': '项目未公开'}), 403)
    return row, None


@project.route('/meta/<int:project_id>', methods=['GET'])
def get_project_meta(project_id):
    _, err = _guard_project(project_id)
    if err:
        return err

    uid = current_user_id()
    row = ProjectMeta.query.filter_by(project_id=project_id, user_id=uid).first()
    saved = (row.state_json or {}).get('variables', {}) if row else {}
    variables = {}
    for v in _persist_variables(project_id):
        variables[v.name] = _clamp(v, saved.get(v.name, v.initial_value))
    return jsonify({
        'success': True,
        'data': {
            'variables': variables,
            'updated_at': row.updated_at.isoformat() if row and row.updated_at else None,
        },
    })


@project.route('/meta/<int:project_id>', methods=['PUT'])
def save_project_meta(project_id):
    _, err = _guard_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    incoming = data.get('variables')
    if not isinstance(incoming, dict):
        return jsonify({'success': False, 'message': 'variables 必须是对象'}), 400

    variables = {}
    for v in _persist_variables(project_id):
        variables[v.name] = _clamp(v, incoming.get(v.name, v.initial_value))

    uid = current_user_id()
    row = ProjectMeta.query.filter_by(project_id=project_id, user_id=uid).first()
    if not row:
        row = ProjectMeta(project_id=project_id, user_id=uid, state_json={'variables': variables})
        db.session.add(row)
    else:
        row.state_json = {'variables': variables}
    db.session.commit()
    return jsonify({'success': True, 'data': {'variables': variables}})
