# -*- coding: utf-8 -*-
"""自动全分支试玩 / 剧情回归。

与播放器共用同一套运行时规则，但用状态推演代替真人点击：
- 场景锁不满足 → 跳过场景
- 台词条件不满足 → 跳过台词
- 到达节点先结算数值变化，再判定结局
- 选择节点枚举所有条件成立的选项；普通节点优先走自动跳转边，否则顺序推进
- 同一 (场景, 节点, 变量值) 状态只推演一次，避免分支爆炸

输出：可达结局 / 未达结局、未走节点、永远锁住的选项、锁住的场景、死路。
"""
from flask import jsonify

from ..models import (BranchPath, ContentEffect, Ending, ProjectVariable,
                      Scene, SceneLock, ScriptContent)
from . import project
from .save_views import _owned_project

MAX_STATES = 3000
MAX_DEPTH = 400
MAX_LIST = 60
OP_LABELS = {'>': '>', '>=': '≥', '<': '<', '<=': '≤', '==': '=', '!=': '≠'}


def _snippet(text, size=40):
    t = (text or '').replace('\n', ' ').strip()
    return t[:size] + ('…' if len(t) > size else '')


def _int_or(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _clamp(var_def, value):
    n = _int_or(value, var_def['initial'])
    if var_def['min'] is not None:
        n = max(int(var_def['min']), n)
    if var_def['max'] is not None:
        n = min(int(var_def['max']), n)
    return n


def _eval_single(cond, values, var_defs):
    if not isinstance(cond, dict):
        return True
    name = cond.get('variable')
    if not name or name not in var_defs:
        return False
    current = _int_or(values.get(name, var_defs[name]['initial']), var_defs[name]['initial'])
    target = cond.get('value')
    if target is None:
        return False
    target = _int_or(target, None)
    if target is None:
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


def _eval_cond(cond, values, var_defs):
    """兼容单条件 {variable,op,value} 与条件组 {mode, items:[...]}。"""
    if not isinstance(cond, dict):
        return True
    items = cond.get('items')
    if isinstance(items, list):
        items = [i for i in items if isinstance(i, dict) and i.get('variable')]
        if not items:
            return True
        if cond.get('mode') == 'or':
            return any(_eval_single(i, values, var_defs) for i in items)
        return all(_eval_single(i, values, var_defs) for i in items)
    return _eval_single(cond, values, var_defs)


def _cond_text(cond):
    if not isinstance(cond, dict):
        return ''
    items = cond.get('items') if isinstance(cond.get('items'), list) else [cond]
    parts = []
    for item in items:
        if not isinstance(item, dict) or not item.get('variable'):
            continue
        parts.append(f"{item['variable']} {OP_LABELS.get(item.get('op'), item.get('op'))} {item.get('value')}")
    if not parts:
        return ''
    return (' 或 ' if cond.get('mode') == 'or' else ' 且 ').join(parts)


def _ending_conditions_hit(ending, values, var_defs):
    """结局条件是「全部成立」的单条件数组。"""
    conds = ending.conditions or []
    if not isinstance(conds, list):
        return True
    return all(_eval_single(c, values, var_defs) for c in conds if isinstance(c, dict))


@project.route('/story_regression/<int:project_id>', methods=['GET'])
def story_regression(project_id):
    project_row, err = _owned_project(project_id)
    if err:
        return err

    scenes = (Scene.query
              .filter_by(project_id=project_id)
              .order_by(Scene.order_num.asc(), Scene.scene_id.asc())
              .all())
    contents = (ScriptContent.query
                .filter_by(project_id=project_id)
                .order_by(ScriptContent.order_num.asc(), ScriptContent.content_id.asc())
                .all())
    by_scene = {}
    for c in contents:
        by_scene.setdefault(c.scene_id, []).append(c)
    position = {}
    for si, scene in enumerate(scenes):
        for ni, node in enumerate(by_scene.get(scene.scene_id, [])):
            position[int(node.content_id)] = (si, ni)

    branches = BranchPath.query.filter_by(project_id=project_id).all()
    branches_by_source = {}
    for b in branches:
        branches_by_source.setdefault(int(b.source_content_id), []).append(b)

    locks = {int(l.scene_id): l.conditions for l in SceneLock.query.filter_by(project_id=project_id).all()}

    variables = ProjectVariable.query.filter_by(project_id=project_id).all()
    var_defs = {
        v.name: {'initial': _int_or(v.initial_value, 0), 'min': v.min_value, 'max': v.max_value}
        for v in variables
    }
    var_names = {int(v.variable_id): v.name for v in variables}

    effects = {}
    project_effect_rows = (ContentEffect.query
                           .join(ScriptContent, ScriptContent.content_id == ContentEffect.content_id)
                           .filter(ScriptContent.project_id == project_id)
                           .all())
    for e in project_effect_rows:
        name = var_names.get(int(e.variable_id))
        if not name:
            continue
        effects.setdefault(int(e.content_id), []).append((name, _int_or(e.delta, 0)))

    endings = Ending.query.filter_by(project_id=project_id).all()
    endings_by_content = {}
    for e in endings:
        endings_by_content.setdefault(int(e.content_id), []).append(e)

    def next_playable(scene_id, start, values, skipped):
        lst = by_scene.get(scene_id, [])
        i = max(0, start)
        while i < len(lst):
            if _eval_cond(lst[i].branch_condition, values, var_defs):
                return i
            skipped.add(int(lst[i].content_id))
            i += 1
        return len(lst)

    def first_scene(start, values, locked_scenes):
        si = max(0, start)
        while si < len(scenes):
            sid = int(scenes[si].scene_id)
            if not _eval_cond(locks.get(sid), values, var_defs):
                locked_scenes.add(sid)
                si += 1
                continue
            if next_playable(sid, 0, values, set()) >= len(by_scene.get(sid, [])):
                si += 1
                continue
            return si
        return None

    initial = {name: d['initial'] for name, d in var_defs.items()}
    locked_scenes = set()
    skipped_nodes = set()
    visited_nodes = set()
    reached_endings = set()
    branch_seen = {}
    branch_taken = set()
    dead_ends = []
    dead_end_keys = set()
    path_count = 0
    states = 0
    capped = False

    start_si = first_scene(0, initial, locked_scenes)
    stack = []
    if start_si is not None:
        stack.append((start_si, 0, initial, 0))

    while stack:
        if states >= MAX_STATES:
            capped = True
            break
        states += 1
        si, ni, values, depth = stack.pop()
        sid = int(scenes[si].scene_id)
        ni = next_playable(sid, ni, values, skipped_nodes)

        # 场景台词播完 → 下一可播放场景
        if ni >= len(by_scene.get(sid, [])):
            nxt = first_scene(si + 1, values, locked_scenes)
            if nxt is None:
                path_count += 1
                dead_ends.append({
                    'scene_id': sid,
                    'scene_title': scenes[si].title,
                    'content_id': None,
                    'text': '',
                    'reason': '剧情结束但没有触发任何结局',
                })
            else:
                stack.append((nxt, 0, values, depth + 1))
            continue

        node = by_scene[sid][ni]
        cid = int(node.content_id)
        visited_nodes.add(cid)

        # 先结算数值变化（与播放器一致）
        next_values = dict(values)
        for name, delta in effects.get(cid, []):
            next_values[name] = _clamp(var_defs[name], next_values.get(name, var_defs[name]['initial']) + delta)

        # 到达节点判定结局：满足即终止本路线
        hit_endings = [e for e in endings_by_content.get(cid, []) if _ending_conditions_hit(e, next_values, var_defs)]
        if hit_endings:
            path_count += 1
            for e in hit_endings:
                reached_endings.add(int(e.ending_id))
            continue

        if depth >= MAX_DEPTH:
            capped = True
            continue

        outs = branches_by_source.get(cid, [])
        if node.content_type == '选择':
            usable = []
            for b in outs:
                info = branch_seen.setdefault(int(b.path_id), {'path_id': int(b.path_id), 'from': cid,
                                                                'taken': False, 'conditions': b.conditions})
                ok = _eval_cond(b.conditions, next_values, var_defs)
                if ok:
                    info['taken'] = True
                    usable.append(b)
            if not usable:
                path_count += 1
                key = (sid, cid, 'choice')
                if key not in dead_end_keys:
                    dead_end_keys.add(key)
                    dead_ends.append({
                        'scene_id': sid,
                        'scene_title': scenes[si].title,
                        'content_id': cid,
                        'text': _snippet(node.content_text),
                        'reason': '选择节点没有条件成立的选项，玩家会卡住',
                    })
                continue

            for b in usable:
                branch_taken.add(int(b.path_id))
                target = position.get(int(b.target_content_id))
                if not target:
                    path_count += 1
                    key = (sid, cid, 'missing')
                    if key not in dead_end_keys:
                        dead_end_keys.add(key)
                        dead_ends.append({
                            'scene_id': sid,
                            'scene_title': scenes[si].title,
                            'content_id': cid,
                            'text': _snippet(node.content_text),
                            'reason': f'选项「{b.choice_text or "未命名"}」指向不存在的节点',
                        })
                    continue
                tsi, tni = target
                tsid = int(scenes[tsi].scene_id)
                if not _eval_cond(locks.get(tsid), next_values, var_defs):
                    locked_scenes.add(tsid)
                    path_count += 1
                    key = (sid, cid, 'locked', tsid)
                    if key not in dead_end_keys:
                        dead_end_keys.add(key)
                        dead_ends.append({
                            'scene_id': sid,
                            'scene_title': scenes[si].title,
                            'content_id': cid,
                            'text': _snippet(node.content_text),
                            'reason': f'选项「{b.choice_text or "未命名"}」的目标场景被剧情锁挡住',
                        })
                    continue

                stack.append((tsi, tni, next_values, depth + 1))
            continue

        # 普通节点：优先自动跳转边（无选项文案且条件成立）
        auto_edge = None
        for b in outs:
            if (b.choice_text or '').strip():
                continue
            if _eval_cond(b.conditions, next_values, var_defs):
                auto_edge = b
                break
        if auto_edge is not None:
            target = position.get(int(auto_edge.target_content_id))
            if not target:
                path_count += 1
                key = (sid, cid, 'missing-auto')
                if key not in dead_end_keys:
                    dead_end_keys.add(key)
                    dead_ends.append({
                        'scene_id': sid,
                        'scene_title': scenes[si].title,
                        'content_id': cid,
                        'text': _snippet(node.content_text),
                        'reason': '自动跳转目标不存在',
                    })
                continue
            tsi, tni = target
            tsid = int(scenes[tsi].scene_id)
            if not _eval_cond(locks.get(tsid), next_values, var_defs):
                locked_scenes.add(tsid)
                path_count += 1
                key = (sid, cid, 'locked-auto', tsid)
                if key not in dead_end_keys:
                    dead_end_keys.add(key)
                    dead_ends.append({
                        'scene_id': sid,
                        'scene_title': scenes[si].title,
                        'content_id': cid,
                        'text': _snippet(node.content_text),
                        'reason': '自动跳转的目标场景被剧情锁挡住',
                    })
                continue
            stack.append((tsi, tni, next_values, depth + 1))
            continue

        # 顺序推进：同场景下一条条件成立的台词，没有则下一场景
        nxt_ni = next_playable(sid, ni + 1, next_values, skipped_nodes)
        if nxt_ni < len(by_scene.get(sid, [])):
            stack.append((si, nxt_ni, next_values, depth + 1))
        else:
            nxt_si = first_scene(si + 1, next_values, locked_scenes)
            if nxt_si is None:
                path_count += 1
                key = (sid, cid, 'end')
                if key not in dead_end_keys:
                    dead_end_keys.add(key)
                    dead_ends.append({
                        'scene_id': sid,
                        'scene_title': scenes[si].title,
                        'content_id': cid,
                        'text': _snippet(node.content_text),
                        'reason': '剧情结束但没有触发任何结局',
                    })
            else:
                stack.append((nxt_si, 0, next_values, depth + 1))

    reached_ids = {int(e.ending_id) for e in endings if int(e.ending_id) in reached_endings}
    missed_endings = [
        {'ending_id': int(e.ending_id), 'title': e.title,
         'content_id': int(e.content_id) if e.content_id else None,
         'conditions': _cond_text({'items': e.conditions}) if isinstance(e.conditions, list) else ''}
        for e in endings if int(e.ending_id) not in reached_ids
    ]
    gated_choices = [
        {'path_id': info['path_id'], 'from': info['from'],
         'conditions': _cond_text(info['conditions']) or '条件永假'}
        for info in branch_seen.values() if not info['taken']
    ]
    node_total = len(contents)
    content_ids = {int(c.content_id) for c in contents}
    visited_total = len(visited_nodes & content_ids)
    unvisited = [
        {'content_id': int(c.content_id), 'scene_id': int(c.scene_id),
         'scene_title': next((s.title for s in scenes if int(s.scene_id) == int(c.scene_id)), ''),
         'text': _snippet(c.content_text)}
        for c in contents if int(c.content_id) not in visited_nodes
    ]

    return jsonify({
        'success': True,
        'data': {
            'summary': {
                'state_count': states,
                'path_count': path_count,
                'node_total': node_total,
                'node_visited': visited_total,
                'node_pct': round(visited_total * 100 / node_total) if node_total else 0,
                'ending_total': len(endings),
                'ending_reached': len(reached_ids),
                'locked_scene_count': len(locked_scenes),
                'gated_choice_count': len(gated_choices),
                'dead_end_count': len(dead_ends),
                'skipped_node_count': len(skipped_nodes),
                'capped': capped,
            },
            'endings': {
                'reached': [{'ending_id': int(e.ending_id), 'title': e.title}
                            for e in endings if int(e.ending_id) in reached_ids],
                'missed': missed_endings[:MAX_LIST],
            },
            'unvisited_nodes': unvisited[:MAX_LIST],
            'gated_choices': gated_choices[:MAX_LIST],
            'locked_scenes': [
                {'scene_id': sid,
                 'title': next((s.title for s in scenes if int(s.scene_id) == sid), ''),
                 'conditions': _cond_text(locks.get(sid))}
                for sid in sorted(locked_scenes)
            ][:MAX_LIST],
            'dead_ends': dead_ends[:MAX_LIST],
        },
    })
