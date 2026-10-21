# -*- coding: utf-8 -*-
"""真机体检（CDP）：项目页「素材体检」弹窗 + 新建项目弹窗里的模板骨架摘要。

补上第 10/11 批留下的「只做了接口级 + 构建级验证」的缺口。

用法（cwd=d:\\AIGCNovel，前端 5175 与后端 8088 需在跑）：
  back\\.venv\\Scripts\\python.exe -X utf8 docs/_src/inspect_asset_check.py <token> [project_id]

断言：
  ① /project/<pid> 上「素材体检」按钮存在且可点，弹窗能打开；
  ② 弹窗里有汇总条（.asset-summary），有内容区，footer 在视口内；
  ③ /home 的「新建项目」弹窗里，模板卡片渲染出「预置场景」摘要与推荐变量；
  ④ 全程没有 console 错误、没有 >=400 的请求。
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from inspect_ui import CDP, http_json, wait_ready  # noqa: E402  复用同一套 CDP 封装

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9336
VIEW_W = int(os.environ.get('VIEW_W', '1440'))
VIEW_H = int(os.environ.get('VIEW_H', '1000'))
FRONT = os.environ.get('AIGC_FRONT', 'http://127.0.0.1:5175')

RESULTS = []


def check(name, cond, detail=''):
    RESULTS.append((name, bool(cond), detail))
    print(('PASS  ' if cond else 'FAIL  ') + name + (('  | ' + str(detail)) if detail else ''))


def evaljs(cdp, expr):
    r = cdp.send('Runtime.evaluate', {'expression': expr, 'returnByValue': True,
                                      'awaitPromise': True})
    return r.get('result', {}).get('value')


CLICK_ASSET = r"""
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('素材体检'));
  if (!btn) return 'no-button';
  btn.click();
  return 'clicked';
})()
"""

READ_ASSET = r"""
(() => {
  const dlg = [...document.querySelectorAll('.el-dialog')]
    .find(d => (d.textContent || '').includes('素材体检'));
  if (!dlg) return JSON.stringify({found: false});
  const r = dlg.getBoundingClientRect();
  const body = dlg.querySelector('.el-dialog__body');
  const footer = dlg.querySelector('.el-dialog__footer');
  const summary = dlg.querySelector('.asset-summary');
  return JSON.stringify({
    found: true,
    title: ((dlg.querySelector('.el-dialog__title') || {}).textContent || '').trim(),
    summary: ((summary || {}).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140),
    summaryClass: summary ? summary.className : '',
    rows: dlg.querySelectorAll('.asset-row').length,
    sections: dlg.querySelectorAll('.asset-section').length,
    hasSpinner: !!dlg.querySelector('.asset-loading'),
    h: Math.round(r.height),
    bottom: Math.round(r.bottom),
    vh: window.innerHeight,
    bodyScroll: body ? body.scrollHeight : 0,
    bodyH: body ? body.clientHeight : 0,
    footerVisible: footer ? footer.getBoundingClientRect().bottom <= window.innerHeight : null
  });
})()
"""

CLICK_NEW_PROJECT = r"""
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('新建项目'));
  if (!btn) return 'no-button';
  btn.click();
  return 'clicked';
})()
"""

READ_TEMPLATES = r"""
(() => {
  const cards = [...document.querySelectorAll('.template-card')];
  return JSON.stringify({
    count: cards.length,
    cards: cards.map(c => ({
      name: ((c.querySelector('.template-name') || {}).textContent || '').trim(),
      skeleton: ((c.querySelector('.template-skeleton') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      vars: ((c.querySelector('.template-vars') || {}).textContent || '').replace(/\s+/g, ' ').trim()
    })),
    tip: ((document.querySelector('.template-tip') || {}).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  });
})()
"""


def drain_errors(cdp):
    errors, bad = [], []
    for e in cdp.drain():
        m = e['method']
        p = e.get('params', {})
        if m == 'Runtime.exceptionThrown':
            errors.append(str(p.get('exceptionDetails', {}).get('text'))[:160])
        elif m == 'Runtime.consoleAPICalled' and p.get('type') in ('error', 'warning'):
            args = [a.get('value') or a.get('description') or '' for a in p.get('args', [])]
            errors.append(' '.join(str(a) for a in args)[:160])
        elif m == 'Network.responseReceived':
            st = p.get('response', {}).get('status', 0)
            if st >= 400:
                bad.append({'status': st, 'url': p.get('response', {}).get('url', '')[:140]})
    return errors[:10], bad[:10]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    token = sys.argv[1]
    pid = sys.argv[2] if len(sys.argv) > 2 else '7'

    profile = tempfile.mkdtemp(prefix='cdp-asset-')
    proc = subprocess.Popen([
        CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
        f'--remote-debugging-port={PORT}', f'--user-data-dir={profile}',
        f'--window-size={VIEW_W},{VIEW_H}', 'about:blank',
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
        for m in ('Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable'):
            cdp.send(m)
        cdp.send('Emulation.setDeviceMetricsOverride', {
            'width': VIEW_W, 'height': VIEW_H, 'deviceScaleFactor': 1, 'mobile': False})
        cdp.send('Page.addScriptToEvaluateOnNewDocument', {
            'source': f'localStorage.setItem("token", {json.dumps(token)});'})

        # ---------- ① /project/<pid> 素材体检 ----------
        cdp.send('Page.navigate', {'url': f'{FRONT}/project/{pid}'})
        wait_ready(cdp, 30, settle=4.0)
        cdp.drain()

        clicked = evaljs(cdp, CLICK_ASSET)
        check('项目页存在「素材体检」按钮', clicked == 'clicked', clicked)
        time.sleep(2.5)
        raw = evaljs(cdp, READ_ASSET)
        info = json.loads(raw) if raw else {}
        check('体检弹窗打开', info.get('found') is True, raw[:120] if raw else 'no result')
        if info.get('found'):
            check('弹窗标题正确', info.get('title') == '素材体检', info.get('title'))
            check('汇总条已渲染（加载结束后不应还是 loading）',
                  bool(info.get('summary')) and not info.get('hasSpinner'),
                  f"summary={info.get('summary')!r} spinner={info.get('hasSpinner')}")
            check('汇总条带健康态样式',
                  'is-ok' in (info.get('summaryClass') or '') or 'is-warn' in (info.get('summaryClass') or ''),
                  info.get('summaryClass'))
            check('footer 在视口内', info.get('footerVisible') is True, info)
            check('弹窗未超出视口', (info.get('bottom') or 0) <= VIEW_H, info.get('bottom'))

        errs, bad = drain_errors(cdp)
        check('项目页无 console 错误', not errs, errs)
        check('项目页无失败请求', not bad, bad)

        # ---------- ② /home 模板骨架摘要 ----------
        cdp.send('Page.navigate', {'url': f'{FRONT}/home'})
        wait_ready(cdp, 30, settle=4.0)
        cdp.drain()

        clicked = evaljs(cdp, CLICK_NEW_PROJECT)
        check('作品页存在「新建项目」按钮', clicked == 'clicked', clicked)
        time.sleep(1.5)
        raw = evaljs(cdp, READ_TEMPLATES)
        tpl = json.loads(raw) if raw else {}
        cards = tpl.get('cards') or []
        check('模板卡片渲染 3 张', len(cards) == 3, tpl.get('count'))
        check('每张卡片都显示「预置场景」摘要',
              bool(cards) and all('预置场景' in (c.get('skeleton') or '') for c in cards),
              [c.get('skeleton') for c in cards])
        check('三张卡片的场景链互不相同',
              len({c.get('skeleton') for c in cards}) == len(cards),
              [c.get('skeleton') for c in cards])
        check('至少一张卡片显示推荐变量',
              any('推荐变量' in (c.get('vars') or '') for c in cards),
              [c.get('vars') for c in cards])
        check('卡片下方有占位文本提示', '【在此填写' in (tpl.get('tip') or ''), tpl.get('tip'))

        errs, bad = drain_errors(cdp)
        check('作品页无 console 错误', not errs, errs)
        check('作品页无失败请求', not bad, bad)

        cdp.ws.close()
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    ok = sum(1 for _, c, _ in RESULTS if c)
    bad = [n for n, c, _ in RESULTS if not c]
    print('\n===== 汇总 =====')
    print(f'通过 {ok} | 失败 {len(bad)} | 合计 {len(RESULTS)}')
    if bad:
        print('失败项：' + '；'.join(bad))
    return 0 if not bad else 1


if __name__ == '__main__':
    sys.exit(main())
