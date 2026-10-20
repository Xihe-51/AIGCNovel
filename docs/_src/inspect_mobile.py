# -*- coding: utf-8 -*-
"""移动端触控实测：竖屏提示、40px 触控目标、上滑回想、下滑隐藏、点按继续。"""
import json
import os
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inspect_ui import CDP, http_json, wait_ready  # noqa: E402

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9341
TOKEN = sys.argv[1]
PID = sys.argv[2] if len(sys.argv) > 2 else '7'


def ev(cdp, js):
    r = cdp.send('Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True})
    return r.get('result', {}).get('value')


def touch(cdp, points, type_='touchStart'):
    cdp.send('Input.dispatchTouchEvent', {
        'type': type_,
        'touchPoints': [{'x': x, 'y': y} for x, y in points],
        'modifiers': 0,
    })


def swipe(cdp, x, y1, y2, steps=5):
    touch(cdp, [(x, y1)], 'touchStart')
    for i in range(1, steps + 1):
        y = y1 + (y2 - y1) * i / steps
        touch(cdp, [(x, y)], 'touchMove')
        time.sleep(0.03)
    touch(cdp, [], 'touchEnd')
    time.sleep(0.6)


def main():
    profile = tempfile.mkdtemp(prefix='cdp-mobile-')
    proc = subprocess.Popen([
        CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
        f'--remote-debugging-port={PORT}', f'--user-data-dir={profile}',
        '--window-size=390,844', 'about:blank',
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
            'width': 390, 'height': 844, 'deviceScaleFactor': 2, 'mobile': True})
        cdp.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 1})
        cdp.send('Page.addScriptToEvaluateOnNewDocument',
                 {'source': f'localStorage.setItem("token", {json.dumps(TOKEN)});'})

        cdp.send('Page.navigate', {'url': f'http://127.0.0.1:5175/view/{PID}'})
        wait_ready(cdp, 30, settle=3)

        print('== 1. 竖屏提示与触控目标 ==')
        print(json.dumps(ev(cdp, r"""
(() => {
  const hint = document.querySelector('.rotate-hint');
  const btn = document.querySelector('.func-btn');
  const r = btn ? btn.getBoundingClientRect() : null;
  return {
    rotateHint: !!hint,
    funcBtn: r ? {w: Math.round(r.width), h: Math.round(r.height)} : null,
    settingsBtn: (() => { const b = document.querySelector('.player-settings-btn');
      const q = b?.getBoundingClientRect(); return q ? {w: Math.round(q.width), h: Math.round(q.height)} : null; })(),
    dialogueFont: getComputedStyle(document.querySelector('.dialogue-text')).fontSize
  };
})()
"""), ensure_ascii=False, indent=1))

        print('== 2. 上滑打开回想 ==')
        swipe(cdp, 195, 650, 350)
        print(json.dumps(ev(cdp, r"""
(() => ({
  history: !!document.querySelector('.history-dialogue-content'),
  items: document.querySelectorAll('.history-item').length
}))()
"""), ensure_ascii=False))

        print('== 3. 下滑关闭回想 ==')
        swipe(cdp, 195, 350, 650)
        print(json.dumps(ev(cdp, r"""
(() => ({
  history: !!document.querySelector('.history-dialogue-content'),
  dialogueVisible: !!document.querySelector('.dialogue-box')
}))()
"""), ensure_ascii=False))

        print('== 4. 下滑隐藏 UI ==')
        swipe(cdp, 195, 350, 650)
        print(json.dumps(ev(cdp, r"""
(() => ({
  dialogueVisible: !!document.querySelector('.dialogue-box'),
  showBtn: !!document.querySelector('.show-dialogue-btn')
}))()
"""), ensure_ascii=False))

        print('== 5. 点按继续 ==')
        # 先点“显示对话框”
        ev(cdp, "document.querySelector('.show-dialogue-btn')?.click(); 'x'")
        time.sleep(0.6)
        before = ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').slice(0, 12)")
        # 触屏点按对话框
        box = ev(cdp, r"""
(() => {
  const r = document.querySelector('.dialogue-box')?.getBoundingClientRect();
  return r ? {x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)} : null;
})()
""")
        if box:
            touch(cdp, [(box['x'], box['y'])], 'touchStart')
            touch(cdp, [], 'touchEnd')
            time.sleep(0.5)
            touch(cdp, [(box['x'], box['y'])], 'touchStart')
            touch(cdp, [], 'touchEnd')
        time.sleep(0.8)
        after = ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').slice(0, 12)")
        print(json.dumps({'before': before, 'after': after, 'changed': before != after},
                         ensure_ascii=False))

        cdp.ws.close()
    finally:
        try:
            proc.terminate(); proc.wait(timeout=5)
        except Exception:
            proc.kill()
    return 0


if __name__ == '__main__':
    sys.exit(main())
