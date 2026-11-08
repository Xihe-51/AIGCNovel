# -*- coding: utf-8 -*-
"""多形态导出：主线小说 DOCX、有声剧脚本 DOCX。"""
import os
from io import BytesIO


def _file_name(url):
    return os.path.basename(str(url or '').replace('\\', '/')) or '未命名'


def _line_text(name, text):
    """避免角色名与台词里已有的「名字：」前缀重复。"""
    t = str(text or '').strip()
    if not name:
        return t
    for sep in ('：', ':'):
        prefix = f'{name}{sep}'
        if t.startswith(prefix):
            return t[len(prefix):].strip()
    return t


def detect_emotion(text):
    """规则推断情绪，仅作为配音导演的起点，允许作者修改。"""
    t = str(text or '')
    if any(k in t for k in ('哭', '呜咽', '泪', '抽泣')):
        return '哭腔'
    if t.rstrip().endswith(('！', '!')):
        return '激动'
    if '……' in t or t.rstrip().endswith(('？', '?')):
        return '犹豫'
    if any(k in t for k in ('低声', '轻轻', '叹息')):
        return '低沉'
    return '平静'


def build_novel_docx(project_title, route_result):
    """把一条主线路线展开成线性小说。"""
    from docx import Document

    doc = Document()
    doc.add_heading(project_title, level=0)
    ending = route_result.get('ending')
    if ending:
        doc.add_paragraph(f"路线结局：{ending.get('title') or '未命名结局'}")
    else:
        doc.add_paragraph('路线终点：未触发结局')
    requested = route_result.get('requested_ending')
    if requested and not ending:
        doc.add_paragraph(f"指定结局「{requested.get('title')}」在当前条件下不可达。")
    elif requested and ending and int(ending.get('ending_id')) != int(requested.get('ending_id')):
        doc.add_paragraph(f"指定结局「{requested.get('title')}」在当前条件下不可达，已导出实际路线。")

    current_scene_id = None
    for node in route_result.get('route', []):
        scene_id = node.get('scene_id')
        if scene_id != current_scene_id:
            current_scene_id = scene_id
            doc.add_heading(node.get('scene_title') or f'场景 {scene_id}', level=1)
        text = str(node.get('text') or '').strip()
        if not text:
            continue
        if node.get('content_type') == '选择':
            p = doc.add_paragraph(f"【选择】{text}")
            try:
                p.style = 'Intense Quote'
            except KeyError:
                pass
        elif node.get('character_name'):
            doc.add_paragraph(f"{node['character_name']}：{_line_text(node['character_name'], text)}")
        else:
            doc.add_paragraph(text)

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def build_audio_script_docx(project_title, route_result):
    """生成有声剧脚本：角色、台词、情绪、BGM/音效/停顿提示。"""
    from docx import Document

    doc = Document()
    doc.add_heading(f"{project_title} · 有声剧脚本", level=0)
    doc.add_paragraph('说明：情绪优先取台词上标注的情绪标签，未标注时按文本规则推断；BGM/音效来自当前主线的演出指令。')

    current_scene_id = None
    for node in route_result.get('route', []):
        scene_id = node.get('scene_id')
        if scene_id != current_scene_id:
            current_scene_id = scene_id
            doc.add_heading(node.get('scene_title') or f'场景 {scene_id}', level=1)
            if node.get('scene_music'):
                doc.add_paragraph(f"【BGM】场景音乐：{_file_name(node['scene_music'])}")

        for directive in node.get('directives') or []:
            dtype = directive.get('directive_type')
            payload = directive.get('payload') or {}
            if dtype == 'music':
                action = payload.get('action') or 'play'
                if action == 'stop':
                    doc.add_paragraph('【BGM】停止')
                else:
                    doc.add_paragraph(f"【BGM】播放：{_file_name(payload.get('url'))}")
            elif dtype == 'sound':
                doc.add_paragraph(f"【音效】{_file_name(payload.get('url'))}")
            elif dtype == 'wait':
                ms = int(payload.get('ms') or 0)
                doc.add_paragraph(f"【停顿】{round(ms / 1000, 1)} 秒")

        text = str(node.get('text') or '').strip()
        if not text:
            continue
        if node.get('content_type') == '选择':
            doc.add_paragraph(f"【选择】{text}")
        elif node.get('character_name'):
            emotion = node.get('emotion') or detect_emotion(text)
            doc.add_paragraph(f"{node['character_name']}（{emotion}）：{_line_text(node['character_name'], text)}")
        else:
            doc.add_paragraph(f"旁白：{text}")

    ending = route_result.get('ending')
    if ending:
        doc.add_paragraph(f"【结局】{ending.get('title') or '未命名结局'}")
    requested = route_result.get('requested_ending')
    if requested and not ending:
        doc.add_paragraph(f"【提示】指定结局「{requested.get('title')}」在当前条件下不可达。")
    elif requested and ending and int(ending.get('ending_id')) != int(requested.get('ending_id')):
        doc.add_paragraph(f"【提示】指定结局「{requested.get('title')}」不可达，已导出实际路线。")

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()

