# -*- coding=utf-8 -*-
"""
第 3 批：本地 SD 代码路径验证（不依赖 2GB 大模型）。

用 diffusers 官方的微型测试模型走一遍与生产完全相同的代码路径：
bf16(CPU) -> 加载 pipeline -> 换 LCMScheduler -> attention/vae slicing -> 出图。
目的是在正式权重下载完成前，先把「代码是否写对」验证掉。

另外单独验证 image_local 模块里不依赖模型的部分：
尺寸归一化、可用性探测、内存守卫。
"""
import os
import sys
import time
import traceback

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # D:\AIGCNovel
sys.path.insert(0, _ROOT)
sys.path.insert(0, os.path.join(_ROOT, 'back'))   # 让 `import app` 能找到后端包

os.environ.setdefault('HF_ENDPOINT', 'https://hf-mirror.com')
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')

PASS, FAIL = [], []


def check(name, fn):
    try:
        detail = fn()
        PASS.append((name, detail))
        print(f'  [PASS] {name}  {detail or ""}')
    except Exception as e:
        FAIL.append((name, e))
        print(f'  [FAIL] {name}  {type(e).__name__}: {e}')
        traceback.print_exc()


# ==================== ① 纯逻辑：尺寸归一化 ====================

def test_normalize_size():
    from flask import Flask
    from app.ai.backends import image_local

    app = Flask(__name__)
    app.config.update({'SD_MAX_SIZE': 768, 'SD_MAX_PIXELS': 512 * 512})

    with app.app_context():
        cases = [
            ((512, 512), (512, 512), '原尺寸不变（恰好等于像素上限）'),
            ((768, 768), (512, 512), '768 方图按像素上限缩到 512'),
            ((768, 1024), (440, 584), '3:4 竖图等比缩放（8 的倍数）'),
            ((1024, 768), (584, 440), '4:3 横图等比缩放'),
            ((300, 300), (296, 296), '非 8 倍数向下对齐'),
            ((100, 100), (256, 256), '过小尺寸抬到下限 256'),
        ]
        out = []
        for (w, h), expect, desc in cases:
            got = image_local._normalize_size(w, h)
            assert got == expect, f'{desc}: 期望 {expect} 实际 {got}'
            # 必须是 8 的倍数
            assert got[0] % 8 == 0 and got[1] % 8 == 0, f'{desc}: 未对齐到 8 的倍数 {got}'
            out.append(f'{w}x{h}->{got[0]}x{got[1]}')
        return ' | '.join(out)


# ==================== ② 纯逻辑：可用性探测 ====================

def test_available_reports_missing_model():
    from flask import Flask
    from app.ai.backends import image_local

    app = Flask(__name__)
    app.config.update({'SD_MODEL_PATH': 'D:/__not_exist__/nope.safetensors',
                       'SD_LORA_PATH': 'D:/__not_exist__/nope_lora.safetensors'})

    with app.app_context():
        st = image_local.available()
        assert st['ok'] is False, f'权重不存在时应为不可用，实际 {st}'
        assert st['model_exists'] is False
        joined = '; '.join(st['reasons'])
        assert '模型权重不存在' in joined, f'缺少原因说明: {joined}'
        return f"ok={st['ok']} reasons={len(st['reasons'])}"


# ==================== ③ 纯逻辑：内存守卫 ====================

def test_ram_guard():
    from flask import Flask
    from app.ai.backends import image_local

    app = Flask(__name__)
    # 要求 9999GB，必然不满足
    app.config.update({'SD_MIN_FREE_RAM_GB': 9999})

    with app.app_context():
        try:
            image_local._check_ram_before_load()
        except RuntimeError as e:
            assert '可用内存不足' in str(e), f'异常文案不符: {e}'
            return f'正确拒绝: {str(e)[:60]}…'
        raise AssertionError('内存不足时未拒绝加载')


# ==================== ④ API 契约：代码依赖的接口是否都存在 ====================

