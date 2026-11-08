# -*- coding: utf-8 -*-
"""全项目搜索与替换：对话/旁白文本、角色名、场景名、选项文案。"""
import re

from flask import jsonify, request
from sqlalchemy import or_

from .. import db
from ..models import BranchPath, Character, Scene, ScriptContent
from . import project
from .save_views import _owned_project

MAX_TEXT_RESULTS = 60
MAX_SCENE_RESULTS = 20
MAX_CHOICE_RESULTS = 30


def _snippet(text, keyword, width=36):
    """截取关键词附近的一小段，便于前端展示。"""
    source = (text or '').replace('\n', ' ').strip()
    if not source:
        return ''
    pos = source.lower().find(keyword.lower())
    if pos < 0:
        return source[:width * 2]
    start = max(0, pos - width)
    end = min(len(source), pos + len(keyword) + width)
    prefix = '…' if start > 0 else ''
    suffix = '…' if end < len(source) else ''
    return f'{prefix}{source[start:end]}{suffix}'


@project.route('/search/<int:project_id>', methods=['GET'])
def search_project(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    keyword = (request.args.get('q') or '').strip()
    if not keyword:
        return jsonify({'success': True, 'data': {'query': '', 'total': 0, 'items': []}})

    like = f'%{keyword}%'
    items = []
    seen_content = set()

    # 1) 剧情文本 / 角色名命中
    rows = (db.session.query(ScriptContent, Scene, Character)
            .join(Scene, ScriptContent.scene_id == Scene.scene_id)
            .outerjoin(Character, ScriptContent.character_id == Character.character_id)
            .filter(ScriptContent.project_id == project_id)
            .filter(or_(
                ScriptContent.content_text.like(like),
                Character.name.like(like),
            ))
            .order_by(Scene.order_num.asc(), ScriptContent.order_num.asc())
            .limit(MAX_TEXT_RESULTS)
            .all())

    for content, scene, char in rows:
        seen_content.add(content.content_id)
        items.append({
            'result_type': 'content',
            'scene_id': scene.scene_id,
            'scene_title': scene.title,
            'scene_order': scene.order_num,
            'content_id': content.content_id,
            'content_type': content.content_type,
            'order_num': content.order_num,
            'character_name': char.name if char else '',
            'text': _snippet(content.content_text, keyword),
        })

    # 2) 场景名命中（只定位场景，不展开整场对话）
    scene_rows = (Scene.query
                  .filter(Scene.project_id == project_id, Scene.title.like(like))
                  .order_by(Scene.order_num.asc())
                  .limit(MAX_SCENE_RESULTS)
                  .all())
    for scene in scene_rows:
        items.append({
            'result_type': 'scene',
            'scene_id': scene.scene_id,
            'scene_title': scene.title,
            'scene_order': scene.order_num,
            'content_id': None,
            'content_type': '',
            'order_num': None,
            'character_name': '',
            'text': scene.description or '',
        })

    # 3) 选项文案命中：定位到该选项所属的选择节点
    choice_rows = (BranchPath.query
                   .filter(BranchPath.project_id == project_id,
                           BranchPath.choice_text.like(like))
                   .limit(MAX_CHOICE_RESULTS)
                   .all())
    for branch in choice_rows:
        if branch.source_content_id in seen_content:
            continue
        content = db.session.get(ScriptContent, branch.source_content_id)
        if not content:
            continue
        scene = db.session.get(Scene, content.scene_id)
        char = db.session.get(Character, content.character_id) if content.character_id else None
        seen_content.add(content.content_id)
        items.append({
            'result_type': 'choice',
            'scene_id': scene.scene_id if scene else content.scene_id,
            'scene_title': scene.title if scene else '',
            'scene_order': scene.order_num if scene else 0,
            'content_id': content.content_id,
            'content_type': content.content_type,
            'order_num': content.order_num,
            'character_name': char.name if char else '',
            'text': f'选项：{branch.choice_text}',
        })

    return jsonify({
        'success': True,
        'data': {
            'query': keyword,
            'total': len(items),
            'items': items,
        },
    })


def _replace_occurrences(text, query, replacement):
    """按关键词替换文本，返回 (新文本, 替换次数)；英文不区分大小写。"""
    if not text:
        return text, 0
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    return pattern.subn(lambda _m: replacement, text)


@project.route('/search/<int:project_id>/replace', methods=['POST'])
def replace_project_text(project_id):
    """全项目批量替换：台词/旁白/选项文案/场景名与描述。

    dry_run=true 时只统计命中数量，不写库，供前端二次确认。
    """
    row, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    query = str(data.get('query') or '').strip()
    replacement = str(data.get('replacement') or '')
    dry_run = bool(data.get('dry_run'))

    if not query:
        return jsonify({'success': False, 'message': '请填写要查找的内容'}), 400
    if len(query) > 200:
        return jsonify({'success': False, 'message': '查找内容过长（最多 200 字）'}), 400

    like = f'%{query}%'
    contents = (ScriptContent.query
                .filter_by(project_id=project_id)
                .filter(ScriptContent.content_text.like(like))
                .all())
    branches = (BranchPath.query
                .filter_by(project_id=project_id)
                .filter(BranchPath.choice_text.like(like))
                .all())
    scenes = (Scene.query
              .filter_by(project_id=project_id)
              .filter(or_(Scene.title.like(like), Scene.description.like(like)))
              .all())

    # 精确统计替换位置数（不受搜索接口的结果上限影响）
    occurrences = 0
    content_hits = 0
    for c in contents:
        _, n = _replace_occurrences(c.content_text, query, replacement)
        occurrences += n
        if n:
            content_hits += 1
    choice_hits = 0
    for b in branches:
        _, n = _replace_occurrences(b.choice_text, query, replacement)
        occurrences += n
        if n:
            choice_hits += 1
    scene_hits = 0
    for s in scenes:
        _, n1 = _replace_occurrences(s.title, query, replacement)
        _, n2 = _replace_occurrences(s.description, query, replacement)
        occurrences += n1 + n2
        if n1 or n2:
            scene_hits += 1

    result = {
        'query': query,
        'replacement': replacement,
        'contents': content_hits,
        'choices': choice_hits,
        'scenes': scene_hits,
        'occurrences': occurrences,
    }
    if dry_run:
        return jsonify({'success': True, 'data': result})

    if not occurrences:
        return jsonify({'success': True, 'data': result, 'message': '没有找到可替换的内容'})

    for c in contents:
        new_text, n = _replace_occurrences(c.content_text, query, replacement)
        if n:
            c.content_text = new_text
    for b in branches:
        new_text, n = _replace_occurrences(b.choice_text, query, replacement)
        if n:
            b.choice_text = new_text
    for s in scenes:
        new_title, n1 = _replace_occurrences(s.title, query, replacement)
        new_desc, n2 = _replace_occurrences(s.description, query, replacement)
        if n1:
            s.title = new_title
        if n2:
            s.description = new_desc

    db.session.commit()

    # 字数会随替换变化，顺手把项目缓存字数刷新掉
    total = (db.session.query(db.func.sum(db.func.char_length(ScriptContent.content_text)))
             .filter(ScriptContent.project_id == project_id)
             .scalar() or 0)
    row.word_count = int(total)
    db.session.commit()

    return jsonify({'success': True, 'data': result, 'message': '替换完成'})
