# -*- coding: utf-8 -*-
"""项目剧本版本：快照、差异对比、恢复。

快照覆盖场景、台词节点、分支选项与结局。角色/立绘/素材文件不在快照内，
恢复时只重建剧本结构与文本，避免误删素材。
"""
import hashlib
import json

from .. import db
from ..models import (BranchPath, Character, CharacterAvatar, ContentDirective,
                      ContentEffect, Ending, EndingUnlock, Project, ProjectCG,
                      ProjectRelease, ProjectVersion, ReadRecord, Scene,
                      ScriptContent)

MAX_VERSIONS = 30
# 差异接口最多返回的明细条数，避免超大项目把响应撑爆
MAX_DIFF_ITEMS = 80


def _scene_dict(s):
    return {
        'scene_id': int(s.scene_id),
        'title': s.title or '',
        'background_url': s.background_url,
        'music_url': s.music_url,
        'description': s.description,
        'order_num': int(s.order_num or 0),
    }


def _content_dict(c):
    return {
        'content_id': int(c.content_id),
        'scene_id': int(c.scene_id),
        'content_type': c.content_type,
        'character_id': int(c.character_id) if c.character_id else None,
        'avatar_id': int(c.avatar_id) if c.avatar_id else None,
        'content_text': c.content_text or '',
        'voice_url': c.voice_url,
        'branch_condition': c.branch_condition,
        'order_num': int(c.order_num or 0),
    }


def _branch_dict(b):
    return {
        'path_id': int(b.path_id),
        'source_content_id': int(b.source_content_id),
        'target_content_id': int(b.target_content_id),
        'choice_text': b.choice_text or '',
        'image_url': b.image_url,
        'conditions': b.conditions,
    }


def _ending_dict(e):
    return {
        'ending_id': int(e.ending_id),
        'title': e.title or '',
        'description': e.description,
        'content_id': int(e.content_id),
        'conditions': e.conditions,
    }


def build_snapshot(project_id):
    scenes = (Scene.query.filter_by(project_id=project_id)
              .order_by(Scene.order_num.asc(), Scene.scene_id.asc()).all())
    contents = (ScriptContent.query.filter_by(project_id=project_id)
                .order_by(ScriptContent.scene_id.asc(),
                          ScriptContent.order_num.asc(),
                          ScriptContent.content_id.asc()).all())
    branches = (BranchPath.query.filter_by(project_id=project_id)
                .order_by(BranchPath.path_id.asc()).all())
    endings = (Ending.query.filter_by(project_id=project_id)
               .order_by(Ending.ending_id.asc()).all())
    return {
        'scenes': [_scene_dict(s) for s in scenes],
        'contents': [_content_dict(c) for c in contents],
        'branches': [_branch_dict(b) for b in branches],
        'endings': [_ending_dict(e) for e in endings],
    }


def _snapshot_hash(snapshot):
    raw = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.md5(raw.encode('utf-8')).hexdigest()


def version_to_dict(v):
    return {
        'version_id': int(v.version_id),
        'project_id': int(v.project_id),
        'label': v.label or '',
        'scene_count': int(v.scene_count or 0),
        'content_count': int(v.content_count or 0),
        'branch_count': int(v.branch_count or 0),
        'created_at': v.created_at.isoformat() if v.created_at else None,
    }


def create_version(project_id, user_id, label='', dedupe=True):
    """生成一个版本；与上一版内容完全一致时默认复用上一版。"""
    snapshot = build_snapshot(project_id)
    digest = _snapshot_hash(snapshot)
    latest = (ProjectVersion.query.filter_by(project_id=project_id)
              .order_by(ProjectVersion.version_id.desc()).first())
    if dedupe and latest and latest.content_hash == digest:
        return latest, False

    version = ProjectVersion(
        project_id=project_id,
        user_id=user_id,
        label=(label or '手动快照')[:100],
        snapshot=json.dumps(snapshot, ensure_ascii=False),
        content_hash=digest,
        scene_count=len(snapshot['scenes']),
        content_count=len(snapshot['contents']),
        branch_count=len(snapshot['branches']),
    )
    db.session.add(version)
    db.session.commit()

    # 只保留最近 MAX_VERSIONS 个版本；发布记录引用的快照必须保留
    stale = (ProjectVersion.query.filter_by(project_id=project_id)
             .order_by(ProjectVersion.version_id.desc())
             .offset(MAX_VERSIONS).all())
    if stale:
        protected = {int(r.version_id) for r in
                     ProjectRelease.query.filter_by(project_id=project_id).all()}
        removed = False
        for row in stale:
            if int(row.version_id) in protected:
                continue
            db.session.delete(row)
            removed = True
        if removed:
            db.session.commit()
    return version, True