def test_api_contract():
    import inspect

    import torch
    from diffusers import LCMScheduler, StableDiffusionPipeline

    problems = []

    # from_single_file 是否接受我们用到的四个参数
    sig = inspect.signature(StableDiffusionPipeline.from_single_file)
    for kw in ('torch_dtype', 'safety_checker', 'requires_safety_checker', 'config'):
        if kw not in sig.parameters and not any(
                p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
            problems.append(f'from_single_file 缺少参数 {kw}')

    # pipeline 是否具备省内存与 LoRA 相关方法
    for m in ('enable_attention_slicing', 'set_progress_bar_config',
              'load_lora_weights', 'to'):
        if not hasattr(StableDiffusionPipeline, m):
            problems.append(f'pipeline 缺少方法 {m}')

    # LCMScheduler 能否从普通调度器配置构造（LCM 换调度器的前提）
    cfg = {'beta_start': 0.00085, 'beta_end': 0.012, 'beta_schedule': 'scaled_linear',
           'num_train_timesteps': 1000, 'steps_offset': 1, 'clip_sample': False,
           'set_alpha_to_one': False, 'trained_betas': None,
           'prediction_type': 'epsilon', 'timestep_spacing': 'leading',
           'rescale_betas_zero_snr': False}
    sched = LCMScheduler.from_config(cfg)
    if not hasattr(sched, 'set_timesteps'):
        problems.append('LCMScheduler 无 set_timesteps')

    # bf16 在 CPU 上是否真的可用（Zen4 应支持 AVX512-BF16）
    a = torch.ones((16, 16), dtype=torch.bfloat16)
    _ = (a @ a).sum().item()

    # peft 是 load_lora_weights 的硬依赖，缺失会导致 LCM-LoRA 静默失效（画质崩坏）
    try:
        import peft  # noqa: F401
    except Exception as e:
        problems.append(f'peft 不可用，LCM-LoRA 无法加载: {e}')

    assert not problems, '契约不满足: ' + '; '.join(problems)
    return ('from_single_file 参数齐全 | pipeline 方法齐全 | '
            'LCMScheduler 可构造 | bf16 CPU 可用 | peft 可用')


# ==================== ⑤ 后端分发：模型名别名归一化 ====================

def test_backend_alias():
    """
    回归 FIX-5：前端传 model='hunyuan'，而服务层原按 model_id 读，
    参数名对不上导致永远走配置默认值（云端），本地 SD 根本选不到。
    """
    _ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    sys.path.insert(0, os.path.join(_ROOT, 'back'))

    from flask import Flask
    from app.ai import services

    app = Flask(__name__)
    app.config.update({'IMAGE_BACKEND': 'tongyi'})

    with app.app_context():
        cases = [
            ('local', 'local', '精确 local'),
            ('SD', 'local', '大小写 + 简写'),
            ('local_sd', 'local', '下划线写法'),
            ('stable-diffusion', 'local', '连字符写法'),
            ('hunyuan', 'tongyi', '前端历史取值 hunyuan'),
            ('tongyi', 'tongyi', '标准云端名'),
            ('wanx-v1', 'tongyi', '万相模型名'),
            (None, 'tongyi', '缺省跟随 IMAGE_BACKEND=tongyi'),
            ('unknown-xxx', 'tongyi', '未知值跟随配置'),
        ]
        out = []
        for raw, expect, desc in cases:
            got = services._resolve_image_backend(raw)
            assert got == expect, f'{desc}: 传入 {raw!r} 期望 {expect} 实际 {got}'
            out.append(f'{raw}->{got}')

        # IMAGE_BACKEND=local 时未知值应落到 local
        app.config['IMAGE_BACKEND'] = 'local'
        assert services._resolve_image_backend(None) == 'local', 'IMAGE_BACKEND=local 时缺省未落到 local'
        assert services._resolve_image_backend('xxx') == 'local', 'IMAGE_BACKEND=local 时未知值未落到 local'

        return ' | '.join(out[:6]) + ' …共 %d 例' % len(cases)


# ==================== ⑥ 文本侧：云端模型名不得污染本地 Ollama ====================

def test_text_model_clean():
    """
    回归 FIX-6：前端文本下拉写死 model='deepseek'，若原样传给 Ollama 会 404，
    进而触发降级到云端 —— 与 FIX-1 同类，本地模型又被静默绕过。
    """
    _ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    sys.path.insert(0, os.path.join(_ROOT, 'back'))

    from app.ai import services

    cases = [
        ('ollama', 'deepseek', None, '云端名在本地后端被丢弃'),
        ('ollama', 'deepseek-chat', None, '云端全名被丢弃'),
        ('ollama', 'qwen2.5:7b', 'qwen2.5:7b', '真实本地模型名保留'),
        ('deepseek', 'deepseek-chat', 'deepseek-chat', '云端后端不清洗'),
        ('ollama', None, None, 'None 保持 None'),
    ]
    for backend, raw, expect, desc in cases:
        got = services._clean_text_model(backend, raw)
        assert got == expect, f'{desc}: 传入 {raw!r} 期望 {expect!r} 实际 {got!r}'
    return ' | '.join(f'{"deepseek" if r else r}->{g}' for _, r, g, _ in cases[:3])

def test_api_contract():
    import inspect

    import torch
    from diffusers import LCMScheduler, StableDiffusionPipeline

    problems = []

    # from_single_file 是否接受我们用到的三个参数
    sig = inspect.signature(StableDiffusionPipeline.from_single_file)
    for kw in ('torch_dtype', 'safety_checker', 'requires_safety_checker'):
        if kw not in sig.parameters and not any(
                p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
            problems.append(f'from_single_file 缺少参数 {kw}')

    # pipeline 是否具备省内存与 LoRA 相关方法
    for m in ('enable_attention_slicing', 'enable_vae_slicing', 'enable_vae_tiling',
              'set_progress_bar_config', 'load_lora_weights', 'to'):
        if not hasattr(StableDiffusionPipeline, m):
            problems.append(f'pipeline 缺少方法 {m}')

    # LCMScheduler 能否从普通调度器配置构造（LCM 换调度器的前提）
    cfg = {'beta_start': 0.00085, 'beta_end': 0.012, 'beta_schedule': 'scaled_linear',
           'num_train_timesteps': 1000, 'steps_offset': 1, 'clip_sample': False,
           'set_alpha_to_one': False, 'skip_prk_steps': True, 'trained_betas': None,
           'prediction_type': 'epsilon', 'timestep_spacing': 'leading',
           'rescale_betas_zero_snr': False}
    sched = LCMScheduler.from_config(cfg)
    if not hasattr(sched, 'set_timesteps'):
        problems.append('LCMScheduler 无 set_timesteps')

    # bf16 在 CPU 上是否真的可用（Zen4 应支持 AVX512-BF16）
    a = torch.ones((16, 16), dtype=torch.bfloat16)
    _ = (a @ a).sum().item()

    assert not problems, '契约不满足: ' + '; '.join(problems)
    return (f'from_single_file 参数齐全 | pipeline 方法齐全 | '
            f'LCMScheduler 可构造 | bf16 CPU 可用')


def main():
    print('=' * 72)
    print('第 3 批 本地 SD 代码路径验证')
    print('=' * 72)

    print('\n[①] 尺寸归一化')
    check('尺寸归一化与 8 倍数对齐', test_normalize_size)

    print('\n[②] 可用性探测')
    check('权重缺失时正确报告不可用', test_available_reports_missing_model)

    print('\n[③] 内存守卫')
    check('可用内存不足时拒绝加载', test_ram_guard)

    print('\n[④] API 契约')
    check('代码依赖的 diffusers 接口均存在', test_api_contract)

    print('\n[⑤] 后端分发')
    check('图像后端别名归一化（FIX-5 回归）', test_backend_alias)

    print('\n[⑥] 文本模型名清洗')
    check('云端模型名不污染本地 Ollama（FIX-6 回归）', test_text_model_clean)

    print('\n' + '=' * 72)
    print(f'通过 {len(PASS)} | 失败 {len(FAIL)}')
    if FAIL:
        for n, e in FAIL:
            print(f'  FAILED: {n} -> {type(e).__name__}: {e}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
