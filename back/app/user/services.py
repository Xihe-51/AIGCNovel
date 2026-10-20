import os
from datetime import datetime
from typing import List

from sqlalchemy import desc
from sqlalchemy.orm import Session
from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename

from .. import db
from ..models import AIGeneration, AIModel, User, Project, MarketResource, ResourceReference

'''
    ai生成控制台
'''


def get_ai_generations_by_user(db_session: Session, user_id: int) -> List[AIGeneration]:
    """
    根据 user_id 查询所有对应的 AIGeneration 记录
    """
    return db_session.query(AIGeneration).filter(AIGeneration.user_id == user_id).all()


def delete_ai_generation_by_id(db_session: Session, generation_id: int) -> bool:
    """
    根据 generation_id 删除对应的 AIGeneration 记录
    返回 True 表示删除成功，False 表示未找到该记录
    """
    generation = db_session.query(AIGeneration).filter(AIGeneration.generation_id == generation_id).first()
    if not generation:
        return False
    if generation.type != "text":
        path = generation.generated_text.replace("/", "app/", 1)
        print(generation.generated_text)
        os.remove(path)
    db_session.delete(generation)
    db_session.commit()
    return True


def get_ai_model_by_user(db_session: Session, user_id: int) -> List[AIGeneration]:
    """
    根据 user_id 查询所有对应的 AIModel 记录
    """
    return db_session.query(AIModel).filter(AIModel.user_id == user_id).all()


'''
    个人中心
'''


def get_user_info(user_id):
    """
    获取用户基本信息
    """
    user = User.query.get(user_id)
    if not user:
        return None

    return {
        'user_id': user.user_id,
        'username': user.username,
        'email': user.email,
        'phone': user.phone,
        'avatar_url': user.avatar_url,
        'created_at': user.created_at.isoformat() if user.created_at else None,
        'last_login': user.last_login.isoformat() if user.last_login else None
    }


def update_user_info(user_id, update_data):
    """
    更新用户基本信息
    """
    user = User.query.get(user_id)
    if not user:
        return False

    if 'username' in update_data:
        user.username = update_data['username']
    if 'email' in update_data:
        user.email = update_data['email']
    if 'phone' in update_data:
        user.phone = update_data['phone']
    if 'password' in update_data:
        user.password_hash = generate_password_hash(update_data['password'])

    db.session.commit()
    return True


def update_avatar(user_id, avatar_file):
    """
    更新用户头像
    """
    user = User.query.get(user_id)
    if not user:
        return None

    # 确保上传目录存在
    upload_folder = f"app/static/avatar/{user_id}"
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)

    # 生成安全的文件名
    filename = secure_filename(f"avatar_{user_id}_{datetime.now().timestamp()}.{avatar_file.filename.split('.')[-1]}")
    filepath = os.path.join(upload_folder, filename)

    # 保存文件
    avatar_file.save(filepath)

    # 更新数据库中的头像URL
    avatar_url = f"/static/avatar/{user_id}/{filename}"
    user.avatar_url = avatar_url
    db.session.commit()

    return avatar_url


def get_user_models(user_id):
    """
    获取用户创建的AI模型列表
    """
    # 获取所有模型
    all_models = AIModel.query.filter_by(user_id=user_id).order_by(AIModel.created_at.desc()).all()

    # 转换为字典列表
    models_list = []
    for model in all_models:
        models_list.append({
            'model_id': model.model_id,
            'name': model.name,
            'style_description': model.style_description,
            'type': model.type,
            'model_path': model.model_path,
            'created_at': model.created_at.isoformat() if model.created_at else None
        })

    return {
        'models': models_list,
        'total': len(models_list)
    }


