# -*- coding: utf-8 -*-
"""小说 / 文本剧本导入编译器（MVP）。

能力边界：
- 输入 TXT / Markdown 文本，规则识别章节、场景、对白、旁白、说话人；
- 生成预览（不写库）与正式入库（追加到现有项目）；
- 每个节点保留源文件行号，输出 source map，便于从诊断跳回源行；
- 输出编译诊断、保真度统计、分支/变量建议；
- 不自动创建分支或变量，避免破坏作者原意。
"""
import re
from datetime import datetime

from flask import jsonify, request

from .. import db
from ..models import (Character, ProjectSource, Scene, SceneChapter,
                      ScriptContent, StoryChapter)
from ..security import current_user_id
from . import project
from .save_views import _owned_project
from .services import update_project_word_count

MAX_SOURCE_CHARS = 300000
MAX_PREVIEW_CHAPTERS = 40
MAX_PREVIEW_SCENES = 20
MAX_PREVIEW_NODES = 6

# Markdown 标题：一級=章，二~四级=场景
CHAPTER_MD_RE = re.compile(r'^#\s+(.+)$')
SCENE_MD_RE = re.compile(r'^#{2,4}\s+(.+)$')
# 中文标题：允许「第一章 雨夜」「第一章：雨夜」「第一章雨夜」三种写法；
# 是否算标题由 _is_cn_heading 结合剩余文本判断，避免把「第一回合，他赢了」误判为章节。
CHAPTER_CN_RE = re.compile(r'^第[0-9一二三四五六七八九十百千零〇两]+([章卷回幕])(.*)$')
SCENE_CN_RE = re.compile(r'^第[0-9一二三四五六七八九十百千零〇两]+([场节])(.*)$')
SCENE_LABEL_RE = re.compile(r'^(?:场景|地点)\s*[：:]\s*(.+)$')
# 「场景一」「场景一走廊」「场景 2 走廊」这类写法
SCENE_NAMED_RE = re.compile(r'^场景[0-9一二三四五六七八九十百千零〇两]+(.*)$')

# 紧跟在标题标记后的叙述性词语，出现时更像正文而非标题
CN_HEADING_CONTINUATIONS = ('里', '中', '的', '是', '为', '讲', '说', '写',
                            '描', '主', '标', '内', '课', '发生', '结束', '开始')
# 无分隔符标题里出现这些主语/语气词时，更像正文句子
CN_SENTENCE_WORDS = ('他', '她', '我', '你', '它', '他们', '她们', '我们', '你们', '大家', '众人')
CN_SENTENCE_ENDINGS = ('了', '吗', '呢', '吧', '啊', '呀', '啦')


def _is_cn_heading(match):
    """判断「第X章/场 + 剩余文本」是否真的是标题。"""
    marker = match.group(1)
    rest = (match.group(2) or '').strip()
    if not rest:
        return True
    if rest[0] in ' \u3000：:':
        return True
    # 「第一回合」是“回合”，不是章回体的「第一回」
    if marker == '回' and rest.startswith('合'):
        return False
    # 正文句子通常带标点或明显叙述词
    if len(rest) > 30:
        return False
    if any(ch in rest for ch in '，。！？；,.!?;'):
        return False
    if any(word in rest for word in CN_SENTENCE_WORDS):
        return False
    if rest.endswith(CN_SENTENCE_ENDINGS):
        return False
    if any(rest.startswith(word) for word in CN_HEADING_CONTINUATIONS):
        return False
    return True


def _is_named_scene_heading(match):
    rest = (match.group(1) or '').strip()
    if not rest:
        return True
    if rest[0] in ' \u3000：:':
        return True
    if len(rest) > 30:
        return False
    if any(ch in rest for ch in '，。！？；,.!?;'):
        return False
    if any(word in rest for word in CN_SENTENCE_WORDS):
        return False
    if rest.endswith(CN_SENTENCE_ENDINGS):
        return False
    if any(rest.startswith(word) for word in CN_HEADING_CONTINUATIONS):
        return False
    return True

# 说话人标记
BRACKET_RE = re.compile(r'^【([^】]{1,24})】\s*(.+)$')
NAME_QUOTE_RE = re.compile(r'^([^\s：:，。！？、“”「」『』\[\]【】（）()]{1,12})\s*[“「『](.+)[”」』]\s*$')
COLON_RE = re.compile(r'^([^\s：:，。！？、“”「」『』\[\]【】（）()]{1,12})[：:]\s*(.+)$')

