# -*- coding: utf-8 -*-
"""试玩数据统计：埋点写入与作者侧聚合。"""
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from flask import jsonify, request

from .. import db
from ..models import (BranchPath, Ending, PlayEvent, Project, Scene,
                      ScriptContent)
from ..security import current_user_id
from . import project
from .save_views import _owned_project

EVENT_TYPES = {'start', 'scene_enter', 'choice', 'ending', 'finish'}


def _fmt_duration(seconds):
    seconds = max(0, int(round(seconds or 0)))
    if seconds < 60:
        return f'{seconds} 秒'
    minutes, sec = divmod(seconds, 60)
    if minutes < 60:
        return f'{minutes} 分 {sec} 秒'
    hours, minutes = divmod(minutes, 60)
    return f'{hours} 小时 {minutes} 分'


@project.route('/play_event/<int:project_id>', methods=['POST'])
def record_play_event(project_id):
    """播放器埋点：公开作品与作者本人都可写入。"""
    project_row = db.session.get(Project, project_id)
    if not project_row:
        return jsonify({'success': False, 'message': '项目不存在'}), 404

    uid = current_user_id()
    if not bool(project_row.is_public) and (not uid or int(uid) != int(project_row.user_id)):
        return jsonify({'success': False, 'message': '项目未公开'}), 403

    data = request.get_json(silent=True) or {}
    session_id = str(data.get('session_id') or '').strip()[:64]
    event_type = str(data.get('event_type') or '').strip()
    if not session_id or event_type not in EVENT_TYPES:
        return jsonify({'success': False, 'message': '无效的埋点参数'}), 400

    def as_int(key):
        try:
            value = int(data.get(key))
            return value if value > 0 else None
        except (TypeError, ValueError):
            return None

    event = PlayEvent(
        project_id=project_id,
        user_id=uid,
        session_id=session_id,
        event_type=event_type,
        scene_id=as_int('scene_id'),
        content_id=as_int('content_id'),
        path_id=as_int('path_id'),
        ending_id=as_int('ending_id'),
        payload=data.get('payload') if isinstance(data.get('payload'), dict) else None,
    )
    db.session.add(event)
    db.session.commit()
    return jsonify({'success': True})


@project.route('/play_analytics/<int:project_id>', methods=['GET'])
def play_analytics(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    days = request.args.get('days', type=int) or 30
    days = max(1, min(365, days))
    since = datetime.now() - timedelta(days=days)
    events = (PlayEvent.query
              .filter(PlayEvent.project_id == project_id, PlayEvent.created_at >= since)
              .order_by(PlayEvent.created_at.asc())
              .all())

    sessions = defaultdict(lambda: {
        'first': None, 'last': None, 'start': False, 'finish': False,
        'scenes': set(), 'endings': set(),
    })
    for e in events:
        s = sessions[e.session_id]
        if s['first'] is None or e.created_at < s['first']:
            s['first'] = e.created_at
        if s['last'] is None or e.created_at > s['last']:
            s['last'] = e.created_at
        if e.event_type == 'start':
            s['start'] = True
        elif e.event_type == 'finish':
            s['finish'] = True
        elif e.event_type == 'ending':
            if e.ending_id:
                s['endings'].add(int(e.ending_id))
        elif e.event_type == 'scene_enter' and e.scene_id:
            s['scenes'].add(int(e.scene_id))

    total_sessions = len(sessions)
    start_sessions = sum(1 for s in sessions.values() if s['start']) or total_sessions
    finished_sessions = sum(
        1 for s in sessions.values() if s['finish'] or s['endings'])
    completion_rate = round(finished_sessions * 100.0 / start_sessions, 1) if start_sessions else 0

    durations = []
    for s in sessions.values():
        if s['first'] and s['last']:
            delta = (s['last'] - s['first']).total_seconds()
            if 0 < delta <= 4 * 3600:
                durations.append(delta)
    avg_duration = sum(durations) / len(durations) if durations else 0

    scenes = (Scene.query.filter_by(project_id=project_id)
              .order_by(Scene.order_num.asc(), Scene.scene_id.asc()).all())
    scene_reach = Counter()
    for s in sessions.values():
        for sid in s['scenes']:
            scene_reach[sid] += 1
    scene_rows = [{
        'scene_id': int(s.scene_id),
        'title': s.title or f'场景 {s.scene_id}',
        'order_num': int(s.order_num or 0),
        'reached': scene_reach.get(int(s.scene_id), 0),
        'rate': round(scene_reach.get(int(s.scene_id), 0) * 100.0 / start_sessions, 1)
        if start_sessions else 0,
    } for s in scenes]

    # 选项分布：按「选择节点 → 选项」聚合
    branches = {int(b.path_id): b for b in
                BranchPath.query.filter_by(project_id=project_id).all()}
    choice_counts = Counter()
    for e in events:
        if e.event_type == 'choice' and e.content_id:
            choice_counts[(int(e.content_id), int(e.path_id or 0))] += 1
    node_totals = defaultdict(int)
    for (cid, _pid), count in choice_counts.items():
        node_totals[cid] += count

    content_rows = {int(c.content_id): c for c in
                    ScriptContent.query.filter_by(project_id=project_id).all()
                    if int(c.content_id) in node_totals}
    scene_titles = {int(s.scene_id): (s.title or f'场景 {s.scene_id}') for s in scenes}
    choice_groups = []
    for cid, content in content_rows.items():
        options = []
        for (node_id, path_id), count in choice_counts.items():
            if node_id != cid:
                continue
            branch = branches.get(path_id)
            options.append({
                'path_id': path_id or None,
                'choice_text': (branch.choice_text if branch and branch.choice_text else '（无选项文案）'),
                'target_content_id': int(branch.target_content_id) if branch else None,
                'count': count,
                'percent': round(count * 100.0 / node_totals[cid], 1) if node_totals[cid] else 0,
            })
        options.sort(key=lambda x: -x['count'])
        choice_groups.append({
            'content_id': cid,
            'scene_id': int(content.scene_id),
            'scene_title': scene_titles.get(int(content.scene_id), ''),
            'node_text': (content.content_text or '')[:80],
            'total': node_totals[cid],
            'options': options,
        })
    choice_groups.sort(key=lambda g: (
        next((s.order_num for s in scenes if int(s.scene_id) == g['scene_id']), 0),
        g['content_id'],
    ))

    endings = Ending.query.filter_by(project_id=project_id).order_by(Ending.ending_id.asc()).all()
    ending_rows = []
    for ending in endings:
        reached = sum(1 for s in sessions.values() if int(ending.ending_id) in s['endings'])
        ending_rows.append({
            'ending_id': int(ending.ending_id),
            'title': ending.title,
            'count': reached,
            'rate': round(reached * 100.0 / start_sessions, 1) if start_sessions else 0,
        })

    return jsonify({
        'success': True,
        'data': {
            'summary': {
                'days': days,
                'total_sessions': total_sessions,
                'start_sessions': start_sessions,
                'finished_sessions': finished_sessions,
                'completion_rate': completion_rate,
                'avg_duration_seconds': round(avg_duration, 1),
                'avg_duration_text': _fmt_duration(avg_duration),
                'event_count': len(events),
            },
            'scenes': scene_rows,
            'choices': choice_groups,
            'endings': ending_rows,
        },
    })