def get_user_projects(user_id, page=1, per_page=10):
    """
    获取用户创建的项目列表
    """
    query = Project.query.filter_by(user_id=user_id).order_by(Project.updated_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    projects = []
    for project in pagination.items:
        projects.append({
            'project_id': project.project_id,
            'title': project.title,
            'cover_url': project.cover_url,
            'genre': project.genre,
            'word_count': project.word_count,
            'created_at': project.created_at.isoformat() if project.created_at else None,
            'updated_at': project.updated_at.isoformat() if project.updated_at else None
        })

    return {
        'projects': projects,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    }


def get_user_statistics(user_id):
    """
    获取用户统计数据
    """
    # 项目数量
    project_count = Project.query.filter_by(user_id=user_id).count()

    # 模型数量
    model_count = AIModel.query.filter_by(user_id=user_id).count()

    # 总字数
    total_word_count = db.session.query(db.func.sum(Project.word_count)).filter_by(user_id=user_id).scalar() or 0

    # 最近活跃时间
    last_project = Project.query.filter_by(user_id=user_id).order_by(Project.updated_at.desc()).first()
    last_active = last_project.updated_at if last_project else None

    return {
        'project_count': project_count,
        'model_count': model_count,
        'total_word_count': total_word_count,
        'last_active': last_active.isoformat() if last_active else None
    }


# 新增模型
def create_ai_model(user_id, name, style_description, model_path, model_type=None):
    """
    创建新的AI模型
    :param user_id: 用户ID
    :param name: 模型名称
    :param style_description: 风格描述
    :param model_path: 模型路径
    :param model_type: 模型类型(可选)
    :return: 创建的模型对象
    """
    new_model = AIModel(
        user_id=user_id,
        name=name,
        style_description=style_description,
        model_path=model_path,
        type=model_type
    )
    db.session.add(new_model)
    db.session.commit()
    return new_model


# 更新模型
def update_ai_model(user_id, model_id, **kwargs):
    """
    更新AI模型信息
    :param user_id: 用户ID(用于验证所有权)
    :param model_id: 要更新的模型ID
    :param kwargs: 可更新字段(name, style_description, model_path, type)
    :return: 更新后的模型对象或None(如果未找到)
    """
    model = AIModel.query.filter_by(model_id=model_id, user_id=user_id).first()
    if not model:
        return None

    allowed_fields = ['name', 'style_description', 'model_path', 'type']
    for field, value in kwargs.items():
        if field in allowed_fields and value is not None:
            setattr(model, field, value)

    db.session.commit()
    return model


# 删除模型
def delete_ai_model(user_id, model_id):
    """
    删除AI模型
    :param user_id: 用户ID(用于验证所有权)
    :param model_id: 要删除的模型ID
    :return: 是否删除成功
    """
    model = AIModel.query.filter_by(model_id=model_id, user_id=user_id).first()
    if not model:
        return False

    db.session.delete(model)
    db.session.commit()
    return True


# 获取单个模型详情
def get_model_detail(user_id, model_id):
    """
    获取单个模型详情
    :param user_id: 用户ID(用于验证所有权)
    :param model_id: 模型ID
    :return: 模型详情或None(如果未找到)
    """
    model = AIModel.query.filter_by(model_id=model_id, user_id=user_id).first()
    if not model:
        return None

    return {
        'model_id': model.model_id,
        'name': model.name,
        'style_description': model.style_description,
        'model_path': model.model_path,
        'type': model.type,
        'created_at': model.created_at.isoformat() if model.created_at else None
    }


'''
    资源市场
'''


def _reference_count_map(resource_ids):
    """批量统计素材被引用到项目的次数（resource_id → 引用数）。"""
    if not resource_ids:
        return {}
    rows = (
        db.session.query(ResourceReference.resource_id,
                         db.func.count(ResourceReference.reference_id))
        .filter(ResourceReference.resource_id.in_(resource_ids))
        .group_by(ResourceReference.resource_id)
        .all()
    )
    return {rid: cnt for rid, cnt in rows}


def get_market_resources(page=1, per_page=10):
    """
    获取市场资源列表（分页）
    :param page: 页码
    :param per_page: 每页数量
    :return: 分页后的资源列表
    """
    resources = MarketResource.query.order_by(
        MarketResource.created_at.desc()
    ).paginate(page=page, per_page=per_page, error_out=False)

    ref_map = _reference_count_map([r.resource_id for r in resources.items])

    resources_list = []
    for resource in resources.items:
        resources_list.append({
            'resource_id': resource.resource_id,
            'uploader_id': resource.uploader_id,
            'username': User.query.filter_by(user_id=resource.uploader_id).first().username,
            'title': resource.title,
            'description': resource.description,
            'resource_type': resource.resource_type,
            'file_url': resource.file_url,
            'price': float(resource.price) if resource.price else 0,
            'license_type': resource.license_type,
            'download_count': resource.download_count,
            'reference_count': ref_map.get(resource.resource_id, 0),
            'created_at': resource.created_at.isoformat() if resource.created_at else None
        })

    return {
        'code': 200,
        'message': 'success',
        'data': {
            'resources': resources_list,
            'total': resources.total,
            'pages': resources.pages,
            'current_page': page
        }
    }


def get_market_resource_detail(resource_id):
    """
    获取单个市场资源详情
    :param resource_id: 资源ID
    :return: 资源详情或404
    """
    resource = MarketResource.query.get(resource_id)
    if not resource:
        return {'code': 404, 'message': '资源不存在'}, 404

    reference_count = ResourceReference.query.filter_by(resource_id=resource_id).count()

    return {
        'code': 200,
        'message': 'success',
        'data': {
            'resource_id': resource.resource_id,
            'uploader_id': resource.uploader_id,
            'title': resource.title,
            'description': resource.description,
            'resource_type': resource.resource_type,
            'username': User.query.filter_by(user_id=resource.uploader_id).first().username,
            'file_url': resource.file_url,
            'price': float(resource.price) if resource.price else 0,
            'license_type': resource.license_type,
            'download_count': resource.download_count,
            'reference_count': reference_count,
            'created_at': resource.created_at.isoformat() if resource.created_at else None
        }
    }


def reference_resource(resource_id, user_id, project_id):
    """
    把素材引用到自己的项目（幂等：同 (资源, 用户, 项目) 重复引用只算一次）。

    :return: (dict 响应, http 状态码)
    """
    resource = MarketResource.query.get(resource_id)
    if not resource:
        return {'code': 404, 'message': '资源不存在'}, 404

    project = Project.query.filter_by(project_id=project_id, user_id=user_id).first()
    if not project:
        return {'code': 404, 'message': '项目不存在或无权访问'}, 404

    try:
        existing = ResourceReference.query.filter_by(
            resource_id=resource_id, user_id=user_id, project_id=project_id
        ).first()
        if not existing:
            db.session.add(ResourceReference(
                resource_id=resource_id, user_id=user_id, project_id=project_id))
            db.session.commit()

        count = ResourceReference.query.filter_by(resource_id=resource_id).count()
        return {
            'code': 200,
            'message': '引用成功',
            'data': {
                'resource_id': resource_id,
                'project_id': project_id,
                'reference_count': count,
                'already_referenced': bool(existing),
            }
        }, 200
    except Exception as e:
        db.session.rollback()
        return {'code': 500, 'message': f'引用失败: {str(e)}'}, 500


def unreference_resource(resource_id, user_id, project_id):
    """
    取消素材对某项目的引用（幂等：不存在也返回成功）。

    :return: (dict 响应, http 状态码)
    """
    resource = MarketResource.query.get(resource_id)
    if not resource:
        return {'code': 404, 'message': '资源不存在'}, 404

    try:
        ResourceReference.query.filter_by(
            resource_id=resource_id, user_id=user_id, project_id=project_id
        ).delete(synchronize_session=False)
        db.session.commit()

        count = ResourceReference.query.filter_by(resource_id=resource_id).count()
        return {
            'code': 200,
            'message': '已取消引用',
            'data': {
                'resource_id': resource_id,
                'project_id': project_id,
                'reference_count': count,
            }
        }, 200
    except Exception as e:
        db.session.rollback()
        return {'code': 500, 'message': f'取消引用失败: {str(e)}'}, 500


def create_market_resource(uploader_id, data):
    """
    创建市场资源
    :param uploader_id: 上传者ID
    :param data: 包含资源数据的字典
    :return: 创建的资源或错误
    """
    required_fields = ['title', 'resource_type', 'file_url', 'license_type']
    if not all(field in data for field in required_fields):
        return {'code': 400, 'message': '缺少必要参数'}, 400

    try:
        new_resource = MarketResource(
            uploader_id=uploader_id,
            title=data['title'],
            description=data.get('description'),
            resource_type=data['resource_type'],
            file_url=data['file_url'],
            price=data.get('price', 0),
            license_type=data['license_type']
        )

        db.session.add(new_resource)
        db.session.commit()

        return {
            'code': 201,
            'message': '资源创建成功',
            'data': {
                'resource_id': new_resource.resource_id,
                'created_at': new_resource.created_at.isoformat()
            }
        }
    except Exception as e:
        db.session.rollback()
        return {'code': 500, 'message': f'创建资源失败: {str(e)}'}, 500


def update_market_resource(resource_id, uploader_id, data):
    """
    更新市场资源
    :param resource_id: 资源ID
    :param uploader_id: 上传者ID（用于验证所有权）
    :param data: 包含更新数据的字典
    :return: 更新后的资源或错误
    """
    resource = MarketResource.query.filter_by(
        resource_id=resource_id,
        uploader_id=uploader_id
    ).first()

    if not resource:
        return {'code': 404, 'message': '资源不存在或无权修改'}, 404

    try:
        allowed_fields = ['title', 'description', 'resource_type', 'file_url', 'price', 'license_type']
        for field, value in data.items():
            if field in allowed_fields and value is not None:
                setattr(resource, field, value)

        db.session.commit()

        return {
            'code': 200,
            'message': '资源更新成功',
            'data': {
                'resource_id': resource.resource_id,
                'updated_fields': list(data.keys())
            }
        }
    except Exception as e:
        db.session.rollback()
        return {'code': 500, 'message': f'更新资源失败: {str(e)}'}, 500


def delete_market_resource(resource_id, uploader_id):
    """
    删除市场资源
    :param resource_id: 资源ID
    :param uploader_id: 上传者ID（用于验证所有权）
    :return: 删除结果
    """
    resource = MarketResource.query.filter_by(
        resource_id=resource_id,
        uploader_id=uploader_id
    ).first()

    if not resource:
        return {'code': 404, 'message': '资源不存在或无权删除'}, 404

    try:
        # 引用计数记录外键引用该素材，先清理再删素材（否则外键约束报错）
        ResourceReference.query.filter_by(resource_id=resource_id).delete(synchronize_session=False)
        db.session.delete(resource)
        db.session.commit()
        return {'code': 200, 'message': '资源删除成功'}
    except Exception as e:
        db.session.rollback()
        return {'code': 500, 'message': f'删除资源失败: {str(e)}'}, 500


def increment_download_count(resource_id):
    """
    增加资源下载计数
    :param resource_id: 资源ID
    :return: 无
    """
    try:
        resource = MarketResource.query.get(resource_id)
        if resource:
            resource.download_count = MarketResource.download_count + 1
            db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"更新下载计数失败: {str(e)}")


