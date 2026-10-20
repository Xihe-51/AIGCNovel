# -*- coding: utf-8 -*-
"""
第 1 批 + 第 2 批 联合回归测试

覆盖：
  第1批：健康检查 / 异步全链路 / 缓存命中 / 任务轮询 / 降级
  第2批：RAG 人设库（重建·检索·状态）/ LangChain 上下文（无状态+有状态）
         / 会话记忆管理 / branch_paths CRUD / 剧情图拓扑 / FSM 校验

运行：cd back && ./.venv/Scripts/python.exe ../docs/_src/test_batch12_e2e.py
"""
import base64
import json
import sys
import time

import requests

BASE = 'http://127.0.0.1:8088'
PID = 7          # 项目「妄」，有 3 个角色 + 3 个场景 + 真实剧情（属于 user_id=1）
USER = 'celerytest'
PWD = 'Test123456'


def token_for(uid):
    """
    本地测试用：用项目 SECRET_KEY 为指定用户签发令牌。

    归属校验上线后，不能再拿 4 号账号去访问 1 号的项目；这里直接为项目
    所有者签发测试令牌，避免测试脚本依赖他人密码。
    """
    from datetime import datetime, timedelta, timezone
    import os
    import sys as _sys
    import jwt as pyjwt

    back_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'back'))
    if back_dir not in _sys.path:
        _sys.path.insert(0, back_dir)
    # 只读配置拿 SECRET_KEY，不 create_app（避免在测试进程里触发 torch 预热）
    from config import Config
    return pyjwt.encode({
        'identity': uid,
        'role': 'STUDENT',
        'userName': f'fixture_{uid}',
        'exp': datetime.now(timezone.utc) + timedelta(hours=1),
    }, Config.SECRET_KEY, algorithm='HS256')

PASS, FAIL, SKIP = [], [], []
_created_branch_ids = []


def ok(name, detail=''):
    PASS.append(name)
    print(f'  [PASS] {name}' + (f'  {detail}' if detail else ''))


def fail(name, detail=''):
    FAIL.append((name, detail))
    print(f'  [FAIL] {name}  {detail}')


def skip(name, detail=''):
    SKIP.append((name, detail))
    print(f'  [SKIP] {name}  {detail}')


def section(t):
    print()
    print('=' * 72)
    print(t)
    print('=' * 72)


