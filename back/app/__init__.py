# _*_ Coding:utf-8 _*_
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from config import config
from app.extensions import init_redis
from app.security import init_auth

db = SQLAlchemy()


def create_app(config_name):
    app = Flask(__name__)
    # 配置所有的config变量
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)
    db.init_app(app)

    # 安全提醒：默认 SECRET_KEY 只适合本地开发，生产环境必须换成随机值
    if str(app.config.get('SECRET_KEY') or '') in ('', 'ailab'):
        app.logger.warning(
            '[security] SECRET_KEY 仍是默认值，请在 back/.env 设置随机 SECRET_KEY；'
            '否则知道默认值即可伪造登录令牌'
        )

    # 初始化缓存层（不可用时自动降级，不阻塞启动）
    init_redis(app)

    # 确保新增表（save_slots 等）存在；create_all 只建缺失表，不改已有表结构
    try:
        from . import models  # noqa: F401  确保模型已注册
        with app.app_context():
            db.create_all()
    except Exception as e:  # pragma: no cover - 建表失败不阻塞启动
        app.logger.warning(f'[db] create_all 失败（可能无建表权限）: {e}')

    # 统一身份校验：除白名单外必须携带有效 JWT（此前只认 X-User-Id，可任意伪造）
    init_auth(app)

    # 预热重型 AI 后端模块（torch/diffusers/transformers），避免首次 /ai/health 阻塞 30s+
    try:
        from app.ai.health_warmup import start_warmup
        start_warmup(app)
    except Exception as e:  # pragma: no cover - 预热失败不影响启动
        app.logger.warning(f'[health] 预热任务启动失败: {e}')

    from app.ai import ai as ai_blueprint
    app.register_blueprint(ai_blueprint, url_prefix="/ai")
    from app.user import user as user_blueprint
    app.register_blueprint(user_blueprint, url_prefix="/user")
    from app.project import project as project_blueprint
    app.register_blueprint(project_blueprint, url_prefix="/project")
    return app
