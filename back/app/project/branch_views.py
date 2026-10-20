# -*- coding=utf-8 -*-
"""
剧情分支（branch_paths）与剧情图校验的 HTTP 视图。

补齐计划书 3.3.3 指出的最大功能缺口：branch_paths 表此前只有模型定义、没有任何 API。

路由一览（蓝图 url_prefix = /project）：
  GET    /project/branches/<project_id>            列出项目全部分支
  POST   /project/branches/<project_id>            新建分支
  POST   /project/branches/<project_id>/batch      批量覆盖写入（剧情树整树保存）
  PUT    /project/branches/detail/<path_id>        更新分支
  DELETE /project/branches/detail/<path_id>        删除分支
  GET    /project/story_graph/<project_id>         剧情拓扑 + FSM 校验结果
  POST   /project/story_graph/<project_id>/validate  只做 FSM 校验
"""
from flask import jsonify, request

from . import project
from .branch_service import (
    batch_replace_branches,
    create_branch,
    delete_branch,
    get_story_graph,
    list_branches,
    update_branch,
    validate_project_story,
)

'''
    7.剧情分支（branch_paths）
'''


@project.route('/branches/<int:project_id>', methods=['GET'])
def get_branches(project_id):
    """列出项目全部分支。"""
    ok, result = list_branches(project_id)
    if not ok:
        return jsonify({'success': False, 'message': result}), 404
    return jsonify({'success': True, 'data': result, 'count': len(result)})


@project.route('/branches/<int:project_id>', methods=['POST'])
def add_branch(project_id):
    """新建一条分支。"""
    data = request.get_json(silent=True) or {}
    ok, result = create_branch(project_id, data)
    if not ok:
        return jsonify({'success': False, 'message': result}), 400
    return jsonify({'success': True, 'data': result, 'message': '分支已创建'})


@project.route('/branches/<int:project_id>/batch', methods=['POST'])
def batch_branches(project_id):
    """
    批量写入分支（剧情树编辑器整树保存）。

    body: { "branches": [ {source_content_id, target_content_id, choice_text, conditions}, ... ],
            "replace": true }
    """
    data = request.get_json(silent=True) or {}
    branches = data.get('branches')
    if not isinstance(branches, list):
        return jsonify({'success': False, 'message': 'branches 必须是数组'}), 400
    replace = bool(data.get('replace', True))
    ok, result = batch_replace_branches(project_id, branches, replace=replace)
    if not ok:
        return jsonify({'success': False, 'message': result}), 400
    return jsonify({'success': True, 'data': result, 'message': '分支已保存'})


@project.route('/branches/detail/<int:path_id>', methods=['PUT'])
def modify_branch(path_id):
    """更新分支（可改起止节点、选项文案、条件）。"""
    data = request.get_json(silent=True) or {}
    ok, result = update_branch(path_id, data)
    if not ok:
        return jsonify({'success': False, 'message': result}), 400
    return jsonify({'success': True, 'data': result, 'message': '分支已更新'})


@project.route('/branches/detail/<int:path_id>', methods=['DELETE'])
def remove_branch(path_id):
    """删除分支。"""
    ok, result = delete_branch(path_id)
    if not ok:
        return jsonify({'success': False, 'message': result}), 404
    return jsonify({'success': True, 'data': result, 'message': '分支已删除'})


'''
    8.剧情图与 FSM 校验
'''


@project.route('/story_graph/<int:project_id>', methods=['GET'])
def story_graph(project_id):
    """
    返回剧情拓扑（nodes/edges）+ FSM 校验结果。

    前端「可视化剧情树」改读本接口，即可拿到真实分支拓扑，
    不再依赖「标题里含『分支』」这类关键词猜测。
    """
    with_validation = request.args.get('validate', '1') not in ('0', 'false', 'False')
    ok, result = get_story_graph(project_id, with_validation=with_validation)
    if not ok:
        return jsonify({'success': False, 'message': result}), 404
    return jsonify({'success': True, 'data': result})


@project.route('/story_graph/<int:project_id>/validate', methods=['POST'])
def validate_story(project_id):
    """只做 FSM 校验：环路 / 孤儿 / 死端 / 路径覆盖率。"""
    ok, result = validate_project_story(project_id)
    if not ok:
        return jsonify({'success': False, 'message': result}), 404
    return jsonify({'success': True, 'data': result})
