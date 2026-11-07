"""多语言译文读写：台词/旁白、选项、场景标题与描述。主语言（简体中文）直接使用原字段。"""
from flask import jsonify, request

from .. import db
from ..models import (BranchPath, BranchPathTranslation, ContentTranslation,
                      Scene, SceneTranslation, ScriptContent)
from . import project
from .save_views import _owned_project

# 支持的译文语言；简体中文是主语言，不需要翻译记录
TRANSLATION_LANGUAGES = ('zh-TW', 'en', 'ja')
LANGUAGE_LABELS = {'zh-TW': '繁體中文', 'en': 'English', 'ja': '日本語'}
_LANGUAGE_SET = set(TRANSLATION_LANGUAGES)


def _translations_of(content_ids):
    """批量取台词译文：{content_id: {language: text}}。"""
    ids = [int(cid) for cid in (content_ids or []) if cid]
    if not ids:
        return {}
    rows = (ContentTranslation.query
            .filter(ContentTranslation.content_id.in_(ids))
            .order_by(ContentTranslation.translation_id.asc())
            .all())
    result = {}
    for row in rows:
        result.setdefault(int(row.content_id), {})[row.language] = row.text or ''
    return result


def _scene_translations_of(scene_ids):
    """批量取场景译文：{scene_id: {language: {title, description}}}。"""
    ids = [int(sid) for sid in (scene_ids or []) if sid]
    if not ids:
        return {}
    rows = (SceneTranslation.query
            .filter(SceneTranslation.scene_id.in_(ids))
            .order_by(SceneTranslation.translation_id.asc())
            .all())
    result = {}
    for row in rows:
        result.setdefault(int(row.scene_id), {})[row.language] = {
            'title': row.title or '',
            'description': row.description or '',
        }
    return result


def _branch_translations_of(path_ids):
    """批量取选项译文：{path_id: {language: text}}。"""
    ids = [int(pid) for pid in (path_ids or []) if pid]
    if not ids:
        return {}
    rows = (BranchPathTranslation.query
            .filter(BranchPathTranslation.path_id.in_(ids))
            .order_by(BranchPathTranslation.translation_id.asc())
            .all())
    result = {}
    for row in rows:
        result.setdefault(int(row.path_id), {})[row.language] = row.text or ''
    return result


def _language_or_error(language):
    lang = str(language or '').strip()
    if lang not in _LANGUAGE_SET:
        return None, (jsonify({'success': False, 'message': '不支持的语言'}), 400)
    return lang, None


@project.route('/translations/<int:project_id>', methods=['GET'])
def list_project_translations(project_id):
    """作者端读取项目全部译文，用于翻译管理面板。"""
    _, err = _owned_project(project_id)
    if err:
        return err

    content_ids = [c.content_id for c in ScriptContent.query.filter_by(project_id=project_id).all()]
    translations = _translations_of(content_ids)
    items = [
        {'content_id': cid, 'language': lang, 'text': text}
        for cid, langs in translations.items()
        for lang, text in langs.items()
    ]

    scene_ids = [s.scene_id for s in Scene.query.filter_by(project_id=project_id).all()]
    scene_translations = _scene_translations_of(scene_ids)
    scene_items = [
        {'scene_id': sid, 'language': lang, **payload}
        for sid, langs in scene_translations.items()
        for lang, payload in langs.items()
    ]

    path_ids = [b.path_id for b in BranchPath.query.filter_by(project_id=project_id).all()]
    branch_translations = _branch_translations_of(path_ids)
    branch_items = [
        {'path_id': pid, 'language': lang, 'text': text}
        for pid, langs in branch_translations.items()
        for lang, text in langs.items()
    ]

    return jsonify({
        'success': True,
        'data': {
            'languages': list(TRANSLATION_LANGUAGES),
            'items': items,
            'scenes': scene_items,
            'branches': branch_items,
        },
    })


@project.route('/translations/<int:content_id>/<string:language>', methods=['PUT'])
def save_content_translation(content_id, language):
    """新增/更新一条逐句译文；text 为空时等价于删除该语言译文。"""
    row = db.session.get(ScriptContent, content_id)
    if not row:
        return jsonify({'success': False, 'message': '台词不存在'}), 404
    _, err = _owned_project(row.project_id)
    if err:
        return err
    lang, lang_err = _language_or_error(language)
    if lang_err:
        return lang_err

    data = request.get_json(silent=True) or {}
    text = str(data.get('text') or '').strip()
    existing = ContentTranslation.query.filter_by(content_id=content_id, language=lang).first()

    if not text:
        if existing:
            db.session.delete(existing)
            db.session.commit()
        return jsonify({
            'success': True,
            'data': {'content_id': int(content_id), 'language': lang, 'text': ''},
        })

    if not existing:
        existing = ContentTranslation(content_id=content_id, language=lang, text=text)
        db.session.add(existing)
    else:
        existing.text = text
    db.session.commit()
    return jsonify({
        'success': True,
        'data': {'content_id': int(content_id), 'language': lang, 'text': text},
    })


