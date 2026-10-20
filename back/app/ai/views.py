import socket

from flask import request, jsonify, current_app
from . import ai
from .services import (generate_and_save_text, generate_anime_image,
                       generate_music, generate_voice)
from .story import continue_story
from . import rag, memory
from .backends import text_ollama
from ..extensions import get_redis
from .. import db
from ..models import Project
from ..security import current_user_id


def _owned_project_or_error(project_id):
    """RAG 等按项目维度调用的接口必须校验项目归属。"""
    uid = current_user_id()
    if not uid:
        return None, (jsonify({"status": "error", "message": "未登录"}), 401)
    project = db.session.get(Project, int(project_id))
    if not project or int(project.user_id) != int(uid):
        return None, (jsonify({"status": "error", "message": "项目不存在或无权访问"}), 404)
    return project, None


def _async_enabled() -> bool:
    return bool(current_app.config.get('ASYNC_ENABLED', False))


def _broker_reachable(timeout: float = 1.0) -> bool:
    """
    快速探测 Celery broker 是否可达。

    背景：broker（Redis）挂掉时 `task.delay()` 要重试约 64 秒才抛异常，
    期间请求一直挂着；对本地 SD 这种几十秒级的任务更是雪上加霜。
    这里先用 1 秒的 TCP 探测兜住，连不上就直接走同步。
    """
    try:
        from urllib.parse import urlparse
        url = current_app.config.get('CELERY_BROKER_URL') or ''
        parsed = urlparse(url)
        host = parsed.hostname or '127.0.0.1'
        port = parsed.port or 6379
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def _submit_task(kind: str, params: dict, sync_fn):
    """
    统一的任务投递入口。

    - ASYNC_ENABLED=true 且 broker 可达 → 投递 Celery 任务，返回 {async: true, task_id}
    - 否则回退为同步执行（保持旧行为，便于无 Redis 环境）
    """
    if _async_enabled():
        if not _broker_reachable():
            current_app.logger.warning('[async] broker 不可达，直接走同步执行（避免 64s 重试等待）')
        else:
            try:
                from .tasks import TASK_MAP
                task = TASK_MAP[kind].delay(**params)
                return jsonify({
                    "status": "success",
                    "async": True,
                    "task_id": task.id,
                    "message": "任务已提交，请轮询 /ai/task/<task_id>",
                }), 202
            except Exception as e:
                current_app.logger.warning(f'[async] 投递任务失败，回退同步: {e}')

    # 同步回退
    ok, result = sync_fn()
    if ok:
        return jsonify({"status": "success", "async": False, "data": result}), 200
    return jsonify({
        "status": "error",
        "message": result.get("message", "生成失败") if isinstance(result, dict) else "生成失败",
    }), 500


'''
    0.健康检查（后端/缓存可用性）
'''


@ai.route('/health', methods=['GET'])
def health():
    """
    探测各 AI 后端与缓存层的可用性。

    重型探测（torch/diffusers/transformers）由启动时的后台线程预热并缓存，
    本接口只读快照，避免首次调用阻塞 30s+（此前实测会卡住整个 AI 页面）。
    """
    r = get_redis()
    redis_ok = False
    try:
        redis_ok = bool(r and r.ping())
    except Exception:
        redis_ok = False

    from .health_warmup import get_snapshot
    snapshot, ready = get_snapshot()

    payload = {
        "status": "ok",
        "text_backend": current_app.config.get('TEXT_BACKEND'),
        "image_backend": current_app.config.get('IMAGE_BACKEND'),
        "music_backend": current_app.config.get('MUSIC_BACKEND'),
        "cache": {
            "enabled": current_app.config.get('CACHE_ENABLED'),
            "connected": redis_ok,
        },
        "async": {
            "enabled": current_app.config.get('ASYNC_ENABLED'),
        },
    }

    if ready and snapshot:
        payload.update(snapshot)
        payload["warming"] = False
    else:
        # 预热尚未完成：只返回轻量信息，绝不在这里 import 重型依赖
        payload.update({
            "warming": True,
            "ollama": None,
            "memory": {"ok": None, "warming": True},
            "rag": {"ok": None, "warming": True},
            "local_sd": {"ok": None, "warming": True, "reasons": ["健康状态预热中"]},
            "local_music": {"ok": None, "warming": True, "reasons": ["健康状态预热中"]},
            "tts": _tts_health(),
        })

    return jsonify(payload), 200


def _local_sd_health():
    """本地 SD 状态；任何异常都降级为 ok=False，绝不影响 /ai/health 整体可用性。"""
    try:
        from .backends import image_local
        return image_local.status()
    except Exception as e:
        return {"ok": False, "backend": "local", "reasons": [f'{type(e).__name__}: {e}']}


