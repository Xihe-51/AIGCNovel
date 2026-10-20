# _*_ coding:utf-8 _*_
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from app import create_app, db
from flask_cors import CORS

app = create_app('default')
CORS(app)  # 允许所有域名的跨域请求
migrate = Migrate(app, db)
jwt = JWTManager(app)


@app.errorhandler(404)
def page_not_found(error):
    """
    404
    """
    print(error)
    return "<h1>404</h1>", 404


if __name__ == '__main__':
    import os

    # use_reloader 默认跟随 debug=True，而 watchdog 会把整个 site-packages 也纳入监视：
    # 加载 torch/diffusers 时只要这些包内有文件变动，就会触发重载并 crash
    # （实测报 WinError 10038，表现为「后端莫名消失、日志无输出」）。
    # 需要热重载时显式设 FLASK_USE_RELOADER=1。
    use_reloader = os.environ.get('FLASK_USE_RELOADER', '0') == '1'
    app.run(debug=True, host='127.0.0.1', port=8088, use_reloader=use_reloader)
