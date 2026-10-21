# -*- coding: utf-8 -*-
"""
第 11 批回归：模板中心做实（T6）+ 演出指令素材入口（T5）+ 素材引用与体检（T7）。

覆盖点：
  ① 模板元数据：三种模板都带场景骨架，分支/开放世界带推荐变量。
  ② 模板脚手架：新建项目后自动铺「场景 + 【在此填写…】占位对话 + 占位分支 + 推荐变量」，
     三个模板建出来的结构互不相同；分支叙事的选择节点已配好分支，FSM 不报
     CHOICE_WITHOUT_BRANCH。
  ③ 演出指令：五种类型（avatar/background/music/sound/wait）CRUD、payload round-trip、
     非法类型 / 缺 content_id / 跨项目节点都被拒。
  ④ 素材体检：上传的背景图正常时 healthy=true；磁盘文件被删后能报出缺失；
     演出指令里的素材 URL 也纳入体检范围。
  ⑤ 市场素材引用：引用计数可见；仍被引用时删除素材返回 409（不再静默清引用）。
  ⑥ 权限：他人读本项目的素材体检返回 404。

运行（cwd=d:\\AIGCNovel，需后端 + MySQL 已启动）：
  back\\.venv\\Scripts\\python.exe -X utf8 docs/_src/test_batch16_e2e.py
"""
import base64
import io
import json
import os
import sys
import time

import requests

BASE = os.environ.get('AIGC_BASE', 'http://127.0.0.1:8088')
USERNAME = os.environ.get('AIGC_USER', 'celerytest')
PASSWORD = os.environ.get('AIGC_PASS', 'Test123456')

for k in ('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'):
    os.environ.pop(k, None)
os.environ['NO_PROXY'] = '127.0.0.1,localhost'

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATIC_DIR = os.path.join(ROOT, 'back', 'app', 'static')

S = requests.Session()
S.trust_env = False

RESULTS = []
CREATED_PROJECTS = []
CREATED_RESOURCES = []
OTHER_USER = None

# 1x1 透明 PNG
PNG_BYTES = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')


def check(name, cond, detail=''):
    RESULTS.append((name, bool(cond), detail))
    print(('PASS  ' if cond else 'FAIL  ') + name + (('  | ' + str(detail)) if detail else ''))


def api(method, path, **kw):
    kw.setdefault('timeout', 30)
    r = S.request(method, BASE + path, **kw)
    try:
        body = r.json()
    except Exception:
        body = r.text[:300]
    return r.status_code, body


def data_of(body):
    return (body or {}).get('data') if isinstance(body, dict) else None


def upload_png(project_id, file_type='image'):
    """上传一张 1x1 PNG，返回落库 URL。"""
    files = {'file': ('probe.png', io.BytesIO(PNG_BYTES), 'image/png')}
    st, body = api('POST', '/project/scenes/upload',
                   files=files,
                   data={'project_id': str(project_id), 'file_type': file_type})
    d = data_of(body) or {}
    return st, (d.get('url') or d.get('file_url'))


def disk_path_of(url):
    """把 /static/... 映射成磁盘路径（后端 cwd=back）。"""
    if not url or not url.startswith('/static/'):
        return None
    rel = url[len('/static/'):].replace('\\', '/')
    return os.path.join(STATIC_DIR, *[p for p in rel.split('/') if p])


def finish():
    ok = sum(1 for _, c, _ in RESULTS if c)
    bad = [n for n, c, _ in RESULTS if not c]
    print('\n===== 汇总 =====')
    print(f'通过 {ok} | 失败 {len(bad)} | 合计 {len(RESULTS)}')
    if bad:
        print('失败项：' + '；'.join(bad))
    return 0 if not bad else 1


def cleanup():
    for rid in CREATED_RESOURCES:
        api('DELETE', f'/user/resources/{rid}')
    for p in CREATED_PROJECTS:
        api('DELETE', f'/project/project/{p}')
    if OTHER_USER:
        try:
            import pymysql

            env = {}
            try:
                from dotenv import dotenv_values
                env = dotenv_values(os.path.join(ROOT, 'back', '.env')) or {}
            except Exception:
                pass

            def cfg(key, default=''):
                return os.environ.get(key) or env.get(key) or default

            conn = pymysql.connect(
                host=cfg('DB_HOST', '127.0.0.1'), port=int(cfg('DB_PORT', '3306')),
                user=cfg('DB_USER', 'root'), password=cfg('DB_PASSWORD'),
                database=cfg('DB_NAME', 'aigc'), charset='utf8mb4')
            with conn.cursor() as cur:
                cur.execute('DELETE FROM users WHERE username = %s', (OTHER_USER,))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f'（临时用户 {OTHER_USER} 清理失败：{e}，请手工删除）')


