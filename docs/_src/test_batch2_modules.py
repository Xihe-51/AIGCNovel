# -*- coding: utf-8 -*-
"""第2批：RAG 人设库 + LangChain 记忆 模块级自测"""
import sys, io, json, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, '.')
from app import create_app

app = create_app('default')
PID = 7

with app.app_context():
    from app.ai import rag, memory

    print('=' * 60)
    print('【1】RAG 建索引')
    print('=' * 60)
    t = time.time()
    r = rag.build_index(PID, force=True)
    print(f'build_index -> {json.dumps(r, ensure_ascii=False)}  ({time.time()-t:.1f}s)')

    print()
    print('=' * 60)
    print('【2】RAG 检索（人设一致性）')
    print('=' * 60)
    queries = [
        '林瑶的人格分裂表现',
        '李暮尘是谁',
        '主治医师的职责',
        '海边的阳光和白沙',          # 与角色无关，考察是否会乱召回
    ]
    for q in queries:
        hits = rag.search(PID, q, k=2)
        print(f'\n查询: {q}')
        for h in hits:
            print(f'   -> {h["name"]:<8} score={h["score"]:<8} {h["text"][:60]!r}')

    print()
    print('=' * 60)
    print('【3】人设上下文块（注入 prompt 用）')
    print('=' * 60)
    block, hits = rag.get_persona_context(PID, '林瑶 病娇 双重人格', k=2)
    print(block[:500])

    print()
    print('=' * 60)
    print('【4】LangChain 无状态历史压缩')
    print('=' * 60)
    history = [
        {'content_type': '描述', 'content_text': '阳光倾泻在波光粼粼的海面上。'},
        {'content_type': '对话', 'character_name': '李暮尘', 'content_text': '王医生，我真的没病，放我出去吧。'},
        {'content_type': '对话', 'character_name': '王医生', 'content_text': '你在精神病院里说自己没病，你看我信吗？'},
        {'content_type': '对话', 'character_name': '李暮尘', 'content_text': '王医生，到底什么时候能放我出去？'},
        {'content_type': '对话', 'character_name': '王医生', 'content_text': '积极配合治疗，用不了几个月。'},
        {'content_type': '对话', 'character_name': '李暮尘', 'content_text': '她到底是什么病啊？'},
        {'content_type': '对话', 'character_name': '王医生', 'content_text': '重度抑郁，且有人格分裂的倾向。'},
        {'content_type': '对话', 'character_name': '李暮尘', 'content_text': '到底为啥把我俩放一个屋里？'},
        {'content_type': '描述', 'content_text': '说完，王医生就走出病房忙别的去了。'},
    ]
    t = time.time()
    summary, recent = memory.compress_history(history)
    print(f'压缩耗时 {time.time()-t:.1f}s')
    print(f'摘要: {summary[:200]!r}')
    print(f'保留原文 {len(recent)} 条:')
    for m in recent:
        print('   ', type(m).__name__, '-', str(m.content)[:60])

    print()
    print('=' * 60)
    print('【5】LangChain 有状态记忆（Redis 持久化）')
    print('=' * 60)
    sid = 'test_session_001'
    memory.reset_session(sid)
    print('初始:', json.dumps(memory.memory_state(sid), ensure_ascii=False))
    memory.remember_turn(sid, '让李暮尘怀疑自己是否真的有病', '李暮尘攥紧了手里的药片，指节发白。')
    memory.remember_turn(sid, '引入林瑶的第二人格', '林瑶忽然抬起头，眼神变得陌生而冰冷。')
    st = memory.memory_state(sid)
    print('两轮后:', json.dumps({k: v for k, v in st.items() if k != 'summary'}, ensure_ascii=False))
    print('摘要长度:', st['summary_length'])

    # 关键验证：新建 memory 实例能否恢复摘要（模拟 Celery 新进程）
    mem2 = memory.get_memory(sid)
    print('重建实例后 messages:', len(mem2.chat_memory.messages), '条')
    print('重建实例摘要前缀:', (mem2.moving_summary_buffer or '')[:60] or '(空)')

    print()
    print('=' * 60)
    print('【6】索引持久化（模拟重启后加载）')
    print('=' * 60)
    rag._INDEX_CACHE.clear()
    print('清空内存缓存后 stats:', json.dumps(rag.index_stats(PID), ensure_ascii=False))
    hits = rag.search(PID, '病娇 林瑶', k=1)
    print('从磁盘重载后检索:', hits[0]['name'] if hits else '(无)')
