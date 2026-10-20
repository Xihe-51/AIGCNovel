# -*- coding=utf-8 -*-
"""
LangChain 多轮上下文管理 —— 计划书 3.3.1「上下文管理」。

替代前端 `SceneEdit.vue` 里自制的 `generateHistorySummary()`
（近邻 5 条原文 + 远期按固定规则截断拼串）。改用 LangChain 的
`ConversationSummaryBufferMemory`：近期对话保留原文，超出 token 上限的旧对话
自动用 LLM 压缩成摘要，从而在有限上下文窗口内保住长期剧情记忆。

### 两种工作模式

1. **有状态**（传 `session_id`）：对话历史与滚动摘要落 Redis，跨请求累积。
2. **无状态**（传 `history` 数组）：后端用同一个 Memory 组件把前端传来的历史
   压缩成「摘要 + 近期原文」，前端不必再自己拼 prompt。

### 可降级

langchain 不可用 / Redis 不可用时：无状态模式仍可工作（内存内临时 Memory），
有状态模式退化为进程内字典存储（不跨进程，但功能不报错）。
"""
import json
import threading
from typing import Any, Dict, List, Optional, Tuple

from flask import current_app

# 无 Redis 时的进程内兜底存储
_MEM_STORE: Dict[str, List[Any]] = {}
_MEM_LOCK = threading.Lock()

_LLM = None
_LLM_ERR: Optional[str] = None

SUMMARY_KEY_PREFIX = 'ai:memsum:'
CHAT_KEY_PREFIX = 'ai:chat:'

DEFAULT_MAX_TOKENS = 1200


def _cfg(key, default=None):
    try:
        return current_app.config.get(key, default)
    except Exception:
        return default


def available() -> Dict[str, Any]:
    """探测 LangChain 记忆依赖是否可用。"""
    reasons = []
    try:
        from langchain_classic.memory import ConversationSummaryBufferMemory  # noqa: F401
    except Exception as e:
        reasons.append(f'langchain_classic.memory 不可用: {e}')
    try:
        from langchain_ollama import ChatOllama  # noqa: F401
    except Exception as e:
        reasons.append(f'langchain_ollama 不可用: {e}')
    from ..extensions import get_redis
    r = get_redis()
    redis_ok = False
    try:
        redis_ok = bool(r and r.ping())
    except Exception:
        redis_ok = False
    return {
        'ok': not reasons,
        'enabled': bool(_cfg('MEMORY_ENABLED', True)),
        'backend': 'redis' if redis_ok else 'in-process',
        'max_tokens': _cfg('MEMORY_MAX_TOKENS', DEFAULT_MAX_TOKENS),
        'reasons': reasons,
    }


# ==================== 摘要 LLM ====================