NARRATOR_NAMES = {'旁白', '独白', '画外音', '内心', '心声', '叙述', '旁白君'}
# 冒号左侧更像叙述动词时，不当成说话人
NON_NAME_PREFIXES = (
    '他说', '她说', '我说', '心想', '心里', '低声', '轻声', '沉声', '声音',
    '只听', '忽然', '突然', '于是', '然后', '接着', '随后', '这时', '此时',
    # 常见小说元信息行，避免把「时间：深夜」误识别成角色
    '时间', '天气', '日期', '备注', '标题', '背景', '注',
)

VARIABLE_KEYWORDS = [
    (('好感', '喜欢', '爱意', '心动', '恋爱'), '好感度', '文本出现好感/恋爱语义'),
    (('信任', '怀疑', '相信'), '信任', '文本出现信任/怀疑语义'),
    (('勇气', '害怕', '恐惧'), '勇气', '文本出现勇气/恐惧语义'),
    (('线索', '证据', '真相', '推理'), '线索', '文本出现线索/推理语义'),
    (('时间', '天数', '倒计时'), '天数', '文本出现时间/天数语义'),
]


def _snippet(text, size=60):
    t = (text or '').replace('\n', ' ').strip()
    return t[:size] + ('…' if len(t) > size else '')


def _strip_quotes(text):
    t = (text or '').strip()
    if len(t) >= 2 and ((t[0] == '“' and t[-1] == '”') or (t[0] == '「' and t[-1] == '」')
                        or (t[0] == '『' and t[-1] == '』') or (t[0] == '"' and t[-1] == '"')):
        return t[1:-1].strip()
    return t


def _looks_like_narration_prefix(name):
    if any(str(name).startswith(p) for p in NON_NAME_PREFIXES):
        return True
    # 名字后面带说话动作，例如「李暮尘低声说」「林瑶笑着说」
    if len(str(name)) >= 3:
        if any(k in str(name) for k in ('低声', '轻声', '沉声', '大声', '小声',
                                        '冷笑', '笑着', '哭着', '喃喃')):
            return True
        if str(name).endswith(('说道', '说', '道', '问', '答', '喊', '叫', '笑', '叹')):
            return True
    return False


def _parse_node(line, line_no):
    """把一行文本解析成节点；无法识别说话人时按旁白处理。"""
    text = str(line or '').strip()
    if not text:
        return None

    m = BRACKET_RE.match(text)
    if m:
        name = m.group(1).strip()
        body = _strip_quotes(m.group(2))
        if name in NARRATOR_NAMES:
            return {'line': line_no, 'kind': 'narration', 'speaker': None,
                    'text': body, 'original': text, 'speaker_source': 'explicit'}
        return {'line': line_no, 'kind': 'dialogue', 'speaker': name,
                'text': body, 'original': text, 'speaker_source': 'explicit'}

    m = NAME_QUOTE_RE.match(text)
    if m and not _looks_like_narration_prefix(m.group(1)):
        name = m.group(1).strip()
        if name not in NARRATOR_NAMES:
            return {'line': line_no, 'kind': 'dialogue', 'speaker': name,
                    'text': _strip_quotes(m.group(2)), 'original': text,
                    'speaker_source': 'explicit'}

    m = COLON_RE.match(text)
    if m and not _looks_like_narration_prefix(m.group(1)):
        name = m.group(1).strip()
        body = _strip_quotes(m.group(2))
        if name in NARRATOR_NAMES:
            return {'line': line_no, 'kind': 'narration', 'speaker': None,
                    'text': body, 'original': text, 'speaker_source': 'explicit'}
        return {'line': line_no, 'kind': 'dialogue', 'speaker': name,
                'text': body, 'original': text, 'speaker_source': 'explicit'}

    return {'line': line_no, 'kind': 'narration', 'speaker': None,
            'text': _strip_quotes(text), 'original': text, 'speaker_source': 'narration'}


