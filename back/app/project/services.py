import os
from datetime import datetime

from sqlalchemy import func, or_
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.utils import secure_filename
from .. import db
from ..models import Project, Character, CharacterAvatar, Scene, ScriptContent, BranchPath, \
    ContentEffect, ProjectVariable, SaveSlot, ReadRecord, Ending, EndingUnlock, ResourceReference, \
    ProjectCG

# 允许的文件扩展名
ALLOWED_EXTENSIONS = {
    'image': ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    'audio': ['mp3', 'wav', 'ogg'],
    'video': ['mp4', 'avi']
}

# 项目类型与叙事模板的合法取值（与模型 Enum / 前端下拉一致）
GENRES = ('悬疑', '恋爱', '科幻', '奇幻', '历史', '现代', '其他')
TEMPLATE_TYPES = ('线性叙事', '分支叙事', '开放世界')

# 模板中心元数据：展示用名称/描述/特性 + 建项目时自动铺的场景骨架。
# 注意：骨架只创建 Scene，绝不创建任何 ScriptContent，否则会把「新项目对话数=0」的口径打破。
TEMPLATES = [
    {
        'template_type': '线性叙事',
        'name': '线性叙事',
        'description': '单主线顺序推进，读者从头读到尾，适合短篇与明确结局的故事。',
        'features': ['单主线', '顺序阅读', '单结局'],
        'starter_scenes': [
            {'title': '开场', 'order_num': 1,
             'description': '故事起点，交代主角、处境与第一个冲突。'},
        ],
        'recommended_variables': [],
    },
    {
        'template_type': '分支叙事',
        'name': '分支叙事',
        'description': '关键时刻提供选择，不同选择走向不同结局，适合多线多结局剧情。',
        'features': ['多分支', '多结局', '选择驱动'],
        'starter_scenes': [
            {'title': '开场', 'order_num': 1,
             'description': '故事起点，铺垫可被读者影响的伏笔。'},
            {'title': '分歧点', 'order_num': 2,
             'description': '第一个关键选择出现的位置，用分支连接到不同走向。'},
        ],
        'recommended_variables': [
            {'name': 'affection', 'label': '好感度', 'initial_value': 0},
        ],
    },
    {
        'template_type': '开放世界',
        'name': '开放世界',
        'description': '多场景自由探索，用变量串联线索与状态，适合悬疑与探索类故事。',
        'features': ['多场景', '变量驱动', '自由探索'],
        'starter_scenes': [
            {'title': '序章', 'order_num': 1,
             'description': '世界观与探索规则的引入场景。'},
            {'title': '探索区域', 'order_num': 2,
             'description': '可以反复往返、按线索解锁的开放区域。'},
        ],
        'recommended_variables': [
            {'name': 'clue', 'label': '线索数', 'initial_value': 0},
        ],
    },
]


def get_templates():
    """返回模板中心元数据（逐项浅拷贝，避免调用方误改全局定义）。"""
    return [dict(t) for t in TEMPLATES]


def _template_def(template_type):
    for t in TEMPLATES:
        if t['template_type'] == template_type:
            return t
    return None


def _delete_endings_for_contents(content_ids):
    """删除引用这些剧情节点的结局及其解锁记录（结局外键引用 script_contents）。"""
    if not content_ids:
        return 0
    ending_ids = [
        r[0] for r in db.session.query(Ending.ending_id)
        .filter(Ending.content_id.in_(content_ids)).all()
    ]
    if ending_ids:
        # CG 图鉴条目引用了结局：解绑而不是删除，退化为「初始可见」
        ProjectCG.query.filter(
            ProjectCG.unlock_ending_id.in_(ending_ids)
        ).update({'unlock_ending_id': None}, synchronize_session=False)
        EndingUnlock.query.filter(
            EndingUnlock.ending_id.in_(ending_ids)
        ).delete(synchronize_session=False)
    return Ending.query.filter(
        Ending.content_id.in_(content_ids)
    ).delete(synchronize_session=False)


def _safe_delete_file(file_url):
    """
    安全删除文件

    :param file_url: 文件的相对路径或URL
    """
    if not file_url:
        return

    try:
        # 构建完整文件路径
        file_path = os.path.join('app', file_url.lstrip('/'))
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"文件删除成功: {file_path}")
    except Exception as e:
        print(f"文件删除失败 {file_url}: {e}")


def _delete_project_files(project_id):
    """
    删除项目相关的所有文件

    :param project_id: 项目ID
    """
    try:
        # 删除项目的整个静态文件目录
        project_static_dir = os.path.join('app', 'static', 'project', str(project_id))
        if os.path.exists(project_static_dir):
            import shutil
            shutil.rmtree(project_static_dir)
            print(f"项目静态目录删除成功: {project_static_dir}")
    except Exception as e:
        print(f"删除项目静态目录失败: {e}")


def save_uploaded_file(file, project_id):
    """
    保存上传的文件到指定目录

    参数:
        file: Werkzeug FileStorage 对象 (Flask接收的上传文件对象)
        project_id: 项目ID，用于创建目录结构

    返回:
        成功时返回文件保存的相对路径，失败时返回None
    """
    # 检查文件是否有合法的扩展名
    filename = secure_filename(file.filename)
    if '.' not in filename:
        return None  # 无扩展名

    ext = filename.rsplit('.', 1)[1].lower()
    file_type = None

    # 确定文件类型
    for category, extensions in ALLOWED_EXTENSIONS.items():
        if ext in extensions:
            file_type = category
            break

    if not file_type:
        return None  # 不支持的文件类型

    # 生成新的文件名 (使用当前系统时间)
    now = datetime.now()
    timestamp = now.strftime("%Y%m%d_%H%M%S_%f")[:-3]
    new_filename = f"{timestamp}.{ext}"
    upload_dir = os.path.join('app', 'static', 'project', str(project_id), file_type)
    try:
        os.makedirs(upload_dir, exist_ok=True)
    except OSError as e:
        print(f"无法创建目录 {upload_dir}: {e}")
        return None

    # 保存文件
    file_path = os.path.join(upload_dir, new_filename)
    try:
        file.save(file_path)
    except Exception as e:
        print(f"保存文件失败: {e}")
        return None

    # 返回给前端/落库的路径必须是 POSIX 风格：Windows 的 os.path.join 会混入 `\`，
    # 拼进 URL 或 CSS url() 后图片/音乐会加载失败（与 FIX-11 同类问题）
    relative_path = file_path.replace('app', '', 1).replace('\\', '/')
    if not relative_path.startswith('/'):
        relative_path = '/' + relative_path
    return relative_path


