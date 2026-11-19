import { computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Ref } from 'vue'

export type UndoTarget = 'stage' | 'dialogue' | 'none'

/** 取栈顶；空栈返回 null。 */
export const topOf = (stack: any[]) => (stack.length ? stack[stack.length - 1] : null)

/**
 * 统一撤销：台词栈与舞台栈按操作时间比较，撤销更近的一步。
 * 时间相同（或缺失）时优先舞台，保证舞台操作不被同刻的台词快照吞掉。
 */
export const pickUndoAction = (dialogueTop: any, stageTop: any): UndoTarget => {
  if (!dialogueTop && !stageTop) return 'none'
  const dialogueAt = dialogueTop ? Number(dialogueTop.at) || 0 : -1
  const stageAt = stageTop ? Number(stageTop.at) || 0 : -1
  return stageAt >= dialogueAt ? 'stage' : 'dialogue'
}

/** 切换台词时是否需要清空舞台撤销栈（首次装载 prev 为 undefined，不清）。 */
export const shouldResetStageUndo = (prev: any, next: any) =>
  prev !== undefined && String(prev) !== String(next)

export interface SceneStageSyncContext {
  currentDialogue: Ref<any>
  undoStack: Ref<any[]>
  stageUndoStack: Ref<any[]>
  undoDialogue: () => void
  undoStage: () => void
  reloadPreviewDirectives: (contentId: any) => Promise<any>
  restorePersistedStageUndo: (contentId: any) => void
  bumpAssetNonce: () => void
}

export function useSceneStageSync(ctx: SceneStageSyncContext) {
  const { currentDialogue, undoStack, stageUndoStack } = ctx

  const currentContentId = computed(() =>
    currentDialogue.value ? currentDialogue.value.content_id : null
  )

  const canUndoAny = computed(() =>
    undoStack.value.length > 0 || stageUndoStack.value.length > 0
  )

  const undoLast = () => {
    const target = pickUndoAction(topOf(undoStack.value), topOf(stageUndoStack.value))
    if (target === 'none') return
    if (target === 'stage') ctx.undoStage()
    else ctx.undoDialogue()
  }

  // 资源热重载：不改剧本，只给预览 URL 换时间戳并重新拉取指令
  const hotReloadAssets = () => {
    ctx.bumpAssetNonce()
    const id = currentContentId.value
    if (id) ctx.reloadPreviewDirectives(id)
    ElMessage.success('已重新加载预览素材')
  }

  // 演出弹窗增删了指令后，如果改的正是预览中的那条对话，立刻刷新预览
  const syncPreviewIfCurrent = (contentId: any) => {
    const id = currentContentId.value
    if (id && String(id) === String(contentId)) ctx.reloadPreviewDirectives(contentId)
  }

  watch(
    () => currentContentId.value,
    (id, prev) => {
      // 切换台词时清空舞台撤销栈，避免把上一条台词的快照撤销到当前台词
      if (shouldResetStageUndo(prev, id)) stageUndoStack.value = []
      ctx.reloadPreviewDirectives(id).then(() => {
        if (id) ctx.restorePersistedStageUndo(id)
      })
    },
    { immediate: true }
  )

  return { canUndoAny, undoLast, hotReloadAssets, syncPreviewIfCurrent }
}
