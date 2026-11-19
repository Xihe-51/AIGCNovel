/**
 * 舞台撤销栈的纯逻辑：快照行提取、指纹计算、持久化键与可恢复性判定。
 *
 * 之所以做成纯函数：撤销栈的正确性依赖「指纹一致才恢复」这条规则，
 * 它是这套机制里唯一容易写错又难在界面上察觉的部分，必须能被单测钉死。
 */

import type { DirectiveType } from '@/api/directive'

export interface StageUndoRow {
  directive_id: number
  directive_type: DirectiveType
  order_num?: number
  payload: Record<string, unknown>
}

export interface StageUndoEntry {
  contentId: number
  rows: StageUndoRow[]
  baseline: string
  after?: string
  at: number
}

/** 撤销栈只保留最近 20 步，超出丢弃最旧的一步 */
export const STAGE_UNDO_LIMIT = 20

export const stageUndoStorageKey = (projectId: string | number, contentId: string | number) =>
  `aigc:stageUndo:${projectId}:${contentId}`

/** 只取参与比较的四个字段：其余字段变化（如本地 UI 标记）不应让快照失效 */
export const directivesFingerprint = (rows: any[]): string => {
  const parts = (rows || []).map(r => [r.directive_id, r.directive_type, r.order_num, r.payload])
  parts.sort()
  return JSON.stringify(parts)
}

/** 深拷贝一层 payload，避免撤销时改到预览模型里的同一份对象 */
export const snapshotDirectiveRows = (rows: any[]): StageUndoRow[] => (rows || []).map(d => ({
  directive_id: d.directive_id,
  directive_type: d.directive_type,
  order_num: d.order_num,
  payload: { ...(d.payload || {}) }
}))

export const createStageUndoEntry = (
  contentId: number,
  rows: any[],
  afterRows?: any[] | null
): StageUndoEntry => {
  const snapshot = snapshotDirectiveRows(rows)
  const entry: StageUndoEntry = {
    contentId,
    rows: snapshot,
    baseline: directivesFingerprint(snapshot),
    at: Date.now()
  }
  if (afterRows) entry.after = directivesFingerprint(afterRows)
  return entry
}

/**
 * 判断持久化快照能否恢复。
 *
 * 服务端当前应处于「操作后」状态；若仍是「操作前」说明操作没生效，也无撤销的必要。
 * 两种情况都不满足，则说明服务端在此期间被别的入口改过，快照失效。
 */
export const isStageUndoRestorable = (saved: any, currentFingerprint: string): boolean => {
  if (!saved || !Array.isArray(saved.rows)) return false
  const { baseline, after } = saved
  return Boolean((after && currentFingerprint === after) || (!after && currentFingerprint === baseline))
}
