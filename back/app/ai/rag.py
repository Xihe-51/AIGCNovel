# -*- coding=utf-8 -*-
"""
RAG 角色人设库 —— 计划书 3.3.2「保证人设一致性」。

方案：
  - 嵌入模型：Ollama `nomic-embed-text`（复用已跑的本地服务，零额外内存）
  - 向量库：  FAISS 本地文件（`back/.rag_index/<project_id>/`，无需外部服务）
  - 数据源：  `characters` 表（name / age / description / settings）
  - 流程：    生成前按场景关键词检索 top-k 人设片段 → 注入 prompt

**全程可降级**：langchain / faiss / Ollama 任一不可用，本模块返回空结果，
不抛异常、不阻塞主流程（与第 1 批的降级设计保持一致）。
"""
import json
import os
import threading
from typing import Any, Dict, List, Optional, Tuple

from flask import current_app

# 索引内存缓存：{project_id: {"index": faiss.Index, "docs": [...]}}
_INDEX_CACHE: Dict[int, Dict[str, Any]] = {}
_LOCK = threading.Lock()

_EMBEDDER = None
_EMBEDDER_ERR: Optional[str] = None


# ==================== 配置与可用性 ====================

def _cfg(key, default=None):
    """安全读取配置（无 app context 时返回默认值，供 Celery 复用）。"""
    try:
        return current_app.config.get(key, default)
    except Exception:
        return default


def _index_root() -> str:
    root = _cfg('RAG_INDEX_DIR')
    if not root:
        root = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__)))), '.rag_index')
    return root


def _index_dir(project_id: int) -> str:
    return os.path.join(_index_root(), str(project_id))


def available() -> Dict[str, Any]:
    """探测 RAG 依赖是否齐备（供 /ai/health 展示）。"""
    reasons = []
    try:
        import faiss  # noqa: F401
    except Exception as e:
        reasons.append(f'faiss 不可用: {e}')
    try:
        import langchain_ollama  # noqa: F401
    except Exception as e:
        reasons.append(f'langchain_ollama 不可用: {e}')
    return {
        'ok': not reasons,
        'enabled': bool(_cfg('RAG_ENABLED', False)),
        'embed_model': _cfg('RAG_EMBED_MODEL', 'nomic-embed-text'),
        'index_root': _index_root(),
        'reasons': reasons,
    }


# ==================== 嵌入 ====================

def _get_embedder():
    """惰性构造 OllamaEmbeddings（进程内单例）。"""
    global _EMBEDDER, _EMBEDDER_ERR
    if _EMBEDDER is not None:
        return _EMBEDDER
    if _EMBEDDER_ERR:
        raise RuntimeError(_EMBEDDER_ERR)
    try:
        from langchain_ollama import OllamaEmbeddings
        _EMBEDDER = OllamaEmbeddings(
            base_url=_cfg('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'),
            model=_cfg('RAG_EMBED_MODEL', 'nomic-embed-text'),
        )
        return _EMBEDDER
    except Exception as e:
        _EMBEDDER_ERR = f'构造 OllamaEmbeddings 失败: {e}'
        raise RuntimeError(_EMBEDDER_ERR)


def embed_texts(texts: List[str]) -> List[List[float]]:
    """批量嵌入。失败时抛异常，由上层捕获降级。"""
    if not texts:
        return []
    return _get_embedder().embed_documents(texts)


def embed_query(text: str) -> List[float]:
    return _get_embedder().embed_query(text)


# ==================== 文档构造 ====================

def _character_to_doc(ch: Any) -> str:
    """把一条 characters 记录转成用于嵌入的人设文本。"""
    parts = [f"角色：{ch.name}"]
    if ch.age:
        parts.append(f"年龄：{ch.age}岁")
    parts.append(f"定位：{'主角' if ch.is_main else '配角'}")
    if ch.description:
        parts.append(f"人设：{ch.description}")

    settings = ch.settings
    if settings:
        if isinstance(settings, str):
            try:
                settings = json.loads(settings)
            except Exception:
                settings = {'原始设定': settings}
        if isinstance(settings, dict):
            for k, v in settings.items():
                if v in (None, '', [], {}):
                    continue
                if isinstance(v, (list, tuple)):
                    v = '、'.join(str(i) for i in v)
                elif isinstance(v, dict):
                    v = json.dumps(v, ensure_ascii=False)
                parts.append(f"{k}：{v}")
        else:
            parts.append(f"设定：{settings}")

    return '\n'.join(parts)


def load_character_docs(project_id: int) -> List[Dict[str, Any]]:
    """从数据库读项目角色，转成 (doc_text, metadata) 列表。"""
    from ..models import Character
    rows = (Character.query
            .filter_by(project_id=project_id)
            .order_by(Character.is_main.desc(), Character.character_id.asc())
            .all())
    docs = []
    for ch in rows:
        docs.append({
            'text': _character_to_doc(ch),
            'metadata': {
                'character_id': ch.character_id,
                'name': ch.name,
                'age': ch.age,
                'is_main': bool(ch.is_main),
            },
        })
    return docs


# ==================== 索引构建 / 持久化 ====================

