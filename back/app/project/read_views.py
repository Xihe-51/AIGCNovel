# -*- coding: utf-8 -*-
"""
已读记录：供播放器「跳过已读」与二周目体验使用。

- 按 (user_id, project_id, content_id) 唯一
- 批量上报，避免每句一次请求
"""
from flask import jsonify, request

from .. import db
from ..models import ReadRecord
from ..security import current_user_id
from . import project
from .save_views import _owned_project

MAX_BATCH = 5000


@project.route('/reads/<int:project_id>', methods=['GET'])
def list_reads(project_id):
    """返回当前用户在该项目已读的 content_id 列表。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    uid = current_user_id()
    rows = (db.session.query(ReadRecord.content_id)
            .filter_by(user_id=uid, project_id=project_id)
            .all())
    ids = [r[0] for r in rows]
    return jsonify({'success': True, 'data': {'content_ids': ids, 'count': len(ids)}})


@project.route('/reads/<int:project_id>', methods=['POST'])
def mark_reads(project_id):
    """批量标记已读。body: { content_ids: [1,2,3] }"""
    _, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    raw_ids = data.get('content_ids')
    if not isinstance(raw_ids, list):
        return jsonify({'success': False, 'message': 'content_ids 必须是数组'}), 400

    try:
        ids = sorted({int(x) for x in raw_ids if str(x).strip()})
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'content_ids 必须是整数数组'}), 400

    if len(ids) > MAX_BATCH:
        return jsonify({'success': False, 'message': f'单次最多 {MAX_BATCH} 条'}), 400
    if not ids:
        return jsonify({'success': True, 'data': {'added': 0}, 'message': '没有需要标记的内容'})

    uid = current_user_id()
    existing = {
        r[0] for r in
        db.session.query(ReadRecord.content_id)
        .filter(ReadRecord.user_id == uid,
                ReadRecord.project_id == project_id,
                ReadRecord.content_id.in_(ids))
        .all()
    }
    new_ids = [i for i in ids if i not in existing]

    try:
        if new_ids:
            db.session.bulk_save_objects([
                ReadRecord(user_id=uid, project_id=project_id, content_id=i)
                for i in new_ids
            ])
            db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'标记已读失败: {e}'}), 500

    return jsonify({'success': True, 'data': {'added': len(new_ids)}, 'message': '已更新'})


@project.route('/reads/<int:project_id>', methods=['DELETE'])
def clear_reads(project_id):
    """清空该项目的已读记录（重新体验用）。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    uid = current_user_id()
    n = ReadRecord.query.filter_by(user_id=uid, project_id=project_id).delete(
        synchronize_session=False)
    db.session.commit()
    return jsonify({'success': True, 'data': {'deleted': n}, 'message': '已清空已读记录'})