'''
    项目管理
'''


def create_project(user_id, title, genre, cover_url=None, template_type='线性叙事'):
    """
    创建新项目
    :param user_id: 用户ID
    :param title: 项目标题
    :param genre: 项目类型
    :param cover_url: 封面URL(可选)
    :param template_type: 初始叙事模板（线性叙事/分支叙事/开放世界）
    :return: (成功状态, 项目对象或错误消息)
    """
    if not title or not genre:
        return False, "标题、类型不能为空"

    template_type = template_type or '线性叙事'
    try:
        project = Project(
            user_id=user_id,
            title=title,
            genre=genre,
            cover_url=cover_url,
            template_type=template_type
        )
        db.session.add(project)
        db.session.flush()  # 先拿到 project_id，供模板脚手架挂载

        # 模板脚手架：按模板铺起始场景骨架。只建 Scene，绝不建 ScriptContent，
        # 保证「新建项目的对话数仍为 0」，不干扰既有对话计数口径。
        template = _template_def(template_type)
        if template:
            for s in template['starter_scenes']:
                db.session.add(Scene(
                    project_id=project.project_id,
                    title=s['title'],
                    description=s.get('description'),
                    order_num=s['order_num'],
                ))

        db.session.commit()
        return True, project
    except Exception as e:
        db.session.rollback()
        print(e)
        return False, "创建项目失败"


def update_project_word_count(project_id):
    # 计算总字符数
    total_chars = db.session.query(
        func.sum(func.char_length(ScriptContent.content_text))
    ).filter(
        ScriptContent.project_id == project_id
    ).scalar()

    total_chars = total_chars or 0

    # 查询项目
    project = db.session.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        return False  # 项目不存在

    # 如果不一致，更新word_count
    if project.word_count != total_chars:
        project.word_count = total_chars
        db.session.commit()

    return True


def get_project_by_id(project_id, user_id):
    """
    获取用户指定的项目
    :param project_id: 项目ID
    :param user_id: 用户ID(用于验证权限)
    :return: (成功状态, 项目对象或错误消息)
    """
    update_project_word_count(project_id)
    project = Project.query.filter_by(project_id=project_id, user_id=user_id).first()
    if not project:
        return False, "项目不存在或无权访问"
    return True, project


def get_public_projects():
    """
    获取所有公开的项目
    :return: 公开项目列表
    """
    return Project.query.filter_by(is_public=True).order_by(Project.updated_at.desc()).all()


def get_user_projects(user_id):
    """
    获取用户所有项目
    :param user_id: 用户ID
    :return: 项目列表
    """
    return Project.query.filter_by(user_id=user_id).order_by(Project.updated_at.desc()).all()


def get_all_projects():
    """
    获取所有项目（包括公开和私有的）
    :return: 所有项目列表
    """
    return Project.query.order_by(Project.updated_at.desc()).all()


def export_project(project_id, user_id):
    project = Project.query.filter_by(project_id=project_id, user_id=user_id).first()
    project.is_public = True
    db.session.commit()
    return True


def update_project(project_id, user_id, **kwargs):
    """
    更新项目信息
    :param project_id: 项目ID
    :param user_id: 用户ID(用于验证权限)
    :param kwargs: 更新字段(title, genre, template_type, cover_url等)
    :return: (成功状态, 更新后的项目或错误消息)
    """
    project = Project.query.filter_by(project_id=project_id, user_id=user_id).first()
    if not project:
        return False, "项目不存在或无权访问"

    try:
        for key, value in kwargs.items():
            if hasattr(project, key) and value is not None:
                setattr(project, key, value)
        db.session.commit()
        return True, project
    except Exception as e:
        db.session.rollback()
        print(e)
        return False, "更新项目失败"


