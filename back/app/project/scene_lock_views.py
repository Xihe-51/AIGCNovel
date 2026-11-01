# -*- coding: utf-8 -*-
"""场景播放条件（剧情锁）。

条件格式与分支选项一致：
  { "mode": "and"|"or", "items": [{variable, op, value}, ...] }
条件不满足时，播放器的顺序推进会自动跳过该场景。
"""
from flask import jsonify, request

from .. import db
from ..models import Scene, SceneLock
from . import project
from .branch_service import _normalize_conditions
from .save_views import _owned_project, _readable_project


@project.route('/scene_locks/<int:project_id>', methods=['GET'])
def list_scene_locks(project_id):
    _, err = _readable_project(project_id)
    if err:
        return err

    rows = SceneLock.query.filter_by(project_id=project_id).all()
    return jsonify({
        'success': True,
        'data': {str(r.scene_id): (r.conditions or None) for r in rows},
    })


@project.route('/scene_locks/<int:project_id>/<int:scene_id>', methods=['PUT'])
def set_scene_lock(project_id, scene_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    scene = db.session.get(Scene, int(scene_id))
    if not scene or int(scene.project_id) != int(project_id):
        return jsonify({'success': False, 'message': '场景不存在或不属于该项目'}), 404

    data = request.get_json(silent=True) or {}
    raw = data.get('conditions')
    conditions, cerr = _normalize_conditions(project_id, raw)
    if cerr:
        return jsonify({'success': False, 'message': cerr}), 400

    row = db.session.get(SceneLock, int(scene_id))
    if conditions is None:
        if row:
            db.session.delete(row)
            db.session.commit()
        return jsonify({'success': True, 'data': {'scene_id': int(scene_id), 'conditions': None}})

    if row:
        row.conditions = conditions
    else:
        db.session.add(SceneLock(
            scene_id=int(scene_id),
            project_id=project_id,
            conditions=conditions,
        ))
    db.session.commit()
    return jsonify({
        'success': True,
        'data': {'scene_id': int(scene_id), 'conditions': conditions},
    })
