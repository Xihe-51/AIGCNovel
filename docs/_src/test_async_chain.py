# -*- coding: utf-8 -*-
"""第1批验收：Celery 异步全链路实测"""
import requests, time, json, sys

BASE = 'http://127.0.0.1:8088'

def jprint(tag, r):
    print(f'--- {tag} [{r.status_code}] ---')
    try:
        print(json.dumps(r.json(), ensure_ascii=False, indent=2)[:900])
    except Exception:
        print(r.text[:900])

# 1. 登录
r = requests.post(BASE + '/user/login',
                  json={'username': 'celerytest', 'password': 'Test123456'}, timeout=15)
jprint('登录', r)
tok = None
try:
    d = r.json()
    tok = d.get('access_token') or d.get('token') or (d.get('data') or {}).get('access_token') \
          or (d.get('data') or {}).get('token')
except Exception:
    pass
if not tok:
    print('!! 未取到 token，原始响应:', r.text[:400])
    sys.exit(1)
print('token 前缀:', tok[:30], '...')

# 从 token 中解析 user_id（identity 字段）
import base64
payload_b64 = tok.split('.')[1]
payload_b64 += '=' * (-len(payload_b64) % 4)
ident = json.loads(base64.urlsafe_b64decode(payload_b64))
uid = ident.get('identity')
print('user_id =', uid)

H = {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'X-User-Id': str(uid)}

# 2. 取项目列表（正确路由 /project/projects）
r = requests.get(BASE + '/project/projects', headers=H, timeout=15)
jprint('项目列表', r)
pid = None
try:
    d = r.json()
    items = d.get('data') or d.get('projects') or (d if isinstance(d, list) else [])
    if isinstance(items, dict):
        items = items.get('list') or items.get('items') or []
    if items:
        pid = items[0].get('project_id') or items[0].get('id')
except Exception as e:
    print('解析项目异常', e)
print('使用 project_id =', pid)

# 3. 提交异步文本生成
payload = {
    'project_id': pid,
    'prompt': '写一段100字以内的视觉小说开场白，场景是雨夜的天台。',
    'length': 200,
    'temperature': 0.8,
}
r = requests.post(BASE + '/ai/generate/text', headers=H, json=payload, timeout=30)
jprint('提交文本生成', r)
task_id = None
try:
    d = r.json()
    task_id = d.get('task_id') or (d.get('data') or {}).get('task_id')
    print('async =', d.get('async'))
except Exception:
    pass

if not task_id:
    print('!! 未拿到 task_id（可能走了同步回退），响应见上')
    sys.exit(0)

print('\n===== 开始轮询 task_id =', task_id, '=====')
for i in range(90):
    time.sleep(2)
    r = requests.get(BASE + f'/ai/task/{task_id}', headers=H, timeout=15)
    try:
        d = r.json()
    except Exception:
        d = {'raw': r.text[:200]}
    st = d.get('state') or d.get('status') or (d.get('data') or {}).get('state')
    print(f'[{i*2:>3}s] state={st}')
    if st in ('SUCCESS', 'FAILURE', 'REVOKED'):
        print(json.dumps(d, ensure_ascii=False, indent=2)[:1500])
        break
else:
    print('轮询超时')
