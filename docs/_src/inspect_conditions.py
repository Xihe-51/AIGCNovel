# -*- coding: utf-8 -*-
"""条件分支实测：条件过滤选项 + 编辑器条件回显/保存。"""
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
PORT = 9344
TOKEN = sys.argv[1]
PID = int(sys.argv[2])
SCENE_ID = int(sys.argv[3])
EFFECT_CONTENT = int(sys.argv[4])
VAR_ID = int(sys.argv[5])
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


def set_effect(delta):
    api('PUT', f'/project/effects/{PID}/{EFFECT_CONTENT}',
        json={'effects': [{'variable_id': VAR_ID, 'delta': delta}]})


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
    profile = tempfile.mkdtemp(prefix='cdp-cond-')
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

        print('== 1. 好感度 10（<50）：只显示无条件选项 ==')
        set_effect(10)
        cdp.send('Page.navigate', {'url': f'http://127.0.0.1:5175/view/{PID}'})
        wait_ready(cdp, 30, settle=3)
        # 前进到选择节点
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(0.5)
        print(json.dumps(ev(cdp, r"""
(() => ({
  text: (document.querySelector('.dialogue-text')?.innerText || '').trim(),
  choices: [...document.querySelectorAll('.choice-option')].map(b => (b.innerText || '').trim())
}))()
"""), ensure_ascii=False))

        print('== 2. 好感度 60（>=50）：两个选项都显示 ==')
        set_effect(60)
        cdp.send('Page.reload')
        wait_ready(cdp, 30, settle=3)
        ev(cdp, "document.querySelector('.dialogue-box')?.click(); 'x'")
        time.sleep(0.5)
        print(json.dumps(ev(cdp, r"""
(() => ({
  text: (document.querySelector('.dialogue-text')?.innerText || '').trim(),
  choices: [...document.querySelectorAll('.choice-option')].map(b => (b.innerText || '').trim())
}))()
"""), ensure_ascii=False))

        print('== 3. 点「打招呼」跳转 ==')
        print(ev(cdp, r"""
(() => {
  const btn = [...document.querySelectorAll('.choice-option')].find(b => (b.innerText || '').includes('打招呼'));
  if (!btn) return 'NO_BTN';
  btn.click(); return 'CLICKED';
})()
"""))
        time.sleep(1.0)
        print('目标正文:', ev(cdp, "(document.querySelector('.dialogue-text')?.innerText || '').trim()"))

        print('== 4. 编辑器条件回显 ==')
        cdp.send('Page.navigate', {'url': f'http://127.0.0.1:5175/project/{PID}'})
        wait_ready(cdp, 30, settle=3)
        click_text(cdp, '场景编辑')
        time.sleep(2.0)
        ev(cdp, "document.querySelector('.scene-item:not(.header-row) .el-button--primary')?.click(); 'x'")
        time.sleep(3.0)
        print(json.dumps(ev(cdp, r"""
(() => ({
  items: document.querySelectorAll('.choice-item').length,
  conditions: [...document.querySelectorAll('.choice-condition')].map(c => (c.innerText || '').replace(/\s+/g, ' ').trim()),
  vars: [...document.querySelectorAll('.choice-condition .el-select')].length
}))()
"""), ensure_ascii=False))

        print('== 5. 条件值 50→5 并保存 ==')
        # 第一个条件行的数值输入
        ev(cdp, r"""
(() => {
  const el = document.querySelector('.choice-condition .el-input-number input');
  if (!el) return 'NO_INPUT';
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, '5');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'SET';
})()
""")
        time.sleep(0.3)
        print('保存分支:', click_text(cdp, '保存分支'))
        time.sleep(1.2)
        st, data = api('GET', f'/project/branches/{PID}')
        print('API 分支:', json.dumps(data.get('data'), ensure_ascii=False))

        # 还原条件与数值
        for b in data.get('data') or []:
            if b.get('conditions'):
                api('PUT', f"/project/branches/detail/{b['path_id']}",
                    json={'conditions': {'variable': 'affection_lin', 'op': '>=', 'value': 50}})
        set_effect(10)

        cdp.ws.close()
    finally:
        try:
            proc.terminate(); proc.wait(timeout=5)
        except Exception:
            proc.kill()
    return 0


if __name__ == '__main__':
    sys.exit(main())
