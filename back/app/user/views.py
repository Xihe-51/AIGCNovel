import os
import random
import threading
import time
from datetime import datetime, timedelta
import jwt
from flask import current_app, jsonify, request
from werkzeug.exceptions import Unauthorized, BadRequest, NotFound
from werkzeug.security import check_password_hash, generate_password_hash
from sqlalchemy.exc import IntegrityError
from werkzeug.utils import secure_filename

from . import user
from .services import get_ai_generations_by_user, get_ai_model_by_user, delete_ai_generation_by_id, get_user_statistics, \
    get_user_projects, get_user_models, update_avatar, update_user_info, get_user_info, delete_ai_model, \
    update_ai_model, create_ai_model, get_model_detail, get_market_resources, get_market_resource_detail, \
    create_market_resource, update_market_resource, delete_market_resource, search_market_resources, \
    ensure_upload_folders_exist, allowed_file, ALLOWED_EXTENSIONS, MAX_CONTENT_LENGTH, get_upload_folder, \
    increment_download_count, reference_resource, unreference_resource
from .. import db
from ..models import User
from ..security import current_user_id

'''
    1.登录注册
'''


@user.route('/register', methods=['POST'])
def register():
    data = request.get_json()

    # 验证输入数据
    email = data.get('email')
    phone = data.get('phone')
    password = data.get('password')
    username = data.get('username')
    if not all([email, password, username]):  # 检查必要字段是否存在
        return jsonify({'error': '请填写全部信息'}), 405

    # 创建用户对象
    user = User(
        email=email,
        phone=phone,
        password_hash=generate_password_hash(password),  # 生成密码哈希
        username=username,
        created_at=datetime.now()
    )

    # 尝试将用户添加到数据库
    try:
        db.session.add(user)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()  # 回滚事务以处理完整性错误
        return jsonify({'error': '用户已存在'}), 400

    return jsonify({'message': '注册成功'}), 200


@user.route('/login', methods=['POST'])
def login():
    # 获取请求的数据
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    # 验证用户
    user = User.query.filter_by(username=username).first()
    if user is None or not check_password_hash(user.password_hash, password):
        return jsonify({"msg": "账号或密码错误"}), 401

    # 生成 JWT token，有效期为 24 小时（用 UTC，避免本地时区把有效期拉长 8 小时）
    access_token = jwt.encode({
        'identity': user.user_id,
        'role': 'STUDENT',  # 假设所有注册用户的角色为学生
        'userName': user.username,
        'exp': datetime.utcnow() + timedelta(hours=24)
    }, current_app.config['SECRET_KEY'], algorithm='HS256')

    # 更新用户的最后登录时间
    user.last_login = datetime.now()
    db.session.commit()

    return jsonify(access_token=access_token), 200


'''
    1.1 密码找回（此前前端只是「点两下就到成功」的纯 UI 摆设，后端无任何接口）
'''

_RESET_TTL_SECONDS = 600
_RESET_MAX_ATTEMPTS = 5
_RESET_CODES = {}          # email -> {'code', 'expires_at', 'attempts'}
_RESET_LOCK = threading.Lock()


def _store_reset_code(email, code):
    with _RESET_LOCK:
        _RESET_CODES[email] = {
            'code': code,
            'expires_at': time.time() + _RESET_TTL_SECONDS,
            'attempts': 0,
        }
    # Redis 可用时多存一份（多进程/重启后仍有效）
    try:
        from ..extensions import cache_set
        cache_set(f'pwdreset:{email}', {'code': code}, _RESET_TTL_SECONDS)
    except Exception:
        pass


def _verify_reset_code(email, code):
    """返回 (ok, message)。校验失败累计次数，超过上限即作废。"""
    with _RESET_LOCK:
        rec = _RESET_CODES.get(email)
        if not rec:
            # 本进程没有记录时尝试 Redis（多进程场景）
            try:
                from ..extensions import cache_get
                cached = cache_get(f'pwdreset:{email}')
                if cached:
                    rec = {'code': cached.get('code'), 'expires_at': time.time() + 60, 'attempts': 0}
                    _RESET_CODES[email] = rec
            except Exception:
                rec = None
        if not rec:
            return False, '验证码无效或已过期，请重新获取'
        if time.time() > rec['expires_at']:
            _RESET_CODES.pop(email, None)
            return False, '验证码已过期，请重新获取'
        if rec['attempts'] >= _RESET_MAX_ATTEMPTS:
            _RESET_CODES.pop(email, None)
            return False, '尝试次数过多，请重新获取验证码'
        if str(code).strip() != str(rec['code']):
            rec['attempts'] += 1
            return False, '验证码不正确'
        return True, ''


