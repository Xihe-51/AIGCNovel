# -*- coding: utf-8 -*-
"""变量编辑器 UI 实测：项目变量 CRUD + 节点数值变化编辑。"""
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
PORT = 9343
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


def set_input(cdp, selector, value):
    return ev(cdp, f"""
(() => {{
  const el = document.querySelector({json.dumps(selector)});
  if (!el) return 'NO_INPUT';
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, {json.dumps(str(value))});
  el.dispatchEvent(new Event('input', {{ bubbles: true }}));
  el.dispatchEvent(new Event('change', {{ bubbles: true }}));
  return 'SET';
}})()
""")


def main():
    profile = tempfile.mkdtemp(prefix='cdp-varedit-')
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

        cdp.send('Page.navigate', {'url': f'http://127.0.0.1:5175/project/{PID}'})
        wait_ready(cdp, 30, settle=3)

        print('== 1. 变量 tab ==')
        print('切 tab:', click_text(cdp, '变量'))
        time.sleep(1.2)
        print(json.dumps(ev(cdp, r"""
(() => ({
  rows: [...document.querySelectorAll('.variables-table .el-table__row')]
    .map(r => (r.innerText || '').replace(/\s+/g, ' ').trim())
}))()
"""), ensure_ascii=False))

        print('== 2. 新建变量 ==')
        print('点新建:', click_text(cdp, '新建变量'))
        time.sleep(0.8)
        # 依次填：展示名、变量名、初始值
        print('填展示名:', set_input(cdp, '.el-dialog input[placeholder="如：林瑶好感度"]', '测试好感度'))
        print('改变量名:', set_input(cdp, '.el-dialog input[placeholder="affection_lin"]', 'test_affection'))
        print('填初始值:', set_input(cdp, '.el-dialog input[placeholder="0"]', '3'))
        print('保存:', click_text(cdp, '保存'))
        time.sleep(1.2)
        st, data = api('GET', f'/project/variables/{PID}')
        print('API 变量:', json.dumps(data.get('data'), ensure_ascii=False))

        print('== 3. 节点数值变化 ==')
        print('切场景 tab:', click_text(cdp, '场景编辑'))
        time.sleep(2.0)
        print('点编辑:', ev(cdp, r"""
(() => {
  const btn = document.querySelector('.scene-item:not(.header-row) .el-button--primary');
  if (!btn) return 'NO_BTN';
  btn.click(); return 'CLICKED';
})()
"""))
        time.sleep(3.0)
        print(json.dumps(ev(cdp, r"""
(() => ({
  effectRows: [...document.querySelectorAll('.effect-row')].map(r => (r.innerText || '').replace(/\s+/g, ' ').trim()),
  hasSaveBtn: [...document.querySelectorAll('button')].some(b => (b.innerText || '').includes('保存数值'))
}))()
"""), ensure_ascii=False))

        print('== 4. 把 +5 改成 +7 并保存 ==')
        print('改 delta:', set_input(cdp, '.effect-row .el-input-number input', '7'))
        time.sleep(0.3)
        print('保存数值:', click_text(cdp, '保存数值'))
        time.sleep(1.2)
        st, data = api('GET', f'/project/effects/{PID}/9')
        print('API 数值变化:', json.dumps(data.get('data'), ensure_ascii=False))

        # 清理测试变量
        for v in (api('GET', f'/project/variables/{PID}')[1].get('data') or []):
            if v.get('name') == 'test_affection':
                api('DELETE', f"/project/variables/{PID}/{v['variable_id']}")
        # 还原 +5
        vid = 2
        api('PUT', f'/project/effects/{PID}/9', json={'effects': [{'variable_id': vid, 'delta': 5}]})

        cdp.ws.close()
    finally:
        try:
            proc.terminate(); proc.wait(timeout=5)
        except Exception:
            proc.kill()
    return 0


if __name__ == '__main__':
    sys.exit(main())
