from sqlalchemy import Column, BigInteger, String, Text, DateTime, Integer, Boolean, JSON, Numeric, Enum, ForeignKey, \
    func, UniqueConstraint
from . import db


class User(db.Model):
    __tablename__ = 'users'

    user_id = Column(BigInteger, primary_key=True, autoincrement=True)
    email = Column(String(100), unique=True, nullable=False)
    phone = Column(String(20), unique=True)
    password_hash = Column(String(255), nullable=False)
    username = Column(String(50), nullable=False)
    avatar_url = Column(String(255))
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())
    last_login = Column(DateTime)


class Project(db.Model):
    __tablename__ = 'projects'

    project_id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False)
    title = Column(String(100), nullable=False)
    cover_url = Column(String(255))
    genre = Column(Enum('悬疑', '恋爱', '科幻', '奇幻', '历史', '现代', '其他'), nullable=False)
    # 初始叙事模板：线性叙事 / 分支叙事 / 开放世界。
    # 设计文档要求该字段，此前只存在于前端类型里，后端从未落库（P1-1）。
    template_type = Column(String(20), nullable=False, default='线性叙事')
    word_count = Column(Integer, default=0)
    is_public = Column(Boolean, default=False)
    # 播放器 UI 皮肤：classic / sakura / ink / midnight / mint
    ui_theme = Column(String(20), nullable=False, default='classic')
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())
    updated_at = Column(DateTime, nullable=False, default=func.current_timestamp(), onupdate=func.current_timestamp())


class Character(db.Model):
    __tablename__ = 'characters'

    character_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    name = Column(String(50), nullable=False)
    age = Column(Integer)
    description = Column(Text)
    settings = Column(JSON)
    is_main = Column(Boolean, default=False)
    # 角色默认配音音色（火山 TTS voice_type，如 BV001_streaming）
    voice_type = Column(String(50))
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class CharacterAvatar(db.Model):
    __tablename__ = 'character_avatars'

    avatar_id = Column(BigInteger, primary_key=True, autoincrement=True)
    character_id = Column(BigInteger, ForeignKey('characters.character_id'), nullable=False)
    image_url = Column(String(255), nullable=False)
    avatar_type = Column(Enum('正常', '高兴', '生气', '悲伤', '惊讶', '其他'), nullable=False)
    costume = Column(String(50))
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class Scene(db.Model):
    __tablename__ = 'scenes'

    scene_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    title = Column(String(100), nullable=False)
    background_url = Column(String(255))
    music_url = Column(String(255))
    description = Column(Text)
    order_num = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class StoryChapter(db.Model):
    """章节/幕分组：只影响创作端展示，不改变场景播放顺序。"""
    __tablename__ = 'story_chapters'

    chapter_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    title = Column(String(100), nullable=False)
    order_num = Column(Integer, nullable=False, default=0)
    target_words = Column(Integer, nullable=False, default=0, server_default='0')
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class SceneChapter(db.Model):
    """场景 → 章节归属（一个场景最多属于一个章节）。"""
    __tablename__ = 'scene_chapters'

    scene_id = Column(BigInteger, ForeignKey('scenes.scene_id'), primary_key=True)
    chapter_id = Column(BigInteger, ForeignKey('story_chapters.chapter_id'), nullable=False)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)


class SceneLock(db.Model):
    """场景播放条件（剧情锁）：条件不满足时，顺序播放会跳过该场景。"""
    __tablename__ = 'scene_locks'

    scene_id = Column(BigInteger, ForeignKey('scenes.scene_id'), primary_key=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    conditions = Column(JSON)


class ScriptContent(db.Model):
    __tablename__ = 'script_contents'

    content_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    scene_id = Column(BigInteger, ForeignKey('scenes.scene_id'), nullable=False)
    character_id = Column(BigInteger, ForeignKey('characters.character_id'))
    avatar_id = Column(BigInteger, ForeignKey('character_avatars.avatar_id'))
    content_type = Column(Enum('对话', '描述', '选择'), nullable=False)
    content_text = Column(Text, nullable=False)
    voice_url = Column(String(255))
    branch_condition = Column(JSON)
    order_num = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class BranchPath(db.Model):
    __tablename__ = 'branch_paths'

    path_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    source_content_id = Column(BigInteger, ForeignKey('script_contents.content_id'), nullable=False)
    target_content_id = Column(BigInteger, ForeignKey('script_contents.content_id'), nullable=False)
    choice_text = Column(String(255))
    # 图片选项：选项卡片配图（可选），为空时仍是纯文字选项
    image_url = Column(String(255))
    conditions = Column(JSON)


class AIGeneration(db.Model):
    __tablename__ = 'ai_generations'

    generation_id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False)
    prompt_text = Column(Text, nullable=False)
    generated_text = Column(Text)
    length = Column(Integer)
    type = Column(String(10))
    forbidden_words = Column(Text)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class MarketResource(db.Model):
    __tablename__ = 'market_resources'

    resource_id = Column(BigInteger, primary_key=True, autoincrement=True)
    uploader_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False)
    title = Column(String(100), nullable=False)
    description = Column(Text)
    resource_type = Column(Enum('角色', '背景', 'CG', '其他'), nullable=False)
    file_url = Column(String(255), nullable=False)
    price = Column(Numeric(10, 2), default=0)
    license_type = Column(String(50), nullable=False)
    download_count = Column(Integer, default=0)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class AIModel(db.Model):
    __tablename__ = 'ai_models'
    model_id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False)
    name = Column(String(100), nullable=False)
    style_description = Column(Text, nullable=False)
    model_path = Column(String(255), nullable=False)
    type = Column(String(10))
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class SaveSlot(db.Model):
    """玩家存档位：slot=0 自动存档，1-3 手动存档。state_json 存播放器快照。"""
    __tablename__ = 'save_slots'

    save_id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    slot = Column(Integer, nullable=False)
    state_json = Column(JSON, nullable=False)
    summary = Column(String(255))
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())
    updated_at = Column(DateTime, nullable=False, default=func.current_timestamp(),
                        onupdate=func.current_timestamp())

    __table_args__ = (
        UniqueConstraint('user_id', 'project_id', 'slot', name='uq_save_slot'),
    )


