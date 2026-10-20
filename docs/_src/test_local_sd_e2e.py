# -*- coding=utf-8 -*-
"""
第 3 批：本地 SD 端到端实测（真实权重，CPU）。

量测口径：
- 加载耗时：从调用到 pipeline 就绪
- 出图耗时：纯推理（不含加载）
- 峰值内存：另起线程每 0.2s 采样「已用内存」，取最大值
- 卸载效果：出图后（SD_UNLOAD_AFTER=true）内存是否回落

用法（必须在 back/ 目录下运行，因为图片落盘用的是相对路径）：
    cd back && ./.venv/Scripts/python.exe ../docs/_src/test_local_sd_e2e.py
"""
import os
import sys
import threading
import time
import traceback

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, _ROOT)
sys.path.insert(0, os.path.join(_ROOT, 'back'))

os.chdir(os.path.join(_ROOT, 'back'))   # 关键：图片路径是相对 back/ 的

import psutil

from app import create_app
from app.ai.services import generate_anime_image
from app.ai.backends import image_local

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


class RamSampler:
    """
    后台采样两个口径：
    - peak_rss  : 本进程 RSS 峰值（模型真正吃掉的量，最有用）
    - min_avail : 系统可用内存最低点（判断有没有把机器拖进换页）
    """

    def __init__(self, interval=0.15):
        self.interval = interval
        self.peak_rss = 0
        self.min_avail = None
        self._stop = threading.Event()
        self._t = None
        self._proc = psutil.Process(os.getpid())

    def __enter__(self):
        self.peak_rss = self._proc.memory_info().rss
        self.min_avail = psutil.virtual_memory().available
        self._t = threading.Thread(target=self._run, daemon=True)
        self._t.start()
        return self

    def _run(self):
        while not self._stop.is_set():
            try:
                rss = self._proc.memory_info().rss
                if rss > self.peak_rss:
                    self.peak_rss = rss
            except Exception:
                pass
            avail = psutil.virtual_memory().available
            if avail < self.min_avail:
                self.min_avail = avail
            self._stop.wait(self.interval)

    def __exit__(self, *a):
        self._stop.set()
        if self._t:
            self._t.join(timeout=2)

    @property
    def peak_rss_gb(self):
        return round(self.peak_rss / 1024 ** 3, 2)

    @property
    def min_avail_gb(self):
        return round(self.min_avail / 1024 ** 3, 2)


def gb(n):
    return round(n / 1024 ** 3, 2)


