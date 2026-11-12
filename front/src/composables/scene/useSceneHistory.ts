/**
 * 场景编辑器的撤销 / 重做 / 未保存草稿。
 *
 * 只管"历史栈 + 草稿"，台词数组与当前下标通过适配器读写，
 * 这样快照应用后的清多选、重载预览指令仍由页面决定，不反向依赖编辑器。
 */
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'

/** 撤销栈上限，超出后丢最早的快照 */
const MAX_HISTORY = 50

export interface SceneHistoryContext {
  sceneId: () => number | string
  getDialogues: () => any[]
  setDialogues: (list: any[]) => void
  getCurrentIndex: () => number
  setCurrentIndex: (index: number) => void
  /** 快照应用后清空多选 */
  clearSelection: () => void
  /** 快照应用后的下一帧重载预览指令 */
  reloadDirectives: () => void
}

export function useSceneHistory(ctx: SceneHistoryContext) {
  const undoStack = ref<any[]>([])
  const redoStack = ref<any[]>([])
  const dirty = ref(false)

  let draftTimer: ReturnType<typeof setTimeout> | null = null
  let historyTimer: ReturnType<typeof setTimeout> | null = null
  let pendingBaseSnapshot: any[] | null = null

  const draftKey = computed(() => `scene-draft:${ctx.sceneId()}`)

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  const cloneDialogues = () => JSON.parse(JSON.stringify(ctx.getDialogues() || []))

  const pushHistory = (snapshot?: any[]) => {
    const snap = snapshot || cloneDialogues()
    const str = JSON.stringify(snap)
    const top = undoStack.value[undoStack.value.length - 1]
    if (top && JSON.stringify(top.snapshot) === str) return
    undoStack.value.push({ at: Date.now(), snapshot: snap })
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    redoStack.value = []
  }

  const applySnapshot = (snap: any[]) => {
    ctx.setDialogues(JSON.parse(JSON.stringify(snap)))
    ctx.clearSelection()
    if (ctx.getCurrentIndex() >= ctx.getDialogues().length) {
      ctx.setCurrentIndex(Math.max(0, ctx.getDialogues().length - 1))
    }
    markDirty()
    nextTick(() => ctx.reloadDirectives())
  }

  const undo = () => {
    if (!undoStack.value.length) return
    redoStack.value.push({ at: Date.now(), snapshot: cloneDialogues() })
    applySnapshot(undoStack.value.pop().snapshot)
  }

  /** 服务端已发生不可逆变更时清空历史，避免本地撤销产生"幽灵节点" */
  const clearHistory = () => {
    undoStack.value = []
    redoStack.value = []
  }

  const redo = () => {
    if (!redoStack.value.length) return
    undoStack.value.push({ at: Date.now(), snapshot: cloneDialogues() })
    applySnapshot(redoStack.value.pop().snapshot)
  }

  const saveDraftNow = () => {
    if (!dirty.value) return
    try {
      localStorage.setItem(draftKey.value, JSON.stringify({
        at: Date.now(),
        dialogues: ctx.getDialogues()
      }))
    } catch (e) {
      console.warn('草稿保存失败:', e)
    }
  }

  const markDirty = () => {
    dirty.value = true
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(saveDraftNow, 1000)
  }

  const clearDraft = () => {
    dirty.value = false
    if (draftTimer) {
      clearTimeout(draftTimer)
      draftTimer = null
    }
    try { localStorage.removeItem(draftKey.value) } catch (e) { /* ignore */ }
  }

  // 文本输入：聚焦时记下基线，停顿 800ms 后落一次历史
  const beginTextEdit = () => {
    if (!pendingBaseSnapshot) pendingBaseSnapshot = cloneDialogues()
  }

  const queueTextHistory = () => {
    markDirty()
    if (historyTimer) clearTimeout(historyTimer)
    historyTimer = setTimeout(() => {
      if (pendingBaseSnapshot) {
        pushHistory(pendingBaseSnapshot)
        pendingBaseSnapshot = cloneDialogues()
      }
    }, 800)
  }

  const flushTextHistory = () => {
    if (historyTimer) {
      clearTimeout(historyTimer)
      historyTimer = null
    }
    if (pendingBaseSnapshot) {
      pushHistory(pendingBaseSnapshot)
      pendingBaseSnapshot = null
    }
  }

  const maybeRestoreDraft = async () => {
    let raw: string | null = null
    try { raw = localStorage.getItem(draftKey.value) } catch (e) { /* ignore */ }
    if (!raw) return
    try {
      const draft = JSON.parse(raw)
      if (!draft || !Array.isArray(draft.dialogues)) return
      if (JSON.stringify(draft.dialogues) === JSON.stringify(ctx.getDialogues())) {
        localStorage.removeItem(draftKey.value)
        return
      }
      await ElMessageBox.confirm(
        `发现 ${new Date(draft.at).toLocaleString()} 的未保存草稿，是否恢复？`,
        '恢复草稿',
        { confirmButtonText: '恢复', cancelButtonText: '丢弃', type: 'info' }
      )
      ctx.setDialogues(draft.dialogues)
      dirty.value = true
    } catch (e: any) {
      if (e === 'cancel' || e === 'close') {
        try { localStorage.removeItem(draftKey.value) } catch (err) { /* ignore */ }
      }
    }
  }

  onUnmounted(() => {
    if (draftTimer) clearTimeout(draftTimer)
    if (historyTimer) clearTimeout(historyTimer)
  })

  return {
    undoStack,
    redoStack,
    dirty,
    canUndo,
    canRedo,
    cloneDialogues,
    pushHistory,
    applySnapshot,
    undo,
    clearHistory,
    redo,
    saveDraftNow,
    markDirty,
    clearDraft,
    beginTextEdit,
    queueTextHistory,
    flushTextHistory,
    maybeRestoreDraft,
  }
}
