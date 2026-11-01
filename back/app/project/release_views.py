# -*- coding: utf-8 -*-
"""作品发布记录：发布新版本（自动生成剧本快照）、更新说明、回滚历史版本。"""
import json

from flask import jsonify, request

from .. import db
from ..models import Project, ProjectRelease, ProjectVersion
from . import project
from .save_views import _owned_project
from .version_service import create_version, restore_snapshot


def _release_dict(row, version=None, is_latest=False):
    return {
        'release_id': int(row.release_id),
        'project_id': int(row.project_id),
        'release_no': int(row.release_no or 0),
        'version_id': int(row.version_id),
        'notes': row.notes or '',
        'created_at': row.created_at.isoformat() if row.created_at else None,
        'stats': {
            'scene_count': int(version.scene_count or 0) if version else 0,
            'content_count': int(version.content_count or 0) if version else 0,
            'branch_count': int(version.branch_count or 0) if version else 0,
        },
        'is_latest': is_latest,
    }


def _owned_release(project_id, release_id):
    row = db.session.get(ProjectRelease, int(release_id))
    if not row or int(row.project_id) != int(project_id):
        return None
    return row


@project.route('/releases/<int:project_id>', methods=['GET'])
def list_project_releases(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    rows = (ProjectRelease.query.filter_by(project_id=project_id)
            .order_by(ProjectRelease.release_no.desc())
            .limit(50).all())
    versions = {}
    if rows:
        version_ids = [int(r.version_id) for r in rows]
        for v in ProjectVersion.query.filter(
                ProjectVersion.version_id.in_(version_ids)).all():
            versions[int(v.version_id)] = v

    latest_id = int(rows[0].release_id) if rows else None
    return jsonify({
        'success': True,
        'data': {'releases': [
            _release_dict(r, versions.get(int(r.version_id)),
                          int(r.release_id) == latest_id)
            for r in rows
        ]},
    })


@project.route('/public_releases/<int:project_id>', methods=['GET'])
def public_releases(project_id):
    """玩家侧更新日志：公开作品的发布记录（只读）。"""
    row = db.session.get(Project, project_id)
    if not row:
        return jsonify({'success': False, 'message': '项目不存在'}), 404
    if not bool(row.is_public):
        return jsonify({'success': False, 'message': '项目未公开'}), 403

    rows = (ProjectRelease.query.filter_by(project_id=project_id)
            .order_by(ProjectRelease.release_no.desc())
            .limit(20).all())
    versions = {}
    if rows:
        version_ids = [int(r.version_id) for r in rows]
        for v in ProjectVersion.query.filter(
                ProjectVersion.version_id.in_(version_ids)).all():
            versions[int(v.version_id)] = v

    return jsonify({
        'success': True,
        'data': {'releases': [
            _release_dict(r, versions.get(int(r.version_id))) for r in rows
        ]},
    })


@project.route('/releases/<int:project_id>', methods=['POST'])
def create_project_release(project_id):
    row, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    notes = str(data.get('notes') or '').strip()[:500]

    latest = (ProjectRelease.query.filter_by(project_id=project_id)
              .order_by(ProjectRelease.release_no.desc()).first())
    release_no = int(latest.release_no or 0) + 1 if latest else 1

    try:
        version, _ = create_version(project_id, int(row.user_id),
                                    f'发布 v{release_no}', dedupe=False)
    except Exception as e:
        db.session.rollback()
        print(f'发布快照失败: {e}')
        return jsonify({'success': False, 'message': '生成版本快照失败'}), 500

    release = ProjectRelease(
        project_id=project_id,
        user_id=int(row.user_id),
        version_id=int(version.version_id),
        release_no=release_no,
        notes=notes,
    )
    row.is_public = True
    db.session.add(release)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'已发布 v{release_no}',
        'data': _release_dict(release, version, True),
    }), 201


@project.route('/releases/<int:project_id>/<int:release_id>/rollback', methods=['POST'])
def rollback_project_release(project_id, release_id):
    owner, err = _owned_project(project_id)
    if err:
        return err

    release = _owned_release(project_id, release_id)
    if not release:
        return jsonify({'success': False, 'message': '发布记录不存在'}), 404

    version = db.session.get(ProjectVersion, int(release.version_id))
    if not version:
        return jsonify({'success': False, 'message': '该发布记录对应的版本快照已丢失'}), 404

    try:
        snapshot = json.loads(version.snapshot or '{}')
    except (TypeError, ValueError):
        snapshot = None
    if not isinstance(snapshot, dict):
        return jsonify({'success': False, 'message': '版本数据已损坏，无法回滚'}), 500

    try:
        result = restore_snapshot(project_id, int(owner.user_id), snapshot)
    except Exception as e:
        db.session.rollback()
        print(f'发布版本回滚失败: {e}')
        return jsonify({'success': False, 'message': '回滚失败，数据未改动'}), 500

    return jsonify({
        'success': True,
        'data': result,
        'message': f'已回滚到 v{release.release_no}（回滚前已自动备份）',
    })
