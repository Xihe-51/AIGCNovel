import base64
import re
import time
import uuid
import requests
import json
import hmac
import hashlib
import os
from datetime import datetime
from typing import Tuple, List, Dict
from flask import current_app
from .. import db
from ..models import AIGeneration
from ..extensions import cache_get, cache_set
from .backends import text_ollama, text_deepseek


# ==================== 固定端点（密钥已迁至 .env） ====================

TONGYI_CREATE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis"
TONGYI_QUERY_URL = "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}"

VOLCENGINE_TTS_URL = "https://openspeech.bytedance.com/api/v1/tts"
VOLCENGINE_ASYNC_URL = "https://openspeech.bytedance.com/api/v1/tts_async/submit"
VOLCENGINE_QUERY_URL = "https://openspeech.bytedance.com/api/v1/tts_async/query"


def _cfg(key, default=None):
    """安全读取配置：无 app context 时返回默认值（供 Celery 任务复用）。"""
    try:
        return current_app.config.get(key, default)
    except Exception:
        return default



# ==================== 工具函数 ====================

def remove_think_tags(text: str) -> str:
    """使用正则表达式去除<think>标签及其内容"""
    cleaned_text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    return cleaned_text


# ==================== 文本生成（多后端：ollama / deepseek） ====================

def _sanitize_forbidden_words(forbidden_words) -> List[str]:
    """规整违禁词：去空白、丢空串，避免 replace('', ...) 污染整段文本。"""
    if not forbidden_words:
        return []
    if isinstance(forbidden_words, str):
        parts = re.split(r'[，,、\s]+', forbidden_words)
    else:
        parts = list(forbidden_words)
    return [w.strip() for w in parts if isinstance(w, str) and w.strip()]


# 前端历史上把云端模型名（deepseek）直接写进下拉框，若原样传给 Ollama 会 404，
# 进而静默降级到云端 —— 与 FIX-1 同一类问题，这里统一做一次清洗。
_CLOUD_TEXT_ALIASES = ('deepseek', 'deepseek-chat', 'deepseek-r1', 'deepseek-reasoner',
                       'gpt', 'gpt-3.5', 'gpt-4', 'openai', 'hunyuan')


def _clean_text_model(backend: str, model: str):
    """本地后端时，丢弃明显属于云端的模型名，交给配置里的本地模型名。"""
    if not model:
        return None
    if backend == 'ollama' and model.strip().lower() in _CLOUD_TEXT_ALIASES:
        return None
    return model


def generate_text_via_backend(prompt: str, model: str = None, length: int = 512,
                              temperature: float = 0.7) -> Tuple[str, str]:
    """
    按 TEXT_BACKEND 配置选择后端生成文本。

    :return: (generated_text, backend_used)
    :raises: 后端异常原样抛出，由调用方处理
    """
    backend = (_cfg('TEXT_BACKEND', 'ollama') or 'ollama').lower()
    model = _clean_text_model(backend, model)

    if backend == 'deepseek':
        return text_deepseek.generate(prompt, model=model, length=length,
                                      temperature=temperature), 'deepseek'

    # 默认走本地 Ollama；失败时按配置决定是否降级到云端
    try:
        return text_ollama.generate(prompt, model=model, length=length,
                                    temperature=temperature), 'ollama'
    except Exception as e:
        allow_fallback = _cfg('TEXT_FALLBACK_TO_CLOUD', True)
        if allow_fallback and _cfg('DEEPSEEK_API_KEY'):
            print(f"[text] Ollama 不可用({e})，降级到 DeepSeek 云 API")
            text = text_deepseek.generate(prompt, model=model, length=length,
                                          temperature=temperature)
            return text, 'deepseek(fallback)'
        raise


