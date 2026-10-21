# -*- coding: utf-8 -*-
"""
第 10 批（P1-5）回归：节点级剧情图（content-level 节点 + 拖拽连线 + 条件编辑）。

前端 StoryGraphEditor.vue 依赖的后端契约：
  ① 剧情图是「content-level」：story_graph.nodes 与 script_contents 一一对应
     （而不是旧的按场景聚合），每个节点带 content_type / order_num / scene_id。
  ② 拖拽连线 = branch_paths 写入：单条 create / update / delete 与批量覆盖保存。
  ③ 条件编辑：branch_paths.conditions = {variable, op, value}，必须属于项目变量；
     留空 = 无条件；非法 op / 未知变量 / 自环 / 越界节点 / 重复边都要被拒。
  ④ 校验联动：选择节点未配分支 → CHOICE_WITHOUT_BRANCH；配环 → CYCLE。
  ⑤ 权限：他人不可读 / 不可写本项目的剧情图与分支。

运行（cwd=d:\\AIGCNovel）：
  back\\.venv\\Scripts\\python.exe -X utf8 docs/_src/test_batch15_e2e.py
"""
import base64
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

S = requests.Session()
S.trust_env = False

RESULTS = []
CREATED_PROJECTS = []
OTHER_USER = None


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


def finish():
    ok = sum(1 for _, c, _ in RESULTS if c)
    bad = [n for n, c, _ in RESULTS if not c]
    print('\n===== 汇总 =====')
    print(f'通过 {ok} | 失败 {len(bad)} | 合计 {len(RESULTS)}')
    if bad:
        print('失败项：' + '；'.join(bad))
    return 0 if not bad else 1


def cleanup():
    for p in CREATED_PROJECTS:
        api('DELETE', f'/project/project/{p}')
    if OTHER_USER:
        try:
            import pymysql

            env = {}
            try:
                from dotenv import dotenv_values
                env = dotenv_values(os.path.join(
                    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                    'back', '.env')) or {}
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


def codes(report):
    return [e.get('code') for e in (report or {}).get('errors', [])]


def warn_codes(report):
    return [w.get('code') for w in (report or {}).get('warnings', [])]