def _text_snippet(text, limit=120):
    text = (text or '').replace('\n', ' ').strip()
    return text if len(text) <= limit else text[:limit] + '…'


def diff_snapshot(project_id, snapshot):
    """对比版本快照与当前内容，返回从「版本」到「当前」的变化。"""
    current = build_snapshot(project_id)

    scene_title = {s['scene_id']: s['title'] for s in snapshot.get('scenes') or []}
    for s in current['scenes']:
        scene_title[s['scene_id']] = s['title']

    diff = {
        'scenes': {'added': [], 'removed': [], 'modified': []},
        'contents': {'added': [], 'removed': [], 'modified': [], 'total': 0},
        'branches': {'added': 0, 'removed': 0, 'modified': 0, 'total': 0},
        'endings': {'added': 0, 'removed': 0, 'modified': 0, 'total': 0},
        'summary': {'scene_changed': 0, 'content_changed': 0, 'branch_changed': 0},
    }

    old_scenes = {s['scene_id']: s for s in snapshot.get('scenes') or []}
    new_scenes = {s['scene_id']: s for s in current['scenes']}
    for sid, old in old_scenes.items():
        new = new_scenes.get(sid)
        if not new:
            diff['scenes']['removed'].append({'scene_id': sid, 'title': old['title']})
            continue
        changes = []
        for field, label in (('title', '标题'), ('description', '描述'),
                             ('background_url', '背景'), ('music_url', '音乐'),
                             ('order_num', '顺序')):
            if (old.get(field) or '') != (new.get(field) or ''):
                changes.append({'field': label, 'before': old.get(field), 'after': new.get(field)})
        if changes:
            diff['scenes']['modified'].append({
                'scene_id': sid, 'title': new['title'], 'changes': changes,
            })
    for sid, new in new_scenes.items():
        if sid not in old_scenes:
            diff['scenes']['added'].append({'scene_id': sid, 'title': new['title']})

    def content_item(row):
        return {
            'content_id': row['content_id'],
            'scene_id': row['scene_id'],
            'scene_title': scene_title.get(row['scene_id'], ''),
            'content_type': row['content_type'],
            'character_id': row.get('character_id'),
            'text': _text_snippet(row.get('content_text')),
        }

    old_contents = {c['content_id']: c for c in snapshot.get('contents') or []}
    new_contents = {c['content_id']: c for c in current['contents']}
    for cid, old in old_contents.items():
        new = new_contents.get(cid)
        if not new:
            diff['contents']['removed'].append(content_item(old))
            continue
        changes = []
        for field, label in (('content_text', '文本'), ('content_type', '类型'),
                             ('character_id', '角色'), ('avatar_id', '立绘'),
                             ('order_num', '顺序'), ('scene_id', '所属场景')):
            if old.get(field) != new.get(field):
                changes.append({'field': label, 'before': old.get(field), 'after': new.get(field)})
        if changes:
            item = content_item(new)
            item['changes'] = changes
            diff['contents']['modified'].append(item)
    for cid, new in new_contents.items():
        if cid not in old_contents:
            diff['contents']['added'].append(content_item(new))

    old_branches = {b['path_id']: b for b in snapshot.get('branches') or []}
    new_branches = {b['path_id']: b for b in current['branches']}
    for bid, old in old_branches.items():
        new = new_branches.get(bid)
        if not new:
            diff['branches']['removed'] += 1
        elif any(old.get(f) != new.get(f) for f in
                 ('source_content_id', 'target_content_id', 'choice_text', 'image_url', 'conditions')):
            diff['branches']['modified'] += 1
    diff['branches']['added'] = len([bid for bid in new_branches if bid not in old_branches])
    diff['branches']['total'] = (diff['branches']['added'] + diff['branches']['removed']
                                 + diff['branches']['modified'])

    old_endings = {e['ending_id']: e for e in snapshot.get('endings') or []}
    new_endings = {e['ending_id']: e for e in current['endings']}
    for eid, old in old_endings.items():
        new = new_endings.get(eid)
        if not new:
            diff['endings']['removed'] += 1
        elif any(old.get(f) != new.get(f) for f in ('title', 'description', 'content_id', 'conditions')):
            diff['endings']['modified'] += 1
    diff['endings']['added'] = len([eid for eid in new_endings if eid not in old_endings])
    diff['endings']['total'] = (diff['endings']['added'] + diff['endings']['removed']
                                + diff['endings']['modified'])

    # 只回传前 MAX_DIFF_ITEMS 条明细，但总数按完整变化量统计
    content_total = (len(diff['contents']['added']) + len(diff['contents']['removed'])
                     + len(diff['contents']['modified']))
    for key in ('added', 'removed', 'modified'):
        diff['contents'][key] = diff['contents'][key][:MAX_DIFF_ITEMS]
    diff['contents']['total'] = content_total
    diff['summary']['scene_changed'] = (
        len(diff['scenes']['added']) + len(diff['scenes']['removed'])
        + len(diff['scenes']['modified']))
    diff['summary']['content_changed'] = diff['contents']['total']
    diff['summary']['branch_changed'] = diff['branches']['total']
    return diff


