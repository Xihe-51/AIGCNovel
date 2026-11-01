# -*- coding: utf-8 -*-
"""工程概览：字数、章节分布、场景/分支/结局/素材统计。"""
from flask import jsonify

from .. import db
from ..models import (BranchPath, Character, Ending, ProjectCG, ProjectVariable,
                      Scene, SceneChapter, ScriptContent, StoryChapter)
from . import project
from .asset_views import _collect_items, _collect_unreferenced, _status_of
from .save_views import _owned_project

# 中文阅读速度按 350 字/分钟估算
WORDS_PER_MINUTE = 350


def _reading_minutes(words):
    return round(int(words or 0) / WORDS_PER_MINUTE, 1)


def _completion_percent(words, target):
    if not target:
        return None
    return min(100, int(round(int(words or 0) * 100 / int(target))))


@project.route('/overview/<int:project_id>', methods=['GET'])
def project_overview(project_id):
    row, err = _owned_project(project_id)
    if err:
        return err

    scenes = (Scene.query
              .filter_by(project_id=project_id)
              .order_by(Scene.order_num.asc())
              .all())
    scene_ids = {s.scene_id for s in scenes}

    word_rows = (db.session.query(
        ScriptContent.scene_id,
        db.func.sum(db.func.char_length(ScriptContent.content_text)))
        .filter(ScriptContent.project_id == project_id)
        .group_by(ScriptContent.scene_id)
        .all())
    scene_words = {sid: int(total or 0) for sid, total in word_rows}
    total_words = sum(scene_words.values())

    chapters = (StoryChapter.query
                .filter_by(project_id=project_id)
                .order_by(StoryChapter.order_num.asc(), StoryChapter.chapter_id.asc())
                .all())
    assignments = {
        sc.scene_id: sc.chapter_id
        for sc in SceneChapter.query.filter_by(project_id=project_id).all()
        if sc.scene_id in scene_ids
    }

    chapter_rows = []
    assigned_scene_ids = set()
    total_target = 0
    for ch in chapters:
        ids = [sid for sid, cid in assignments.items() if cid == ch.chapter_id]
        assigned_scene_ids.update(ids)
        words = sum(scene_words.get(sid, 0) for sid in ids)
        target = int(ch.target_words or 0)
        total_target += target
        chapter_rows.append({
            'chapter_id': ch.chapter_id,
            'title': ch.title,
            'order_num': ch.order_num,
            'scene_count': len(ids),
            'word_count': words,
            'target_words': target,
            'reading_minutes': _reading_minutes(words),
            'completion_percent': _completion_percent(words, target),
        })

    ungrouped_ids = [sid for sid in scene_ids if sid not in assigned_scene_ids]

    items = _collect_items(row)
    unreferenced = _collect_unreferenced(project_id, {it['url'] for it in items})
    missing = [it for it in items if _status_of(it['url']) == 'missing']

    return jsonify({
        'success': True,
        'data': {
            'project_id': project_id,
            'title': row.title,
            'word_count': total_words,
            'target_words': total_target,
            'completion_percent': _completion_percent(total_words, total_target),
            'reading_minutes': _reading_minutes(total_words),
            'scene_count': len(scenes),
            'chapter_count': len(chapters),
            'branch_count': BranchPath.query.filter_by(project_id=project_id).count(),
            'ending_count': Ending.query.filter_by(project_id=project_id).count(),
            'cg_count': ProjectCG.query.filter_by(project_id=project_id).count(),
            'character_count': Character.query.filter_by(project_id=project_id).count(),
            'variable_count': ProjectVariable.query.filter_by(project_id=project_id).count(),
            'asset_total': len(items) + len(unreferenced),
            'asset_missing': len(missing),
            'chapters': chapter_rows,
            'ungrouped': {
                'scene_count': len(ungrouped_ids),
                'word_count': sum(scene_words.get(sid, 0) for sid in ungrouped_ids),
                'reading_minutes': _reading_minutes(
                    sum(scene_words.get(sid, 0) for sid in ungrouped_ids)),
            },
        },
    })
