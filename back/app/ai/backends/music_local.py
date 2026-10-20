# -*- coding=utf-8 -*-
"""
本地 MusicGen 音乐生成后端（计划书 3.3：MusicGen-small，CPU 模式）。

与 image_local.py 同构的设计约束：
1. **懒加载**：不生成就不加载，进程启动零开销；
2. **低精度**：优先 bfloat16（Zen4 支持 AVX512-BF16）；
3. **内存守卫**：可用内存不足直接拒绝，理由要具体；
4. **用完即卸**：生成后立刻释放，不常驻。

与图像的区别：MusiGen 产的是**音乐**（melody / ambient / BGM），
不是把文字念出来 —— 那是 TTS（配音）。两者是不同能力，不能混用一个入口。
"""
import gc
import os
import threading
import time
import wave

from flask import current_app

try:
    import torch
    _TORCH_ERR = None
except Exception as e:                                   # pragma: no cover
    torch = None
    _TORCH_ERR = f'{type(e).__name__}: {e}'

try:
    from transformers import AutoProcessor, MusicgenForConditionalGeneration
    _HF_ERR = None
except Exception as e:                                   # pragma: no cover
    AutoProcessor = MusicgenForConditionalGeneration = None
    _HF_ERR = f'{type(e).__name__}: {e}'

try:
    import psutil
except Exception:                                        # pragma: no cover
    psutil = None

try:
    import numpy as np
except Exception:                                        # pragma: no cover
    np = None


_MODEL = None
_PROCESSOR = None
_LOCK = threading.RLock()
_LOADED_AT = None
_LOAD_SECONDS = None


# ==================== 配置与路径 ====================

def _back_root() -> str:
    here = os.path.abspath(__file__)
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(here))))


def _cfg(key, default=None):
    try:
        return current_app.config.get(key, default)
    except Exception:
        return default


def _resolve_model_dir() -> str:
    configured = _cfg('MUSIC_MODEL_DIR', '') or ''
    if configured:
        return configured if os.path.isabs(configured) else os.path.join(_back_root(), configured)
    return os.path.join(_back_root(), '.models', 'musicgen-small')


def _free_ram_gb():
    if psutil is None:
        return None
    return round(psutil.virtual_memory().available / 1024 ** 3, 2)


def _supports_bf16() -> bool:
    if torch is None:
        return False
    try:
        a = torch.ones((8, 8), dtype=torch.bfloat16)
        (a @ a).sum().item()
        return True
    except Exception:
        return False


def _pick_dtype():
    want = (_cfg('MUSIC_DTYPE', 'bf16') or 'bf16').lower()
    if want == 'fp32':
        return torch.float32, 'fp32'
    if _supports_bf16():
        return torch.bfloat16, 'bf16'
    return torch.float32, 'fp32'


# ==================== 可用性 ====================

def available() -> dict:
    """供 /ai/health 使用，不加载模型。"""
    reasons = []
    if _TORCH_ERR:
        reasons.append(f'torch 不可用: {_TORCH_ERR}')
    if _HF_ERR:
        reasons.append(f'transformers 不可用: {_HF_ERR}')
    if np is None:
        reasons.append('numpy 不可用')

    model_dir = _resolve_model_dir()
    config_ok = os.path.exists(os.path.join(model_dir, 'config.json'))
    # 必须是 transformers 能 load 的格式；只有 state_dict.bin 的情况见 _load() 的说明
    has_weight = any(
        os.path.exists(os.path.join(model_dir, f))
        for f in ('model.safetensors', 'pytorch_model.bin')
    )
    if not config_ok:
        reasons.append(f'模型配置不存在: {model_dir}')
    elif not has_weight:
        reasons.append(f'模型权重不存在（需先下载 MusicGen-small）: {model_dir}')

    fatal = [r for r in reasons if '不可用' in r or '不存在' in r]

    need_ram = float(_cfg('MUSIC_MIN_FREE_RAM_GB', 2.5) or 2.5)
    free_ram = _free_ram_gb()
    ram_ok = free_ram is None or free_ram >= need_ram

    return {
        "ok": not fatal,
        "backend": "local",
        "engine": "transformers-musicgen",
        "model_dir": model_dir,
        "model_exists": config_ok and has_weight,
        "loaded": _MODEL is not None,
        "dtype": (_cfg('MUSIC_DTYPE', 'bf16') or 'bf16'),
        "free_ram_gb": free_ram,
        "need_ram_gb": need_ram,
        "ram_ok": ram_ok,
        "ready": (not fatal) and ram_ok,
        "reasons": reasons,
    }


