# -*- coding=utf-8 -*-
"""
DeepSeek 云端文本生成后端（原实现，保留作为兜底/对比）。

当 TEXT_BACKEND=deepseek，或在 Ollama 不可达需要自动降级时使用。
"""
import requests

from flask import current_app


def generate(prompt: str, model: str = None, length: int = 512,
             temperature: float = 0.7, timeout: int = 60) -> str:
    """
    调用 DeepSeek 官方 API 生成文本。

    :return: 生成文本
    :raises requests.exceptions.RequestException / ValueError
    """
    api_key = current_app.config.get('DEEPSEEK_API_KEY', '')
    if not api_key:
        raise ValueError("未配置 DEEPSEEK_API_KEY")

    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max(64, int(length)),
        "temperature": temperature,
        "stream": False,
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()

    text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not text:
        raise ValueError("DeepSeek 返回内容为空")
    return text
