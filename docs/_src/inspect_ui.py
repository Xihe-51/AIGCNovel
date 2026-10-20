# -*- coding: utf-8 -*-
"""
无头 Chrome 页面体检：坏图 / 横向溢出 / 越界元素 / 控制台错误 / 失败请求。
用法：python inspect_ui.py <token> <name>=<url> [...]
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9334
VIEW_W = int(os.environ.get('VIEW_W', '1440'))
VIEW_H = int(os.environ.get('VIEW_H', '1000'))

AUDIT_JS = r"""
(() => {
  const vw = window.innerWidth;
  const out = {
    url: location.href,
    title: document.title,
    token: localStorage.getItem('token') ? 'present' : 'missing',
    tokenLog: (window.__tokenLog || []).slice(-5),
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: vw,
    images: [], offscreen: [], overflows: []
  };
  document.querySelectorAll('img').forEach(img => {
    const src = img.currentSrc || img.src || '';
    if (!img.complete || img.naturalWidth === 0) {
      out.images.push({src: src.slice(0, 160), w: img.clientWidth, h: img.clientHeight});
    }
  });
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) return;
    const r = el.getBoundingClientRect();
    if (r.width > 1 && (r.right > vw + 2 || r.left < -2)) {
      out.offscreen.push({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 70),
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width)
      });
    }
  });
  document.querySelectorAll('*').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0) {
      const cs = getComputedStyle(el);
      if (['auto', 'scroll'].includes(cs.overflowX)) return;
      out.overflows.push({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 70),
        sw: el.scrollWidth, cw: el.clientWidth
      });
    }
  });
  out.images = out.images.slice(0, 20);
  out.offscreen = out.offscreen.slice(0, 20);
  out.overflows = out.overflows.slice(0, 20);
  const sels = ['.project-card', '.chart-container', '.flow-node', '.flow-canvas',
                '.stats-card', '.scene-item', '.dialogue-editor-item', '.preview-panel',
                '.tech-nav-circle', '.custom-tabs', '.choice-row'];
  out.counts = {};
  for (const s of sels) out.counts[s] = document.querySelectorAll(s).length;
  out.boxes = {};
  for (const s of ['.chart-container', '.flow-canvas', '.studio-main', '.preview-panel', '.scene-list']) {
    const el = document.querySelector(s);
    if (el) {
      const r = el.getBoundingClientRect();
      out.boxes[s] = {w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top)};
    }
  }
  out.text = document.body.innerText.replace(/\s+/g, ' ').slice(0, 240);
  out.clipped = [];
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (!el.clientHeight) return;
    if (['hidden', 'clip'].includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 6
        && (el.innerText || '').trim().length > 0) {
      out.clipped.push({
        tag: el.tagName, cls: (el.className || '').toString().slice(0, 60),
        sh: el.scrollHeight, ch: el.clientHeight,
        text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 50)
      });
    }
  });
  out.clipped = out.clipped.slice(0, 15);
  out.bg = [];
  document.querySelectorAll('*').forEach(el => {
    const bi = getComputedStyle(el).backgroundImage;
    if (bi && bi.includes('url(') && out.bg.length < 10) {
      out.bg.push({cls: (el.className || '').toString().slice(0, 50), img: bi.slice(0, 140)});
    }
  });
  // 低对比度文字（白底白字/浅灰小字）与过小字号
  const parse = s => {
    const m = (s || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return {r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3]};
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const effBg = el => {
    let e = el;
    while (e) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.5) return c;
      e = e.parentElement;
    }
    return {r: 255, g: 255, b: 255, a: 1};
  };
  out.lowContrast = [];
  out.tinyFont = [];
  document.querySelectorAll('*').forEach(el => {
    if (!el.getClientRects().length) return;
    const direct = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!direct) return;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) return;
    const bg = effBg(el);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const txt = (el.innerText || '').replace(/\s+/g, ' ').slice(0, 40);
    if (ratio < 2.2 && out.lowContrast.length < 12) {
      out.lowContrast.push({cls: (el.className || '').toString().slice(0, 50),
                            ratio: Math.round(ratio * 100) / 100, color: cs.color, text: txt});
    }
    const fs = parseFloat(cs.fontSize);
    if (fs && fs < 10 && out.tinyFont.length < 8) {
      out.tinyFont.push({cls: (el.className || '').toString().slice(0, 50), size: fs, text: txt});
    }
  });
  return JSON.stringify(out);
})()
"""


def http_json(path, method='GET', port=None):
    port = port or PORT
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', method=method)
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read().decode('utf-8'))


class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=40)
        self.i = 0
        self.events = []

    def send(self, method, params=None):
        self.i += 1
        mid = self.i
        self.ws.send(json.dumps({'id': mid, 'method': method, 'params': params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == mid:
                if 'error' in msg:
                    raise RuntimeError(f'{method}: {msg["error"]}')
                return msg.get('result', {})
            if 'method' in msg:
                self.events.append(msg)

    def drain(self):
        self.ws.settimeout(0.2)
        try:
            while True:
                msg = json.loads(self.ws.recv())
                if 'method' in msg:
                    self.events.append(msg)
        except Exception:
            pass
        finally:
            self.ws.settimeout(40)
        ev, self.events = self.events, []
        return ev


def wait_ready(cdp, timeout=25, settle=3.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = cdp.send('Runtime.evaluate', {
                'expression': 'document.readyState', 'returnByValue': True})
            if r.get('result', {}).get('value') == 'complete':
                time.sleep(settle)
                return
        except Exception:
            pass
        time.sleep(0.4)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    token = sys.argv[1]
    pages = [x.split('=', 1) for x in sys.argv[2:]]

    profile = tempfile.mkdtemp(prefix='cdp-inspect-')
    proc = subprocess.Popen([
        CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
        f'--remote-debugging-port={PORT}', f'--user-data-dir={profile}',
        f'--window-size={VIEW_W},{VIEW_H}', 'about:blank',
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
        for m in ('Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable'):
            cdp.send(m)
        cdp.send('Emulation.setDeviceMetricsOverride', {
            'width': VIEW_W, 'height': VIEW_H, 'deviceScaleFactor': 1, 'mobile': False})
        cdp.send('Page.addScriptToEvaluateOnNewDocument', {'source': f'localStorage.setItem("token", {json.dumps(token)});'})
        cdp.send('Page.addScriptToEvaluateOnNewDocument', {'source': r"""
