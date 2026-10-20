# -*- coding=utf-8 -*-
"""
剧情图（FSM）建模与校验 —— 计划书 3.3.3「剧情链校验」。

把 `script_contents` 视为状态节点、`branch_paths` 视为状态转移边，
构建有向图并做结构校验：死循环、孤儿节点、死端、分支完整性、路径覆盖率。

### 关键设计：顺序边（auto_sequence）

`branch_paths` 只记录**玩家的选择**。视觉小说里「对话 A 之后接对话 B」这种
自然顺序播放**不会**产生 branch_paths 记录。若只按 branch_paths 建图，
纯线性剧情会退化成一堆互不相连的孤立节点，校验结果全是误报。

因此默认开启 `auto_sequence`：为**没有显式出边**的节点，按
「场景顺序 → 场景内 order_num」补一条指向下一个节点的**顺序边**，
还原真实播放流。已配置分支的节点不会被补边（分支取代了顺序流）。

这样：线性剧情 → 一条干净链路；有回跳分支 → 真实检出错环；
选择节点忘配分支 → 顺序边保证图连通，但仍单独报错。

本模块是**纯函数**实现：不依赖 Flask / SQLAlchemy / 网络，
输入普通 dict 列表，输出普通 dict，便于单测与在 Celery 中复用。
"""
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

# 节点类型常量（与 script_contents.content_type 枚举保持一致）
TYPE_DIALOGUE = '对话'
TYPE_NARRATION = '描述'
TYPE_CHOICE = '选择'

# 路径计数上限：防止分支爆炸导致内存/时间失控
MAX_PATH_COUNT = 100000


# ==================== 图构建 ====================

def build_graph(nodes: Iterable[Dict[str, Any]], edges: Iterable[Dict[str, Any]]):
    """
    由节点与边构建邻接表。

    :param nodes: 节点列表，每项至少含 content_id，可选 scene_order / order_num / content_type
    :param edges: 边列表，每项至少含 source_content_id / target_content_id，可选 path_id / choice_text
    :return: (node_map, adj, radj, valid_edges, dangling_edges)
    """
    node_map: Dict[Any, Dict[str, Any]] = {}
    for n in nodes or []:
        cid = n.get('content_id')
        if cid is None:
            continue
        node_map[cid] = n

    adj: Dict[Any, List[Dict[str, Any]]] = defaultdict(list)
    radj: Dict[Any, List[Dict[str, Any]]] = defaultdict(list)
    valid_edges: List[Dict[str, Any]] = []
    dangling_edges: List[Dict[str, Any]] = []

    for e in edges or []:
        s = e.get('source_content_id')
        t = e.get('target_content_id')
        if s not in node_map or t not in node_map:
            dangling_edges.append(e)
            continue
        valid_edges.append(e)
        adj[s].append(e)
        radj[t].append(e)

    return node_map, adj, radj, valid_edges, dangling_edges


def _sort_key(node: Dict[str, Any]) -> Tuple[int, int, int]:
    """自然播放顺序排序键：场景顺序 → 场景内序号 → content_id。"""
    return (
        int(node.get('scene_order') or 0),
        int(node.get('order_num') or 0),
        int(node.get('content_id') or 0),
    )


def build_effective_edges(nodes: List[Dict[str, Any]],
                          edges: List[Dict[str, Any]],
                          auto_sequence: bool = True) -> Tuple[List[Dict[str, Any]], int]:
    """
    生成「有效边集」：显式分支边 + （可选）合成的顺序边。

    :return: (effective_edges, synthetic_count)
    """
    if not auto_sequence:
        return list(edges or []), 0

    # 有显式出边的节点集合
    has_out = {e.get('source_content_id') for e in (edges or [])}

    ordered = sorted([n for n in nodes if n.get('content_id') is not None], key=_sort_key)

    synthetic: List[Dict[str, Any]] = []
    for i in range(len(ordered) - 1):
        cur = ordered[i]
        nxt = ordered[i + 1]
        if cur['content_id'] in has_out:
            continue  # 已有分支，顺序流被分支取代
        synthetic.append({
            'path_id': None,
            'source_content_id': cur['content_id'],
            'target_content_id': nxt['content_id'],
            'choice_text': None,
            'conditions': None,
            'synthetic': True,
        })

    return list(edges or []) + synthetic, len(synthetic)