def generate_and_save_text(
        model: str,
        prompt: str,
        length: int,
        forbidden_words: List[str],
        user_id: int,
        generation_type: str = "text"
) -> Tuple[bool, Dict]:
    """
    生成 AI 文本并保存到数据库（后端由 TEXT_BACKEND 决定：本地 Ollama / DeepSeek 云）。
    """
    try:
        # ---- 缓存层：命中则直接复用生成文本，避免重复推理 ----
        cache_key = None
        if _cfg('CACHE_ENABLED', False):
            import hashlib as _hashlib
            raw = f"{user_id}|{model}|{length}|{prompt}"
            cache_key = 'ai:text:' + _hashlib.md5(raw.encode('utf-8')).hexdigest()
            hit = cache_get(cache_key)
            if hit and isinstance(hit, dict) and hit.get('generated_text'):
                print(f"[cache] 命中文本缓存: {cache_key}")
                hit = dict(hit)
                hit['backend'] = hit.get('backend', 'cache')
                hit['cached'] = True
                return True, hit

        generated_text, backend_used = generate_text_via_backend(
            prompt=prompt, model=model, length=length, temperature=0.7
        )

        generated_text = remove_think_tags(generated_text)

        # 违禁词过滤（已修复空串问题）
        forbidden_words = _sanitize_forbidden_words(forbidden_words)
        for word in forbidden_words:
            generated_text = generated_text.replace(word, "[已过滤]")

        generation_record = AIGeneration(
            user_id=user_id,
            prompt_text=prompt,
            generated_text=generated_text,
            length=len(generated_text),
            type=generation_type,
            forbidden_words=','.join(forbidden_words) if forbidden_words else None
        )

        db.session.add(generation_record)
        db.session.commit()

        result = {
            "generation_id": generation_record.generation_id,
            "generated_text": generated_text,
            "model": model,
            "backend": backend_used,
            "length": len(generated_text),
            "forbidden_words": forbidden_words,
            "created_at": generation_record.created_at.isoformat()
        }

        # ---- 写缓存（TTL 见 CACHE_TTL，默认 3600s）----
        if cache_key:
            cache_set(cache_key, result, ttl=_cfg('CACHE_TTL', 3600))

        return True, result

    except requests.exceptions.RequestException as e:
        db.session.rollback()
        print(f"AI 服务请求错误: {str(e)}")
        return False, {"message": f"AI服务连接错误: {str(e)}"}
    except KeyError as e:
        db.session.rollback()
        print(f"API响应格式错误: {str(e)}")
        return False, {"message": f"API响应解析错误: {str(e)}"}
    except ValueError as e:
        db.session.rollback()
        print(f"生成文本错误: {str(e)}")
        return False, {"message": str(e)}
    except Exception as e:
        db.session.rollback()
        print(f"生成或保存文本错误: {str(e)}")
        return False, {"message": f"处理错误: {str(e)}"}


# ==================== 图像生成（双轨：通义万相云端 / 本地 SD） ====================

# 前端历史上把「通义万相」叫 hunyuan，这里做别名归一化，避免参数名/取值不一致导致静默走错后端
_IMAGE_LOCAL_ALIASES = ('local', 'sd', 'local_sd', 'local-sd', 'stable-diffusion', 'stable_diffusion')
_IMAGE_CLOUD_ALIASES = ('tongyi', 'hunyuan', 'wanx', 'wanx-v1', 'tongyi-wanxiang', 'cloud')


def _resolve_image_backend(model_id: str) -> str:
    """把各种叫法归一成 'local' / 'tongyi'；无法识别时跟随 IMAGE_BACKEND 配置。"""
    raw = (model_id or '').strip().lower()
    if raw in _IMAGE_LOCAL_ALIASES:
        return 'local'
    if raw in _IMAGE_CLOUD_ALIASES:
        return 'tongyi'
    backend = (_cfg('IMAGE_BACKEND', 'tongyi') or 'tongyi').strip().lower()
    return 'local' if backend == 'local' else 'tongyi'


def generate_anime_image(user_id: int, prompt: str, model_id: str = None,
                         width: int = 768, height: int = 768) -> Tuple[bool, Dict]:
    """
    图像生成统一入口，按 model_id 或 IMAGE_BACKEND 分发到具体后端。

    :param model_id: 'local' 强制本地 SD；'tongyi'/'hunyuan' 强制云端；其他值跟随 IMAGE_BACKEND
    :return: (是否成功, 附加信息 dict)
    """
    backend = _resolve_image_backend(model_id)
    if backend == 'local':
        return _generate_image_local(user_id, prompt, width, height)
    return _generate_image_tongyi(user_id, prompt, width, height)


def _save_image_record(user_id: int, prompt: str, filename: str):
    """统一落库，避免两条后端各写一遍。"""
    generation_record = AIGeneration(
        user_id=user_id,
        prompt_text=prompt,
        generated_text=filename.replace("app", "", 1),
        length=1,
        type="image",
        forbidden_words="default"
    )
    db.session.add(generation_record)
    db.session.commit()


