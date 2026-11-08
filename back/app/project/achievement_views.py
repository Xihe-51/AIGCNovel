# -*- coding: utf-8 -*-
"""成就系统：作者定义成就，播放器按变量/结局/通关解锁。"""
from flask import jsonify, request

from .. import db
from ..models import (Achievement, AchievementUnlock, Ending, Project,
                      ProjectVariable)
from ..security import current_user_id
from . import project
from .save_views import _owned_project

CONDITION_TYPES = {'ending', 'variable', 'finish'}
OPS = {'>', '>=', '<', '<=', '==', '!='}


def _achievement_json(a, unlocked=False):
    return {
        'achievement_id': int(a.achievement_id),
        'title': a.title,
        'description': a.description or '',
        'condition': a.condition or {},
        'unlocked': bool(unlocked),
    }


def _normalize_payload(project_id, data):
    title = str(data.get('title') or '').strip()
    if not title:
        return None, '成就名称不能为空'
    if len(title) > 100:
        return None, '成就名称最多 100 字'
    description = str(data.get('description') or '').strip()[:255]
    cond = data.get('condition')
    if not isinstance(cond, dict):
        return None, '缺少成就条件'
    ctype = str(cond.get('type') or '')
    if ctype not in CONDITION_TYPES:
        return None, '不支持的成就条件类型'

    if ctype == 'ending':
        try:
            ending_id = int(cond.get('ending_id'))
        except (TypeError, ValueError):
            return None, '请选择结局'
        ending = Ending.query.filter_by(
            project_id=project_id, ending_id=ending_id).first()
        if not ending:
            return None, '结局不存在'
        normalized = {'type': 'ending', 'ending_id': ending_id}
    elif ctype == 'variable':
        name = str(cond.get('variable') or '').strip()
        variable = ProjectVariable.query.filter_by(
            project_id=project_id, name=name).first()
        if not variable:
            return None, '变量不存在'
        op = str(cond.get('op') or '')
        if op not in OPS:
            return None, '不支持的比较方式'
        try:
            value = int(cond.get('value'))
        except (TypeError, ValueError):
            return None, '变量目标值必须是整数'
        normalized = {'type': 'variable', 'variable': name, 'op': op, 'value': value}
    else:
        normalized = {'type': 'finish'}

    return {'title': title, 'description': description, 'condition': normalized}, None


def _unlocked_ids(uid):
    if not uid:
        return set()
    rows = (AchievementUnlock.query
            .filter(AchievementUnlock.user_id == uid)
            .with_entities(AchievementUnlock.achievement_id).all())
    return {int(r[0]) for r in rows}


@project.route('/achievements/<int:project_id>', methods=['GET'])
def list_achievements(project_id):
    project_row = db.session.get(Project, project_id)
    if not project_row:
        return jsonify({'success': False, 'message': '项目不存在'}), 404
    uid = current_user_id()
    if (not bool(project_row.is_public)) and (not uid or int(uid) != int(project_row.user_id)):
        return jsonify({'success': False, 'message': '项目未公开'}), 403

    rows = (Achievement.query.filter_by(project_id=project_id)
            .order_by(Achievement.achievement_id.asc()).all())
    unlocked = _unlocked_ids(uid)
    return jsonify({
        'success': True,
        'data': [_achievement_json(a, int(a.achievement_id) in unlocked) for a in rows],
    })


@project.route('/achievements/<int:project_id>', methods=['POST'])
def create_achievement(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    payload, msg = _normalize_payload(project_id, data)
    if msg:
        return jsonify({'success': False, 'message': msg}), 400

    achievement = Achievement(project_id=project_id, **payload)
    db.session.add(achievement)
    db.session.commit()
    return jsonify({'success': True, 'data': _achievement_json(achievement)})


@project.route('/achievements/<int:project_id>/<int:achievement_id>', methods=['PUT'])
def update_achievement(project_id, achievement_id):
    _, err = _owned_project(project_id)
    if err:
        return err
    achievement = Achievement.query.filter_by(
        project_id=project_id, achievement_id=achievement_id).first()
    if not achievement:
        return jsonify({'success': False, 'message': '成就不存在'}), 404

    data = request.get_json(silent=True) or {}
    payload, msg = _normalize_payload(project_id, data)
    if msg:
        return jsonify({'success': False, 'message': msg}), 400

    achievement.title = payload['title']
    achievement.description = payload['description']
    achievement.condition = payload['condition']
    db.session.commit()
    return jsonify({'success': True, 'data': _achievement_json(achievement)})


@project.route('/achievements/<int:project_id>/<int:achievement_id>', methods=['DELETE'])
def delete_achievement(project_id, achievement_id):
    _, err = _owned_project(project_id)
    if err:
        return err
    achievement = Achievement.query.filter_by(
        project_id=project_id, achievement_id=achievement_id).first()
    if not achievement:
        return jsonify({'success': False, 'message': '成就不存在'}), 404

    AchievementUnlock.query.filter_by(achievement_id=achievement_id).delete(
        synchronize_session=False)
    db.session.delete(achievement)
    db.session.commit()
    return jsonify({'success': True})


def _condition_met(cond, variables, ending_ids, finished):
    cond = cond or {}
    ctype = cond.get('type')
    if ctype == 'ending':
        try:
            return int(cond.get('ending_id')) in ending_ids
        except (TypeError, ValueError):
            return False
    if ctype == 'variable':
        name = str(cond.get('variable') or '')
        if name not in variables:
            return False
        try:
            current = float(variables[name])
            target = float(cond.get('value'))
        except (TypeError, ValueError):
            return False
        op = cond.get('op')
        if op == '>':
            return current > target
        if op == '>=':
            return current >= target
        if op == '<':
            return current < target
        if op == '<=':
            return current <= target
        if op == '==':
            return current == target
        if op == '!=':
            return current != target
        return False
    if ctype == 'finish':
        return bool(finished)
    return False


@project.route('/achievements/<int:project_id>/check', methods=['POST'])
def check_achievements(project_id):
    """播放器上报变量/已达成结局/是否通关，返回新解锁的成就。"""
    project_row = db.session.get(Project, project_id)
    if not project_row:
        return jsonify({'success': False, 'message': '项目不存在'}), 404
    uid = current_user_id()
    if (not bool(project_row.is_public)) and (not uid or int(uid) != int(project_row.user_id)):
        return jsonify({'success': False, 'message': '项目未公开'}), 403

    data = request.get_json(silent=True) or {}
    variables = data.get('variables') if isinstance(data.get('variables'), dict) else {}
    try:
        ending_ids = {int(x) for x in (data.get('endings') or [])}
    except (TypeError, ValueError):
        ending_ids = set()
    finished = bool(data.get('finished'))

    rows = Achievement.query.filter_by(project_id=project_id).all()
    unlocked = _unlocked_ids(uid)
    newly = []
    for a in rows:
        if int(a.achievement_id) in unlocked:
            continue
        if not _condition_met(a.condition, variables, ending_ids, finished):
            continue
        unlocked.add(int(a.achievement_id))
        newly.append(_achievement_json(a, True))
        if uid:
            db.session.add(AchievementUnlock(
                user_id=uid, achievement_id=a.achievement_id))
    if uid and newly:
        db.session.commit()

    return jsonify({
        'success': True,
        'data': {
            'newly_unlocked': newly,
            'unlocked_ids': sorted(unlocked),
            'achievements': [_achievement_json(a, int(a.achievement_id) in unlocked)
                             for a in rows],
        },
    })
