from collections import defaultdict
from urllib.parse import quote

from . import project
from flask import request, jsonify, make_response
from .services import get_user_projects, get_project_by_id, create_project, update_project, delete_project, \
    save_upload_file, get_project_characters, fetch_character_avatars_batch, get_project_scenes, \
    get_project_dialogue_count, get_dialogue_by_sceneId, get_character_by_id, create_character, \
    delete_character_with_relations, update_character, add_character_avatar, delete_character_avatar, \
    update_character_avatar, get_scene_by_id, delete_scene_by_id, update_existing_scene, create_new_scene, \
    save_uploaded_file, save_dialogue, delete_dialogue, get_character_avatars, get_characters_by_project_id, \
    reorder_dialogues, get_characterAvatar_by_id, export_project, get_public_projects, \
    TEMPLATE_TYPES, get_templates, build_project_bundle, render_project_script_text, import_project_bundle
from .. import db
from ..models import Project, CharacterAvatar, Scene, ScriptContent, Character, BranchPath
from ..security import current_user_id
from .services import _UNSET


def _iso(dt):
    return dt.isoformat() if dt else None


def project_to_dict(p):
    """项目对象的统一序列化。所有项目接口共用，避免返回体字段残缺（P0-5）。"""
    return {
        'project_id': p.project_id,
        'user_id': p.user_id,
        'title': p.title,
        'cover_url': p.cover_url,
        'genre': p.genre,
        'template_type': p.template_type or '线性叙事',
        'word_count': p.word_count or 0,
        'is_public': bool(p.is_public),
        'created_at': _iso(p.created_at),
        'updated_at': _iso(p.updated_at),
    }

'''
    1.项目管理
'''


def _project_id_from_request():
    """
    从路径参数 / JSON / 表单里推导本次请求涉及的项目 ID。
    推导不出来时返回 (None, None)；推导出但资源不存在时返回 (None, error_response)。
    """
    va = request.view_args or {}

    if 'project_id' in va:
        return va['project_id'], None

    if 'scene_id' in va:
        scene = db.session.get(Scene, va['scene_id'])
        if not scene:
            return None, (jsonify({'success': False, 'message': '场景不存在'}), 404)
        return scene.project_id, None

    if 'content_id' in va:
        content = db.session.get(ScriptContent, va['content_id'])
        if not content:
            return None, (jsonify({'success': False, 'message': '对话不存在'}), 404)
        return content.project_id, None

    if 'character_id' in va:
        character = db.session.get(Character, va['character_id'])
        if not character:
            return None, (jsonify({'success': False, 'message': '角色不存在'}), 404)
        return character.project_id, None

    if 'avatar_id' in va:
        avatar = db.session.get(CharacterAvatar, va['avatar_id'])
        if not avatar:
            return None, (jsonify({'success': False, 'message': '立绘不存在'}), 404)
        character = db.session.get(Character, avatar.character_id)
        if not character:
            return None, (jsonify({'success': False, 'message': '角色不存在'}), 404)
        return character.project_id, None

    if 'path_id' in va:
        branch = db.session.get(BranchPath, va['path_id'])
        if not branch:
            return None, (jsonify({'success': False, 'message': '分支不存在'}), 404)
        return branch.project_id, None

    # 无路径参数时看请求体（创建类接口）
    data = request.get_json(silent=True) or {}
    if isinstance(data, dict):
        if data.get('project_id') is not None:
            return data['project_id'], None
        if data.get('character_id') is not None:
            character = db.session.get(Character, data['character_id'])
            if character:
                return character.project_id, None
        if data.get('avatar_id') is not None:
            avatar = db.session.get(CharacterAvatar, data['avatar_id'])
            if avatar:
                character = db.session.get(Character, avatar.character_id)
                if character:
                    return character.project_id, None

    if request.form:
        if request.form.get('project_id'):
            return request.form.get('project_id', type=int), None
        if request.form.get('character_id'):
            character = db.session.get(Character, request.form.get('character_id', type=int))
            if character:
                return character.project_id, None

    return None, None