@project.route('/translations/<int:content_id>/<string:language>', methods=['DELETE'])
def delete_content_translation(content_id, language):
    row = db.session.get(ScriptContent, content_id)
    if not row:
        return jsonify({'success': False, 'message': '台词不存在'}), 404
    _, err = _owned_project(row.project_id)
    if err:
        return err
    lang, lang_err = _language_or_error(language)
    if lang_err:
        return lang_err

    ContentTranslation.query.filter_by(content_id=content_id, language=lang).delete(
        synchronize_session=False)
    db.session.commit()
    return jsonify({
        'success': True,
        'data': {'content_id': int(content_id), 'language': lang, 'text': ''},
    })


@project.route('/translations/scene/<int:scene_id>/<string:language>', methods=['PUT'])
def save_scene_translation(scene_id, language):
    """新增/更新场景标题与描述译文；标题和描述都为空时删除该语言译文。"""
    row = db.session.get(Scene, scene_id)
    if not row:
        return jsonify({'success': False, 'message': '场景不存在'}), 404
    _, err = _owned_project(row.project_id)
    if err:
        return err
    lang, lang_err = _language_or_error(language)
    if lang_err:
        return lang_err

    data = request.get_json(silent=True) or {}
    title = str(data.get('title') or '').strip()
    description = str(data.get('description') or '').strip()
    existing = SceneTranslation.query.filter_by(scene_id=scene_id, language=lang).first()

    if not title and not description:
        if existing:
            db.session.delete(existing)
            db.session.commit()
        return jsonify({
            'success': True,
            'data': {'scene_id': int(scene_id), 'language': lang, 'title': '', 'description': ''},
        })

    if not existing:
        existing = SceneTranslation(scene_id=scene_id, language=lang,
                                    title=title, description=description)
        db.session.add(existing)
    else:
        existing.title = title
        existing.description = description
    db.session.commit()
    return jsonify({
        'success': True,
        'data': {'scene_id': int(scene_id), 'language': lang,
                 'title': title, 'description': description},
    })


@project.route('/translations/scene/<int:scene_id>/<string:language>', methods=['DELETE'])
def delete_scene_translation(scene_id, language):
    row = db.session.get(Scene, scene_id)
    if not row:
        return jsonify({'success': False, 'message': '场景不存在'}), 404
    _, err = _owned_project(row.project_id)
    if err:
        return err
    lang, lang_err = _language_or_error(language)
    if lang_err:
        return lang_err

    SceneTranslation.query.filter_by(scene_id=scene_id, language=lang).delete(
        synchronize_session=False)
    db.session.commit()
    return jsonify({
        'success': True,
        'data': {'scene_id': int(scene_id), 'language': lang, 'title': '', 'description': ''},
    })


@project.route('/translations/branch/<int:path_id>/<string:language>', methods=['PUT'])
def save_branch_translation(path_id, language):
    """新增/更新选项译文；text 为空时删除该语言译文。"""
    row = db.session.get(BranchPath, path_id)
    if not row:
        return jsonify({'success': False, 'message': '选项不存在'}), 404
    _, err = _owned_project(row.project_id)
    if err:
        return err
    lang, lang_err = _language_or_error(language)
    if lang_err:
        return lang_err

    data = request.get_json(silent=True) or {}
    text = str(data.get('text') or '').strip()
    existing = BranchPathTranslation.query.filter_by(path_id=path_id, language=lang).first()

    if not text:
        if existing:
            db.session.delete(existing)
            db.session.commit()
        return jsonify({
            'success': True,
            'data': {'path_id': int(path_id), 'language': lang, 'text': ''},
        })

    if not existing:
        existing = BranchPathTranslation(path_id=path_id, language=lang, text=text)
        db.session.add(existing)
    else:
        existing.text = text
    db.session.commit()
    return jsonify({
        'success': True,
        'data': {'path_id': int(path_id), 'language': lang, 'text': text},
    })


@project.route('/translations/branch/<int:path_id>/<string:language>', methods=['DELETE'])
def delete_branch_translation(path_id, language):
    row = db.session.get(BranchPath, path_id)
    if not row:
        return jsonify({'success': False, 'message': '选项不存在'}), 404
    _, err = _owned_project(row.project_id)
    if err:
        return err
    lang, lang_err = _language_or_error(language)
    if lang_err:
        return lang_err

    BranchPathTranslation.query.filter_by(path_id=path_id, language=lang).delete(
        synchronize_session=False)
    db.session.commit()
    return jsonify({
        'success': True,
        'data': {'path_id': int(path_id), 'language': lang, 'text': ''},
    })
