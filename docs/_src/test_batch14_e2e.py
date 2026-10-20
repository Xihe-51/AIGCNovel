# -*- coding: utf-8 -*-
"""
第 9 批（P1-4）回归：CG 图鉴。

覆盖：
  ① 登记校验：缺标题 / 缺图片 / 绑定他人结局 / 引用非 CG 素材 都被拒
  ② 作者 CRUD：新增、列表、改名换图、排序、删除
  ③ 解锁语义：未绑定结局 → 初始可见；绑定结局 → 该结局解锁后才可见
  ④ 鉴赏页：总数 / 已解锁数 / 未解锁不下发 image_url（防绕过）
  ⑤ 结局解锁联动：POST 结局 unlock 后鉴赏页立刻解锁对应 CG
  ⑥ 素材引用联动：引用「CG」素材 → 引用计数 +1；删除 CG → 计数还原
  ⑦ 权限：他人不可读作者 CG 列表、不可写入；公开项目他人可读鉴赏页
  ⑧ 级联：删除绑定结局后 CG 退化为初始可见；删除项目不残留

运行：d:\\AIGCNovel\\back\\.venv\\Scripts\\python.exe docs/_src/test_batch14_e2e.py
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
CREATED_RESOURCES = []
OTHER_USER = None

IMG_A = '/static/market/cg-fixture-a.png'
IMG_B = '/static/market/cg-fixture-b.png'


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
    for r in CREATED_RESOURCES:
        api('DELETE', f'/user/resources/{r}')
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

    # ---------- 夹具：项目 + 两条对话 + 结局 ----------
    ts = int(time.time())
    st, body = api('POST', '/project/project', json={
        'title': f'第9批-CG-{ts}', 'genre': '恋爱', 'template_type': '分支叙事',
    })
    pid = (body.get('data') or {}).get('project_id')
    check('创建项目', st in (200, 201) and pid, f'{st} {str(body)[:120]}')
    if not pid:
        return finish()
    CREATED_PROJECTS.append(pid)

    st, body = api('GET', f'/project/scenes/{pid}')
    scenes = body.get('data') or []
    sid = scenes[0]['scene_id'] if scenes else None
    check('项目有场景', bool(sid), f'场景数={len(scenes)}')
    if not sid:
        return finish()

    content_ids = []
    for i, text in enumerate(['CG 夹具第一句', 'CG 夹具第二句']):
        st, body = api('POST', '/project/dialogues', json={
            'project_id': pid, 'scene_id': sid, 'content_type': '对话',
            'content_text': text, 'order_num': i + 1,
        })
        content_ids.append((body.get('data') or {}).get('content_id'))
    check('创建两条对话', all(content_ids), content_ids)

    st, body = api('POST', f'/project/endings/{pid}', json={
        'title': 'CG 夹具结局', 'description': '用于 CG 解锁测试',
        'content_id': content_ids[1], 'conditions': [],
    })
    ending_id = (body.get('data') or {}).get('ending_id')
    check('创建结局夹具', st == 200 and ending_id, f'{st} {str(body)[:120]}')

    # ---------- ① 登记校验 ----------
    st, body = api('POST', f'/project/cgs/{pid}', json={'image_url': IMG_A})
    check('缺标题被拒', st == 400, f'{st} {str(body)[:100]}')

    st, body = api('POST', f'/project/cgs/{pid}', json={'title': '没图', 'image_url': '  '})
    check('缺图片被拒', st == 400, f'{st} {str(body)[:100]}')

    st, body = api('POST', f'/project/cgs/{pid}',
                   json={'title': '绑定结局', 'image_url': IMG_B, 'unlock_ending_id': 999999})
    check('绑定不存在的结局被拒', st == 400, f'{st} {str(body)[:100]}')

    # 非 CG 类型素材
    st, body = api('POST', '/user/resources', json={
        'title': f'第9批-非CG素材-{ts}', 'description': '夹具',
        'resource_type': '角色', 'file_url': IMG_A, 'license_type': 'CC0',
    })
    other_res_id = (body.get('data') or {}).get('resource_id') or (body.get('resources') or {}).get('resource_id')
    if not other_res_id:
        other_res_id = (body.get('data') or {}).get('resource_id')
    if other_res_id:
        CREATED_RESOURCES.append(other_res_id)
    check('创建非 CG 素材夹具', bool(other_res_id), f'{st} {str(body)[:140]}')
    if other_res_id:
        st, body = api('POST', f'/project/cgs/{pid}',
                       json={'title': '错类型', 'resource_id': other_res_id})
        check('引用非 CG 素材被拒', st == 400, f'{st} {str(body)[:100]}')

    # ---------- ② 正常登记 ----------
    st, body = api('POST', f'/project/cgs/{pid}', json={
        'title': '初始 CG', 'description': '开场就解锁', 'image_url': IMG_A,
    })
    cg_free = (body.get('data') or {}).get('cg_id')
    check('新增初始可见 CG', st == 201 and cg_free, f'{st} {str(body)[:120]}')

    st, body = api('POST', f'/project/cgs/{pid}', json={
        'title': '结局 CG', 'description': '达成结局后解锁',
        'image_url': IMG_B, 'unlock_ending_id': ending_id, 'order_num': 2,
    })
    cg_locked = (body.get('data') or {}).get('cg_id')
    check('新增绑定结局的 CG', st == 201 and cg_locked, f'{st} {str(body)[:120]}')

    st, body = api('GET', f'/project/cgs/{pid}')
    rows = body.get('data') or []
    check('作者列表返回 2 条', st == 200 and len(rows) == 2, f'{st} 数量={len(rows)}')
    row_locked = next((r for r in rows if r.get('cg_id') == cg_locked), {})
    check('列表回显绑定结局标题', row_locked.get('unlock_ending_title') == 'CG 夹具结局',
          row_locked.get('unlock_ending_title'))
    check('未解锁标记正确',
          row_locked.get('unlocked') is False
          and next((r.get('unlocked') for r in rows if r.get('cg_id') == cg_free), None) is True,
          f'locks={[r.get("unlocked") for r in rows]}')

    # ---------- ④ 鉴赏页（未解锁前） ----------
    st, body = api('GET', f'/project/gallery/{pid}')
    data = body.get('data') or {}
    items = data.get('items') or []
    check('鉴赏页可读', st == 200 and data.get('total') == 2, f'{st} {str(body)[:160]}')
    check('鉴赏页解锁计数 = 1', data.get('unlocked_count') == 1, data.get('unlocked_count'))
    locked_item = next((i for i in items if i.get('cg_id') == cg_locked), {})
    check('未解锁条目不下发 image_url', locked_item.get('image_url') is None,
          locked_item.get('image_url'))
    check('未解锁条目带解锁提示', locked_item.get('unlock_ending_title') == 'CG 夹具结局',
          locked_item.get('unlock_ending_title'))
    free_item = next((i for i in items if i.get('cg_id') == cg_free), {})
    check('初始条目下发 image_url', free_item.get('image_url') == IMG_A, free_item.get('image_url'))

    # ---------- ⑤ 结局解锁联动 ----------
    st, body = api('POST', f'/project/endings/{pid}/{ending_id}/unlock')
    check('记录结局解锁', st == 200, f'{st} {str(body)[:100]}')

    st, body = api('GET', f'/project/gallery/{pid}')
    data = body.get('data') or {}
    check('解锁结局后鉴赏计数 = 2', data.get('unlocked_count') == 2, data.get('unlocked_count'))
    unlocked_item = next((i for i in (data.get('items') or []) if i.get('cg_id') == cg_locked), {})
    check('解锁后下发 image_url', unlocked_item.get('image_url') == IMG_B,
          unlocked_item.get('image_url'))

    # ---------- ② 更新 ----------
    st, body = api('PUT', f'/project/cgs/{pid}/{cg_free}',
                   json={'title': '初始 CG 改名', 'image_url': IMG_B, 'order_num': 9})
    check('改名换图成功', st == 200 and (body.get('data') or {}).get('title') == '初始 CG 改名'
          and (body.get('data') or {}).get('image_url') == IMG_B,
          f'{st} {str(body)[:140]}')

    st, body = api('PUT', f'/project/cgs/{pid}/{cg_locked}', json={'unlock_ending_id': None})
    d = body.get('data') or {}
    check('解绑结局后变为初始可见', st == 200 and d.get('unlock_ending_id') is None
          and d.get('unlocked') is True, f'{st} {str(body)[:140]}')

    st, body = api('PUT', f'/project/cgs/{pid}/{cg_locked}',
                   json={'unlock_ending_id': ending_id, 'order_num': 1})
    d = body.get('data') or {}
    check('重新绑定结局并改排序', st == 200 and d.get('unlock_ending_id') == ending_id
          and d.get('order_num') == 1, f'{st} {str(body)[:140]}')

    st, body = api('GET', f'/project/cgs/{pid}')
    rows = body.get('data') or []
    check('排序生效（order_num=1 排在前）',
          bool(rows) and rows[0].get('cg_id') == cg_locked,
          [r.get('cg_id') for r in rows])

    # ---------- ⑥ 素材引用联动 ----------
    st, body = api('POST', '/user/resources', json={
        'title': f'第9批-CG素材-{ts}', 'description': '夹具',
        'resource_type': 'CG', 'file_url': IMG_B, 'license_type': 'CC0',
    })
    res_id = (body.get('data') or {}).get('resource_id')
    if res_id:
        CREATED_RESOURCES.append(res_id)
    check('创建 CG 素材夹具', bool(res_id), f'{st} {str(body)[:140]}')

    if res_id:
        st, body = api('GET', f'/user/resources/{res_id}')
        base_ref = (body.get('data') or {}).get('reference_count', 0)

        st, body = api('POST', f'/project/cgs/{pid}', json={
            'title': '引用素材的 CG', 'resource_id': res_id,
        })
        cg_res = (body.get('data') or {}).get('cg_id')
        check('引用市场素材登记 CG', st == 201 and cg_res, f'{st} {str(body)[:140]}')
        check('素材图片地址自动带出',
              (body.get('data') or {}).get('image_url') == IMG_B,
              (body.get('data') or {}).get('image_url'))

        st, body = api('GET', f'/user/resources/{res_id}')
        after_ref = (body.get('data') or {}).get('reference_count', 0)
        check('素材引用计数 +1', after_ref == base_ref + 1, f'{base_ref} → {after_ref}')

        st, body = api('DELETE', f'/project/cgs/{pid}/{cg_res}')
        check('删除引用素材的 CG', st == 200, f'{st}')

        st, body = api('GET', f'/user/resources/{res_id}')
        back_ref = (body.get('data') or {}).get('reference_count', 0)
        check('删除 CG 后引用计数还原', back_ref == base_ref, f'{after_ref} → {back_ref}')

    # ---------- ⑦ 权限 ----------
    st, body = api('GET', '/project/cgs/7')
    check('他人项目 CG 列表被拒', st == 404, f'{st} {str(body)[:100]}')
    st, body = api('POST', '/project/cgs/7', json={'title': 'x', 'image_url': IMG_A})
    check('他人项目登记 CG 被拒', st == 404, f'{st}')

    OTHER_USER = f'audit_other_cg_{ts}'
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

        r = others.get(BASE + f'/project/gallery/{pid}', headers=oh, timeout=10)
        check('他人读私有项目鉴赏被拒', r.status_code == 404, r.status_code)
        r = others.get(BASE + f'/project/cgs/{pid}', headers=oh, timeout=10)
        check('他人读私有项目 CG 列表被拒', r.status_code == 404, r.status_code)

        api('PUT', f'/project/project/{pid}', json={'is_public': True})
        r = others.get(BASE + f'/project/gallery/{pid}', headers=oh, timeout=10)
        try:
            odata = (r.json() or {}).get('data') or {}
        except Exception:
            odata = {}
        check('公开项目他人可读鉴赏页', r.status_code == 200 and odata.get('total') == 2,
              f'{r.status_code} {str(odata)[:140]}')
        oitems = odata.get('items') or []
        o_locked = next((i for i in oitems if i.get('cg_id') == cg_locked), {})
        check('他人视角按自己的解锁状态判定（未解锁不下发图）',
              o_locked.get('unlocked') is False and o_locked.get('image_url') is None,
              f"unlocked={o_locked.get('unlocked')} url={o_locked.get('image_url')}")
        o_free = next((i for i in oitems if i.get('cg_id') == cg_free), {})
        check('他人视角初始 CG 可见', o_free.get('unlocked') is True
              and bool(o_free.get('image_url')), o_free.get('image_url'))
        r = others.post(BASE + f'/project/cgs/{pid}',
                        headers=oh, json={'title': '越权', 'image_url': IMG_A}, timeout=10)
        check('他人无法写入公开项目 CG', r.status_code == 404, r.status_code)
        api('PUT', f'/project/project/{pid}', json={'is_public': False})
    else:
        check('创建临时他人账号', False, f'{st} {str(body)[:120]}')

    # ---------- ⑧ 级联：删除绑定结局 → CG 退化为初始可见 ----------
    st, body = api('DELETE', f'/project/endings/{pid}/{ending_id}')
    check('删除绑定结局', st == 200, f'{st}')
    st, body = api('GET', f'/project/cgs/{pid}')
    rows = body.get('data') or []
    rebind = next((r for r in rows if r.get('cg_id') == cg_locked), {})
    check('删除结局后 CG 退化为初始可见',
          rebind.get('unlock_ending_id') is None and rebind.get('unlocked') is True,
          f"ending={rebind.get('unlock_ending_id')} unlocked={rebind.get('unlocked')}")

    # ---------- ② 删除 ----------
    st, body = api('DELETE', f'/project/cgs/{pid}/{cg_free}')
    check('删除 CG', st == 200, f'{st}')
    st, body = api('GET', f'/project/gallery/{pid}')
    check('删除后鉴赏总数减 1', (body.get('data') or {}).get('total') == 1,
          (body.get('data') or {}).get('total'))

    # ---------- 级联：删项目不残留 ----------
    st, body = api('DELETE', f'/project/project/{pid}')
    check('删除项目成功', st == 200, f'{st} {str(body)[:120]}')
    if st == 200:
        CREATED_PROJECTS.remove(pid)

    cleanup()
    return finish()


if __name__ == '__main__':
    sys.exit(main())
