# -*- coding=utf-8 -*-
"""
本地 Stable Diffusion 图像生成后端（计划书 3.3.2 方案，CPU 模式）。

设计要点（针对 16GB 内存 / 无可用 GPU 的硬约束）：
1. **懒加载**：进程启动不加载模型，首次真正出图时才载入；
2. **低精度**：优先 bfloat16（Zen4 支持 AVX512-BF16，权重内存减半），不可用则回落 fp32；
3. **低步数**：配合 LCM-LoRA，4~8 步即可出图（裸 SD1.5 需 20~25 步）；
4. **省内存**：attention slicing + vae slicing/tiling，压制峰值；
5. **用完即卸**：可配置出图后立刻释放，不常驻内存；
6. **内存守卫**：可用内存低于阈值时直接拒绝并给出明确原因，绝不把机器拖进换页。

对外只暴露 `available()` / `generate()` / `unload()` / `status()` 四个函数，
上层（services.py）不感知 diffusers 细节。
"""
import gc
import os
import threading
import time

from flask import current_app

# ---- 依赖探测：缺失时整个模块降级为「不可用」，不影响主流程 ----
try:
    import torch
    _TORCH_ERR = None
except Exception as e:                                   # pragma: no cover
    torch = None
    _TORCH_ERR = f'{type(e).__name__}: {e}'

try:
    from diffusers import LCMScheduler, StableDiffusionPipeline
    _DIFFUSERS_ERR = None
except Exception as e:                                   # pragma: no cover
    LCMScheduler = StableDiffusionPipeline = None
    _DIFFUSERS_ERR = f'{type(e).__name__}: {e}'

try:
    import peft as _peft_probe          # noqa: F401  LoRA 加载（load_lora_weights）必需
    _PEFT_ERR = None
except Exception as e:                                   # pragma: no cover
    _PEFT_ERR = f'{type(e).__name__}: {e}'

try:
    import psutil
except Exception:                                        # pragma: no cover
    psutil = None


# 全局单例：同一时刻只允许一个生成任务持有模型
_PIPE = None
_LOCK = threading.RLock()
_LOADED_AT = None
_LOAD_SECONDS = None


# ==================== 路径与配置 ====================

def _back_root() -> str:
    """定位 back/ 目录（本文件位于 back/app/ai/backends/）。"""
    here = os.path.abspath(__file__)
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(here))))


def _cfg(key, default=None):
    try:
        return current_app.config.get(key, default)
    except Exception:
        return default


def _resolve_model_path() -> str:
    """模型权重路径：优先配置，其次 back/.models 下的默认文件名。"""
    configured = _cfg('SD_MODEL_PATH', '') or ''
    if configured:
        return configured if os.path.isabs(configured) else os.path.join(_back_root(), configured)
    return os.path.join(_back_root(), '.models', 'Counterfeit-V2.5_fp16.safetensors')


def _resolve_lora_path() -> str:
    configured = _cfg('SD_LORA_PATH', '') or ''
    if configured:
        return configured if os.path.isabs(configured) else os.path.join(_back_root(), configured)
    return os.path.join(_back_root(), '.models', 'lcm-lora-sdv1-5.safetensors')


def _resolve_config_dir() -> str:
    """
    单文件权重必须配一份 diffusers 结构配置，否则 from_single_file 会去远端拉
    stable-diffusion-v1-5 的默认配置（加载依赖网络，离线即失败）。
    这里指向本地已下好的配置目录，保证完全离线加载。
    """
    configured = _cfg('SD_CONFIG_DIR', '') or ''
    if configured:
        return configured if os.path.isabs(configured) else os.path.join(_back_root(), configured)
    return os.path.join(_back_root(), '.models', 'sd15-config')


def _free_ram_gb():
    if psutil is None:
        return None
    return round(psutil.virtual_memory().available / 1024 ** 3, 2)


def _supports_bf16() -> bool:
    """实测一次 bf16 矩阵乘，确认 CPU 后端真的支持（Zen4 通常支持）。"""
    if torch is None:
        return False
    try:
        a = torch.ones((8, 8), dtype=torch.bfloat16)
        (a @ a).sum().item()
        return True
    except Exception:
        return False


def _pick_dtype():
    want = (_cfg('SD_DTYPE', 'bf16') or 'bf16').lower()
    if want == 'fp32':
        return torch.float32, 'fp32'
    if _supports_bf16():
        return torch.bfloat16, 'bf16'
    return torch.float32, 'fp32'


# ==================== 可用性 / 状态 ====================

