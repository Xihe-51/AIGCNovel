/**
 * 播放器预览派生状态：当前说话人、预览立绘分层、当前选项。
 *
 * 全部是只读派生，不持有播放流程状态、不发请求；
 * 立绘素材查询与条件判断通过注入获取，便于单独测试回溯与锁定规则。
 */
import { computed } from 'vue'

export interface PlayerPreviewContext {
  /** 当前场景的全部台词 */
  getDialogues: () => any[]
  /** 当前台词下标 */
  getCurrentIndex: () => number
  /** 当前台词对象 */
  getCurrentDialogue: () => any
  /** 当前章节的全部分支 */
  getBranches: () => any[]
  /** 按头像取差分层（基础图 + 叠加层） */
  avatarLayersOf: (avatarId: number) => string[]
  /** 按角色取默认立绘分层 */
  defaultAvatarLayersOf: (characterId: number) => string[]
  /** 变量条件求值 */
  evalCondition: (conditions: any) => boolean
}

// 旁白沿用本场景最近一位说话的角色，直到出现新角色
export const pickPreviewSpeaker = (
  list: any[] | null | undefined,
  index: number
): any | null => {
  const items = list || []
  for (let i = Math.min(Number(index) || 0, items.length - 1); i >= 0; i--) {
    const d = items[i]
    if (d && d.character_id) return d
  }
  return null
}

// 基础图 + 差分层：优先用当前头像的分层，缺失时回退到角色默认立绘
export const pickPreviewLayers = (
  speaker: any,
  avatarLayersOf: (avatarId: number) => string[],
  defaultAvatarLayersOf: (characterId: number) => string[]
): string[] => {
  if (!speaker) return []
  const byAvatar = avatarLayersOf(speaker.avatar_id) || []
  if (byAvatar.length) return byAvatar
  return defaultAvatarLayersOf(speaker.character_id) || []
}

// 当前「选择」节点的分支选项；条件未满足时保留按钮但标记为锁定
export const buildPreviewChoices = (
  dialogue: any,
  branches: any[] | null | undefined,
  evalCondition: (conditions: any) => boolean
): any[] => {
  if (!dialogue || dialogue.content_type !== '选择') return []
  return (branches || [])
    .filter(b => b && b.source_content_id === dialogue.content_id)
    .map(b => ({ ...b, locked: !evalCondition(b.conditions) }))
}

export function usePlayerPreview(ctx: PlayerPreviewContext) {
  const previewSpeaker = computed(() => (
    pickPreviewSpeaker(ctx.getDialogues(), ctx.getCurrentIndex())
  ))

  const previewAvatarLayers = computed(() => (
    pickPreviewLayers(previewSpeaker.value, ctx.avatarLayersOf, ctx.defaultAvatarLayersOf)
  ))

  const previewAvatarSrc = computed(() => previewAvatarLayers.value[0] || '')

  const currentChoices = computed(() => (
    buildPreviewChoices(ctx.getCurrentDialogue(), ctx.getBranches(), ctx.evalCondition)
  ))

  return {
    previewSpeaker,
    previewAvatarLayers,
    previewAvatarSrc,
    currentChoices,
  }
}
