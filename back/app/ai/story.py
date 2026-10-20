# -*- coding=utf-8 -*-
"""
剧情续写编排 —— 计划书 3.3.1（LangChain 上下文）+ 3.3.2（RAG 人设库）的汇合点。

把三件事串起来：
  1. LangChain `ConversationSummaryBufferMemory` 管理多轮上下文（近期原文 + 远期摘要）
  2. RAG 检索角色人设，注入 prompt 保证人物一致性
  3. 复用第 1 批的文本后端（Ollama 本地 / DeepSeek 兜底）+ Redis 缓存

前端 `SceneEdit.vue` 不再需要自己拼 prompt，只要把「历史 + 本次要求」发过来即可。
"""
import hashlib
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from .. import db
from ..models import AIGeneration, Project, Scene, ScriptContent
from ..extensions import cache_get, cache_set
from . import memory as memory_mod
from . import rag
from .services import (
    _cfg,
    _sanitize_forbidden_words,
    generate_text_via_backend,
    remove_think_tags,
)


# ==================== prompt 组装 ====================

def _scene_context(project_id: int, scene_id: Optional[int]) -> Tuple[str, List[Dict[str, Any]]]:
    """取项目/场景背景，以及该场景已写好的最近若干条剧情，作为即时上下文。"""
    project = Project.query.get(project_id) if project_id else None
    lines: List[str] = []
    recent: List[Dict[str, Any]] = []

    if project:
        lines.append(f'作品：《{project.title}》（题材：{project.genre}）')

    if scene_id:
        scene = Scene.query.get(scene_id)
        if scene:
            lines.append(f'当前场景：{scene.title}')
            if scene.description:
                lines.append(f'场景说明：{scene.description}')

            rows = (ScriptContent.query
                    .filter_by(scene_id=scene_id)
                    .order_by(ScriptContent.order_num.asc())
                    .all())
            for c in rows[-12:]:
                recent.append({
                    'content_id': c.content_id,
                    'content_type': c.content_type,
                    'character_id': c.character_id,
                    'content_text': c.content_text,
                })

    return '\n'.join(lines), recent


def _render_recent(recent: List[Dict[str, Any]], names: Dict[int, str]) -> str:
    if not recent:
        return ''
    out = []
    for c in recent:
        text = (c.get('content_text') or '').strip()
        if not text:
            continue
        if c.get('content_type') == '描述':
            out.append(f'【旁白】{text}')
        else:
            name = names.get(c.get('character_id')) or '角色'
            out.append(f'{name}：{text}')
    return '\n'.join(out)


def build_prompt(*, project_id=None, scene_id=None, user_input='', history=None,
                 session_id=None, stateful=False, use_rag=True,
                 k_persona=None) -> Dict[str, Any]:
    """
    组装续写 prompt。

    :return: {'prompt','summary','recent_count','persona_hits','memory_state'}
    """
    from langchain_core.prompts import ChatPromptTemplate

    # ---- 1. 上下文压缩（LangChain Memory）----
    summary = ''
    recent_msgs: List[Any] = []
    mem_state: Dict[str, Any] = {}

    if stateful and session_id:
        mem = memory_mod.get_memory(session_id)
        variables = mem.load_memory_variables({})
        summary = mem.moving_summary_buffer or ''
        recent_msgs = variables.get('history', []) or []
        memory_mod._save_summary(session_id, summary)
        mem_state = memory_mod.memory_state(session_id)
    elif history:
        summary, recent_msgs = memory_mod.compress_history(history)

    # ---- 2. RAG 人设检索 ----
    persona_block = ''
    persona_hits: List[Dict[str, Any]] = []
    if use_rag and project_id and _cfg('RAG_ENABLED', False):
        query = ' '.join(filter(None, [user_input, summary])) or '主要角色'
        persona_block, persona_hits = rag.get_persona_context(
            project_id, query, k=k_persona or int(_cfg('RAG_TOP_K', 3)))

    # ---- 3. 场景上下文 ----
    scene_block, scene_recent = _scene_context(project_id, scene_id)

    names: Dict[int, str] = {}
    if project_id:
        from ..models import Character
        for ch in Character.query.filter_by(project_id=project_id).all():
            names[ch.character_id] = ch.name

    # 场景内已写剧情（原文）优先于记忆里的近期消息
    scene_recent_text = _render_recent(scene_recent, names)
    memory_recent_text = '\n'.join(_message_text(m) for m in recent_msgs if _message_text(m))

    # ---- 4. 用 LangChain 模板拼装 ----
    template = ChatPromptTemplate.from_messages([
        ('system',
         '你是一位专业的视觉小说编剧助手。请严格遵循已有的人物设定与剧情走向，'
         '保持人物性格、说话风格和世界观的一致性。只输出可以直接放入剧本的正文，'
         '不要写任何解释、标题、markdown 标记或额外说明。'),
        ('human',
         '{persona_block}\n\n'
         '【作品与场景】\n{scene_block}\n\n'
         '【前情摘要】\n{summary}\n\n'
         '【最近剧情】\n{recent}\n\n'
         '【本次创作要求】\n{user_input}\n\n'
         '请续写接下来的剧情内容：'),
    ])

    prompt = template.format(
        persona_block=persona_block or '（暂无角色设定）',
        scene_block=scene_block or '（未指定场景）',
        summary=summary or '（无，这是开场）',
        recent=(scene_recent_text or memory_recent_text or '（暂无已写剧情）'),
        user_input=user_input or '自然地推进剧情',
    )

    return {
        'prompt': prompt,
        'summary': summary,
        'recent_count': len(recent_msgs),
        'persona_hits': persona_hits,
        'memory_state': mem_state,
    }