def _position_label(x):
    try:
        value = float(x)
    except (TypeError, ValueError):
        value = 50.0
    if value < 35:
        return '左'
    if value > 65:
        return '右'
    return '中'


def _legacy_x(position):
    return {'left': 20.0, 'center': 50.0, 'right': 80.0}.get(str(position or 'center'), 50.0)


def _effect_hint(payload):
    effect = str((payload or {}).get('effect') or '').strip()
    if effect == 'shake':
        return '手持晃动'
    if effect == 'flash':
        return '闪白转场'
    if effect == 'weather':
        return '天气环境：' + str(payload.get('weather') or 'rain')
    return ('特效：' + effect) if effect else ''


def _set_storyboard_cell(cell, lines, bold=False):
    from docx.shared import Pt

    cell.text = ''
    first = True
    for line in (lines or ['']):
        paragraph = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        run = paragraph.add_run(str(line))
        run.bold = bold
        run.font.size = Pt(8.5)
        paragraph.paragraph_format.space_after = Pt(0)
        paragraph.paragraph_format.line_spacing = 1.0


def build_storyboard_docx(project_title, route_result):
    """按路线生成动态漫 / 短视频分镜脚本 DOCX。"""
    from docx import Document
    from docx.enum.section import WD_ORIENT
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Cm

    doc = Document()
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    if section.page_width < section.page_height:
        section.page_width, section.page_height = section.page_height, section.page_width
    section.left_margin = Cm(1.6)
    section.right_margin = Cm(1.6)
    section.top_margin = Cm(1.4)
    section.bottom_margin = Cm(1.4)

    doc.add_heading(project_title + ' · 动态漫分镜脚本', level=0)
    doc.add_paragraph('说明：按当前路线逐镜导出。画面、镜头建议与时长由台词长度、角色立绘、演出指令和转场估算，可在动态漫 / 视频工具中继续调整。')

    route = route_result.get('route') or []
    characters_map = route_result.get('characters') or {}
    avatars_map = route_result.get('avatars') or {}
    choices_by_content = {int(c.get('content_id')): c for c in (route_result.get('choices') or [])
                          if c.get('content_id') is not None}

    ending = route_result.get('ending')
    doc.add_paragraph('路线结局：' + (ending.get('title') if ending else '未触发结局'))
    requested = route_result.get('requested_ending')
    if requested and not ending:
        doc.add_paragraph('指定结局「' + str(requested.get('title')) + '」在当前条件下不可达，已导出实际路线。')
    elif requested and ending and int(ending.get('ending_id')) != int(requested.get('ending_id')):
        doc.add_paragraph('指定结局「' + str(requested.get('title')) + '」不可达，已导出实际路线。')

    speakers = []
    for node in route:
        name = node.get('character_name')
        if name and name not in speakers:
            speakers.append(name)
    if speakers:
        doc.add_paragraph('出场角色：' + '、'.join(speakers))

    headers = ['镜号', '场景', '画面（背景 / 立绘）', '台词 / 旁白', '情绪', '镜头建议', '时长 / 声音']
    widths = [Cm(1.1), Cm(2.7), Cm(6.0), Cm(8.0), Cm(1.6), Cm(3.6), Cm(3.0)]
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for index, header in enumerate(headers):
        cell = table.rows[0].cells[index]
        _set_storyboard_cell(cell, [header], bold=True)
        cell.width = widths[index]
    header_tr = table.rows[0]._tr
    header_props = header_tr.get_or_add_trPr()
    repeat_header = OxmlElement('w:tblHeader')
    repeat_header.set(qn('w:val'), 'true')
    header_props.append(repeat_header)

    current_scene_id = None
    current_bg = ''
    current_fg = ''
    current_music = ''
    active_layers = {}
    shot_no = 0
    total_duration = 0.0

    for node in route:
        cid = int(node.get('content_id') or 0)
        sid = node.get('scene_id')
        scene_changed = sid != current_scene_id
        if scene_changed:
            current_scene_id = sid
            current_music = _file_name(node.get('scene_music')) if node.get('scene_music') else ''
        # 与播放器一致：每个节点重置舞台，只显示当前节点指令里的立绘和背景
        current_bg = _file_name(node.get('scene_background')) if node.get('scene_background') else ''
        current_fg = ''
        active_layers = {}

        background_changed = False
        avatar_changed = ''
        effect_hint = ''
        notes = []
        wait_seconds = 0.0
        if scene_changed and current_music:
            notes.append('BGM：' + current_music)

        for directive in node.get('directives') or []:
            dtype = directive.get('directive_type')
            payload = directive.get('payload') or {}
            if dtype == 'avatar':
                layer_id = str(payload.get('layer_id') or payload.get('position') or 'center')
                if str(payload.get('action') or '') == 'hide':
                    if layer_id in active_layers:
                        active_layers.pop(layer_id, None)
                        avatar_changed = avatar_changed or 'hide'
                    continue
                character_id = payload.get('character_id')
                avatar_id = payload.get('avatar_id')
                name = characters_map.get(int(character_id), '') if character_id else ''
                if not name:
                    name = str(payload.get('layer_name') or '角色')
                avatar_info = avatars_map.get(int(avatar_id), {}) if avatar_id else {}
                image_url = payload.get('image_url') or avatar_info.get('image_url') or ''
                if payload.get('x') is not None:
                    try:
                        x = float(payload.get('x') or 0)
                    except (TypeError, ValueError):
                        x = 50.0
                elif payload.get('position'):
                    x = _legacy_x(payload.get('position'))
                elif payload.get('coord') != 'stage':
                    x = _legacy_x(layer_id)
                else:
                    x = 50.0
                existed = layer_id in active_layers
                active_layers[layer_id] = {
                    'name': name,
                    'x': x,
                    'image': _file_name(image_url) if image_url else '',
                }
                if not avatar_changed:
                    avatar_changed = 'move' if existed else 'show'
            elif dtype == 'background':
                if payload.get('layer') == 'foreground':
                    current_fg = _file_name(payload.get('url')) if payload.get('url') else ''
                    notes.append('前景：' + (current_fg or '清除'))
                elif payload.get('url'):
                    current_bg = _file_name(payload.get('url'))
                    background_changed = True
                    notes.append('转场：' + str(payload.get('transition') or 'fade'))
            elif dtype == 'music':
                if str(payload.get('action') or 'play') == 'stop':
                    current_music = ''
                    notes.append('BGM：停止')
                elif payload.get('url'):
                    current_music = _file_name(payload.get('url'))
                    notes.append('BGM：' + current_music)
            elif dtype == 'sound' and payload.get('url'):
                notes.append('音效：' + _file_name(payload.get('url')))
            elif dtype == 'wait':
                try:
                    wait_ms = max(0, int(payload.get('ms') or 0))
                except (TypeError, ValueError):
                    wait_ms = 0
                wait_seconds += wait_ms / 1000.0
                if wait_ms:
                    notes.append('停顿：' + str(round(wait_ms / 1000.0, 1)) + ' 秒')
            elif dtype == 'effect':
                effect_hint = _effect_hint(payload)
                if effect_hint:
                    notes.append(effect_hint)
            elif dtype == 'stage':
                flags = []
                for key, label in (('background', '背景'), ('foreground', '前景'), ('dialogue', '对话框')):
                    if isinstance(payload.get(key), bool):
                        flags.append(label + ('显示' if payload.get(key) else '隐藏'))
                if flags:
                    notes.append('舞台：' + '、'.join(flags))

        visual = ['背景：' + (current_bg or '无')]
        if current_fg:
            visual.append('前景：' + current_fg)
        if active_layers:
            ordered = sorted(active_layers.values(), key=lambda item: item['x'])
            labels = []
            seen = set()
            for layer in ordered:
                label = layer['name'] + '（' + _position_label(layer['x']) + '）'
                if label not in seen:
                    seen.add(label)
                    labels.append(label)
            visual.append('角色：' + '、'.join(labels))
        elif node.get('character_name'):
            visual.append('角色：' + str(node.get('character_name')) + '（默认立绘）')
        else:
            visual.append('角色：无 / 空镜')

        text = str(node.get('text') or '').strip()
        content_type = node.get('content_type')
        options = []
        if content_type == '选择':
            choice = choices_by_content.get(cid) or {}
            options = choice.get('options') or []
            chosen_path_id = int(choice.get('chosen_path_id') or 0)
            dialogue = ['【选择】' + text]
            for option in options:
                marker = '▶' if int(option.get('path_id') or 0) == chosen_path_id else '　'
                dialogue.append(marker + ' ' + str(option.get('choice_text') or '继续'))
            emotion = '—'
        elif node.get('character_name'):
            emotion = str(node.get('emotion') or detect_emotion(text) or '平静')
            dialogue = [str(node.get('character_name')) + '：' + _line_text(node.get('character_name'), text)]
        else:
            emotion = '—'
            dialogue = [('旁白：' + text) if text else '（无台词，展示画面）']

        if scene_changed or background_changed:
            camera = '场景建立镜头，缓推 / 淡入'
        elif avatar_changed == 'show':
            camera = '角色入场，中景'
        elif avatar_changed == 'move':
            camera = '角色换位，中景'
        elif avatar_changed == 'hide':
            camera = '角色退场，中景留白'
        elif content_type == '选择':
            camera = '选项特写，定格 2 秒'
        elif content_type == '描述':
            camera = '环境空镜 / 细节特写'
        elif node.get('character_name'):
            camera = '中近景，说话人特写'
        else:
            camera = '中景'
        if effect_hint:
            camera += '；' + effect_hint

        duration = 3.0 if content_type == '选择' else max(2.0, round(len(text) / 6.0, 1))
        if scene_changed:
            duration += 1.0
        if background_changed:
            duration += 0.8
        if avatar_changed:
            duration += 0.5
        if effect_hint:
            duration += 0.5
        if content_type == '选择':
            duration += 0.6 * max(1, len(options))
        duration += wait_seconds
        duration = round(duration, 1)
        total_duration += duration
        shot_no += 1

        sound = [str(duration) + ' 秒'] + notes
        row = table.add_row()
        values = [
            str(shot_no),
            str(node.get('scene_title') or ''),
            '\n'.join(visual),
            '\n'.join(dialogue),
            emotion,
            camera,
            '\n'.join(sound),
        ]
        for index, value in enumerate(values):
            cell = row.cells[index]
            _set_storyboard_cell(cell, str(value).split('\n'))
            cell.width = widths[index]

    doc.add_paragraph('')
    doc.add_paragraph('合计：' + str(shot_no) + ' 个镜头，预计 ' + str(round(total_duration / 60.0, 1)) + ' 分钟。')
    if ending:
        doc.add_paragraph('【结局】' + str(ending.get('title') or '未命名结局'))

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()
