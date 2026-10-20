# -*- coding: utf-8 -*-
"""云端存档实测：自动存档 / 手动保存 / 读取 / 删除。"""
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
PORT = 9339
TOKEN = sys.argv[1]
PID = sys.argv[2] if len(sys.argv) > 2 else '7'


def ev(cdp, js):
    r = cdp.send('Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True})
    return r.get('result', {}).get('value')


def api_saves():
    s = requests.Session()
    s.trust_env = False
    r = s.get(f'http://127.0.0.1:8088/project/saves/{PID}',
              headers={'Authorization': f'Bearer {TOKEN}', 'X-User-Id': '1'}, timeout=10)
    return r.json().get('data')


def open_save_dialog(cdp):
    return ev(cdp, r"""
(() => {
  const btns = [...document.querySelectorAll('.function-buttons .func-btn')];
  // 顺序：历史/隐藏/快进/自动/重开/存档/退出
  const btn = btns[5] || btns[btns.length - 2];
  if (!btn) return 'NO_BUTTON';
  btn.click(); return 'CLICKED';
})()
""")


def click_slot_button(cdp, label, index):
    return ev(cdp, f"""
(() => {{
  const rows = [...document.querySelectorAll('.save-slot')];
  const row = rows.find(r => (r.innerText || '').includes({json.dumps(label)}));
  if (!row) return 'NO_ROW';
  const btns = row.querySelectorAll('button');
  if (!btns[{index}]) return 'NO_BTN';
  btns[{index}].click(); return 'CLICKED';
}})()
""")


def main():
    profile = tempfile.mkdtemp(prefix='cdp-saves-')
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
        wait_ready(cdp, 30, settle=3)

        print('== 1. 推进对话，触发自动存档 ==')
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(0.4)
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(2.2)
        print('API 存档列表:', json.dumps(api_saves(), ensure_ascii=False))

        print('== 2. 打开存档面板 ==')
        print('打开:', open_save_dialog(cdp))
        time.sleep(0.8)
        print(json.dumps(ev(cdp, r"""
(() => ({
  visible: !!document.querySelector('.save-dialog'),
  rows: [...document.querySelectorAll('.save-slot')].map(r => (r.innerText || '').replace(/\s+/g, ' ').trim())
}))()
"""), ensure_ascii=False, indent=1))

        print('== 3. 保存到「存档 1」 ==')
        print('点击保存:', click_slot_button(cdp, '存档 1', 0))
        time.sleep(1.2)
        print('API 存档列表:', json.dumps(api_saves(), ensure_ascii=False))

        print('== 4. 再推进对话后读取「存档 1」 ==')
        ev(cdp, "document.querySelector('.el-dialog__headerbtn')?.click(); 'x'")
        time.sleep(0.5)
        before = ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').slice(0, 20)")
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(0.3)
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(0.8)
        moved = ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').slice(0, 20)")
        open_save_dialog(cdp)
        time.sleep(0.8)
        print('点击读取:', click_slot_button(cdp, '存档 1', 1))
        time.sleep(1.2)
        restored = ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').slice(0, 20)")
        print(json.dumps({'before': before, 'afterAdvance': moved, 'restored': restored,
                          'restored_ok': restored == before}, ensure_ascii=False))

        print('== 5. 删除「存档 1」 ==')
        open_save_dialog(cdp)
        time.sleep(0.6)
        print('点击删除:', click_slot_button(cdp, '存档 1', 2))
        time.sleep(0.6)
        print('确认删除:', ev(cdp, r"""
(() => {
  const btn = [...document.querySelectorAll('.el-message-box__btns button')]
    .find(b => (b.innerText || '').includes('删除'));
  if (!btn) return 'NO_CONFIRM';
  btn.click(); return 'CLICKED';
})()
"""))
        time.sleep(1.2)
        print('API 存档列表:', json.dumps(api_saves(), ensure_ascii=False))

        cdp.ws.close()
    finally:
        try:
            proc.terminate(); proc.wait(timeout=5)
        except Exception:
            proc.kill()
    return 0


if __name__ == '__main__':
    sys.exit(main())