def _generate_image_tongyi(user_id: int, prompt: str, width: int, height: int) -> Tuple[bool, Dict]:
    """通义万相（云端，异步任务 + 轮询）。"""
    try:
        image_url = _generate_with_tongyi_async(prompt, width, height)
        if not image_url:
            return False, {"message": "通义万相未返回图片地址", "backend": "tongyi"}

        img_response = requests.get(image_url, timeout=30)
        img_response.raise_for_status()

        directory = f"app/static/images/{user_id}"
        os.makedirs(directory, exist_ok=True)

        timestamp = int(time.time())
        filename = f"{directory}/{timestamp}.png"

        with open(filename, 'wb') as f:
            f.write(img_response.content)

        _save_image_record(user_id, prompt, filename)
        return True, {"message": "生成完成", "backend": "tongyi",
                      "model": "wanx-v1", "file": _static_rel_url(filename),
                      "width": width, "height": height}

    except Exception as e:
        print(f"生成图像时出错: {str(e)}")
        db.session.rollback()
        return False, {"message": f"云端图像生成失败: {e}", "backend": "tongyi"}


def _generate_image_local(user_id: int, prompt: str, width: int, height: int) -> Tuple[bool, Dict]:
    """本地 Stable Diffusion（CPU）。失败不抛异常，交由上层决定是否降级。"""
    try:
        from .backends import image_local

        avail = image_local.available()
        if not avail.get('ok'):
            return False, {
                "message": "本地 SD 不可用: " + "; ".join(avail.get('reasons') or []),
                "backend": "local",
            }

        directory = f"app/static/images/{user_id}"
        os.makedirs(directory, exist_ok=True)
        timestamp = int(time.time())
        filename = f"{directory}/{timestamp}.png"

        meta = image_local.generate_to_file(prompt, filename, width=width, height=height)

        _save_image_record(user_id, prompt, filename)
        meta.update({"message": "生成完成", "file": _static_rel_url(filename)})
        return True, meta

    except Exception as e:
        print(f"本地图像生成出错: {str(e)}")
        db.session.rollback()
        return False, {"message": f"本地图像生成失败: {e}", "backend": "local"}
    finally:
        # 出图后立刻释放模型，不常驻内存（16GB 内存的硬约束）
        try:
            if _cfg('SD_UNLOAD_AFTER', True):
                from .backends import image_local
                image_local.unload()
        except Exception:
            pass


def _generate_with_tongyi_async(prompt: str, width: int = 1024, height: int = 1024, max_wait: int = 120) -> str:
    """
    调用通义万相 API 生成图像（异步模式）
    """
    headers = {
        "Authorization": f"Bearer {_cfg('TONGYI_API_KEY', '')}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
    }

    # 通义万相支持的尺寸：1024*1024, 720*1280, 1280*720, 768*1152
    # 把传入的宽高映射到支持的尺寸
    if width == 768 and height == 768:
        size = "1024*1024"  # 1:1 用 1024
    elif width == 768 and height == 1024:
        size = "768*1152"   # 3:4 竖版
    elif width == 1024 and height == 768:
        size = "1280*720"   # 4:3 横版
    else:
        size = "1024*1024"  # 默认

    payload = {
        "model": "wanx-v1",
        "input": {
            "prompt": prompt
        },
        "parameters": {
            "size": size,
            "n": 1
        }
    }
    print(f"\n=== 通义万相异步生图请求 ===")
    print(f"Prompt: {prompt[:50]}...")
    print(f"Size: {size}")

    # 1. 创建异步任务
    response = requests.post(
        TONGYI_CREATE_URL,
        headers=headers,
        json=payload,
        timeout=60
    )

    print(f"创建任务 HTTP 状态码: {response.status_code}")

    result = response.json()
    print(f"创建任务响应: {json.dumps(result, indent=2, ensure_ascii=False)}")

    if "code" in result and result["code"] != "0":
        raise ValueError(f"通义万相 API 错误 [{result.get('code')}]: {result.get('message')}")

    task_id = result.get("output", {}).get("task_id")
    if not task_id:
        raise ValueError(f"未获取到 task_id: {result}")

    print(f"任务已创建，task_id: {task_id}")

    # 2. 轮询查询任务状态
    query_url = TONGYI_QUERY_URL.format(task_id=task_id)
    interval = 2
    waited = 0

    while waited < max_wait:
        time.sleep(interval)
        waited += interval

        query_response = requests.get(
            query_url,
            headers={"Authorization": f"Bearer {_cfg('TONGYI_API_KEY', '')}"},
            timeout=30
        )

        query_result = query_response.json()
        task_status = query_result.get("output", {}).get("task_status")

        print(f"轮询 {waited}s: 任务状态 = {task_status}")

        if task_status == "SUCCEEDED":
            results = query_result.get("output", {}).get("results", [])
            if results and len(results) > 0:
                return results[0].get("url")
            else:
                raise ValueError("任务成功但未返回图片 URL")

        elif task_status == "FAILED":
            error_msg = query_result.get("output", {}).get("message", "未知错误")
            raise ValueError(f"任务失败: {error_msg}")

        # 其他状态（PENDING, RUNNING）继续等待

    raise ValueError(f"任务超时（{max_wait}秒）")


