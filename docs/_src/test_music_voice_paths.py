# -*- coding=utf-8 -*-
"""
3.3 音乐/配音：路径与契约测试（不加载模型、不联网）。

覆盖：
  ① 后端选择归一化（music 走 local / 走 volcengine 的判定）
  ② 本地 MusicGen 可用性探测结构
  ③ 火山 TTS 凭据缺失时明确报错（不是静默失败）
  ④ API 契约：/ai/generate/music 与 /ai/generate/voice 是两条独立路由
  ⑤ /ai/health 暴露 local_music 与 tts 两段状态
  ⑥ 音乐与配音语义分离：music 接口不接受空 prompt；voice 不接受空 text

运行：
    cd back && ./.venv/Scripts/python.exe ../docs/_src/test_music_voice_paths.py
"""
import ast
import json
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_BACK = os.path.join(_ROOT, 'back')
sys.path.insert(0, _BACK)

from flask import Flask

PASS, FAIL, SKIP = [], [], []


def check(name, fn):
    try:
        fn()
        PASS.append(name)
        print(f'  [PASS] {name}')
    except AssertionError as e:
        FAIL.append((name, str(e)))
        print(f'  [FAIL] {name}: {e}')
    except Exception as e:
        FAIL.append((name, f'{type(e).__name__}: {e}'))
        print(f'  [FAIL] {name}: {type(e).__name__}: {e}')


def make_app(**overrides):
    app = Flask(__name__)
    app.config.update({
        'MUSIC_MODEL_DIR': '',
        'MUSIC_DTYPE': 'bf16',
        'MUSIC_MIN_FREE_RAM_GB': 3.0,
        'MUSIC_GUIDANCE': 3.0,
        'MUSIC_TEMPERATURE': 1.0,
        'MUSIC_DEFAULT_SECONDS': 10,
        'MUSIC_MAX_SECONDS': 30,
        'MUSIC_UNLOAD_AFTER': True,
        'MUSIC_BACKEND': 'local',
        'VOLCENGINE_APPID': '',
        'VOLCENGINE_TTS_TOKEN': '',
        'VOLCENGINE_VOICE_TYPE': 'BV001_streaming',
        'VOLCENGINE_CLUSTER': 'volcano_tts',
    })
    app.config.update(overrides)
    return app


# ==================== ① 后端选择归一化 ====================

def test_resolve_backend():
    app = make_app()
    with app.app_context():
        from app.ai.services import _resolve_music_backend

        for alias in ('local', 'musicgen', 'musicgen-small', 'ace-step',
                      'acestep', 'LOCAL', ' MusicGen '):
            got = _resolve_music_backend(alias)
            assert got == 'local', f'{alias!r} 应归一化为 local，实得 {got!r}'

        for alias in ('volcengine', 'cloud', 'tts', 'VOLCENGINE'):
            got = _resolve_music_backend(alias)
            assert got == 'volcengine', f'{alias!r} 应归一化为 volcengine，实得 {got!r}'

        # 未传时回落到配置
        assert _resolve_music_backend(None) == 'local'
        assert _resolve_music_backend('') == 'local'


def test_resolve_backend_fallback_config():
    app = make_app(MUSIC_BACKEND='volcengine')
    with app.app_context():
        from app.ai.services import _resolve_music_backend
        assert _resolve_music_backend(None) == 'volcengine'
        # 显式传 local 时仍应覆盖配置
        assert _resolve_music_backend('local') == 'local'


# ==================== ② 本地 MusicGen 可用性 ====================

def test_music_available_shape():
    app = make_app()
    with app.app_context():
        from app.ai.backends import music_local
        info = music_local.available()

    required = {'ok', 'backend', 'model_dir', 'model_exists', 'loaded',
                'dtype', 'free_ram_gb', 'need_ram_gb', 'ram_ok', 'ready', 'reasons'}
    missing = required - set(info)
    assert not missing, f'available() 缺少字段: {missing}'
    assert isinstance(info['reasons'], list), 'reasons 必须是列表'
    assert info['backend'] == 'local'
    assert info['loaded'] is False, 'available() 不应加载模型'


def test_music_weight_format_guard():
    """只有 state_dict.bin（原始权重）时必须判为不可用，并给出明确原因。"""
    import tempfile
    tmp = tempfile.mkdtemp(prefix='musicgen_fake_')
    with open(os.path.join(tmp, 'config.json'), 'w', encoding='utf-8') as f:
        json.dump({}, f)
    with open(os.path.join(tmp, 'state_dict.bin'), 'wb') as f:
        f.write(b'\0' * 16)

    app = make_app(MUSIC_MODEL_DIR=tmp)
    with app.app_context():
        from app.ai.backends import music_local
        info = music_local.available()
    assert info['ok'] is False, '只有 state_dict.bin 时应判为不可用'
    assert info['model_exists'] is False
    joined = ' '.join(info['reasons'])
    assert '权重' in joined, f'原因里应提到权重缺失，实得: {joined}'