window.__tokenLog = [];
try {
  const _rm = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function(k) {
    if (k === 'token') window.__tokenLog.push('remove:' + new Error().stack);
    return _rm.apply(this, arguments);
  };
  const _set = Storage.prototype.setItem;
  Storage.prototype.setItem = function(k, v) {
    if (k === 'token') window.__tokenLog.push('set:' + String(v).slice(0, 12));
    return _set.apply(this, arguments);
  };
} catch (e) {}
"""})

        cdp.send('Page.navigate', {'url': 'http://127.0.0.1:5173/login'})
        wait_ready(cdp, 15)
        cdp.send('Runtime.evaluate', {
            'expression': f'localStorage.setItem("token", {json.dumps(token)}); "ok"',
            'returnByValue': True})
        chk = cdp.send('Runtime.evaluate', {
            'expression': 'localStorage.getItem("token") ? localStorage.getItem("token").slice(0,24) : "MISSING"',
            'returnByValue': True})
        print('[token]', chk.get('result', {}).get('value'))
        cdp.drain()

        for name, url in pages:
            cdp.send('Page.navigate', {'url': url})
            wait_ready(cdp, 30, settle=4.0)
            cdp.drain()
            res = cdp.send('Runtime.evaluate', {
                'expression': AUDIT_JS, 'returnByValue': True, 'awaitPromise': True})
            data = json.loads(res['result']['value'])

            events = cdp.drain()
            errors, failed, bad_status = [], [], []
            for e in events:
                m = e['method']
                p = e.get('params', {})
                if m == 'Runtime.exceptionThrown':
                    errors.append(str(p.get('exceptionDetails', {}).get('text'))[:200])
                elif m == 'Runtime.consoleAPICalled' and p.get('type') in ('error', 'warning'):
                    args = [a.get('value') or a.get('description') or '' for a in p.get('args', [])]
                    errors.append(' '.join(str(a) for a in args)[:200])
                elif m == 'Network.loadingFailed':
                    failed.append({'url': p.get('requestId'), 'err': p.get('errorText')})
                elif m == 'Network.responseReceived':
                    st = p.get('response', {}).get('status', 0)
                    if st >= 400:
                        bad_status.append({'status': st, 'url': p.get('response', {}).get('url', '')[:160]})

            data['console'] = errors[:15]
            data['badStatus'] = bad_status[:15]
            data['loadingFailed'] = failed[:10]
            print('=' * 78)
            print(name, data['url'])
            print(json.dumps(data, ensure_ascii=False, indent=1)[:6000])

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
