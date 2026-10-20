# -*- coding: utf-8 -*-
"""弹窗布局体检：对话框是否超出视口、内容是否被裁切、底部按钮是否可见。"""
import json
import os
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inspect_ui import CDP, http_json, wait_ready  # noqa: E402

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9336
TOKEN = sys.argv[1]

CASES = [
    ('home', 'http://127.0.0.1:5175/home', '新建项目'),
    ('store', 'http://127.0.0.1:5175/store', '上传素材'),
    ('individual', 'http://127.0.0.1:5175/individual', '新建模型'),
]

MEASURE = r"""
(() => {
  const dlg = document.querySelector('.el-dialog');
  if (!dlg) return {found: false};
  const r = dlg.getBoundingClientRect();
  const body = dlg.querySelector('.el-dialog__body');
  const footer = dlg.querySelector('.el-dialog__footer');
  const br = body ? body.getBoundingClientRect() : null;
  const fr = footer ? footer.getBoundingClientRect() : null;
  return {
    found: true,
    dialog: {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             bottom: Math.round(r.bottom), vh: window.innerHeight, vw: window.innerWidth},
    body: br ? {h: Math.round(br.height), scrollH: body.scrollHeight, bottom: Math.round(br.bottom)} : null,
    footer: fr ? {y: Math.round(fr.y), bottom: Math.round(fr.bottom), visible: fr.bottom <= window.innerHeight} : null,
    clipped: body ? (body.scrollHeight > body.clientHeight + 6) : false,
    overflowX: dlg.scrollWidth > dlg.clientWidth + 4,
    title: (dlg.querySelector('.el-dialog__title')?.innerText || '').trim()
  };
})()
"""


def ev(cdp, js):
    r = cdp.send('Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True})
    return r.get('result', {}).get('value')


def click_text(cdp, text):
    return ev(cdp, f"""
(() => {{
  const els = [...document.querySelectorAll('button,.el-button,.upload-btn,.edit-btn')];
  const el = els.find(e => (e.innerText || '').trim().includes({json.dumps(text)}));
  if (!el) return 'NOT_FOUND';
  el.click(); return 'CLICKED';
}})()
""")


def main():
    profile = tempfile.mkdtemp(prefix='cdp-modal-')
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
        for m in ('Page.enable', 'Runtime.enable'):
            cdp.send(m)
        cdp.send('Emulation.setDeviceMetricsOverride', {
            'width': 1440, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
        cdp.send('Page.addScriptToEvaluateOnNewDocument',
                 {'source': f'localStorage.setItem("token", {json.dumps(TOKEN)});'})

        for name, url, label in CASES:
            cdp.send('Page.navigate', {'url': url})
            wait_ready(cdp, 25, settle=3)
            clicked = click_text(cdp, label)
            time.sleep(1.5)
            data = ev(cdp, MEASURE)
            print('=' * 70)
            print(f'{name} / {label}: {clicked}')
            print(json.dumps(data, ensure_ascii=False, indent=1))
            ev(cdp, "document.querySelector('.el-dialog__headerbtn')?.click(); 'x'")
            time.sleep(0.8)

        cdp.ws.close()
    finally:
        try:
            proc.terminate(); proc.wait(timeout=5)
        except Exception:
            proc.kill()
    return 0


if __name__ == '__main__':
    sys.exit(main())