def _local_music_health():
    """本地 MusicGen 状态；同样只探测、不加载，异常降级为 ok=False。"""
    try:
        from .backends import music_local
        return music_local.status()
    except Exception as e:
        return {"ok": False, "backend": "local", "reasons": [f'{type(e).__name__}: {e}']}


def _tts_health():
    """火山 TTS 凭据检查：不联网，只判断配置是否齐备。"""
    try:
        appid = str(current_app.config.get('VOLCENGINE_APPID', '') or '').strip()
        token = str(current_app.config.get('VOLCENGINE_TTS_TOKEN', '') or '').strip()
        reasons = []
        if not appid:
            reasons.append('VOLCENGINE_APPID 未配置')
        if not token:
            reasons.append('VOLCENGINE_TTS_TOKEN 未配置')
        return {
            "ok": not reasons,
            "backend": "volcengine-tts",
            "appid_configured": bool(appid),
            "token_configured": bool(token),
            "voice_type": current_app.config.get('VOLCENGINE_VOICE_TYPE'),
            "reasons": reasons,
        }
    except Exception as e:
        return {"ok": False, "backend": "volcengine-tts",
                "reasons": [f'{type(e).__name__}: {e}']}


'''
    0.1 异步任务状态查询
'''


@ai.route('/task/<string:task_id>', methods=['GET'])
def task_status(task_id):
    """查询 Celery 任务状态：PENDING / PROGRESS / SUCCESS / FAILURE。"""
    if not _async_enabled():
        return jsonify({
            "status": "error",
            "message": "异步任务未启用（ASYNC_ENABLED=false）",
        }), 400

    try:
        from celery_app import celery_app
        res = celery_app.AsyncResult(task_id)
        state = res.state

        payload = {
            "status": "success",
            "task_id": task_id,
            "state": state,
            "ready": res.ready(),
        }
        if state == 'PROGRESS':
            payload['progress'] = res.info
        elif state == 'SUCCESS':
            payload['result'] = res.result
        elif state == 'FAILURE':
            payload['error'] = str(res.info)
        return jsonify(payload), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"查询任务失败: {e}",
        }), 500


'''
    1.文本生成
'''


@ai.route('/generate/text', methods=['POST'])
def generate_text():
    """视图函数：只处理HTTP请求和响应"""
    try:
        data = request.get_json()

        # 参数解析
        # 默认模型跟随文本后端配置（Ollama 用 OLLAMA_MODEL，DeepSeek 用 DEEPSEEK_MODEL），
        # 避免前端不传 model 时落到本地不存在的模型名导致 404。
        _default_model = (current_app.config.get('OLLAMA_MODEL', 'qwen2.5:7b')
                          if (current_app.config.get('TEXT_BACKEND', 'ollama') or 'ollama').lower() == 'ollama'
                          else current_app.config.get('DEEPSEEK_MODEL', 'deepseek-chat'))
        model = data.get('model') or _default_model
        prompt = data.get('prompt')
        length = data.get('length', 100)
        forbidden_words = data.get('forbidden_words', [])
        generation_type = data.get('type', 'text')
        user_id = request.headers.get('X-User-Id', type=int)

        # 参数预处理
        if isinstance(forbidden_words, str):
            forbidden_words = [word.strip() for word in forbidden_words.split('，') if word.strip()]

        # 参数验证
        if not all([prompt, user_id]):
            return jsonify({
                "status": "error",
                "message": "prompt和user_id参数不能为空"
            }), 400

        if not isinstance(length, int) or length <= 0:
            return jsonify({
                "status": "error",
                "message": "length必须是正整数"
            }), 400

        # 调用业务函数（异步模式下列队，同步模式下直接执行）
        return _submit_task(
            'text',
            {
                'model': model,
                'prompt': prompt,
                'length': length,
                'forbidden_words': forbidden_words,
                'user_id': user_id,
                'generation_type': generation_type,
            },
            sync_fn=lambda: generate_and_save_text(
                model=model,
                prompt=prompt,
                length=length,
                forbidden_words=forbidden_words,
                user_id=user_id,
                generation_type=generation_type,
            ),
        )

    except Exception as e:
        print(f"视图函数错误: {str(e)}")
        return jsonify({
            "status": "error",
            "message": "Internal server error"
        }), 500


'''
    2.文生图
'''