def _clear_reset_code(email):
    with _RESET_LOCK:
        _RESET_CODES.pop(email, None)
    try:
        from ..extensions import cache_delete
        cache_delete(f'pwdreset:{email}')
    except Exception:
        pass


@user.route('/forgot_password', methods=['POST'])
def forgot_password():
    """发送重置验证码。未配置邮件服务时，开发模式直接把验证码回传给前端。"""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email:
        return jsonify({'code': 400, 'message': '请输入有效的邮箱地址'}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        # 不暴露邮箱是否已注册，避免被用来枚举用户
        return jsonify({'code': 200, 'message': '如果该邮箱已注册，验证码已发送'}), 200

    code = f'{random.randint(0, 999999):06d}'
    _store_reset_code(email, code)

    payload = {'code': 200, 'message': '验证码已发送，10 分钟内有效'}
    # 没有邮件通道时，开发模式回传验证码；生产环境请配置 MAIL_ENABLED 或自行接入邮件服务
    if current_app.config.get('DEBUG') and not current_app.config.get('MAIL_ENABLED'):
        payload['data'] = {
            'debug_code': code,
            'note': '未配置邮件服务，开发模式直接返回验证码',
        }
        current_app.logger.info(f'[reset] {email} 的验证码：{code}')

    return jsonify(payload), 200


@user.route('/reset_password', methods=['POST'])
def reset_password():
    """用邮箱 + 验证码重置密码。"""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    code = data.get('code') or ''
    new_password = data.get('new_password') or ''

    if not email or not code or not new_password:
        return jsonify({'code': 400, 'message': '邮箱、验证码和新密码均不能为空'}), 400
    if len(new_password) < 6:
        return jsonify({'code': 400, 'message': '新密码至少 6 位'}), 400

    ok, msg = _verify_reset_code(email, code)
    if not ok:
        return jsonify({'code': 400, 'message': msg}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'code': 400, 'message': '验证码无效或已过期，请重新获取'}), 400

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    _clear_reset_code(email)
    return jsonify({'code': 200, 'message': '密码重置成功，请使用新密码登录'}), 200


'''
    2.ai生成控制台
'''