# ==================== 音乐生成（本地 MusicGen）与配音（云端 TTS） ====================
#
# 这两件事**语义完全不同**，必须分开：
#   - 音乐 / BGM / 环境音 → MusicGen（text-to-music）
#   - 把文字念出来       → TTS 配音（text-to-speech）
# 历史实现把两者混在 generate_music_wav() 里，实际跑的是 TTS，
# 却挂在「音乐合成 / ACE-Step」的界面上，属于语义错配。

_MUSIC_LOCAL_ALIASES = ('local', 'musicgen', 'musicgen-small', 'ace-step', 'acestep')
_MUSIC_CLOUD_ALIASES = ('volcengine', 'cloud', 'tts')


def _resolve_music_backend(model_path: str) -> str:
    raw = (model_path or '').strip().lower()
    if raw in _MUSIC_LOCAL_ALIASES:
        return 'local'
    if raw in _MUSIC_CLOUD_ALIASES:
        return 'volcengine'
    backend = (_cfg('MUSIC_BACKEND', 'volcengine') or 'volcengine').strip().lower()
    return 'local' if backend == 'local' else 'volcengine'


def _static_rel_url(full_path: str) -> str:
    """
    把磁盘路径转成前端可直接拼 BASE_URL 的 URL 片段。

    坑：`os.path.join('app/static/music/4', 'a.wav')` 在 Windows 上得到
    `app/static/music/4\\a.wav`，混入反斜杠后前端拼出的 URL 不可靠。
    这里统一转成 `/static/music/4/a.wav`。
    """
    rel = full_path.replace('\\', '/')
    if rel.startswith('app/'):
        rel = rel[len('app'):]
    elif rel.startswith('app'):
        rel = rel[len('app'):]
    return rel


def _save_audio_record(user_id: int, prompt: str, filename: str,
                       duration: int, gen_type: str):
    record = AIGeneration(
        user_id=user_id,
        prompt_text=prompt,
        generated_text=_static_rel_url(filename),
        length=duration,
        type=gen_type,
        forbidden_words="default",
    )
    db.session.add(record)
    db.session.commit()


def generate_music(user_id: int, prompt: str, duration: int,
                   model_path: str = None) -> Tuple[bool, Dict]:
    """
    生成**音乐 / BGM / 环境音**（不是把文字念出来）。

    后端由 model_path 或 MUSIC_BACKEND 决定：
      - local：本地 MusicGen-small（CPU）
      - volcengine：项目当前没有云端音乐 API，明确报错而不是假装成功

    :return: (是否成功, 附加信息)
    """
    backend = _resolve_music_backend(model_path)

    if backend == 'volcengine':
        # 火山引擎在项目里只提供 TTS（配音），不是音乐生成。
        # 与其静默拿 TTS 冒充分乐，不如明确告诉用户该走哪条路。
        return False, {
            "message": "当前没有可用的云端音乐生成后端。"
                       "请选择「本地 MusicGen」，或改用「配音」功能（云端 TTS）。",
            "backend": "volcengine",
        }

    try:
        from .backends import music_local

        avail = music_local.available()
        if not avail.get('ok'):
            return False, {
                "message": "本地 MusicGen 不可用: " + "; ".join(avail.get('reasons') or []),
                "backend": "local",
            }

        directory = f"app/static/music/{user_id}"
        os.makedirs(directory, exist_ok=True)
        timestamp = int(time.time())
        filename = f"music_{timestamp}.wav"
        full_path = os.path.join(directory, filename)

        meta = music_local.generate_to_file(prompt, full_path, duration=duration)
        _save_audio_record(user_id, prompt, full_path, duration, "music")
        meta.update({"message": "生成完成", "backend": "local",
                     "file": _static_rel_url(full_path)})
        return True, meta

    except Exception as e:
        print(f"本地音乐生成出错: {str(e)}")
        db.session.rollback()
        return False, {"message": f"本地音乐生成失败: {e}", "backend": "local"}
    finally:
        try:
            if _cfg('MUSIC_UNLOAD_AFTER', True):
                from .backends import music_local
                music_local.unload()
        except Exception:
            pass


