# -*- coding=utf-8 -*-
"""
Celery 应用实例。

- broker / backend 均使用 Redis（含降级：Redis 不可用时任务不会被投递）
- Windows 必须用 `-P solo` 启动 worker
- 启动命令：
    .venv/Scripts/python.exe -m celery -A celery_app worker -l info -P solo --concurrency=1
"""
from celery import Celery

from app import create_app

flask_app = create_app('default')

celery_app = Celery(
    'aigc',
    broker=flask_app.config['CELERY_BROKER_URL'],
    backend=flask_app.config['CELERY_RESULT_BACKEND'],
    include=['app.ai.tasks'],
)

celery_app.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='Asia/Shanghai',
    enable_utc=False,
    # 长任务：结果保留 1 小时，超时放宽
    result_expires=3600,
    task_time_limit=900,
    task_soft_time_limit=840,
    # 同一时刻只处理 1 个任务，避免 8G 显存/16G 内存被打爆
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)


class FlaskTask(celery_app.Task):
    """让每个 Celery 任务都在 Flask app context 中运行，才能用 db / current_app。"""

    def __call__(self, *args, **kwargs):
        with flask_app.app_context():
            return self.run(*args, **kwargs)


celery_app.Task = FlaskTask
