# -*- coding: utf-8 -*-
"""大纲 / 时间线：按章节汇总场景、节点、字数、分支与结局。"""
from collections import Counter

from flask import jsonify

from .. import db
from ..models import BranchPath, Ending, Scene, SceneChapter, ScriptContent, StoryChapter
from . import project
from .save_views import _owned_project


@project.route('/outline/<int:project_id>', methods=['GET'])
def project_outline(project_id):
    row, err = _owned_project(project_id)
    if err:
        return err

    scenes = (Scene.query.filter_by(project_id=project_id)
              .order_by(Scene.order_num.asc(), Scene.scene_id.asc()).all())
    chapters = (StoryChapter.query.filter_by(project_id=project_id)
                .order_by(StoryChapter.order_num.asc(), StoryChapter.chapter_id.asc()).all())
    assignments = {int(sc.scene_id): int(sc.chapter_id)
                   for sc in SceneChapter.query.filter_by(project_id=project_id).all()}

    contents = (db.session.query(
        ScriptContent.content_id,
        ScriptContent.scene_id,
        ScriptContent.content_type,
        db.func.char_length(ScriptContent.content_text))
        .filter(ScriptContent.project_id == project_id)
        .all())
    content_scene = {}
    word_by_scene = Counter()
    nodes_by_scene = Counter()
    dialogues_by_scene = Counter()
    choices_by_scene = Counter()
    for cid, sid, ctype, words in contents:
        sid = int(sid)
        content_scene[int(cid)] = sid
        word_by_scene[sid] += int(words or 0)
        nodes_by_scene[sid] += 1
        if ctype == '对话':
            dialogues_by_scene[sid] += 1
        elif ctype == '选择':
            choices_by_scene[sid] += 1

    branch_by_scene = Counter()
    for source_id in BranchPath.query.filter_by(project_id=project_id).with_entities(
            BranchPath.source_content_id).all():
        sid = content_scene.get(int(source_id[0]))
        if sid:
            branch_by_scene[sid] += 1

    ending_by_scene = Counter()
    for (content_id,) in Ending.query.filter_by(project_id=project_id).with_entities(
            Ending.content_id).all():
        sid = content_scene.get(int(content_id))
        if sid:
            ending_by_scene[sid] += 1

    def scene_row(scene):
        sid = int(scene.scene_id)
        return {
            'scene_id': sid,
            'title': scene.title or '未命名场景',
            'description': scene.description,
            'order_num': int(scene.order_num or 0),
            'node_count': nodes_by_scene.get(sid, 0),
            'word_count': word_by_scene.get(sid, 0),
            'dialogue_count': dialogues_by_scene.get(sid, 0),
            'choice_count': choices_by_scene.get(sid, 0),
            'branch_count': branch_by_scene.get(sid, 0),
            'ending_count': ending_by_scene.get(sid, 0),
            'has_background': bool(scene.background_url),
            'has_music': bool(scene.music_url),
        }

    rows = [scene_row(s) for s in scenes]
    by_id = {r['scene_id']: r for r in rows}
    chapter_groups = []
    grouped_ids = set()
    for ch in chapters:
        scene_rows = [by_id[int(s.scene_id)] for s in scenes
                      if assignments.get(int(s.scene_id)) == int(ch.chapter_id)]
        grouped_ids.update(r['scene_id'] for r in scene_rows)
        chapter_groups.append({
            'chapter_id': int(ch.chapter_id),
            'title': ch.title,
            'order_num': int(ch.order_num or 0),
            'target_words': int(ch.target_words or 0),
            'scenes': scene_rows,
        })

    ungrouped = [r for r in rows if r['scene_id'] not in grouped_ids]

    return jsonify({
        'success': True,
        'data': {
            'project_id': project_id,
            'title': row.title,
            'chapters': chapter_groups,
            'ungrouped': ungrouped,
            'totals': {
                'scene_count': len(rows),
                'word_count': sum(r['word_count'] for r in rows),
                'node_count': sum(r['node_count'] for r in rows),
                'branch_count': sum(r['branch_count'] for r in rows),
                'ending_count': sum(r['ending_count'] for r in rows),
            },
        },
    })