def _parse_source(raw_text, filename=''):
    lines = str(raw_text or '').replace('\r\n', '\n').replace('\r', '\n').split('\n')
    chapters = []
    current_chapter = None
    current_scene = None

    def ensure_chapter(title=None, line=None):
        nonlocal current_chapter
        if current_chapter is None or title:
            current_chapter = {
                'title': (title or '正文').strip()[:100] or '正文',
                'line': line,
                'scenes': [],
            }
            chapters.append(current_chapter)
        return current_chapter

    def ensure_scene(title=None, line=None):
        nonlocal current_scene
        chapter = ensure_chapter()
        if current_scene is None or title:
            scene_index = len(chapter['scenes']) + 1
            if title:
                scene_title = title.strip()[:100]
            elif chapter['title'] != '正文':
                scene_title = f"{chapter['title']} · 场景 {scene_index}"
            else:
                scene_title = f"场景 {scene_index}"
            current_scene = {'title': scene_title or '导入内容', 'line': line, 'nodes': []}
            chapter['scenes'].append(current_scene)
        return current_scene

    for idx, raw in enumerate(lines, 1):
        text = raw.strip()
        if not text:
            continue

        line_no = idx

        m = SCENE_MD_RE.match(text)
        if m:
            ensure_chapter()
            ensure_scene(m.group(1), line_no)
            continue

        m = CHAPTER_MD_RE.match(text)
        if m:
            ensure_chapter(m.group(1), line_no)
            current_scene = None
            continue

        m = CHAPTER_CN_RE.match(text)
        if m and _is_cn_heading(m):
            ensure_chapter(text, line_no)
            current_scene = None
            continue

        m_scene = SCENE_CN_RE.match(text)
        m_label = None if m_scene else SCENE_LABEL_RE.match(text)
        m_named = None if (m_scene or m_label) else SCENE_NAMED_RE.match(text)
        if (m_scene and _is_cn_heading(m_scene)) or m_label or \
                (m_named and _is_named_scene_heading(m_named)):
            ensure_chapter()
            title = text if m_label is None else m_label.group(1)
            ensure_scene(title, line_no)
            continue

        node = _parse_node(text, line_no)
        if node:
            ensure_scene()['nodes'].append(node)

    # 去掉没有任何节点的空章节/空场景
    cleaned = []
    for chapter in chapters:
        scenes = [s for s in chapter['scenes'] if s['nodes']]
        if scenes:
            chapter['scenes'] = scenes
            cleaned.append(chapter)
    if not cleaned:
        cleaned = [{
            'title': '正文',
            'line': None,
            'scenes': [{'title': '导入内容', 'line': None, 'nodes': []}],
        }]
    return {'filename': filename, 'chapters': cleaned}


def _branch_like(text):
    t = str(text or '')
    if t.endswith('？') or t.endswith('?'):
        return True
    return any(k in t for k in ('选择', '是否', '要不要', '该不该', '如果', '难道'))


def _build_report(parsed, existing_names):
    node_total = dialogue_total = narration_total = 0
    unknown = {}
    branch_suggestions = []
    variable_suggestions = []
    diagnostics = []
    all_scenes = []

    for chapter in parsed['chapters']:
        for scene in chapter['scenes']:
            all_scenes.append((chapter, scene))
            for node in scene['nodes']:
                node_total += 1
                if node['kind'] == 'dialogue':
                    dialogue_total += 1
                    name = node['speaker'] or ''
                    if name and name not in existing_names:
                        unknown.setdefault(name, node['line'])
                else:
                    narration_total += 1

    for name, line in list(unknown.items())[:50]:
        diagnostics.append({
            'level': 'warning', 'code': 'unbound_character',
            'message': f'说话人「{name}」在项目角色里不存在，将按未绑定处理',
            'line': line,
        })

    # 分支建议：优先看每个场景末尾的问句/选择语义
    for chapter, scene in all_scenes:
        if len(branch_suggestions) >= 3:
            break
        for node in scene['nodes'][-2:]:
            if _branch_like(node['text']):
                branch_suggestions.append({
                    'line': node['line'],
                    'scene_title': scene['title'],
                    'preview': _snippet(node['text'], 40),
                    'reason': '该句带疑问或选择语义，适合插入分支选项',
                })
                break

    # 变量建议：按关键词做一次轻量提示，不自动写入
    seen_vars = set()
    for chapter, scene in all_scenes:
        for node in scene['nodes']:
            for keys, name, reason in VARIABLE_KEYWORDS:
                if name in seen_vars:
                    continue
                if any(k in node['text'] for k in keys):
                    seen_vars.add(name)
                    variable_suggestions.append({
                        'name': name, 'line': node['line'],
                        'scene_title': scene['title'], 'reason': reason,
                    })
                    break

    for item in variable_suggestions[:3]:
        diagnostics.append({
            'level': 'info', 'code': 'variable_suggestion',
            'message': f'建议新增变量「{item["name"]}」：{item["reason"]}',
            'line': item['line'],
        })
    for item in branch_suggestions:
        diagnostics.append({
            'level': 'info', 'code': 'branch_suggestion',
            'message': f'「{item["scene_title"]}」可考虑在此加入分支：{item["preview"]}',
            'line': item['line'],
        })

    if node_total == 0:
        diagnostics.append({
            'level': 'error', 'code': 'empty_source',
            'message': '没有解析到任何台词或旁白，请检查文本内容',
            'line': None,
        })
    if dialogue_total == 0 and node_total:
        diagnostics.append({
            'level': 'warning', 'code': 'no_dialogue',
            'message': '全文没有识别到对白，全部按旁白处理；如有人物对白请使用「角色：台词」格式',
            'line': None,
        })
    if len(parsed['chapters']) == 1 and parsed['chapters'][0]['title'] == '正文':
        diagnostics.append({
            'level': 'info', 'code': 'no_chapter_heading',
            'message': '没有识别到章节标题，全部内容将放在一个默认章节中',
            'line': None,
        })

    scene_total = sum(len(c['scenes']) for c in parsed['chapters'])
    return {
        'stats': {
            'line_count': node_total,
            'node_count': node_total,
            'dialogue_count': dialogue_total,
            'narration_count': narration_total,
            'chapter_count': len(parsed['chapters']),
            'scene_count': scene_total,
            'character_total': len(existing_names) + len(unknown),
            'character_bound': len(existing_names),
            'character_unknown': len(unknown),
            'unknown_speakers': list(unknown.keys())[:20],
            'branch_suggestion_count': len(branch_suggestions),
            'variable_suggestion_count': len(variable_suggestions),
            # 规则编译不改写原文，原文保真度按 100% 标记
            'source_preserved_pct': 100,
        },
        'diagnostics': diagnostics[:80],
        'branch_suggestions': branch_suggestions,
        'variable_suggestions': variable_suggestions[:3],
    }