@project.before_request
def _project_scope_guard():
    """
    项目归属校验：除公开项目列表外，任何项目/角色/场景/对话/分支操作都必须
    属于当前登录用户，避免「登录了就能改别人项目」。
    """
    if request.method == 'OPTIONS':
        return None
    if request.endpoint == 'project.get_public_projects_view':
        return None

    uid = current_user_id()
    if not uid:
        return jsonify({'success': False, 'message': '未登录'}), 401

    # 批量查立绘：校验所有角色都属于当前用户
    if request.endpoint == 'project.get_character_avatars_batch':
        raw = request.args.get('character_ids', '')
        try:
            ids = [int(x) for x in raw.split(',') if x.strip()]
        except ValueError:
            return jsonify({'success': False, 'message': '参数格式错误'}), 400
        if ids:
            owned = (db.session.query(Character.character_id)
                     .join(Project, Project.project_id == Character.project_id)
                     .filter(Character.character_id.in_(ids), Project.user_id == uid)
                     .count())
            if owned != len(set(ids)):
                return jsonify({'success': False, 'message': '角色不存在或无权访问'}), 404
        return None

    pid, err = _project_id_from_request()
    if err:
        return err
    if pid is None:
        # /project/projects、/project/project（新建）等不涉及既有项目
        return None

    project_row = db.session.get(Project, int(pid))
    if not project_row:
        return jsonify({'success': False, 'message': '项目不存在或无权访问'}), 404
    if int(project_row.user_id) != int(uid):
        # 公开项目的只读访问（他人可预览 /view/:projectId），写操作仍严格限制
        if request.method == 'GET' and bool(project_row.is_public):
            return None
        return jsonify({'success': False, 'message': '项目不存在或无权访问'}), 404
    return None


@project.route('/projectAll', methods=['GET'])
def get_public_projects_view():
    """
    获取所有公开的项目
    """
    projects = get_public_projects()
    return jsonify({
        'success': True,
        'data': [project_to_dict(p) for p in projects]
    })


@project.route('/templates', methods=['GET'])
def get_templates_view():
    """
    模板中心：返回三种叙事模板的元数据
    （名称 / 描述 / 特性 / 场景骨架 / 推荐变量），供前端渲染模板卡片。
    """
    return jsonify({'success': True, 'data': get_templates()})


@project.route('/projects', methods=['GET'])
def get_projects():
    """
    获取当前用户的所有项目
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({'success': False, 'message': '未提供用户ID'}), 401

    projects = get_user_projects(user_id)
    return jsonify({
        'success': True,
        'data': [project_to_dict(p) for p in projects]
    })


@project.route('/project/<int:project_id>', methods=['GET'])
def get_project(project_id):
    """
    获取单个项目详情
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({'success': False, 'message': '未提供用户ID'}), 401

    success, result = get_project_by_id(project_id, user_id)
    if not success:
        # 公开项目允许他人只读查看详情（与场景/角色/剧情的公开预览保持一致）
        public_project = db.session.get(Project, project_id)
        if public_project and bool(public_project.is_public):
            return jsonify({'success': True, 'data': project_to_dict(public_project)})
        return jsonify({'success': False, 'message': result}), 404

    project = result
    return jsonify({
        'success': True,
        'data': project_to_dict(project)
    })


@project.route('/project', methods=['POST'])
def add_project():
    """
    创建新项目
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({'success': False, 'message': '未提供用户ID'}), 401

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': '无效的请求数据'}), 400

    title = data.get('title')
    genre = data.get('genre')
    template_type = data.get('template_type') or '线性叙事'
    if template_type not in TEMPLATE_TYPES:
        return jsonify({'success': False, 'message': f'不支持的模板类型: {template_type}'}), 400

    success, result = create_project(user_id, title, genre,
                                     cover_url=data.get('cover_url'),
                                     template_type=template_type)
    if not success:
        return jsonify({'success': False, 'message': result}), 400

    project = result
    return jsonify({
        'success': True,
        'message': '项目创建成功',
        'data': project_to_dict(project)
    }), 201


@project.route('/project/public/<int:project_id>', methods=['PUT'])
def public_project(project_id):
    """
    公开项目
    :param project_id:
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({'success': False, 'message': '未提供用户ID'}), 401

    success = export_project(
        project_id,
        user_id
    )
    if not success:
        return jsonify({'success': False}), 400

    return jsonify({
        'success': True,
        'message': '项目公开成功'
    })


