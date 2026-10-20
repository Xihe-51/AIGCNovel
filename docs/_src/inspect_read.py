# -*- coding: utf-8 -*-
"""跳过已读 + 完整回想实测。"""
import json
import os
import subprocess
import sys
import tempfile
import time

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inspect_ui import CDP, http_json, wait_ready  # noqa: E402

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9340
TOKEN = sys.argv[1]
PID = sys.argv[2] if len(sys.argv) > 2 else '7'
H = {'Authorization': f'Bearer {TOKEN}', 'X-User-Id': '1'}


def ev(cdp, js):
    r = cdp.send('Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True})
    return r.get('result', {}).get('value')


def api_reads():
    s = requests.Session()
    s.trust_env = False
    r = s.get(f'http://127.0.0.1:8088/project/reads/{PID}', headers=H, timeout=10)
    return r.json().get('data')


def main():
    # 清空已读
    s = requests.Session()
    s.trust_env = False
    s.delete(f'http://127.0.0.1:8088/project/reads/{PID}', headers=H, timeout=10)

    profile = tempfile.mkdtemp(prefix='cdp-read-')
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
        cdp.send('Page.addScriptToEvaluateOnNewDocument', {'source':
                 'if (!localStorage.getItem("aigc:player:settings")) '
                 'localStorage.setItem("aigc:player:settings", JSON.stringify('
                 '{textSpeed:0,autoDelay:3,bgmVolume:60,voiceVolume:80,fullscreen:false,skipRead:false}));'})

        cdp.send('Page.navigate', {'url': f'http://127.0.0.1:5175/view/{PID}'})
        wait_ready(cdp, 30, settle=2.5)
        first_text = ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').trim()")
        print('== 1. 首次显示并标记已读 ==')
        print('首句:', first_text[:30])
        time.sleep(2.2)
        print('API 已读:', json.dumps(api_reads(), ensure_ascii=False))

        print('== 2. 开启跳过已读并刷新 ==')
        ev(cdp, r"""
(() => {
  const s = JSON.parse(localStorage.getItem('aigc:player:settings') || '{}');
  s.skipRead = true; s.textSpeed = 0;
  localStorage.setItem('aigc:player:settings', JSON.stringify(s));
  return 'ok';
})()
""")
        cdp.send('Page.reload')
        wait_ready(cdp, 30, settle=3)
        second_text = ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').trim()")
        print('设置:', ev(cdp, "localStorage.getItem('aigc:player:settings')"))
        print('调试:', ev(cdp, "JSON.stringify(window.__aigcPlayerDebug ? window.__aigcPlayerDebug() : 'NO_DEBUG')"))
        print(json.dumps({'afterSkip': second_text[:40], 'skipped': second_text != first_text},
                         ensure_ascii=False))

        print('== 3. 完整回想（跨场景） ==')
        # 打开回想
        print('打开回想:', ev(cdp, r"""
(() => {
  const btn = document.querySelectorAll('.function-buttons .func-btn')[0];
  if (!btn) return 'NO_BUTTON';
  btn.click(); return 'CLICKED';
})()
"""))
        time.sleep(0.8)
        print(json.dumps(ev(cdp, r"""
(() => ({
  visible: !!document.querySelector('.history-dialogue-content'),
  count: document.querySelectorAll('.history-item').length,
  scenes: [...document.querySelectorAll('.history-scene')].map(e => e.innerText.trim())
}))()
"""), ensure_ascii=False))

        # 关回想 -> 快进到下一场景 -> 推进一句 -> 再看回想
        ev(cdp, "document.querySelector('.history-header .close-btn')?.click(); 'x'")
        time.sleep(0.4)
        ev(cdp, "document.querySelectorAll('.function-buttons .func-btn')[2]?.click(); 'x'")
        time.sleep(1.0)
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(0.4)
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(1.0)
        ev(cdp, "document.querySelectorAll('.function-buttons .func-btn')[0]?.click(); 'x'")
        time.sleep(0.8)
        print(json.dumps(ev(cdp, r"""
(() => ({
  count: document.querySelectorAll('.history-item').length,
  scenes: [...new Set([...document.querySelectorAll('.history-scene')].map(e => e.innerText.trim()))]
}))()
"""), ensure_ascii=False))

        cdp.ws.close()
    finally:
        try:
            proc.terminate(); proc.wait(timeout=5)
        except Exception:
            proc.kill()
    return 0


if __name__ == '__main__':
    sys.exit(main())