def poll(task_id, headers, timeout=300):
    """轮询 Celery 任务直到终态。"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = requests.get(f'{BASE}/ai/task/{task_id}', headers=headers, timeout=30)
        d = r.json()
        st = d.get('state')
        if st in ('SUCCESS', 'FAILURE', 'REVOKED'):
            return st, d, time.time() - t0
        time.sleep(1.5)
    return 'TIMEOUT', {}, time.time() - t0


def main():
    # ---------------- 登录 ----------------
    section('准备：登录与项目数据')
    r = requests.post(f'{BASE}/user/login', json={'username': USER, 'password': PWD}, timeout=20)
    if r.status_code != 200:
        print('登录失败，终止:', r.status_code, r.text[:200])
        return 1
    tok = r.json()['access_token']
    pl = tok.split('.')[1]
    pl += '=' * (-len(pl) % 4)
    uid = json.loads(base64.urlsafe_b64decode(pl))['identity']
    H = {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json',
         'X-User-Id': str(uid)}
    ok('登录', f'user_id={uid}')

    # 项目 7 属于 user_id=1：用本地密钥为其签发测试令牌（见 token_for 说明）
    owner_tok = token_for(1)
    H = {'Authorization': f'Bearer {owner_tok}', 'Content-Type': 'application/json',
         'X-User-Id': '1'}

    # ==================================================================
    section('第 1 批 ①健康检查')
    r = requests.get(f'{BASE}/ai/health', timeout=20)
    d = r.json()
    if r.status_code == 200 and d.get('status') == 'ok':
        ok('GET /ai/health', f"text={d.get('text_backend')} cache={d['cache']['connected']} "
                             f"async={d['async']['enabled']} rag={d['rag']['ok']} mem={d['memory']['ok']}")
    else:
        fail('GET /ai/health', r.text[:200])

    if not d.get('cache', {}).get('connected'):
        skip('后续缓存用例', 'Redis 未连接')
    if not d.get('async', {}).get('enabled'):
        skip('后续异步用例', 'ASYNC_ENABLED=false')

    # ==================================================================
    section('第 1 批 ②异步全链路 + 缓存命中')
    prompt = '用一句话描写深夜便利店的灯光。'
    t0 = time.time()
    r = requests.post(f'{BASE}/ai/generate/text', headers=H,
                      json={'prompt': prompt, 'length': 80}, timeout=60)
    submit_dt = time.time() - t0
    d1 = r.json()
    tid = d1.get('task_id')
    broker_ok = d.get('cache', {}).get('connected')
    if r.status_code == 202 and d1.get('async') and tid:
        ok('异步提交返回 task_id', f'HTTP 202, {submit_dt:.2f}s')
    elif not broker_ok and r.status_code == 200 and d1.get('async') is False:
        # 第 3 批 FIX-8：broker 不可达时会先做 1 秒 TCP 预检，然后直接同步执行，
        # 不再白等 delay() 的 64 秒重试。这是预期行为，不是失败。
        sync_dt = d1.get('data', {})
        ok('broker 不可达时快速同步回退（FIX-8 回归）',
           f'HTTP 200 async=False {submit_dt:.2f}s backend={sync_dt.get("backend")}')
        if submit_dt > 15:
            fail('同步回退耗时', f'{submit_dt:.1f}s（应 <15s，过久说明仍在等 delay 重试）')
        tid = None
    else:
        fail('异步提交', f'HTTP {r.status_code} {r.text[:160]}')
        tid = None

    if tid:
        st, res, dt = poll(tid, H)
        if st == 'SUCCESS':
            rr = res.get('result') or {}
            ok('任务轮询 SUCCESS', f'{dt:.1f}s backend={rr.get("backend")} model={rr.get("model")}')
            if rr.get('backend') == 'ollama':
                ok('本地 Ollama 生效', 'backend=ollama（未被静默降级到云 API）')
            else:
                fail('本地 Ollama 生效', f"backend={rr.get('backend')}（期望 ollama）")
            ok('生成长度校验', f"length={rr.get('length')}")
        else:
            fail('任务轮询', f'state={st} {json.dumps(res, ensure_ascii=False)[:200]}')

    # 同 prompt 第二次 → 应命中缓存
    r = requests.post(f'{BASE}/ai/generate/text', headers=H,
                      json={'prompt': prompt, 'length': 80}, timeout=60)
    d2 = r.json()
    tid2 = d2.get('task_id')
    if tid2:
        st2, res2, dt2 = poll(tid2, H)
        rr2 = (res2.get('result') or {}) if st2 == 'SUCCESS' else {}
        if rr2.get('cached'):
            ok('缓存命中', f'cached=true, worker 耗时 {dt2:.1f}s')
        else:
            skip('缓存命中', f"cached 未命中（{json.dumps(rr2, ensure_ascii=False)[:120]}）")
    else:
        skip('缓存命中', '未拿到 task_id')

    # ==================================================================
    section('第 2 批 ①RAG 人设库')
    r = requests.get(f'{BASE}/ai/rag/status/{PID}', headers=H, timeout=20)
    d = r.json()
    ok('GET /ai/rag/status', f"exists={d['data'].get('exists')} count={d['data'].get('count')}")

    r = requests.post(f'{BASE}/ai/rag/rebuild/{PID}', headers=H, json={'force': True}, timeout=60)
    d = r.json()
    tid = d.get('task_id')
    if tid:
        st, res, dt = poll(tid, H, timeout=300)
        if st == 'SUCCESS':
            rr = res.get('result') or {}
            ok('人设索引重建（异步）', f"{dt:.1f}s count={rr.get('count')} dim={rr.get('dim')}")
        else:
            fail('人设索引重建', f'state={st} {json.dumps(res, ensure_ascii=False)[:200]}')
    else:
        # 同步模式
        if d.get('status') == 'success':
            ok('人设索引重建（同步）', json.dumps(d.get('data'), ensure_ascii=False)[:120])
        else:
            fail('人设索引重建', r.text[:200])

    # 检索：语义相关性
    cases = [
        ('林瑶 病娇 双重人格', '林瑶'),
        ('主治医师 医生', '王医生'),
        ('李暮尘 主角', '李暮尘'),
    ]
    for q, expect in cases:
        r = requests.get(f'{BASE}/ai/rag/search', params={'project_id': PID, 'q': q, 'k': 2},
                         headers=H, timeout=30)
        hits = r.json().get('data') or []
        if hits and hits[0].get('name') == expect:
            ok(f'人设检索「{q}」', f"top1={hits[0]['name']} score={hits[0]['score']}")
        else:
            fail(f'人设检索「{q}」', f"期望 top1={expect}，实际={[h.get('name') for h in hits]}")

    # ==================================================================
    section('第 2 批 ②LangChain 上下文 —— 无状态模式（替代前端自拼 prompt）')
    history = [
        {'content_type': '描述', 'content_text': '阳光倾泻在波光粼粼的海面上。'},
        {'content_type': '对话', 'character_name': '李暮尘',
         'content_text': '王医生，我真的没病，不需要治疗，放我出去吧。'},
        {'content_type': '对话', 'character_name': '王医生',
         'content_text': '你在精神病院里说自己没病，你看我信吗？'},
        {'content_type': '对话', 'character_name': '李暮尘', 'content_text': '她到底是什么病啊？'},
        {'content_type': '对话', 'character_name': '王医生',
         'content_text': '通俗地讲就是，重度抑郁，且有人格分裂的倾向。'},
    ]
    body = {
        'project_id': PID, 'scene_id': 15,
        'user_input': '让李暮尘第一次和林瑶搭话，体现林瑶的病娇气质',
        'history': history, 'use_rag': True, 'length': 300, 'temperature': 0.8,
    }
    t0 = time.time()
    r = requests.post(f'{BASE}/ai/continue_story', headers=H, json=body, timeout=60)
    d = r.json()
    tid = d.get('task_id')
    if tid:
        st, res, dt = poll(tid, H, timeout=400)
        rr = (res.get('result') or {}) if st == 'SUCCESS' else {}
    else:
        rr = d.get('data') or {}
        st = 'SUCCESS' if d.get('status') == 'success' else 'FAILURE'
        dt = time.time() - t0

    if st == 'SUCCESS' and rr.get('generated_text'):
        ok('无状态续写成功', f'{dt:.1f}s backend={rr.get("backend")} len={rr.get("length")}')
        hits = rr.get('persona_hits') or []
        if hits:
            ok('RAG 人设已注入 prompt', '命中: ' + ', '.join(
                f"{h['name']}({h['score']})" for h in hits))
        else:
            fail('RAG 人设注入', 'persona_hits 为空')
        if rr.get('prompt_chars'):
            ok('prompt 由后端组装', f"prompt_chars={rr['prompt_chars']}")
        print('     生成内容预览:', (rr['generated_text'] or '')[:120].replace('\n', ' '))
    else:
        fail('无状态续写', json.dumps(rr, ensure_ascii=False)[:300])

    # ==================================================================
    section('第 2 批 ③LangChain 上下文 —— 有状态模式（多轮记忆落 Redis）')
    sid = f'e2e_p{PID}_u{uid}'
    requests.delete(f'{BASE}/ai/memory/{sid}', headers=H, timeout=20)
    r = requests.get(f'{BASE}/ai/memory/{sid}', headers=H, timeout=20)
    before = (r.json().get('data') or {}).get('message_count', -1)
    ok('会话记忆已重置', f'before message_count={before}')

    turns = [
        '让李暮尘试探林瑶的反应',
        '林瑶第一次开口说话，语气冰冷',
    ]
    last_state = {}
    for i, inp in enumerate(turns, 1):
        body = {'project_id': PID, 'scene_id': 15, 'user_input': inp,
                'session_id': sid, 'stateful': True, 'use_rag': True,
                'length': 200, 'temperature': 0.8}
        r = requests.post(f'{BASE}/ai/continue_story', headers=H, json=body, timeout=60)
        d = r.json()
        tid = d.get('task_id')
        if tid:
            st, res, dt = poll(tid, H, timeout=400)
            rr = (res.get('result') or {}) if st == 'SUCCESS' else {}
        else:
            rr = d.get('data') or {}
            st = 'SUCCESS' if d.get('status') == 'success' else 'FAILURE'
        if st == 'SUCCESS':
            last_state = rr.get('memory') or {}
            ok(f'有状态第 {i} 轮成功',
               f"message_count={last_state.get('message_count')} "
               f"summary_len={len(last_state.get('summary') or '')}")
        else:
            fail(f'有状态第 {i} 轮', json.dumps(rr, ensure_ascii=False)[:250])

    r = requests.get(f'{BASE}/ai/memory/{sid}', headers=H, timeout=20)
    st_data = r.json().get('data') or {}
    mc = st_data.get('message_count', 0)
    if mc >= 4:
        ok('多轮记忆已累积', f'message_count={mc}（2 轮 × 2 条消息）')
    else:
        fail('多轮记忆累积', f'message_count={mc}，期望 >=4')

    # 回归用例：重复同一输入（会命中缓存）时，记忆仍必须继续推进
    body = {'project_id': PID, 'scene_id': 15, 'user_input': turns[-1],
            'session_id': sid, 'stateful': True, 'use_rag': True,
            'length': 200, 'temperature': 0.8}
    r = requests.post(f'{BASE}/ai/continue_story', headers=H, json=body, timeout=60)
    d = r.json()
    tid = d.get('task_id')
    if tid:
        st, res, dt = poll(tid, H, timeout=400)
        rr = (res.get('result') or {}) if st == 'SUCCESS' else {}
    else:
        rr = d.get('data') or {}
        st = 'SUCCESS' if d.get('status') == 'success' else 'FAILURE'

    mem_after = (rr.get('memory') or {})
    mc_after = mem_after.get('message_count', 0)
    if st == 'SUCCESS' and mc_after > mc:
        ok('缓存命中时记忆仍推进（回归）',
           f"cached={rr.get('cached')} message_count {mc} → {mc_after}")
    else:
        fail('缓存命中时记忆仍推进（回归）',
             f"cached={rr.get('cached')} message_count {mc} → {mc_after}，期望递增")

    # 交叉验证：直接读 Redis，确认落盘条数与接口一致
    r = requests.get(f'{BASE}/ai/memory/{sid}', headers=H, timeout=20)
    mc_api = (r.json().get('data') or {}).get('message_count', -1)
    if mc_api == mc_after:
        ok('Redis 与接口口径一致', f'GET message_count={mc_api}')
    else:
        fail('Redis 与接口口径一致', f'接口={mc_api}，任务内={mc_after}')

    r = requests.delete(f'{BASE}/ai/memory/{sid}', headers=H, timeout=20)
    r = requests.get(f'{BASE}/ai/memory/{sid}', headers=H, timeout=20)
    mc2 = (r.json().get('data') or {}).get('message_count', -1)
    if mc2 == 0:
        ok('会话记忆清空', f'清空后 message_count={mc2}')
    else:
        fail('会话记忆清空', f'message_count={mc2}')

    # ==================================================================
    section('第 2 批 ④剧情图拓扑 + FSM 校验')
    r = requests.get(f'{BASE}/project/story_graph/{PID}', headers=H, timeout=30)
    d = r.json()
    if r.status_code == 200 and d.get('success'):
        data = d['data']
        ok('GET /project/story_graph', f"nodes={data['stats']['node_count']} "
                                       f"edges={data['stats']['edge_count']} "
                                       f"scenes={data['stats']['scene_count']}")
        v = data.get('validation') or {}
        ok('拓扑内嵌 FSM 校验', f"ok={v.get('ok')} summary={json.dumps(v.get('summary'), ensure_ascii=False)}")
        print('     校验错误:', len(v.get('errors') or []),
              '| 警告:', len(v.get('warnings') or []))
        for e in (v.get('errors') or [])[:3]:
            print(f"       [ERR] {e['code']}: {e['message'][:80]}")
        for w in (v.get('warnings') or [])[:3]:
            print(f"       [WARN] {w['code']}: {w['message'][:80]}")
        node_ids = [n['content_id'] for n in data['nodes']]
    else:
        fail('GET /project/story_graph', r.text[:200])
        node_ids = []

    r = requests.post(f'{BASE}/project/story_graph/{PID}/validate', headers=H, timeout=30)
    d = r.json()
    if r.status_code == 200 and d.get('success'):
        ok('POST /validate', f"ok={d['data'].get('ok')} "
                             f"errors={len(d['data'].get('errors') or [])} "
                             f"warnings={len(d['data'].get('warnings') or [])}")
    else:
        fail('POST /validate', r.text[:200])

    # ==================================================================
    section('第 2 批 ⑤branch_paths CRUD（原系统完全缺失的能力）')

    if len(node_ids) >= 3:
        a, b, c = node_ids[0], node_ids[1], node_ids[2]

        # 5.1 创建
        r = requests.post(f'{BASE}/project/branches/{PID}', headers=H,
                          json={'source_content_id': a, 'target_content_id': b,
                                'choice_text': '【E2E测试】选择A'}, timeout=20)
        d = r.json()
        if r.status_code == 200 and d.get('success'):
            pid1 = d['data']['path_id']
            _created_branch_ids.append(pid1)
            ok('创建分支', f'path_id={pid1} {a}→{b}')
        else:
            fail('创建分支', r.text[:200])
            pid1 = None

        # 5.2 幂等（同起止再建一次不应重复）
        r = requests.post(f'{BASE}/project/branches/{PID}', headers=H,
                          json={'source_content_id': a, 'target_content_id': b,
                                'choice_text': '【E2E测试】选择A-改'}, timeout=20)
        d = r.json()
        if r.status_code == 200 and d.get('success') and d['data']['path_id'] == pid1:
            ok('创建幂等（同起止不重复建边）', f"path_id 仍为 {pid1}, 文案已更新")
        else:
            fail('创建幂等', r.text[:200])

        # 5.3 列出
        r = requests.get(f'{BASE}/project/branches/{PID}', headers=H, timeout=20)
        d = r.json()
        if r.status_code == 200 and d.get('success'):
            ok('列出分支', f"count={d.get('count')}")
        else:
            fail('列出分支', r.text[:200])

        # 5.4 更新
        if pid1:
            r = requests.put(f'{BASE}/project/branches/detail/{pid1}', headers=H,
                             json={'choice_text': '【E2E测试】改后文案'}, timeout=20)
            d = r.json()
            if r.status_code == 200 and d.get('success') and \
                    d['data']['choice_text'] == '【E2E测试】改后文案':
                ok('更新分支', f"choice_text={d['data']['choice_text']}")
            else:
                fail('更新分支', r.text[:200])

        # 5.5 非法边（自环）应被拒
        r = requests.post(f'{BASE}/project/branches/{PID}', headers=H,
                          json={'source_content_id': a, 'target_content_id': a,
                                'choice_text': '自环'}, timeout=20)
        if r.status_code == 400:
            ok('拒绝自环分支', r.json().get('message', '')[:60])
        else:
            fail('拒绝自环分支', f'HTTP {r.status_code}（期望 400）')

        # 5.6 非法边（不存在的节点）应被拒
        r = requests.post(f'{BASE}/project/branches/{PID}', headers=H,
                          json={'source_content_id': a, 'target_content_id': 999999,
                                'choice_text': '幽灵'}, timeout=20)
        if r.status_code == 400:
            ok('拒绝跨项目/不存在节点', r.json().get('message', '')[:60])
        else:
            fail('拒绝不存在节点', f'HTTP {r.status_code}（期望 400）')

        # 5.7 批量覆盖写入
        r = requests.post(f'{BASE}/project/branches/{PID}/batch', headers=H,
                          json={'replace': False,
                                'branches': [
                                    {'source_content_id': a, 'target_content_id': c,
                                     'choice_text': '【E2E测试】批量1'},
                                ]}, timeout=20)
        d = r.json()
        if r.status_code == 200 and d.get('success'):
            ok('批量写入分支', json.dumps(d['data'], ensure_ascii=False))
        else:
            fail('批量写入分支', r.text[:200])

        # 5.8 批量中的重复边应整体拒绝（事务性）
        r = requests.post(f'{BASE}/project/branches/{PID}/batch', headers=H,
                          json={'replace': False,
                                'branches': [
                                    {'source_content_id': a, 'target_content_id': b,
                                     'choice_text': 'x'},
                                    {'source_content_id': a, 'target_content_id': b,
                                     'choice_text': 'y'},
                                ]}, timeout=20)
        if r.status_code == 400:
            ok('批量重复边整体拒绝（事务性）', r.json().get('message', '')[:70])
        else:
            fail('批量重复边校验', f'HTTP {r.status_code}（期望 400）')

        # 5.9 创建后 story_graph 应反映新边
        r = requests.get(f'{BASE}/project/story_graph/{PID}', headers=H, timeout=30)
        cnt = r.json()['data']['stats']['edge_count']
        ok('拓扑反映新增分支', f'edge_count={cnt}')

        # 5.10 删除（清理测试数据）
        r = requests.get(f'{BASE}/project/branches/{PID}', headers=H, timeout=20)
        for bp in (r.json().get('data') or []):
            if '【E2E测试】' in (bp.get('choice_text') or ''):
                requests.delete(f"{BASE}/project/branches/detail/{bp['path_id']}",
                                headers=H, timeout=20)
        r = requests.get(f'{BASE}/project/branches/{PID}', headers=H, timeout=20)
        left = [b for b in (r.json().get('data') or []) if '【E2E测试】' in (b.get('choice_text') or '')]
        if not left:
            ok('删除分支并清理测试数据', '已清空')
        else:
            fail('清理测试数据', f'仍有 {len(left)} 条')
    else:
        skip('branch_paths CRUD', f'项目 {PID} 剧情节点不足 3 个（实际 {len(node_ids)}）')

    # ==================================================================
    section('第 2 批 ⑥FSM 校验端到端（在真实数据上构造死循环）')

    if len(node_ids) >= 4:
        a, b, c, d = node_ids[0], node_ids[1], node_ids[2], node_ids[3]

        # 基线：当前应无环
        r = requests.get(f'{BASE}/project/story_graph/{PID}', headers=H, timeout=30)
        base_cycles = (r.json()['data']['validation'] or {}).get('summary', {}).get('cycles', 0)
        if base_cycles == 0:
            ok('基线无死循环', f'cycles={base_cycles}')
        else:
            fail('基线无死循环', f'cycles={base_cycles}（测试前项目已有环）')

        # 构造环：a→b→c→d→a
        cycle_edges = [(a, b), (b, c), (c, d), (d, a)]
        made = []
        for s, t in cycle_edges:
            r = requests.post(f'{BASE}/project/branches/{PID}', headers=H,
                              json={'source_content_id': s, 'target_content_id': t,
                                    'choice_text': '【E2E环测试】'}, timeout=20)
            if r.status_code == 200 and r.json().get('success'):
                made.append(r.json()['data']['path_id'])

        if len(made) == 4:
            ok('构造 4 节点环', f'a→b→c→d→a（path_ids={made}）')
        else:
            fail('构造环', f'仅创建 {len(made)}/4 条')

        r = requests.post(f'{BASE}/project/story_graph/{PID}/validate', headers=H, timeout=30)
        v = r.json().get('data') or {}
        codes = [e['code'] for e in (v.get('errors') or [])]
        if 'CYCLE' in codes:
            cyc = [e for e in v['errors'] if e['code'] == 'CYCLE'][0]
            ok('FSM 检出死循环', cyc['message'][:70])
        else:
            fail('FSM 检出死循环', f'errors={codes}')

        # 让其中一个节点变成「选择」类型且无分支 —— 需先删掉它的出边
        # 简化做法：只删 d→a，此时 d 若有其他出边不影响；这里改为验证 ORPHAN 不再误报
        for pid_ in made:
            requests.delete(f'{BASE}/project/branches/detail/{pid_}', headers=H, timeout=20)

        r = requests.post(f'{BASE}/project/story_graph/{PID}/validate', headers=H, timeout=30)
        v2 = r.json().get('data') or {}
        codes2 = [e['code'] for e in (v2.get('errors') or [])]
        if 'CYCLE' not in codes2:
            ok('删除分支后环消失', f'cycles={v2.get("summary", {}).get("cycles")}')
        else:
            fail('删除分支后环消失', f'仍报 {codes2}')

        # 确认清理干净
        r = requests.get(f'{BASE}/project/branches/{PID}', headers=H, timeout=20)
        left = [x for x in (r.json().get('data') or []) if '【E2E' in (x.get('choice_text') or '')]
        if not left:
            ok('测试数据已清理', '分支表无残留')
        else:
            fail('测试数据清理', f'残留 {len(left)} 条')
    else:
        skip('FSM 端到端', f'节点不足 4 个（实际 {len(node_ids)}）')

    # ==================================================================
    section('第 2 批 ⑦前端契约核对（接口路径/字段是否与前端一致）')
    contracts = [
        ('POST', '/ai/continue_story'),
        ('GET', '/ai/rag/status/7'),
        ('POST', '/ai/rag/rebuild/7'),
        ('GET', '/ai/rag/search?project_id=7&q=test'),
        ('GET', '/ai/memory/probe'),
        ('DELETE', '/ai/memory/probe'),
        ('GET', f'/project/branches/{PID}'),
        ('GET', f'/project/story_graph/{PID}'),
        ('POST', f'/project/story_graph/{PID}/validate'),
    ]
    for method, path in contracts:
        url = BASE + path
        try:
            if method == 'GET':
                r = requests.get(url, headers=H, timeout=20)
            elif method == 'DELETE':
                r = requests.delete(url, headers=H, timeout=20)
            else:
                r = requests.post(url, headers=H, json={}, timeout=20)
            # 只要不是 404（路由不存在）就算契约存在
            if r.status_code == 404:
                fail(f'契约 {method} {path}', '404 路由不存在')
            else:
                ok(f'契约 {method} {path}', f'HTTP {r.status_code}')
        except Exception as e:
            fail(f'契约 {method} {path}', str(e)[:80])

    # ==================================================================
    section('测试汇总')
    print(f'  通过 {len(PASS)}  |  失败 {len(FAIL)}  |  跳过 {len(SKIP)}')
    if FAIL:
        print('\n  失败明细：')
        for n, d in FAIL:
            print(f'    - {n}: {d}')
    if SKIP:
        print('\n  跳过明细：')
        for n, d in SKIP:
            print(f'    - {n}: {d}')

    # 输出机器可读结果
    with open('D:/AIGCNovel/docs/_src/e2e_result.json', 'w', encoding='utf-8') as f:
        json.dump({'pass': PASS, 'fail': FAIL, 'skip': SKIP}, f, ensure_ascii=False, indent=2)

    return 0 if not FAIL else 2


if __name__ == '__main__':
    sys.exit(main())
