# -*- coding: utf-8 -*-
"""
第 8 批（P1-7）回归：模板中心 + 素材引用计数 + 项目 JSON/TXT 导入导出。

覆盖：
  ① 模板中心：GET /project/templates 返回 3 个模板元数据
  ② 模板脚手架：新建项目按模板自动铺场景骨架，且不产生任何 script_contents
  ③ 素材引用计数：引用 / 幂等 / 详情与列表回显 / 取消引用 / 越权拒绝
  ④ 导出：?format=json 完整包、?format=txt 纯文本剧本
  ⑤ 导入：由 JSON 包新建项目，内容数量与原项目一致（含角色/场景/对话/分支）
  ⑥ 导出归属：他人项目不可导出

运行：d:\\AIGCNovel\\back\\.venv\\Scripts\\python.exe docs/_src/test_batch13_e2e.py
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


def check(name, cond, detail=''):
    RESULTS.append((name, bool(cond), detail))
    print(('PASS  ' if cond else 'FAIL  ') + name + (('  | ' + str(detail)) if detail else ''))


def api(method, path, **kw):
    kw.setdefault('timeout', 30)
    r = S.request(method, BASE + path, **kw)
    try:
        body = r.json()
    except Exception:
        body = r.text
    return r, body


def finish():
    ok = sum(1 for _, c, _ in RESULTS if c)
    bad = [n for n, c, _ in RESULTS if not c]
    print('\n===== 汇总 =====')
    print(f'通过 {ok} | 失败 {len(bad)} | 合计 {len(RESULTS)}')
    if bad:
        print('失败项：' + '；'.join(bad))
    return 0 if not bad else 1


def main():
    # ---------- 登录 ----------
    r, body = api('POST', '/user/login', json={'username': USERNAME, 'password': PASSWORD})
    check('登录', r.status_code == 200 and 'access_token' in body, f'{r.status_code}')
    if r.status_code != 200:
        return finish()
    token = body['access_token']
    S.headers.update({'Authorization': 'Bearer ' + token})
    payload = token.split('.')[1]
    payload += '=' * (-len(payload) % 4)
    uid = json.loads(base64.urlsafe_b64decode(payload))['identity']
    S.headers.update({'X-User-Id': str(uid)})

    # ================= ① 模板中心 =================
    r, body = api('GET', '/project/templates')
    tpls = (body.get('data') or []) if r.status_code == 200 else []
    check('模板中心接口可用', r.status_code == 200 and isinstance(tpls, list), f'{r.status_code}')
    types = [t.get('template_type') for t in tpls]
    check('三种模板齐全', set(types) == {'线性叙事', '分支叙事', '开放世界'}, types)
    ok_meta = all(
        t.get('name') and t.get('description') and isinstance(t.get('features'), list)
        and isinstance(t.get('starter_scenes'), list) and isinstance(t.get('recommended_variables'), list)
        for t in tpls
    )
    check('模板元数据字段完整', ok_meta, str(tpls[:1])[:180])

    # ================= ② 模板脚手架 =================
    title = f'第8批-模板-{int(time.time())}'
    r, body = api('POST', '/project/project', json={
        'title': title, 'genre': '科幻', 'template_type': '分支叙事',
    })
    pid = (body.get('data') or {}).get('project_id')
    check('创建项目（分支叙事）', r.status_code in (200, 201) and pid, f'{r.status_code} {str(body)[:120]}')
    if not pid:
        return finish()
    CREATED_PROJECTS.append(pid)

    r, body = api('GET', f'/project/scenes/{pid}')
    scenes = body.get('data') or []
    check('模板自动铺场景骨架', len(scenes) >= 2, f'场景数={len(scenes)}')

    r, body = api('GET', f'/project/dialogue_count/{pid}')
    tpl_count = (body or {}).get('length')
    check('模板预置占位对话（第 11 批新契约）', r.status_code == 200 and (tpl_count or 0) >= 4, f'{body}')

    r, body = api('GET', f'/project/story_graph/{pid}')
    tpl_nodes = (body.get('data') or {}).get('nodes') or []
    tpl_texts = [n.get('content_text') or '' for n in tpl_nodes]
    check('占位对话统一是「【在此填写：…】」',
          bool(tpl_texts) and all(t.startswith('【在此填写') for t in tpl_texts),
          tpl_texts[:2])

    # ================= ③ 素材引用计数 =================
    r, body = api('GET', '/user/resources')
    resources = ((body.get('data') or {}).get('resources') or []) if r.status_code == 200 else []
    check('市场资源列表可用', r.status_code == 200 and len(resources) > 0,
          f'{r.status_code} total={(body.get("data") or {}).get("total")}')
    rid = resources[0]['resource_id'] if resources else None
    base_count = resources[0].get('reference_count') if resources else None
    check('列表返回 reference_count 字段', base_count is not None, f'rid={rid} count={base_count}')

    if rid:
        r, body = api('POST', f'/user/resources/{rid}/reference', json={'project_id': pid})
        d = body.get('data') or {}
        check('引用素材到项目', r.status_code == 200 and d.get('reference_count', 0) >= 1,
              f'{r.status_code} {str(body)[:140]}')

        r, body = api('POST', f'/user/resources/{rid}/reference', json={'project_id': pid})
        d2 = body.get('data') or {}
        check('重复引用幂等（计数不叠加）',
              r.status_code == 200 and d2.get('reference_count') == d.get('reference_count')
              and d2.get('already_referenced') is True,
              f'count={d2.get("reference_count")} already={d2.get("already_referenced")}')

        r, body = api('GET', f'/user/resources/{rid}')
        check('资源详情回显引用数', r.status_code == 200
              and ((body.get('data') or {}).get('reference_count', 0) >= 1),
              f'{r.status_code} count={(body.get("data") or {}).get("reference_count")}')

        # 越权：项目 7 属于 user_id=1，引用应被拒
        r, body = api('POST', f'/user/resources/{rid}/reference', json={'project_id': 7})
        check('引用他人项目被拒', r.status_code == 404, f'{r.status_code} {str(body)[:120]}')

        r, body = api('DELETE', f'/user/resources/{rid}/reference', params={'project_id': pid})
        check('取消引用', r.status_code == 200
              and (body.get('data') or {}).get('reference_count') == base_count,
              f'{r.status_code} count={(body.get("data") or {}).get("reference_count")} base={base_count}')

    # ================= 为导出构造内容 =================
    r, body = api('POST', '/project/create_character', json={
        'project_id': pid, 'name': '导出角色', 'age': 22,
        'description': '用于导入导出回归', 'is_main': True,
    })
    check('创建角色', r.status_code == 200, f'{r.status_code}')
    r, chars = api('GET', f'/project/characters/{pid}')
    char_list = chars.get('data') or []
    cid = char_list[0]['character_id'] if char_list else None
    check('角色列表', len(char_list) >= 1, f'数量={len(char_list)}')

    sid = scenes[0]['scene_id'] if scenes else None
    content_ids = []
    if sid and cid:
        for i, t in enumerate(['导出第一句', '导出第二句']):
            r, body = api('POST', '/project/dialogues', json={
                'project_id': pid, 'scene_id': sid, 'content_type': '对话',
                'content_text': t, 'order_num': i + 1, 'character_id': cid,
            })
            content_ids.append((body.get('data') or {}).get('content_id'))
    check('创建两条对话', all(content_ids), content_ids)

    if len(content_ids) == 2 and all(content_ids):
        r, body = api('POST', f'/project/branches/{pid}', json={
            'source_content_id': content_ids[0], 'target_content_id': content_ids[1],
            'choice_text': '第8批分支',
        })
        check('创建分支（供导出包含）', r.status_code == 200, f'{r.status_code} {str(body)[:120]}')

    # ================= ④ 导出 =================
    r, bundle = api('GET', f'/project/project/{pid}/export', params={'format': 'json'})
    ok_bundle = (r.status_code == 200 and isinstance(bundle, dict)
                 and bundle.get('format') == 'aigc-novel-project'
                 and isinstance(bundle.get('project'), dict))
    check('导出 JSON 包结构', ok_bundle, f'{r.status_code} keys={list(bundle)[:8] if isinstance(bundle, dict) else bundle}')
    check('导出包项目字段回显', ok_bundle and bundle['project'].get('title') == title,
          (bundle.get('project') or {}).get('title'))
    check('导出包含角色/场景/对话/分支',
          ok_bundle and len(bundle.get('characters') or []) >= 1
          and len(bundle.get('scenes') or []) >= 2
          and len(bundle.get('script_contents') or []) >= 2
          and len(bundle.get('branches') or []) >= 1,
          f"chars={len(bundle.get('characters') or [])} scenes={len(bundle.get('scenes') or [])} "
          f"contents={len(bundle.get('script_contents') or [])} branches={len(bundle.get('branches') or [])}")
    check('导出响应带下载文件名',
          'attachment' in (r.headers.get('Content-Disposition') or ''),
          r.headers.get('Content-Disposition'))

    r, text = api('GET', f'/project/project/{pid}/export', params={'format': 'txt'})
    ok_txt = r.status_code == 200 and isinstance(text, str) and f'《{title}》' in text
    check('导出 TXT 剧本', ok_txt, f'{r.status_code} preview={str(text)[:60]!r}')
    check('TXT 含角色名与台词', ok_txt and '导出角色：导出第一句' in text, str(text)[:200].replace('\n', ' '))

    # 他人项目不可导出（项目 7 属 user_id=1）
    r, body = api('GET', '/project/project/7/export', params={'format': 'json'})
    check('他人项目导出被拒', r.status_code == 404, f'{r.status_code}')

    # ================= ⑤ 导入 =================
    if ok_bundle:
        r, body = api('POST', '/project/project/import', json=bundle)
        new_pid = (body.get('data') or {}).get('project_id')
        check('导入项目成功', r.status_code in (200, 201) and new_pid and new_pid != pid,
              f'{r.status_code} new_pid={new_pid} {str(body)[:120]}')
        if new_pid:
            CREATED_PROJECTS.append(new_pid)

            r, b2 = api('GET', f'/project/scenes/{new_pid}')
            check('导入后场景数一致', len(b2.get('data') or []) == len(bundle.get('scenes') or []),
                  f"导入={len(b2.get('data') or [])} 原={len(bundle.get('scenes') or [])}")

            r, b2 = api('GET', f'/project/dialogue_count/{new_pid}')
            check('导入后对话数一致', b2.get('length') == len(bundle.get('script_contents') or []),
                  f"导入={b2.get('length')} 原={len(bundle.get('script_contents') or [])}")

            r, b2 = api('GET', f'/project/characters/{new_pid}')
            check('导入后角色数一致', len(b2.get('data') or []) == len(bundle.get('characters') or []),
                  f"导入={len(b2.get('data') or [])} 原={len(bundle.get('characters') or [])}")

            r, b2 = api('GET', f'/project/branches/{new_pid}')
            check('导入后分支数一致', (b2.get('count') or 0) == len(bundle.get('branches') or []),
                  f"导入={b2.get('count')} 原={len(bundle.get('branches') or [])}")

    # 非法导入被拒
    r, body = api('POST', '/project/project/import', json={'project': {'genre': '科幻'}})
    check('缺标题的导入被拒', r.status_code == 400, f'{r.status_code} {str(body)[:120]}')

    # ================= 清理 =================
    for p in CREATED_PROJECTS:
        api('DELETE', f'/project/project/{p}')

    return finish()


if __name__ == '__main__':
    sys.exit(main())