def available() -> dict:
    """
    供 /ai/health 与上层降级判断使用。
    注意：这里**不加载模型**，只检查文件与依赖，调用代价极低。
    """
    reasons = []
    if _TORCH_ERR:
        reasons.append(f'torch 不可用: {_TORCH_ERR}')
    if _DIFFUSERS_ERR:
        reasons.append(f'diffusers 不可用: {_DIFFUSERS_ERR}')

    model_path = _resolve_model_path()
    lora_path = _resolve_lora_path()
    config_dir = _resolve_config_dir()

    if not os.path.exists(model_path):
        reasons.append(f'模型权重不存在: {model_path}')
    if not os.path.exists(lora_path):
        # LoRA 缺失不算致命：可以退化为裸 SD1.5（只是步数要调高）
        reasons.append(f'LCM-LoRA 不存在（将退化为高步数模式）: {lora_path}')
    if not os.path.exists(os.path.join(config_dir, 'model_index.json')):
        reasons.append(f'本地配置缺失（加载时将联网拉取）: {config_dir}')
    if _PEFT_ERR and os.path.exists(lora_path):
        # peft 缺失时 LoRA 加载会失败，退化为「标准调度器 + 6 步」→ 画质明显变差
        reasons.append(f'peft 不可用，LCM-LoRA 无法加载（画质会下降）: {_PEFT_ERR}')

    fatal = [r for r in reasons if r.startswith('模型权重不存在') or '不可用' in r]

    # 内存是否够：单独给出 ready_in_memory 标记，方便前端/调用方提前判断，
    # 不必等到真正请求时才失败（避免用户反复点「生成」都失败还不知原因）
    need_ram = float(_cfg('SD_MIN_FREE_RAM_GB', 4.5) or 4.5)
    free_ram = _free_ram_gb()
    ram_ok = free_ram is None or free_ram >= need_ram

    return {
        "ok": not fatal,
        "backend": "local",
        "model_path": model_path,
        "model_exists": os.path.exists(model_path),
        "lora_path": lora_path,
        "lora_exists": os.path.exists(lora_path),
        "config_dir": config_dir,
        "config_exists": os.path.exists(os.path.join(config_dir, 'model_index.json')),
        "loaded": _PIPE is not None,
        "dtype": (_cfg('SD_DTYPE', 'bf16') or 'bf16'),
        "free_ram_gb": free_ram,
        "need_ram_gb": need_ram,
        "ram_ok": ram_ok,
        "ready": (not fatal) and ram_ok,
        "reasons": reasons,
    }


def status() -> dict:
    """运行期状态（是否已加载、加载耗时等）。"""
    info = available()
    info.update({
        "loaded_at": _LOADED_AT,
        "load_seconds": _LOAD_SECONDS,
        "loaded": _PIPE is not None,
    })
    return info


# ==================== 模型加载 / 卸载 ====================

def _top_ram_hogs(limit=3):
    """列出占用内存最多的可关闭程序，给用户一个具体行动建议。"""
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
    return [f'{name}（{mem:.1f}GB）' for name, mem in top if mem >= 0.2]


def _check_ram_before_load():
    need = float(_cfg('SD_MIN_FREE_RAM_GB', 4.5) or 4.5)
    free = _free_ram_gb()
    if free is not None and free < need:
        msg = (
            f'可用内存不足，拒绝加载本地 SD（需要 ≥{need}GB，当前 {free}GB）。'
        )
        hogs = _top_ram_hogs()
        if hogs:
            msg += '建议先关闭：' + '、'.join(hogs) + '。'
        msg += '或改用云端图像后端。'
        raise RuntimeError(msg)


def _load_pipe():
    """加载（或复用）全局 pipeline。线程安全。"""
    global _PIPE, _LOADED_AT, _LOAD_SECONDS

    if _PIPE is not None:
        return _PIPE

    if _TORCH_ERR or _DIFFUSERS_ERR:
        raise RuntimeError(f'本地 SD 依赖不可用：{_TORCH_ERR or _DIFFUSERS_ERR}')

    model_path = _resolve_model_path()
    if not os.path.exists(model_path):
        raise RuntimeError(f'模型权重不存在：{model_path}')

    _check_ram_before_load()

    dtype, dtype_name = _pick_dtype()
    lora_path = _resolve_lora_path()

    t0 = time.time()
    config_dir = _resolve_config_dir()
    load_kwargs = {
        'torch_dtype': dtype,
        'safety_checker': None,
        'requires_safety_checker': False,
    }
    # 有本地配置就走本地（离线）；没有则退回 diffusers 默认行为（会联网拉 SD1.5 配置）
    if os.path.exists(os.path.join(config_dir, 'model_index.json')):
        load_kwargs['config'] = config_dir
    else:
        print(f'[local-sd] 未找到本地配置目录 {config_dir}，将从网络拉取默认配置')

    pipe = StableDiffusionPipeline.from_single_file(model_path, **load_kwargs)

    # LCM 调度器：4~8 步出图的关键
    use_lora = os.path.exists(lora_path)
    if use_lora:
        try:
            pipe.load_lora_weights(lora_path)
            pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
        except Exception as e:
            # LoRA 加载失败不致命，退化为普通调度器 + 高步数
            print(f'[local-sd] LCM-LoRA 加载失败，退化为标准调度器: {e}')
            use_lora = False

    # 省内存三件套（VAE 相关方法在 0.40 会移除旧名，优先用新 API）
    pipe.enable_attention_slicing('max')
    try:
        pipe.vae.enable_slicing()
        pipe.vae.enable_tiling()
    except Exception:
        try:
            pipe.enable_vae_slicing()
            pipe.enable_vae_tiling()
        except Exception:
            pass
    pipe.set_progress_bar_config(disable=True)
    pipe.to('cpu')

    _PIPE = pipe
    _LOADED_AT = time.strftime('%Y-%m-%d %H:%M:%S')
    _LOAD_SECONDS = round(time.time() - t0, 1)
    print(f'[local-sd] 模型已加载 dtype={dtype_name} lcm_lora={use_lora} 耗时={_LOAD_SECONDS}s '
          f'可用内存={_free_ram_gb()}GB')
    return pipe


