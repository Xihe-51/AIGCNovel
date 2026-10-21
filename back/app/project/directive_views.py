# -*- coding: utf-8 -*-
"""
节点演出指令。

content_directives：播放到某条 script_content 时执行的舞台动作。
与 content_effects（数值变化）并列，互不影响。

支持的 directive_type：
  avatar     立绘显示/隐藏/换位/换表情
  background 背景切换
  music      背景音乐播放/停止
  sound      音效
  wait       停顿
"""
from flask import jsonify, request

from .. import db
from ..models import ContentDirective, ProjectVariable, ScriptContent
from . import project
from .save_views import _owned_project

DIRECTIVE_TYPES = {'avatar', 'background', 'music', 'sound', 'wait'}
MAX_DIRECTIVES_PER_NODE = 32


def _dir_to_dict(row):
    return {
        'directive_id': row.directive_id,
        'project_id': row.project_id,
        'content_id': row.content_id,
        'directive_type': row.directive_type,
        'payload': row.payload or {},
        'order_num': row.order_num,
    }


def _owned_content(project_id, content_id):
    """校验节点属于该项目，返回 (content, err)。"""
    content = db.session.get(ScriptContent, int(content_id))
    if not content or int(content.project_id) != int(project_id):
        return None, (jsonify({'success': False, 'message': '剧情节点不存在或不属于该项目'}), 404)
    return content, None


@project.route('/directives/<int:project_id>', methods=['GET'])
def list_directives(project_id):
    """返回项目下所有演出指令，前端按 content_id 自行分组。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    rows = (ContentDirective.query
            .filter_by(project_id=project_id)
            .order_by(ContentDirective.content_id.asc(),
                      ContentDirective.order_num.asc(),
                      ContentDirective.directive_id.asc())
            .all())
    return jsonify({'success': True, 'data': [_dir_to_dict(r) for r in rows]})


@project.route('/directives/<int:project_id>/<int:content_id>', methods=['GET'])
def list_directives_of_node(project_id, content_id):
    _, err = _owned_project(project_id)
    if err:
        return err
    _, err = _owned_content(project_id, content_id)
    if err:
        return err

    rows = (ContentDirective.query
            .filter_by(project_id=project_id, content_id=content_id)
            .order_by(ContentDirective.order_num.asc(),
                      ContentDirective.directive_id.asc())
            .all())
    return jsonify({'success': True, 'data': [_dir_to_dict(r) for r in rows]})


@project.route('/directives/<int:project_id>', methods=['POST'])
def create_directive(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    content_id = data.get('content_id')
    directive_type = str(data.get('directive_type') or '').strip()
    payload = data.get('payload') or {}

    if directive_type not in DIRECTIVE_TYPES:
        return jsonify({
            'success': False,
            'message': f'不支持的指令类型，可选：{"、".join(sorted(DIRECTIVE_TYPES))}'
        }), 400
    if not isinstance(payload, dict):
        return jsonify({'success': False, 'message': 'payload 必须是对象'}), 400
    if content_id is None:
        return jsonify({'success': False, 'message': '缺少 content_id'}), 400

    _, err = _owned_content(project_id, content_id)
    if err:
        return err

    count = ContentDirective.query.filter_by(
        project_id=project_id, content_id=int(content_id)).count()
    if count >= MAX_DIRECTIVES_PER_NODE:
        return jsonify({
            'success': False,
            'message': f'单个节点最多 {MAX_DIRECTIVES_PER_NODE} 条演出指令'
        }), 400

    row = ContentDirective(
        project_id=project_id,
        content_id=int(content_id),
        directive_type=directive_type,
        payload=payload,
        order_num=int(data.get('order_num') or count),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'success': True, 'data': _dir_to_dict(row)}), 201


@project.route('/directives/<int:project_id>/<int:directive_id>', methods=['PUT'])
def update_directive(project_id, directive_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    row = db.session.get(ContentDirective, directive_id)
    if not row or int(row.project_id) != int(project_id):
        return jsonify({'success': False, 'message': '指令不存在'}), 404

    data = request.get_json(silent=True) or {}
    if 'payload' in data:
        if not isinstance(data['payload'], dict):
            return jsonify({'success': False, 'message': 'payload 必须是对象'}), 400
        row.payload = data['payload']
    if 'order_num' in data:
        row.order_num = int(data['order_num'])
    if 'directive_type' in data:
        dt = str(data['directive_type']).strip()
        if dt not in DIRECTIVE_TYPES:
            return jsonify({'success': False, 'message': '不支持的指令类型'}), 400
        row.directive_type = dt

    db.session.commit()
    return jsonify({'success': True, 'data': _dir_to_dict(row)})


@project.route('/directives/<int:project_id>/<int:directive_id>', methods=['DELETE'])
def delete_directive(project_id, directive_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    row = db.session.get(ContentDirective, directive_id)
    if not row or int(row.project_id) != int(project_id):
        return jsonify({'success': False, 'message': '指令不存在'}), 404

    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True})
