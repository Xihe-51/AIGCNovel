# -*- coding=utf-8 -*-
"""
统一身份校验层。

背景：此前所有接口只读取 `X-User-Id` 请求头，**从不校验 Authorization 里的 JWT**。
只要把请求头改成别人的 user_id，就能读写他人项目/角色/对话（实测可复现）。
登录接口签发的 token 形同摆设。

现在：
  - 除白名单（登录/注册/找回密码/健康检查/公开市场/公开项目列表）外，一律要求
    携带有效 Bearer token；
  - token 里的 identity 必须与 X-User-Id 一致，否则 403；
  - 视图统一通过 current_user_id() 取当前用户，不再直接信任请求头。
"""
import jwt
from flask import request, jsonify

# 不需要登录的端点（endpoint 名，Flask 内唯一）
PUBLIC_ENDPOINTS = {
    'user.login',
    'user.register',
    'user.forgot_password',
    'user.reset_password',
    'user.list_resources',
    'user.resource_detail',
    'user.search_resources',
    'ai.health',
    'project.get_public_projects_view',
}


def _bearer_token():
    auth = request.headers.get('Authorization', '') or ''
    if auth.lower().startswith('bearer '):
        return auth[7:].strip()
    return ''


def _decode(token, app):
    return jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])


def init_auth(app):
    """注册全局 before_request 守卫。"""

    @app.before_request
    def _auth_guard():
        # 预检请求 / 静态资源直接放行
        if request.method == 'OPTIONS':
            return None
        if request.path.startswith('/static/'):
            return None
        if request.endpoint in PUBLIC_ENDPOINTS:
            return None

        token = _bearer_token()
        if not token:
            return jsonify({
                'success': False, 'code': 401,
                'message': '未登录或登录已过期，请重新登录',
            }), 401

        try:
            payload = _decode(token, app)
        except jwt.ExpiredSignatureError:
            return jsonify({
                'success': False, 'code': 401,
                'message': '登录已过期，请重新登录',
            }), 401
        except Exception:
            return jsonify({
                'success': False, 'code': 401,
                'message': '无效的登录凭证',
            }), 401

        identity = payload.get('identity')
        if identity is None:
            return jsonify({
                'success': False, 'code': 401,
                'message': '登录凭证缺少用户标识',
            }), 401

        header_uid = request.headers.get('X-User-Id')
        if header_uid not in (None, '') and str(header_uid).strip() != str(identity):
            return jsonify({
                'success': False, 'code': 403,
                'message': '用户身份与登录凭证不一致',
            }), 403

        return None


def current_user_id():
    """
    取当前登录用户 ID：优先用已校验的 token identity，其次兼容仅有 X-User-Id 的
    内部调用（如 Celery 任务复用视图函数时）。无身份返回 None。
    """
    token = _bearer_token()
    if token:
        try:
            from flask import current_app
            payload = _decode(token, current_app)
            identity = payload.get('identity')
            if identity is not None:
                return int(identity)
        except Exception:
            pass

    header_uid = request.headers.get('X-User-Id', type=int)
    return header_uid
