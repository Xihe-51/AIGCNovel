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
