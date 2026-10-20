# -*- coding: utf-8 -*-
"""变量系统实测：状态面板、节点数值变化、存档带回变量。"""
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
PORT = 9342
TOKEN = sys.argv[1]
PID = sys.argv[2] if len(sys.argv) > 2 else '7'
H = {'Authorization': f'Bearer {TOKEN}', 'X-User-Id': '1'}


def ev(cdp, js):
    r = cdp.send('Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True})
    return r.get('result', {}).get('value')


def api(method, path, **kw):
    s = requests.Session()
    s.trust_env = False
    r = s.request(method, f'http://127.0.0.1:8088{path}', headers=H, timeout=10, **kw)
    return r.status_code, r.json()


def main():
    # 清空存档/已读，保证从初始值开始
    api('DELETE', f'/project/saves/{PID}/1')
    api('DELETE', f'/project/saves/{PID}/0')
    api('DELETE', f'/project/reads/{PID}')

    profile = tempfile.mkdtemp(prefix='cdp-vars-')
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
        wait_ready(cdp, 30, settle=3)

        print('== 1. 状态入口与数值 ==')
        print('状态按钮:', ev(cdp, "!!document.querySelector('.player-status-btn')"))
        ev(cdp, "document.querySelector('.player-status-btn')?.click(); 'x'")
        time.sleep(0.6)
        print(json.dumps(ev(cdp, r"""
(() => ({
  visible: !!document.querySelector('.status-dialog'),
  rows: [...document.querySelectorAll('.status-row')].map(r => (r.innerText || '').replace(/\s+/g, ' ').trim())
}))()
"""), ensure_ascii=False, indent=1))

        print('== 2. 保存到存档 1（应带 variables） ==')
        ev(cdp, "document.querySelector('.el-dialog__headerbtn')?.click(); 'x'")
        time.sleep(0.3)
        ev(cdp, "document.querySelectorAll('.function-buttons .func-btn')[5]?.click(); 'x'")
        time.sleep(0.7)
        print('保存:', ev(cdp, r"""
(() => {
  const row = [...document.querySelectorAll('.save-slot')].find(r => (r.innerText || '').includes('存档 1'));
  const btn = row?.querySelectorAll('button')[0];
  if (!btn) return 'NO_BTN';
  btn.click(); return 'CLICKED';
})()
"""))
        time.sleep(1.0)
        st, data = api('GET', f'/project/saves/{PID}/1')
        print('存档 state.variables:', json.dumps((data.get('data') or {}).get('state', {}).get('variables'), ensure_ascii=False))

        print('== 3. 推进后读取存档，变量应恢复 ==')
        ev(cdp, "document.querySelector('.el-dialog__headerbtn')?.click(); 'x'")
        time.sleep(0.4)
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(0.3)
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(0.8)
        ev(cdp, "document.querySelectorAll('.function-buttons .func-btn')[5]?.click(); 'x'")
        time.sleep(0.7)
        ev(cdp, r"""
(() => {
  const row = [...document.querySelectorAll('.save-slot')].find(r => (r.innerText || '').includes('存档 1'));
  row?.querySelectorAll('button')[1]?.click();
  return 'LOAD';
})()
""")
        time.sleep(1.0)
        ev(cdp, "document.querySelector('.player-status-btn')?.click(); 'x'")
        time.sleep(0.5)
        print(json.dumps(ev(cdp, r"""
(() => ({
  rows: [...document.querySelectorAll('.status-row')].map(r => (r.innerText || '').replace(/\s+/g, ' ').trim())
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