def unload() -> bool:
    """释放模型，归还内存。返回是否真的释放了。"""
    global _PIPE, _LOADED_AT, _LOAD_SECONDS
    with _LOCK:
        if _PIPE is None:
            return False
        try:
            _PIPE.to('cpu')
        except Exception:
            pass
        _PIPE = None
        _LOADED_AT = None
        _LOAD_SECONDS = None
        gc.collect()
        if torch is not None:
            try:
                torch.cuda.empty_cache()
            except Exception:
                pass
        print(f'[local-sd] 模型已卸载，可用内存={_free_ram_gb()}GB')
        return True


# ==================== 生成 ====================

def _normalize_size(width: int, height: int):
    """
    SD1.5 在 512×512 上训练，尺寸必须是 8 的倍数。

    CPU 模式下像素总量直接决定耗时与峰值内存，因此：
    1. 先按 SD_MAX_PIXELS（默认 512×512）等比缩放，保住画面比例；
    2. 再按 SD_MAX_SIZE 夹紧单边；
    3. 最后对齐到 8 的倍数。
    """
    import math

    max_size = int(_cfg('SD_MAX_SIZE', 768) or 768)
    max_pixels = int(_cfg('SD_MAX_PIXELS', 512 * 512) or (512 * 512))

    w = max(256, int(width or 512))
    h = max(256, int(height or 512))

    if w * h > max_pixels:
        scale = math.sqrt(max_pixels / float(w * h))
        w = int(w * scale)
        h = int(h * scale)

    w = max(256, min(w, max_size))
    h = max(256, min(h, max_size))
    w = (w // 8) * 8
    h = (h // 8) * 8
    return w, h


def generate(prompt: str, width: int = 512, height: int = 512,
             steps: int = None, guidance: float = None,
             negative_prompt: str = '', seed: int = None) -> dict:
    """
    本地 CPU 出图。返回 {'image': PIL.Image, 'meta': {...}}。

    :raises RuntimeError 依赖缺失 / 内存不足 / 权重缺失
    """
    with _LOCK:
        pipe = _load_pipe()

        has_lora = os.path.exists(_resolve_lora_path())
        default_steps = int(_cfg('SD_STEPS', 6) or 6) if has_lora else 20
        steps = int(steps or default_steps)
        # 无 LoRA 时步数太少会糊，强制不低于 15
        if not has_lora:
            steps = max(steps, 15)
        steps = max(1, min(steps, 40))

        guidance = float(_cfg('SD_GUIDANCE', 1.5) if guidance is None else guidance)
        w, h = _normalize_size(width, height)

        if seed is None or int(seed) < 0:
            seed = int.from_bytes(os.urandom(4), 'big') % (2 ** 31)
        generator = torch.Generator(device='cpu').manual_seed(int(seed))

        t0 = time.time()
        with torch.inference_mode():
            result = pipe(
                prompt=prompt,
                width=w,
                height=h,
                num_inference_steps=steps,
                guidance_scale=guidance,
                negative_prompt=negative_prompt or None,
                generator=generator,
            )
        elapsed = round(time.time() - t0, 2)

        image = result.images[0]
        meta = {
            "backend": "local",
            "engine": "diffusers",
            "model": os.path.basename(_resolve_model_path()),
            "lcm_lora": has_lora,
            "dtype": _pick_dtype()[1],
            "width": w,
            "height": h,
            "steps": steps,
            "guidance": guidance,
            "seed": seed,
            "seconds": elapsed,
        }
        print(f'[local-sd] 出图完成 {w}x{h} steps={steps} 耗时={elapsed}s seed={seed}')
        return {"image": image, "meta": meta}


def generate_to_file(prompt: str, out_path: str, **kwargs) -> dict:
    """出图并落盘为 PNG，返回 meta。"""
    payload = generate(prompt, **kwargs)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    payload["image"].save(out_path, format='PNG')
    return payload["meta"]
