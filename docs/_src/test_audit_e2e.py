# -*- coding: utf-8 -*-
"""
运行时审计：把 Bug 清单里的条目逐条打到真实后端（127.0.0.1:8088）。
只读 + 自建自删测试数据，不改动既有项目。
"""
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

S = requests.Session()
S.trust_env = False

RESULTS = []


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


def main():
    # ---------- 0. 登录 ----------
    st, body = api('POST', '/user/login', json={'username': USERNAME, 'password': PASSWORD})
    check('登录', st == 200 and 'access_token' in body, f'{st} {str(body)[:120]}')
    if st != 200:
        return finish()
    token = body['access_token']
    S.headers.update({'Authorization': 'Bearer ' + token})

    # 前端同样是从 JWT payload 里解 identity 当 X-User-Id（utils/request.ts）
    import base64
    payload = token.split('.')[1]
    payload += '=' * (-len(payload) % 4)
    uid = json.loads(base64.urlsafe_b64decode(payload))['identity']
    S.headers.update({'X-User-Id': str(uid)})

    st, me = api('GET', '/user/profile')
    check('读取个人信息', st == 200, f'{st} {str(me)[:100]}')
    check('JWT identity 可用作用户ID', bool(uid), uid)
    if not uid:
        return finish()

    created_projects = []

    # ---------- 1. 项目创建 / template_type ----------
    st, body = api('POST', '/project/project', json={
        'title': f'审计-模板-{int(time.time())}', 'genre': '科幻',
        'template_type': '分支叙事',
    })
    ok = st in (200, 201) and (body.get('data') or {}).get('template_type') == '分支叙事'
    check('P1-1 创建项目 template_type 落库', ok, f'{st} {str(body)[:160]}')
    pid = (body.get('data') or {}).get('project_id')
    if pid:
        created_projects.append(pid)

    if pid:
        # ---------- 2. is_public 双向切换 ----------
        st, body = api('PUT', f'/project/project/{pid}', json={'is_public': True})
        check('P0-4 项目可设为公开', st == 200 and (body.get('data') or {}).get('is_public') is True,
              f'{st} {str(body)[:160]}')
        st, body = api('PUT', f'/project/project/{pid}', json={'is_public': False})
        check('P0-4 项目可取消公开', st == 200 and (body.get('data') or {}).get('is_public') is False,
              f'{st} {str(body)[:160]}')

        # ---------- 3. 局部更新不丢字段 ----------
        st, body = api('PUT', f'/project/project/{pid}', json={'title': '审计-改名'})
        d = body.get('data') or {}
        check('P0-5 局部更新返回完整对象', st == 200 and d.get('genre') == '科幻'
              and d.get('template_type') == '分支叙事' and 'created_at' in d,
              f'{st} {json.dumps(d, ensure_ascii=False)[:200]}')

    # ---------- 4. 角色 + 立绘默认位 ----------
    cid = None
    if pid:
        st, body = api('POST', '/project/create_character', json={
            'project_id': pid, 'name': '审计角色', 'age': 20,
            'description': '审计用', 'is_main': True,
        })
        check('创建角色', st == 200, f'{st} {str(body)[:120]}')
        st, chars = api('GET', f'/project/characters/{pid}')
        arr = chars.get('data') or []
        check('P0-2 角色列表可用', st == 200 and len(arr) >= 1, f'{st} 数量={len(arr)}')
        if arr:
            cid = arr[0]['character_id']
            check('角色列表含 avatar_url 字段', 'avatar_url' in arr[0], list(arr[0].keys()))

    def png_bytes(color):
        from PIL import Image
        buf = io.BytesIO()
        Image.new('RGB', (32, 32), color).save(buf, format='PNG')
        buf.seek(0)
        return buf

    if pid and cid:
        a1 = api('POST', '/project/upload_avatar',
                 files={'file': ('a1.png', png_bytes((255, 0, 0)), 'image/png')},
                 data={'project_id': pid, 'character_id': cid, 'avatar_type': '正常', 'is_default': 'true'})
        a2 = api('POST', '/project/upload_avatar',
                 files={'file': ('a2.png', png_bytes((0, 255, 0)), 'image/png')},
                 data={'project_id': pid, 'character_id': cid, 'avatar_type': '高兴', 'is_default': 'true'})
        check('上传两张默认立绘', a1[0] == 200 and a2[0] == 200, f'{a1[0]} {a2[0]}')
        st, av = api('GET', f'/project/avatars/{cid}')
        lst = av.get('data') or []
        defaults = [x for x in lst if x.get('is_default')]
        check('P3-8 同一角色只保留一张默认立绘', len(defaults) == 1,
              f'默认数={len(defaults)} / 总={len(lst)}')

    # ---------- 5. 场景局部更新不覆盖图片/音乐 ----------
    sid = None
    if pid:
        st, body = api('POST', '/project/scenes', json={
            'project_id': pid, 'title': '场景A', 'order_num': 1,
            'background_url': '/static/project/1/image/bg.png',
            'music_url': '/static/project/1/audio/bgm.mp3',
            'description': 'd',
        })
        sid = (body.get('data') or {}).get('scene_id')
        check('创建场景', st in (200, 201) and sid, f'{st} {str(body)[:120]}')
        if sid:
            st, body = api('PUT', f'/project/scenes/{sid}', json={'order_num': 5})
            d = body.get('data') or {}
            check('P0-3 拖拽排序不清空背景图/音乐',
                  st == 200 and d.get('background_url') and d.get('music_url'),
                  f'{st} bg={d.get("background_url")} music={d.get("music_url")}')

    # ---------- 6. 对话 CRUD + 排序 ----------
    if pid and sid:
        # 模板脚手架会预置占位对话，所以先取基线，再断言「新增 2 条 = 基线 + 2」
        st, body = api('GET', f'/project/dialogue_count/{pid}')
        base_count = (body or {}).get('length') or 0
        ids = []
        for i, t in enumerate(['第一句', '第二句']):
            st, body = api('POST', '/project/dialogues', json={
                'project_id': pid, 'scene_id': sid, 'content_type': '对话',
                'content_text': t, 'order_num': i + 1, 'character_id': cid,
            })
            d = body.get('data') or {}
            if d.get('content_id'):
                ids.append(d['content_id'])
        check('创建对话', len(ids) == 2, f'{len(ids)} 条')
        if len(ids) == 2:
            st, body = api('POST', f'/project/dialogues/reorder/{sid}',
                           json={'ordered_content_ids': list(reversed(ids))})
            order = [x['content_id'] for x in (body.get('data') or [])]
            check('对话重排序', st == 200 and order[:2] == list(reversed(ids)), f'{st} {order}')
        st, body = api('GET', f'/project/dialogue_count/{pid}')
        check('P1-8 对话计数返回 length',
              st == 200 and body.get('length') == base_count + 2,
              f'{st} base={base_count} now={body.get("length")}')

    # ---------- 7. 分支 / 剧情图 ----------
    if pid and sid:
        st, dlg = api('GET', f'/project/dialogues/{sid}')
        dl = dlg.get('data') or []
        if len(dl) >= 2:
            src, tgt = dl[0]['content_id'], dl[1]['content_id']
            st, body = api('POST', f'/project/branches/{pid}', json={
                'source_content_id': src, 'target_content_id': tgt,
                'choice_text': '选项1',
            })
            check('创建分支', st == 200, f'{st} {str(body)[:140]}')
            st, body = api('GET', f'/project/branches/{pid}')
            check('分支列表', st == 200 and (body.get('count') or 0) >= 1, f'{st} count={body.get("count")}')
            st, body = api('GET', f'/project/story_graph/{pid}')
            check('剧情图 + FSM 校验', st == 200 and isinstance((body.get('data') or {}).get('nodes'), list),
                  f'{st} {str(body)[:160]}')
            st, body = api('POST', f'/project/story_graph/{pid}/validate')
            check('FSM 单独校验接口', st == 200, f'{st} {str(body)[:160]}')

    # ---------- 8. AI 健康检查 ----------
    st, body = api('GET', '/ai/health')
    check('AI health', st == 200, f'{st} {str(body)[:200]}')

    # ---------- 9. P1-6 空违禁词不污染文本 ----------
    # Redis/Celery 可用时后端走异步（202 + 轮询 task），未启用时同步返回 200；两种都兼容
    st, body = api('POST', '/ai/generate/text', json={
        'prompt': '用一句话描写雨夜', 'length': 60, 'forbidden_words': '',
        'user_id': uid,
    }, timeout=180)
    if st == 202 and body.get('task_id'):
        tid = body['task_id']
        deadline = time.time() + 180
        while time.time() < deadline:
            pst, pbody = api('GET', f'/ai/task/{tid}')
            if pst == 200 and pbody.get('ready'):
                st = 200
                body = {'data': pbody.get('result') or {}}
                break
            time.sleep(2)
    txt = ''
    if st == 200:
        d = body.get('data') or body
        txt = d.get('generated_text') or d.get('text') or ''
    check('P1-6 空违禁词不产生 [已过滤] 污染',
          st == 200 and txt and '[已过滤]' not in txt,
          f'{st} len={len(txt)} preview={txt[:60]!r}')

    # ---------- 10. 用户模型 / 统计 / 市场 ----------
    st, body = api('GET', '/user/models')
    check('P1-2 模型列表结构', st == 200 and isinstance((body.get('data') or {}).get('models'), list),
          f'{st} {str(body)[:140]}')
    st, body = api('GET', '/user/statistics')
    check('创作统计', st == 200, f'{st} {str(body)[:140]}')
    st, body = api('GET', '/project/projectAll')
    check('公开项目列表', st == 200, f'{st}')
    st, body = api('GET', '/user/resources')
    check('资源市场列表', st == 200, f'{st} {str(body)[:120]}')

    # ---------- 11. 鉴权：未登录 / 伪造身份都应被拒 ----------
    anon = requests.Session()
    anon.trust_env = False
    r = anon.get(BASE + '/project/projects', timeout=10)
    check('未登录访问项目列表被拒', r.status_code == 401, r.status_code)
    r = anon.get(BASE + '/project/projects', headers={'X-User-Id': str(uid)}, timeout=10)
    check('仅伪造 X-User-Id 不再生效', r.status_code == 401, r.status_code)

    # ---------- 12. 归属校验：另一个用户不能读写本项目 ----------
    other = f'audit_other_{int(time.time())}'
    st, _ = api('POST', '/user/register', json={
        'email': f'{other}@t.com', 'password': 'Test123456', 'username': other,
    })
    st, body = api('POST', '/user/login', json={'username': other, 'password': 'Test123456'})
    if st == 200 and pid:
        other_tok = body['access_token']
        import base64 as _b64
        pl = other_tok.split('.')[1]
        pl += '=' * (-len(pl) % 4)
        other_uid = json.loads(_b64.urlsafe_b64decode(pl))['identity']
        oh = {'Authorization': 'Bearer ' + other_tok, 'X-User-Id': str(other_uid)}
        r = requests.get(BASE + f'/project/project/{pid}', headers=oh, timeout=10)
        check('他人无法读取本项目', r.status_code == 404, r.status_code)
        if sid:
            r = requests.put(BASE + f'/project/scenes/{sid}',
                             headers=oh, json={'title': 'hacked'}, timeout=10)
            check('他人无法修改本项目场景', r.status_code == 404, r.status_code)
        r = requests.get(BASE + f'/project/story_graph/{pid}', headers=oh, timeout=10)
        check('他人无法读取本项目剧情图', r.status_code == 404, r.status_code)

        # 公开项目应允许他人只读预览（/view/:projectId）
        api('PUT', f'/project/project/{pid}', json={'is_public': True})
        r = requests.get(BASE + f'/project/scenes/{pid}', headers=oh, timeout=10)
        check('公开项目允许他人预览场景', r.status_code == 200, r.status_code)
        r = requests.get(BASE + f'/project/characters/{pid}', headers=oh, timeout=10)
        check('公开项目允许他人预览角色', r.status_code == 200, r.status_code)
        r = requests.get(BASE + f'/project/project/{pid}', headers=oh, timeout=10)
        check('公开项目允许他人查看详情', r.status_code == 200, r.status_code)
        api('PUT', f'/project/project/{pid}', json={'is_public': False})

    # ---------- 13. 有分支的项目必须能删掉（branch_paths 外键回归） ----------
    if pid:
        st, body = api('DELETE', f'/project/project/{pid}')
        check('有分支的项目可正常删除', st == 200, f'{st} {str(body)[:120]}')
        if st == 200:
            created_projects.remove(pid)

    # ---------- 清理 ----------
    for p in created_projects:
        api('DELETE', f'/project/project/{p}')

    # 后端没有「删除用户」接口，本次注册的临时用户只能直连数据库清掉；
    # 凭据优先取环境变量，其次读 back/.env（与后端同一份配置）。
    # 失败（如未装 pymysql / 无库权限）只提示，不影响审计结论。
    if other:
        try:
            import pymysql

            env = {}
            try:
                from dotenv import dotenv_values
                _env_path = os.path.join(
                    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                    'back', '.env')
                env = dotenv_values(_env_path) or {}
            except Exception:
                pass

            def cfg(key, default=''):
                return os.environ.get(key) or env.get(key) or default

            conn = pymysql.connect(
                host=cfg('DB_HOST', '127.0.0.1'),
                port=int(cfg('DB_PORT', '3306')),
                user=cfg('DB_USER', 'root'),
                password=cfg('DB_PASSWORD'),
                database=cfg('DB_NAME', 'aigc'),
                charset='utf8mb4',
            )
            with conn.cursor() as cur:
                cur.execute('DELETE FROM users WHERE username = %s', (other,))
                deleted = cur.rowcount
            conn.commit()
            conn.close()
            print(f'清理临时用户 {other} -> {deleted}')
        except Exception as e:
            print(f'临时用户 {other} 未能清理（{type(e).__name__}: {e}）')

    return finish()


def finish():
    ok = sum(1 for _, c, _ in RESULTS if c)
    bad = [n for n, c, _ in RESULTS if not c]
    print('\n===== 汇总 =====')
    print(f'通过 {ok} | 失败 {len(bad)} | 合计 {len(RESULTS)}')
    if bad:
        print('失败项：' + '；'.join(bad))
    return 0 if not bad else 1


if __name__ == '__main__':
    sys.exit(main())