def delete_project(project_id, user_id):
    """
    删除项目及其所有关联数据（场景、对话、角色、头像、分支路径等）

    :param project_id: 项目ID
    :param user_id: 用户ID(用于验证权限)
    :return: (成功状态, 成功消息或错误消息)
    """
    # 验证项目是否存在且属于当前用户
    project = Project.query.filter_by(project_id=project_id, user_id=user_id).first()
    if not project:
        return False, "项目不存在或无权访问"

    try:
        print(f"开始删除项目 {project_id} 及其关联数据...")

        # 1. 收集需要删除的文件路径（在删除数据库记录前收集）
        files_to_delete = []

        # 项目封面
        if project.cover_url:
            files_to_delete.append(project.cover_url)

        # 场景的背景和音乐
        scenes = Scene.query.filter_by(project_id=project_id).all()
        for scene in scenes:
            if scene.background_url:
                files_to_delete.append(scene.background_url)
            if scene.music_url:
                files_to_delete.append(scene.music_url)

        # 角色头像
        characters = Character.query.filter_by(project_id=project_id).all()
        for character in characters:
            avatars = CharacterAvatar.query.filter_by(character_id=character.character_id).all()
            for avatar in avatars:
                if avatar.image_url:
                    files_to_delete.append(avatar.image_url)

        # CG 图鉴图片（仅删除项目内上传的，市场素材文件不属于本项目）
        for cg in ProjectCG.query.filter_by(project_id=project_id).all():
            if cg.image_url and not cg.resource_id:
                files_to_delete.append(cg.image_url)

        # 2. 先删除分支路径：branch_paths 同时外键引用 script_contents 的起点/终点，
        #    必须在删除对话之前清理，否则 MySQL 会报 1451 外键约束（实测：有分支的项目删不掉）
        content_ids = [c.content_id for c in ScriptContent.query.filter_by(project_id=project_id).all()]
        branch_query = BranchPath.query.filter(
            or_(
                BranchPath.project_id == project_id,
                BranchPath.source_content_id.in_(content_ids) if content_ids else False,
                BranchPath.target_content_id.in_(content_ids) if content_ids else False,
            )
        )
        branch_count = branch_query.delete(synchronize_session=False)
        print(f"  删除 {branch_count} 条分支路径")

        # 2.1 删除节点数值变化（content_effects 引用 script_contents 与 project_variables）
        if content_ids:
            effect_count = ContentEffect.query.filter(
                ContentEffect.content_id.in_(content_ids)
            ).delete(synchronize_session=False)
            print(f"  删除 {effect_count} 条数值变化")

        # 2.2 删除玩家已读与存档（read_records 外键引用 script_contents；save_slots 引用 project）
        read_count = ReadRecord.query.filter_by(project_id=project_id).delete(
            synchronize_session=False)
        save_count = SaveSlot.query.filter_by(project_id=project_id).delete(
            synchronize_session=False)
        unlock_count = EndingUnlock.query.filter_by(project_id=project_id).delete(
            synchronize_session=False)
        # project_cgs 外键引用 endings，必须比结局先删
        cg_count = ProjectCG.query.filter_by(project_id=project_id).delete(
            synchronize_session=False)
        ending_count = Ending.query.filter_by(project_id=project_id).delete(
            synchronize_session=False)
        # 素材引用计数记录同样外键引用 project_id，需一并清理
        ref_count = ResourceReference.query.filter_by(project_id=project_id).delete(
            synchronize_session=False)
        print(f"  删除 {read_count} 条已读记录、{save_count} 个存档、"
              f"{ending_count} 个结局、{unlock_count} 条解锁记录、{ref_count} 条素材引用、"
              f"{cg_count} 条 CG")

        # 3. 删除场景中的所有对话
        for scene in scenes:
            deleted_count = ScriptContent.query.filter_by(scene_id=scene.scene_id).delete()
            print(f"  删除场景 {scene.scene_id} 中的 {deleted_count} 条对话")

        # 4. 删除所有场景
        scene_count = Scene.query.filter_by(project_id=project_id).delete()
        print(f"  删除 {scene_count} 个场景")

        # 5. 删除角色的所有头像记录
        avatar_count = 0
        for character in characters:
            count = CharacterAvatar.query.filter_by(character_id=character.character_id).delete()
            avatar_count += count
        print(f"  删除 {avatar_count} 个角色头像")

        # 6. 删除所有角色
        character_count = Character.query.filter_by(project_id=project_id).delete()
        print(f"  删除 {character_count} 个角色")

        # 6.1 删除项目变量定义（content_effects 已随节点清理）
        var_count = ProjectVariable.query.filter_by(project_id=project_id).delete(
            synchronize_session=False)
        print(f"  删除 {var_count} 个变量定义")

        # 7. 删除项目本身
        db.session.delete(project)

        # 8. 提交数据库事务
        db.session.commit()
        print(f"  数据库记录删除成功")

        # 9. 删除相关文件
        for file_url in files_to_delete:
            _safe_delete_file(file_url)

        # 10. 删除项目的整个静态文件目录
        _delete_project_files(project_id)

        print(f"项目 {project_id} 删除完成")
        return True, "项目删除成功"

    except SQLAlchemyError as e:
        db.session.rollback()
        print(f"数据库错误: {e}")
        return False, f"删除项目失败: {str(e)}"
    except Exception as e:
        db.session.rollback()
        print(f"删除项目失败: {e}")
        import traceback
        traceback.print_exc()
        return False, f"删除项目失败: {str(e)}"


def allowed_file(filename, file_type='image'):
    """
    检查文件扩展名是否允许
    :param filename: 文件名
    :param file_type: 文件类型(image/audio)
    :return: 是否允许
    """
    return '.' in filename and \
        filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS.get(file_type, [])


def save_upload_file(file, sub_folder='covers'):
    """
    保存上传的文件
    :param file: 文件对象
    :param sub_folder: 子文件夹
    :return: (成功状态, 文件URL或错误消息)
    """
    if not file or file.filename == '':
        return False, "未选择文件"

    if not allowed_file(file.filename):
        return False, "文件类型不允许"

    try:
        # 安全文件名
        filename = secure_filename(file.filename)
        # 生成唯一文件名
        unique_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{filename}"
        # 保存路径
        save_path = os.path.join('app/static/uploads', sub_folder)
        os.makedirs(save_path, exist_ok=True)
        file_path = os.path.join(save_path, unique_filename)
        file.save(file_path)
        # 返回相对URL
        file_url = f"/static/uploads/{sub_folder}/{unique_filename}"
        return True, file_url
    except Exception as e:
        print(e)
        return False, "文件保存失败"


'''
    角色管理
'''


def get_characters_by_project_id(project_id):
    """
    根据项目ID获取所有角色
    :param project_id: 项目ID
    :return: 角色列表
    """
    return Character.query.filter_by(project_id=project_id).all()


def get_character_avatars(character_id):
    """
    根据角色ID获取该角色的所有头像
    :param character_id: 角色ID
    :return: 头像列表
    """
    return CharacterAvatar.query.filter_by(character_id=character_id).all()


def get_project_characters(project_id):
    """
    获取项目所有角色
    :param project_id:
    :return: 角色列表
    """
    return Character.query.filter_by(project_id=project_id).all()


def get_characterAvatar_by_id(avatar_id):
    """
        根据id查询角色立绘
        :param avatar_id: 角色立绘ID
        :return: CharacterAvatar对象或None
        """
    avatar = CharacterAvatar.query.filter_by(avatar_id=avatar_id).first()
    return avatar