def main():
    global OTHER_USER

    # ---------- 登录 ----------
    st, body = api('POST', '/user/login', json={'username': USERNAME, 'password': PASSWORD})
    check('登录', st == 200 and 'access_token' in body, f'{st}')
    if st != 200:
        return finish()
    token = body['access_token']
    S.headers.update({'Authorization': 'Bearer ' + token})
    payload = token.split('.')[1]
    payload += '=' * (-len(payload) % 4)
    uid = json.loads(base64.urlsafe_b64decode(payload))['identity']
    S.headers.update({'X-User-Id': str(uid)})

    # ---------- 夹具：项目 + 场景 + 5 个 content-level 节点 + 变量 ----------
    ts = int(time.time())
    st, body = api('POST', '/project/project', json={
        'title': f'第10批-节点图-{ts}', 'genre': '恋爱', 'template_type': '分支叙事',
    })
    pid = (body.get('data') or {}).get('project_id')
    check('创建项目', st in (200, 201) and pid, f'{st} {str(body)[:120]}')
    if not pid:
        return finish()
    CREATED_PROJECTS.append(pid)

    st, body = api('GET', f'/project/scenes/{pid}')
    scenes = body.get('data') or []
    sid = scenes[0]['scene_id'] if scenes else None
    check('项目自带场景', bool(sid), f'场景数={len(scenes)}')
    if not sid:
        return finish()

    # 第 11 批起模板脚手架会预置「场景 + 占位对话 + 占位分支」；
    # 本脚本要自己造 5 个 content-level 节点，先把模板骨架清空（分支先删，再删节点）。
    st, body = api('GET', f'/project/branches/{pid}')
    for b in (body.get('data') or []):
        api('DELETE', f"/project/branches/detail/{b.get('path_id')}")
    cleared = 0
    for s in scenes:
        st2, dl = api('GET', f"/project/dialogues/{s['scene_id']}")
        for c in (dl.get('data') or []):
            api('DELETE', f"/project/dialogues/{c.get('content_id')}")
            cleared += 1
    check('清空模板占位节点', cleared >= 0, f'删除 {cleared} 条占位对话')
    st, body = api('GET', f'/project/dialogue_count/{pid}')
    check('清空后项目对话数为 0', (body or {}).get('length') == 0, body)

    # 节点顺序：1 对话 → 2 选择(C1) → 3 对话 → 4 选择(C2) → 5 对话
    spec = [('对话', '开场白'), ('选择', '要告白吗？'), ('对话', '路过'), ('选择', '结局选择'), ('对话', '收尾')]
    cid = {}
    for i, (ctype, text) in enumerate(spec):
        st, body = api('POST', '/project/dialogues', json={
            'project_id': pid, 'scene_id': sid, 'content_type': ctype,
            'content_text': text, 'order_num': i + 1,
        })
        cid[i + 1] = (body.get('data') or {}).get('content_id')
    check('创建 5 个 content-level 节点', all(cid.values()) and st in (200, 201), cid)

    st, body = api('POST', f'/project/variables/{pid}', json={
        'name': 'affection', 'label': '好感度', 'initial_value': 0,
    })
    if st in (200, 201):
        check('创建变量 affection', True, f'{st}')
    else:
        # 分支叙事模板已预置 affection（唯一约束 project_id+name），直接复用
        st2, vb = api('GET', f'/project/variables/{pid}')
        reused = [v for v in (vb.get('data') or []) if v.get('name') == 'affection']
        check('创建变量 affection（模板已预置则复用）', bool(reused),
              f'{st} {str(body)[:80]}')

    # ---------- ① content-level 剧情图 ----------
    st, body = api('GET', f'/project/story_graph/{pid}')
    data = body.get('data') or {}
    nodes = data.get('nodes') or []
    stats = data.get('stats') or {}
    check('story_graph 可读', st == 200 and bool(data), f'{st}')
    check('节点数是 content-level（=5，而非按场景聚合的 1）',
          stats.get('node_count') == 5 and len(nodes) == 5,
          f"node_count={stats.get('node_count')} len={len(nodes)}")
    check('每个节点带 content_type / order_num / scene_id',
          all(n.get('content_type') and n.get('order_num') and n.get('scene_id') == sid for n in nodes),
          [(n.get('content_id'), n.get('content_type')) for n in nodes])
    check('节点 id 与创建的节点一致',
          {n.get('content_id') for n in nodes} == set(cid.values()),
          sorted(n.get('content_id') for n in nodes))
    check('初始无分支边', stats.get('edge_count') == 0 and not data.get('edges'),
          f"edge_count={stats.get('edge_count')}")

    # ---------- ④ 校验：选择节点漏配分支 ----------
    rep = data.get('validation') or {}
    check('返回 FSM 校验结果', bool(rep.get('summary')) and 'errors' in rep, str(rep.get('summary'))[:120])
    check('主入口为第 1 个节点', rep.get('primary_start') == cid[1], rep.get('primary_start'))
    check('两个选择节点都报 CHOICE_WITHOUT_BRANCH',
          codes(rep).count('CHOICE_WITHOUT_BRANCH') == 2, codes(rep))

    st, body = api('POST', f'/project/story_graph/{pid}/validate')
    rep2 = body.get('data') or {}
    check('单独校验接口可用', st == 200 and bool(rep2.get('summary')), f'{st}')

    # ---------- ②+③ 批量保存：带条件的连线 ----------
    st, body = api('POST', f'/project/branches/{pid}/batch', json={
        'replace': True,
        'branches': [
            {'source_content_id': cid[2], 'target_content_id': cid[3],
             'choice_text': '去告白', 'conditions': None},
            {'source_content_id': cid[2], 'target_content_id': cid[5],
             'choice_text': '沉默', 'conditions': {'variable': 'affection', 'op': '>=', 'value': 50}},
        ],
    })
    check('批量保存 2 条分支', st == 200 and (body.get('data') or {}).get('created') == 2,
          f'{st} {str(body)[:160]}')

    st, body = api('GET', f'/project/branches/{pid}')
    rows = body.get('data') or []
    check('分支列表 2 条', st == 200 and len(rows) == 2, len(rows))
    unconditional = next((r for r in rows if not r.get('conditions')), {})
    conditional = next((r for r in rows if r.get('conditions')), {})
    check('无条件分支回显 choice_text', unconditional.get('choice_text') == '去告白'
          and unconditional.get('conditions') is None,
          f"{unconditional.get('choice_text')} {unconditional.get('conditions')}")
    check('条件分支 round-trip 正确',
          conditional.get('conditions') == {'variable': 'affection', 'op': '>=', 'value': 50},
          conditional.get('conditions'))

    # ---------- 校验联动：C1 已配分支 → 不再报错 ----------
    st, body = api('GET', f'/project/story_graph/{pid}')
    rep = (body.get('data') or {}).get('validation') or {}
    bad_ids = [e.get('detail', {}).get('content_id')
               for e in rep.get('errors', []) if e.get('code') == 'CHOICE_WITHOUT_BRANCH']
    check('已配分支的选择节点不再报错（只剩 C2）',
          bad_ids == [cid[4]], f'remaining={bad_ids}')
    check('graph 统计边数 = 2', rep.get('summary', {}).get('edges') == 2,
          rep.get('summary', {}).get('edges'))
    check('显式边屏蔽了 C1 的顺序边（synthetic 计数下降）',
          rep.get('graph', {}).get('synthetic_edges') == 3,
          rep.get('graph'))

    # ---------- ② 整树覆盖保存（编辑器「保存拓扑」语义） ----------
    st, body = api('POST', f'/project/branches/{pid}/batch', json={
        'replace': True,
        'branches': [
            {'source_content_id': cid[2], 'target_content_id': cid[5], 'choice_text': '只留一条'},
        ],
    })
    check('整树覆盖保存', st == 200, f'{st}')
    st, body = api('GET', f'/project/branches/{pid}')
    rows = body.get('data') or []
    check('覆盖后旧边被清除（仅剩 1 条）',
          len(rows) == 1 and rows[0].get('target_content_id') == cid[5],
          [(r.get('source_content_id'), r.get('target_content_id')) for r in rows])

    # ---------- 单条 create / update / delete（拖拽连线的最小单元） ----------
    st, body = api('POST', f'/project/branches/{pid}', json={
        'source_content_id': cid[2], 'target_content_id': cid[3],
        'choice_text': '单条新增', 'conditions': None,
    })
    path_id = (body.get('data') or {}).get('path_id')
    check('单条新建分支', st == 200 and path_id, f'{st} {str(body)[:140]}')

    st, body = api('PUT', f'/project/branches/detail/{path_id}', json={
        'choice_text': '改文案', 'conditions': {'variable': 'affection', 'op': '<', 'value': 10},
    })
    d = body.get('data') or {}
    check('更新分支文案与条件', st == 200 and d.get('choice_text') == '改文案'
          and d.get('conditions') == {'variable': 'affection', 'op': '<', 'value': 10},
          f'{st} {str(d)[:160]}')

    st, body = api('DELETE', f'/project/branches/detail/{path_id}')
    check('删除单条分支', st == 200, f'{st}')
    st, body = api('GET', f'/project/branches/{pid}')
    check('删除后回到 1 条', len(body.get('data') or []) == 1, len(body.get('data') or []))

    # ---------- ③ 非法输入一律被拒 ----------
    st, body = api('POST', f'/project/branches/{pid}/batch', json={
        'branches': [{'source_content_id': cid[2], 'target_content_id': cid[3],
                      'choice_text': 'x', 'conditions': {'variable': 'affection', 'op': '~~', 'value': 1}}],
    })
    check('非法运算符被拒', st == 400, f'{st} {str(body)[:120]}')

    st, body = api('POST', f'/project/branches/{pid}/batch', json={
        'branches': [{'source_content_id': cid[2], 'target_content_id': cid[3],
                      'choice_text': 'x', 'conditions': {'variable': 'not_exist', 'op': '>=', 'value': 1}}],
    })
    check('未知变量被拒', st == 400, f'{st} {str(body)[:120]}')

    st, body = api('POST', f'/project/branches/{pid}/batch', json={
        'branches': [{'source_content_id': cid[2], 'target_content_id': cid[2], 'choice_text': '自环'}],
    })
    check('自环被拒', st == 400, f'{st} {str(body)[:120]}')

    st, body = api('POST', f'/project/branches/{pid}/batch', json={
        'branches': [{'source_content_id': cid[2], 'target_content_id': 999999, 'choice_text': '越界'}],
    })
    check('越界终点被拒', st == 400, f'{st} {str(body)[:120]}')

    st, body = api('POST', f'/project/branches/{pid}/batch', json={
        'branches': [
            {'source_content_id': cid[2], 'target_content_id': cid[3], 'choice_text': 'a'},
            {'source_content_id': cid[2], 'target_content_id': cid[3], 'choice_text': 'b'},
        ],
    })
    check('重复边被拒', st == 400, f'{st} {str(body)[:120]}')

    # ---------- ③ 条件留空 = 无条件 ----------
    st, body = api('POST', f'/project/branches/{pid}/batch', json={
        'replace': True,
        'branches': [
            {'source_content_id': cid[4], 'target_content_id': cid[5], 'choice_text': '无', 'conditions': {}},
        ],
    })
    check('空条件对象 = 无条件', st == 200, f'{st} {str(body)[:120]}')
    st, body = api('GET', f'/project/branches/{pid}')
    rows = body.get('data') or []
    check('空条件落库为 null', bool(rows) and rows[0].get('conditions') is None,
          rows and rows[0].get('conditions'))

    # ---------- ④ 环路检测 ----------
    st, body = api('POST', f'/project/branches/{pid}/batch', json={
        'replace': True,
        'branches': [
            {'source_content_id': cid[2], 'target_content_id': cid[4], 'choice_text': 'A→B'},
            {'source_content_id': cid[4], 'target_content_id': cid[2], 'choice_text': 'B→A'},
        ],
    })
    check('写入回环两条边', st == 200, f'{st} {str(body)[:120]}')
    st, body = api('POST', f'/project/story_graph/{pid}/validate')
    rep = body.get('data') or {}
    check('检测到 CYCLE', 'CYCLE' in codes(rep), codes(rep))
    check('环路时 ok=false 且路径数记 -1',
          rep.get('ok') is False and rep.get('summary', {}).get('path_count') == -1,
          f"ok={rep.get('ok')} paths={rep.get('summary', {}).get('path_count')}")

    # ---------- ⑤ 权限 ----------
    st, body = api('POST', '/project/branches/7/batch', json={'branches': []})
    check('他人项目分支写入被拒', st == 404, f'{st}')

    OTHER_USER = f'audit_other_graph_{ts}'
    api('POST', '/user/register', json={
        'email': f'{OTHER_USER}@t.com', 'password': 'Test123456', 'username': OTHER_USER,
    })
    st, body = api('POST', '/user/login', json={'username': OTHER_USER, 'password': 'Test123456'})
    if st == 200:
        others = requests.Session()
        others.trust_env = False
        tok = body['access_token']
        pl = tok.split('.')[1]
        pl += '=' * (-len(pl) % 4)
        ouid = json.loads(base64.urlsafe_b64decode(pl))['identity']
        oh = {'Authorization': 'Bearer ' + tok, 'X-User-Id': str(ouid)}
        r = others.get(BASE + f'/project/story_graph/{pid}', headers=oh, timeout=10)
        check('临时他人读私有项目剧情图被拒', r.status_code == 404, r.status_code)
        r = others.post(BASE + f'/project/branches/{pid}/batch', headers=oh,
                        json={'branches': [], 'replace': True}, timeout=10)
        check('临时他人写私有项目分支被拒', r.status_code == 404, r.status_code)

        # 公开后：读放行（只读预览），写仍被拒
        api('PUT', f'/project/project/{pid}', json={'is_public': True})
        r = others.get(BASE + f'/project/story_graph/{pid}', headers=oh, timeout=10)
        check('公开项目他人可读剧情图', r.status_code == 200, r.status_code)
        r = others.post(BASE + f'/project/branches/{pid}/batch', headers=oh,
                        json={'branches': [], 'replace': True}, timeout=10)
        check('公开项目他人仍不可写分支', r.status_code == 404, r.status_code)
        api('PUT', f'/project/project/{pid}', json={'is_public': False})
    else:
        check('创建临时他人账号', False, f'{st} {str(body)[:120]}')

    return finish()


if __name__ == '__main__':
    try:
        code = main()
    except Exception as e:
        print(f'\n脚本异常：{e}')
        code = 1
    finally:
        cleanup()
    sys.exit(code)
