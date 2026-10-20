# -*- coding=utf-8 -*-
"""
Celery 异步任务定义。

把耗时的三类 AI 生成（文本 / 图像 / 语音）搬进后台任务，
接口只投递任务并立即返回 task_id，由前端轮询 /ai/task/<id> 获取进度。

注意：任务函数内部必须显式接收所有参数（JSON 可序列化），
不能依赖请求上下文。
"""
from celery import states

from celery_app import celery_app
from .services import (generate_and_save_text, generate_anime_image,
                       generate_music, generate_voice)
from .story import continue_story
from . import rag


# ==================== 文本生成 ====================

@celery_app.task(bind=True, name='ai.generate_text')
def task_generate_text(self, *, model, prompt, length, forbidden_words, user_id,
                       generation_type='text'):
    self.update_state(state='PROGRESS', meta={'stage': '正在调用文本模型…'})
    ok, result = generate_and_save_text(
        model=model,
        prompt=prompt,
        length=length,
        forbidden_words=forbidden_words,
        user_id=user_id,
        generation_type=generation_type,
    )
    if not ok:
        raise RuntimeError(result.get('message', '文本生成失败'))
    return result


# ==================== 图像生成 ====================

@celery_app.task(bind=True, name='ai.generate_image')
def task_generate_image(self, *, user_id, prompt, model_id, width, height):
    self.update_state(state='PROGRESS', meta={'stage': '正在生成图像…'})
    ok, info = generate_anime_image(
        user_id=user_id,
        prompt=prompt,
        model_id=model_id,
        width=width,
        height=height,
    )
    if not ok:
        raise RuntimeError(info.get('message', '图像生成失败'))
    return info


# ==================== 音乐（MusicGen）与配音（TTS）====================

@celery_app.task(bind=True, name='ai.generate_music')
def task_generate_music(self, *, user_id, prompt, duration, model_path):
    self.update_state(state='PROGRESS', meta={'stage': '正在生成音乐…'})
    ok, info = generate_music(user_id, prompt, duration, model_path)
    if not ok:
        raise RuntimeError(info.get('message', '音乐生成失败'))
    return info


@celery_app.task(bind=True, name='ai.generate_voice')
def task_generate_voice(self, *, user_id, text, voice_type=None, duration=0):
    self.update_state(state='PROGRESS', meta={'stage': '正在合成配音…'})
    ok, info = generate_voice(user_id, text, voice_type=voice_type, duration=duration)
    if not ok:
        raise RuntimeError(info.get('message', '配音生成失败'))
    return info


TASK_MAP = {
    'text': task_generate_text,
    'image': task_generate_image,
    'music': task_generate_music,
    'voice': task_generate_voice,
    'story': None,       # 占位，下方定义后覆盖
    'rag': None,         # 占位，下方定义后覆盖
}


# ==================== 剧情续写（第 2 批：LangChain 上下文 + RAG） ====================

@celery_app.task(bind=True, name='ai.continue_story')
def task_continue_story(self, *, user_id, project_id, scene_id=None, user_input='',
                        history=None, session_id=None, stateful=False,
                        use_rag=True, length=500, forbidden_words=None,
                        temperature=0.8, model=None):
    self.update_state(state='PROGRESS', meta={'stage': '正在压缩上下文并检索人设…'})
    ok, result = continue_story(
        user_id=user_id, project_id=project_id, scene_id=scene_id,
        user_input=user_input, history=history, session_id=session_id,
        stateful=stateful, use_rag=use_rag, length=length,
        forbidden_words=forbidden_words, temperature=temperature, model=model,
    )
    if not ok:
        raise RuntimeError(result.get('message', '剧情续写失败'))
    return result


# ==================== 人设索引重建（第 2 批：RAG） ====================

@celery_app.task(bind=True, name='ai.rebuild_persona_index')
def task_rebuild_persona_index(self, *, project_id, force=False):
    self.update_state(state='PROGRESS', meta={'stage': '正在向量化角色人设…'})
    result = rag.build_index(project_id, force=force)
    if not result.get('ok'):
        raise RuntimeError(result.get('reason') or '人设索引重建失败')
    return result


TASK_MAP['story'] = task_continue_story
TASK_MAP['rag'] = task_rebuild_persona_index
