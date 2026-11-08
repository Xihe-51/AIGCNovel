# -*- coding: utf-8 -*-
"""发布向导：发布前体检 + 公开/取消公开。"""
from flask import jsonify, request

from .. import db
from ..models import Ending, Project, Scene, ScriptContent
from . import project
from .asset_views import _collect_items, _status_of
from .branch_service import validate_project_story
from .save_views import _owned_project


def _asset_issues(project_row):
    items = _collect_items(project_row)
    missing = []
    for it in items:
        if _status_of(it['url']) == 'missing':
            missing.append({
                'where': it.get('where') or it.get('kind_label') or it['url'],
                'url': it['url'],
                'kind': it.get('kind'),
                'scene_id': it.get('scene_id'),
                'content_id': it.get('content_id'),
            })
    return missing


def build_publish_check(project_id, project_row):
    scenes = (Scene.query.filter_by(project_id=project_id)
              .order_by(Scene.order_num.asc(), Scene.scene_id.asc()).all())
    contents = (ScriptContent.query.filter_by(project_id=project_id)
                .with_entities(ScriptContent.scene_id).all())
    node_by_scene = {}
    for (sid,) in contents:
        node_by_scene[int(sid)] = node_by_scene.get(int(sid), 0) + 1

    ending_count = Ending.query.filter_by(project_id=project_id).count()

    issues = []
    if not scenes:
        issues.append({
            'level': 'error',
            'code': 'NO_SCENE',
            'message': '项目还没有任何场景，无法发布',
        })
    empty_scenes = [s.title or f'#{s.scene_id}' for s in scenes
                    if node_by_scene.get(int(s.scene_id), 0) == 0]
    if empty_scenes:
        issues.append({
            'level': 'warning',
            'code': 'EMPTY_SCENES',
            'message': f'{len(empty_scenes)} 个场景没有任何剧情节点：' + '、'.join(empty_scenes[:5]),
            'detail': {'scenes': empty_scenes[:20]},
        })

    if not project_row.cover_url:
        issues.append({
            'level': 'warning',
            'code': 'NO_COVER',
            'message': '作品还没有封面，发布后在作品广场会显示默认图',
        })

    if ending_count == 0:
        issues.append({
            'level': 'warning',
            'code': 'NO_ENDING',
            'message': '还没有设置任何结局，玩家通关后不会触发结局页',
        })

    ok, validation = validate_project_story(project_id)
    if not ok:
        issues.append({
            'level': 'error',
            'code': 'STORY_VALIDATE_FAILED',
            'message': '剧情结构检查失败，无法读取剧情图',
        })
    validation = validation or {}
    for err in (validation.get('errors') or []):
        issues.append({
            'level': 'error',
            'code': err.get('code') or 'STORY_ERROR',
            'message': err.get('message') or '剧情结构错误',
            'detail': err.get('detail') or {},
        })
    for warn in (validation.get('warnings') or []):
        issues.append({
            'level': 'warning',
            'code': warn.get('code') or 'STORY_WARNING',
            'message': warn.get('message') or '剧情结构提醒',
            'detail': warn.get('detail') or {},
        })

    missing_assets = _asset_issues(project_row)
    for m in missing_assets[:20]:
        issues.append({
            'level': 'error',
            'code': 'ASSET_MISSING',
            'message': f'素材丢失：{m["where"]}',
            'detail': m,
        })

    error_count = sum(1 for i in issues if i['level'] == 'error')
    warning_count = sum(1 for i in issues if i['level'] == 'warning')
    summary = validation.get('summary') or {}
    return {
        'project_id': project_id,
        'title': project_row.title,
        'is_public': bool(project_row.is_public),
        'ready': error_count == 0,
        'error_count': error_count,
        'warning_count': warning_count,
        'stats': {
            'scene_count': len(scenes),
            'node_count': sum(node_by_scene.values()),
            'ending_count': ending_count,
            'branch_count': summary.get('edges', 0),
            'reachable_nodes': summary.get('reachable_nodes', 0),
            'coverage': summary.get('coverage', 0),
            'missing_assets': len(missing_assets),
        },
        'issues': issues,
        'share_path': f'/view/{project_id}',
    }


@project.route('/publish_check/<int:project_id>', methods=['GET'])
def publish_check(project_id):
    row, err = _owned_project(project_id)
    if err:
        return err
    return jsonify({'success': True, 'data': build_publish_check(project_id, row)})


@project.route('/publish/<int:project_id>', methods=['POST'])
def publish_project(project_id):
    row, err = _owned_project(project_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    target = bool(data.get('is_public', True))
    force = bool(data.get('force'))

    if not target:
        row.is_public = False
        db.session.commit()
        return jsonify({
            'success': True,
            'message': '已取消公开',
            'data': {'is_public': False},
        })

    check = build_publish_check(project_id, row)
    if not check['ready'] and not force:
        return jsonify({
            'success': False,
            'message': f'还有 {check["error_count"]} 个错误需要修复，确认后可强制发布',
            'data': check,
        }), 409

    row.is_public = True
    db.session.commit()
    return jsonify({
        'success': True,
        'message': '发布成功',
        'data': {
            'is_public': True,
            'share_path': check['share_path'],
            'check': check,
        },
    })