def get_character_by_id(character_id):
    """
    根据character_id查询角色数据
    :param character_id: 角色ID
    :return: Character对象或None
    """
    character = Character.query.filter_by(character_id=character_id).first()
    return character


# 业务逻辑函数，传入角色ID列表，返回对应立绘数据列表
def fetch_character_avatars_batch(character_ids):
    avatars = CharacterAvatar.query.filter(
        CharacterAvatar.character_id.in_(character_ids)
    ).order_by(
        CharacterAvatar.character_id,
        CharacterAvatar.is_default.desc(),  # 默认立绘排前
        CharacterAvatar.created_at.desc()  # 新的排前
    ).all()

    # 构建字典列表返回
    return [{
        'avatar_id': a.avatar_id,
        'character_id': a.character_id,
        'image_url': a.image_url,
        'avatar_type': a.avatar_type,
        'costume': a.costume,
        'is_default': a.is_default,
        'created_at': a.created_at.isoformat() if a.created_at else None
    } for a in avatars]


def get_project_dialogue_count(project_id):
    """
    获取项目所有对话的数量
    :param project_id:
    :return: 对话记录数（整数）
    """
    return ScriptContent.query.filter_by(project_id=project_id).count()


def create_character(data):
    """
    创建角色
    :param data: 包含角色数据的字典
    :return: 创建的资源或错误
    """
    required_fields = ['project_id', 'name', 'is_main', 'description', 'age']
    if not all(field in data for field in required_fields):
        return {'code': 400, 'message': '缺少必要参数'}, 400

    try:
        new_character = Character(
            project_id=data['project_id'],
            name=data['name'],
            age=data['age'],
            description=data['description'],
            is_main=data['is_main']
        )

        db.session.add(new_character)
        db.session.commit()

        return {
            'code': 200,
            'message': '创建成功',
        }
    except Exception as e:
        print(e)
        db.session.rollback()
        return {'code': 500, 'message': f'创建失败: {str(e)}'}, 500


def update_character(character_id, data):
    """
    更新角色信息
    :param character_id: 角色的唯一标识符
    :param data: 包含要更新的角色数据的字典
    :return: 更新的结果或错误
    """
    try:
        # 查找要更新的角色
        character = Character.query.get(character_id)
        if not character:
            return {'code': 404, 'message': '角色未找到'}, 404

        # 更新角色属性，如果数据中有新值则更新，否则保持原值
        character.project_id = data.get('project_id', character.project_id)
        character.name = data.get('name', character.name)
        character.age = data.get('age', character.age)  # 如果没有提供age，则保持原值
        character.description = data.get('description', character.description)
        character.is_main = data.get('is_main', character.is_main)

        db.session.commit()

        return {
            'code': 200,
            'message': '更新成功',
        }
    except Exception as e:
        print(e)
        db.session.rollback()
        return {'code': 500, 'message': f'更新失败: {str(e)}'}, 500


def delete_character_with_relations(character_id):
    """
    删除角色及其所有关联数据的业务函数

    参数:
        character_id: 要删除的角色ID

    返回:
        tuple: (success: bool, message: str, status_code: int)
    """
    try:
        # 不再显式 db.session.begin()：Flask-SQLAlchemy 在首次查询时已自动开启事务，
        # 重复 begin 会抛 InvalidRequestError（P3-7）。事务边界由 commit/rollback 控制。

        # 1. 查询要删除的角色
        character = Character.query.get(character_id)
        if not character:
            return False, "角色不存在", 404

        project_id = character.project_id

        # 2. 处理脚本内容中的角色引用
        # 2.1 查找所有引用该角色的脚本内容
        related_script_contents = ScriptContent.query.filter_by(
            character_id=character_id
        ).all()

        # 2.2 收集这些内容的ID，用于后续处理分支路径
        related_content_ids = [content.content_id for content in related_script_contents]

        # 2.3 将这些脚本内容的character_id和avatar_id设为NULL
        for content in related_script_contents:
            content.character_id = None
            content.avatar_id = None
            db.session.add(content)

        # 3. 处理分支路径中的角色相关条件
        # 3.1 查找所有条件中包含该角色的分支路径
        all_branch_paths = BranchPath.query.filter_by(project_id=project_id).all()

        for path in all_branch_paths:
            if path.conditions and isinstance(path.conditions, dict):
                # 检查条件中是否引用了该角色
                if path.conditions.get('character_id') == character_id:
                    # 删除或修改条件
                    path.conditions = None  # 或者设置为其他默认值
                    db.session.add(path)

        # 4. 删除角色的所有头像
        CharacterAvatar.query.filter_by(character_id=character_id).delete()

        # 5. 删除角色本身
        db.session.delete(character)

        # 提交事务
        db.session.commit()

        return True, "角色及其关联数据已成功清理", 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return False, f"数据库错误: {str(e)}", 500
    except Exception as e:
        db.session.rollback()
        return False, f"服务器错误: {str(e)}", 500


def add_character_avatar(file, project_id, character_id, avatar_type, costume, is_main=0):
    """
    处理头像的保存和数据库的添加操作

    参数:
        file: 上传的图片文件
        project_id: 项目ID
        character_id: 角色ID
        avatar_type: 头像类型
        costume: 服装描述
        is_main: 是否为默认头像 (0 or 1)

    返回:
        成功时返回头像ID，失败时返回None
    """
    # 保存上传的文件
    image_url = save_uploaded_file(file, project_id)

    if not image_url:
        return None  # 文件保存失败

    # 如果 is_main 为 1，只把「本角色」原有的默认立绘取消默认。
    # 此前没有 character_id 条件，会把整个项目里所有角色的默认立绘一起清掉（P3-8）。
    if is_main == 1:
        try:
            db.session.query(CharacterAvatar).filter_by(
                character_id=character_id, is_default=True
            ).update({"is_default": False})
            db.session.commit()
        except Exception as e:
            print(f"更新默认头像失败: {e}")
            db.session.rollback()  # 回滚事务
            return None

    # 创建新角色头像对象
    new_avatar = CharacterAvatar(
        character_id=character_id,
        image_url=image_url,
        avatar_type=avatar_type,
        costume=costume,
        is_default=(is_main == 1)  # 如果 is_main 为 1，则设置为默认头像
    )

    # 添加到数据库
    try:
        db.session.add(new_avatar)
        db.session.commit()
        return new_avatar.avatar_id  # 返回新头像的ID
    except Exception as e:
        print(f"数据库操作失败: {e}")
        db.session.rollback()  # 回滚事务
        return None