def _structure_preview(parsed):
    chapters = []
    for chapter in parsed['chapters'][:MAX_PREVIEW_CHAPTERS]:
        scenes = []
        for scene in chapter['scenes'][:MAX_PREVIEW_SCENES]:
            scenes.append({
                'title': scene['title'],
                'line': scene['line'],
                'node_count': len(scene['nodes']),
                'preview': [
                    {
                        'line': n['line'],
                        'kind': n['kind'],
                        'speaker': n['speaker'],
                        'text': _snippet(n['text'], 80),
                    }
                    for n in scene['nodes'][:MAX_PREVIEW_NODES]
                ],
            })
        chapters.append({
            'title': chapter['title'],
            'line': chapter['line'],
            'scene_count': len(chapter['scenes']),
            'node_count': sum(len(s['nodes']) for s in chapter['scenes']),
            'scenes': scenes,
        })
    return {
        'chapters': chapters,
        'truncated': (
            len(parsed['chapters']) > MAX_PREVIEW_CHAPTERS
            or any(len(c['scenes']) > MAX_PREVIEW_SCENES for c in parsed['chapters'])
        ),
    }


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


@project.route('/story_compile/<int:project_id>/preview', methods=['POST'])
def story_compile_preview(project_id):
    _, err = _owned_project(project_id)
    if err:
        return err

    data, body, err = _payload_text()
    if err:
        return err
    text, filename = body
    fmt = str(data.get('format') or ('markdown' if filename.lower().endswith(('.md', '.markdown')) else 'txt'))

    parsed = _parse_source(text, filename)
    existing = Character.query.filter_by(project_id=project_id).all()
    existing_names = {c.name.strip() for c in existing if c.name}
    report = _build_report(parsed, existing_names)

    return jsonify({
        'success': True,
        'data': {
            'filename': filename,
            'format': fmt,
            'stats': report['stats'],
            'diagnostics': report['diagnostics'],
            'branch_suggestions': report['branch_suggestions'],
            'variable_suggestions': report['variable_suggestions'],
            'structure': _structure_preview(parsed),
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
    fmt = str(data.get('format') or ('markdown' if filename.lower().endswith(('.md', '.markdown')) else 'txt'))
    create_characters = bool(data.get('create_characters', True))
    create_chapters = bool(data.get('create_chapters', True))

    parsed = _parse_source(text, filename)
    existing = Character.query.filter_by(project_id=project_id).all()
    existing_names = {c.name.strip(): c for c in existing if c.name}
    report = _build_report(parsed, set(existing_names.keys()))
    if report['stats']['node_count'] == 0:
        return jsonify({'success': False, 'message': '没有解析到任何台词或旁白'}), 400

    uid = current_user_id()
    created_chars = []
    source_map = {'chapters': [], 'scenes': [], 'nodes': []}
    scene_index = 0
    node_index = 0

    try:
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
                        created_chars.append({'character_id': int(character.character_id), 'name': speaker})

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
                    node_index += 1
                    source_map['nodes'].append({
                        'content_id': int(row.content_id),
                        'scene_id': int(scene_row.scene_id),
                        'line': node['line'],
                        'kind': node['kind'],
                        'speaker': speaker,
                        'character_id': character_id,
                        'content_type': content_type,
                        'text': _snippet(node['text'], 80),
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
            content=text,
            compile_json=compile_json,
        )
        db.session.add(source_row)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'写入失败：{exc}'}), 500

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

    return jsonify({
        'success': True,
        'data': {
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
            'project_title': project_row.title,
        },
    }), 201


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
