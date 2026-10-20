# -*- coding: utf-8 -*-
"""诊断：有状态记忆为何在 Redis 里看不到"""
import sys, io, json, time, base64, random
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import requests, redis

BASE = 'http://127.0.0.1:8088'
r = requests.post(BASE + '/user/login', json={'username': 'celerytest', 'password': 'Test123456'}, timeout=20)
tok = r.json()['access_token']
pl = tok.split('.')[1]; pl += '=' * (-len(pl) % 4)
uid = json.loads(base64.urlsafe_b64decode(pl))['identity']
H = {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'X-User-Id': str(uid)}
c = redis.from_url('redis://127.0.0.1:6380/0', socket_timeout=5)

for tag, use_rag in [('RAGoff', False), ('RAGon', True)]:
    sid = f'exp_{tag}_{random.randint(1000, 9999)}'
    requests.delete(f'{BASE}/ai/memory/{sid}', headers=H, timeout=20)
    uniq = f'唯一输入{tag}-{random.randint(100000, 999999)}'
    body = {'project_id': 7, 'scene_id': 15, 'user_input': uniq, 'session_id': sid,
            'stateful': True, 'use_rag': use_rag, 'length': 60}
    r = requests.post(BASE + '/ai/continue_story', headers=H, json=body, timeout=60)
    tid = r.json().get('task_id')
    for _ in range(200):
        time.sleep(1.5)
        d = requests.get(f'{BASE}/ai/task/{tid}', headers=H, timeout=20).json()
        if d.get('state') in ('SUCCESS', 'FAILURE'):
            res = d.get('result') or {}
            print(f'[{tag}] 任务 memory={json.dumps(res.get("memory"), ensure_ascii=False)} cached={res.get("cached")}')
            break
    time.sleep(0.5)
    key = 'ai:chat:' + sid
    print(f'[{tag}] Redis llen={c.llen(key)}  sid={sid}')
    g = requests.get(f'{BASE}/ai/memory/{sid}', headers=H, timeout=20).json()
    print(f'[{tag}] GET /ai/memory -> {json.dumps(g.get("data"), ensure_ascii=False)}')
    print()
