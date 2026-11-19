/**
 * 播放器已读记录：跳过已读、二周目进度、云端与本地合并。
 *
 * 播放进度通过 getCurrentDialogue / hasChoices / skipReadEnabled 适配器注入，
 * composable 只负责已读集合与落盘去抖，不直接操作播放位置。
 */
import { ref } from 'vue'
import { listReads, markReads } from '@/api/read'

/** 已读合并写入的防抖时长 */
export const READ_FLUSH_DELAY = 1500
/** 连续跳过已读的上限，避免异常数据导致死循环 */
export const SKIP_GUARD_LIMIT = 500

export interface PlayerReadsContext {
  projectId: () => number
  /** 当前停留的节点（用于记录已读与判定跳过） */
  getCurrentDialogue: () => any
  /** 当前节点是否有选项：有选项时不自动跳过 */
  hasChoices: () => boolean
  /** 阅读设置里的「跳过已读」开关 */
  skipReadEnabled: () => boolean
}

export function usePlayerReads(ctx: PlayerReadsContext) {
  const readSet = ref<Set<number>>(new Set())
  const pendingReads = new Set<number>()
  let readFlushTimer: ReturnType<typeof setTimeout> | null = null
  let skipGuard = 0
  let skipRestoredLine = false

  const readStorageKey = () => `aigc:reads:${ctx.projectId()}`

  const readLocal = (): number[] => {
    try {
      const raw = JSON.parse(localStorage.getItem(readStorageKey()) || '[]')
      return Array.isArray(raw) ? raw : []
    } catch (e) {
      return []
    }
  }

  const writeLocal = (ids: number[]) => {
    try {
      const cur = new Set(readLocal())
      ids.forEach(i => cur.add(i))
      localStorage.setItem(readStorageKey(), JSON.stringify([...cur]))
    } catch (_) { /* ignore */ }
  }

  const loadReads = async () => {
    const local = readLocal()
    let cloud: number[] = []
    try {
      cloud = await listReads(ctx.projectId())
    } catch (e) {
      console.warn('读取云端已读记录失败，使用本地记录:', e)
    }
    readSet.value = new Set([...(cloud || []), ...local])
  }

  const flushReads = async () => {
    const ids = [...pendingReads]
    pendingReads.clear()
    if (!ids.length) return
    try {
      await markReads(ctx.projectId(), ids)
    } catch (e) {
      // 云端失败写本地，下次启动再合并
      writeLocal(ids)
    }
  }

  const scheduleFlush = () => {
    if (readFlushTimer) clearTimeout(readFlushTimer)
    readFlushTimer = setTimeout(() => {
      readFlushTimer = null
      flushReads()
    }, READ_FLUSH_DELAY)
  }

  const hasRead = (contentId: any) => readSet.value.has(Number(contentId))

  const markCurrentRead = () => {
    const id = ctx.getCurrentDialogue()?.content_id
    if (!id || hasRead(id)) return
    const num = Number(id)
    readSet.value.add(num)
    pendingReads.add(num)
    scheduleFlush()
  }

  const shouldSkipCurrent = (forceShow = false) => {
    if (forceShow) return false
    if (!ctx.skipReadEnabled()) return false
    const d = ctx.getCurrentDialogue()
    if (!d?.content_id || ctx.hasChoices()) return false
    return hasRead(d.content_id)
  }

  /** 记录一次连续跳过；超过上限后返回 false 并复位，强制展示当前句 */
  const allowSkip = () => {
    skipGuard += 1
    if (skipGuard <= SKIP_GUARD_LIMIT) return true
    skipGuard = 0
    return false
  }

  const resetSkipGuard = () => { skipGuard = 0 }

  /** 回退 / 演出热更新后停在上一句时，不立刻触发「跳过已读」 */
  const markSkipRestoredLine = () => { skipRestoredLine = true }

  const consumeSkipRestoredLine = () => {
    const value = skipRestoredLine
    skipRestoredLine = false
    return value
  }

  /** 卸载时清理去抖定时器并把待写入记录补发 */
  const disposeReads = () => {
    if (!readFlushTimer) return
    clearTimeout(readFlushTimer)
    readFlushTimer = null
    flushReads()
  }

  return {
    readSet,
    readStorageKey,
    loadReads,
    flushReads,
    hasRead,
    markCurrentRead,
    shouldSkipCurrent,
    allowSkip,
    resetSkipGuard,
    markSkipRestoredLine,
    consumeSkipRestoredLine,
    disposeReads,
  }
}
