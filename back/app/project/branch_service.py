# -*- coding=utf-8 -*-
"""
branch_paths（剧情分支）业务层 —— 计划书 3.3.3 的「最大功能缺口」补齐。

职责：
  - branch_paths 的 CRUD（原系统只有模型定义，零 API）
  - 剧情图（story graph）组装：把 script_contents + branch_paths 转成前端可渲染的
    nodes/edges 拓扑（替代前端「按标题关键词猜分支」的旧实现）
  - 调用 story_graph.validate_story_graph 做 FSM 结构校验

返回值统一沿用 project 模块约定：Tuple[bool, Any]
"""
from typing import Any, Dict, List, Optional, Tuple

from .. import db
from ..models import BranchPath, Project, Scene, ScriptContent, ProjectVariable
from .story_graph import validate_story_graph


# ==================== 序列化 ====================

def _branch_to_dict(bp: BranchPath) -> Dict[str, Any]:
    return {
        'path_id': bp.path_id,
        'project_id': bp.project_id,
        'source_content_id': bp.source_content_id,
        'target_content_id': bp.target_content_id,
        'choice_text': bp.choice_text,
        'conditions': bp.conditions,
    }


def _snippet(text: Optional[str], n: int = 16) -> str:
    text = (text or '').strip().replace('\n', ' ')
    return text if len(text) <= n else text[:n] + '…'


# ==================== 校验辅助 ====================

def _content_ids_of_project(project_id: int) -> set:
    rows = db.session.query(ScriptContent.content_id).filter_by(project_id=project_id).all()
    return {r[0] for r in rows}


def _validate_edge(project_id: int, source_id, target_id, valid_ids: Optional[set] = None) -> Optional[str]:
    """校验一条分支的起止节点合法性，返回错误信息（None 表示通过）。"""
    if source_id is None or target_id is None:
        return 'source_content_id 与 target_content_id 不能为空'
    if source_id == target_id:
        return '分支的起点与终点不能相同（会形成自环）'
    if valid_ids is None:
        valid_ids = _content_ids_of_project(project_id)
    if source_id not in valid_ids:
        return f'起点剧情 {source_id} 不属于项目 {project_id}'
    if target_id not in valid_ids:
        return f'终点剧情 {target_id} 不属于项目 {project_id}'
    return None


CONDITION_OPS = ('>', '>=', '<', '<=', '==', '!=')


def _normalize_conditions(project_id: int, conditions) -> Tuple[Optional[dict], Optional[str]]:
    """
    条件格式：{ "variable": "affection_lin", "op": ">=", "value": 50 }
    空值表示无条件。返回 (normalized, error)。
    """
    if conditions in (None, {}, ''):
        return None, None
    if not isinstance(conditions, dict):
        return None, '条件必须是对象'

    variable = str(conditions.get('variable') or '').strip()
    op = str(conditions.get('op') or '').strip()
    if not variable:
        return None, '条件缺少变量名'
    if op not in CONDITION_OPS:
        return None, f'不支持的条件运算符：{op}'
    if 'value' not in conditions:
        return None, '条件缺少比较值'
    try:
        value = int(conditions.get('value'))
    except (TypeError, ValueError):
        return None, '条件比较值必须是整数'

    exists = ProjectVariable.query.filter_by(project_id=project_id, name=variable).first()
    if not exists:
        return None, f'变量 {variable} 不属于项目 {project_id}'

    return {'variable': variable, 'op': op, 'value': value}, None


# ==================== CRUD ====================

def list_branches(project_id: int) -> Tuple[bool, Any]:
    if not Project.query.get(project_id):
        return False, '项目不存在'
    rows = (BranchPath.query
            .filter_by(project_id=project_id)
            .order_by(BranchPath.path_id.asc())
            .all())
    return True, [_branch_to_dict(b) for b in rows]


def create_branch(project_id: int, data: Dict[str, Any]) -> Tuple[bool, Any]:
    if not Project.query.get(project_id):
        return False, '项目不存在'

    source_id = data.get('source_content_id')
    target_id = data.get('target_content_id')
    err = _validate_edge(project_id, source_id, target_id)
    if err:
        return False, err

    conditions, cerr = _normalize_conditions(project_id, data.get('conditions'))
    if cerr:
        return False, cerr

    # 幂等：同一对起止已存在则直接返回（避免前端重复保存产生脏边）
    existed = (BranchPath.query
               .filter_by(project_id=project_id,
                          source_content_id=source_id,
                          target_content_id=target_id)
               .first())
    if existed:
        if 'choice_text' in data:
            existed.choice_text = data.get('choice_text')
        if 'conditions' in data:
            existed.conditions = conditions
        db.session.commit()
        return True, _branch_to_dict(existed)

    bp = BranchPath(
        project_id=project_id,
        source_content_id=source_id,
        target_content_id=target_id,
        choice_text=data.get('choice_text'),
        conditions=conditions,
    )
    db.session.add(bp)
    db.session.commit()
    return True, _branch_to_dict(bp)


def update_branch(path_id: int, data: Dict[str, Any]) -> Tuple[bool, Any]:
    bp = BranchPath.query.get(path_id)
    if not bp:
        return False, '分支不存在'

    source_id = data.get('source_content_id', bp.source_content_id)
    target_id = data.get('target_content_id', bp.target_content_id)
    err = _validate_edge(bp.project_id, source_id, target_id)
    if err:
        return False, err

    conditions = bp.conditions
    if 'conditions' in data:
        conditions, cerr = _normalize_conditions(bp.project_id, data.get('conditions'))
        if cerr:
            return False, cerr

    bp.source_content_id = source_id
    bp.target_content_id = target_id
    if 'choice_text' in data:
        bp.choice_text = data.get('choice_text')
    if 'conditions' in data:
        bp.conditions = conditions
    db.session.commit()
    return True, _branch_to_dict(bp)