@ai.route('/generate/image', methods=['POST'])
def generate_image():
    """视图函数：只处理HTTP请求和响应"""
    try:
        data = request.get_json()
        print("=== 收到图像生成请求 ===")
        print(f"请求数据: {data}")

        # 参数解析
        # 前端传的是 model（历史取值 'hunyuan' 表示通义万相）；同时兼容 model_id，
        # 都缺省时交给 services 按 IMAGE_BACKEND 配置决定，避免这里写死默认值。
        model_id = data.get('model') or data.get('model_id') or None
        prompt = data.get('prompt')
        user_id = request.headers.get('X-User-Id', type=int)

        width = data.get('width', 768)
        height = data.get('height', 768)

        # 兼容处理：如果前端还传了 size 参数
        size = data.get('size')
        if size and 'x' in size:
            width, height = map(int, size.split('x'))

        print(f"解析后: model={model_id}, width={width}, height={height}, user_id={user_id}")

        # 参数验证
        if not prompt:
            return jsonify({
                "status": "error",
                "message": "prompt参数不能为空"
            }), 400

        if not user_id:
            return jsonify({
                "status": "error",
                "message": "user_id参数不能为空"
            }), 400

        def _sync_image():
            ok, info = generate_anime_image(
                user_id=user_id,
                prompt=prompt,
                model_id=model_id,
                width=width,
                height=height
            )
            if ok:
                return True, info
            return False, info

        return _submit_task(
            'image',
            {
                'user_id': user_id,
                'prompt': prompt,
                'model_id': model_id,
                'width': width,
                'height': height,
            },
            sync_fn=_sync_image,
        )

    except Exception as e:
        print(f"视图函数错误: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Internal server error: {str(e)}"
        }), 500


'''
    3.音乐合成（MusicGen：BGM / 环境音 / 旋律）
'''


@ai.route('/generate/music', methods=['POST'])
def generate_music_view():
    """
    生成**音乐**（不是把文字念出来）。

    请求体：
      { "prompt": "...", "duration": 10, "model": "local" | "musicgen" }
    """
    try:
        data = request.get_json() or {}
        model_path = data.get('model') or data.get('model_path') or None
        prompt = data.get('prompt')
        duration = data.get('duration') or _default_music_seconds()
        user_id = request.headers.get('X-User-Id', type=int)

        if not prompt:
            return jsonify({"status": "error", "message": "prompt 不能为空"}), 400
        if not user_id:
            return jsonify({"status": "error", "message": "缺少 X-User-Id 请求头"}), 400

        try:
            duration = int(duration)
        except (TypeError, ValueError):
            duration = _default_music_seconds()

        def _sync_music():
            return generate_music(user_id, prompt, duration, model_path)

        return _submit_task(
            'music',
            {'user_id': user_id, 'prompt': prompt,
             'duration': duration, 'model_path': model_path},
            sync_fn=_sync_music,
        )
    except Exception as e:
        print(f"视图函数错误: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Internal server error: {str(e)}"
        }), 500


def _default_music_seconds() -> int:
    try:
        return int(current_app.config.get('MUSIC_DEFAULT_SECONDS', 10))
    except Exception:
        return 10


'''
    4.配音（云端 TTS：把文字念出来）
'''


@ai.route('/generate/voice', methods=['POST'])
def generate_voice_view():
    """
    生成**配音**（文字转语音）。

    请求体：
      { "text": "...", "voice_type": "BV001_streaming", "duration": 0 }
    也兼容用 prompt 传文本，方便旧前端复用。
    """
    try:
        data = request.get_json() or {}
        text = data.get('text') or data.get('prompt') or ''
        voice_type = data.get('voice_type') or None
        duration = data.get('duration') or 0
        user_id = request.headers.get('X-User-Id', type=int)

        if not text.strip():
            return jsonify({"status": "error", "message": "配音文本不能为空"}), 400
        if not user_id:
            return jsonify({"status": "error", "message": "缺少 X-User-Id 请求头"}), 400

        def _sync_voice():
            return generate_voice(user_id, text, voice_type=voice_type,
                                  duration=int(duration or 0))

        return _submit_task(
            'voice',
            {'user_id': user_id, 'text': text,
             'voice_type': voice_type, 'duration': int(duration or 0)},
            sync_fn=_sync_voice,
        )
    except Exception as e:
        print(f"视图函数错误: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Internal server error: {str(e)}"
        }), 500


