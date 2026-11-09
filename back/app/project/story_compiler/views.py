# -*- coding: utf-8 -*-
"""叙事编译器 HTTP 接口：预览、入库、历史导入记录。

控制器只负责鉴权、参数校验与响应组装；
解析、诊断与写库分别由 parser / report / compiler 三层承担。
"""
from flask import jsonify, request

from ... import db
from ...models import Character, ProjectSource
from ...security import current_user_id
from .. import project
from ..save_views import _owned_project
from .compiler import compile_to_project
from .parser import parse_source
from .report import build_report, structure_preview

MAX_SOURCE_CHARS = 300000


def _payload_text():
    data = request.get_json(silent=True) or {}
    text = str(data.get('text') or '')
    filename = str(data.get('filename') or '').strip()
    if not text.strip():
        return None, None, (jsonify({'success': False, 'message': '请粘贴或上传文本内容'}), 400)
    if len(text) > MAX_SOURCE_CHARS:
        return None, None, (jsonify({
            'success': False,
            'message': f'文本过长（{len(text)} 字），当前上限 {MAX_SOURCE_CHARS} 字，请拆分后再导入',
        }), 400)
    return data, (text, filename), None


def _detect_format(data, filename):
    return str(data.get('format') or (
        'markdown' if filename.lower().endswith(('.md', '.markdown')) else 'txt'))


@project.route('/story_compile/<int:project_id>/preview', methods=['POST'])
def story_compile_preview(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    data, body, err = _payload_text()
    if err:
        return err
    text, filename = body
    fmt = _detect_format(data, filename)

    parsed = parse_source(text, filename)
    existing = Character.query.filter_by(project_id=project_id).all()
    existing_names = {c.name.strip() for c in existing if c.name}
    report = build_report(parsed, existing_names)

    return jsonify({
        'success': True,
        'data': {
            'filename': filename,
            'format': fmt,
            'stats': report['stats'],
            'diagnostics': report['diagnostics'],
            'branch_suggestions': report['branch_suggestions'],
            'variable_suggestions': report['variable_suggestions'],
            'structure': structure_preview(parsed),
        },
    })


@project.route('/story_compile/<int:project_id>/apply', methods=['POST'])
def story_compile_apply(project_id):
    project_row, err = _owned_project(project_id)
    if err:
        return err

    data, body, err = _payload_text()
    if err:
        return err
    text, filename = body
    fmt = _detect_format(data, filename)
    create_characters = bool(data.get('create_characters', True))
    create_chapters = bool(data.get('create_chapters', True))

    parsed = parse_source(text, filename)
    existing = Character.query.filter_by(project_id=project_id).all()
    existing_names = {c.name.strip(): c for c in existing if c.name}
    report = build_report(parsed, set(existing_names.keys()))
    if report['stats']['node_count'] == 0:
        return jsonify({'success': False, 'message': '没有解析到任何台词或旁白'}), 400

    uid = current_user_id()
    try:
        result = compile_to_project(
            project_id,
            parsed,
            report,
            project_title=project_row.title,
            filename=filename,
            fmt=fmt,
            uid=uid,
            raw_text=text,
            existing_names=existing_names,
            create_characters=create_characters,
            create_chapters=create_chapters,
        )
    except Exception as exc:
        return jsonify({'success': False, 'message': f'写入失败：{exc}'}), 500

    return jsonify({'success': True, 'data': result}), 201


@project.route('/story_compile/<int:project_id>/sources', methods=['GET'])
def story_compile_sources(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    rows = (ProjectSource.query
            .filter_by(project_id=project_id)
            .order_by(ProjectSource.created_at.desc(), ProjectSource.source_id.desc())
            .limit(10).all())
    data = []
    for row in rows:
        payload = row.compile_json if isinstance(row.compile_json, dict) else {}
        data.append({
            'source_id': int(row.source_id),
            'filename': row.filename,
            'format': row.source_format,
            'created_at': row.created_at.isoformat() if row.created_at else None,
            'stats': payload.get('stats') or {},
            'diagnostic_count': len(payload.get('diagnostics') or []),
        })
    return jsonify({'success': True, 'data': data})


@project.route('/story_compile/source/<int:source_id>', methods=['GET'])
def story_compile_source_detail(source_id):
    row = db.session.get(ProjectSource, source_id)
    if not row:
        return jsonify({'success': False, 'message': '导入记录不存在'}), 404
    _, err = _owned_project(row.project_id)
    if err:
        return err

    compile_json = row.compile_json if isinstance(row.compile_json, dict) else {}
    return jsonify({
        'success': True,
        'data': {
            'source_id': int(row.source_id),
            'filename': row.filename,
            'format': row.source_format,
            'created_at': row.created_at.isoformat() if row.created_at else None,
            'content': row.content,
            'compile': compile_json,
        },
    })
