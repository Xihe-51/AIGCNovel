# -*- coding=utf-8 -*-
"""
本地 Ollama 文本生成后端（计划书 3.3.1 方案）。

使用 Ollama 原生 HTTP 接口，不引入额外依赖。
接口文档：POST {base_url}/api/chat
"""
import json
import requests

from flask import current_app


def generate(prompt: str, model: str = None, length: int = 512,
             temperature: float = 0.7, timeout: int = None) -> str:
    """
    调用本地 Ollama 生成文本。

    :param prompt: 提示词
    :param model: 模型名（如 qwen2.5:7b），默认取配置 OLLAMA_MODEL
    :param length: 期望生成长度（用于估算 max_tokens）
    :param temperature: 采样温度
    :return: 生成文本
    :raises requests.exceptions.RequestException / ValueError
    """
    base_url = current_app.config.get('OLLAMA_BASE_URL', 'http://127.0.0.1:11434')
    model = model or current_app.config.get('OLLAMA_MODEL', 'qwen2.5:7b')
    timeout = timeout or current_app.config.get('OLLAMA_TIMEOUT', 180)

    url = f'{base_url.rstrip("/")}/api/chat'

    # 中文按 ~1.5 token/字 估算，留 2 倍余量，并限制在 Ollama 合理区间
    max_tokens = max(256, min(int(length * 2), 4096))

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }

    resp = requests.post(url, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()

    text = (data.get('message') or {}).get('content', '')
    if not text:
        raise ValueError(f"Ollama 返回内容为空: {json.dumps(data, ensure_ascii=False)[:200]}")
    return text


def health() -> dict:
    """探测 Ollama 服务与模型可用性，供 /ai/health 使用。"""
    base_url = current_app.config.get('OLLAMA_BASE_URL', 'http://127.0.0.1:11434')
    try:
        r = requests.get(f'{base_url.rstrip("/")}/api/tags', timeout=5)
        r.raise_for_status()
        models = [m.get('name') for m in r.json().get('models', [])]
        want = current_app.config.get('OLLAMA_MODEL', 'qwen2.5:7b')
        return {
            "ok": True,
            "models": models,
            "configured_model": want,
            "model_available": any(want == m or m.startswith(want.split(':')[0]) for m in models),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