@project.route('/project/<int:project_id>', methods=['PUT'])
def modify_project(project_id):
    """
    更新项目信息
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({'success': False, 'message': '未提供用户ID'}), 401

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': '无效的请求数据'}), 400

    # 只更新请求体里显式出现的字段，避免前端漏传时把已有值清空
    fields = {}
    for key in ('title', 'genre', 'cover_url'):
        if key in data and data[key] is not None:
            fields[key] = data[key]

    if 'template_type' in data and data['template_type'] is not None:
        if data['template_type'] not in TEMPLATE_TYPES:
            return jsonify({'success': False, 'message': f"不支持的模板类型: {data['template_type']}"}), 400
        fields['template_type'] = data['template_type']

    # is_public 历史上被前端提交却从未落库（P0-4），这里补上；兼容 true/false 与 0/1
    if 'is_public' in data and data['is_public'] is not None:
        fields['is_public'] = bool(data['is_public'])

    if not fields:
        return jsonify({'success': False, 'message': '没有需要更新的字段'}), 400

    success, result = update_project(project_id, user_id, **fields)
    if not success:
        return jsonify({'success': False, 'message': result}), 400

    return jsonify({
        'success': True,
        'message': '项目更新成功',
        'data': project_to_dict(result)
    })


@project.route('/project/<int:project_id>', methods=['DELETE'])
def remove_project(project_id):
    """
    删除项目
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({'success': False, 'message': '未提供用户ID'}), 401

    success, result = delete_project(project_id, user_id)
    if not success:
        return jsonify({'success': False, 'message': result}), 400

    return jsonify({
        'success': True,
        'message': result
    })


@project.route('/project/<int:project_id>/export', methods=['GET'])
def export_project_data(project_id):
    """
    导出项目：?format=json 返回完整项目 JSON 包；?format=txt 返回纯文本剧本。
    仅项目所有者可导出（公开项目的他人预览不包含导出权限）。
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({'success': False, 'message': '未提供用户ID'}), 401

    project_row = Project.query.filter_by(project_id=project_id, user_id=user_id).first()
    if not project_row:
        return jsonify({'success': False, 'message': '项目不存在或无权导出'}), 404

    fmt = (request.args.get('format') or 'json').lower()

    if fmt == 'txt':
        text = render_project_script_text(project_id, user_id) or ''
        resp = make_response(text)
        resp.headers['Content-Type'] = 'text/plain; charset=utf-8'
        resp.headers['Content-Disposition'] = (
            f"attachment; filename=project_{project_id}.txt; "
            f"filename*=UTF-8''{quote(f'{project_row.title}.txt')}"
        )
        return resp

    bundle = build_project_bundle(project_id, user_id)
    if bundle is None:
        return jsonify({'success': False, 'message': '项目不存在或无权导出'}), 404

    resp = make_response(jsonify(bundle))
    resp.headers['Content-Disposition'] = (
        f"attachment; filename=project_{project_id}.json; "
        f"filename*=UTF-8''{quote(f'{project_row.title}.json')}"
    )
    return resp


@project.route('/project/import', methods=['POST'])
def import_project_data():
    """
    由 JSON 包新建项目（归属于当前用户），按原 ID 映射重建全部内容。
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({'success': False, 'message': '未提供用户ID'}), 401

    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data:
        return jsonify({'success': False, 'message': '无效的请求数据'}), 400

    success, result = import_project_bundle(user_id, data)
    if not success:
        return jsonify({'success': False, 'message': result}), 400

    return jsonify({
        'success': True,
        'message': '项目导入成功',
        'data': project_to_dict(result)
    }), 201