class PlayEvent(db.Model):
    """玩家试玩埋点：开始、进入场景、选择分支、达成结局、通关。"""
    __tablename__ = 'play_events'

    event_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False, index=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=True)
    session_id = Column(String(64), nullable=False, index=True)
    event_type = Column(String(20), nullable=False, index=True)
    scene_id = Column(BigInteger)
    content_id = Column(BigInteger)
    path_id = Column(BigInteger)
    ending_id = Column(BigInteger)
    payload = Column(JSON)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp(), index=True)


class Achievement(db.Model):
    """作品成就：按结局/变量/通关条件解锁。"""
    __tablename__ = 'achievements'

    achievement_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False, index=True)
    title = Column(String(100), nullable=False)
    description = Column(String(255))
    # {"type": "ending"|"variable"|"finish", ...}
    condition = Column(JSON)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class AchievementUnlock(db.Model):
    """玩家已解锁成就（按用户+成就唯一）。"""
    __tablename__ = 'achievement_unlocks'

    unlock_id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False, index=True)
    achievement_id = Column(BigInteger, ForeignKey('achievements.achievement_id'),
                            nullable=False, index=True)
    unlocked_at = Column(DateTime, nullable=False, default=func.current_timestamp())

    __table_args__ = (
        UniqueConstraint('user_id', 'achievement_id', name='uq_achievement_unlock'),
    )


class ReadRecord(db.Model):
    """已读记录：用于「跳过已读」与二周目体验。"""
    __tablename__ = 'read_records'

    read_id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    content_id = Column(BigInteger, ForeignKey('script_contents.content_id'), nullable=False)
    read_at = Column(DateTime, nullable=False, default=func.current_timestamp())

    __table_args__ = (
        UniqueConstraint('user_id', 'project_id', 'content_id', name='uq_read_record'),
    )


class ProjectVariable(db.Model):
    """项目变量定义：好感度、数值、开关（0/1）。"""
    __tablename__ = 'project_variables'

    variable_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    name = Column(String(50), nullable=False)          # 英文 key，如 affection_lin
    label = Column(String(100), nullable=False)        # 展示名，如 林瑶好感度
    # 绑定角色后，播放器「好感度」面板会按角色展示这个变量
    character_id = Column(BigInteger, ForeignKey('characters.character_id'))
    initial_value = Column(Integer, nullable=False, default=0)
    min_value = Column(Integer)
    max_value = Column(Integer)
    # 跨周目保留：进入下一周目/重新开始时不清零
    persist = Column(Boolean, nullable=False, default=False, server_default='0')
    description = Column(Text)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())

    __table_args__ = (
        UniqueConstraint('project_id', 'name', name='uq_project_variable'),
    )


class ProjectMeta(db.Model):
    """玩家跨周目元数据：保存标记为 persist 的变量值。"""
    __tablename__ = 'project_meta'

    meta_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False, index=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False, index=True)
    state_json = Column(JSON)
    updated_at = Column(DateTime, nullable=False, default=func.current_timestamp(),
                          onupdate=func.current_timestamp())

    __table_args__ = (
        UniqueConstraint('user_id', 'project_id', name='uq_project_meta'),
    )


class ContentEffect(db.Model):
    """节点数值变化：到达某条 script_content 时给变量加/减多少。"""
    __tablename__ = 'content_effects'

    effect_id = Column(BigInteger, primary_key=True, autoincrement=True)
    content_id = Column(BigInteger, ForeignKey('script_contents.content_id'), nullable=False)
    variable_id = Column(BigInteger, ForeignKey('project_variables.variable_id'), nullable=False)
    delta = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint('content_id', 'variable_id', name='uq_content_effect'),
    )


