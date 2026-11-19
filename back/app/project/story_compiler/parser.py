# -*- coding: utf-8 -*-
"""小说 / 文本剧本解析器：源文本 → 结构化 AST。

AST 仍使用字典结构，保持与既有编译流程完全兼容：

    {
        'filename': str,
        'chapters': [
            {
                'title': str,
                'line': int | None,
                'scenes': [
                    {
                        'title': str,
                        'line': int | None,
                        'nodes': [
                            {
                                'line': int,
                                'kind': 'dialogue' | 'narration' | 'choice',
                                'speaker': str | None,
                                'text': str,
                                'original': str,
                                'speaker_source': 'explicit' | 'narration',
                                # 以下字段按需出现
                                'labels': [str],
                                'directives': [{'type': str, 'payload': dict, 'line': int}],
                                'jump': {'target': str, 'line': int},
                                'choices': [{'text': str, 'target': str, 'line': int}],
                            },
                        ],
                    },
                ],
            },
        ],
        'labels': {name: {'line': int}},
        'errors': [{'level', 'code', 'message', 'line'}],
    }

纯小说文本不含任何 ``@`` 指令时，解析结果与旧行为完全一致。
"""
import re

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

# ==================== .story 指令 ====================
# @bg / @bgm / @sound / @show / @hide / @wait / @label / @jump / @choice
DIRECTIVE_RE = re.compile(r'^@([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$')
# #标签：要求 # 后紧跟非空白字符，避免与 Markdown 的「# 标题」冲突
LABEL_LINE_RE = re.compile(r'^#([^\s#].*)$')
# 选项行：- 承认病情 -> 承认    /    * 继续否认 => #否认
CHOICE_OPTION_RE = re.compile(r'^[-*·]\s*(.+?)\s*(?:->|→|=>)\s*#?([^\s#]+)\s*$')

MAX_LABEL_LEN = 40


def _err(line, code, message, level='error'):
    return {'level': level, 'code': code, 'message': message, 'line': line}


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


def _parse_stage_directive(name, rest, line_no):
    """解析舞台指令；返回 (directive, error)。"""
    key = name.lower()
    arg = (rest or '').strip()

    if key in ('bg', 'background', '背景'):
        if not arg:
            return None, _err(line_no, 'directive_missing_arg',
                              '@bg 需要图片文件名或 URL，例如 @bg 20250909_102305_976.png')
        return {'type': 'background',
                'payload': {'url': arg, 'layer': 'background'},
                'line': line_no}, None

    if key in ('bgm', 'music', '音乐'):
        if not arg:
            return None, _err(line_no, 'directive_missing_arg',
                              '@bgm 需要音频文件名或 URL，例如 @bgm theme.mp3')
        return {'type': 'music',
                'payload': {'url': arg, 'action': 'play', 'loop': True},
                'line': line_no}, None

    if key in ('sound', '音效'):
        if not arg:
            return None, _err(line_no, 'directive_missing_arg',
                              '@sound 需要音频文件名或 URL')
        return {'type': 'sound', 'payload': {'url': arg}, 'line': line_no}, None

    if key in ('show', '立绘'):
        parts = arg.split()
        if not parts:
            return None, _err(line_no, 'directive_missing_arg',
                              '@show 需要角色名，例如 @show 林瑶 28')
        avatar_id = None
        if len(parts) > 1 and parts[1].isdigit():
            avatar_id = int(parts[1])
        return {'type': 'avatar',
                'payload': {'action': 'show', 'character': parts[0],
                            'avatar_id': avatar_id},
                'line': line_no}, None

    if key in ('hide', '隐藏'):
        parts = arg.split()
        if not parts:
            return None, _err(line_no, 'directive_missing_arg',
                              '@hide 需要角色名，例如 @hide 林瑶')
        return {'type': 'avatar',
                'payload': {'action': 'hide', 'character': parts[0]},
                'line': line_no}, None

    if key in ('wait', '停顿'):
        if not arg.isdigit():
            return None, _err(line_no, 'directive_bad_arg',
                              '@wait 需要毫秒数，例如 @wait 500')
        return {'type': 'wait', 'payload': {'ms': int(arg)}, 'line': line_no}, None

    return None, _err(line_no, 'unknown_directive',
                      f'未知指令 @{name}；可用指令：bg / bgm / sound / show / hide / wait / label / jump / choice')


