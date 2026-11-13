/**
 * 预览区与编辑区的联动：右侧舞台跟随当前编辑的台词，并负责立绘 / 素材地址解析。
 *
 * 组件只管「点了哪张卡」；这里统一维护当前台词下标、搜索定位高亮、
 * 角色立绘差分层与静态资源时间戳（绕过浏览器缓存）。
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { BASE_URL } from '@/utils/request'
import { parseRichText, renderRichHtml } from '@/utils/richText'

/** 搜索定位高亮的持续时间（毫秒）。 */
export const FOCUS_PULSE_MS = 2000

/**
 * 静态资源地址：项目内路径补 BASE_URL 并追加时间戳；内联 / 外链原样返回。
 * 纯函数，nonce 由调用方给（通常取当前时间戳）。
 */
export const buildAssetSrc = (url: any, nonce: number | string) => {
  if (!url) return ''
  const raw = String(url)
  // data:/blob: 是内联内容，追加查询参数会直接破坏地址
  if (/^(data:|blob:)/i.test(raw)) return raw
  // 外链可能带签名或自身查询参数，不做热重载改写
  if (/^https?:/i.test(raw)) return raw
  const base = raw.startsWith('/assets/') || raw.startsWith('/src/')
    ? raw
    : (raw.startsWith('/') ? BASE_URL + raw : `${BASE_URL}/${raw}`)
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}v=${nonce}`
}

/** 立绘差分层：返回 [基础图, ...叠加层]，叠加层按 order 升序。纯函数。 */
export const collectAvatarLayers = (
  characters: any[],
  avatarId: any,
  resolveSrc: (url: any) => string,
) => {
  if (!avatarId) return []
  for (const char of characters || []) {
    const avatar = (char.avatars || []).find((a: any) => a.avatar_id === avatarId)
    if (!avatar || !avatar.image_url) continue
    const layers = (avatar.layers || [])
      .filter((l: any) => l && l.image_url)
      .slice()
      .sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .map((l: any) => resolveSrc(l.image_url))
    return [resolveSrc(avatar.image_url), ...layers]
  }
  return []
}

/** 表情差分选项文案：表情 · 服装，默认立绘加后缀避免重名。纯函数。 */
export const avatarOptionLabel = (avatar: any) => {
  const name = [avatar?.avatar_type, avatar?.costume].filter(Boolean).join(' · ')
  return avatar?.is_default ? `${name}（默认）` : name
}

/** 某角色下的全部立绘差分；角色不存在时返回空数组。纯函数。 */
export const avatarsOfCharacter = (characters: any[], characterId: any) => {
  if (!characterId) return []
  const char = (characters || []).find((c: any) => c.character_id === characterId)
  return char ? (char.avatars || []) : []
}

export interface SceneDialoguePreviewContext {
  dialogues: Ref<any[]>
  characters: Ref<any[]>
  currentDialogueIndex: Ref<number>
  focusedContentId: Ref<number | null>
  focusContentId: () => number | null
  getCharacterName: (characterId: any) => string
}

export function useSceneDialoguePreview(ctx: SceneDialoguePreviewContext) {
  const { dialogues, characters, currentDialogueIndex, focusedContentId } = ctx

  const currentDialogue = computed(() => dialogues.value[currentDialogueIndex.value])

  // 富文本：把 ** / [color] 等标记渲染成 HTML，避免作者在预览里看到原始标记
  const richPreviewHtml = (text: any) => renderRichHtml(parseRichText(text || ''), Infinity)
  // 传给 StagePreview 的纯展示数据，避免子组件依赖角色/富文本逻辑
  const currentSpeakerName = computed(() => ctx.getCharacterName(currentDialogue.value?.character_id))
  const currentDialogueHtml = computed(() => richPreviewHtml(currentDialogue.value?.content_text || ''))

  // 点编辑区的对话卡时，右侧预览同步切到这一条
  const selectDialogue = (index: number) => {
    if (currentDialogueIndex.value !== index) currentDialogueIndex.value = index
  }

  let focusPulseTimer: any = null
  // 全项目搜索命中后：选中并滚动到对应对话
  const focusDialogueByContentId = async (contentId: any) => {
    if (!contentId) return
    const index = dialogues.value.findIndex(d => String(d.content_id) === String(contentId))
    if (index < 0) return
    currentDialogueIndex.value = index
    focusedContentId.value = Number(contentId)
    clearTimeout(focusPulseTimer)
    focusPulseTimer = setTimeout(() => { focusedContentId.value = null }, FOCUS_PULSE_MS)
    await nextTick()
    const el = document.querySelector(`.dialogue-editor-item[data-content-id="${contentId}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  watch(
    () => ctx.focusContentId(),
    (id) => {
      if (id && dialogues.value.length) focusDialogueByContentId(id)
    },
    { immediate: true },
  )

  const nextDialogue = () => {
    if (currentDialogueIndex.value <= dialogues.value.length - 1) {
      currentDialogueIndex.value++
      // 等新台词渲染后再取 audio，否则 play 的是上一条语音
      nextTick(() => {
        const audioElement: any = document.querySelector('.dialogue-box audio')
        if (audioElement) audioElement.play().catch((e: any) => console.log('自动播放失败:', e))
      })
    }
  }

  const restartDialogues = () => { currentDialogueIndex.value = 0 }

  // 组件卸载时清掉高亮定时器，避免回调打到已销毁的状态
  const cancelFocusPulse = () => { clearTimeout(focusPulseTimer) }

  const getCharacterAvatars = (characterId: any) => avatarsOfCharacter(characters.value, characterId)

  // 资源热重载：预览图统一走 assetSrc，给项目内静态资源加时间戳绕过浏览器缓存
  const assetNonce = ref(0)
  const assetSrc = (url: any) => buildAssetSrc(url, assetNonce.value)

  // 立绘差分层：返回 [基础图, ...叠加层]；按 order 从小到大
  const avatarLayersOf = (avatarId: any) => collectAvatarLayers(characters.value, avatarId, assetSrc)

  return {
    currentDialogue,
    richPreviewHtml,
    currentSpeakerName,
    currentDialogueHtml,
    selectDialogue,
    focusDialogueByContentId,
    nextDialogue,
    restartDialogues,
    cancelFocusPulse,
    getCharacterAvatars,
    avatarOptionLabel,
    assetNonce,
    assetSrc,
    avatarLayersOf,
  }
}