def delete_branch(path_id: int) -> Tuple[bool, Any]:
    bp = BranchPath.query.get(path_id)
    if not bp:
        return False, '分支不存在'
    db.session.delete(bp)
    db.session.commit()
    return True, {'path_id': path_id}


def batch_replace_branches(project_id: int, branches: List[Dict[str, Any]],
                           replace: bool = True) -> Tuple[bool, Any]:
    """
    批量写入分支。剧情树编辑器一次提交整棵树时用。

    :param replace: True=先清空该项目已有分支再写入（整树覆盖）；
                    False=仅增量新增（已存在的跳过）
    """
    if not Project.query.get(project_id):
        return False, '项目不存在'

    valid_ids = _content_ids_of_project(project_id)

    # 先全量校验，避免写一半失败留下脏数据
    prepared: List[Dict[str, Any]] = []
    seen_pairs = set()
    for i, item in enumerate(branches or []):
        s = item.get('source_content_id')
        t = item.get('target_content_id')
        err = _validate_edge(project_id, s, t, valid_ids)
        if err:
            return False, f'第 {i + 1} 条分支不合法：{err}'
        conditions, cerr = _normalize_conditions(project_id, item.get('conditions'))
        if cerr:
            return False, f'第 {i + 1} 条分支条件不合法：{cerr}'
        pair = (s, t)
        if pair in seen_pairs:
            return False, f'第 {i + 1} 条分支与前面重复：{s} → {t}'
        seen_pairs.add(pair)
        prepared.append({
            'source_content_id': s,
            'target_content_id': t,
            'choice_text': item.get('choice_text'),
            'conditions': conditions,
        })

    try:
        if replace:
            BranchPath.query.filter_by(project_id=project_id).delete()

        existing_pairs = set()
        if not replace:
            for b in BranchPath.query.filter_by(project_id=project_id).all():
                existing_pairs.add((b.source_content_id, b.target_content_id))

        created = 0
        for item in prepared:
            if (item['source_content_id'], item['target_content_id']) in existing_pairs:
                continue
            db.session.add(BranchPath(project_id=project_id, **item))
            created += 1
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return False, f'批量写入失败：{e}'

    return True, {
        'project_id': project_id,
        'replaced': replace,
        'submitted': len(prepared),
        'created': created,
    }


# ==================== 剧情图组装 ====================

def get_story_graph(project_id: int, with_validation: bool = True) -> Tuple[bool, Any]:
    """
    组装剧情图：nodes（剧情节点）+ edges（分支）+ validation（FSM 校验结果）。

    前端「可视化剧情树」应改读本接口，而不是按场景标题关键词猜类型。
    """
    if not Project.query.get(project_id):
        return False, '项目不存在'

    scenes = Scene.query.filter_by(project_id=project_id).all()
    scene_titles = {s.scene_id: s.title for s in scenes}
    scene_orders = {s.scene_id: (s.order_num or 0) for s in scenes}

    contents = (ScriptContent.query
                .filter_by(project_id=project_id)
                .order_by(ScriptContent.scene_id.asc(), ScriptContent.order_num.asc())
                .all())

    nodes: List[Dict[str, Any]] = []
    for c in contents:
        scene_title = scene_titles.get(c.scene_id) or f'场景{c.scene_id}'
        label = f'{scene_title} · {_snippet(c.content_text)}' if c.content_text else scene_title
        nodes.append({
            'content_id': c.content_id,
            'scene_id': c.scene_id,
            'scene_title': scene_title,
            'scene_order': scene_orders.get(c.scene_id, 0),   # 合成顺序边时需要
            'title': label,                      # story_graph 校验时用作可读标题
            'content_type': c.content_type,
            'content_text': c.content_text,
            'character_id': c.character_id,
            'avatar_id': c.avatar_id,
            'voice_url': c.voice_url,
            'branch_condition': c.branch_condition,
            'order_num': c.order_num,
        })

    branches = (BranchPath.query
                .filter_by(project_id=project_id)
                .order_by(BranchPath.path_id.asc())
                .all())
    edges: List[Dict[str, Any]] = []
    for b in branches:
        edges.append({
            'path_id': b.path_id,
            'source_content_id': b.source_content_id,
            'target_content_id': b.target_content_id,
            'choice_text': b.choice_text,
            'conditions': b.conditions,
        })

    result: Dict[str, Any] = {
        'project_id': project_id,
        'nodes': nodes,
        'edges': edges,
        'stats': {
            'node_count': len(nodes),
            'edge_count': len(edges),
            'scene_count': len(scenes),
        },
    }
    if with_validation:
        result['validation'] = validate_story_graph(nodes, edges)
    return True, result


def validate_project_story(project_id: int) -> Tuple[bool, Any]:
    """只做校验，不返回完整拓扑（供「一键检查剧情」按钮调用）。"""
    ok, data = get_story_graph(project_id, with_validation=False)
    if not ok:
        return False, data
    report = validate_story_graph(data['nodes'], data['edges'])
    report['project_id'] = project_id
    return True, report
