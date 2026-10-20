# -*- coding=utf-8 -*-
"""
统一配置层。
所有可变项（数据库、Redis、AI 后端开关、API 密钥）均从 .env 读取，
避免密钥与连接串硬编码在代码里。
"""
import os

# 尽早加载 .env（失败不阻塞，允许纯环境变量方式运行）
try:
    from dotenv import load_dotenv
    _ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    load_dotenv(_ENV_PATH, override=False)
except Exception:  # pragma: no cover
    pass


def _env(key, default=None):
    return os.environ.get(key, default)


def _env_bool(key, default=False):
    v = os.environ.get(key)
    if v is None:
        return default
    return str(v).strip().lower() in ('1', 'true', 'yes', 'on')


def _env_int(key, default=0):
    try:
        return int(os.environ.get(key, default))
    except (TypeError, ValueError):
        return default


def _env_float(key, default=0.0):
    try:
        return float(os.environ.get(key, default))
    except (TypeError, ValueError):
        return default


class Config:
    SECRET_KEY = _env('SECRET_KEY', 'ailab')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ---------- 数据库 ----------
    DB_HOST = _env('DB_HOST', '127.0.0.1')
    DB_PORT = _env_int('DB_PORT', 3306)
    DB_USER = _env('DB_USER', 'root')
    DB_PASSWORD = _env('DB_PASSWORD', '')
    DB_NAME = _env('DB_NAME', 'aigc')

    # Flask 的 from_object 只读取类属性（不会解析 property），
    # 因此这里直接拼好字符串，保证 SQLALCHEMY_DATABASE_URI 是普通属性。
    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}"
        f"@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
    )

    # ---------- Redis 缓存 ----------
    REDIS_URL = _env('REDIS_URL', 'redis://127.0.0.1:6379/0')
    CACHE_ENABLED = _env_bool('CACHE_ENABLED', False)
    CACHE_TTL = _env_int('CACHE_TTL', 60)

    # ---------- Celery 异步 ----------
    ASYNC_ENABLED = _env_bool('ASYNC_ENABLED', False)
    CELERY_BROKER_URL = _env('CELERY_BROKER_URL', 'redis://127.0.0.1:6379/1')
    CELERY_RESULT_BACKEND = _env('CELERY_RESULT_BACKEND', 'redis://127.0.0.1:6379/2')

    # ---------- AI 后端开关 ----------
    TEXT_BACKEND = _env('TEXT_BACKEND', 'ollama')          # ollama | deepseek
    IMAGE_BACKEND = _env('IMAGE_BACKEND', 'tongyi')        # tongyi | local
    MUSIC_BACKEND = _env('MUSIC_BACKEND', 'volcengine')    # volcengine | musicgen

    OLLAMA_BASE_URL = _env('OLLAMA_BASE_URL', 'http://127.0.0.1:11434')
    OLLAMA_MODEL = _env('OLLAMA_MODEL', 'qwen2.5:7b')
    OLLAMA_TIMEOUT = _env_int('OLLAMA_TIMEOUT', 180)

    # ---------- 第 2 批：LangChain 上下文管理 ----------
    MEMORY_ENABLED = _env_bool('MEMORY_ENABLED', True)
    MEMORY_MAX_TOKENS = _env_int('MEMORY_MAX_TOKENS', 1200)   # 超出后旧对话自动摘要压缩
    MEMORY_TTL = _env_int('MEMORY_TTL', 86400)                # 会话记忆保留秒数

    # ---------- 第 2 批：RAG 角色人设库 ----------
    RAG_ENABLED = _env_bool('RAG_ENABLED', True)
    RAG_EMBED_MODEL = _env('RAG_EMBED_MODEL', 'nomic-embed-text')
    RAG_TOP_K = _env_int('RAG_TOP_K', 3)                      # 检索注入的人设条数
    RAG_INDEX_DIR = _env('RAG_INDEX_DIR', '')                 # 留空则用 back/.rag_index

    # ---------- 第 3 批：本地 Stable Diffusion（CPU 模式） ----------
    SD_MODEL_PATH = _env('SD_MODEL_PATH', '')                 # 留空则用 back/.models/Counterfeit-V2.5_fp16.safetensors
    SD_LORA_PATH = _env('SD_LORA_PATH', '')                   # 留空则用 back/.models/lcm-lora-sdv1-5.safetensors
    SD_CONFIG_DIR = _env('SD_CONFIG_DIR', '')                 # 留空则用 back/.models/sd15-config（单文件权重必需的 diffusers 配置）
    SD_DTYPE = _env('SD_DTYPE', 'bf16')                       # bf16 | fp32（bf16 权重内存减半，Zen4 原生支持）
    SD_STEPS = _env_int('SD_STEPS', 6)                        # 配合 LCM-LoRA 的步数（无 LoRA 时自动升到 ≥15）
    SD_GUIDANCE = _env_float('SD_GUIDANCE', 1.5)              # LCM 建议 1.0~2.0
    SD_MAX_SIZE = _env_int('SD_MAX_SIZE', 768)                # 单边上限，超出夹紧（CPU 上再大会爆内存）
    SD_MAX_PIXELS = _env_int('SD_MAX_PIXELS', 512 * 512)      # 像素总量上限，超出等比缩放（CPU 耗时的决定性因素）
    # 实测：512x512 bf16 出图时本进程 RSS 峰值约 4.3GB，系统可用内存会被吃掉约 3.8GB。
    # 阈值设 4.5GB 可保证出图过程中至少还剩 ~0.7GB，不至于触发换页。
    SD_MIN_FREE_RAM_GB = _env_float('SD_MIN_FREE_RAM_GB', 4.5)  # 可用内存低于此值拒绝加载
    SD_UNLOAD_AFTER = _env_bool('SD_UNLOAD_AFTER', True)      # 出图后立刻卸载模型，不常驻内存
    SD_TIMEOUT = _env_int('SD_TIMEOUT', 900)                  # 单张图最长等待秒数（CPU 慢，给足）

    # ---------- 第 3 批：本地 MusicGen（CPU 音乐生成） ----------
    MUSIC_MODEL_DIR = _env('MUSIC_MODEL_DIR', '')             # 留空则用 back/.models/musicgen-small
    MUSIC_DTYPE = _env('MUSIC_DTYPE', 'bf16')
    MUSIC_DEFAULT_SECONDS = _env_int('MUSIC_DEFAULT_SECONDS', 10)   # 默认时长（秒）
    MUSIC_MAX_SECONDS = _env_int('MUSIC_MAX_SECONDS', 30)           # 上限（CPU 上更久会很慢）
    MUSIC_GUIDANCE = _env_float('MUSIC_GUIDANCE', 3.0)
    MUSIC_TEMPERATURE = _env_float('MUSIC_TEMPERATURE', 1.0)
    MUSIC_MIN_FREE_RAM_GB = _env_float('MUSIC_MIN_FREE_RAM_GB', 2.5)
    MUSIC_UNLOAD_AFTER = _env_bool('MUSIC_UNLOAD_AFTER', True)

    # ---------- 云端 API 密钥 ----------
    DEEPSEEK_API_KEY = _env('DEEPSEEK_API_KEY', '')
    DEEPSEEK_MODEL = _env('DEEPSEEK_MODEL', 'deepseek-chat')
    TONGYI_API_KEY = _env('TONGYI_API_KEY', '')
    VOLCENGINE_ACCESS_KEY = _env('VOLCENGINE_ACCESS_KEY', '')
    VOLCENGINE_SECRET_KEY = _env('VOLCENGINE_SECRET_KEY', '')
    # 火山「语音合成」凭据（与上面的通用 AK/SK 不同，TTS 用的是 appid + access_token）
    VOLCENGINE_APPID = _env('VOLCENGINE_APPID', '')
    VOLCENGINE_TTS_TOKEN = _env('VOLCENGINE_TTS_TOKEN', '')
    VOLCENGINE_VOICE_TYPE = _env('VOLCENGINE_VOICE_TYPE', 'BV001_streaming')
    VOLCENGINE_CLUSTER = _env('VOLCENGINE_CLUSTER', 'volcano_tts')

    @staticmethod
    def init_app(app):
        pass


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config = {
    'default': DevelopmentConfig,
    'development': DevelopmentConfig,
    'production': ProductionConfig,
}