def main():
    global OTHER_USER

    # ---------- 登录 ----------
    st, body = api('POST', '/user/login', json={'username': USERNAME, 'password': PASSWORD})
    check('登录', st == 200 and 'access_token' in (body or {}), f'{st}')
    if st != 200:
        return finish()
    token = body['access_token']
    S.headers.update({'Authorization': 'Bearer ' + token})
    pl = token.split('.')[1]
    pl += '=' * (-len(pl) % 4)
    uid = json.loads(base64.urlsafe_b64decode(pl))['identity']
    S.headers.update({'X-User-Id': str(uid)})

    ts = int(time.time())

    # ---------- ① 模板元数据 ----------
    st, body = api('GET', '/project/templates')
    tpls = data_of(body) or []
    by_type = {t.get('template_type'): t for t in tpls}
    check('模板接口返回 3 个模板', st == 200 and len(tpls) == 3, f'{st} {len(tpls)}')
    check('三个模板都有 >=3 个起始场景',
          all(len((t or {}).get('starter_scenes') or []) >= 3 for t in tpls),
          {k: len((v or {}).get('starter_scenes') or []) for k, v in by_type.items()})
    check('线性叙事无推荐变量',
          (by_type.get('线性叙事') or {}).get('recommended_variables') == [],
          (by_type.get('线性叙事') or {}).get('recommended_variables'))
    check('分支叙事推荐 affection',
          [v.get('name') for v in (by_type.get('分支叙事') or {}).get('recommended_variables') or []] == ['affection'],
          (by_type.get('分支叙事') or {}).get('recommended_variables'))
    check('开放世界推荐 clue',
          [v.get('name') for v in (by_type.get('开放世界') or {}).get('recommended_variables') or []] == ['clue'],
          (by_type.get('开放世界') or {}).get('recommended_variables'))

    # ---------- ② 模板脚手架 ----------
    expect = {
        '线性叙事': {'scenes': ['开场', '发展', '结局'], 'contents': 5, 'vars': [], 'branches': 0},
        '分支叙事': {'scenes': ['开场', '分歧点', '结局·A 线', '结局·B 线'], 'contents': 6,
                 'vars': ['affection'], 'branches': 2},
        '开放世界': {'scenes': ['序章', '探索区域·甲', '探索区域·乙', '终章'], 'contents': 4,
                 'vars': ['clue'], 'branches': 0},
    }
    projects = {}
    for ttype, exp in expect.items():
        st, body = api('POST', '/project/project', json={
            'title': f'第11批-模板-{ttype}-{ts}', 'genre': '悬疑', 'template_type': ttype,
        })
        pid = (data_of(body) or {}).get('project_id')
        check(f'[{ttype}] 创建项目', st in (200, 201) and bool(pid), f'{st} {str(body)[:120]}')
        if not pid:
            continue
        CREATED_PROJECTS.append(pid)
        projects[ttype] = pid

        st, body = api('GET', f'/project/scenes/{pid}')
        scenes = data_of(body) or []
        titles = [s.get('title') for s in scenes]
        check(f'[{ttype}] 场景骨架与模板一致', titles == exp['scenes'], titles)

        st, body = api('GET', f'/project/story_graph/{pid}')
        graph = data_of(body) or {}
        nodes = graph.get('nodes') or []
        texts = [n.get('content_text') or '' for n in nodes]
        check(f"[{ttype}] 占位节点数 = {exp['contents']}",
              len(nodes) == exp['contents'], len(nodes))
        check(f'[{ttype}] 占位文本都以「【在此填写」开头',
              bool(texts) and all(t.startswith('【在此填写') for t in texts),
              texts[:2])

        st, body = api('GET', f'/project/variables/{pid}')
        var_names = [v.get('name') for v in (data_of(body) or [])]
        check(f'[{ttype}] 推荐变量 = {exp["vars"] or "无"}', var_names == exp['vars'], var_names)

        st, body = api('GET', f'/project/branches/{pid}')
        branches = data_of(body) or []
        check(f"[{ttype}] 占位分支数 = {exp['branches']}", len(branches) == exp['branches'],
              [(b.get('source_content_id'), b.get('target_content_id')) for b in branches])
        if ttype == '分支叙事':
            check('分支叙事：两条分支都带选项文案',
                  len(branches) == 2 and all(b.get('choice_text') for b in branches),
                  [b.get('choice_text') for b in branches])
            rep = graph.get('validation') or {}
            err_codes = [e.get('code') for e in rep.get('errors') or []]
            check('分支叙事：选择节点已配分支，不报 CHOICE_WITHOUT_BRANCH',
                  'CHOICE_WITHOUT_BRANCH' not in err_codes, err_codes)

    if '分支叙事' not in projects:
        return finish()
    pid = projects['分支叙事']

    st, body = api('GET', f'/project/story_graph/{pid}')
    nodes = (data_of(body) or {}).get('nodes') or []
    node_ids = [n.get('content_id') for n in nodes]
    target = node_ids[0] if node_ids else None

    # ---------- ③ 演出指令 CRUD ----------
    payloads = {
        'avatar': {'character_id': None, 'position': 'left', 'action': 'show'},
        'background': {'url': '/static/probe/bg.png', 'transition': 'fade', 'duration_ms': 400},
        'music': {'url': '/static/probe/bgm.mp3', 'action': 'play', 'loop': True},
        'sound': {'url': '/static/probe/se.wav', 'volume': 0.8},
        'wait': {'ms': 800},
    }
    made = {}
    for dtype, payload in payloads.items():
        st, body = api('POST', f'/project/directives/{pid}', json={
            'content_id': target, 'directive_type': dtype, 'payload': payload,
        })
        made[dtype] = (data_of(body) or {}).get('directive_id')
        check(f'新增演出指令 {dtype}', st == 201 and bool(made[dtype]), f'{st} {str(body)[:120]}')

    st, body = api('GET', f'/project/directives/{pid}/{target}')
    rows = data_of(body) or []
    check('节点指令列表 = 5 条', st == 200 and len(rows) == 5, len(rows))
    check('五种类型都落库',
          sorted(r.get('directive_type') for r in rows) == sorted(payloads.keys()),
          [r.get('directive_type') for r in rows])
    bg_row = next((r for r in rows if r.get('directive_type') == 'background'), {})
    check('background payload round-trip',
          (bg_row.get('payload') or {}).get('url') == '/static/probe/bg.png',
          bg_row.get('payload'))

    st, body = api('PUT', f'/project/directives/{pid}/{made["wait"]}', json={'payload': {'ms': 1500}})
    check('更新 wait 指令', st == 200 and (data_of(body) or {}).get('payload', {}).get('ms') == 1500,
          f'{st} {str(body)[:120]}')

    st, body = api('POST', f'/project/directives/{pid}', json={
        'content_id': target, 'directive_type': 'flash', 'payload': {},
    })
    check('非法指令类型被拒', st == 400, f'{st} {str(body)[:100]}')

    st, body = api('POST', f'/project/directives/{pid}', json={'directive_type': 'wait', 'payload': {}})
    check('缺 content_id 被拒', st == 400, f'{st} {str(body)[:100]}')

    st, body = api('POST', f'/project/directives/{pid}', json={
        'content_id': 99999999, 'directive_type': 'wait', 'payload': {'ms': 100},
    })
    check('跨项目/不存在的节点被拒', st == 404, f'{st} {str(body)[:100]}')

    st, body = api('DELETE', f'/project/directives/{pid}/{made["sound"]}')
    check('删除一条指令', st == 200, f'{st}')
    st, body = api('GET', f'/project/directives/{pid}/{target}')
    check('删除后剩 4 条', len(data_of(body) or []) == 4, len(data_of(body) or []))

    # ---------- ④ 素材体检 ----------
    st, bg_url = upload_png(pid)
    check('上传背景图', st in (200, 201) and bool(bg_url), f'{st} {bg_url}')
    if bg_url:
        st_scenes, body_scenes = api('GET', f'/project/scenes/{pid}')
        first_sid = ((data_of(body_scenes) or [{}])[0]).get('scene_id')
        api('PUT', f'/project/scenes/{first_sid}', json={'background_url': bg_url})
        # 让演出指令也指向真实文件，避免它先报缺失
        for r in rows:
            if r.get('directive_type') == 'background':
                api('PUT', f"/project/directives/{pid}/{r.get('directive_id')}",
                    json={'payload': {'url': bg_url, 'transition': 'fade', 'duration_ms': 400}})

        st, body = api('GET', f'/project/assets/check/{pid}')
        res = data_of(body) or {}
        check('素材体检可读', st == 200 and bool(res), f'{st} {str(body)[:120]}')
        check('背景图状态 ok', any(i.get('url') == bg_url and i.get('status') == 'ok'
                                for i in res.get('items') or []),
              [i.get('status') for i in res.get('items') or []])
        check('体检覆盖演出指令里的素材',
              any(i.get('kind') == 'directive' for i in res.get('items') or []),
              [i.get('kind') for i in res.get('items') or []])

        # 人为删掉磁盘文件 → 体检必须报出来
        path = disk_path_of(bg_url)
        removed = False
        if path and os.path.exists(path):
            os.remove(path)
            removed = True
        check('已删除磁盘上的背景图文件', removed, path)

        st, body = api('GET', f'/project/assets/check/{pid}')
        res2 = data_of(body) or {}
        check('体检报出缺失', res2.get('missing_count', 0) >= 1 and res2.get('healthy') is False,
              f"missing={res2.get('missing_count')} healthy={res2.get('healthy')}")
        check('缺失项包含被删的背景图',
              any(i.get('url') == bg_url for i in res2.get('missing') or []),
              [i.get('url') for i in res2.get('missing') or []][:3])

    # ---------- ⑤ 市场素材引用 + 删除保护 ----------
    st, res_url = upload_png(pid)
    st2, body = api('POST', '/user/resources', json={
        'title': f'第11批-素材-{ts}', 'resource_type': '背景',
        'file_url': res_url or '/static/probe/none.png', 'license_type': 'CC0',
    })
    rid = (data_of(body) or {}).get('resource_id')
    CREATED_RESOURCES.append(rid)
    check('创建市场素材', st2 in (200, 201) and bool(rid), f'{st2} {str(body)[:120]}')

    if rid:
        st, body = api('POST', f'/user/resources/{rid}/reference', json={'project_id': pid})
        check('引用素材到项目', st == 200 and (data_of(body) or {}).get('reference_count', 0) >= 1,
              f'{st} {str(body)[:120]}')

        st, body = api('GET', f'/project/assets/check/{pid}')
        refs = (data_of(body) or {}).get('market_references') or []
        hit = next((r for r in refs if r.get('resource_id') == rid), {})
        check('体检列出市场素材引用', bool(hit) and hit.get('reference_count', 0) >= 1, hit)
        check('市场素材文件状态为 ok', hit.get('status') == 'ok', hit.get('status'))

        st, body = api('DELETE', f'/user/resources/{rid}')
        check('仍被引用时删除素材返回 409', st == 409, f'{st} {str(body)[:120]}')
        check('409 响应带引用数', (data_of(body) or {}).get('reference_count', 0) >= 1,
              data_of(body))

        st, body = api('DELETE', f'/user/resources/{rid}/reference?project_id={pid}')
        check('取消引用', st == 200, f'{st}')
        st, body = api('DELETE', f'/user/resources/{rid}')
        check('取消引用后可删除素材', st == 200, f'{st} {str(body)[:120]}')
        if st == 200:
            CREATED_RESOURCES.remove(rid)

    # ---------- ⑥ 权限 ----------
    OTHER_USER = f'audit_other_asset_{ts}'
    api('POST', '/user/register', json={
        'email': f'{OTHER_USER}@t.com', 'password': 'Test123456', 'username': OTHER_USER,
    })
    st, body = api('POST', '/user/login', json={'username': OTHER_USER, 'password': 'Test123456'})
    if st == 200:
        others = requests.Session()
        others.trust_env = False
        tok = body['access_token']
        pl2 = tok.split('.')[1]
        pl2 += '=' * (-len(pl2) % 4)
        ouid = json.loads(base64.urlsafe_b64decode(pl2))['identity']
        oh = {'Authorization': 'Bearer ' + tok, 'X-User-Id': str(ouid)}
        r = others.get(BASE + f'/project/assets/check/{pid}', headers=oh, timeout=10)
        check('他人读私有项目素材体检被拒', r.status_code == 404, r.status_code)
        r = others.get(BASE + f'/project/directives/{pid}', headers=oh, timeout=10)
        check('他人读私有项目演出指令被拒', r.status_code == 404, r.status_code)
    else:
        check('创建临时他人账号', False, f'{st} {str(body)[:120]}')

    return finish()


if __name__ == '__main__':
    try:
        code = main()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f'\n脚本异常：{e}')
        code = 1
    finally:
        cleanup()
    sys.exit(code)
