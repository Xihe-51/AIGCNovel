# -*- coding: utf-8 -*-
"""规则版合成读者：用不同玩家画像各走一条代表性路线。

不依赖 LLM，输出可执行问题清单：
- 速通党：优先最短路线
- 全收集党：优先还没被选过的选项
- 恋爱线读者：优先好感/角色互动选项
- 低耐心读者：连续 N 句没有选择就判定流失
"""
from flask import jsonify, request

from . import project
from .save_views import _owned_project
from .story_path import (condition_text, ending_distances, impossible_condition,
                         load_graph, walk_route, _snippet)

ROMANCE_KEYWORDS = ('好感', '喜欢', '爱', '心动', '约会', '拥抱', '亲吻', '告白',
                    '陪', '信任', '温柔', '脸红', '牵手')


def _target_text(graph, content_id):
    pos = graph['position'].get(int(content_id))
    if not pos:
        return ''
    si, ni = pos
    lst = graph['by_scene'].get(int(graph['scenes'][si].scene_id), [])
    return lst[ni].content_text if ni < len(lst) else ''


def _make_speedrun_picker(dist):
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


def _make_completionist_picker(pick_counts):
    def pick(options, _ctx):
        return min(options, key=lambda opt: pick_counts.get(int(opt['path_id']), 0))
    return pick


def _make_romance_picker(graph):
    def pick(options, ctx):
        def score(opt):
            text = (opt.get('choice_text') or '') + _target_text(graph, opt['target_content_id'])
            hits = sum(1 for k in ROMANCE_KEYWORDS if k in text)
            return -hits
        best_score = min(score(o) for o in options)
        for opt in options:
            if score(opt) == best_score:
                return opt
        return options[0]
    return pick


def _make_first_picker():
    def pick(options, _ctx):
        return options[0]
    return pick


def _run_persona(graph, key, name, desc, picker, patience=0,
                 global_visit=None, global_pick=None):
    result = walk_route(
        graph,
        choice_picker=picker,
        patience=patience,
        global_visit=global_visit,
        global_pick=global_pick,
        default_first_choice=True,
    )
    route = [{
        'content_id': n['content_id'],
        'scene_id': n['scene_id'],
        'scene_title': n['scene_title'],
        'content_type': n['content_type'],
        'character_name': n['character_name'],
        'text': _snippet(n['text'], 100),
    } for n in result['route'][:80]]
    return {
        'key': key,
        'name': name,
        'description': desc,
        'route': route,
        'route_truncated': len(result['route']) > 80,
        'choices': result['choices'][:30],
        'ignored_options': result['ignored_options'][:30],
        'ending': result['ending'],
        'stop_reason': result['stop_reason'],
        'dropoff': ({
            'content_id': result['dropoff']['content_id'],
            'scene_id': result['dropoff']['scene_id'],
            'scene_title': result['dropoff']['scene_title'],
            'text': _snippet(result['dropoff']['text'], 60),
        } if result['dropoff'] else None),
        'stats': result['stats'],
    }


@project.route('/synthetic_readers/<int:project_id>', methods=['GET'])
def synthetic_readers(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    patience = request.args.get('patience', type=int) or 10
    patience = max(3, min(50, patience))
    graph = load_graph(project_id)
    if not graph['contents']:
        return jsonify({'success': False, 'message': '项目还没有剧本内容'}), 400

    dist = ending_distances(graph)
    shared_visit = set()
    shared_pick = {}

    readers = [
        _run_persona(
            graph, 'speedrun', '速通党', '总选离结局最近的路线，不看支线',
            _make_speedrun_picker(dist), global_visit=shared_visit, global_pick=shared_pick,
        ),
        _run_persona(
            graph, 'completionist', '全收集党', '优先选还没被其他读者选过的选项',
            _make_completionist_picker(shared_pick), global_visit=shared_visit, global_pick=shared_pick,
        ),
        _run_persona(
            graph, 'romance', '恋爱线读者', '优先好感、约会、告白等角色互动选项',
            _make_romance_picker(graph), global_visit=shared_visit, global_pick=shared_pick,
        ),
        _run_persona(
            graph, 'low_patience', '低耐心读者',
            f'连续 {patience} 句没有选择就判定流失，遇到选项立刻选',
            _make_first_picker(), patience=patience,
            global_visit=shared_visit, global_pick=shared_pick,
        ),
    ]

    # 冷落选项：所有带文案的选项里，4 个画像一次都没选过的
    ignored = []
    for cid, branches in graph['branches_by_source'].items():
        for b in branches:
            if not (b.choice_text or '').strip():
                continue
            if shared_pick.get(int(b.path_id), 0) > 0:
                continue
            pos = graph['position'].get(int(cid))
            ignored.append({
                'path_id': int(b.path_id),
                'content_id': int(cid),
                'scene_id': int(graph['scenes'][pos[0]].scene_id) if pos else None,
                'scene_title': graph['scenes'][pos[0]].title if pos else '',
                'choice_text': b.choice_text,
                'conditions': condition_text(b.conditions),
                'source_text': _snippet(_target_text(graph, cid), 50),
            })

    # 明显永假的条件（变量范围外的条件）
    impossible = []
    for cid, branches in graph['branches_by_source'].items():
        for b in branches:
            if not b.conditions:
                continue
            if not impossible_condition(b.conditions, graph['var_defs']):
                continue
            pos = graph['position'].get(int(cid))
            impossible.append({
                'path_id': int(b.path_id),
                'content_id': int(cid),
                'scene_id': int(graph['scenes'][pos[0]].scene_id) if pos else None,
                'scene_title': graph['scenes'][pos[0]].title if pos else '',
                'choice_text': b.choice_text or '（自动跳转）',
                'conditions': condition_text(b.conditions),
            })

    endings_seen = {}
    for reader in readers:
        if reader['ending']:
            endings_seen.setdefault(int(reader['ending']['ending_id']), reader['ending']['title'])

    return jsonify({
        'success': True,
        'data': {
            'readers': readers,
            'aggregate': {
                'reader_count': len(readers),
                'choice_total': sum(len(r['choices']) for r in readers),
                'ignored_option_count': len(ignored),
                'ignored_options': ignored[:40],
                'impossible_choice_count': len(impossible),
                'impossible_choices': impossible[:40],
                'endings_seen': list(endings_seen.values()),
                'patience': patience,
            },
        },
    })
