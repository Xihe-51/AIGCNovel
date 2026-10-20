# -*- coding: utf-8 -*-
"""播放器分支实测：打开 /view/<pid>，点第一个分支选项，检查是否跳到目标节点。"""
import json
import os
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inspect_ui import CDP, http_json, wait_ready  # noqa: E402

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9337
PID = sys.argv[1]
TOKEN = sys.argv[2]


def ev(cdp, js):
    r = cdp.send('Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True})
    return r.get('result', {}).get('value')


def main():
    profile = tempfile.mkdtemp(prefix='cdp-player-')
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

        cdp.send('Page.navigate', {'url': f'http://127.0.0.1:5175/view/{PID}'})
        wait_ready(cdp, 30, settle=4)

        print('== 初始状态 ==')
        print(json.dumps(ev(cdp, r"""
(() => ({
  text: (document.querySelector('.dialogue-text')?.innerText || '').trim(),
  choices: [...document.querySelectorAll('.choice-option')].map(b => (b.innerText || '').trim()),
  choicePanel: !!document.querySelector('.choice-panel')
}))()
"""), ensure_ascii=False, indent=1))

        print('== 点击第一个选项 ==')
        print(ev(cdp, r"""
(() => {
  const btn = document.querySelector('.choice-option');
  if (!btn) return 'NO_BUTTON';
  btn.click(); return 'CLICKED:' + (btn.innerText || '').trim();
})()
"""))
        time.sleep(1.2)

        print('== 跳转后 ==')
        print(json.dumps(ev(cdp, r"""
(() => ({
  text: (document.querySelector('.dialogue-text')?.innerText || '').trim(),
  choices: [...document.querySelectorAll('.choice-option')].map(b => (b.innerText || '').trim()),
  choicePanel: !!document.querySelector('.choice-panel')
}))()
"""), ensure_ascii=False, indent=1))

        cdp.ws.close()
    finally:
        try:
            proc.terminate(); proc.wait(timeout=5)
        except Exception:
            proc.kill()
    return 0


if __name__ == '__main__':
    sys.exit(main())
