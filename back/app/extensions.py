# -*- coding=utf-8 -*-
"""
扩展与共享基础设施：
- redis_client：统一 Redis 连接（不可用时自动降级为 None）
- cache_get / cache_set / cache_delete：带降级的缓存工具
- CACHE_ENABLED 为 False 或 Redis 不可达时，所有缓存操作静默跳过，不影响主流程。
"""
import json
import functools
from flask import current_app

try:
    import redis as _redis
except Exception:  # pragma: no cover
    _redis = None

# 全局 Redis 客户端（None 表示不可用）
redis_client = None
_cache_ready = False


def init_redis(app):
    """初始化 Redis 连接。失败不抛异常，只打印警告并保持 redis_client=None。"""
    global redis_client, _cache_ready

    if not app.config.get('CACHE_ENABLED', False):
        app.logger.info('[cache] CACHE_ENABLED=false，缓存层未启用（不影响主流程）')
        _cache_ready = True
        return

    if _redis is None:
        app.logger.warning('[cache] 未安装 redis 包，缓存层降级')
        _cache_ready = True
        return

    try:
        client = _redis.from_url(
            app.config['REDIS_URL'],
            socket_connect_timeout=2,
            socket_timeout=3,
            decode_responses=True,
        )
        client.ping()
        redis_client = client
        app.logger.info(f'[cache] Redis 连接成功: {app.config["REDIS_URL"]}')
    except Exception as e:
        redis_client = None
        app.logger.warning(f'[cache] Redis 不可达，已降级为无缓存: {e}')

    _cache_ready = True


def get_redis():
    return redis_client


def cache_get(key):
    """读缓存。未启用/不可达/反序列化失败 → 返回 None。"""
    if redis_client is None:
        return None
    try:
        raw = redis_client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        return None


def cache_set(key, value, ttl=None):
    """写缓存。未启用/不可达 → 静默跳过。"""
    if redis_client is None:
        return False
    try:
        if ttl is None:
            ttl = current_app.config.get('CACHE_TTL', 60)
        redis_client.setex(key, ttl, json.dumps(value, ensure_ascii=False, default=str))
        return True
    except Exception:
        return False


def cache_delete(*keys):
    """删除若干缓存 key。"""
    if redis_client is None or not keys:
        return False
    try:
        redis_client.delete(*keys)
        return True
    except Exception:
        return False


def cache_delete_prefix(prefix):
    """按前缀批量删除（用 SCAN，避免阻塞）。"""
    if redis_client is None:
        return 0
    try:
        n = 0
        for k in redis_client.scan_iter(match=f'{prefix}*', count=200):
            redis_client.delete(k)
            n += 1
        return n
    except Exception:
        return 0


def cached(prefix, key_func=None, ttl=None):
    """
    装饰器：把视图函数返回的 JSON 结果缓存。
    key_func(*args, **kwargs) -> str，默认用请求路径 + 全部 query 参数。
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            if redis_client is None:
                return fn(*args, **kwargs)

            try:
                if key_func is not None:
                    suffix = key_func(*args, **kwargs)
                else:
                    from flask import request
                    suffix = request.full_path
                key = f'{prefix}:{suffix}'
            except Exception:
                return fn(*args, **kwargs)

            hit = cache_get(key)
            if hit is not None:
                return hit

            result = fn(*args, **kwargs)
            cache_set(key, result, ttl)
            return result

        return wrapper

    return decorator