@project.route('/project/<int:project_id>/cover', methods=['POST'])
def upload_project_cover(project_id):
    """
    上传项目封面图片
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({'success': False, 'message': '未提供用户ID'}), 401

    # 检查项目是否存在
    project = Project.query.filter_by(project_id=project_id, user_id=user_id).first()
    if not project:
        return jsonify({'success': False, 'message': '项目不存在或无权访问'}), 404

    # 检查是否有文件上传
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '未上传文件'}), 400

    file = request.files['file']

    # 保存文件
    success, result = save_upload_file(file)
    if not success:
        return jsonify({'success': False, 'message': result}), 400

    # 更新项目封面URL
    project.cover_url = result
    try:
        db.session.commit()
        return jsonify({
            'success': True,
            'message': '封面图片上传成功',
            'data': {
                'cover_url': result
            }
        })
    except Exception as e:
        db.session.rollback()
        print(e)
        return jsonify({'success': False, 'message': '更新封面URL失败'}), 500


'''
    2.角色管理
'''


@project.route('/character_avatar/<int:avatar_id>', methods=['GET'])
def get_characterAvatars(avatar_id):
    """
    通过角色ID获取角色立绘
    """
    avatar = get_characterAvatar_by_id(avatar_id)

    # 返回JSON数据
    return jsonify({
        'success': True,
        'data': {
            'character_id': avatar.character_id,
            'avatar_id': avatar.avatar_id,
            'image_url': avatar.image_url,
            'avatar_type': avatar.avatar_type,
            'costume': avatar.costume,
            'is_default': avatar.is_default
        }
    })


@project.route('/characters/<int:project_id>', methods=['GET'])
def get_characters(project_id):
    """
    获取当前项目的所有角色，头像优先返回is_default=1的
    """
    try:
        # 关键修复：确保获取的是角色列表而不是Response对象
        # 注意：这里应调用返回角色列表的业务函数，而非返回响应的视图函数
        characters = get_characters_by_project_id(project_id)

        # 验证返回的是可迭代的角色列表
        if not isinstance(characters, list):
            return jsonify({
                'success': False,
                'message': '获取角色数据格式错误，预期列表类型'
            }), 500

        # 提取角色ID列表
        character_ids = [c.character_id for c in characters]

        # 批量查询所有角色的头像
        avatars = CharacterAvatar.query.filter(CharacterAvatar.character_id.in_(character_ids)).all()

        # 按character_id分组头像
        avatar_map = defaultdict(list)
        for avatar in avatars:
            avatar_map[avatar.character_id].append(avatar)

        # 构造character_id -> avatar_url映射，优先选择is_default=1的
        character_avatar_url = {}
        for cid, avatar_list in avatar_map.items():
            # 查找默认头像
            default_avatars = [a for a in avatar_list if a.is_default == 1]
            if default_avatars:
                character_avatar_url[cid] = default_avatars[0].image_url
            # 如果没有默认头像且有其他头像，取第一个
            elif avatar_list:
                character_avatar_url[cid] = avatar_list[0].image_url
            # 没有头像时不设置键，后续使用get方法会返回None

        # 构造响应数据，保持原有格式
        return jsonify({
            'success': True,
            'data': [{
                'project_id': c.project_id,
                'character_id': c.character_id,
                'name': c.name,
                'age': c.age,
                'description': c.description,
                'settings': c.settings,
                'avatar_url': character_avatar_url.get(c.character_id),
                'is_main': c.is_main,
                'created_at': c.created_at.isoformat()
            } for c in characters]
        })

    except TypeError as e:
        return jsonify({
            'success': False,
            'message': f'处理角色数据时发生类型错误: {str(e)}'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取角色失败: {str(e)}'
        }), 500


@project.route('/character/<int:character_id>', methods=['GET'])
def character_detail(character_id):
    """
    通过角色ID获取角色详情接口
    """
    character = get_character_by_id(character_id)

    # 返回JSON数据
    return jsonify({
        'success': True,
        'data': {
            'character_id': character.character_id,
            'project_id': character.project_id,
            'name': character.name,
            'age': character.age,
            'description': character.description,
            'settings': character.settings,
            'is_main': character.is_main,
            'created_at': character.created_at.isoformat()
        }
    })


@project.route('/avatars/<int:character_id>', methods=['GET'])
def get_character_avatar_list(character_id):
    """
    根据角色ID获取该角色的所有立绘
    :param character_id: 角色ID
    :return: JSON响应，包含立绘列表
    """
    try:
        avatars = get_character_avatars(character_id)
        if not avatars:
            return jsonify({
                'success': True,
                'message': '该角色暂无头像',
                'data': []
            })

        return jsonify({
            'success': True,
            'data': [{
                'avatar_id': a.avatar_id,
                'character_id': a.character_id,
                'image_url': a.image_url,
                'avatar_type': a.avatar_type,
                'costume': a.costume,
                'is_default': a.is_default,
                'created_at': a.created_at.isoformat()
            } for a in avatars]
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取头像失败: {str(e)}'
        }), 500


@project.route('/character/avatars/batch', methods=['GET'])
def get_character_avatars_batch():
    """
    批量获取角色立绘
    参数: character_ids - 逗号分隔的角色ID字符串
    返回: 立绘列表
    """
    try:
        character_ids_str = request.args.get('character_ids', '')
        if not character_ids_str:
            return jsonify({'success': False, 'message': '缺少character_ids参数'}), 400

        try:
            character_ids = [int(id) for id in character_ids_str.split(',')]
        except ValueError:
            return jsonify({'success': False, 'message': '参数格式错误'}), 400

        data = fetch_character_avatars_batch(character_ids)

        return jsonify({'success': True, 'data': data})

    except Exception as e:
        print(e)
        return jsonify({'success': False, 'message': '服务器内部错误'}), 500


@project.route('/dialogue_count/<int:project_id>', methods=['GET'])
def get_dialogue_count(project_id):
    """
    获取当前用户的所有项目
    """
    length = get_project_dialogue_count(project_id)
    return jsonify({"length": length})


@project.route('/create_character', methods=['POST'])
def create_character_by_data():
    """
    创建角色
    """
    data = request.get_json()
    message = create_character(data)
    return jsonify({"message": message})


@project.route('/update_character', methods=['POST'])
def update_character_by_data():
    """
    更新角色
    """
    data = request.get_json()
    character_id = data['character_id']
    message = update_character(character_id, data)
    return jsonify({"message": message})


@project.route('/character/<int:character_id>', methods=['DELETE'])
def delete_character_endpoint(character_id):
    """
    删除角色及其关联数据的API端点

    参数:
        character_id: URL路径中的角色ID

    返回:
        JSON响应和HTTP状态码
    """
    # 调用业务函数
    success, message, status_code = delete_character_with_relations(character_id)

    response = {
        'success': success,
        'message': message,
        'character_id': character_id
    }

    return jsonify(response), status_code


@project.route('/upload_avatar', methods=['POST'])
def upload_character_avatar():
    """
    处理上传角色立绘的请求

    请求参数:
        - file: 上传的图片文件
        - project_id: 项目ID
        - character_id: 角色ID
        - avatar_type: 头像类型
        - costume: 服装描述
        - is_default: 是否为默认头像 (可选)

    返回:
        JSON 响应，包含成功或失败的信息
    """
    if 'file' not in request.files:
        return jsonify({'error': '没有文件部分'}), 400

    file = request.files['file']
    data = request.form
    project_id = data.get('project_id')
    character_id = data.get('character_id')
    avatar_type = data.get('avatar_type')
    costume = data.get('costume')
    is_default = data.get('is_default', 'false').lower() == 'true'  # 转换为布尔值

    # 调用业务函数
    avatar_id = add_character_avatar(file, project_id, character_id, avatar_type, costume, is_default)

    if avatar_id is None:
        return jsonify({'error': '头像上传失败'}), 500

    return jsonify({'message': '头像上传成功', 'avatar_id': avatar_id}), 200


@project.route('/delete_avatar/<int:avatar_id>', methods=['DELETE'])
def delete_avatar(avatar_id):
    """
    删除角色立绘的视图函数

    参数:
        - avatar_id: 要删除的立绘ID

    返回:
        - 成功: {"message": "立绘删除成功"}, 200
        - 失败: {"error": "错误信息"}, 400或404
    """
    try:
        success = delete_character_avatar(avatar_id)
        if success:
            return jsonify({"message": "立绘删除成功"}), 200
        else:
            return jsonify({"error": "立绘不存在或删除失败"}), 404
    except Exception as e:
        return jsonify({"error": f"服务器错误: {str(e)}"}), 500


@project.route('/update_avatar', methods=['POST'])
def update_avatar_by_id():
    """
    更新角色立绘
    """
    data = request.get_json()
    avatar_id = data['avatar_id']
    message = update_character_avatar(avatar_id)
    return jsonify({"message": message})


'''
    3.场景管理
'''


@project.route('/scenes/<int:project_id>', methods=['GET'])
def get_scenes(project_id):
    """
    根据项目id获取当前项目的所有场景
    """
    try:
        scenes = get_project_scenes(project_id)
        return jsonify({
            'success': True,
            'data': [{
                'project_id': s.project_id,
                'scene_id': s.scene_id,
                'title': s.title,
                'background_url': s.background_url,
                'music_url': s.music_url,
                'description': s.description,
                'order_num': s.order_num,
                'created_at': s.created_at.isoformat()
            } for s in scenes]
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取场景失败: {str(e)}'
        }), 500


@project.route('/scene/<int:scene_id>', methods=['GET'])
def get_scene(scene_id):
    """
    根据场景ID获取场景详情
    :param scene_id: 场景ID
    :return: JSON响应
    """
    try:
        scene = get_scene_by_id(scene_id)
        # print(scene)
        if not scene:
            return jsonify({
                'success': False,
                'message': '场景不存在'
            }), 404

        return jsonify({
            'success': True,
            'data': {
                'scene_id': scene.scene_id,
                'project_id': scene.project_id,
                'title': scene.title,
                'description': scene.description,
                'background_url': scene.background_url,
                'music_url': scene.music_url,
                'order_num': scene.order_num,
                'created_at': scene.created_at.isoformat()
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取场景失败: {str(e)}'
        }), 500


@project.route('/scene/<int:scene_id>', methods=['PUT'])
def update_scene_settings(scene_id):
    """
    更新场景设置
    :param scene_id: 场景ID
    :return: JSON响应
    """
    try:
        data = request.json
        scene, error = update_scene(
            scene_id,
            title=data.get('title'),
            description=data.get('description'),
            background_url=data.get('background_url'),
            music_url=data.get('music_url')
        )

        if error:
            status_code = 404 if error == '场景不存在' else 500
            return jsonify({
                'success': False,
                'message': error
            }), status_code

        return jsonify({
            'success': True,
            'data': {
                'scene_id': scene.scene_id,
                'project_id': scene.project_id,
                'title': scene.title,
                'description': scene.description,
                'background_url': scene.background_url,
                'music_url': scene.music_url,
                'order_num': scene.order_num
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'更新场景失败: {str(e)}'
        }), 500


@project.route('/scenes', methods=['POST'])
def create_scene():
    """
    创建新场景
    """
    try:
        data = request.get_json()

        # 验证必填字段
        required_fields = ['project_id', 'title', 'order_num']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'message': f'缺少必填字段: {field}'
                }), 400

        scene = create_new_scene(
            project_id=data['project_id'],
            title=data['title'],
            background_url=data.get('background_url', ''),
            music_url=data.get('music_url', ''),
            description=data.get('description', ''),
            order_num=data['order_num']
        )

        return jsonify({
            'success': True,
            'data': {
                'project_id': scene.project_id,
                'scene_id': scene.scene_id,
                'title': scene.title,
                'background_url': scene.background_url,
                'music_url': scene.music_url,
                'description': scene.description,
                'order_num': scene.order_num,
                'created_at': scene.created_at.isoformat()
            }
        }), 201
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'创建场景失败: {str(e)}'
        }), 500


@project.route('/scenes/<int:scene_id>', methods=['PUT'])
def update_scene(scene_id):
    """
    更新场景信息
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': '无效的请求数据'}), 400

        # 检查场景是否存在
        existing_scene = get_scene_by_id(scene_id)
        if not existing_scene:
            return jsonify({
                'success': False,
                'message': f'场景不存在: {scene_id}'
            }), 404

        # 只要求「至少传一个可更新字段」，不再强制 title + order_num，
        # 这样前端拖拽排序时只发 {order_num} 也不会把背景图/音乐覆盖掉（P0-3）
        allowed = ('title', 'order_num', 'background_url', 'music_url', 'description')
        if not any(k in data for k in allowed):
            return jsonify({
                'success': False,
                'message': '没有需要更新的字段'
            }), 400

        scene = update_existing_scene(
            scene_id=scene_id,
            title=data.get('title'),
            background_url=data['background_url'] if 'background_url' in data else _UNSET,
            music_url=data['music_url'] if 'music_url' in data else _UNSET,
            description=data['description'] if 'description' in data else _UNSET,
            order_num=data.get('order_num')
        )

        return jsonify({
            'success': True,
            'data': {
                'project_id': scene.project_id,
                'scene_id': scene.scene_id,
                'title': scene.title,
                'background_url': scene.background_url,
                'music_url': scene.music_url,
                'description': scene.description,
                'order_num': scene.order_num,
                'created_at': scene.created_at.isoformat()
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'更新场景失败: {str(e)}'
        }), 500


@project.route('/scenes/upload', methods=['POST'])
def upload_scene_file():
    """
    上传场景相关文件（背景图片或音乐）
    """
    # 检查是否有文件上传
    if 'file' not in request.files:
        return jsonify({
            'success': False,
            'error': '未找到上传的文件'
        }), 400

    file = request.files['file']
    project_id = request.form.get('project_id')
    file_type = request.form.get('file_type')

    # 验证参数
    if not project_id or not file_type or file_type not in ['image', 'audio', 'voice']:
        return jsonify({
            'success': False,
            'error': '无效的参数'
        }), 400

    try:
        # 保存文件
        file_path = save_uploaded_file(file, project_id)

        if not file_path:
            return jsonify({
                'success': False,
                'error': '文件上传失败，不支持的文件类型或保存错误'
            }), 400

        return jsonify({
            'success': True,
            'data': {
                'url': file_path,
                'filename': file.filename
            }
        })
    except Exception as e:
        print(f"文件上传失败: {e}")
        return jsonify({
            'success': False,
            'error': '文件上传失败'
        }), 500


@project.route('/scenes/<int:scene_id>', methods=['DELETE'])
def delete_scene(scene_id):
    """
    删除场景
    """
    try:
        # 检查场景是否存在
        existing_scene = get_scene_by_id(scene_id)
        if not existing_scene:
            return jsonify({
                'success': False,
                'message': f'场景不存在: {scene_id}'
            }), 404

        delete_scene_by_id(scene_id)

        return jsonify({
            'success': True,
            'message': f'场景 {scene_id} 已成功删除'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'删除场景失败: {str(e)}'
        }), 500


'''
    4.对话管理
'''


@project.route('/dialogues/<int:scene_id>', methods=['GET'])
def get_dialogues(scene_id):
    """
        根据场景id获取当前场景下所有对话
    """
    dialogues = get_dialogue_by_sceneId(scene_id)
    avatar_ids = {d.avatar_id for d in dialogues if d.avatar_id is not None}

    avatars = CharacterAvatar.query.filter(CharacterAvatar.avatar_id.in_(avatar_ids)).all()
    avatar_map = {a.avatar_id: a.avatar_type for a in avatars}

    return jsonify({
        'success': True,
        'data': [{
            'content_id': d.content_id,
            'project_id': d.project_id,
            'scene_id': d.scene_id,
            'content_type': d.content_type,
            'content_text': d.content_text,
            'voice_url': d.voice_url,
            'character_id': d.character_id,
            'avatar_id': d.avatar_id,
            'order_num': d.order_num,
        } for d in dialogues]
    })


@project.route('/dialogues', methods=['POST'])
def create_dialogue():
    """
    创建新对话
    :return: JSON响应
    """
    try:
        data = request.json
        dialogue, error = save_dialogue(data)

        if error:
            status_code = 400 if '缺少必要字段' in error else 500
            return jsonify({
                'success': False,
                'message': error
            }), status_code

        # 获取头像类型
        avatar_type = None
        if dialogue.avatar_id:
            avatar = CharacterAvatar.query.get(dialogue.avatar_id)
            if avatar:
                avatar_type = avatar.avatar_type

        return jsonify({
            'success': True,
            'data': {
                'content_id': dialogue.content_id,
                'project_id': dialogue.project_id,
                'scene_id': dialogue.scene_id,
                'content_type': dialogue.content_type,
                'content_text': dialogue.content_text,
                'voice_url': dialogue.voice_url,
                'character_id': dialogue.character_id,
                'avatar_id': dialogue.avatar_id,
                'avatar_type': avatar_type,
                'order_num': dialogue.order_num,
            }
        }), 201
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'创建对话失败: {str(e)}'
        }), 500


