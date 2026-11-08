# -*- coding: utf-8 -*-
"""共享的剧情路线推演：合成读者与多形态导出都基于这里。

规则与 regression_views / 播放器保持一致：
- 场景锁不满足 → 跳过场景
- 台词条件不满足 → 跳过台词
- 节点先结算数值变化，再判定结局
- 选择节点枚举条件成立的选项
- 普通节点优先走条件成立的自动跳转边，否则顺序推进
"""
from ..models import (BranchPath, Character, CharacterAvatar, ContentDirective, ContentEffect,
                      Ending, ProjectVariable, Scene, SceneLock, ScriptContent)

OP_LABELS = {'>': '>', '>=': '≥', '<': '<', '<=': '≤', '==': '=', '!=': '≠'}
MAX_STEPS = 800


def _int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _snippet(text, size=40):
    t = (text or '').replace('\n', ' ').strip()
    return t[:size] + ('…' if len(t) > size else '')


def _clamp(var_def, value):
    n = _int(value, var_def['initial'])
    if var_def['min'] is not None:
        n = max(int(var_def['min']), n)
    if var_def['max'] is not None:
        n = min(int(var_def['max']), n)
    return n


def eval_condition(cond, values, var_defs):
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


def _eval_single(cond, values, var_defs):
    if not isinstance(cond, dict):
        return True
    name = cond.get('variable')
    if not name or name not in var_defs:
        return False
    current = _int(values.get(name, var_defs[name]['initial']), var_defs[name]['initial'])
    target = _int(cond.get('value'), None)
    if target is None:
        return False
    op = cond.get('op')
    return {
        '>': current > target,
        '>=': current >= target,
        '<': current < target,
        '<=': current <= target,
        '==': current == target,
        '!=': current != target,
    }.get(op, False)


def condition_text(cond):
    if not isinstance(cond, dict):
        return ''
    items = cond.get('items') if isinstance(cond.get('items'), list) else [cond]
    parts = []
    for item in items:
        if not isinstance(item, dict) or not item.get('variable'):
            continue
        parts.append(f"{item['variable']} {OP_LABELS.get(item.get('op'), item.get('op'))} {item.get('value')}")
    return (' 或 ' if cond.get('mode') == 'or' else ' 且 ').join(parts)


def ending_hit(ending, values, var_defs):
    conds = ending.conditions or []
    if not isinstance(conds, list):
        return True
    return all(_eval_single(c, values, var_defs) for c in conds if isinstance(c, dict))


def _single_impossible(item, var_def):
    if not var_def:
        return True
    target = _int(item.get('value'), None)
    if target is None:
        return True
    op = item.get('op')
    lo, hi = var_def['min'], var_def['max']
    if op == '>' and hi is not None and target >= int(hi):
        return True
    if op == '>=' and hi is not None and target > int(hi):
        return True
    if op == '<' and lo is not None and target <= int(lo):
        return True
    if op == '<=' and lo is not None and target < int(lo):
        return True
    if op == '==' and ((lo is not None and target < int(lo)) or (hi is not None and target > int(hi))):
        return True
    if op == '!=' and lo is not None and hi is not None and lo == hi and target == int(lo):
        return True
    return False


def impossible_condition(cond, var_defs):
    """静态检查明显永假的条件（超出变量 min/max 或 == 超出范围）。

    AND：任一条件永假 → 整体永假；OR：所有条件都永假才算整体永假。
    """
    items = []
    if isinstance(cond, dict):
        raw = cond.get('items') if isinstance(cond.get('items'), list) else [cond]
        items = [i for i in raw if isinstance(i, dict) and i.get('variable')]
    if not items:
        return False
    flags = [_single_impossible(i, var_defs.get(i.get('variable'))) for i in items]
    if cond.get('mode') == 'or':
        return all(flags)
    return any(flags)