class ContentDirective(db.Model):
    """节点演出指令：播放到某条 script_content 时执行的舞台动作。

    directive_type 取值：
      avatar     立绘：payload = {character_id, avatar_id, position(left/center/right),
                                action(show/hide/move), fade_ms}
      background 背景：payload = {url, transition(fade/none), duration_ms}
      music      BGM：payload = {url, action(play/stop), loop}
      sound      音效：payload = {url, volume}
      wait       停顿：payload = {ms}
    """
    __tablename__ = 'content_directives'

    directive_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    content_id = Column(BigInteger, ForeignKey('script_contents.content_id'), nullable=False)
    directive_type = Column(String(32), nullable=False)
    payload = Column(JSON)
    order_num = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class Ending(db.Model):
    """结局定义：到达 content_id 时，若 conditions 全部成立则触发。"""
    __tablename__ = 'endings'

    ending_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    title = Column(String(100), nullable=False)
    description = Column(Text)
    content_id = Column(BigInteger, ForeignKey('script_contents.content_id'), nullable=False)
    conditions = Column(JSON)          # [{variable, op, value}, ...]
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class EndingUnlock(db.Model):
    """玩家已解锁的结局（按用户+结局唯一）。"""
    __tablename__ = 'ending_unlocks'

    unlock_id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    ending_id = Column(BigInteger, ForeignKey('endings.ending_id'), nullable=False)
    unlocked_at = Column(DateTime, nullable=False, default=func.current_timestamp())

    __table_args__ = (
        UniqueConstraint('user_id', 'ending_id', name='uq_ending_unlock'),
    )


class MusicUnlock(db.Model):
    """玩家已解锁的 BGM 鉴赏曲目（按用户+项目+音乐地址唯一）。"""
    __tablename__ = 'music_unlocks'

    unlock_id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    music_url = Column(String(255), nullable=False)
    unlocked_at = Column(DateTime, nullable=False, default=func.current_timestamp())

    __table_args__ = (
        UniqueConstraint('user_id', 'project_id', 'music_url', name='uq_music_unlock'),
    )


class ProjectCG(db.Model):
    """CG 图鉴条目：作者为作品登记的 CG。

    - image_url：CG 图片地址（玩家上传到项目静态目录，或市场素材的 file_url）
    - resource_id：可选，来源于市场「CG」素材时记录，用于素材引用计数
    - unlock_ending_id：可选，绑定结局；为空表示初始可见（无需解锁）
      玩家侧是否可见完全由 ending_unlocks 推导，不额外维护解锁表。
    """
    __tablename__ = 'project_cgs'

    cg_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    title = Column(String(100), nullable=False)
    description = Column(Text)
    image_url = Column(String(255), nullable=False)
    resource_id = Column(BigInteger, ForeignKey('market_resources.resource_id'))
    unlock_ending_id = Column(BigInteger, ForeignKey('endings.ending_id'))
    order_num = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class ResourceReference(db.Model):
    """素材引用计数：记录某用户把某市场资源引用到了哪个项目。

    同一素材可被同一用户引用到多个项目，但同一 (资源, 用户, 项目) 只算一次。
    """
    __tablename__ = 'resource_references'

    reference_id = Column(BigInteger, primary_key=True, autoincrement=True)
    resource_id = Column(BigInteger, ForeignKey('market_resources.resource_id'), nullable=False)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())

    __table_args__ = (
        UniqueConstraint('resource_id', 'user_id', 'project_id', name='uq_resource_reference'),
    )


class ProjectVersion(db.Model):
    """项目剧本版本快照：保存场景、台词与分支，支持差异预览和恢复。"""
    __tablename__ = 'project_versions'

    version_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False, index=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False)
    label = Column(String(100))
    # JSON 文本；用 LONGTEXT，避免长篇项目超过 MySQL TEXT 64KB 上限
    snapshot = Column(db.Text(length=4294967295), nullable=False)
    content_hash = Column(String(32), nullable=False)
    scene_count = Column(Integer, nullable=False, default=0)
    content_count = Column(Integer, nullable=False, default=0)
    branch_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class ProjectRelease(db.Model):
    """作品发布记录：绑定一次剧本快照，记录更新说明，支持回滚到该版本。"""
    __tablename__ = 'project_releases'

    release_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False, index=True)
    user_id = Column(BigInteger, ForeignKey('users.user_id'), nullable=False)
    # 绑定的剧本快照；该快照不会被版本清理删除
    version_id = Column(BigInteger, ForeignKey('project_versions.version_id'), nullable=False)
    # 项目内递增的发布序号，从 1 开始
    release_no = Column(Integer, nullable=False, default=1)
    notes = Column(Text)
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())


class ProjectTerm(db.Model):
    """术语表：统一人名/地名/专有名词写法，扫描错别别名。"""
    __tablename__ = 'project_terms'

    term_id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey('projects.project_id'), nullable=False, index=True)
    # 标准写法，例如「林瑶」
    standard = Column(String(100), nullable=False)
    # 需要纠正的别名/错写，用逗号、顿号或换行分隔
    variants = Column(Text)
    note = Column(String(255))
    created_at = Column(DateTime, nullable=False, default=func.current_timestamp())
    updated_at = Column(DateTime, nullable=False, default=func.current_timestamp(),
                        onupdate=func.current_timestamp())