def delete_character_avatar(avatar_id):
    """
    根据avatar_id删除角色立绘记录及对应的图片文件

    :param avatar_id: 要删除的立绘ID
    :return: 成功返回True，失败返回False
    """
    avatar = CharacterAvatar.query.get(avatar_id)
    if not avatar:
        return False

    try:
        # 构建图片文件路径
        image_path = f"app/{avatar.image_url}"
        # 删除数据库记录
        db.session.delete(avatar)
        db.session.commit()

        # 删除图片文件
        if os.path.exists(image_path):
            os.remove(image_path)

        return True
    except Exception as e:
        db.session.rollback()
        # 这里可以添加日志记录
        print(f"删除立绘失败: {str(e)}")
        return False


def update_character_avatar(avatar_id):
    """
    更新角色立绘信息（仅更新is_default字段）
    :param avatar_id: 要更新的角色立绘ID
    :return: 更新的结果或错误
    """
    try:
        # 先获取要更新的头像记录
        avatar = CharacterAvatar.query.get(avatar_id)
        if not avatar:
            return {'code': 404, 'message': '角色立绘未找到'}, 404

        # 获取该头像对应的角色ID
        character_id = avatar.character_id

        # 将该角色下的所有头像的is_default设为False
        db.session.query(CharacterAvatar) \
            .filter(CharacterAvatar.character_id == character_id) \
            .update({"is_default": False})

        # 然后更新指定头像的is_default为True
        avatar.is_default = True
        db.session.commit()

        return {
            'code': 200,
            'message': '更新成功',
        }
    except Exception as e:
        print(e)
        db.session.rollback()
        return {'code': 500, 'message': f'更新失败: {str(e)}'}, 500


'''
    场景管理业务逻辑
'''


def get_project_scenes(project_id):
    """
    获取项目所有场景，并确保order_num是连续的1,2,3,...n

    :param project_id: 项目ID
    :return: 场景列表（已按order_num排序）
    """
    # 获取该项目所有场景并按当前order_num排序
    scenes = Scene.query.filter_by(project_id=project_id).order_by(Scene.order_num).all()

    if not scenes:  # 没有场景时直接返回空列表
        return scenes

    # 检查order_num是否连续
    is_continuous = True
    for i in range(len(scenes)):
        # 正常连续的情况下，第i个场景的order_num应该是i+1
        if scenes[i].order_num != i + 1:
            is_continuous = False
            break

    # 如果不连续，则修正为连续的1,2,3,...n
    if not is_continuous:
        try:
            # 逐个更新场景的order_num
            for new_order, scene in enumerate(scenes, start=1):
                scene.order_num = new_order

            # 提交数据库事务
            db.session.commit()
        except Exception as e:
            # 发生错误时回滚
            db.session.rollback()
            print(f"修正项目ID {project_id} 的场景order_num时出错: {str(e)}")

    return scenes


def get_scene_by_id(scene_id):
    """
    根据ID获取场景
    :param scene_id: 场景ID
    :return: 场景对象或None
    """
    return Scene.query.get(scene_id)


def update_scene(scene_id, **kwargs):
    """
    更新场景信息
    :param scene_id: 场景ID
    :param kwargs: 要更新的字段（title, description, background_url, music_url）
    :return: 元组 (更新后的场景对象, 错误信息)，成功时错误信息为None
    """
    scene = Scene.query.get(scene_id)
    if not scene:
        return None, '场景不存在'

    # 更新字段
    if 'title' in kwargs:
        scene.title = kwargs['title']
    if 'description' in kwargs:
        scene.description = kwargs['description']
    if 'background_url' in kwargs:
        scene.background_url = kwargs['background_url']
    if 'music_url' in kwargs:
        scene.music_url = kwargs['music_url']

    try:
        db.session.commit()
        return scene, None
    except Exception as e:
        db.session.rollback()
        return None, f'更新场景失败: {str(e)}'


def create_new_scene(project_id, title, order_num,
                     background_url='', music_url='', description=''):
    """
    创建新场景
    :param project_id: 项目ID
    :param title: 场景标题
    :param order_num: 排序号
    :param background_url: 背景图片URL
    :param music_url: 音乐URL
    :param description: 场景描述
    :return: 新创建的场景对象
    """
    try:
        new_scene = Scene(
            project_id=project_id,
            title=title,
            background_url=background_url,
            music_url=music_url,
            description=description,
            order_num=order_num
        )

        db.session.add(new_scene)
        db.session.commit()
        return new_scene
    except SQLAlchemyError as e:
        db.session.rollback()
        raise e


_UNSET = object()


def update_existing_scene(scene_id, title=None, order_num=None,
                          background_url=_UNSET, music_url=_UNSET, description=_UNSET):
    """
    更新场景信息。

    只有显式传入的字段才会被写入 —— 修复「拖拽排序把背景图/音乐清空」(P0-3)：
    此前未传的可选字段默认取 ''，会整行覆盖掉数据库里的已有值。
    :param scene_id: 场景ID
    :param title: 场景标题（None 表示不修改）
    :param order_num: 排序号（None 表示不修改）
    :param background_url: 背景图片URL
    :param music_url: 音乐URL
    :param description: 场景描述
    :return: 更新后的场景对象
    """
    try:
        scene = Scene.query.get(scene_id)
        if not scene:
            return None

        if title is not None:
            scene.title = title
        if order_num is not None:
            scene.order_num = order_num
        if background_url is not _UNSET:
            scene.background_url = background_url
        if music_url is not _UNSET:
            scene.music_url = music_url
        if description is not _UNSET:
            scene.description = description

        db.session.commit()
        return scene
    except SQLAlchemyError as e:
        db.session.rollback()
        raise e


