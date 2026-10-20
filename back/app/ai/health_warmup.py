# -*- coding=utf-8 -*-
"""
AI 健康状态预热。

问题：`/ai/health` 里的 `_local_sd_health()` / `_local_music_health()` 首次调用会在
请求线程里 import torch / diffusers / transformers，冷启动实测阻塞 30 秒以上；
前端 AI 页一进入就调这个接口，表现为页面"卡死"。

方案：应用启动时用后台线程预热这些模块并缓存探测结果，`/ai/health` 只读缓存，
永不阻塞请求；缓存每 30 秒刷新一次（可用内存是动态的）。
"""
import threading
import time

_LOCK = threading.Lock()
_SNAPSHOT = None
_READY = False
_STARTED = False
_REFRESH_SECONDS = 30


def _probe(app):
    """在应用上下文里跑一遍重型探测，返回快照 dict。"""
    with app.app_context():
        from app.ai.backends import text_ollama, image_local, music_local
        from app.ai import memory, rag
        from flask import current_app

        return {
            'ollama': text_ollama.health(),
            'memory': memory.available(),
            'rag': rag.available(),
            'local_sd': image_local.status(),
            'local_music': music_local.status(),
            'tts': _tts_status(current_app),
        }


def _tts_status(app):
    appid = str(app.config.get('VOLCENGINE_APPID', '') or '').strip()
    token = str(app.config.get('VOLCENGINE_TTS_TOKEN', '') or '').strip()
    reasons = []
    if not appid:
        reasons.append('VOLCENGINE_APPID 未配置')
    if not token:
        reasons.append('VOLCENGINE_TTS_TOKEN 未配置')
    return {
        'ok': not reasons,
        'backend': 'volcengine-tts',
        'appid_configured': bool(appid),
        'token_configured': bool(token),
        'voice_type': app.config.get('VOLCENGINE_VOICE_TYPE'),
        'reasons': reasons,
    }


def _run(app):
    global _SNAPSHOT, _READY
    while True:
        try:
            snap = _probe(app)
            with _LOCK:
                _SNAPSHOT = snap
                _READY = True
        except Exception as e:  # pragma: no cover - 探测失败不影响主流程
            app.logger.warning(f'[health] 预热探测失败: {e}')
        time.sleep(_REFRESH_SECONDS)


def start_warmup(app):
    """幂等启动后台预热线程。"""
    global _STARTED
    with _LOCK:
        if _STARTED:
            return
        _STARTED = True
    t = threading.Thread(target=_run, args=(app,), daemon=True, name='ai-health-warmup')
    t.start()


def get_snapshot():
    """返回 (snapshot, ready)。未就绪时 snapshot 为 None。"""
    with _LOCK:
        return _SNAPSHOT, _READY