@user.route('/ai_model', methods=['GET'])
def api_get_ai_model_by_user():
    try:
        user_id = current_user_id()
        models = get_ai_model_by_user(db.session, user_id)

        # 格式化数据，转换成字典列表
        result = []
        for m in models:
            result.append({
                'model_id': m.model_id,
                'user_id': m.user_id,
                'model_path': m.model_path,
                'name': m.name,
                'type': m.type,
                'created_at': m.created_at.isoformat() if m.created_at else None,
            })

        return jsonify({'data': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@user.route('/ai_history', methods=['GET'])
def api_get_ai_generations_by_user():
    try:
        user_id = current_user_id()
        generations = get_ai_generations_by_user(db.session, user_id)

        # 格式化数据，转换成字典列表
        result = []
        for gen in generations:
            result.append({
                'generation_id': gen.generation_id,
                'user_id': gen.user_id,
                'prompt_text': gen.prompt_text,
                'generated_text': gen.generated_text,
                'length': gen.length,
                'type': gen.type,
                'forbidden_words': gen.forbidden_words,
                'created_at': gen.created_at.isoformat() if gen.created_at else None,
            })

        return jsonify({'data': result, 'count': len(result)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@user.route('/ai_history/<int:generation_id>', methods=['DELETE'])
def api_delete_ai_generation(generation_id):
    try:
        user_id = current_user_id()
        if not user_id:
            return jsonify({'error': 'User ID missing'}), 400
        # 删除记录
        delete_ai_generation_by_id(db.session, generation_id)
        return jsonify({'message': '删除成功'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


'''
    3.个人中心
'''


@user.route('/profile', methods=['GET'])
def user_profile():
    """
    获取当前用户个人信息
    """
    user_id = current_user_id()
    if not user_id:
        raise Unauthorized('用户未登录')

    user_info = get_user_info(user_id)
    if not user_info:
        raise NotFound('用户不存在')

    return jsonify({
        'code': 200,
        'message': 'success',
        'data': user_info
    })


@user.route('/profile', methods=['PUT'])
def update_profile():
    """
    更新用户个人信息
    """
    user_id = current_user_id()
    if not user_id:
        raise Unauthorized('用户未登录')

    data = request.get_json()
    if not data:
        raise BadRequest('无效的请求数据')

    success = update_user_info(user_id, data)
    if not success:
        raise NotFound('用户不存在')

    return jsonify({
        'code': 200,
        'message': '用户信息更新成功'
    })


@user.route('/avatar', methods=['POST'])
def upload_avatar():
    """
    上传用户头像
    """
    user_id = current_user_id()
    if not user_id:
        raise Unauthorized('用户未登录')

    if 'avatar' not in request.files:
        raise BadRequest('未上传头像文件')

    avatar_file = request.files['avatar']
    if avatar_file.filename == '':
        raise BadRequest('未选择文件')

    # 检查文件扩展名
    allowed_extensions = {'png', 'jpg', 'jpeg', 'gif'}
    if '.' not in avatar_file.filename or \
            avatar_file.filename.rsplit('.', 1)[1].lower() not in allowed_extensions:
        raise BadRequest('不允许的文件类型')

    avatar_url = update_avatar(user_id, avatar_file)
    if not avatar_url:
        raise NotFound('用户不存在')

    return jsonify({
        'code': 200,
        'message': '头像上传成功',
        'data': {
            'avatar_url': avatar_url
        }
    })


@user.route('/models', methods=['GET'])
def user_models():
    """
    获取用户创建的AI模型列表（不分页）
    """
    user_id = current_user_id()
    if not user_id:
        raise Unauthorized('用户未登录')

    try:
        models_data = get_user_models(user_id)
        return jsonify({
            'code': 200,
            'message': 'success',
            'data': models_data
        })
    except Exception as e:
        print(e)
        return jsonify({
            'code': 500,
            'message': '获取模型列表失败'
        }), 500


@user.route('/projects', methods=['GET'])
def user_projects():
    """
    获取用户创建的项目列表
    """
    user_id = current_user_id()
    if not user_id:
        raise Unauthorized('用户未登录')

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)

    projects_data = get_user_projects(user_id, page, per_page)

    return jsonify({
        'code': 200,
        'message': 'success',
        'data': projects_data
    })


@user.route('/statistics', methods=['GET'])
def user_statistics():
    """
    获取用户统计数据
    """
    user_id = current_user_id()
    if not user_id:
        raise Unauthorized('用户未登录')

    stats = get_user_statistics(user_id)

    return jsonify({
        'code': 200,
        'message': 'success',
        'data': stats
    })


@user.route('/models', methods=['POST'])
def create_model():
    """创建AI模型"""
    user_id = current_user_id()
    if not user_id:
        raise Unauthorized('用户未登录')

    data = request.get_json()
    required_fields = ['name', 'style_description', 'model_path']
    if not all(field in data for field in required_fields):
        return jsonify({'code': 400, 'message': '缺少必要参数'}), 400

    try:
        model = create_ai_model(
            user_id=user_id,
            name=data['name'],
            style_description=data['style_description'],
            model_path=data['model_path'],
            model_type=data.get('type')
        )
        return jsonify({
            'code': 200,
            'message': '创建成功',
            'data': {
                'model_id': model.model_id,
                'name': model.name,
                'style_description': model.style_description,
                'type': model.type,
                'created_at': model.created_at.isoformat()
            }
        })
    except Exception as e:
        db.session.rollback()
        print(e)
        return jsonify({'code': 500, 'message': '创建模型失败'}), 500


@user.route('/models/<int:model_id>', methods=['PATCH'])
def update_model(model_id):
    """更新AI模型"""
    user_id = current_user_id()
    if not user_id:
        raise Unauthorized('用户未登录')

    data = request.get_json()
    if not data:
        return jsonify({'code': 400, 'message': '无更新数据'}), 400

    try:
        model = update_ai_model(user_id, model_id, **data)
        if not model:
            return jsonify({'code': 404, 'message': '模型不存在或无权访问'}), 404

        return jsonify({
            'code': 200,
            'message': '更新成功',
            'data': {
                'model_id': model.model_id,
                'name': model.name,
                'style_description': model.style_description,
                'type': model.type
            }
        })
    except Exception as e:
        db.session.rollback()
        print(e)
        return jsonify({'code': 500, 'message': '更新模型失败'}), 500


@user.route('/models/<int:model_id>', methods=['DELETE'])
def delete_model(model_id):
    """删除AI模型"""
    user_id = current_user_id()
    if not user_id:
        raise Unauthorized('用户未登录')

    try:
        success = delete_ai_model(user_id, model_id)
        if not success:
            return jsonify({'code': 404, 'message': '模型不存在或无权访问'}), 404

        return jsonify({'code': 200, 'message': '删除成功'})
    except Exception as e:
        db.session.rollback()
        print(e)
        return jsonify({'code': 500, 'message': '删除模型失败'}), 500


@user.route('/models/<int:model_id>', methods=['GET'])
def get_model(model_id):
    """获取单个模型详情"""
    user_id = current_user_id()
    if not user_id:
        raise Unauthorized('用户未登录')

    try:
        model_detail = get_model_detail(user_id, model_id)
        if not model_detail:
            return jsonify({'code': 404, 'message': '模型不存在或无权访问'}), 404

        return jsonify({
            'code': 200,
            'message': 'success',
            'data': model_detail
        })
    except Exception as e:
        print(e)
        return jsonify({'code': 500, 'message': '获取模型详情失败'}), 500


'''
    4.资源市场
'''


@user.route('/resources', methods=['GET'])
def list_resources():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    return jsonify(get_market_resources(page, per_page))


@user.route('/resources/<int:resource_id>', methods=['GET'])
def resource_detail(resource_id):
    return jsonify(get_market_resource_detail(resource_id))


@user.route('/resources', methods=['POST'])
def create_resource():
    data = request.get_json()
    uploader_id = current_user_id()
    if not uploader_id:
        return jsonify({'code': 401, 'message': '未授权'}), 401
    return jsonify(create_market_resource(uploader_id, data))


@user.route('/resources/<int:resource_id>', methods=['PUT'])
def update_resource(resource_id):
    data = request.get_json()
    uploader_id = current_user_id()
    if not uploader_id:
        return jsonify({'code': 401, 'message': '未授权'}), 401
    return jsonify(update_market_resource(resource_id, uploader_id, data))


@user.route('/resources/<int:resource_id>', methods=['DELETE'])
def delete_resource(resource_id):
    uploader_id = current_user_id()
    if not uploader_id:
        return jsonify({'code': 401, 'message': '未授权'}), 401
    return jsonify(delete_market_resource(resource_id, uploader_id))


@user.route('/download/<int:resource_id>', methods=['POST'])
def download_resource(resource_id):
    return jsonify(increment_download_count(resource_id))


@user.route('/resources/<int:resource_id>/reference', methods=['POST'])
def reference_resource_view(resource_id):
    """把素材引用到自己的某个项目（幂等）。"""
    uid = current_user_id()
    if not uid:
        return jsonify({'code': 401, 'message': '未授权'}), 401
    data = request.get_json(silent=True) or {}
    project_id = data.get('project_id')
    if project_id is None:
        return jsonify({'code': 400, 'message': '缺少 project_id'}), 400
    payload, status = reference_resource(resource_id, uid, project_id)
    return jsonify(payload), status


@user.route('/resources/<int:resource_id>/reference', methods=['DELETE'])
def unreference_resource_view(resource_id):
    """取消素材对某项目的引用（幂等）。"""
    uid = current_user_id()
    if not uid:
        return jsonify({'code': 401, 'message': '未授权'}), 401
    project_id = request.args.get('project_id', type=int)
    if project_id is None:
        return jsonify({'code': 400, 'message': '缺少 project_id'}), 400
    payload, status = unreference_resource(resource_id, uid, project_id)
    return jsonify(payload), status


@user.route('/resources/search', methods=['GET'])
def search_resources():
    keyword = request.args.get('keyword', '')
    resource_type = request.args.get('type')
    min_price = request.args.get('min_price', type=float)
    max_price = request.args.get('max_price', type=float)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)

    return jsonify(search_market_resources(
        keyword=keyword,
        resource_type=resource_type,
        min_price=min_price,
        max_price=max_price,
        page=page,
        per_page=per_page
    ))


@user.route('/api/upload', methods=['POST'])
def upload_file():
    """文件上传接口"""
    # 确保上传目录存在
    ensure_upload_folders_exist()

    # 检查是否有文件被上传
    if 'file' not in request.files:
        return jsonify({'code': 400, 'message': '没有选择文件'}), 400

    file = request.files['file']

    # 检查文件名是否为空
    if file.filename == '':
        return jsonify({'code': 400, 'message': '没有选择文件'}), 400

    # 检查文件扩展名
    file_type = allowed_file(file.filename)
    if not file_type:
        return jsonify({
            'code': 400,
            'message': '不支持的文件类型，仅支持: ' + ', '.join(
                ext for exts in ALLOWED_EXTENSIONS.values() for ext in exts
            )
        }), 400

    # 检查文件大小
    if request.content_length > MAX_CONTENT_LENGTH:
        return jsonify({
            'code': 400,
            'message': f'文件太大，最大允许 {MAX_CONTENT_LENGTH // (1024 * 1024)}MB'
        }), 400

    try:
        # 安全化文件名并添加时间戳防止重名
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        filename = f"{timestamp}_{filename}"

        # 确定保存路径
        upload_folder = get_upload_folder(file_type)
        filepath = os.path.join(upload_folder, filename)

        # 保存文件
        file.save(filepath)

        # 返回相对URL路径
        relative_path = os.path.join('/static', 'uploads', file_type + 's', filename).replace('\\', '/')
        # print(relative_path)
        return jsonify({
            'code': 200,
            'message': '文件上传成功',
            'data': {
                'file_url': relative_path,
                'file_type': file_type
            }
        })
    except Exception as e:
        return jsonify({
            'code': 500,
            'message': f'文件上传失败: {str(e)}'
        }), 500