def delete_scene_by_id(scene_id):
    """
    删除场景（连同场景内对话与相关分支边）
    :param scene_id: 场景ID
    :return: 是否删除成功
    """
    try:
        scene = Scene.query.get(scene_id)
        if not scene:
            return False

        # script_contents.scene_id 是外键，必须先删对话；
        # 而 branch_paths 又引用 script_contents，所以顺序是：分支边 → 对话 → 场景。
        content_ids = [c.content_id for c in
                       ScriptContent.query.filter_by(scene_id=scene_id).all()]
        if content_ids:
            BranchPath.query.filter(
                or_(BranchPath.source_content_id.in_(content_ids),
                    BranchPath.target_content_id.in_(content_ids))
            ).delete(synchronize_session=False)
            ContentEffect.query.filter(
                ContentEffect.content_id.in_(content_ids)
            ).delete(synchronize_session=False)
            ReadRecord.query.filter(
                ReadRecord.content_id.in_(content_ids)
            ).delete(synchronize_session=False)
            _delete_endings_for_contents(content_ids)
            ScriptContent.query.filter_by(scene_id=scene_id).delete(synchronize_session=False)

        db.session.delete(scene)
        db.session.commit()
        return True
    except SQLAlchemyError as e:
        db.session.rollback()
        raise e


'''
    对话管理
'''


def get_dialogue_by_sceneId(scene_id):
    """
    根据场景ID获取所有对话
    :param scene_id: 场景ID
    :return: 对话列表
    """
    return ScriptContent.query.filter_by(scene_id=scene_id).order_by(ScriptContent.order_num).all()


def save_dialogue(data, content_id=None):
    """
    保存对话（新增或更新）
    :param data: 对话数据
    :param content_id: 对话ID（更新时需要）
    :return: 元组 (保存后的对话对象, 错误信息)，成功时错误信息为None
    """
    required_fields = ['project_id', 'scene_id', 'content_type', 'content_text', 'order_num']
    for field in required_fields:
        if field not in data:
            return None, f'缺少必要字段: {field}'

    if content_id:
        # 更新现有对话
        dialogue = ScriptContent.query.get(content_id)
        if not dialogue:
            return None, '对话不存在'
    else:
        # 创建新对话
        dialogue = ScriptContent()
        dialogue.created_at = datetime.now()
        db.session.add(dialogue)

    # 处理角色ID和头像ID：非"对话"类型时将空值转换为None
    if data['content_type'] != '对话':
        # 对于非对话类型，强制设为None（数据库NULL）
        character_id = None
        avatar_id = None
    else:
        # 对于对话类型，处理可能的空字符串
        character_id = data.get('character_id') or None
        avatar_id = data.get('avatar_id') or None
        # 确保数值类型（如果需要整数类型）
        if character_id is not None:
            try:
                character_id = int(character_id)
            except (ValueError, TypeError):
                character_id = None
        if avatar_id is not None:
            try:
                avatar_id = int(avatar_id)
            except (ValueError, TypeError):
                avatar_id = None

    # 更新字段
    dialogue.project_id = data['project_id']
    dialogue.scene_id = data['scene_id']
    dialogue.character_id = character_id
    dialogue.avatar_id = avatar_id
    dialogue.content_type = data['content_type']
    dialogue.content_text = data['content_text']
    dialogue.voice_url = data.get('voice_url')
    dialogue.order_num = data['order_num']

    try:
        db.session.commit()
        return dialogue, None
    except Exception as e:
        db.session.rollback()
        print(e)
        return None, f'保存对话失败: {str(e)}'


def delete_dialogue(content_id):
    """
    删除对话
    :param content_id: 对话ID
    :return: 元组 (是否成功, 错误信息)，成功时错误信息为None
    """
    dialogue = ScriptContent.query.get(content_id)
    if not dialogue:
        return False, '对话不存在'

    try:
        # 先清理引用该节点的分支边与数值变化：两者都外键引用 script_contents
        BranchPath.query.filter(
            or_(BranchPath.source_content_id == content_id,
                BranchPath.target_content_id == content_id)
        ).delete(synchronize_session=False)
        ContentEffect.query.filter_by(content_id=content_id).delete(synchronize_session=False)
        ReadRecord.query.filter_by(content_id=content_id).delete(synchronize_session=False)
        _delete_endings_for_contents([content_id])

        db.session.delete(dialogue)
        db.session.commit()
        return True, None
    except Exception as e:
        db.session.rollback()
        return False, f'删除对话失败: {str(e)}'


def reorder_dialogues(scene_id, ordered_content_ids):
    """
    重新排序指定场景下的对话

    :param scene_id: 场景ID
    :param ordered_content_ids: 按新顺序排列的对话ID列表
    :return: 元组 (是否成功, 错误信息)，成功时错误信息为None
    """
    try:
        # 获取该场景下的所有对话
        dialogues = ScriptContent.query.filter_by(scene_id=scene_id).all()
        if not dialogues:
            return False, "该场景下没有对话"

        # 创建对话ID到对话对象的映射
        dialogue_map = {d.content_id: d for d in dialogues}

        # 验证所有提供的对话ID都属于该场景
        for content_id in ordered_content_ids:
            if content_id not in dialogue_map:
                return False, f"对话ID {content_id} 不属于该场景或不存在"

        # 按新顺序更新order_num
        for new_order, content_id in enumerate(ordered_content_ids, 1):
            dialogue = dialogue_map[content_id]
            dialogue.order_num = new_order

        db.session.commit()
        return True, None

    except Exception as e:
        db.session.rollback()
        return False, f"重新排序失败: {str(e)}"