def _valid_character_ids(project_id):
    return {int(c.character_id) for c in Character.query.filter_by(project_id=project_id).all()}


def _valid_avatar_map(character_ids):
    if not character_ids:
        return {}
    rows = CharacterAvatar.query.filter(CharacterAvatar.character_id.in_(character_ids)).all()
    return {int(a.avatar_id): int(a.character_id) for a in rows}


def restore_snapshot(project_id, user_id, snapshot):
    """把项目剧本恢复到快照状态。

    返回恢复统计。恢复前会自动生成一份「恢复前备份」版本。
    """
    backup, _ = create_version(project_id, user_id, '恢复前自动备份', dedupe=False)

    scene_map = {}
    scenes_updated = 0
    scenes_created = 0
    existing_scenes = {int(s.scene_id): s for s in Scene.query.filter_by(project_id=project_id).all()}

    for item in snapshot.get('scenes') or []:
        old_id = int(item['scene_id'])
        scene = existing_scenes.get(old_id)
        title = str(item.get('title') or '未命名场景')[:100]
        order_num = int(item.get('order_num') or 0)
        if scene:
            scene.title = title
            scene.order_num = order_num
            scene.background_url = item.get('background_url')
            scene.music_url = item.get('music_url')
            scene.description = item.get('description')
            scene_map[old_id] = old_id
            scenes_updated += 1
        else:
            scene = Scene(
                project_id=project_id,
                title=title,
                order_num=order_num,
                background_url=item.get('background_url'),
                music_url=item.get('music_url'),
                description=item.get('description'),
            )
            db.session.add(scene)
            db.session.flush()
            scene_map[old_id] = int(scene.scene_id)
            scenes_created += 1

    # 先清空分支，避免恢复节点时被外键挡住
    BranchPath.query.filter_by(project_id=project_id).delete(synchronize_session=False)

    valid_chars = _valid_character_ids(project_id)
    valid_avatars = _valid_avatar_map(valid_chars)

    current_contents = {int(c.content_id): c for c in
                        ScriptContent.query.filter_by(project_id=project_id).all()}
    content_map = {}
    keep_ids = set()
    contents_updated = 0
    contents_created = 0
    allowed_types = ('对话', '描述', '选择')

    for item in snapshot.get('contents') or []:
        old_id = int(item['content_id'])
        scene_id = scene_map.get(int(item.get('scene_id') or 0))
        if not scene_id:
            continue
        content_type = item.get('content_type')
        if content_type not in allowed_types:
            content_type = '描述'
        character_id = int(item['character_id']) if item.get('character_id') else None
        if character_id not in valid_chars:
            character_id = None
        avatar_id = int(item['avatar_id']) if item.get('avatar_id') else None
        if avatar_id not in valid_avatars:
            avatar_id = None
        # 立绘必须属于对应角色，否则置空避免错配
        if character_id and avatar_id and valid_avatars.get(avatar_id) != character_id:
            avatar_id = None

        content = current_contents.get(old_id)
        if content:
            content.scene_id = scene_id
            content.content_type = content_type
            content.character_id = character_id
            content.avatar_id = avatar_id
            content.content_text = item.get('content_text') or ''
            content.voice_url = item.get('voice_url')
            content.branch_condition = item.get('branch_condition')
            content.order_num = int(item.get('order_num') or 0)
            content_map[old_id] = old_id
            keep_ids.add(old_id)
            contents_updated += 1
        else:
            content = ScriptContent(
                project_id=project_id,
                scene_id=scene_id,
                content_type=content_type,
                character_id=character_id,
                avatar_id=avatar_id,
                content_text=item.get('content_text') or '',
                voice_url=item.get('voice_url'),
                branch_condition=item.get('branch_condition'),
                order_num=int(item.get('order_num') or 0),
            )
            db.session.add(content)
            db.session.flush()
            content_map[old_id] = int(content.content_id)
            keep_ids.add(int(content.content_id))
            contents_created += 1

    # 快照之后新增的内容：先清理依赖，再删除
    delete_ids = [cid for cid in current_contents if cid not in keep_ids]
    contents_deleted = 0
    if delete_ids:
        ending_rows = Ending.query.filter(Ending.project_id == project_id,
                                          Ending.content_id.in_(delete_ids)).all()
        ending_ids = [int(e.ending_id) for e in ending_rows]
        if ending_ids:
            ProjectCG.query.filter(ProjectCG.unlock_ending_id.in_(ending_ids)).update(
                {'unlock_ending_id': None}, synchronize_session=False)
            EndingUnlock.query.filter(EndingUnlock.ending_id.in_(ending_ids)).delete(
                synchronize_session=False)
            Ending.query.filter(Ending.ending_id.in_(ending_ids)).delete(synchronize_session=False)
        ContentEffect.query.filter(ContentEffect.content_id.in_(delete_ids)).delete(
            synchronize_session=False)
        ContentDirective.query.filter(ContentDirective.content_id.in_(delete_ids)).delete(
            synchronize_session=False)
        ReadRecord.query.filter(ReadRecord.content_id.in_(delete_ids)).delete(
            synchronize_session=False)
        contents_deleted = ScriptContent.query.filter(
            ScriptContent.project_id == project_id,
            ScriptContent.content_id.in_(delete_ids)).delete(synchronize_session=False)

    branches_created = 0
    for item in snapshot.get('branches') or []:
        source = content_map.get(int(item.get('source_content_id') or 0))
        target = content_map.get(int(item.get('target_content_id') or 0))
        if not source or not target:
            continue
        db.session.add(BranchPath(
            project_id=project_id,
            source_content_id=source,
            target_content_id=target,
            choice_text=item.get('choice_text') or '',
            image_url=item.get('image_url'),
            conditions=item.get('conditions'),
        ))
        branches_created += 1

    # 结局恢复到快照；内容节点已删除的结局无法恢复，跳过
    endings_restored = 0
    current_endings = {int(e.ending_id): e for e in
                       Ending.query.filter_by(project_id=project_id).all()}
    for item in snapshot.get('endings') or []:
        content_id = content_map.get(int(item.get('content_id') or 0))
        if not content_id:
            continue
        ending_id = int(item['ending_id'])
        ending = current_endings.get(ending_id)
        if ending:
            ending.title = str(item.get('title') or '未命名结局')[:100]
            ending.description = item.get('description')
            ending.content_id = content_id
            ending.conditions = item.get('conditions')
        else:
            db.session.add(Ending(
                project_id=project_id,
                title=str(item.get('title') or '未命名结局')[:100],
                description=item.get('description'),
                content_id=content_id,
                conditions=item.get('conditions'),
            ))
        endings_restored += 1

    db.session.commit()

    total = (db.session.query(db.func.sum(db.func.char_length(ScriptContent.content_text)))
             .filter(ScriptContent.project_id == project_id).scalar() or 0)
    project = db.session.get(Project, project_id)
    if project:
        project.word_count = int(total)
        db.session.commit()

    return {
        'backup_version_id': int(backup.version_id),
        'scenes_updated': scenes_updated,
        'scenes_created': scenes_created,
        'contents_updated': contents_updated,
        'contents_created': contents_created,
        'contents_deleted': contents_deleted,
        'branches_created': branches_created,
        'endings_restored': endings_restored,
    }
