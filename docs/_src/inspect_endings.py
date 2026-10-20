# -*- coding: utf-8 -*-
"""结局实测：条件达成弹结局页 + 解锁记录 + 条件不达成不触发 + 编辑器状态。"""
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
PORT = 9345
TOKEN = sys.argv[1]
PID = int(sys.argv[2])
ENDING_ID = int(sys.argv[3])
H = {'Authorization': f'Bearer {TOKEN}', 'X-User-Id': '1'}


def ev(cdp, js):
    r = cdp.send('Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True})
    return r.get('result', {}).get('value')


def api(method, path, **kw):
    s = requests.Session()
    s.trust_env = False
    r = s.request(method, f'http://127.0.0.1:8088{path}', headers=H, timeout=10, **kw)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text


def click_text(cdp, text, selector='button,.el-button,.el-tabs__item'):
    return ev(cdp, f"""
(() => {{
  const els = [...document.querySelectorAll({json.dumps(selector)})];
  const el = els.find(e => (e.innerText || '').trim().includes({json.dumps(text)}));
  if (!el) return 'NOT_FOUND';
  el.click(); return 'CLICKED';
}})()
""")


def main():
    profile = tempfile.mkdtemp(prefix='cdp-ending-')
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

        print('== 1. 条件成立：触发结局 ==')
        cdp.send('Page.navigate', {'url': f'http://127.0.0.1:5175/view/{PID}'})
        wait_ready(cdp, 30, settle=3)
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(1.2)
        print('调试:', ev(cdp, "JSON.stringify(window.__aigcPlayerDebug ? window.__aigcPlayerDebug() : 'NO_DEBUG')"))
        print('页面文本:', ev(cdp, "document.body.innerText.slice(0,120)"))
        print(json.dumps(ev(cdp, r"""
(() => ({
  visible: !!document.querySelector('.ending-dialog'),
  title: document.querySelector('.ending-content h2')?.innerText || '',
  desc: document.querySelector('.ending-content p')?.innerText || ''
}))()
"""), ensure_ascii=False))
        st, data = api('GET', f'/project/endings/{PID}')
        print('API 结局:', json.dumps(data.get('data'), ensure_ascii=False))

        print('== 2. 编辑器结局 tab 状态 ==')
        cdp.send('Page.navigate', {'url': f'http://127.0.0.1:5175/project/{PID}'})
        wait_ready(cdp, 30, settle=3)
        click_text(cdp, '结局')
        time.sleep(1.2)
        print(json.dumps(ev(cdp, r"""
(() => ({
  rows: [...document.querySelectorAll('.variables-table .el-table__row')]
    .map(r => (r.innerText || '').replace(/\s+/g, ' ').trim())
}))()
"""), ensure_ascii=False))

        print('== 3. 条件改成 >=50：不再触发 ==')
        api('PUT', f'/project/endings/{PID}/{ENDING_ID}',
            json={'conditions': [{'variable': 'affection_lin', 'op': '>=', 'value': 50}]})
        cdp.send('Page.navigate', {'url': f'http://127.0.0.1:5175/view/{PID}'})
        wait_ready(cdp, 30, settle=3)
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(1.2)
        print(json.dumps(ev(cdp, r"""
(() => ({
  visible: !!document.querySelector('.ending-dialog'),
  text: (document.querySelector('.dialogue-text')?.innerText || '').trim()
}))()
"""), ensure_ascii=False))

        # 还原条件
        api('PUT', f'/project/endings/{PID}/{ENDING_ID}',
            json={'conditions': [{'variable': 'affection_lin', 'op': '>=', 'value': 5}]})

        cdp.ws.close()
    finally:
        try:
            proc.terminate(); proc.wait(timeout=5)
        except Exception:
            proc.kill()
    return 0


if __name__ == '__main__':
    sys.exit(main())
