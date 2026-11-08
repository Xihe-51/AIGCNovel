# -*- coding: utf-8 -*-
"""剧本统计报表：场景/角色/章节维度统计，供作者导出 CSV。"""
from collections import Counter, defaultdict
from datetime import datetime

from flask import jsonify

from .. import db
from ..models import (BranchPath, Character, Ending, ProjectCG, Scene,
                      SceneChapter, ScriptContent, StoryChapter)
from . import project
from .save_views import _owned_project


def _text_len(text):
    return len((text or '').strip())


@project.route('/script_stats/<int:project_id>', methods=['GET'])
def script_stats(project_id):
    row, err = _owned_project(project_id)
    if err:
        return err

    scenes = (Scene.query.filter_by(project_id=project_id)
              .order_by(Scene.order_num.asc(), Scene.scene_id.asc()).all())
    contents = (ScriptContent.query.filter_by(project_id=project_id)
                .order_by(ScriptContent.scene_id.asc(), ScriptContent.order_num.asc()).all())
    branches = BranchPath.query.filter_by(project_id=project_id).all()
    endings = Ending.query.filter_by(project_id=project_id).all()
    chapters = (StoryChapter.query.filter_by(project_id=project_id)
                .order_by(StoryChapter.order_num.asc()).all())
    assignments = {int(sc.scene_id): int(sc.chapter_id)
                   for sc in SceneChapter.query.filter_by(project_id=project_id).all()}
    cg_count = ProjectCG.query.filter_by(project_id=project_id).count()

    scene_stats = defaultdict(lambda: {
        'node_count': 0, 'dialogue_count': 0, 'narration_count': 0,
        'choice_count': 0, 'word_count': 0,
    })
    char_stats = defaultdict(lambda: {
        'line_count': 0, 'word_count': 0, 'scenes': set(),
    })
    node_scene = {}
    for c in contents:
        sid = int(c.scene_id)
        node_scene[int(c.content_id)] = sid
        s = scene_stats[sid]
        s['node_count'] += 1
        s['word_count'] += _text_len(c.content_text)
        if c.content_type == '对话':
            s['dialogue_count'] += 1
        elif c.content_type == '选择':
            s['choice_count'] += 1
        else:
            s['narration_count'] += 1
        if c.character_id:
            ch = char_stats[int(c.character_id)]
            ch['line_count'] += 1
            ch['word_count'] += _text_len(c.content_text)
            ch['scenes'].add(sid)

    branch_by_scene = Counter()
    for b in branches:
        sid = node_scene.get(int(b.source_content_id))
        if sid:
            branch_by_scene[sid] += 1

    ending_by_scene = Counter()
    for e in endings:
        sid = node_scene.get(int(e.content_id))
        if sid:
            ending_by_scene[sid] += 1

    scene_rows = []
    for s in scenes:
        sid = int(s.scene_id)
        st = scene_stats.get(sid) or {
            'node_count': 0, 'dialogue_count': 0, 'narration_count': 0,
            'choice_count': 0, 'word_count': 0,
        }
        scene_rows.append({
            'scene_id': sid,
            'title': s.title or f'场景 {sid}',
            'order_num': int(s.order_num or 0),
            'node_count': st['node_count'],
            'dialogue_count': st['dialogue_count'],
            'narration_count': st['narration_count'],
            'choice_count': st['choice_count'],
            'word_count': st['word_count'],
            'branch_count': branch_by_scene.get(sid, 0),
            'ending_count': ending_by_scene.get(sid, 0),
            'chapter_id': assignments.get(sid),
        })

    characters = Character.query.filter_by(project_id=project_id).all()
    char_rows = []
    for c in characters:
        st = char_stats.get(int(c.character_id)) or {
            'line_count': 0, 'word_count': 0, 'scenes': set(),
        }
        char_rows.append({
            'character_id': int(c.character_id),
            'name': c.name,
            'is_main': bool(c.is_main),
            'line_count': st['line_count'],
            'word_count': st['word_count'],
            'scene_count': len(st['scenes']),
        })
    char_rows.sort(key=lambda x: -x['word_count'])

    chapter_rows = []
    for ch in chapters:
        cid = int(ch.chapter_id)
        rows = [r for r in scene_rows if r['chapter_id'] == cid]
        chapter_rows.append({
            'chapter_id': cid,
            'title': ch.title,
            'order_num': int(ch.order_num or 0),
            'scene_count': len(rows),
            'word_count': sum(r['word_count'] for r in rows),
            'target_words': int(ch.target_words or 0),
        })

    total_words = sum(r['word_count'] for r in scene_rows)
    summary = {
        'project_title': row.title,
        'generated_at': datetime.now().isoformat(timespec='seconds'),
        'chapter_count': len(chapters),
        'scene_count': len(scenes),
        'node_count': len(contents),
        'dialogue_count': sum(r['dialogue_count'] for r in scene_rows),
        'narration_count': sum(r['narration_count'] for r in scene_rows),
        'choice_count': sum(r['choice_count'] for r in scene_rows),
        'branch_count': len(branches),
        'ending_count': len(endings),
        'character_count': len(characters),
        'cg_count': cg_count,
        'word_count': total_words,
        'avg_words_per_scene': round(total_words / len(scenes), 1) if scenes else 0,
    }

    return jsonify({
        'success': True,
        'data': {
            'summary': summary,
            'chapters': chapter_rows,
            'scenes': scene_rows,
            'characters': char_rows,
        },
    })
