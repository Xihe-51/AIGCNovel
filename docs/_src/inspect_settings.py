# -*- coding: utf-8 -*-
"""阅读器设置实测：逐字显示 / 点击补全 / 设置弹窗 / localStorage 持久化。"""
import json
import os
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inspect_ui import CDP, http_json, wait_ready  # noqa: E402

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9338
TOKEN = sys.argv[1]
PID = sys.argv[2] if len(sys.argv) > 2 else '7'


def ev(cdp, js):
    r = cdp.send('Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True})
    return r.get('result', {}).get('value')


def main():
    profile = tempfile.mkdtemp(prefix='cdp-settings-')
    proc = subprocess.Popen([
        CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
        f'--remote-debugging-port={PORT}', f'--user-data-dir={profile}',
        '--window-size=1440,1000', 'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                http_json('/json/version', port=PORT)
                break
            except Exception:
                time.sleep(0.5)
        target = http_json('/json/new?about:blank', method='PUT', port=PORT)
        cdp = CDP(target['webSocketDebuggerUrl'])
        cdp.send('Page.enable')
        cdp.send('Runtime.enable')
        cdp.send('Emulation.setDeviceMetricsOverride', {
            'width': 1440, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
        cdp.send('Page.addScriptToEvaluateOnNewDocument',
                 {'source': f'localStorage.setItem("token", {json.dumps(TOKEN)});'})
        # 固定为「慢」速度，保证点击补全测试有足够长的打字过程
        cdp.send('Page.addScriptToEvaluateOnNewDocument', {'source':
                 'localStorage.setItem("aigc:player:settings", JSON.stringify('
                 '{textSpeed:3,autoDelay:3,bgmVolume:60,voiceVolume:80,fullscreen:false}));'})

        cdp.send('Page.navigate', {'url': f'http://127.0.0.1:5175/view/{PID}'})
        wait_ready(cdp, 30, settle=2.5)

        print('== 1. 逐字显示 ==')
        print('BGM 音量:', ev(cdp, "document.querySelector('audio')?.volume"))
        t1 = ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').length")
        time.sleep(0.35)
        t2 = ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').length")
        print(json.dumps({'t0': t1, 't+0.35s': t2, 'typing': t2 > t1}, ensure_ascii=False))

        print('== 2. 点击补全 ==')
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'clicked'")
        time.sleep(0.25)
        t3 = ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').length")
        time.sleep(0.4)
        t4 = ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').length")
        print(json.dumps({'afterClick': t3, 'later': t4,
                          'completed': t3 == t4 and t3 > t2}, ensure_ascii=False))

        print('== 3. 设置弹窗 ==')
        print('打开设置:', ev(cdp, r"""
(() => {
  const btn = document.querySelector('.player-settings-btn');
  if (!btn) return 'NO_BUTTON';
  btn.click(); return 'CLICKED';
})()
"""))
        time.sleep(0.8)
        print(json.dumps(ev(cdp, r"""
(() => {
  const dlg = [...document.querySelectorAll('.el-dialog')].find(d => d.offsetParent !== null);
  return {
    visible: !!dlg,
    title: dlg?.querySelector('.el-dialog__title')?.innerText || '',
    rows: [...(dlg?.querySelectorAll('.setting-row') || [])].map(r => (r.innerText || '').replace(/\s+/g, ' ').trim()),
    sliders: dlg?.querySelectorAll('.el-slider').length || 0,
    switches: dlg?.querySelectorAll('.el-switch').length || 0
  };
})()
"""), ensure_ascii=False, indent=1))

        print('== 4. 改文字速度为「瞬间显示」 ==')
        print('点下拉:', ev(cdp, r"""
(() => {
  const dlg = [...document.querySelectorAll('.el-dialog')].find(d => d.offsetParent !== null);
  const sel = dlg?.querySelector('.el-select__wrapper') || dlg?.querySelector('.el-select');
  if (!sel) return 'NO_SELECT';
  sel.click(); return 'CLICKED';
})()
"""))
        time.sleep(0.6)
        print('选选项:', ev(cdp, r"""
(() => {
  const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null);
  const item = items.find(e => (e.innerText || '').includes('瞬间显示'));
  if (!item) return 'NO_OPTION';
  item.click(); return 'CLICKED';
})()
"""))
        time.sleep(0.8)
        print('localStorage:', ev(cdp, "localStorage.getItem('aigc:player:settings')"))

        print('== 5. 恢复默认 ==')
        print('点恢复默认:', ev(cdp, r"""
(() => {
  const btn = [...document.querySelectorAll('.el-dialog button')].find(b => (b.innerText || '').includes('恢复默认'));
  if (!btn) return 'NO_BUTTON';
  btn.click(); return 'CLICKED';
})()
"""))
        time.sleep(0.6)
        print('localStorage:', ev(cdp, "localStorage.getItem('aigc:player:settings')"))

        cdp.ws.close()
    finally:
        try:
            proc.terminate(); proc.wait(timeout=5)
        except Exception:
            proc.kill()
    return 0


if __name__ == '__main__':
    sys.exit(main())
