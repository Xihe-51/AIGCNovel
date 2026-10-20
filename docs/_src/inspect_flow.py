# -*- coding: utf-8 -*-
"""
分支节点 UI 实测：
  1. 打开项目概览 → 「高级功能预览」→ 检查剧情树节点/连线
  2. 切到「场景编辑」→ 编辑第一个场景 → 检查选择项编辑器
  3. 展开跳转目标下拉，确认能看到其它场景的节点（跨场景分支）
"""
import json
import os
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inspect_ui import CDP, http_json, wait_ready  # noqa: E402

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9335
PROJECT_ID = int(sys.argv[1]) if len(sys.argv) > 1 else 17
TOKEN = sys.argv[2] if len(sys.argv) > 2 else ''


def ev(cdp, js):
    r = cdp.send('Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True})
    return r.get('result', {}).get('value')


def click_text(cdp, text, selector='button,.el-button,.el-tabs__item'):
    js = f"""
(() => {{
  const els = [...document.querySelectorAll({json.dumps(selector)})];
  const el = els.find(e => (e.innerText || '').trim().includes({json.dumps(text)}));
  if (!el) return 'NOT_FOUND';
  el.click(); return 'CLICKED';
}})()
"""
    return ev(cdp, js)


def main():
    profile = tempfile.mkdtemp(prefix='cdp-flow-')
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
        cdp.send('Emulation.setDeviceMetricsOverride', {
            'width': 1440, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
        cdp.send('Page.addScriptToEvaluateOnNewDocument',
                 {'source': f'localStorage.setItem("token", {json.dumps(TOKEN)});'})

        cdp.send('Page.navigate', {'url': f'http://127.0.0.1:5175/project/{PROJECT_ID}'})
        wait_ready(cdp, 30, settle=4)

        print('== 1. 概览页 ==')
        print('点击「高级功能预览」:', click_text(cdp, '高级功能预览'))
        time.sleep(3)
        print(json.dumps(ev(cdp, r"""
(() => {
  const nodes = [...document.querySelectorAll('.flow-node')];
  const svg = document.querySelector('.flow-canvas svg');
  return {
    flowNodes: nodes.length,
    flowCanvas: !!document.querySelector('.flow-canvas'),
    svg: !!svg,
    paths: svg ? svg.querySelectorAll('path,line').length : 0,
    nodeTexts: nodes.slice(0, 6).map(n => (n.innerText || '').replace(/\s+/g, ' ').slice(0, 40)),
    nodeRects: nodes.map(n => {
      const r = n.getBoundingClientRect();
      return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)};
    }),
    modalText: (document.querySelector('.el-dialog')?.innerText || '').replace(/\s+/g, ' ').slice(0, 220)
  };
})()
"""), ensure_ascii=False, indent=1))

        # 关弹窗
        ev(cdp, "document.querySelector('.el-dialog__headerbtn')?.click(); 'closed'")
        time.sleep(1)

        print('== 2. 场景编辑 ==')
        print('切 tab:', click_text(cdp, '场景编辑'))
        time.sleep(3)
        print('点第一个编辑:', ev(cdp, r"""
(() => {
  const btn = document.querySelector('.scene-item:not(.header-row) .el-button--primary');
  if (!btn) return 'NO_BTN';
  btn.click(); return 'CLICKED';
})()
"""))
        time.sleep(4)

        print(json.dumps(ev(cdp, r"""
(() => {
  const items = [...document.querySelectorAll('.dialogue-editor-item')];
  const rows = [...document.querySelectorAll('.choice-row')];
  return {
    dialogues: items.length,
    choiceRows: rows.length,
    choiceTexts: rows.map(r => (r.innerText || '').replace(/\s+/g, ' ').slice(0, 80)),
    fsmBadges: document.querySelectorAll('.fsm-badge').length,
    saveBranchBtn: [...document.querySelectorAll('button')].some(b => (b.innerText||'').includes('保存分支')),
    editorText: (document.querySelector('.dialogues-editor')?.innerText || '').replace(/\s+/g, ' ').slice(0, 260)
  };
})()
"""), ensure_ascii=False, indent=1))

        # 展开第一个跳转目标下拉
        print('== 2.1 场景编辑器布局体检 ==')
        from inspect_ui import AUDIT_JS
        layout = json.loads(ev(cdp, AUDIT_JS))
        print(json.dumps({k: layout.get(k) for k in
                          ('scrollWidth', 'innerWidth', 'offscreen', 'overflows', 'clipped', 'bg')},
                         ensure_ascii=False, indent=1)[:3500])

        print('== 3. 跳转目标下拉 ==')
        print('点开下拉:', ev(cdp, r"""
(() => {
  const sel = document.querySelector('.choice-target-select .el-select__wrapper, .choice-target-select input, .choice-target-select .el-input__inner');
  if (!sel) return 'NO_SELECT';
  sel.click(); return 'CLICKED';
})()
"""))
        time.sleep(1.5)
        print(json.dumps(ev(cdp, r"""
(() => {
  const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null);
  return {
    optionCount: items.length,
    options: items.map(e => (e.innerText || '').replace(/\s+/g, ' ').slice(0, 50))
  };
})()
"""), ensure_ascii=False, indent=1))

        # 收起下拉后点「保存分支」，验证 UI 保存链路
        ev(cdp, "document.body.click(); 'blur'")
        time.sleep(1)
        print('== 4. 保存分支 ==')
        print('点击保存分支:', click_text(cdp, '保存分支'))
        time.sleep(2.5)
        print('提示:', ev(cdp, "document.querySelector('.el-message')?.innerText || 'NO_MESSAGE'"))

        import requests
        s = requests.Session()
        s.trust_env = False
        r = s.get(f'http://127.0.0.1:8088/project/branches/{PROJECT_ID}',
                  headers={'Authorization': f'Bearer {TOKEN}', 'X-User-Id': '1'}, timeout=10)
        print('库内分支:', json.dumps(r.json().get('data'), ensure_ascii=False))

        cdp.ws.close()
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
    return 0


if __name__ == '__main__':
    sys.exit(main())
