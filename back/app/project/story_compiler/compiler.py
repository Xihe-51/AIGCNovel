# -*- coding: utf-8 -*-
"""编译器：把 AST 写入项目数据库，并产出 source map。

事务边界保留在这一层：成功提交后返回可直接响应前端的 data；
失败时回滚并抛出异常，由视图层统一转换为 500。
"""
from ... import db
from ...models import (Character, Project, ProjectSource, Scene, SceneChapter,
                       ScriptContent, StoryChapter)
from ..services import update_project_word_count
from .report import snippet


def compile_to_project(project_id, parsed, report, *, project_title='',
                       filename='', fmt='txt', uid=None, raw_text='',
                       create_characters=True, create_chapters=True):
    """把解析结果追加到现有项目，返回前端需要的 data 字典。

    写库前先对项目行加 ``FOR UPDATE`` 锁，让同一项目的并发导入串行化；
    角色、场景与章节序号都在拿到锁之后重新读取，避免两个请求基于同一份
    旧快照重复创建角色或分配相同序号。
    """
    created_chars = []
    source_map = {'chapters': [], 'scenes': [], 'nodes': []}
    scene_index = 0

    try:
        # 同一项目的导入串行化；锁在 commit 时释放
        db.session.query(Project.project_id).filter_by(
            project_id=project_id).with_for_update().one()

        existing = Character.query.filter_by(project_id=project_id).all()
        existing_names = {c.name.strip(): c for c in existing if c.name}

        max_scene_order = db.session.query(db.func.max(Scene.order_num)).filter_by(
            project_id=project_id).scalar() or 0
        max_chapter_order = db.session.query(db.func.max(StoryChapter.order_num)).filter_by(
            project_id=project_id).scalar() or 0

        default_single_chapter = (
            len(parsed['chapters']) == 1 and parsed['chapters'][0]['title'] == '正文')
        chapter_order = max_chapter_order

        for chapter in parsed['chapters']:
            chapter_row = None
            if create_chapters and not default_single_chapter:
                chapter_order += 1
                chapter_row = StoryChapter(
                    project_id=project_id,
                    title=chapter['title'][:100],
                    order_num=chapter_order,
                )
                db.session.add(chapter_row)
                db.session.flush()
                source_map['chapters'].append({
                    'chapter_id': int(chapter_row.chapter_id),
                    'title': chapter_row.title,
                    'line': chapter['line'],
                })

            for scene in chapter['scenes']:
                scene_index += 1
                scene_row = Scene(
                    project_id=project_id,
                    title=(scene['title'] or f'导入场景 {scene_index}')[:100],
                    background_url='',
                    music_url='',
                    description='由小说导入编译器创建',
                    order_num=int(max_scene_order) + scene_index,
                )
                db.session.add(scene_row)
                db.session.flush()

                if chapter_row is not None:
                    db.session.add(SceneChapter(
                        scene_id=scene_row.scene_id,
                        chapter_id=chapter_row.chapter_id,
                        project_id=project_id,
                    ))
                source_map['scenes'].append({
                    'scene_id': int(scene_row.scene_id),
                    'title': scene_row.title,
                    'line': scene['line'],
                    'chapter_title': chapter['title'] if chapter_row is not None else None,
                })

                for local_index, node in enumerate(scene['nodes']):
                    speaker = node.get('speaker')
                    character = existing_names.get(speaker) if speaker else None
                    if speaker and character is None and create_characters:
                        character = Character(
                            project_id=project_id,
                            name=speaker[:50],
                            description='由小说导入编译器自动创建，请补充人设',
                            is_main=False,
                        )
                        db.session.add(character)
                        db.session.flush()
                        existing_names[speaker] = character
                        created_chars.append({'character_id': int(character.character_id),
                                              'name': speaker})

                    if character is not None:
                        content_type = '对话'
                        content_text = node['text']
                        character_id = int(character.character_id)
                    else:
                        content_type = '描述'
                        # 未绑定角色时保留原文说话人标记，避免信息丢失
                        content_text = node['original'] if speaker else node['text']
                        character_id = None

                    row = ScriptContent(
                        project_id=project_id,
                        scene_id=scene_row.scene_id,
                        character_id=character_id,
                        avatar_id=None,
                        content_type=content_type,
                        content_text=content_text,
                        order_num=local_index,
                    )
                    db.session.add(row)
                    db.session.flush()
                    source_map['nodes'].append({
                        'content_id': int(row.content_id),
                        'scene_id': int(scene_row.scene_id),
                        'line': node['line'],
                        'kind': node['kind'],
                        'speaker': speaker,
                        'character_id': character_id,
                        'content_type': content_type,
                        'text': snippet(node['text'], 80),
                    })

        compile_json = {
            'stats': report['stats'],
            'diagnostics': report['diagnostics'],
            'branch_suggestions': report['branch_suggestions'],
            'variable_suggestions': report['variable_suggestions'],
            'source_map': source_map,
        }
        source_row = ProjectSource(
            project_id=project_id,
            user_id=int(uid),
            filename=filename[:255] if filename else '',
            source_format=fmt[:20],
            content=raw_text,
            compile_json=compile_json,
        )
        db.session.add(source_row)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    try:
        update_project_word_count(project_id)
    except Exception:
        pass

    first = None
    if source_map['nodes']:
        first = {
            'scene_id': source_map['nodes'][0]['scene_id'],
            'content_id': source_map['nodes'][0]['content_id'],
        }

    return {
        'source_id': int(source_row.source_id),
        'created': {
            'chapters': len(source_map['chapters']),
            'scenes': len(source_map['scenes']),
            'nodes': len(source_map['nodes']),
            'characters': created_chars,
        },
        'stats': report['stats'],
        'diagnostics': report['diagnostics'],
        'branch_suggestions': report['branch_suggestions'],
        'variable_suggestions': report['variable_suggestions'],
        'source_map': source_map,
        'first': first,
        'project_title': project_title,
    }