def build_index(project_id: int, force: bool = False) -> Dict[str, Any]:
    """
    为项目重建人设向量索引并落盘。

    :return: {'ok': bool, 'count': int, 'reason': str|None}
    """
    if not _cfg('RAG_ENABLED', False):
        return {'ok': False, 'count': 0, 'reason': 'RAG_ENABLED=false，未启用'}

    try:
        import faiss
        import numpy as np
    except Exception as e:
        return {'ok': False, 'count': 0, 'reason': f'faiss/numpy 不可用: {e}'}

    docs = load_character_docs(project_id)
    if not docs:
        return {'ok': False, 'count': 0, 'reason': '该项目还没有角色，无法建立人设库'}

    try:
        vectors = embed_texts([d['text'] for d in docs])
    except Exception as e:
        return {'ok': False, 'count': 0, 'reason': f'嵌入失败（检查 Ollama 与嵌入模型）: {e}'}

    arr = np.asarray(vectors, dtype='float32')
    if arr.ndim != 2 or arr.shape[0] != len(docs):
        return {'ok': False, 'count': 0, 'reason': '嵌入返回维度异常'}

    # 归一化后用内积 = 余弦相似度
    faiss.normalize_L2(arr)
    index = faiss.IndexFlatIP(arr.shape[1])
    index.add(arr)

    out_dir = _index_dir(project_id)
    os.makedirs(out_dir, exist_ok=True)
    faiss.write_index(index, os.path.join(out_dir, 'index.faiss'))
    with open(os.path.join(out_dir, 'docs.json'), 'w', encoding='utf-8') as f:
        json.dump({
            'project_id': project_id,
            'dim': int(arr.shape[1]),
            'docs': docs,
        }, f, ensure_ascii=False, indent=2)

    with _LOCK:
        _INDEX_CACHE[project_id] = {'index': index, 'docs': docs}

    return {'ok': True, 'count': len(docs), 'reason': None, 'dim': int(arr.shape[1])}


def load_index(project_id: int):
    """加载索引：优先内存缓存，其次磁盘；都没有返回 None。"""
    with _LOCK:
        cached = _INDEX_CACHE.get(project_id)
    if cached:
        return cached

    out_dir = _index_dir(project_id)
    idx_path = os.path.join(out_dir, 'index.faiss')
    doc_path = os.path.join(out_dir, 'docs.json')
    if not (os.path.exists(idx_path) and os.path.exists(doc_path)):
        return None

    try:
        import faiss
        index = faiss.read_index(idx_path)
        with open(doc_path, 'r', encoding='utf-8') as f:
            payload = json.load(f)
        bundle = {'index': index, 'docs': payload.get('docs', [])}
        with _LOCK:
            _INDEX_CACHE[project_id] = bundle
        return bundle
    except Exception:
        return None


def clear_index(project_id: int) -> bool:
    """删除项目的索引（内存 + 磁盘）。"""
    with _LOCK:
        _INDEX_CACHE.pop(project_id, None)
    out_dir = _index_dir(project_id)
    removed = False
    for name in ('index.faiss', 'docs.json'):
        p = os.path.join(out_dir, name)
        if os.path.exists(p):
            try:
                os.remove(p)
                removed = True
            except Exception:
                pass
    return removed


def index_stats(project_id: int) -> Dict[str, Any]:
    bundle = load_index(project_id)
    if not bundle:
        return {'exists': False, 'count': 0}
    return {
        'exists': True,
        'count': len(bundle['docs']),
        'names': [d['metadata'].get('name') for d in bundle['docs']],
    }


# ==================== 检索 ====================

def search(project_id: int, query: str, k: int = 3) -> List[Dict[str, Any]]:
    """
    按查询文本检索最相关的 k 个角色人设。

    :return: [{'character_id','name','text','score'}, ...]；不可用时返回 []
    """
    if not _cfg('RAG_ENABLED', False) or not query:
        return []

    bundle = load_index(project_id)
    if not bundle:
        # 索引不存在 → 尝试现场构建一次（首次使用体验更顺）
        built = build_index(project_id)
        if not built.get('ok'):
            return []
        bundle = load_index(project_id)
        if not bundle:
            return []

    try:
        import faiss
        import numpy as np
        qv = np.asarray([embed_query(query)], dtype='float32')
        faiss.normalize_L2(qv)
        k = max(1, min(int(k or 3), len(bundle['docs'])))
        scores, idxs = bundle['index'].search(qv, k)
    except Exception:
        return []

    out = []
    for score, i in zip(scores[0], idxs[0]):
        if i < 0 or i >= len(bundle['docs']):
            continue
        doc = bundle['docs'][i]
        out.append({
            'character_id': doc['metadata'].get('character_id'),
            'name': doc['metadata'].get('name'),
            'is_main': doc['metadata'].get('is_main'),
            'text': doc['text'],
            'score': round(float(score), 4),
        })
    return out


def get_persona_context(project_id: int, query: str, k: int = 3) -> Tuple[str, List[Dict[str, Any]]]:
    """
    生成可直接注入 prompt 的人设上下文块。

    :return: (prompt_block, hits)；无命中时 block 为空串
    """
    hits = search(project_id, query, k=k)
    if not hits:
        return '', []
    lines = ['【角色人设设定（务必严格遵循，保持人物一致性）】']
    for h in hits:
        lines.append(f"--- {h['name']} ---")
        lines.append(h['text'])
    return '\n'.join(lines), hits
