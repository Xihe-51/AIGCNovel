# -*- coding: utf-8 -*-
"""术语表与一致性检查：统一标准写法，扫描错别别名。"""
import re

from flask import jsonify, request

from .. import db
from ..models import (BranchPath, BranchPathTranslation, ContentTranslation, ProjectTerm,
                      Scene, SceneTranslation, ScriptContent)
from . import project
from .save_views import _owned_project
from .translation_views import LANGUAGE_LABELS

_VARIANT_SPLIT = re.compile(r'[,，、;；\n]')


def _split_variants(raw):
    if not raw:
        return []
    parts = [p.strip() for p in _VARIANT_SPLIT.split(str(raw)) if p.strip()]
    seen = set()
    result = []
    for p in parts:
        if p not in seen:
            seen.add(p)
            result.append(p)
    return result


def _term_json(term):
    return {
        'term_id': int(term.term_id),
        'standard': term.standard,
        'variants': term.variants or '',
        'note': term.note or '',
        'created_at': term.created_at.isoformat() if term.created_at else None,
        'updated_at': term.updated_at.isoformat() if term.updated_at else None,
    }


def _parse_payload(data):
    standard = str(data.get('standard') or '').strip()
    if not standard:
        return None, '标准写法不能为空'
    if len(standard) > 100:
        return None, '标准写法最多 100 字'
    variants = _split_variants(data.get('variants'))
    variants = [v for v in variants if v != standard]
    note = str(data.get('note') or '').strip()[:255]
    return {'standard': standard, 'variants': '，'.join(variants), 'note': note}, None


@project.route('/glossary/<int:project_id>', methods=['GET'])
def list_project_terms(project_id):
    row, err = _owned_project(project_id)
    if err:
        return err
    terms = (ProjectTerm.query.filter_by(project_id=project_id)
             .order_by(ProjectTerm.term_id.asc()).all())
    return jsonify({'success': True, 'data': {'terms': [_term_json(t) for t in terms]}})