def load_graph(project_id):
    scenes = (Scene.query.filter_by(project_id=project_id)
              .order_by(Scene.order_num.asc(), Scene.scene_id.asc()).all())
    contents = (ScriptContent.query.filter_by(project_id=project_id)
                .order_by(ScriptContent.order_num.asc(), ScriptContent.content_id.asc()).all())
    by_scene = {}
    for c in contents:
        by_scene.setdefault(int(c.scene_id), []).append(c)

    position = {}
    for si, scene in enumerate(scenes):
        for ni, node in enumerate(by_scene.get(int(scene.scene_id), [])):
            position[int(node.content_id)] = (si, ni)

    branches = BranchPath.query.filter_by(project_id=project_id).all()
    branches_by_source = {}
    for b in branches:
        branches_by_source.setdefault(int(b.source_content_id), []).append(b)

    locks = {int(l.scene_id): l.conditions for l in SceneLock.query.filter_by(project_id=project_id).all()}
    variables = ProjectVariable.query.filter_by(project_id=project_id).all()
    var_defs = {v.name: {'initial': _int(v.initial_value, 0), 'min': v.min_value, 'max': v.max_value}
                for v in variables}
    var_names = {int(v.variable_id): v.name for v in variables}

    effects = {}
    effect_rows = (ContentEffect.query
                   .join(ScriptContent, ScriptContent.content_id == ContentEffect.content_id)
                   .filter(ScriptContent.project_id == project_id).all())
    for e in effect_rows:
        name = var_names.get(int(e.variable_id))
        if name:
            effects.setdefault(int(e.content_id), []).append((name, _int(e.delta, 0)))

    endings = Ending.query.filter_by(project_id=project_id).all()
    endings_by_content = {}
    for e in endings:
        endings_by_content.setdefault(int(e.content_id), []).append(e)

    characters = {int(c.character_id): (c.name or '') for c in
                  Character.query.filter_by(project_id=project_id).all()}

    avatars = {}
    if characters:
        for a in CharacterAvatar.query.filter(
                CharacterAvatar.character_id.in_(list(characters.keys()))).all():
            avatars[int(a.avatar_id)] = {
                'image_url': a.image_url or '',
                'avatar_type': a.avatar_type or '',
                'character_id': int(a.character_id),
            }

    directives = {}
    for d in (ContentDirective.query.filter_by(project_id=project_id)
              .order_by(ContentDirective.order_num.asc(), ContentDirective.directive_id.asc()).all()):
        directives.setdefault(int(d.content_id), []).append({
            'directive_id': int(d.directive_id),
            'directive_type': d.directive_type,
            'payload': d.payload or {},
        })

    return {
        'scenes': scenes,
        'contents': contents,
        'by_scene': by_scene,
        'position': position,
        'branches_by_source': branches_by_source,
        'locks': locks,
        'var_defs': var_defs,
        'effects': effects,
        'endings': endings,
        'endings_by_content': endings_by_content,
        'characters': characters,
        'avatars': avatars,
        'directives': directives,
    }


def _next_playable(graph, scene_id, start, values, skipped=None):
    lst = graph['by_scene'].get(scene_id, [])
    i = max(0, start)
    var_defs = graph['var_defs']
    while i < len(lst):
        if eval_condition(lst[i].branch_condition, values, var_defs):
            return i
        if skipped is not None:
            skipped.add(int(lst[i].content_id))
        i += 1
    return len(lst)


def _first_scene(graph, start, values):
    scenes = graph['scenes']
    si = max(0, start)
    while si < len(scenes):
        sid = int(scenes[si].scene_id)
        if not eval_condition(graph['locks'].get(sid), values, graph['var_defs']):
            si += 1
            continue
        if _next_playable(graph, sid, 0, values) >= len(graph['by_scene'].get(sid, [])):
            si += 1
            continue
        return si
    return None


def _scene_title(graph, scene_id):
    for s in graph['scenes']:
        if int(s.scene_id) == int(scene_id):
            return s.title
    return ''


def _scene_music(graph, scene_id):
    for s in graph['scenes']:
        if int(s.scene_id) == int(scene_id):
            return s.music_url or ''
    return ''


def _scene_background(graph, scene_id):
    for s in graph['scenes']:
        if int(s.scene_id) == int(scene_id):
            return s.background_url or ''
    return ''


def _build_edges(graph):
    edges = {}
    for c in graph['contents']:
        cid = int(c.content_id)
        outs = [int(b.target_content_id) for b in graph['branches_by_source'].get(cid, [])]
        target = graph['position'].get(cid)
        if target:
            si, ni = target
            sid = int(graph['scenes'][si].scene_id)
            lst = graph['by_scene'].get(sid, [])
            if ni + 1 < len(lst):
                outs.append(int(lst[ni + 1].content_id))
            elif si + 1 < len(graph['scenes']):
                nxt = graph['by_scene'].get(int(graph['scenes'][si + 1].scene_id), [])
                if nxt:
                    outs.append(int(nxt[0].content_id))
        edges[cid] = outs
    return edges


