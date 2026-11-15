/**
 * 上一句回退：用内存环形快照记录每次推进前的播放位置与关键状态。
 *
 * 快照不落盘，刷新即失效；播放位置、变量、结局、历史等外部状态通过适配器
 * 注入，composable 只负责入栈 / 去重 / 截断 / 回退时的状态还原与演出重排。
 */
import { computed, nextTick, ref } from 'vue'

/** 环形缓冲上限：保留最近 30 个回退点 */
export const LINE_SNAPSHOT_LIMIT = 30

export interface LineSnapshot {
  /** 场景下标 */
  sceneIndex: number
  /** 场景内台词下标 */
  dialogueIndex: number
  /** 回退点的变量快照 */
  variables: Record<string, any>
  /** 回退点已触发的演出指令键 */
  lastEffectKey: string
  /** 回退点已解锁的结局 */
  endings: any[]
  /** 回退点对应的历史长度，回退时截断多余记录 */
  historyLength: number
}

export interface PlayerRewindContext {
  /** 当前台词；为空说明不在可回退的节点上 */
  getDialogue: () => any
  getSceneIndex: () => number
  setSceneIndex: (value: number) => void
  getDialogueIndex: () => number
  setDialogueIndex: (value: number) => void
  getVariables: () => Record<string, any>
  setVariables: (value: Record<string, any>) => void
  getLastEffectKey: () => string
  setLastEffectKey: (value: string) => void
  getEndings: () => Set<any>
  setEndings: (value: Set<any>) => void
  getHistory: () => any[]
  setHistory: (value: any[]) => void
  setIsWaiting: (value: boolean) => void
  setIsPlaying: (value: boolean) => void
  setShowDialogueBox: (value: boolean) => void
  /** 回退计入行为复盘埋点 */
  bumpBehaviorReview: () => void
  clearWait: () => void
  clearTyping: () => void
  /** 停掉自动推进定时器，避免回退后继续往前跑 */
  resetAutoTimer: () => void
  /** 回退后按新位置重演，但不触发「跳过已读」 */
  markSkipRestoredLine: () => void
  startTyping: () => void
  applyVolumes: () => void
}

export function usePlayerRewind(ctx: PlayerRewindContext) {
  const lineSnapshots = ref<LineSnapshot[]>([])
  const canRollback = computed(() => lineSnapshots.value.length > 0)

  const captureLineSnapshot = (): LineSnapshot | null => {
    if (!ctx.getDialogue()) return null
    return {
      sceneIndex: ctx.getSceneIndex(),
      dialogueIndex: ctx.getDialogueIndex(),
      variables: { ...ctx.getVariables() },
      lastEffectKey: ctx.getLastEffectKey(),
      endings: [...ctx.getEndings()],
      historyLength: ctx.getHistory().length,
    }
  }

  const pushLineSnapshot = (snap: LineSnapshot | null = null) => {
    const item = snap || captureLineSnapshot()
    if (!item) return
    const last = lineSnapshots.value[lineSnapshots.value.length - 1]
    if (last && last.sceneIndex === item.sceneIndex && last.dialogueIndex === item.dialogueIndex) {
      return
    }
    lineSnapshots.value = [...lineSnapshots.value, item].slice(-LINE_SNAPSHOT_LIMIT)
  }

  const clearLineSnapshots = () => {
    lineSnapshots.value = []
  }

  const rollbackOneLine = () => {
    const snap = lineSnapshots.value[lineSnapshots.value.length - 1]
    if (!snap) return
    lineSnapshots.value = lineSnapshots.value.slice(0, -1)
    ctx.bumpBehaviorReview()

    // 停掉正在进行的逐字、停顿与自动推进，避免回退后继续往前跑
    ctx.clearWait()
    ctx.clearTyping()
    ctx.resetAutoTimer()
    ctx.setIsWaiting(false)
    ctx.setIsPlaying(true)
    ctx.setShowDialogueBox(true)

    // 回退期间不记录埋点（已读记录本身按 content_id 去重）
    ctx.setSceneIndex(snap.sceneIndex)
    ctx.setDialogueIndex(snap.dialogueIndex)
    ctx.setVariables({ ...snap.variables })
    ctx.setLastEffectKey(snap.lastEffectKey)
    ctx.setEndings(new Set(snap.endings))
    ctx.setHistory(ctx.getHistory().slice(0, snap.historyLength))
    ctx.markSkipRestoredLine()

    nextTick(() => {
      ctx.startTyping()
      ctx.applyVolumes()
    })
  }

  return {
    lineSnapshots,
    canRollback,
    captureLineSnapshot,
    pushLineSnapshot,
    clearLineSnapshots,
    rollbackOneLine,
  }
}
