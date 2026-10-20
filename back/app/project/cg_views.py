# -*- coding: utf-8 -*-
"""
CG 图鉴。

- project_cgs：作者为作品登记的 CG（标题/图片/可选绑定结局）
- 解锁规则完全复用 ending_unlocks：unlock_ending_id 为空 → 初始可见；
  绑定了结局 → 当前用户解锁该结局后才在鉴赏页可见。
  因此不需要额外的 CG 解锁表，也不会出现「解锁状态不一致」。
"""
from flask import jsonify, request

from .. import db
from ..models import Project, ProjectCG, Ending, EndingUnlock, MarketResource, ResourceReference
from ..security import current_user_id
from . import project
from .save_views import _owned_project


def _find_cg(project_id, cg_id):
    return ProjectCG.query.filter_by(project_id=project_id, cg_id=cg_id).first()


def _cg_to_dict(cg, unlocked_ids=None, ending_titles=None):
    unlocked = cg.unlock_ending_id is None or (
        unlocked_ids is not None and cg.unlock_ending_id in unlocked_ids)
    return {
        'cg_id': cg.cg_id,
        'project_id': cg.project_id,
        'title': cg.title,
        'description': cg.description,
        'image_url': cg.image_url,
        'resource_id': cg.resource_id,
        'unlock_ending_id': cg.unlock_ending_id,
        'unlock_ending_title': (ending_titles or {}).get(cg.unlock_ending_id),
        'order_num': cg.order_num,
        'unlocked': unlocked,
    }


def _validate_ending_id(project_id, raw):
    """校验绑定的结局属于该项目；返回 (ending_id, 错误消息)。"""
    if raw in (None, '', 0, '0'):
        return None, None
    try:
        ending_id = int(raw)
    except (TypeError, ValueError):
        return None, '绑定的结局不合法'
    row = Ending.query.filter_by(project_id=project_id, ending_id=ending_id).first()
    if not row:
        return None, '绑定的结局不属于该项目'
    return ending_id, None


def _resolve_image(data):
    """
    解析 CG 图片来源：优先市场「CG」素材，其次直接给的 image_url。

    :return: (image_url, resource_id, 错误消息)
    """
    raw_resource = data.get('resource_id')
    if raw_resource not in (None, '', 0, '0'):
        try:
            resource_id = int(raw_resource)
        except (TypeError, ValueError):
            return None, None, '素材不合法'
        resource = db.session.get(MarketResource, resource_id)
        if not resource:
            return None, None, '素材不存在'
        if resource.resource_type != 'CG':
            return None, None, '只能引用「CG」类型的市场素材'
        return resource.file_url, resource_id, None

    image_url = str(data.get('image_url') or '').strip()
    if not image_url:
        return None, None, '请上传 CG 图片或选择市场素材'
    return image_url, None, None


def _sync_reference(resource_id, user_id, project_id, action):
    """把市场素材引用同步到引用计数表（幂等）。action 为 'add' / 'remove'。"""
    if not resource_id:
        return
    existing = ResourceReference.query.filter_by(
        resource_id=resource_id, user_id=user_id, project_id=project_id).first()
    if action == 'add':
        if not existing:
            db.session.add(ResourceReference(
                resource_id=resource_id, user_id=user_id, project_id=project_id))
    elif existing:
        # 同一项目里可能有多条 CG 用同一个素材，仍被引用时保留计数
        still_used = ProjectCG.query.filter_by(
            project_id=project_id, resource_id=resource_id).count()
        if still_used == 0:
            db.session.delete(existing)


