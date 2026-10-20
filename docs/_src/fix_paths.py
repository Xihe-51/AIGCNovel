# -*- coding: utf-8 -*-
"""把库内 Windows 反斜杠路径统一成 POSIX 风格（一次性修复）。"""
import sys

sys.path.insert(0, r'D:\AIGCNovel\back')

from app import create_app, db
from app.models import Scene, CharacterAvatar, Project, ScriptContent, MarketResource

app = create_app('default')

with app.app_context():
    changed = 0
    for s in Scene.query.all():
        if s.background_url and '\\' in s.background_url:
            s.background_url = s.background_url.replace('\\', '/')
            changed += 1
        if s.music_url and '\\' in s.music_url:
            s.music_url = s.music_url.replace('\\', '/')
            changed += 1
    for a in CharacterAvatar.query.all():
        if a.image_url and '\\' in a.image_url:
            a.image_url = a.image_url.replace('\\', '/')
            changed += 1
    for p in Project.query.all():
        if p.cover_url and '\\' in p.cover_url:
            p.cover_url = p.cover_url.replace('\\', '/')
            changed += 1
    for c in ScriptContent.query.all():
        if c.voice_url and '\\' in c.voice_url:
            c.voice_url = c.voice_url.replace('\\', '/')
            changed += 1
    for m in MarketResource.query.all():
        if m.file_url and '\\' in m.file_url:
            m.file_url = m.file_url.replace('\\', '/')
            changed += 1

    db.session.commit()
    print('changed fields:', changed)
    for s in Scene.query.filter_by(project_id=7):
        print(s.scene_id, s.background_url, s.music_url)