@project.route('/glossary/<int:project_id>', methods=['POST'])
def create_project_term(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    payload, msg = _parse_payload(data)
    if msg:
        return jsonify({'success': False, 'message': msg}), 400

    exists = ProjectTerm.query.filter_by(
        project_id=project_id, standard=payload['standard']).first()
    if exists:
        return jsonify({'success': False, 'message': '该标准写法已存在'}), 400

    term = ProjectTerm(project_id=project_id, **payload)
    db.session.add(term)
    db.session.commit()
    return jsonify({'success': True, 'data': _term_json(term)})


@project.route('/glossary/<int:project_id>/<int:term_id>', methods=['PUT'])
def update_project_term(project_id, term_id):
    _, err = _owned_project(project_id)
    if err:
        return err
    term = ProjectTerm.query.filter_by(
        project_id=project_id, term_id=term_id).first()
    if not term:
        return jsonify({'success': False, 'message': '术语不存在'}), 404

    data = request.get_json(silent=True) or {}
    payload, msg = _parse_payload(data)
    if msg:
        return jsonify({'success': False, 'message': msg}), 400

    dup = ProjectTerm.query.filter_by(
        project_id=project_id, standard=payload['standard']).first()
    if dup and int(dup.term_id) != int(term_id):
        return jsonify({'success': False, 'message': '该标准写法已存在'}), 400

    term.standard = payload['standard']
    term.variants = payload['variants']
    term.note = payload['note']
    db.session.commit()
    return jsonify({'success': True, 'data': _term_json(term)})


@project.route('/glossary/<int:project_id>/<int:term_id>', methods=['DELETE'])
def delete_project_term(project_id, term_id):
    _, err = _owned_project(project_id)
    if err:
        return err
    term = ProjectTerm.query.filter_by(
        project_id=project_id, term_id=term_id).first()
    if not term:
        return jsonify({'success': False, 'message': '术语不存在'}), 404
    db.session.delete(term)
    db.session.commit()
    return jsonify({'success': True})


def _scan_sources(project_id):
    """收集所有可能包含术语的文本：台词/旁白、选项、场景名与描述。"""
    scenes = {int(s.scene_id): s for s in
              Scene.query.filter_by(project_id=project_id).all()}
    sources = []
    contents = (ScriptContent.query.filter_by(project_id=project_id)
                .order_by(ScriptContent.scene_id.asc(), ScriptContent.order_num.asc()).all())
    content_ids = [c.content_id for c in contents]
    translations = {}
    if content_ids:
        for t in (ContentTranslation.query
                  .filter(ContentTranslation.content_id.in_(content_ids)).all()):
            translations.setdefault(int(t.content_id), []).append(t)

    for c in contents:
        scene = scenes.get(int(c.scene_id))
        text = c.content_text or ''
        if text.strip():
            sources.append({
                'kind': '台词' if c.content_type == '对话' else (c.content_type or '文本'),
                'scene_id': int(c.scene_id),
                'scene_title': scene.title if scene else '',
                'content_id': int(c.content_id),
                'text': text,
            })
        # 译文也纳入术语扫描：同一词条在译文里同样不应出现误用别名
        for t in translations.get(int(c.content_id), []):
            translated = (t.text or '').strip()
            if not translated:
                continue
            sources.append({
                'kind': f"译文 · {LANGUAGE_LABELS.get(t.language, t.language)}",
                'scene_id': int(c.scene_id),
                'scene_title': scene.title if scene else '',
                'content_id': int(c.content_id),
                'text': translated,
            })
    for b in (BranchPath.query.filter_by(project_id=project_id)
              .order_by(BranchPath.path_id.asc()).all()):
        text = b.choice_text or ''
        if text.strip():
            # 选项本身没有 scene_id，按源节点反查所属场景
            src = ScriptContent.query.filter_by(content_id=b.source_content_id).first()
            scene = scenes.get(int(src.scene_id)) if src else None
            sources.append({
                'kind': '选项',
                'scene_id': int(src.scene_id) if src else 0,
                'scene_title': scene.title if scene else '',
                'content_id': int(b.source_content_id) if b.source_content_id else None,
                'text': text,
            })
        # 选项译文同样参与别名扫描
        for bt in BranchPathTranslation.query.filter_by(path_id=b.path_id).all():
            translated = (bt.text or '').strip()
            if not translated:
                continue
            src = ScriptContent.query.filter_by(content_id=b.source_content_id).first()
            scene = scenes.get(int(src.scene_id)) if src else None
            sources.append({
                'kind': f"译文 · {LANGUAGE_LABELS.get(bt.language, bt.language)} · 选项",
                'scene_id': int(src.scene_id) if src else 0,
                'scene_title': scene.title if scene else '',
                'content_id': int(b.source_content_id) if b.source_content_id else None,
                'text': translated,
            })
    for s in scenes.values():
        for field, label in ((s.title, '场景名'), (s.description, '场景描述')):
            if field and str(field).strip():
                sources.append({
                    'kind': label,
                    'scene_id': int(s.scene_id),
                    'scene_title': s.title or '',
                    'content_id': None,
                    'text': str(field),
                })
        # 场景名/描述的译文
        for st in SceneTranslation.query.filter_by(scene_id=s.scene_id).all():
            for field, label in ((st.title, '场景名'), (st.description, '场景描述')):
                translated = (field or '').strip()
                if not translated:
                    continue
                sources.append({
                    'kind': f"译文 · {LANGUAGE_LABELS.get(st.language, st.language)} · {label}",
                    'scene_id': int(s.scene_id),
                    'scene_title': s.title or '',
                    'content_id': None,
                    'text': translated,
                })
    return sources


@project.route('/glossary/<int:project_id>/scan', methods=['GET'])
def scan_project_terms(project_id):
    """扫描术语表中所有别名，返回每处命中的位置与上下文。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    terms = (ProjectTerm.query.filter_by(project_id=project_id)
             .order_by(ProjectTerm.term_id.asc()).all())
    if not terms:
        return jsonify({'success': True, 'data': {'items': [], 'total': 0}})

    sources = _scan_sources(project_id)
    scenes = {int(s.scene_id): s.title for s in
              Scene.query.filter_by(project_id=project_id).all()}
    items = []
    total = 0

    for term in terms:
        variants = _split_variants(term.variants)
        standard_hits = []
        if term.standard:
            pattern = re.compile(re.escape(term.standard), re.IGNORECASE)
            for src in sources:
                if pattern.search(src['text']):
                    standard_hits.append({
                        'kind': src['kind'],
                        'scene_id': src['scene_id'],
                        'scene_title': src['scene_title'] or scenes.get(src['scene_id'], ''),
                        'content_id': src['content_id'],
                        'text': src['text'][:120],
                    })
                    if len(standard_hits) >= 10:
                        break

        for variant in variants:
            pattern = re.compile(re.escape(variant), re.IGNORECASE)
            hits = []
            count = 0
            for src in sources:
                matches = pattern.findall(src['text'])
                if not matches:
                    continue
                count += len(matches)
                if len(hits) < 10:
                    hits.append({
                        'kind': src['kind'],
                        'scene_id': src['scene_id'],
                        'scene_title': src['scene_title'] or scenes.get(src['scene_id'], ''),
                        'content_id': src['content_id'],
                        'text': src['text'][:120],
                    })
            if not count:
                continue
            total += count
            items.append({
                'term_id': int(term.term_id),
                'standard': term.standard,
                'variant': variant,
                'count': count,
                'hits': hits,
                'standard_hits': standard_hits,
            })

    items.sort(key=lambda x: -x['count'])
    return jsonify({'success': True, 'data': {'items': items, 'total': total}})