def _estimate_tokens(text: str) -> int:
    """
    中文字符感知的 token 估算。

    为什么不用 LangChain 默认实现：`BaseLanguageModel.get_num_tokens_from_messages`
    会去 import transformers 并加载 tokenizer，而本项目 torch 是 CPU 版、
    transformers 又因 huggingface-hub 版本冲突不可用——这条路径会直接抛 ImportError。
    对中文剧本来说，按「CJK 字符≈1 token、其余≈4 字符/token」估算既轻量又比
    GPT 系 tokenizer 更接近实际。
    """
    if not text:
        return 0
    cjk = 0
    for ch in text:
        o = ord(ch)
        if 0x4E00 <= o <= 0x9FFF or 0x3000 <= o <= 0x303F or 0xFF00 <= o <= 0xFFEF:
            cjk += 1
    other = len(text) - cjk
    return cjk + max(1, other // 4)


def _message_text(m) -> str:
    content = getattr(m, 'content', '')
    if isinstance(content, list):
        return ''.join(str(part.get('text', '')) if isinstance(part, dict) else str(part)
                       for part in content)
    return str(content)


def _get_llm():
    """惰性构造用于「压缩摘要」的本地 LLM（覆盖 token 估算，避免 transformers 依赖）。"""
    global _LLM, _LLM_ERR
    if _LLM is not None:
        return _LLM
    if _LLM_ERR:
        raise RuntimeError(_LLM_ERR)
    try:
        from langchain_ollama import ChatOllama

        class _LocalChatOllama(ChatOllama):
            """用轻量估算替换 transformers 分词器。"""

            def get_num_tokens(self, text: str) -> int:
                return _estimate_tokens(text)

            def get_num_tokens_from_messages(self, messages, tools=None) -> int:
                return sum(_estimate_tokens(_message_text(m)) for m in messages)

        _LLM = _LocalChatOllama(
            model=_cfg('OLLAMA_MODEL', 'qwen2.5:7b'),
            base_url=_cfg('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'),
            temperature=0.3,
        )
        return _LLM
    except Exception as e:
        _LLM_ERR = f'构造 ChatOllama 失败: {e}'
        raise RuntimeError(_LLM_ERR)


# ==================== 消息历史（Redis 持久化） ====================

def _make_history(session_id: str):
    """构造 LangChain 的 BaseChatMessageHistory（Redis 优先，内存兜底）。"""
    from langchain_core.chat_history import BaseChatMessageHistory
    from langchain_core.messages import messages_from_dict, message_to_dict
    from ..extensions import get_redis

    ttl = int(_cfg('MEMORY_TTL', 86400))
    key = CHAT_KEY_PREFIX + session_id

    class _RedisOrMemoryHistory(BaseChatMessageHistory):
        def __init__(self):
            self.key = key

        @property
        def messages(self):
            r = get_redis()
            if r is not None:
                try:
                    raw = r.lrange(self.key, 0, -1)
                    out = []
                    for item in raw:
                        try:
                            # 注意：messages_from_dict 接收的是「消息字典的列表」，不是单个字典
                            out.append(messages_from_dict([json.loads(item)])[0])
                        except Exception:
                            continue
                    return out
                except Exception:
                    pass
            with _MEM_LOCK:
                return list(_MEM_STORE.get(self.key, []))

        def add_message(self, message) -> None:
            r = get_redis()
            if r is not None:
                try:
                    r.rpush(self.key, json.dumps(message_to_dict(message),
                                                 ensure_ascii=False, default=str))
                    r.expire(self.key, ttl)
                    return
                except Exception:
                    pass
            with _MEM_LOCK:
                _MEM_STORE.setdefault(self.key, []).append(message)

        def clear(self) -> None:
            r = get_redis()
            if r is not None:
                try:
                    r.delete(self.key)
                except Exception:
                    pass
            with _MEM_LOCK:
                _MEM_STORE.pop(self.key, None)

    return _RedisOrMemoryHistory()


def _load_summary(session_id: str) -> str:
    """读回滚动摘要（ConversationSummaryBufferMemory 自身不持久化摘要）。"""
    from ..extensions import get_redis
    r = get_redis()
    if r is None:
        return ''
    try:
        v = r.get(SUMMARY_KEY_PREFIX + session_id)
        return v.decode('utf-8') if isinstance(v, bytes) else (v or '')
    except Exception:
        return ''


def _save_summary(session_id: str, summary: str) -> None:
    from ..extensions import get_redis
    r = get_redis()
    if r is None or not summary:
        return
    try:
        r.setex(SUMMARY_KEY_PREFIX + session_id, int(_cfg('MEMORY_TTL', 86400)), summary)
    except Exception:
        pass


# ==================== Memory 实例 ====================

def get_memory(session_id: str):
    """
    构造带持久化的 ConversationSummaryBufferMemory。

    摘要会从 Redis 恢复，因此即使 Celery 每次在新进程里执行，
    多轮上下文也不会丢。
    """
    from langchain_classic.memory import ConversationSummaryBufferMemory

    max_tokens = int(_cfg('MEMORY_MAX_TOKENS', DEFAULT_MAX_TOKENS))
    mem = ConversationSummaryBufferMemory(
        llm=_get_llm(),
        max_token_limit=max_tokens,
        chat_memory=_make_history(session_id),
        memory_key='history',
        input_key='input',
        output_key='output',
        return_messages=True,
    )
    saved = _load_summary(session_id)
    if saved:
        # 恢复上次压缩后的滚动摘要
        try:
            mem.moving_summary_buffer = saved
        except Exception:
            pass
    return mem


def make_session_id(project_id, user_id, session_id: Optional[str] = None) -> str:
    if session_id:
        return str(session_id)
    return f'p{project_id or 0}_u{user_id or 0}'


# ==================== 历史消息转换 ====================

def normalize_history(history: Any) -> List[Any]:
    """
    把前端传来的历史（结构可能五花八门）转成 LangChain 消息列表。

    兼容三种形态：
      - [{"role": "user"|"assistant", "content": "..."}]
      - [{"content_type": "对话"|"描述", "character_name": "...", "content_text": "..."}]
      - [{"name": "...", "text": "..."}]
    """
    from langchain_core.messages import AIMessage, HumanMessage

    msgs: List[Any] = []
    if not history:
        return msgs
    if not isinstance(history, list):
        return msgs

    for item in history:
        if isinstance(item, str):
            msgs.append(HumanMessage(content=item))
            continue
        if not isinstance(item, dict):
            continue

        role = (item.get('role') or '').lower()
        content = item.get('content') or item.get('content_text') or item.get('text') or ''

        if not content:
            continue

        if role in ('user', 'human'):
            msgs.append(HumanMessage(content=content))
        elif role in ('assistant', 'ai'):
            msgs.append(AIMessage(content=content))
        else:
            # 剧本条目：把「角色名：台词」折叠成一条 AI 消息
            name = item.get('character_name') or item.get('name')
            ctype = item.get('content_type')
            if ctype == '描述' or name in (None, '', '旁白'):
                msgs.append(AIMessage(content=f'【旁白】{content}'))
            else:
                msgs.append(AIMessage(content=f'{name}：{content}'))
    return msgs


def compress_history(history: Any, session_id: Optional[str] = None) -> Tuple[str, List[Any]]:
    """
    无状态模式：把前端传来的历史压缩成「摘要 + 近期原文」。

    :return: (summary_text, recent_messages)
    """
    from langchain_classic.memory import ConversationSummaryBufferMemory

    msgs = normalize_history(history)
    if not msgs:
        return '', []

    max_tokens = int(_cfg('MEMORY_MAX_TOKENS', DEFAULT_MAX_TOKENS))
    mem = ConversationSummaryBufferMemory(
        llm=_get_llm(),
        max_token_limit=max_tokens,
        memory_key='history',
        input_key='input',
        output_key='output',
        return_messages=True,
    )
    for m in msgs:
        mem.chat_memory.add_message(m)

    variables = mem.load_memory_variables({})
    recent = variables.get('history', [])
    return mem.moving_summary_buffer or '', recent


def remember_turn(session_id: str, user_input: str, ai_output: str) -> Dict[str, Any]:
    """有状态模式：把一轮问答写入记忆，并回写滚动摘要。"""
    mem = get_memory(session_id)
    mem.save_context({'input': user_input}, {'output': ai_output})
    _save_summary(session_id, mem.moving_summary_buffer or '')
    return memory_state(session_id)


def memory_state(session_id: str) -> Dict[str, Any]:
    """查看某会话的记忆状态（消息条数 / 摘要长度）。"""
    hist = _make_history(session_id)
    try:
        count = len(hist.messages)
    except Exception:
        count = 0
    summary = _load_summary(session_id)
    return {
        'session_id': session_id,
        'message_count': count,
        'summary_length': len(summary),
        'summary': summary[:500],
    }


def reset_session(session_id: str) -> bool:
    """清空某会话的历史与摘要。"""
    _make_history(session_id).clear()
    from ..extensions import get_redis
    r = get_redis()
    if r is not None:
        try:
            r.delete(SUMMARY_KEY_PREFIX + session_id)
        except Exception:
            pass
    return True