def status() -> dict:
    info = available()
    info.update({"loaded": _MODEL is not None,
                 "loaded_at": _LOADED_AT,
                 "load_seconds": _LOAD_SECONDS})
    return info


# ==================== 加载 / 卸载 ====================

def _top_ram_hogs(limit=3):
    if psutil is None:
        return []
    closable = {'msedge': 'Edge 浏览器', 'chrome': 'Chrome 浏览器', 'QQ': 'QQ',
                'WeChat': '微信', 'llama-server': 'llama.cpp 服务',
                'DeepSeek Harness': 'DeepSeek 客户端', 'Code': 'VS Code',
                'Docker Desktop': 'Docker Desktop', '哔哩哔哩': '哔哩哔哩'}
    merged = {}
    for p in psutil.process_iter(['name', 'memory_info']):
        try:
            name = p.info['name'] or ''
            base = name[:-4] if name.lower().endswith('.exe') else name
            if base in closable:
                merged[closable[base]] = merged.get(closable[base], 0) + \
                    p.info['memory_info'].rss / 1024 ** 3
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    top = sorted(merged.items(), key=lambda x: -x[1])[:limit]
    return [f'{n}（{m:.1f}GB）' for n, m in top if m >= 0.2]


def _check_ram_before_load():
    need = float(_cfg('MUSIC_MIN_FREE_RAM_GB', 2.5) or 2.5)
    free = _free_ram_gb()
    if free is not None and free < need:
        msg = f'可用内存不足，拒绝加载 MusicGen（需要 ≥{need}GB，当前 {free}GB）。'
        hogs = _top_ram_hogs()
        if hogs:
            msg += '建议先关闭：' + '、'.join(hogs) + '。'
        msg += '或改用云端配音后端。'
        raise RuntimeError(msg)


def _load():
    global _MODEL, _PROCESSOR, _LOADED_AT, _LOAD_SECONDS

    if _MODEL is not None:
        return _MODEL, _PROCESSOR

    if _TORCH_ERR or _HF_ERR:
        raise RuntimeError(f'MusicGen 依赖不可用：{_TORCH_ERR or _HF_ERR}')

    model_dir = _resolve_model_dir()
    if not os.path.exists(os.path.join(model_dir, 'config.json')):
        raise RuntimeError(f'MusicGen 模型不存在：{model_dir}')
    # 注意：早先的 musicgen-small 下载产出的是 state_dict.bin（原始权重，非 safetensors），
    # 用它 from_pretrained 会在加载时抛异常；这里显式拦截，避免用户等半天才看到报错。
    if not any(os.path.exists(os.path.join(model_dir, f))
               for f in ('model.safetensors', 'pytorch_model.bin')):
        raise RuntimeError(
            f'MusicGen 权重格式不兼容：{model_dir} 缺少 model.safetensors / pytorch_model.bin'
            '（只有 state_dict.bin 时无法被 transformers 直接加载），请重新下载。'
        )

    _check_ram_before_load()

    dtype, dtype_name = _pick_dtype()
    t0 = time.time()

    processor = AutoProcessor.from_pretrained(model_dir, local_files_only=True)
    model = MusicgenForConditionalGeneration.from_pretrained(
        model_dir, torch_dtype=dtype, local_files_only=True,
    )
    model.to('cpu')
    model.eval()

    _MODEL, _PROCESSOR = model, processor
    _LOADED_AT = time.strftime('%Y-%m-%d %H:%M:%S')
    _LOAD_SECONDS = round(time.time() - t0, 1)
    print(f'[local-music] 模型已加载 dtype={dtype_name} 耗时={_LOAD_SECONDS}s '
          f'可用内存={_free_ram_gb()}GB')
    return model, processor