'''
    导入 / 导出
'''

BUNDLE_FORMAT = 'aigc-novel-project'
BUNDLE_VERSION = 1

_AVATAR_TYPES = ('正常', '高兴', '生气', '悲伤', '惊讶', '其他')
_CONTENT_TYPES = ('对话', '描述', '选择')


def build_project_bundle(project_id, user_id):
    """
    把项目及其全部内容序列化成可迁移的 JSON 包。

    :return: dict（成功）或 None（项目不存在/无权访问）
    """
    project = Project.query.filter_by(project_id=project_id, user_id=user_id).first()
    if not project:
        return None

    characters = Character.query.filter_by(project_id=project_id) \
        .order_by(Character.character_id).all()
    char_ids = [c.character_id for c in characters]
    avatars = (CharacterAvatar.query.filter(CharacterAvatar.character_id.in_(char_ids))
               .order_by(CharacterAvatar.avatar_id).all()) if char_ids else []

    scenes = Scene.query.filter_by(project_id=project_id) \
        .order_by(Scene.order_num, Scene.scene_id).all()
    contents = ScriptContent.query.filter_by(project_id=project_id) \
        .order_by(ScriptContent.order_num, ScriptContent.content_id).all()
    content_ids = [c.content_id for c in contents]

    variables = ProjectVariable.query.filter_by(project_id=project_id) \
        .order_by(ProjectVariable.variable_id).all()
    effects = (ContentEffect.query.filter(ContentEffect.content_id.in_(content_ids)).all()
               if content_ids else [])
    branches = BranchPath.query.filter_by(project_id=project_id).all()
    endings = Ending.query.filter_by(project_id=project_id).order_by(Ending.ending_id).all()
    cgs = (ProjectCG.query.filter_by(project_id=project_id)
           .order_by(ProjectCG.order_num, ProjectCG.cg_id).all())

    return {
        'format': BUNDLE_FORMAT,
        'version': BUNDLE_VERSION,
        'exported_at': datetime.now().isoformat(timespec='seconds'),
        'project': {
            'title': project.title,
            'genre': project.genre,
            'template_type': project.template_type or '线性叙事',
            'cover_url': project.cover_url,
            'word_count': project.word_count or 0,
        },
        'characters': [{
            'character_id': c.character_id,
            'name': c.name,
            'age': c.age,
            'description': c.description,
            'settings': c.settings,
            'is_main': bool(c.is_main),
        } for c in characters],
        'avatars': [{
            'avatar_id': a.avatar_id,
            'character_id': a.character_id,
            'image_url': a.image_url,
            'avatar_type': a.avatar_type,
            'costume': a.costume,
            'is_default': bool(a.is_default),
        } for a in avatars],
        'scenes': [{
            'scene_id': s.scene_id,
            'title': s.title,
            'background_url': s.background_url,
            'music_url': s.music_url,
            'description': s.description,
            'order_num': s.order_num,
        } for s in scenes],
        'script_contents': [{
            'content_id': c.content_id,
            'scene_id': c.scene_id,
            'character_id': c.character_id,
            'avatar_id': c.avatar_id,
            'content_type': c.content_type,
            'content_text': c.content_text,
            'voice_url': c.voice_url,
            'branch_condition': c.branch_condition,
            'order_num': c.order_num,
        } for c in contents],
        'variables': [{
            'variable_id': v.variable_id,
            'name': v.name,
            'label': v.label,
            'initial_value': v.initial_value,
            'min_value': v.min_value,
            'max_value': v.max_value,
            'description': v.description,
        } for v in variables],
        'effects': [{
            'content_id': e.content_id,
            'variable_id': e.variable_id,
            'delta': e.delta,
        } for e in effects],
        'branches': [{
            'source_content_id': b.source_content_id,
            'target_content_id': b.target_content_id,
            'choice_text': b.choice_text,
            'conditions': b.conditions,
        } for b in branches],
        'endings': [{
            'ending_id': en.ending_id,
            'title': en.title,
            'description': en.description,
            'content_id': en.content_id,
            'conditions': en.conditions,
        } for en in endings],
        # CG 图鉴：只带图片地址，不带市场素材 resource_id
        # （素材引用属于原作者的项目，导入方不应凭空获得引用计数）
        'cgs': [{
            'title': cg.title,
            'description': cg.description,
            'image_url': cg.image_url,
            'unlock_ending_id': cg.unlock_ending_id,
            'order_num': cg.order_num,
        } for cg in cgs],
    }


def render_project_script_text(project_id, user_id):
    """
    把项目渲染成纯文本剧本（按场景分节，含角色名、描述、选择）。

    :return: str（成功）或 None（项目不存在/无权访问）
    """
    project = Project.query.filter_by(project_id=project_id, user_id=user_id).first()
    if not project:
        return None

    char_names = {
        c.character_id: c.name
        for c in Character.query.filter_by(project_id=project_id).all()
    }
    scenes = Scene.query.filter_by(project_id=project_id) \
        .order_by(Scene.order_num, Scene.scene_id).all()

    lines = [
        f'《{project.title}》',
        f'类型：{project.genre}    叙事模板：{project.template_type or "线性叙事"}',
        '',
    ]
    for scene in scenes:
        lines.append(f'# 场景 {scene.order_num}：{scene.title}')
        if scene.description:
            lines.append(scene.description)
        contents = ScriptContent.query.filter_by(scene_id=scene.scene_id) \
            .order_by(ScriptContent.order_num, ScriptContent.content_id).all()
        for c in contents:
            if c.content_type == '对话':
                name = char_names.get(c.character_id) or '旁白'
                lines.append(f'{name}：{c.content_text}')
            elif c.content_type == '选择':
                lines.append(f'【选择】{c.content_text}')
            else:
                lines.append(f'（{c.content_text}）')
        lines.append('')
    return '\n'.join(lines)


