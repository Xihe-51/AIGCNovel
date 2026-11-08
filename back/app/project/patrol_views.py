# -*- coding: utf-8 -*-
"""自动剧情巡检：枚举所有简单路径，报告结局覆盖、死路与环。"""
from collections import Counter

from flask import jsonify

from ..models import Ending
from . import project
from .branch_service import get_story_graph
from .save_views import _owned_project
from .story_graph import (build_effective_edges, build_graph, find_start_nodes,
                         reachable_from)

MAX_PATROL_PATHS = 2000
MAX_PATHS_IN_RESPONSE = 80


def _snippet(text, size=40):
    t = (text or '').replace('\n', ' ').strip()
    return t[:size] + ('…' if len(t) > size else '')


@project.route('/story_patrol/<int:project_id>', methods=['GET'])
def story_patrol(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    ok, graph = get_story_graph(project_id, with_validation=True)
    if not ok:
        return jsonify({'success': False, 'message': graph if isinstance(graph, str) else '读取剧情图失败'}), 500

    nodes = graph.get('nodes') or []
    edges = graph.get('edges') or []
    validation = graph.get('validation') or {}
    if not nodes:
        return jsonify({
            'success': True,
            'data': {
                'summary': {
                    'node_count': 0, 'edge_count': 0, 'start_count': 0,
                    'path_count': 0, 'complete_paths': 0, 'dead_end_paths': 0,
                    'loop_paths': 0, 'unreachable_nodes': 0, 'cycle_count': 0,
                    'capped': False,
                },
                'paths': [], 'dead_ends': [], 'cycles': [],
            },
        })

    effective, _synthetic = build_effective_edges(nodes, edges, auto_sequence=True)
    node_map, adj, radj, valid_edges, dangling = build_graph(nodes, effective)
    starts = find_start_nodes(node_map, radj)

    ending_titles = {}
    for ending in Ending.query.filter_by(project_id=project_id).all():
        ending_titles.setdefault(int(ending.content_id), []).append(ending.title)

    reached_nodes = reachable_from(starts, adj)
    unreachable = [cid for cid in node_map if cid not in reached_nodes]

    path_records = []
    dead_end_counter = Counter()
    complete = 0
    dead = 0
    loops = 0
    capped = False

    for start in starts:
        stack = [(start, [start], [])]
        while stack:
            node, node_path, trans = stack.pop()
            titles = ending_titles.get(node)
            if titles:
                path_records.append((node_path, trans, 'ending', titles[0]))
                complete += 1
                continue

            outs = adj.get(node, [])
            advanced = False
            for e in outs:
                t = e.get('target_content_id')
                if t in node_path:
                    continue
                advanced = True
                stack.append((t, node_path + [t], trans + [e]))

            if advanced:
                continue

            if outs:
                path_records.append((node_path, trans, 'loop', '回到已走过的节点'))
                loops += 1
            else:
                path_records.append((node_path, trans, 'dead', '没有配置结局或后续剧情'))
                dead += 1
                dead_end_counter[node] += 1

            if len(path_records) > MAX_PATROL_PATHS:
                capped = True
                stack = []
                break
        if capped:
            break

    def build_path(record):
        node_path, trans, end_type, end_label = record
        rows = []
        for cid in node_path:
            n = node_map.get(cid) or {}
            rows.append({
                'content_id': int(cid),
                'scene_id': int(n.get('scene_id') or 0),
                'scene_title': n.get('scene_title') or '',
                'content_type': n.get('content_type') or '',
                'text': _snippet(n.get('content_text')),
            })
        transitions = []
        for e in trans:
            transitions.append({
                'from': int(e.get('source_content_id') or 0),
                'to': int(e.get('target_content_id') or 0),
                'choice_text': e.get('choice_text') or ('顺序播放' if e.get('synthetic') else '自动跳转'),
            })
        return {
            'length': len(node_path),
            'end_type': end_type,
            'end_label': end_label,
            'nodes': rows[:40],
            'transitions': transitions[:40],
            'truncated': len(rows) > 40 or len(transitions) > 40,
        }

    paths_out = [build_path(r) for r in path_records[:MAX_PATHS_IN_RESPONSE]]
    dead_ends = []
    for cid, count in dead_end_counter.most_common(20):
        n = node_map.get(cid) or {}
        dead_ends.append({
            'content_id': int(cid),
            'scene_id': int(n.get('scene_id') or 0),
            'scene_title': n.get('scene_title') or '',
            'content_type': n.get('content_type') or '',
            'text': _snippet(n.get('content_text')),
            'path_count': count,
        })

    cycles = []
    for cyc in (validation.get('cycles') or [])[:10]:
        cycles.append({
            'nodes': [
                {
                    'content_id': int(cid),
                    'scene_title': (node_map.get(cid) or {}).get('scene_title') or '',
                    'text': _snippet((node_map.get(cid) or {}).get('content_text')),
                } for cid in cyc
            ],
        })

    return jsonify({
        'success': True,
        'data': {
            'summary': {
                'node_count': len(nodes),
                'edge_count': len(valid_edges),
                'dangling_edges': len(dangling),
                'start_count': len(starts),
                'path_count': len(path_records),
                'complete_paths': complete,
                'dead_end_paths': dead,
                'loop_paths': loops,
                'unreachable_nodes': len(unreachable),
                'cycle_count': len(validation.get('cycles') or []),
                'capped': capped,
            },
            'paths': paths_out,
            'dead_ends': dead_ends,
            'cycles': cycles,
        },
    })