def parse_source(raw_text, filename=''):
    """把源文本解析成章节 / 场景 / 节点三级 AST。"""
    raw_text = str(raw_text or '')
    # 部分编辑器/Windows 记事本会在文件头写入 UTF-8 BOM，先去掉再识别标题
    if raw_text.startswith('\ufeff'):
        raw_text = raw_text[1:]
    lines = raw_text.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    chapters = []
    current_chapter = None
    current_scene = None
    labels = {}
    errors = []
    pending_directives = []
    pending_label = None
    pending_choice = None
    pending_label_line = None

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

    def close_choice():
        """结束选项块；@choice 后面没有任何选项时给出诊断。"""
        nonlocal pending_choice
        if pending_choice is not None:
            if not pending_choice['choices']:
                errors.append(_err(pending_choice['line'], 'choice_without_option',
                                   '@choice 后面没有「- 选项 -> 标签」行，选项节点将无法使用'))
            pending_choice = None

    def attach_pending(node):
        """把待挂的标签与舞台指令挂到下一条内容节点上。"""
        nonlocal pending_directives, pending_label, pending_label_line
        if pending_label:
            node.setdefault('labels', []).append(pending_label)
            pending_label = None
            pending_label_line = None
        if pending_directives:
            node.setdefault('directives', []).extend(pending_directives)
            pending_directives = []

    def flush_tail():
        """文件结尾仍有未消费的标签/指令时，尽量落到最后一条节点。"""
        nonlocal pending_directives, pending_label, pending_label_line
        tail = current_scene['nodes'][-1] if (current_scene and current_scene['nodes']) else None
        if pending_label:
            if tail is not None:
                tail.setdefault('labels', []).append(pending_label)
            else:
                labels.pop(pending_label, None)
                errors.append(_err(pending_label_line or None, 'label_without_node',
                                   f'标签「{pending_label}」后面没有内容，无法作为跳转目标'))
            pending_label = None
            pending_label_line = None
        if pending_directives:
            if tail is not None:
                tail.setdefault('directives', []).extend(pending_directives)
            else:
                for d in pending_directives:
                    errors.append(_err(d['line'], 'directive_orphan',
                                       '该指令所在位置没有内容节点，已忽略'))
            pending_directives = []

    for idx, raw in enumerate(lines, 1):
        text = raw.strip()
        if not text:
            continue

        line_no = idx

        # 选项行必须紧跟在 @choice 之后，否则视为普通正文
        m_opt = CHOICE_OPTION_RE.match(text)
        if m_opt and pending_choice is not None:
            pending_choice['choices'].append({
                'text': m_opt.group(1).strip(),
                'target': m_opt.group(2).strip(),
                'line': line_no,
            })
            continue

        close_choice()

        # ---------- 标题 ----------
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

        # ---------- #标签 ----------
        m = LABEL_LINE_RE.match(text)
        if m:
            name = m.group(1).strip()[:MAX_LABEL_LEN]
            if not name:
                continue
            if pending_label:
                errors.append(_err(pending_label_line, 'label_without_node',
                                   f'标签「{pending_label}」后面没有内容，无法作为跳转目标'))
                labels.pop(pending_label, None)
            if name in labels:
                errors.append(_err(line_no, 'duplicate_label',
                                   f'标签「{name}」重复定义（首次在第 {labels[name]["line"]} 行）'))
            else:
                labels[name] = {'line': line_no}
            pending_label = name
            pending_label_line = line_no
            continue

        # ---------- @指令 ----------
        m = DIRECTIVE_RE.match(text)
        if m:
            name = m.group(1).lower()
            rest = m.group(2)

            if name in ('label', '标签'):
                label_name = (rest or '').strip().lstrip('#')[:MAX_LABEL_LEN]
                if not label_name:
                    errors.append(_err(line_no, 'directive_missing_arg',
                                       '@label 需要标签名，例如 @label 结局'))
                    continue
                if pending_label:
                    errors.append(_err(pending_label_line, 'label_without_node',
                                       f'标签「{pending_label}」后面没有内容，无法作为跳转目标'))
                    labels.pop(pending_label, None)
                if label_name in labels:
                    errors.append(_err(line_no, 'duplicate_label',
                                       f'标签「{label_name}」重复定义（首次在第 {labels[label_name]["line"]} 行）'))
                else:
                    labels[label_name] = {'line': line_no}
                pending_label = label_name
                pending_label_line = line_no
                continue

            if name == 'jump':
                target = (rest or '').strip().lstrip('#')
                if not target:
                    errors.append(_err(line_no, 'directive_missing_arg',
                                       '@jump 需要目标标签名，例如 @jump 结局'))
                    continue
                scene = ensure_scene()
                if not scene['nodes']:
                    errors.append(_err(line_no, 'jump_without_source',
                                       '@jump 前面没有内容节点，无法配置自动跳转'))
                    continue
                tail = scene['nodes'][-1]
                if tail.get('kind') == 'choice':
                    errors.append(_err(line_no, 'jump_on_choice',
                                       '@jump 不能挂在选项节点上，请在各选项的「-> 标签」里配置走向'))
                    continue
                if tail.get('jump'):
                    errors.append(_err(line_no, 'jump_conflict',
                                       f'同一节点只能配置一条 @jump（第 {tail["jump"]["line"]} 行已配置）'))
                    continue
                tail['jump'] = {'target': target, 'line': line_no}
                continue

            if name in ('choice', '选择'):
                question = (rest or '').strip() or '你要怎么做？'
                scene = ensure_scene()
                node = {'line': line_no, 'kind': 'choice', 'speaker': None,
                        'text': question, 'original': text,
                        'speaker_source': 'explicit', 'choices': []}
                attach_pending(node)
                scene['nodes'].append(node)
                pending_choice = node
                continue

            directive, derr = _parse_stage_directive(name, rest, line_no)
            if derr:
                errors.append(derr)
            else:
                pending_directives.append(directive)
            continue

        # ---------- 正文 ----------
        node = _parse_node(text, line_no)
        if not node:
            continue
        scene = ensure_scene()
        if scene['nodes'] and scene['nodes'][-1].get('jump'):
            errors.append(_err(line_no, 'content_after_jump',
                               '@jump 之后的内容在正常流程中不可达，已被保留但不参与播放',
                               level='warning'))
        attach_pending(node)
        scene['nodes'].append(node)

    close_choice()
    flush_tail()

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
    return {'filename': filename, 'chapters': cleaned,
            'labels': labels, 'errors': errors}
