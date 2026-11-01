# -*- coding: utf-8 -*-
"""项目剧本版本接口：列表、手动快照、差异预览、恢复。"""
import json

from flask import jsonify, request

from .. import db
from ..models import ProjectVersion
from . import project
from .save_views import _owned_project
from .version_service import (create_version, diff_snapshot, restore_snapshot,
                              version_to_dict)


def _owned_version(project_id, version_id):
    row = db.session.get(ProjectVersion, int(version_id))
    if not row or int(row.project_id) != int(project_id):
        return None
    return row


def _load_snapshot(row):
    try:
        data = json.loads(row.snapshot or '{}')
    except (TypeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


@project.route('/versions/<int:project_id>', methods=['GET'])
def list_project_versions(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    rows = (ProjectVersion.query.filter_by(project_id=project_id)
            .order_by(ProjectVersion.version_id.desc())
            .limit(50).all())
    return jsonify({'success': True, 'data': {'versions': [version_to_dict(r) for r in rows]}})


@project.route('/versions/<int:project_id>', methods=['POST'])
def create_project_version(project_id):
    row, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    label = str(data.get('label') or '').strip()[:100] or '手动快照'
    version, created = create_version(project_id, int(row.user_id), label, dedupe=True)
    if not created:
        return jsonify({
            'success': True,
            'created': False,
            'data': version_to_dict(version),
            'message': '内容与上一版一致，已复用上一版快照',
        })

    return jsonify({
        'success': True,
        'created': True,
        'data': version_to_dict(version),
        'message': '快照已保存',
    }), 201


@project.route('/versions/<int:project_id>/<int:version_id>/diff', methods=['GET'])
def diff_project_version(project_id, version_id):
    _, err = _owned_project(project_id)
    if err:
        return err
    row = _owned_version(project_id, version_id)
    if not row:
        return jsonify({'success': False, 'message': '版本不存在'}), 404
    snapshot = _load_snapshot(row)
    if not snapshot:
        return jsonify({'success': False, 'message': '版本数据已损坏，无法对比'}), 500

    return jsonify({
        'success': True,
        'data': {
            'version': version_to_dict(row),
            'diff': diff_snapshot(project_id, snapshot),
        },
    })


@project.route('/versions/<int:project_id>/<int:version_id>/restore', methods=['POST'])
def restore_project_version(project_id, version_id):
    owner, err = _owned_project(project_id)
    if err:
        return err
    row = _owned_version(project_id, version_id)
    if not row:
        return jsonify({'success': False, 'message': '版本不存在'}), 404

    snapshot = _load_snapshot(row)
    if not snapshot:
        return jsonify({'success': False, 'message': '版本数据已损坏，无法恢复'}), 500

    try:
        result = restore_snapshot(project_id, int(owner.user_id), snapshot)
    except Exception as e:
        db.session.rollback()
        print(f'版本恢复失败: {e}')
        return jsonify({'success': False, 'message': '恢复失败，数据未改动'}), 500

    return jsonify({
        'success': True,
        'data': result,
        'message': '已恢复到该版本（恢复前已自动备份）',
    })
