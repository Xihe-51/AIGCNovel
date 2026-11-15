/**
 * 播放位置副作用：自动存档、演出指令重放与换场景换曲三处 watch 的统一装配。
 *
 * 三者都由「当前场景 / 当前台词」变化驱动，之前散落在视图里各写一份 watch 与一份
 * 防抖定时器，这里集中注册，并在组件卸载时清掉尚未触发的自动存档。
 */
import { nextTick, onUnmounted, watch } from 'vue'

/** 自动存档槽位（0 号为不需要玩家确认的兜底槽） */
const AUTO_SAVE_SLOT = 0
/** 位置变化后延迟写档，避免连续翻页时反复请求 */
const AUTO_SAVE_DELAY = 1500

export interface PlayerPositionEffectsContext {
  isLoading: () => boolean
  getError: () => unknown
  /** 读档还原中，期间的位移动不作数 */
  isRestoring: () => boolean
  getSceneIndex: () => number
  getDialogueIndex: () => number
  saveToSlot: (slot: number, silent?: boolean) => Promise<unknown> | unknown
  getCurrentDialogue: () => any
  getCurrentScene: () => any
  getDirectivesByContent: () => any
  getIsPlaying: () => boolean
  resetStage: () => void
  applyDirectives: (dialogue: any) => void
  playBackgroundMusic: () => void
}

export function usePlayerPositionEffects(ctx: PlayerPositionEffectsContext) {
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

  const clearAutoSave = () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
  }

  // 每次推进对话后延迟写入 slot 0（不打扰玩家）
  watch([() => ctx.getSceneIndex(), () => ctx.getDialogueIndex()], () => {
    if (ctx.isRestoring() || ctx.isLoading() || ctx.getError()) return
    clearAutoSave()
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null
      ctx.saveToSlot(AUTO_SAVE_SLOT, true)
    }, AUTO_SAVE_DELAY)
  })

  // 应用到新对话时，若还在加载或指令尚未拉回，等完成后自动重试
  watch(
    () => [
      ctx.isLoading(),
      ctx.getError(),
      ctx.getCurrentDialogue()?.content_id,
      ctx.getDirectivesByContent(),
    ],
    () => {
      if (ctx.isLoading() || ctx.getError()) return
      ctx.resetStage()
      ctx.applyDirectives(ctx.getCurrentDialogue())
    },
    { immediate: true }
  )

  // 监听场景变化，更新背景音乐（同一场景内推进不重播）
  watch(
    () => ctx.getCurrentScene(),
    (newScene, oldScene) => {
      if (newScene?.scene_id !== oldScene?.scene_id && ctx.getIsPlaying()) {
        nextTick(() => ctx.playBackgroundMusic())
      }
    }
  )

  onUnmounted(clearAutoSave)

  return { clearAutoSave }
}