def import_project_bundle(user_id, bundle):
    """
    由 JSON 包新建一个属于当前用户的项目，并按原 ID 映射重建全部内容。

    :param user_id: 接收导入的用户
    :param bundle: build_project_bundle 导出的 dict
    :return: (成功状态, 新项目对象或错误消息)
    """
    if not isinstance(bundle, dict):
        return False, '导入数据格式错误（应为 JSON 对象）'

    proj = bundle.get('project') or {}
    if not isinstance(proj, dict):
        return False, '导入数据缺少 project 字段'

    title = (proj.get('title') or '').strip()
    genre = proj.get('genre')
    if not title or not genre:
        return False, '导入数据缺少项目标题或类型'
    if genre not in GENRES:
        return False, f'不支持的作品类型: {genre}'

    template_type = proj.get('template_type') or '线性叙事'
    if template_type not in TEMPLATE_TYPES:
        template_type = '线性叙事'

    try:
        project = Project(
            user_id=user_id,
            title=title,
            genre=genre,
            cover_url=proj.get('cover_url'),
            template_type=template_type,
        )
        db.session.add(project)
        db.session.flush()

        # 角色（原 character_id → 新 character_id）
        char_map = {}
        for c in bundle.get('characters') or []:
            ch = Character(
                project_id=project.project_id,
                name=c.get('name') or '未命名角色',
                age=c.get('age'),
                description=c.get('description'),
                settings=c.get('settings'),
                is_main=bool(c.get('is_main')),
            )
            db.session.add(ch)
            db.session.flush()
            char_map[c.get('character_id')] = ch.character_id

        # 立绘
        avatar_map = {}
        for a in bundle.get('avatars') or []:
            new_cid = char_map.get(a.get('character_id'))
            if not new_cid:
                continue
            avatar_type = a.get('avatar_type') if a.get('avatar_type') in _AVATAR_TYPES else '其他'
            av = CharacterAvatar(
                character_id=new_cid,
                image_url=a.get('image_url') or '',
                avatar_type=avatar_type,
                costume=a.get('costume'),
                is_default=bool(a.get('is_default')),
            )
            db.session.add(av)
            db.session.flush()
            avatar_map[a.get('avatar_id')] = av.avatar_id

        # 场景
        scene_map = {}
        for s in bundle.get('scenes') or []:
            sc = Scene(
                project_id=project.project_id,
                title=s.get('title') or '未命名场景',
                background_url=s.get('background_url'),
                music_url=s.get('music_url'),
                description=s.get('description'),
                order_num=s.get('order_num') or len(scene_map) + 1,
            )
            db.session.add(sc)
            db.session.flush()
            scene_map[s.get('scene_id')] = sc.scene_id

        # 变量
        var_map = {}
        for v in bundle.get('variables') or []:
            pv = ProjectVariable(
                project_id=project.project_id,
                name=v.get('name') or f'var_{len(var_map) + 1}',
                label=v.get('label') or v.get('name') or '变量',
                initial_value=v.get('initial_value') or 0,
                min_value=v.get('min_value'),
                max_value=v.get('max_value'),
                description=v.get('description'),
            )
            db.session.add(pv)
            db.session.flush()
            var_map[v.get('variable_id')] = pv.variable_id

        # 对话 / 描述 / 选择（scene_id、character_id、avatar_id 都要重映射）
        content_map = {}
        for c in bundle.get('script_contents') or []:
            new_sid = scene_map.get(c.get('scene_id'))
            if not new_sid:
                continue  # 场景缺失的内容直接跳过，避免脏引用
            content_type = c.get('content_type') if c.get('content_type') in _CONTENT_TYPES else '描述'
            ct = ScriptContent(
                project_id=project.project_id,
                scene_id=new_sid,
                character_id=char_map.get(c.get('character_id')),
                avatar_id=avatar_map.get(c.get('avatar_id')),
                content_type=content_type,
                content_text=c.get('content_text') or '',
                voice_url=c.get('voice_url'),
                branch_condition=c.get('branch_condition'),
                order_num=c.get('order_num') or 1,
            )
            db.session.add(ct)
            db.session.flush()
            content_map[c.get('content_id')] = ct.content_id

        # 节点数值变化
        for e in bundle.get('effects') or []:
            nid = content_map.get(e.get('content_id'))
            nvid = var_map.get(e.get('variable_id'))
            if nid and nvid:
                db.session.add(ContentEffect(content_id=nid, variable_id=nvid,
                                             delta=e.get('delta') or 0))

        # 分支边
        for b in bundle.get('branches') or []:
            src = content_map.get(b.get('source_content_id'))
            tgt = content_map.get(b.get('target_content_id'))
            if src and tgt:
                db.session.add(BranchPath(
                    project_id=project.project_id,
                    source_content_id=src,
                    target_content_id=tgt,
                    choice_text=b.get('choice_text'),
                    conditions=b.get('conditions'),
                ))

        # 结局
        ending_map = {}
        for en in bundle.get('endings') or []:
            nid = content_map.get(en.get('content_id'))
            if nid:
                row = Ending(
                    project_id=project.project_id,
                    title=en.get('title') or '结局',
                    description=en.get('description'),
                    content_id=nid,
                    conditions=en.get('conditions'),
                )
                db.session.add(row)
                db.session.flush()
                ending_map[en.get('ending_id')] = row.ending_id

        # CG 图鉴（解锁结局按 map 重映射；未匹配的退化为初始可见）
        for cg in bundle.get('cgs') or []:
            image_url = cg.get('image_url')
            if not image_url:
                continue
            db.session.add(ProjectCG(
                project_id=project.project_id,
                title=cg.get('title') or 'CG',
                description=cg.get('description'),
                image_url=image_url,
                unlock_ending_id=ending_map.get(cg.get('unlock_ending_id')),
                order_num=cg.get('order_num') or 0,
            ))

        db.session.commit()
        update_project_word_count(project.project_id)
        return True, project
    except Exception as e:
        db.session.rollback()
        print(e)
        return False, '导入项目失败'