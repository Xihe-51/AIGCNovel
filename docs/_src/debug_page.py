# -*- coding: utf-8 -*-
"""抓取页面运行时错误（用于白屏排查）。"""
import json
import os
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inspect_ui import CDP, http_json, wait_ready  # noqa: E402

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9346
TOKEN = sys.argv[1]
URL = sys.argv[2]

INIT = r"""
window.__errs = [];
window.addEventListener('error', e => window.__errs.push('error: ' + e.message + ' @ ' + (e.filename||'') + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => window.__errs.push('reject: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
"""


def main():
    profile = tempfile.mkdtemp(prefix='cdp-debug-')
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
        for m in ('Page.enable', 'Runtime.enable', 'Log.enable'):
            cdp.send(m)
        cdp.send('Page.addScriptToEvaluateOnNewDocument',
                 {'source': f'localStorage.setItem("token", {json.dumps(TOKEN)});'})
        cdp.send('Page.addScriptToEvaluateOnNewDocument', {'source': INIT})

        cdp.send('Page.navigate', {'url': URL})
        wait_ready(cdp, 30, settle=4)
        print('errs:', cdp.send('Runtime.evaluate', {
            'expression': 'JSON.stringify(window.__errs || [])', 'returnByValue': True
        }).get('result', {}).get('value'))
        print('app html:', cdp.send('Runtime.evaluate', {
            'expression': '(document.querySelector("#app")?.innerHTML || "").slice(0,300)',
            'returnByValue': True
        }).get('result', {}).get('value'))
        print('body text:', cdp.send('Runtime.evaluate', {
            'expression': 'document.body.innerText.slice(0,200)', 'returnByValue': True
        }).get('result', {}).get('value'))
        cdp.ws.close()
    finally:
        try:
            proc.terminate(); proc.wait(timeout=5)
        except Exception:
            proc.kill()
    return 0


if __name__ == '__main__':
    sys.exit(main())