def unload() -> bool:
    global _MODEL, _PROCESSOR, _LOADED_AT, _LOAD_SECONDS
    with _LOCK:
        if _MODEL is None:
            return False
        _MODEL = None
        _PROCESSOR = None
        _LOADED_AT = None
        _LOAD_SECONDS = None
        gc.collect()
        print(f'[local-music] 模型已卸载，可用内存={_free_ram_gb()}GB')
        return True


# ==================== 生成 ====================

def _write_wav(path: str, audio, sample_rate: int):
    """把 (channels, samples) 的 float 波形写成 16-bit PCM wav，不引入 soundfile 依赖。"""
    data = np.asarray(audio, dtype=np.float32)
    if data.ndim == 1:
        data = data[None, :]
    # 转置为 (samples, channels)
    data = data.T
    # 裁剪到 [-1, 1] 再转 int16
    data = np.clip(data, -1.0, 1.0)
    pcm = (data * 32767.0).astype(np.int16)

    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with wave.open(path, 'wb') as wf:
        wf.setnchannels(pcm.shape[1] if pcm.ndim > 1 else 1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())


def generate(prompt: str, duration: int = 10, seed: int = None,
             guidance: float = None, temperature: float = None) -> dict:
    """
    生成音乐（BGM / 环境音 / 旋律片段），返回 {'path':..., 'meta':{...}}。

    :param duration: 期望时长（秒），内部换算成 token 数
    """
    if np is None:
        raise RuntimeError('numpy 不可用，无法写出音频')

    with _LOCK:
        model, processor = _load()

        sr = int(getattr(model.config.audio_encoder, 'sampling_rate', 32000))
        # MusicGen 每秒约 50 个 token（frame rate 50Hz）
        max_new_tokens = int(max(1, min(duration, 30)) * 50)

        guidance = float(_cfg('MUSIC_GUIDANCE', 3.0) if guidance is None else guidance)
        temperature = float(_cfg('MUSIC_TEMPERATURE', 1.0) if temperature is None else temperature)

        if seed is None or int(seed) < 0:
            seed = int.from_bytes(os.urandom(4), 'big') % (2 ** 31)
        if torch is not None:
            torch.manual_seed(int(seed))

        inputs = processor(text=[prompt], padding=True, return_tensors='pt')

        t0 = time.time()
        with torch.inference_mode():
            audio_values = model.generate(
                **inputs,
                do_sample=True,
                guidance_scale=guidance,
                temperature=temperature,
                max_new_tokens=max_new_tokens,
            )
        elapsed = round(time.time() - t0, 2)

        audio = audio_values[0].cpu().float().numpy()
        if audio.ndim == 2:      # (channels, samples)
            audio = audio[0] if audio.shape[0] == 1 else audio

        actual_seconds = round(len(audio) / sr, 2) if audio.ndim == 1 \
            else round(audio.shape[1] / sr, 2)

        meta = {
            "backend": "local",
            "engine": "musicgen-small",
            "dtype": _pick_dtype()[1],
            "sample_rate": sr,
            "requested_seconds": duration,
            "seconds": elapsed,
            "audio_seconds": actual_seconds,
            "max_new_tokens": max_new_tokens,
            "guidance": guidance,
            "temperature": temperature,
            "seed": seed,
        }
        print(f'[local-music] 生成完成 {actual_seconds}s 音频 耗时={elapsed}s seed={seed}')
        return {"audio": audio, "sample_rate": sr, "meta": meta}


def generate_to_file(prompt: str, out_path: str, **kwargs) -> dict:
    payload = generate(prompt, **kwargs)
    _write_wav(out_path, payload["audio"], payload["sample_rate"])
    meta = payload["meta"]
    meta["file"] = out_path
    meta["size_bytes"] = os.path.getsize(out_path)
    return meta
