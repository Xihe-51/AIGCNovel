# -*- coding: utf-8 -*-
"""编译报告：对解析后的 AST 做统计、诊断与分支/变量建议。

这一层不写数据库，只输出可序列化的报告，便于预览接口和测试复用。
"""
MAX_PREVIEW_CHAPTERS = 40
MAX_PREVIEW_SCENES = 20
MAX_PREVIEW_NODES = 6

ASSET_DIRECTIVE_LABELS = {
    'background': '@bg',
    'music': '@bgm',
    'sound': '@sound',
}

VARIABLE_KEYWORDS = [
    (('好感', '喜欢', '爱意', '心动', '恋爱'), '好感度', '文本出现好感/恋爱语义'),
    (('信任', '怀疑', '相信'), '信任', '文本出现信任/怀疑语义'),
    (('勇气', '害怕', '恐惧'), '勇气', '文本出现勇气/恐惧语义'),
    (('线索', '证据', '真相', '推理'), '线索', '文本出现线索/推理语义'),
    (('时间', '天数', '倒计时'), '天数', '文本出现时间/天数语义'),
]


def snippet(text, size=60):
    t = (text or '').replace('\n', ' ').strip()
    return t[:size] + ('…' if len(t) > size else '')


def _branch_like(text):
    t = str(text or '')
    if t.endswith('？') or t.endswith('?'):
        return True
    return any(k in t for k in ('选择', '是否', '要不要', '该不该', '如果', '难道'))


def _node_label_map(parsed):
    """标签名 → 实际承载该标签的节点行号（重复标签只认首个）。"""
    mapping = {}
    for chapter in parsed['chapters']:
        for scene in chapter['scenes']:
            for node in scene['nodes']:
                for name in node.get('labels') or []:
                    mapping.setdefault(name, node['line'])
    return mapping


def _looks_like_asset(value):
    """资源地址至少要带路径分隔符，否则播放器拼接阶段会得到无效链接。"""
    return '/' in value


def _directive_asset_diagnostics(parsed):
    """校验演出指令里的资源地址：写成自然语言描述时给出可定位的提示。"""
    diagnostics = []
    for chapter in parsed['chapters']:
        for scene in chapter['scenes']:
            for node in scene['nodes']:
                for directive in node.get('directives') or []:
                    label = ASSET_DIRECTIVE_LABELS.get(directive.get('type'))
                    if not label:
                        continue
                    payload = directive.get('payload') or {}
                    url = str(payload.get('url') or '').strip()
                    if not url or _looks_like_asset(url):
                        continue
                    diagnostics.append({
                        'level': 'warning', 'code': 'directive_asset_suspect',
                        'message': (
                            f'{label} 的值「{snippet(url, 20)}」不像资源路径，'
                            '播放时会加载失败；请填写以 / 开头的资源地址'),
                        'line': directive.get('line'),
                    })
    return diagnostics


def _reference_diagnostics(parsed):
    """校验跳转/选项指向的标签：未定义会丢边，指向自身会被播放器忽略。"""
    defined = parsed.get('labels') or {}
    node_line = _node_label_map(parsed)
    diagnostics = []
    for chapter in parsed['chapters']:
        for scene in chapter['scenes']:
            for node in scene['nodes']:
                refs = []
                if node.get('jump'):
                    refs.append((node['jump']['target'], node['jump']['line'], '@jump'))
                for item in node.get('choices') or []:
                    refs.append((item['target'], item['line'], '选项'))
                for target, line, label in refs:
                    if target not in defined:
                        diagnostics.append({
                            'level': 'error', 'code': 'unresolved_label',
                            'message': f'{label}指向的标签「{target}」未定义，该分支不会生成',
                            'line': line,
                        })
                    elif node_line.get(target) == node['line']:
                        diagnostics.append({
                            'level': 'warning', 'code': 'self_loop_branch',
                            'message': f'{label}指向当前节点自身（标签「{target}」），该分支会被忽略',
                            'line': line,
                        })
    return diagnostics


def build_report(parsed, existing_names):
    """根据 AST 与项目已有角色名，生成统计、诊断与建议。"""
    node_total = dialogue_total = narration_total = choice_total = 0
    branch_total = directive_total = 0
    unknown = {}
    branch_suggestions = []
    variable_suggestions = []
    # parser 层已产出的语法诊断优先展示
    diagnostics = list(parsed.get('errors') or [])
    all_scenes = []

    for chapter in parsed['chapters']:
        for scene in chapter['scenes']:
            all_scenes.append((chapter, scene))
            for node in scene['nodes']:
                node_total += 1
                branch_total += len(node.get('choices') or []) + (1 if node.get('jump') else 0)
                directive_total += len(node.get('directives') or [])
                if node['kind'] == 'dialogue':
                    dialogue_total += 1
                    name = node['speaker'] or ''
                    if name and name not in existing_names:
                        unknown.setdefault(name, node['line'])
                elif node['kind'] == 'choice':
                    choice_total += 1
                else:
                    narration_total += 1

    for name, line in list(unknown.items())[:50]:
        diagnostics.append({
            'level': 'warning', 'code': 'unbound_character',
            'message': f'说话人「{name}」在项目角色里不存在，将按未绑定处理',
            'line': line,
        })

    # 标签引用校验：未定义 / 自环
    diagnostics.extend(_reference_diagnostics(parsed))
    # 指令资源校验：@bg / @bgm / @sound 写成描述文字时提示改路径
    diagnostics.extend(_directive_asset_diagnostics(parsed))

    # 分支建议：优先看每个场景末尾的问句/选择语义
    for chapter, scene in all_scenes:
        if len(branch_suggestions) >= 3:
            break
        for node in scene['nodes'][-2:]:
            # 已有显式选项的节点不再重复建议
            if node['kind'] == 'choice':
                continue
            if _branch_like(node['text']):
                branch_suggestions.append({
                    'line': node['line'],
                    'scene_title': scene['title'],
                    'preview': snippet(node['text'], 40),
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
            'choice_count': choice_total,
            'branch_count': branch_total,
            'directive_count': directive_total,
            'label_count': len(parsed.get('labels') or {}),
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


def structure_preview(parsed):
    """截取 AST 的有限层级，供前端预览编译结构。"""
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
                        'text': snippet(n['text'], 80),
                        'choices': len(n.get('choices') or []),
                        'labels': list(n.get('labels') or []),
                        'has_jump': bool(n.get('jump')),
                        'directive_count': len(n.get('directives') or []),
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