def _message_text(m) -> str:
    content = getattr(m, 'content', '')
    if isinstance(content, list):
        return ''.join(str(p.get('text', '')) if isinstance(p, dict) else str(p) for p in content)
    return str(content)


def _record_turn_safe(session_id: str, user_input: str, ai_output: str) -> Dict[str, Any]:
    """把一轮问答写入会话记忆；失败不抛异常，返回带告警的字典。"""
    try:
        return memory_mod.remember_turn(session_id, user_input or '（续写）', ai_output)
    except Exception as e:
        return {'session_id': session_id, 'error': f'写入记忆失败: {e}'}


# ==================== 主流程 ====================

def continue_story(*, user_id: int, project_id: Optional[int] = None,
                   scene_id: Optional[int] = None, user_input: str = '',
                   history=None, session_id: Optional[str] = None,
                   stateful: bool = False, use_rag: bool = True,
                   length: int = 500, forbidden_words=None,
                   temperature: float = 0.8, model: Optional[str] = None,
                   k_persona: Optional[int] = None) -> Tuple[bool, Dict[str, Any]]:
    """
    续写剧情。返回 (ok, result)。

    - stateful=True 需提供 session_id：多轮记忆落 Redis，跨请求累积
    - stateful=False（默认）：由前端传 history，后端压缩后生成（替代前端自拼 prompt）
    """
    try:
        if not project_id:
            return False, {'message': 'project_id 不能为空'}

        built = build_prompt(
            project_id=project_id, scene_id=scene_id, user_input=user_input,
            history=history, session_id=session_id, stateful=stateful,
            use_rag=use_rag, k_persona=k_persona,
        )
        prompt = built['prompt']

        # ---- 缓存：以完整 prompt 为键（相同上下文 + 相同要求 → 复用）----
        # 注意：memory 字段与「会话」强相关，绝不能进缓存（否则会把上一轮的
        # 消息数/摘要串到别的会话），命中后按当前会话重新计算。
        cache_key = None
        if _cfg('CACHE_ENABLED', False):
            cache_key = 'ai:story:' + hashlib.md5(prompt.encode('utf-8')).hexdigest()
            hit = cache_get(cache_key)
            if hit and isinstance(hit, dict) and hit.get('generated_text'):
                result = dict(hit)
                result['cached'] = True
                result['session_id'] = session_id
                result['stateful'] = bool(stateful)
                # 命中缓存 ≠ 可以跳过记忆写入：多轮上下文仍必须推进，
                # 否则第二次相同输入之后，会话记忆会「原地踏步」。
                result['memory'] = (_record_turn_safe(session_id, user_input,
                                                      result['generated_text'])
                                    if (stateful and session_id) else {})
                return True, result

        # ---- 生成 ----
        generated_text, backend_used = generate_text_via_backend(
            prompt=prompt, model=model, length=length, temperature=temperature,
        )
        generated_text = remove_think_tags(generated_text)

        forbidden_words = _sanitize_forbidden_words(forbidden_words)
        for w in forbidden_words:
            generated_text = generated_text.replace(w, '[已过滤]')

        # ---- 落库 ----
        record = AIGeneration(
            user_id=user_id,
            prompt_text=prompt,
            generated_text=generated_text,
            length=len(generated_text),
            type='story',
            forbidden_words=','.join(forbidden_words) if forbidden_words else None,
        )
        db.session.add(record)
        db.session.commit()

        result: Dict[str, Any] = {
            'generation_id': record.generation_id,
            'generated_text': generated_text,
            'model': model or _cfg('OLLAMA_MODEL', 'qwen2.5:7b'),
            'backend': backend_used,
            'length': len(generated_text),
            'forbidden_words': forbidden_words,
            'project_id': project_id,
            'scene_id': scene_id,
            'session_id': session_id,
            'stateful': bool(stateful),
            'memory': {
                'summary': built['summary'],
                'recent_count': built['recent_count'],
                'message_count': (built['memory_state'] or {}).get('message_count', 0),
            },
            'persona_hits': [
                {'character_id': h['character_id'], 'name': h['name'], 'score': h['score']}
                for h in built['persona_hits']
            ],
            'prompt_chars': len(prompt),
            'created_at': record.created_at.isoformat(),
        }

        # ---- 有状态模式：把本轮写入记忆（必须发生在写缓存之前）----
        if stateful and session_id:
            result['memory'] = _record_turn_safe(session_id, user_input, generated_text)

        if cache_key:
            # 剥离 memory 再缓存，避免会话信息串味
            to_cache = {k: v for k, v in result.items() if k != 'memory'}
            cache_set(cache_key, to_cache, ttl=_cfg('CACHE_TTL', 3600))

        return True, result

    except Exception as e:
        db.session.rollback()
        return False, {'message': f'续写失败: {e}'}