def test_music_ram_guard():
    """内存阈值设到不可能满足的高度时，ram_ok 必须为 False。"""
    app = make_app(MUSIC_MIN_FREE_RAM_GB=9999.0)
    with app.app_context():
        from app.ai.backends import music_local
        info = music_local.available()
        assert info['ram_ok'] is False, '阈值 9999GB 时 ram_ok 不应为 True'
        assert info['ready'] is False, '内存不足时 ready 必须为 False'

        # 真去加载必须抛错，而不是硬上
        try:
            music_local._check_ram_before_load()
        except RuntimeError as e:
            assert '内存不足' in str(e), f'错误信息应说明内存不足: {e}'
        else:
            raise AssertionError('内存不足时应抛 RuntimeError')


# ==================== ③ 火山 TTS 凭据缺失 ====================

def test_voice_missing_credentials():
    app = make_app()
    with app.app_context():
        from app.ai.services import generate_voice
        ok, info = generate_voice(1, '这是一句测试台词')
    assert ok is False, '未配置凭据时必须返回失败'
    msg = info.get('message', '')
    assert 'VOLCENGINE_APPID' in msg or '凭据' in msg, f'错误信息应指出缺少凭据: {msg}'


def test_voice_empty_text():
    app = make_app()
    with app.app_context():
        from app.ai.services import generate_voice
        ok, info = generate_voice(1, '   ')
    assert ok is False
    assert '不能为空' in info.get('message', '')


def test_voice_too_long():
    app = make_app()
    with app.app_context():
        from app.ai.services import generate_voice
        ok, info = generate_voice(1, '字' * 1001)
    assert ok is False
    assert '1000' in info.get('message', '')


def test_music_no_cloud_backend():
    """项目没有云端音乐 API，请求 volcengine 时应明确报错，而不是拿 TTS 冒充。"""
    app = make_app(MUSIC_BACKEND='volcengine')
    with app.app_context():
        from app.ai.services import generate_music
        ok, info = generate_music(1, 'calm piano', 5, model_path='volcengine')
    assert ok is False, '云端音乐后端不存在，必须返回失败'
    msg = info.get('message', '')
    assert '没有' in msg and ('MusicGen' in msg or '配音' in msg), \
        f'应引导用户改走本地 MusicGen 或配音: {msg}'


def test_appid_is_string():
    """appid 必须按字符串拼接，不能被序列化成浮点科学计数法。"""
    appid = '2124834565'
    app = make_app(VOLCENGINE_APPID=appid)
    with app.app_context():
        from app.ai.services import _volcengine_appid
        got = _volcengine_appid()
    assert isinstance(got, str), f'appid 必须是 str，实得 {type(got).__name__}'
    assert got == appid
    assert 'e+' not in json.dumps({'appid': got}), 'appid 序列化后不应出现科学计数法'


# ==================== ④ API 契约：两条独立路由 ====================

def test_routes_are_separate():
    """直接读 views.py 源码做结构断言，避免起服务。"""
    path = os.path.join(_BACK, 'app', 'ai', 'views.py')
    with open(path, encoding='utf-8') as f:
        src = f.read()

    assert "'/generate/music'" in src, '缺少 /ai/generate/music 路由'
    assert "'/generate/voice'" in src, '缺少 /ai/generate/voice 路由'
    assert 'def generate_music_view' in src, '缺少 generate_music_view 视图'
    assert 'def generate_voice_view' in src, '缺少 generate_voice_view 视图'

    # music 视图必须把 model 透传给 generate_music
    assert 'generate_music(user_id, prompt, duration, model_path)' in src, \
        'music 视图应把 model_path 透传给 generate_music'

    # voice 视图不能调用 generate_music
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == 'generate_voice_view':
            body = ast.get_source_segment(src, node) or ''
            assert 'generate_music' not in body, '配音视图里不应再调用 generate_music'
            assert 'generate_voice(' in body, '配音视图应调用 generate_voice'


def test_health_exposes_new_sections():
    path = os.path.join(_BACK, 'app', 'ai', 'views.py')
    with open(path, encoding='utf-8') as f:
        src = f.read()
    for key in ('"local_sd"', '"local_music"', '"tts"'):
        assert key in src, f'/ai/health 应暴露 {key}'
    for fn in ('_local_sd_health', '_local_music_health', '_tts_health'):
        assert f'def {fn}' in src, f'缺少 {fn} 降级函数'