# ==================== 结构分析 ====================

def find_start_nodes(node_map, radj) -> List[Any]:
    """
    起点 = 无入边的节点。

    真实剧情应当只有一个入口；存在多个无入边节点时由校验层给出提示，
    这里按自然顺序返回全部，调用方取第一个作为「主入口」。
    """
    starts = [cid for cid in node_map if not radj.get(cid)]
    starts.sort(key=lambda cid: _sort_key(node_map[cid]))
    return starts


def find_terminal_nodes(node_map, adj) -> List[Any]:
    """终结节点 = 无出边的节点。"""
    terms = [cid for cid in node_map if not adj.get(cid)]
    terms.sort(key=lambda cid: _sort_key(node_map[cid]))
    return terms


def detect_cycles(node_map, adj) -> List[List[Any]]:
    """DFS 三色标记法检测有向环，返回若干条环路（首尾相同）。"""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {cid: WHITE for cid in node_map}
    stack: List[Any] = []
    cycles: List[List[Any]] = []
    seen_cycles = set()

    def dfs(u):
        color[u] = GRAY
        stack.append(u)
        for e in adj.get(u, []):
            v = e.get('target_content_id')
            if v not in color:
                continue
            if color[v] == WHITE:
                dfs(v)
            elif color[v] == GRAY and v in stack:
                idx = stack.index(v)
                cyc = stack[idx:] + [v]
                key = frozenset(cyc)
                if key not in seen_cycles:
                    seen_cycles.add(key)
                    cycles.append(list(cyc))
        stack.pop()
        color[u] = BLACK

    for cid in node_map:
        if color[cid] == WHITE:
            dfs(cid)
    return cycles


def reachable_from(starts, adj) -> set:
    """从给定起点集合出发可达的全部节点（显式栈 BFS，避免深递归）。"""
    seen = set()
    stack = list(starts)
    while stack:
        u = stack.pop()
        if u in seen:
            continue
        seen.add(u)
        for e in adj.get(u, []):
            v = e.get('target_content_id')
            if v not in seen:
                stack.append(v)
    return seen


def count_paths(starts, adj, node_universe, cap: int = MAX_PATH_COUNT) -> int:
    """
    统计从起点到各终结节点的路径条数（拓扑 DP）。

    存在环时返回 -1（不可数）；超过 cap 时截断为 cap。
    """
    indeg = defaultdict(int)
    for u in node_universe:
        indeg[u] = 0
    for u, es in adj.items():
        for e in es:
            indeg[e['target_content_id']] += 1

    queue = [n for n in node_universe if indeg[n] == 0]
    order = []
    while queue:
        u = queue.pop()
        order.append(u)
        for e in adj.get(u, []):
            v = e['target_content_id']
            indeg[v] -= 1
            if indeg[v] == 0:
                queue.append(v)

    if len(order) != len(node_universe):
        return -1  # 存在环

    ways = {n: 0 for n in node_universe}
    for s in starts:
        if s in ways:
            ways[s] = 1
    for u in order:
        for e in adj.get(u, []):
            v = e['target_content_id']
            ways[v] = min(cap, ways[v] + ways[u])

    total = sum(ways.get(n, 0) for n in node_universe if not adj.get(n))
    return min(cap, total)


# ==================== 主校验入口 ====================

