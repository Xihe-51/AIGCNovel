# -*- coding: utf-8 -*-
"""编译器：把 AST 写入项目数据库，并产出 source map。

写库分两遍：第一遍创建章节 / 场景 / 内容节点，拿到每条 ``content_id``
并建立「标签 → 节点」映射；第二遍才写 ``branch_paths`` 与
``content_directives``，因为分支的终点必须是已入库的节点 id。

事务边界保留在这一层：成功提交后返回可直接响应前端的 data；
失败时回滚并抛出异常，由视图层统一转换为 500。
"""
from ... import db
from ...models import (BranchPath, Character, CharacterAvatar, ContentDirective,
                       Project, ProjectSource, Scene, SceneChapter, ScriptContent,
                       StoryChapter)
from ..services import update_project_word_count
from .report import snippet

# 与 directive_views 保持一致的写入上限，避免编译产物超出编辑器可编辑范围
MAX_DIRECTIVES_PER_NODE = 32
MAX_AVATAR_LAYERS = 8


def _diag(level, code, message, line):
    return {'level': level, 'code': code, 'message': message, 'line': line}


def compile_to_project(project_id, parsed, report, *, project_title='',
                       filename='', fmt='txt', uid=None, raw_text='',
                       create_characters=True, create_chapters=True):
    """把解析结果追加到现有项目，返回前端需要的 data 字典。

    写库前先对项目行加 ``FOR UPDATE`` 锁，让同一项目的并发导入串行化；
    角色、场景与章节序号都在拿到锁之后重新读取，避免两个请求基于同一份
    旧快照重复创建角色或分配相同序号。
    """
    created_chars = []
    source_map = {'chapters': [], 'scenes': [], 'nodes': [],
                  'branches': [], 'directives': []}
    diagnostics = list(report['diagnostics'])
    compiled_nodes = []
    label_target = {}
    scene_index = 0
    branch_rows = directive_rows = 0

    def ensure_character(name):
        """按名字取角色，缺失时按 create_characters 决定是否自动建。"""
        char = existing_names.get(name)
        if char is None and create_characters:
            char = Character(project_id=project_id, name=name[:50],
                             description='由叙事编译器自动创建，请补充人设',
                             is_main=False)
            db.session.add(char)
            db.session.flush()
            existing_names[name] = char
            created_chars.append({'character_id': int(char.character_id),
                                  'name': name})
        return char

    def avatar_belongs(avatar_id, character):
        row = db.session.get(CharacterAvatar, int(avatar_id))
        return bool(row) and int(row.character_id) == int(character.character_id)

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

        # ==================== 第一遍：结构 + 内容节点 ====================
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
                    if speaker and character is None:
                        character = ensure_character(speaker)

                    kind = node.get('kind')
                    if kind == 'choice':
                        content_type = '选择'
                        content_text = node['text'] or '你要怎么做？'
                        character_id = None
                    elif character is not None:
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
                    content_id = int(row.content_id)
                    source_map['nodes'].append({
                        'content_id': content_id,
                        'scene_id': int(scene_row.scene_id),
                        'line': node['line'],
                        'kind': node['kind'],
                        'speaker': speaker,
                        'character_id': character_id,
                        'content_type': content_type,
                        'text': snippet(node['text'], 80),
                    })
                    compiled_nodes.append({'node': node, 'content_id': content_id})
                    for label in node.get('labels') or []:
                        label_target.setdefault(label, content_id)

        # ==================== 第二遍：分支与演出指令 ====================
        for item in compiled_nodes:
            node = item['node']
            content_id = item['content_id']

            edges = []
            if node.get('jump'):
                edges.append((node['jump']['target'], node['jump']['line'], None))
            for choice in node.get('choices') or []:
                edges.append((choice['target'], choice['line'], choice['text']))

            for target, line, choice_text in edges:
                target_id = label_target.get(target)
                if target_id is None:
                    # 未定义标签已在 report 层给出 unresolved_label 诊断
                    continue
                if target_id == content_id:
                    # 自环已由 report 层给出 self_loop_branch 诊断，这里只跳过写入
                    continue
                db.session.add(BranchPath(
                    project_id=project_id,
                    source_content_id=content_id,
                    target_content_id=target_id,
                    choice_text=choice_text,
                    image_url=None,
                    conditions=None,
                ))
                branch_rows += 1
                source_map['branches'].append({
                    'source_content_id': content_id,
                    'target_content_id': target_id,
                    'choice_text': choice_text,
                    'label': target,
                    'line': line,
                })

            directives = node.get('directives') or []
            if len(directives) > MAX_DIRECTIVES_PER_NODE:
                diagnostics.append(_diag(
                    'warning', 'too_many_directives',
                    f'节点有 {len(directives)} 条演出指令，仅写入前 {MAX_DIRECTIVES_PER_NODE} 条',
                    node['line']))
                directives = directives[:MAX_DIRECTIVES_PER_NODE]

            avatar_layers = set()
            for order, directive in enumerate(directives):
                dtype = directive.get('type')
                payload = dict(directive.get('payload') or {})
                line = directive.get('line')

                if dtype == 'avatar':
                    name = str(payload.pop('character', '') or '').strip()
                    if payload.get('action') == 'hide':
                        # 隐藏只针对已存在的角色，避免为了一行 @hide 凭空建角色
                        character = existing_names.get(name) if name else None
                    else:
                        character = ensure_character(name) if name else None
                    if character is None:
                        diagnostics.append(_diag(
                            'warning', 'directive_unbound_character',
                            f'@show/@hide 引用的角色「{name}」不存在，该指令已跳过', line))
                        continue
                    layer_id = f'character-{int(character.character_id)}'
                    if payload.get('action') != 'hide':
                        if layer_id not in avatar_layers and len(avatar_layers) >= MAX_AVATAR_LAYERS:
                            diagnostics.append(_diag(
                                'warning', 'too_many_avatar_layers',
                                f'单节点立绘图层超过 {MAX_AVATAR_LAYERS} 个，角色「{name}」的立绘已跳过',
                                line))
                            continue
                        avatar_layers.add(layer_id)
                        avatar_id = payload.get('avatar_id')
                        if avatar_id is not None and not avatar_belongs(avatar_id, character):
                            diagnostics.append(_diag(
                                'warning', 'avatar_not_found',
                                f'角色「{name}」没有 id={avatar_id} 的立绘，改用默认立绘', line))
                            payload['avatar_id'] = None
                    payload['character_id'] = int(character.character_id)
                    payload['layer_id'] = layer_id

                db.session.add(ContentDirective(
                    project_id=project_id,
                    content_id=content_id,
                    directive_type=dtype,
                    payload=payload,
                    order_num=order,
                ))
                directive_rows += 1
                source_map['directives'].append({
                    'content_id': content_id,
                    'directive_type': dtype,
                    'line': line,
                })

        compile_json = {
            'stats': report['stats'],
            'diagnostics': diagnostics,
            'branch_suggestions': report['branch_suggestions'],
            'variable_suggestions': report['variable_suggestions'],
            'labels': parsed.get('labels') or {},
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
            'branches': branch_rows,
            'directives': directive_rows,
            'labels': len(label_target),
            'characters': created_chars,
        },
        'stats': report['stats'],
        'diagnostics': diagnostics,
        'branch_suggestions': report['branch_suggestions'],
        'variable_suggestions': report['variable_suggestions'],
        'source_map': source_map,
        'first': first,
        'project_title': project_title,
    }