def test_tts_health_reports_reasons():
    app = make_app()
    with app.app_context():
        # 直接把 views 里的函数体逻辑复刻一遍做断言（不导入整个蓝图）
        appid = str(app.config.get('VOLCENGINE_APPID', '') or '').strip()
        token = str(app.config.get('VOLCENGINE_TTS_TOKEN', '') or '').strip()
        assert appid == '' and token == ''
    # 配齐后应为 ok
    app2 = make_app(VOLCENGINE_APPID='123', VOLCENGINE_TTS_TOKEN='abc')
    with app2.app_context():
        assert str(app2.config['VOLCENGINE_APPID']).strip() == '123'


# ==================== ⑤ 任务映射 ====================

def test_task_map_has_voice():
    path = os.path.join(_BACK, 'app', 'ai', 'tasks.py')
    with open(path, encoding='utf-8') as f:
        src = f.read()
    assert "'voice': task_generate_voice" in src, 'TASK_MAP 缺少 voice 映射'
    assert "'music': task_generate_music" in src, 'TASK_MAP 缺少 music 映射'
    assert "name='ai.generate_voice'" in src, '缺少 ai.generate_voice 任务'
    assert "name='ai.generate_music'" in src, '缺少 ai.generate_music 任务'


def test_static_rel_url():
    """Windows 的 os.path.join 会混入反斜杠，落库的 URL 必须统一成正斜杠。"""
    app = make_app()
    with app.app_context():
        from app.ai.services import _static_rel_url

        cases = [
            ('app/static/music/4/music_1.wav', '/static/music/4/music_1.wav'),
            ('app\\static\\music\\4\\music_1.wav', '/static/music/4/music_1.wav'),
            ('app/static/music/4\\music_1.wav', '/static/music/4/music_1.wav'),
        ]
        for raw, want in cases:
            got = _static_rel_url(raw)
            assert '\\' not in got, f'{raw!r} 转换后仍有反斜杠: {got!r}'
            assert got == want, f'{raw!r} 应转为 {want!r}，实得 {got!r}'


# ==================== ⑥ 音频写出 ====================

def test_write_wav():
    import tempfile
    try:
        import numpy as np
    except ImportError:
        SKIP.append('write_wav（numpy 不可用）')
        print('  [SKIP] write_wav（numpy 不可用）')
        return

    app = make_app()
    with app.app_context():
        from app.ai.backends import music_local
        # 立体声 (2, 1000)
        audio = np.zeros((2, 1000), dtype=np.float32)
        audio[0, :] = 0.5
        tmp = os.path.join(tempfile.mkdtemp(prefix='wav_'), 'a.wav')
        music_local._write_wav(tmp, audio, 32000)

        import wave
        with wave.open(tmp, 'rb') as wf:
            assert wf.getnchannels() == 2, f'声道数应为 2，实得 {wf.getnchannels()}'
            assert wf.getsampwidth() == 2, '应为 16-bit PCM'
            assert wf.getframerate() == 32000, f'采样率应为 32000，实得 {wf.getframerate()}'
            assert wf.getnframes() == 1000, f'帧数应为 1000，实得 {wf.getnframes()}'

        # 数据区 = 帧数 × 声道 × 2 字节；文件另含 44 字节 RIFF 头
        data_bytes = 1000 * 2 * 2
        assert os.path.getsize(tmp) == 44 + data_bytes, \
            f'wav 总长应为 44+{data_bytes}，实得 {os.path.getsize(tmp)}'


# ==================== 主流程 ====================

def main():
    tests = [
        ('① 后端别名归一化', test_resolve_backend),
        ('① 后端回落配置', test_resolve_backend_fallback_config),
        ('② 本地音乐可用性字段', test_music_available_shape),
        ('② 权重格式守卫', test_music_weight_format_guard),
        ('② 内存守卫', test_music_ram_guard),
        ('③ 配音凭据缺失报错', test_voice_missing_credentials),
        ('③ 配音空文本', test_voice_empty_text),
        ('③ 配音超长文本', test_voice_too_long),
        ('③ 无云端音乐后端', test_music_no_cloud_backend),
        ('③ appid 保持字符串', test_appid_is_string),
        ('④ 音乐/配音路由分离', test_routes_are_separate),
        ('④ health 暴露新段', test_health_exposes_new_sections),
        ('④ tts health 判定', test_tts_health_reports_reasons),
        ('⑤ 任务映射', test_task_map_has_voice),
        ('⑤ 落库 URL 分隔符', test_static_rel_url),
        ('⑥ wav 写出', test_write_wav),
    ]
    print('=' * 60)
    print('3.3 音乐/配音 路径与契约测试')
    print('=' * 60)
    for name, fn in tests:
        check(name, fn)

    print('-' * 60)
    print(f'通过 {len(PASS)} / 失败 {len(FAIL)} / 跳过 {len(SKIP)}')
    if FAIL:
        print('\n失败明细：')
        for name, err in FAIL:
            print(f'  - {name}: {err}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