# ---------- 配音（云端 TTS） ----------

# 火山「语音合成」两个接口，语义不同：
#   /api/v1/tts            → 一次性合成（请求体简单，返回 base64 音频数据）
#   /api/v1/tts_async/...  → 长文本异步合成（需要 appid+token+cluster 扁平参数）
# 历史实现把 map 型的 app 塞进了 async 接口，被服务端直接拒绝（HTTP 400）。
VOLCENGINE_TTS_SYNC_URL = "https://openspeech.bytedance.com/api/v1/tts"


def _volcengine_appid():
    """appid 必须是字符串，转成 int 会被序列化成 2.12e+09 导致服务端解析失败。"""
    return str(_cfg('VOLCENGINE_APPID', '') or '').strip()


def _volcengine_token():
    return str(_cfg('VOLCENGINE_TTS_TOKEN', '') or '').strip()


def generate_voice(user_id: int, text: str, voice_type: str = None,
                   duration: int = 0) -> Tuple[bool, Dict]:
    """
    把文字合成**配音音频**（火山引擎 TTS，一次性合成接口）。

    :return: (是否成功, 附加信息)
    """
    text = (text or '').strip()
    if not text:
        return False, {"message": "配音文本不能为空"}
    if len(text) > 1000:
        return False, {"message": f"配音单次最多 1000 字（当前 {len(text)} 字）"}

    appid = _volcengine_appid()
    token = _volcengine_token()
    if not appid or not token:
        return False, {
            "message": "未配置火山引擎 TTS 凭据。请在 .env 设置 VOLCENGINE_APPID 与 "
                       "VOLCENGINE_TTS_TOKEN（控制台「语音技术」页面获取）。",
        }

    voice_type = voice_type or _cfg('VOLCENGINE_VOICE_TYPE', 'BV001_streaming')
    fmt = 'mp3'

    headers = {
        'Authorization': f'Bearer;{token}',   # 注意：火山这里用分号，不是空格
        'Content-Type': 'application/json',
    }
    payload = {
        # 关键：appid / token / cluster 平铺在 app 对象里，且 appid 必须是字符串
        "app": {
            "appid": appid,
            "token": token,
            "cluster": _cfg('VOLCENGINE_CLUSTER', 'volcano_tts'),
        },
        "user": {"uid": str(user_id)},
        "audio": {
            "voice_type": voice_type,
            "encoding": fmt,
            "speed_ratio": 1.0,
            "volume_ratio": 1.0,
            "pitch_ratio": 1.0,
        },
        "request": {
            "reqid": str(uuid.uuid4()),
            "text": text,
            "text_type": "plain",
            "operation": "query",   # 一次性合成固定用 query
            "with_frontend": 1,
            "frontend_type": "unitTson",
        },
    }

    try:
        resp = requests.post(VOLCENGINE_TTS_SYNC_URL, headers=headers,
                             json=payload, timeout=60)
        resp.raise_for_status()
        result = resp.json()
    except requests.exceptions.RequestException as e:
        return False, {"message": f"火山 TTS 请求失败: {e}"}

    if result.get('code') != 3000:
        return False, {"message": f"火山 TTS 错误 [{result.get('code')}]: {result.get('message')}"}

    audio_b64 = (result.get('data') or '')
    if not audio_b64:
        return False, {"message": f"火山 TTS 未返回音频数据: {str(result)[:200]}"}

    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception as e:
        return False, {"message": f"音频数据解码失败: {e}"}

    directory = f"app/static/music/{user_id}"
    os.makedirs(directory, exist_ok=True)
    filename = f"voice_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{fmt}"
    full_path = os.path.join(directory, filename)
    with open(full_path, 'wb') as f:
        f.write(audio_bytes)

    try:
        _save_audio_record(user_id, text, full_path, duration or 0, "voice")
    except Exception as e:
        db.session.rollback()
        print(f'[voice] 落库失败（音频已生成）: {e}')

    return True, {
        "message": "配音生成完成",
        "backend": "volcengine-tts",
        "voice_type": voice_type,
        "file": _static_rel_url(full_path),
        "size_bytes": len(audio_bytes),
    }


# 兼容旧调用：历史上的 generate_music_wav 实际做的是配音
def generate_music_wav(user_id: int, prompt: str, duration: int,
                       model_path: str = "volcengine") -> bool:
    """[已废弃] 旧签名，内部改走配音链路。新代码请直接用 generate_voice / generate_music。"""
    ok, _ = generate_voice(user_id, prompt, duration=duration)
    return ok