@project.route('/dialogues/<int:content_id>', methods=['PUT'])
def update_dialogue(content_id):
    """
    更新对话
    :param content_id: 对话ID
    :return: JSON响应
    """
    try:
        data = request.json
        dialogue, error = save_dialogue(data, content_id)

        if error:
            status_code = 404 if error == '对话不存在' else 400 if '缺少必要字段' in error else 500
            return jsonify({
                'success': False,
                'message': error
            }), status_code

        # 获取头像类型
        avatar_type = None
        if dialogue.avatar_id:
            avatar = CharacterAvatar.query.get(dialogue.avatar_id)
            if avatar:
                avatar_type = avatar.avatar_type

        return jsonify({
            'success': True,
            'data': {
                'content_id': dialogue.content_id,
                'project_id': dialogue.project_id,
                'scene_id': dialogue.scene_id,
                'content_type': dialogue.content_type,
                'content_text': dialogue.content_text,
                'voice_url': dialogue.voice_url,
                'character_id': dialogue.character_id,
                'avatar_id': dialogue.avatar_id,
                'avatar_type': avatar_type,
                'order_num': dialogue.order_num,
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'更新对话失败: {str(e)}'
        }), 500


@project.route('/dialogues/<int:content_id>', methods=['DELETE'])
def delete_dialogue_api(content_id):
    """
    删除对话
    :param content_id: 对话ID
    :return: JSON响应
    """
    try:
        success, error = delete_dialogue(content_id)
        if not success:
            status_code = 404 if error == '对话不存在' else 500
            return jsonify({
                'success': False,
                'message': error
            }), status_code

        return jsonify({
            'success': True,
            'message': '对话已成功删除'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'删除对话失败: {str(e)}'
        }), 500


@project.route('/dialogues/reorder/<int:scene_id>', methods=['POST'])
def reorder_dialogues_api(scene_id):
    """
    重新排序指定场景下的对话

    请求体格式:
    {
        "ordered_content_ids": [1, 3, 2, 4]  # 按新顺序排列的对话ID列表
    }
    """
    try:
        data = request.json

        # 验证请求数据
        if not data or 'ordered_content_ids' not in data:
            return jsonify({
                'success': False,
                'message': '缺少必要参数: ordered_content_ids'
            }), 400

        if not isinstance(data['ordered_content_ids'], list):
            return jsonify({
                'success': False,
                'message': 'ordered_content_ids必须是数组'
            }), 400

        # 调用业务函数处理排序
        success, error = reorder_dialogues(scene_id, data['ordered_content_ids'])
        if not success:
            return jsonify({
                'success': False,
                'message': error
            }), 400

        # 排序成功后返回更新后的对话列表
        updated_dialogues = get_dialogue_by_sceneId(scene_id)
        avatar_ids = {d.avatar_id for d in updated_dialogues if d.avatar_id is not None}
        avatars = CharacterAvatar.query.filter(CharacterAvatar.avatar_id.in_(avatar_ids)).all()
        avatar_map = {a.avatar_id: a.avatar_type for a in avatars}

        return jsonify({
            'success': True,
            'message': '对话排序已更新',
            'data': [{
                'content_id': d.content_id,
                'project_id': d.project_id,
                'scene_id': d.scene_id,
                'content_type': d.content_type,
                'content_text': d.content_text,
                'voice_url': d.voice_url,
                'character_id': d.character_id,
                'avatar_type': avatar_map.get(d.avatar_id),
                'order_num': d.order_num,
            } for d in updated_dialogues]
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'处理排序请求失败: {str(e)}'
        }), 500
