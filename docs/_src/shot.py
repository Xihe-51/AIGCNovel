# -*- coding: utf-8 -*-
"""
用 Chrome DevTools Protocol 截图（本地前端 5173）。
用途：目视检查布局/CSS 问题，不依赖任何第三方浏览器自动化库。

用法：
  python shot.py <token> <out_dir> <name>=<url> [name=url ...]
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
DEBUG_PORT = 9333


def http_json(path, method='GET'):
    req = urllib.request.Request(f'http://127.0.0.1:{DEBUG_PORT}{path}', method=method)
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read().decode('utf-8'))


class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=30)
        self.i = 0

    def send(self, method, params=None):
        self.i += 1
        self.ws.send(json.dumps({'id': self.i, 'method': method, 'params': params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == self.i:
                if 'error' in msg:
                    raise RuntimeError(f'{method}: {msg["error"]}')
                return msg.get('result', {})

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def wait_ready(cdp, timeout=25):
    """等 SPA 渲染 + 接口返回（document.readyState + 额外静置）。"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = cdp.send('Runtime.evaluate', {
                'expression': 'document.readyState',
                'returnByValue': True,
            })
            if r.get('result', {}).get('value') == 'complete':
                time.sleep(3.5)
                return
        except Exception:
            pass
        time.sleep(0.5)


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    token, out_dir = sys.argv[1], sys.argv[2]
    pages = []
    for item in sys.argv[3:]:
        name, url = item.split('=', 1)
        pages.append((name, url))

    os.makedirs(out_dir, exist_ok=True)
    profile = tempfile.mkdtemp(prefix='cdp-shot-')
    proc = subprocess.Popen([
        CHROME,
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-allow-origins=*',
        f'--remote-debugging-port={DEBUG_PORT}',
        f'--user-data-dir={profile}',
        '--window-size=1440,1000',
        'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        for _ in range(60):
            try:
                http_json('/json/version')
                break
            except Exception:
                time.sleep(0.5)

        target = http_json('/json/new?about:blank', method='PUT')
        cdp = CDP(target['webSocketDebuggerUrl'])
        cdp.send('Page.enable')
        cdp.send('Runtime.enable')
        cdp.send('Emulation.setDeviceMetricsOverride', {
            'width': 1440, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False,
        })

        # 先在登录页写入 token（同源 localStorage）
        cdp.send('Page.navigate', {'url': 'http://127.0.0.1:5173/login'})
        wait_ready(cdp, 15)
        cdp.send('Runtime.evaluate', {
            'expression': f'localStorage.setItem("token", {json.dumps(token)}); "ok"',
            'returnByValue': True,
        })

        for name, url in pages:
            cdp.send('Page.navigate', {'url': url})
            wait_ready(cdp, 30)
            # 再等一轮接口渲染
            time.sleep(2)
            shot = cdp.send('Page.captureScreenshot', {
                'format': 'png',
                'captureBeyondViewport': True,
            })
            path = os.path.join(out_dir, f'{name}.png')
            with open(path, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print('saved', path)

        cdp.close()
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    return 0


if __name__ == '__main__':
    sys.exit(main())