'''
    4.剧情续写（第 2 批：LangChain 上下文管理 + RAG 人设库）
'''
@ai.route('/continue_story', methods=['POST'])
def continue_story_view():
    """
    续写剧情。前端只需传「历史 + 本次要求」，上下文压缩与人设检索都在后端完成。

    body:
      {
        "project_id": 7,                  # 必填
        "scene_id": 15,                   # 可选，用于取场景背景与已写剧情
        "user_input": "让主角在这里表白",  # 本次创作要求
        "history": [...],                 # 可选，无状态模式：前端传的历史
        "session_id": "p7_u4",            # 可选，有状态模式：多轮记忆落 Redis
        "stateful": false,                # 是否启用服务端多轮记忆
        "use_rag": true,                  # 是否检索角色人设
        "length": 500,
        "temperature": 0.8,
        "forbidden_words": ""
      }
    """
    try:
        data = request.get_json(silent=True) or {}
        user_id = request.headers.get('X-User-Id', type=int)

        project_id = data.get('project_id')
        scene_id = data.get('scene_id')
        user_input = (data.get('user_input') or '').strip()
        history = data.get('history') or []
        session_id = data.get('session_id')
        stateful = bool(data.get('stateful', False))
        use_rag = bool(data.get('use_rag', True))
        length = data.get('length', 500)
        temperature = data.get('temperature', 0.8)
        forbidden_words = data.get('forbidden_words', [])
        model = data.get('model')

        if not user_id:
            return jsonify({"status": "error", "message": "缺少用户ID"}), 401
        if not project_id:
            return jsonify({"status": "error", "message": "project_id 不能为空"}), 400

        # 续写会读取项目角色/场景并写记忆，必须校验项目归属
        _, err = _owned_project_or_error(project_id)
        if err:
            return err
        if not isinstance(length, int) or length <= 0:
            return jsonify({"status": "error", "message": "length必须是正整数"}), 400
        if stateful and not session_id:
            # 有状态模式必须给会话标识，否则记忆无处可挂
            session_id = memory.make_session_id(project_id, user_id, None)
        if not isinstance(history, list):
            history = []

        params = {
            'user_id': user_id,
            'project_id': project_id,
            'scene_id': scene_id,
            'user_input': user_input,
            'history': history,
            'session_id': session_id,
            'stateful': stateful,
            'use_rag': use_rag,
            'length': length,
            'forbidden_words': forbidden_words,
            'temperature': temperature,
            'model': model,
        }

        return _submit_task('story', params, sync_fn=lambda: continue_story(**params))

    except Exception as e:
        print(f"视图函数错误: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


'''
    5.RAG 人设库管理（第 2 批）
'''


@ai.route('/rag/status/<int:project_id>', methods=['GET'])
def rag_status(project_id):
    """查看项目人设索引状态。"""
    _, err = _owned_project_or_error(project_id)
    if err:
        return err
    return jsonify({
        "status": "success",
        "data": {
            **rag.index_stats(project_id),
            "available": rag.available(),
        },
    }), 200


@ai.route('/rag/rebuild/<int:project_id>', methods=['POST'])
def rag_rebuild(project_id):
    """
    重建项目人设向量索引（角色增删改后调用）。

    角色多时嵌入较慢，默认走异步；ASYNC_ENABLED=false 时同步执行。
    """
    force = bool((request.get_json(silent=True) or {}).get('force', True))
    _, err = _owned_project_or_error(project_id)
    if err:
        return err
    return _submit_task(
        'rag',
        {'project_id': project_id, 'force': force},
        sync_fn=lambda: (lambda r: (r.get('ok', False), r))(rag.build_index(project_id, force=force)),
    )


@ai.route('/rag/search', methods=['GET'])
def rag_search():
    """按关键词检索角色人设（调试/预览用）。"""
    project_id = request.args.get('project_id', type=int)
    q = request.args.get('q', '')
    k = request.args.get('k', default=3, type=int)

    if not project_id or not q:
        return jsonify({"status": "error", "message": "project_id 与 q 不能为空"}), 400

    _, err = _owned_project_or_error(project_id)
    if err:
        return err

    hits = rag.search(project_id, q, k=k)
    return jsonify({"status": "success", "data": hits, "count": len(hits)}), 200


'''
    6.会话记忆管理（第 2 批）
'''


@ai.route('/memory/<string:session_id>', methods=['GET'])
def memory_get(session_id):
    """查看某会话的上下文记忆状态（消息条数 / 滚动摘要）。"""
    return jsonify({"status": "success", "data": memory.memory_state(session_id)}), 200


@ai.route('/memory/<string:session_id>', methods=['DELETE'])
def memory_reset(session_id):
    """清空某会话的记忆（重新开始一段多轮创作时用）。"""
    memory.reset_session(session_id)
    return jsonify({"status": "success", "message": "会话记忆已清空"}), 200