def _reverse_distances(graph, starts):
    """从若干目标节点反向 BFS，得到每个节点到目标的近似最短步数。"""
    starts = {int(cid) for cid in starts if int(cid) in graph['position']}
    if not starts:
        return {}
    edges = _build_edges(graph)
    dist = {cid: 0 for cid in starts}
    queue = list(dist.keys())
    head = 0
    while head < len(queue):
        cur = queue[head]
        head += 1
        for src, targets in edges.items():
            if cur in targets and src not in dist:
                dist[src] = dist[cur] + 1
                queue.append(src)
    return dist


def ending_distances(graph):
    """所有节点到最近结局的最短步数（忽略条件），用于速通读者选路。"""
    return _reverse_distances(graph, graph['endings_by_content'].keys())


def _make_target_picker(dist):
    def pick(options, _ctx):
        best = None
        best_score = None
        for opt in options:
            d = dist.get(int(opt['target_content_id']))
            score = d if d is not None else 10 ** 6
            if best_score is None or score < best_score:
                best, best_score = opt, score
        return best
    return pick


def walk_route(graph, choice_picker=None, patience=0, max_steps=None,
               include_directives=False, global_visit=None, global_pick=None,
               default_first_choice=True, target_ending_id=None):
    """按运行时规则走一条代表性路线。

    choice_picker(options, context) → 选中的选项；不传则按顺序选第一个。
    patience>0 时，连续 N 个节点没有选择就判定流失。
    target_ending_id：尽量朝指定结局选路（用于按结局导出）。
    """
    requested_ending = None
    if target_ending_id:
        requested_ending = next(
            (e for e in graph.get('endings', []) if int(e.ending_id) == int(target_ending_id)), None)
        if requested_ending and not choice_picker:
            dist = _reverse_distances(graph, {int(requested_ending.content_id)})
            if dist:
                choice_picker = _make_target_picker(dist)

    if max_steps is None:
        # 长篇线性项目也要能走完：上限随节点数放大，但仍保留硬上限保护
        max_steps = max(MAX_STEPS, len(graph['contents']) + 50)

    initial = {name: d['initial'] for name, d in graph['var_defs'].items()}
    start_si = _first_scene(graph, 0, initial)
    route = []
    choices = []
    ignored_options = []
    skipped = set()
    values = dict(initial)
    ending = None
    stop_reason = 'no_content'
    dropoff = None

    if start_si is None:
        return {
            'route': [], 'choices': [], 'ignored_options': [], 'ending': None,
            'requested_ending': ({
                'ending_id': int(requested_ending.ending_id),
                'title': requested_ending.title,
            } if requested_ending else None),
            'stop_reason': stop_reason, 'dropoff': None,
            'characters': graph.get('characters', {}),
            'avatars': graph.get('avatars', {}),
            'stats': {'node_count': 0, 'dialogue_count': 0, 'narration_count': 0,
                      'choice_count': 0, 'char_count': 0, 'est_minutes': 0},
        }

    si, ni = start_si, 0
    stagnant = 0
    steps = 0

    while steps < max_steps:
        steps += 1
        sid = int(graph['scenes'][si].scene_id)
        ni = _next_playable(graph, sid, ni, values, skipped)

        if ni >= len(graph['by_scene'].get(sid, [])):
            nxt = _first_scene(graph, si + 1, values)
            if nxt is None:
                stop_reason = 'dead_end'
                break
            si, ni = nxt, 0
            continue

        node = graph['by_scene'][sid][ni]
        cid = int(node.content_id)
        if global_visit is not None:
            global_visit.add(cid)

        item = {
            'content_id': cid,
            'scene_id': sid,
            'scene_title': _scene_title(graph, sid),
            'content_type': node.content_type,
            'text': node.content_text,
            'emotion': getattr(node, 'emotion', None),
            'character_id': int(node.character_id) if node.character_id else None,
            'character_name': graph['characters'].get(int(node.character_id), '') if node.character_id else '',
            'avatar_id': int(node.avatar_id) if node.avatar_id else None,
            'avatar_url': (graph.get('avatars', {}).get(int(node.avatar_id), {}) or {}).get('image_url', '') if node.avatar_id else '',
            'avatar_type': (graph.get('avatars', {}).get(int(node.avatar_id), {}) or {}).get('avatar_type', '') if node.avatar_id else '',
            'scene_music': _scene_music(graph, sid),
            'scene_background': _scene_background(graph, sid),
        }
        if include_directives:
            item['directives'] = graph['directives'].get(cid, [])
        route.append(item)

        next_values = dict(values)
        for name, delta in graph['effects'].get(cid, []):
            next_values[name] = _clamp(graph['var_defs'][name],
                                       next_values.get(name, graph['var_defs'][name]['initial']) + delta)
        values = next_values

        hit = [e for e in graph['endings_by_content'].get(cid, [])
               if ending_hit(e, values, graph['var_defs'])]
        if hit:
            ending = {
                'ending_id': int(hit[0].ending_id),
                'title': hit[0].title,
                'content_id': cid,
            }
            stop_reason = 'ending'
            break

        outs = graph['branches_by_source'].get(cid, [])
        if node.content_type == '选择':
            usable = [b for b in outs if eval_condition(b.conditions, values, graph['var_defs'])]
            if not usable:
                stop_reason = 'dead_end'
                break
            options = [{
                'path_id': int(b.path_id),
                'choice_text': b.choice_text or '',
                'target_content_id': int(b.target_content_id),
                'target_scene_id': (graph['position'].get(int(b.target_content_id), (None, None))[0]
                                    if int(b.target_content_id) in graph['position'] else None),
                'conditions': condition_text(b.conditions),
            } for b in usable]
            chosen = None
            if choice_picker:
                chosen = choice_picker(options, {'values': dict(values), 'node': item, 'graph': graph})
            if chosen is None and default_first_choice:
                chosen = usable[0]
            if chosen is None:
                stop_reason = 'choice_none'
                break
            if isinstance(chosen, dict):
                chosen_id = int(chosen.get('path_id'))
                target_content_id = int(chosen.get('target_content_id'))
            else:
                chosen_id = int(chosen.path_id)
                target_content_id = int(chosen.target_content_id)
            if global_pick is not None:
                global_pick[chosen_id] = global_pick.get(chosen_id, 0) + 1
            for opt in options:
                if opt['path_id'] != chosen_id:
                    ignored_options.append(dict(opt, from_content_id=cid,
                                                    from_scene_title=item['scene_title']))
            choices.append({
                'content_id': cid,
                'scene_id': sid,
                'scene_title': item['scene_title'],
                'text': _snippet(node.content_text, 50),
                'options': options,
                'chosen_path_id': chosen_id,
            })
            target = graph['position'].get(int(target_content_id))
            if not target:
                stop_reason = 'dead_end'
                break
            si, ni = target
            stagnant = 0
            continue

        # 普通节点：自动跳转边优先
        auto_edge = None
        for b in outs:
            if (b.choice_text or '').strip():
                continue
            if eval_condition(b.conditions, values, graph['var_defs']):
                auto_edge = b
                break
        if auto_edge is not None:
            target = graph['position'].get(int(auto_edge.target_content_id))
            if not target:
                stop_reason = 'dead_end'
                break
            si, ni = target
            stagnant += 1
            continue

        nxt_ni = _next_playable(graph, sid, ni + 1, values, skipped)
        if nxt_ni < len(graph['by_scene'].get(sid, [])):
            ni = nxt_ni
        else:
            nxt_si = _first_scene(graph, si + 1, values)
            if nxt_si is None:
                stop_reason = 'dead_end'
                break
            si, ni = nxt_si, 0
        stagnant += 1
        if patience and stagnant >= patience:
            dropoff = dict(item)
            stop_reason = 'dropoff'
            break

    if steps >= max_steps and stop_reason == 'no_content':
        stop_reason = 'max_steps'

    chars = sum(len(str(n.get('text') or '')) for n in route)
    return {
        'route': route,
        'choices': choices,
        'ignored_options': ignored_options,
        'ending': ending,
        'requested_ending': ({
            'ending_id': int(requested_ending.ending_id),
            'title': requested_ending.title,
        } if requested_ending else None),
        'stop_reason': stop_reason,
        'dropoff': dropoff,
        'characters': graph.get('characters', {}),
        'avatars': graph.get('avatars', {}),
        'stats': {
            'node_count': len(route),
            'dialogue_count': sum(1 for n in route if n['content_type'] == '对话'),
            'narration_count': sum(1 for n in route if n['content_type'] == '描述'),
            'choice_count': len(choices),
            'char_count': chars,
            'est_minutes': round(chars / 300, 1) if chars else 0,
        },
    }