def search_market_resources(keyword, resource_type=None, min_price=None, max_price=None, page=1, per_page=10):
    """
    搜索市场资源
    :param keyword: 搜索关键词
    :param resource_type: 资源类型筛选
    :param min_price: 最低价格
    :param max_price: 最高价格
    :param page: 页码
    :param per_page: 每页数量
    :return: 分页后的搜索结果
    """
    query = MarketResource.query

    if keyword:
        query = query.filter(
            db.or_(
                MarketResource.title.ilike(f'%{keyword}%'),
                MarketResource.description.ilike(f'%{keyword}%')
            )
        )

    if resource_type:
        query = query.filter(MarketResource.resource_type == resource_type)

    if min_price is not None:
        query = query.filter(MarketResource.price >= min_price)

    if max_price is not None:
        query = query.filter(MarketResource.price <= max_price)

    resources = query.order_by(
        MarketResource.created_at.desc()
    ).paginate(page=page, per_page=per_page, error_out=False)

    ref_map = _reference_count_map([r.resource_id for r in resources.items])

    resources_list = []
    for resource in resources.items:
        resources_list.append({
            'resource_id': resource.resource_id,
            'uploader_id': resource.uploader_id,
            'title': resource.title,
            'description': resource.description,
            'resource_type': resource.resource_type,
            'username': User.query.filter_by(user_id=resource.uploader_id).first().username,
            'file_url': resource.file_url,
            'price': float(resource.price) if resource.price else 0,
            'license_type': resource.license_type,
            'download_count': resource.download_count,
            'reference_count': ref_map.get(resource.resource_id, 0),
            'created_at': resource.created_at.isoformat() if resource.created_at else None
        })

    return {
        'code': 200,
        'message': 'success',
        'data': {
            'resources': resources_list,
            'total': resources.total,
            'pages': resources.pages,
            'current_page': page
        }
    }


# 允许的文件扩展名
ALLOWED_EXTENSIONS = {
    'image': ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    'audio': ['mp3', 'wav', 'ogg']
}

# 最大文件大小 (10MB)
MAX_CONTENT_LENGTH = 10 * 1024 * 1024


def allowed_file(filename):
    """检查文件扩展名是否合法"""
    file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    for file_type, extensions in ALLOWED_EXTENSIONS.items():
        if file_ext in extensions:
            return file_type
    return False


def get_upload_folder(file_type):
    """根据文件类型获取上传目录"""
    upload_folders = {
        'image': os.path.join('app/static', 'uploads', 'images'),
        'audio': os.path.join('app/static', 'uploads', 'audios')
    }
    return upload_folders.get(file_type, os.path.join('app/static', 'uploads', 'others'))


def ensure_upload_folders_exist():
    """确保所有上传目录存在"""
    for file_type in ALLOWED_EXTENSIONS.keys():
        folder = get_upload_folder(file_type)
        os.makedirs(folder, exist_ok=True)
    others_folder = os.path.join('app/static', 'uploads', 'others')
    os.makedirs(others_folder, exist_ok=True)