def main():
    app = create_app('default')
    ctx = app.app_context()
    ctx.push()

    print('=' * 72)
    print('第 3 批 本地 SD 端到端实测（CPU）')
    print('=' * 72)
    print(f"SD_DTYPE={app.config.get('SD_DTYPE')}  SD_STEPS={app.config.get('SD_STEPS')}  "
          f"SD_GUIDANCE={app.config.get('SD_GUIDANCE')}  "
          f"SD_MAX_PIXELS={app.config.get('SD_MAX_PIXELS')}  "
          f"SD_UNLOAD_AFTER={app.config.get('SD_UNLOAD_AFTER')}")

    print(f"\n出图前可用内存: {image_local._free_ram_gb()}GB")

    # ---------- ① 本地 SD 可用性 ----------
    def t_available():
        st = image_local.available()
        assert st['ok'], f"不可用: {st.get('reasons')}"
        assert st['model_exists'] and st['lora_exists'], '权重或 LoRA 缺失'
        return f"model={os.path.basename(st['model_path'])} lora={st['lora_exists']}"

    check('本地 SD 依赖与权重齐备', t_available)

    # ---------- ② 真实出图 ----------
    result = {}

    def t_generate():
        before = psutil.virtual_memory().used
        t0 = time.time()
        with RamSampler(interval=0.15) as sampler:
            ok, info = generate_anime_image(
                user_id=4,
                prompt='1girl, silver hair, blue eyes, school uniform, '
                       'seaside town, sunset, cinematic lighting, masterpiece, best quality',
                model_id='local',
                width=768,
                height=768,
            )
        total = round(time.time() - t0, 2)
        after = psutil.virtual_memory().used

        assert ok, f"生成失败: {info.get('message')}"
        # LCM-LoRA 是「6 步能出图」的前提，没加载成功画质会明显崩坏，必须硬断言
        assert info.get('lcm_lora') is True, (
            f"LCM-LoRA 未加载（会退化成标准调度器 + 6 步，画质崩坏）: {info.get('message')}")
        fpath = info.get('file')
        assert fpath and os.path.exists(fpath), f'文件未落盘: {fpath}'

        size = os.path.getsize(fpath)
        assert size > 10 * 1024, f'文件过小，疑似空图: {size} bytes'

        # 非纯色校验
        from PIL import Image
        img = Image.open(fpath).convert('RGB')
        extrema = img.getextrema()
        flat = all(lo == hi for lo, hi in extrema)
        assert not flat, f'纯色图，推理异常: {extrema}'

        result.update({
            'info': info, 'file': fpath, 'size': size, 'total': total,
            'peak_rss_gb': sampler.peak_rss_gb,
            'min_avail_gb': sampler.min_avail_gb,
            'before_gb': gb(before), 'after_gb': gb(after),
            'img_size': img.size,
        })
        return (f"{img.size[0]}x{img.size[1]} 总耗时={total}s "
                f"推理={info.get('seconds')}s steps={info.get('steps')} "
                f"lcm_lora={info.get('lcm_lora')} seed={info.get('seed')} "
                f"进程RSS峰值={sampler.peak_rss_gb}GB 可用内存最低={sampler.min_avail_gb}GB "
                f"文件={size // 1024}KB")

    check('本地 CPU 出图（真实权重）', t_generate)

    # ---------- ③ 出图后是否已卸载 ----------
    def t_unloaded():
        st = image_local.status()
        assert st['loaded'] is False, f"SD_UNLOAD_AFTER=true 但模型仍常驻: {st['loaded']}"
        return f"loaded=False 可用内存={image_local._free_ram_gb()}GB"

    check('出图后模型已卸载（内存归还）', t_unloaded)

    # ---------- ④ 第二轮：验证可重复加载（不残留状态） ----------
    def t_second_round():
        ok, info = generate_anime_image(
            user_id=4,
            prompt='1girl, white dress, flower field, sunny day, masterpiece, best quality',
            model_id='local',
            width=512,
            height=512,
        )
        assert ok, f"第二轮失败: {info.get('message')}"
        assert os.path.exists(info.get('file')), '第二轮文件未落盘'
        return f"512x512 推理={info.get('seconds')}s seed={info.get('seed')}"

    check('第二轮出图（重新加载 + 不同尺寸）', t_second_round)

    # ---------- 汇总 ----------
    print('\n' + '=' * 72)
    if result:
        print('实测数据汇总')
        print(f"  图片尺寸        : {result['img_size'][0]}x{result['img_size'][1]}")
        print(f"  总耗时          : {result['total']}s（含模型加载）")
        print(f"  纯推理耗时      : {result['info'].get('seconds')}s")
        print(f"  采样步数        : {result['info'].get('steps')}（LCM-LoRA={result['info'].get('lcm_lora')}）")
        print(f"  精度            : {result['info'].get('dtype')}")
        print(f"  进程 RSS 峰值   : {result['peak_rss_gb']}GB")
        print(f"  可用内存最低点  : {result['min_avail_gb']}GB")
        print(f"  出图前/后已用   : {result['before_gb']}GB / {result['after_gb']}GB")
        print(f"  输出文件        : {result['file']}")
    print(f'\n通过 {len(PASS)} | 失败 {len(FAIL)}')

    ctx.pop()
    if FAIL:
        for n, e in FAIL:
            print(f'  FAILED: {n} -> {type(e).__name__}: {e}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
