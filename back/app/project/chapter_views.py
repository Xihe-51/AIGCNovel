# -*- coding: utf-8 -*-
"""章节 / 幕分组。

只服务于创作端组织场景：播放顺序仍由 scenes.order_num 决定，
章节不参与运行时逻辑，也不会改变剧情图。

表：
  story_chapters  章节定义（project_id, title, order_num）
  scene_chapters  场景归属（scene_id 唯一）
"""
from flask import jsonify, request

from .. import db
from ..models import Scene, SceneChapter, StoryChapter
from . import project
from .save_views import _owned_project, _readable_project


def _chapter_to_dict(row):
    return {
        'chapter_id': row.chapter_id,
        'project_id': row.project_id,
        'title': row.title,
        'order_num': row.order_num,
        'target_words': int(row.target_words or 0),
    }


def _owned_chapter(project_id, chapter_id):
    row = db.session.get(StoryChapter, int(chapter_id))
    if not row or int(row.project_id) != int(project_id):
        return None
    return row


def _parse_target_words(value):
    """章节目标字数：非法或负数一律按 0（即不设目标）。"""
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


@project.route('/chapters/<int:project_id>', methods=['GET'])
def list_chapters(project_id):
    # 玩家侧的章节快捷跳转需要章节与场景归属
    _, err = _readable_project(project_id)
    if err:
        return err

    chapters = (StoryChapter.query
                .filter_by(project_id=project_id)
                .order_by(StoryChapter.order_num.asc(), StoryChapter.chapter_id.asc())
                .all())
    maps = SceneChapter.query.filter_by(project_id=project_id).all()
    scene_map = {m.scene_id: m.chapter_id for m in maps}

    return jsonify({
        'success': True,
        'data': {
            'chapters': [_chapter_to_dict(c) for c in chapters],
            'scene_map': scene_map,
        },
    })


@project.route('/chapters/<int:project_id>', methods=['POST'])
def create_chapter(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    title = str(data.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'message': '请填写章节名'}), 400

    max_order = db.session.query(db.func.max(StoryChapter.order_num)).filter_by(
        project_id=project_id).scalar() or 0

    row = StoryChapter(
        project_id=project_id,
        title=title[:100],
        order_num=int(data.get('order_num') or (max_order + 1)),
        target_words=_parse_target_words(data.get('target_words')),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'success': True, 'data': _chapter_to_dict(row)}), 201


@project.route('/chapters/<int:project_id>/<int:chapter_id>', methods=['PUT'])
def update_chapter(project_id, chapter_id):
    _, err = _owned_project(project_id)
    if err:
        return err
    row = _owned_chapter(project_id, chapter_id)
    if not row:
        return jsonify({'success': False, 'message': '章节不存在'}), 404

    data = request.get_json(silent=True) or {}
    if 'title' in data:
        title = str(data.get('title') or '').strip()
        if not title:
            return jsonify({'success': False, 'message': '章节名不能为空'}), 400
        row.title = title[:100]
    if 'order_num' in data:
        try:
            row.order_num = int(data.get('order_num'))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': 'order_num 必须是整数'}), 400
    if 'target_words' in data:
        row.target_words = _parse_target_words(data.get('target_words'))

    db.session.commit()
    return jsonify({'success': True, 'data': _chapter_to_dict(row)})


@project.route('/chapters/<int:project_id>/<int:chapter_id>', methods=['DELETE'])
def delete_chapter(project_id, chapter_id):
    _, err = _owned_project(project_id)
    if err:
        return err
    row = _owned_chapter(project_id, chapter_id)
    if not row:
        return jsonify({'success': False, 'message': '章节不存在'}), 404

    # 场景不删除，只回到「未分组」
    SceneChapter.query.filter_by(project_id=project_id, chapter_id=chapter_id).delete(
        synchronize_session=False)
    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True, 'message': '章节已删除，场景已回到未分组'})


@project.route('/chapters/<int:project_id>/assign', methods=['PUT'])
def assign_scene_chapter(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    scene_id = data.get('scene_id')
    chapter_id = data.get('chapter_id')
    if scene_id is None:
        return jsonify({'success': False, 'message': '缺少 scene_id'}), 400

    scene = db.session.get(Scene, int(scene_id))
    if not scene or int(scene.project_id) != int(project_id):
        return jsonify({'success': False, 'message': '场景不存在或不属于该项目'}), 404

    mapping = db.session.get(SceneChapter, int(scene_id))

    if chapter_id in (None, '', 0):
        if mapping:
            db.session.delete(mapping)
            db.session.commit()
        return jsonify({'success': True, 'data': {'scene_id': int(scene_id), 'chapter_id': None}})

    chapter = _owned_chapter(project_id, chapter_id)
    if not chapter:
        return jsonify({'success': False, 'message': '章节不存在或不属于该项目'}), 404

    if mapping:
        mapping.chapter_id = chapter.chapter_id
    else:
        db.session.add(SceneChapter(
            scene_id=int(scene_id),
            chapter_id=chapter.chapter_id,
            project_id=project_id,
        ))
    db.session.commit()
    return jsonify({
        'success': True,
        'data': {'scene_id': int(scene_id), 'chapter_id': chapter.chapter_id},
    })