def validate_story_graph(nodes, edges, auto_sequence: bool = True) -> Dict[str, Any]:
    """
    对剧情图做一次完整校验。

    :param auto_sequence: 是否为无出边节点合成顺序边（推荐 True，见模块 docstring）
    :return: {
        "ok", "summary", "errors", "warnings", "info",
        "start_nodes", "terminal_nodes", "cycles", "orphans", "dead_ends",
        "graph": {"auto_sequence", "explicit_edges", "synthetic_edges"}
    }
    """
    node_list = [n for n in (nodes or []) if n.get('content_id') is not None]
    explicit_edges = list(edges or [])

    # ---- 显式边的脏数据检查（用原始边，避免被顺序边掩盖）----
    _, _, _, _, dangling = build_graph(node_list, explicit_edges)

    effective_edges, synthetic_count = build_effective_edges(node_list, explicit_edges, auto_sequence)
    node_map, adj, radj, valid_edges, _ = build_graph(node_list, effective_edges)

    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []
    info: List[Dict[str, Any]] = []

    total_nodes = len(node_map)
    graph_meta = {
        "auto_sequence": bool(auto_sequence),
        "explicit_edges": len(explicit_edges),
        "synthetic_edges": synthetic_count,
    }

    # ---- 1. 脏边 ----
    for e in dangling:
        errors.append({
            "code": "DANGLING_EDGE",
            "message": f"分支 {e.get('path_id')} 引用了已不存在的剧情节点",
            "detail": {
                "path_id": e.get('path_id'),
                "source_content_id": e.get('source_content_id'),
                "target_content_id": e.get('target_content_id'),
            },
        })

    if total_nodes == 0:
        return {
            "ok": False,
            "summary": {"nodes": 0, "edges": 0, "start": 0, "terminal": 0, "endings": 0},
            "errors": errors + [{
                "code": "EMPTY_GRAPH",
                "message": "该项目还没有任何剧情内容，无法校验",
                "detail": {},
            }],
            "warnings": warnings, "info": info,
            "start_nodes": [], "terminal_nodes": [],
            "cycles": [], "orphans": [], "dead_ends": [],
            "graph": graph_meta,
        }

    # ---- 2. 起点 ----
    starts = find_start_nodes(node_map, radj)
    primary_start = starts[0] if starts else None

    if not starts:
        errors.append({
            "code": "NO_START",
            "message": "找不到起点：所有剧情节点都有前驱，剧情图可能整体成环",
            "detail": {},
        })
    elif len(starts) > 1:
        names = [node_map[c].get('title') or f'#{c}' for c in starts[1:]]
        warnings.append({
            "code": "MULTI_START",
            "message": f"存在 {len(starts)} 个无前驱的节点，除主入口外还有：" + "、".join(names[:5]),
            "detail": {"start_nodes": starts, "primary_start": primary_start},
        })

    # ---- 3. 环路 ----
    cycles = detect_cycles(node_map, adj)
    for cyc in cycles:
        titles = [node_map[c].get('title') or f'#{c}' for c in cyc]
        errors.append({
            "code": "CYCLE",
            "message": "检测到死循环：" + " → ".join(titles),
            "detail": {"cycle": cyc},
        })

    # ---- 4. 可达性 / 孤儿 ----
    reachable = reachable_from([primary_start], adj) if primary_start is not None else set()
    orphans = [cid for cid in node_map if cid not in reachable]
    for cid in orphans:
        node = node_map[cid]
        warnings.append({
            "code": "ORPHAN",
            "message": f"孤儿节点「{node.get('title') or '#' + str(cid)}」从主入口不可达",
            "detail": {"content_id": cid, "scene_id": node.get('scene_id')},
        })

    # ---- 5. 终结节点 / 死端 ----
    terminals = find_terminal_nodes(node_map, adj)
    endings = [cid for cid in terminals if cid in reachable]
    dead_ends: List[Any] = []

    for cid in terminals:
        node = node_map[cid]
        if node.get('content_type') == TYPE_CHOICE:
            dead_ends.append(cid)
            errors.append({
                "code": "DEAD_END_CHOICE",
                "message": f"「选择」节点「{node.get('title') or '#' + str(cid)}」没有任何出口分支",
                "detail": {"content_id": cid},
            })

    if not endings and total_nodes > 0:
        warnings.append({
            "code": "NO_ENDING",
            "message": "没有任何可达的结局节点，剧情可能无法收束",
            "detail": {},
        })

    # ---- 6. 分支完整性（只看显式边，合成边不参与）----
    pair_seen: Dict[Tuple[Any, Any], Dict[str, Any]] = {}
    for e in explicit_edges:
        s, t = e.get('source_content_id'), e.get('target_content_id')
        if s not in node_map or t not in node_map:
            continue  # 脏边已单独报过
        if (s, t) in pair_seen:
            warnings.append({
                "code": "DUPLICATE_EDGE",
                "message": f"重复分支：{s} → {t} 存在多条",
                "detail": {"path_ids": [pair_seen[(s, t)].get('path_id'), e.get('path_id')]},
            })
        else:
            pair_seen[(s, t)] = e

        if not (e.get('choice_text') or '').strip():
            warnings.append({
                "code": "EMPTY_CHOICE_TEXT",
                "message": f"分支 {s} → {t} 缺少选项文案，玩家将看不到该选项",
                "detail": {"path_id": e.get('path_id'), "source_content_id": s},
            })

    # 显式出边数量（用于判断真分叉）
    explicit_out = defaultdict(int)
    for e in explicit_edges:
        if e.get('source_content_id') in node_map and e.get('target_content_id') in node_map:
            explicit_out[e['source_content_id']] += 1

    for cid, node in node_map.items():
        title = node.get('title') or f'#{cid}'
        n_out = explicit_out.get(cid, 0)

        # 6.1 「选择」节点没有配置任何分支
        #     注意：合成顺序边会让它在图上「有出口」，从而掩盖死端，
        #     所以这里必须按**显式边**单独判，否则这类最常见的漏配会被漏掉。
        if node.get('content_type') == TYPE_CHOICE and n_out == 0:
            errors.append({
                "code": "CHOICE_WITHOUT_BRANCH",
                "message": f"「选择」节点「{title}」没有配置任何分支，玩家将无路可走",
                "detail": {"content_id": cid},
            })
        # 6.2 真分叉（≥2 出口）却不是「选择」类型
        if n_out >= 2 and node.get('content_type') != TYPE_CHOICE:
            warnings.append({
                "code": "IMPLICIT_BRANCH",
                "message": f"节点「{title}」有 {n_out} 条分支，但类型是「{node.get('content_type')}」而非「选择」",
                "detail": {"content_id": cid},
            })
        # 6.3 「选择」类型只有 1 个选项
        if node.get('content_type') == TYPE_CHOICE and n_out == 1:
            warnings.append({
                "code": "SINGLE_CHOICE",
                "message": f"「选择」节点「{title}」只有 1 个选项，玩家无选择余地",
                "detail": {"content_id": cid},
            })

    # ---- 7. 路径覆盖率 ----
    path_count = count_paths([primary_start] if primary_start is not None else [],
                             adj, set(node_map))
    if cycles:
        path_count = -1

    summary = {
        "nodes": total_nodes,
        "edges": len(explicit_edges),
        "start": len(starts),
        "terminal": len(terminals),
        "endings": len(endings),
        "orphans": len(orphans),
        "cycles": len(cycles),
        "path_count": path_count,
        "reachable_nodes": len(reachable),
        "coverage": round(len(reachable) / total_nodes, 4) if total_nodes else 0.0,
    }

    if not errors:
        info.append({
            "code": "OK",
            "message": (f"剧情图结构正常：{total_nodes} 个节点 / {len(explicit_edges)} 条分支 / "
                        f"{len(endings)} 个可达结局"),
            "detail": {},
        })

    return {
        "ok": len(errors) == 0,
        "summary": summary,
        "errors": errors,
        "warnings": warnings,
        "info": info,
        "start_nodes": starts,
        "primary_start": primary_start,
        "terminal_nodes": terminals,
        "cycles": cycles,
        "orphans": orphans,
        "dead_ends": dead_ends,
        "graph": graph_meta,
    }
