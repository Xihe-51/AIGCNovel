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
                                'kind': 'dialogue' | 'narration',
                                'speaker': str | None,
                                'text': str,
                                'original': str,
                                'speaker_source': 'explicit' | 'narration',
                            },
                        ],
                    },
                ],
            },
        ],
    }
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


def parse_source(raw_text, filename=''):
    """把源文本解析成章节 / 场景 / 节点三级 AST。"""
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
