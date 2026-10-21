# -*- coding=utf-8 -*-
"""
本地 SD 出图前的内存体检工具。

用法（在 back/ 目录下）：
    ./.venv/Scripts/python.exe ../docs/_src/check_memory.py

它会告诉你：
1. 当前可用内存够不够加载本地 SD（阈值来自 .env 的 SD_MIN_FREE_RAM_GB）
2. 哪些进程在吃内存，建议关掉谁
"""
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, _ROOT)
sys.path.insert(0, os.path.join(_ROOT, 'back'))

import psutil


# 建议关闭的进程（按经验，关掉不影响系统）
CAN_CLOSE = {
    'msedge': 'Edge 浏览器',
    'msedgewebview2': 'Edge 后台组件（Teams/Office 等内嵌页面）',
    'QQ': 'QQ',
    'WeChat': '微信',
    'Docker Desktop': 'Docker Desktop',
    'Code': 'VS Code',
    'chrome': 'Chrome 浏览器',
    'llama-server': 'llama.cpp 服务',
    'DeepSeek Harness': 'DeepSeek 客户端',
    'ollama': 'Ollama 服务',
}

# 不建议动
KEEP = {'python', 'Memory Compression', 'MsMpEng', 'explorer',
        'System', 'svchost.exe', 'Registry'}


def _match(name: str):
    """进程名带不带 .exe 都要能匹配上。"""
    if not name:
        return None, None
    base = name[:-4] if name.lower().endswith('.exe') else name
    if base in CAN_CLOSE:
        return 'close', CAN_CLOSE[base]
    if base in KEEP:
        return 'keep', None
    return None, None


def main():
    # 读取阈值（与后端同源，避免两处写死）
    from config import Config
    need = float(getattr(Config, 'SD_MIN_FREE_RAM_GB', 4.5) or 4.5)

    vm = psutil.virtual_memory()
    avail = vm.available / 1024 ** 3
    total = vm.total / 1024 ** 3

    print('=' * 64)
    print('本地 SD 内存体检')
    print('=' * 64)
    print(f'总内存      : {total:.2f} GB')
    print(f'当前可用    : {avail:.2f} GB')
    print(f'加载阈值    : {need:.2f} GB（.env 的 SD_MIN_FREE_RAM_GB）')
    print(f'出图预计消耗: 约 3.8 GB（512×512 / 6 步 / bf16）')

    if avail >= need:
        print(f'\n✅ 内存充足，可以出图。')
        margin = avail - 3.8
        print(f'（出图过程中预计还剩 {margin:.2f} GB）')
        if margin < 0.8:
            print('⚠️  余量偏小，出图时机器可能明显变卡。')
    else:
        gap = need - avail
        print(f'\n❌ 内存不足，还差 {gap:.2f} GB。')
        print('   访问 /ai/generate/image 并指定 model=local 会被拒绝（这是保护，不是 bug）。')

    # 列出大户
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'memory_info']):
        try:
            info = p.info
            mem = info['memory_info'].rss / 1024 ** 3
            if mem > 0.1:
                procs.append((mem, info['name'], info['pid']))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    procs.sort(reverse=True)
    print('\n占用内存较多的进程：')
    print(f'  {"内存":>7}  {"进程":<24} {"建议":<12} PID')
    print('  ' + '-' * 58)

    closable_total = 0.0
    for mem, name, pid in procs[:15]:
        kind, desc = _match(name)
        if kind == 'close':
            action = '可关闭'
            closable_total += mem
        elif kind == 'keep':
            action = '勿动'
        else:
            action = ''
        print(f'  {mem:6.2f}G  {name:<24} {action:<8} {pid}  {desc or ""}')

    print()
    # 同一进程可能有多个实例，这里给出合并后的建议
    merged = {}
    for p in psutil.process_iter(['name', 'memory_info']):
        try:
            kind, desc = _match(p.info['name'])
            if kind == 'close':
                key = desc or p.info['name']
                merged[key] = merged.get(key, 0) + p.info['memory_info'].rss / 1024 ** 3
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    if merged:
        print('按程序合并（关掉整个程序能释放的量）：')
        for name, mem in sorted(merged.items(), key=lambda x: -x[1]):
            if mem >= 0.1:
                print(f'  {mem:5.2f}G  {name}')
        print()
        print(f'💡 全部关掉预计释放约 {closable_total:.2f} GB')
        after = avail + sum(v for v in merged.values())
        if after >= need:
            print(f'   释放后可用约 {after:.2f} GB → 达到出图条件 ✅')
        else:
            print(f'   释放后约 {after:.2f} GB → 可能仍不足（估算偏乐观），建议一并重启机器')
    else:
        print('💡 当前没有明显可关闭的大户，建议重启机器后再试。')

    print('\n提示：出图期间不要同时开太多浏览器标签页。')
    return 0 if avail >= need else 1


if __name__ == '__main__':
    sys.exit(main())