@project.route('/cgs/<int:project_id>', methods=['GET'])
def list_cgs(project_id):
    """作者视角：项目全部 CG（含未解锁标记，便于作者核对）。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    uid = current_user_id()
    rows = (ProjectCG.query
            .filter_by(project_id=project_id)
            .order_by(ProjectCG.order_num.asc(), ProjectCG.cg_id.asc())
            .all())
    unlocked = {
        r[0] for r in db.session.query(EndingUnlock.ending_id)
        .filter_by(user_id=uid, project_id=project_id).all()
    }
    titles = {
        e.ending_id: e.title
        for e in Ending.query.filter_by(project_id=project_id).all()
    }
    return jsonify({
        'success': True,
        'data': [_cg_to_dict(c, unlocked, titles) for c in rows],
    })


@project.route('/cgs/<int:project_id>', methods=['POST'])
def create_cg(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    title = str(data.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'message': '请填写 CG 标题'}), 400

    image_url, resource_id, ierr = _resolve_image(data)
    if ierr:
        return jsonify({'success': False, 'message': ierr}), 400

    unlock_ending_id, eerr = _validate_ending_id(project_id, data.get('unlock_ending_id'))
    if eerr:
        return jsonify({'success': False, 'message': eerr}), 400

    try:
        order_num = int(data.get('order_num'))
    except (TypeError, ValueError):
        order_num = (db.session.query(db.func.max(ProjectCG.order_num))
                     .filter_by(project_id=project_id).scalar() or 0) + 1

    row = ProjectCG(
        project_id=project_id,
        title=title,
        description=str(data.get('description') or '') or None,
        image_url=image_url,
        resource_id=resource_id,
        unlock_ending_id=unlock_ending_id,
        order_num=order_num,
    )
    db.session.add(row)
    _sync_reference(resource_id, current_user_id(), project_id, 'add')
    db.session.commit()
    return jsonify({'success': True, 'data': _cg_to_dict(row), 'message': 'CG 已添加'}), 201


@project.route('/cgs/<int:project_id>/<int:cg_id>', methods=['PUT'])
def update_cg(project_id, cg_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    row = _find_cg(project_id, cg_id)
    if not row:
        return jsonify({'success': False, 'message': 'CG 不存在'}), 404

    data = request.get_json(silent=True) or {}
    if 'title' in data:
        title = str(data.get('title') or '').strip()
        if not title:
            return jsonify({'success': False, 'message': '请填写 CG 标题'}), 400
        row.title = title
    if 'description' in data:
        row.description = str(data.get('description') or '') or None
    if 'unlock_ending_id' in data:
        unlock_ending_id, eerr = _validate_ending_id(project_id, data.get('unlock_ending_id'))
        if eerr:
            return jsonify({'success': False, 'message': eerr}), 400
        row.unlock_ending_id = unlock_ending_id
    if 'order_num' in data:
        try:
            row.order_num = int(data.get('order_num'))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': '排序值必须是整数'}), 400

    # 换图：可以给 image_url，也可以改绑市场素材
    if 'image_url' in data or 'resource_id' in data:
        image_url, resource_id, ierr = _resolve_image({
            'image_url': data.get('image_url'),
            'resource_id': data.get('resource_id'),
        })
        if ierr:
            return jsonify({'success': False, 'message': ierr}), 400
        old_resource_id = row.resource_id
        row.image_url = image_url
        row.resource_id = resource_id
        if old_resource_id != resource_id:
            _sync_reference(old_resource_id, current_user_id(), project_id, 'remove')
            _sync_reference(resource_id, current_user_id(), project_id, 'add')

    db.session.commit()
    return jsonify({'success': True, 'data': _cg_to_dict(row), 'message': 'CG 已更新'})


@project.route('/cgs/<int:project_id>/<int:cg_id>', methods=['DELETE'])
def delete_cg(project_id, cg_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    row = _find_cg(project_id, cg_id)
    if not row:
        return jsonify({'success': False, 'message': 'CG 不存在'}), 404

    resource_id = row.resource_id
    db.session.delete(row)
    db.session.flush()
    _sync_reference(resource_id, current_user_id(), project_id, 'remove')
    db.session.commit()
    return jsonify({'success': True, 'message': 'CG 已删除'})


@project.route('/gallery/<int:project_id>', methods=['GET'])
def get_gallery(project_id):
    """
    鉴赏页：作者本人或公开项目可读。

    未解锁的条目不下发 image_url，避免绕过解锁直接拿到原图；
    前端用占位图 + 锁标识呈现。
    """
    uid = current_user_id()
    if not uid:
        return jsonify({'success': False, 'message': '未登录'}), 401

    row = db.session.get(Project, project_id)
    if not row or (int(row.user_id) != int(uid) and not bool(row.is_public)):
        return jsonify({'success': False, 'message': '项目不存在或无权访问'}), 404

    cgs = (ProjectCG.query
           .filter_by(project_id=project_id)
           .order_by(ProjectCG.order_num.asc(), ProjectCG.cg_id.asc())
           .all())
    unlocked = {
        r[0] for r in db.session.query(EndingUnlock.ending_id)
        .filter_by(user_id=uid, project_id=project_id).all()
    }
    titles = {
        e.ending_id: e.title
        for e in Ending.query.filter_by(project_id=project_id).all()
    }

    items = []
    for cg in cgs:
        item = _cg_to_dict(cg, unlocked, titles)
        if not item['unlocked']:
            item['image_url'] = None
        items.append(item)

    return jsonify({
        'success': True,
        'data': {
            'project_id': project_id,
            'title': row.title,
            'total': len(items),
            'unlocked_count': sum(1 for i in items if i['unlocked']),
            'items': items,
        },
    })
