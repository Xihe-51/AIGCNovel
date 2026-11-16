/**
 * 舞台撤销栈：每次写操作前对「当前台词的全部指令」做快照入栈。
 *
 * 栈顶一步会持久化到 localStorage，刷新后若服务端指令未变仍可撤销；
 * 恢复前用指纹校验，服务端被别的入口改过则丢弃快照。
 *
 * 演出弹窗的增删改写的是同一批指令，所以它也通过 recordStageUndo 纳入同一栈，
 * 从而保证「撤销」始终只有一个线性顺序。
 */
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createDirective,
  deleteDirective,
  listNodeDirectives,
  updateDirective,
} from '@/api/directive'
import {
  STAGE_UNDO_LIMIT,
  createStageUndoEntry,
  directivesFingerprint,
  isStageUndoRestorable,
  stageUndoStorageKey,
} from './stageUndoStore'
import type { StageUndoEntry } from './stageUndoStore'

export interface StageUndoContext {
  projectId: Ref<string | number>
  currentDialogue: ComputedRef<any>
  previewDirectives: Ref<any[]>
  loadPreviewDirectives: (contentId: number | string | null | undefined) => Promise<void>
  refreshDirectiveList: () => Promise<void>
  /** 新的舞台操作让台词重做失效，保持统一撤销的线性语义 */
  clearRedo: () => void
}

export function useStageUndo(ctx: StageUndoContext) {
  const stageUndoStack = ref<StageUndoEntry[]>([])
  const canUndoAvatar = computed(() => stageUndoStack.value.length > 0)

  const storageKey = (contentId: number | string) =>
    stageUndoStorageKey(ctx.projectId.value, contentId)

  const topEntry = () => stageUndoStack.value[stageUndoStack.value.length - 1]

  /** 只持久化栈顶：刷新后恢复一步，避免旧快照覆盖服务端新改动 */
  const persistStageUndo = () => {
    const top = topEntry()
    if (!top || !top.contentId) return
    try {
      localStorage.setItem(storageKey(top.contentId), JSON.stringify(top))
    } catch (e) {
      console.warn('持久化撤销栈失败:', e)
    }
  }

  const clearPersistedStageUndo = (contentId: number | string | null | undefined) => {
    if (!contentId) return
    try { localStorage.removeItem(storageKey(contentId)) } catch (e) { /* ignore */ }
  }

  /** 写操作成功后调用：记录「操作后」指纹，刷新后据此判断快照是否仍然有效 */
  const markStageUndoApplied = () => {
    const top = topEntry()
    if (!top) return
    top.after = directivesFingerprint(ctx.previewDirectives.value)
    persistStageUndo()
  }

  /** 写操作失败回滚：把刚入栈的快照弹掉 */
  const dropStageUndo = () => {
    stageUndoStack.value.pop()
  }

  const pushStageUndo = (entry: StageUndoEntry) => {
    stageUndoStack.value.push(entry)
    if (stageUndoStack.value.length > STAGE_UNDO_LIMIT) stageUndoStack.value.shift()
    ctx.clearRedo()
    persistStageUndo()
  }

  const snapshotStageDirectives = (contentId?: number | string | null) => {
    const cid = Number(contentId || ctx.currentDialogue.value?.content_id || 0)
    pushStageUndo(createStageUndoEntry(cid, ctx.previewDirectives.value))
  }

  /** 外部弹窗直接读写指令时，用 before/after 两份快照把它也纳入同一撤销栈 */
  const recordStageUndo = (
    contentId: number | string | null,
    rows: any[],
    afterRows: any[] | null
  ) => {
    pushStageUndo(createStageUndoEntry(Number(contentId || 0), rows, afterRows))
  }

  /** 刷新/切台词后：校验服务端指令指纹与快照基线一致才恢复，否则丢弃 */
  const restorePersistedStageUndo = (contentId: number | string | null | undefined) => {
    if (!contentId) return
    try {
      const raw = localStorage.getItem(storageKey(contentId))
      if (!raw) return
      const saved = JSON.parse(raw)
      if (!isStageUndoRestorable(saved, directivesFingerprint(ctx.previewDirectives.value))) {
        clearPersistedStageUndo(contentId)
        return
      }
      // 同一 contentId 只保留一条持久化快照，避免重复
      stageUndoStack.value = stageUndoStack.value.filter(
        e => String(e.contentId) !== String(contentId)
      )
      stageUndoStack.value.push({
        contentId: Number(contentId),
        rows: saved.rows,
        baseline: saved.baseline,
        after: saved.after,
        at: saved.at || Date.now()
      })
    } catch (e) {
      console.warn('恢复撤销栈失败:', e)
    }
  }

  const undoAvatar = async () => {
    const entry = stageUndoStack.value.pop()
    if (!entry) return
    const pid = Number(ctx.projectId.value)
    const contentId = Number(entry.contentId || ctx.currentDialogue.value?.content_id || 0)
    if (!pid || !contentId) return
    const snapshot = entry.rows
    try {
      const current = await listNodeDirectives(pid, contentId)
      // 删除当前多出来的，再按快照逐条恢复 payload/order_num/type
      const snapshotIds = new Set(snapshot.map(r => r.directive_id))
      for (const d of current) {
        if (!snapshotIds.has(d.directive_id)) await deleteDirective(pid, d.directive_id)
      }
      for (const row of snapshot) {
        const live = current.find(d => d.directive_id === row.directive_id)
        if (live) {
          await updateDirective(pid, row.directive_id, {
            payload: row.payload,
            order_num: row.order_num,
            directive_type: row.directive_type
          })
        } else {
          await createDirective(pid, {
            content_id: contentId,
            directive_type: row.directive_type,
            payload: row.payload
          })
        }
      }
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      // 撤销后栈顶变化：同步持久化（空栈则清除）
      if (topEntry()) persistStageUndo()
      else clearPersistedStageUndo(contentId)
      ElMessage.success('已撤销上一步')
    } catch (e: any) {
      console.error('撤销失败:', e)
      ElMessage.error('撤销失败: ' + (e.message || '未知错误'))
    }
  }

  return {
    stageUndoStack,
    canUndoAvatar,
    recordStageUndo,
    snapshotStageDirectives,
    markStageUndoApplied,
    dropStageUndo,
    clearPersistedStageUndo,
    restorePersistedStageUndo,
    undoAvatar,
  }
}
