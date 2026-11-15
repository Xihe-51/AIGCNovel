/**
 * 开局与重开：把播放状态归位到「从头开始」并重新播放。
 *
 * 四个入口的差别只在「重置哪些东西」：
 * - startPreview：不重置，仅修正起点（起始场景/台词被剧情锁挡住时向后找可播放的）
 * - resetGame：完整重置（结局、成就、变量、埋点、快照）
 * - startNextPlaythrough：保留跨周目变量，只清本轮进度并推进周目号
 * - restartGame：玩家主动重开，二次确认后重置变量并从第一章开始
 *
 * 起点推演被抽成纯函数，便于脱离播放器状态直接验证「跳到哪个场景/哪句台词」。
 */
import { nextTick, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

export interface StartPosition {
  sceneIndex: number
  dialogueIndex: number
}

export interface ResolveStartPositionParams {
  scenes: any[]
  dialogues: Record<string | number, any[]>
  sceneIndex: number
  dialogueIndex: number
  scenePlayable: (sceneId: any) => boolean
  sceneHasPlayableDialogues: (sceneId: any) => boolean
  nodePlayable: (node: any) => boolean
  firstPlayableNodeIndex: (sceneId: any, from: number) => number
}

export const resolveStartPosition = (params: ResolveStartPositionParams): StartPosition => {
  const {
    scenes, dialogues, scenePlayable, sceneHasPlayableDialogues,
    nodePlayable, firstPlayableNodeIndex,
  } = params
  let sceneIndex = params.sceneIndex
  let dialogueIndex = params.dialogueIndex

  if (scenes[sceneIndex] && (
    !scenePlayable(scenes[sceneIndex].scene_id) ||
    !sceneHasPlayableDialogues(scenes[sceneIndex].scene_id)
  )) {
    let idx = sceneIndex
    while (idx < scenes.length && (
      !scenePlayable(scenes[idx].scene_id) ||
      !sceneHasPlayableDialogues(scenes[idx].scene_id)
    )) idx++
    if (idx < scenes.length) {
      sceneIndex = idx
      dialogueIndex = 0
    }
  }

  const sceneId = scenes[sceneIndex]?.scene_id
  const list = dialogues[sceneId] || []
  if (list.length && !nodePlayable(list[dialogueIndex])) {
    let di = firstPlayableNodeIndex(sceneId, dialogueIndex)
    if (di >= list.length) di = firstPlayableNodeIndex(sceneId, 0)
    if (di < list.length) dialogueIndex = di
  }

  return { sceneIndex, dialogueIndex }
}

export interface PlayerPlaySessionContext {
  scenes: Ref<any[]>
  allDialogues: Ref<Record<string | number, any[]>>
  sceneIndex: Ref<number>
  dialogueIndex: Ref<number>
  history: Ref<any[]>
  isPlaying: Ref<boolean>
  playthrough: Ref<number>
  playthroughKey: () => string

  scenePlayable: (sceneId: any) => boolean
  sceneHasPlayableDialogues: (sceneId: any) => boolean
  nodePlayable: (node: any) => boolean
  firstPlayableNodeIndex: (sceneId: any, from: number) => number

  playBackgroundMusic: () => void
  stopBackgroundMusic: () => void
  clearAutoTimer: () => void
  startTyping: () => void

  resetEndings: () => void
  resetAchievementState: () => void
  resetVariables: () => void
  resetTelemetryTracking: () => void
  clearLineSnapshots: () => void
  clearVariableNotices: () => void
  syncProjectMeta: (immediate?: boolean) => void
  setLastEffectKey: (value: string) => void

  t: (key: string, params?: Record<string, any>) => string
}

export function usePlayerPlaySession(ctx: PlayerPlaySessionContext) {
  const settleStartPosition = () => {
    const position = resolveStartPosition({
      scenes: ctx.scenes.value,
      dialogues: ctx.allDialogues.value,
      sceneIndex: ctx.sceneIndex.value,
      dialogueIndex: ctx.dialogueIndex.value,
      scenePlayable: (sceneId) => ctx.scenePlayable(sceneId),
      sceneHasPlayableDialogues: (sceneId) => ctx.sceneHasPlayableDialogues(sceneId),
      nodePlayable: (node) => ctx.nodePlayable(node),
      firstPlayableNodeIndex: (sceneId, from) => ctx.firstPlayableNodeIndex(sceneId, from),
    })
    ctx.sceneIndex.value = position.sceneIndex
    ctx.dialogueIndex.value = position.dialogueIndex
  }

  const rewindToStart = () => {
    ctx.sceneIndex.value = 0
    ctx.dialogueIndex.value = 0
    ctx.history.value = []
  }

  const startPreview = () => {
    settleStartPosition()
    ctx.isPlaying.value = true
    ctx.playBackgroundMusic()
    ctx.startTyping()
  }

  const resetGame = () => {
    ctx.stopBackgroundMusic()
    rewindToStart()
    ctx.resetEndings()
    ctx.resetAchievementState()
    ctx.resetVariables()
    ctx.clearLineSnapshots()
    ctx.resetTelemetryTracking()
    nextTick(() => startPreview())
  }

  const startNextPlaythrough = () => {
    ctx.stopBackgroundMusic()
    ctx.clearAutoTimer()
    ctx.resetEndings()
    rewindToStart()
    ctx.resetAchievementState()
    ctx.clearVariableNotices()
    ctx.setLastEffectKey('')
    ctx.clearLineSnapshots()
    ctx.resetTelemetryTracking()
    // 进入下一周目前，把本周目结束时的跨周目变量写回服务端
    ctx.syncProjectMeta(true)
    ctx.playthrough.value += 1
    try {
      localStorage.setItem(ctx.playthroughKey(), String(ctx.playthrough.value))
    } catch (_) { /* ignore */ }
    nextTick(() => startPreview())
    ElMessage.success(ctx.t('toast.nextPlaythrough', { n: ctx.playthrough.value }))
  }

  const restartGame = () => {
    ElMessageBox.confirm(
      ctx.t('toast.restartConfirm'),
      ctx.t('toast.restartTitle'),
      {
        confirmButtonText: ctx.t('common.confirm'),
        cancelButtonText: ctx.t('common.cancel'),
        type: 'info',
      }
    )
      .then(() => {
        ctx.stopBackgroundMusic()
        rewindToStart()
        ctx.resetVariables()
        ctx.clearLineSnapshots()
        // 新一轮从头开始，重新允许记录本轮埋点
        ctx.resetTelemetryTracking()
        nextTick(() => startPreview())
        ElMessage.success(ctx.t('toast.restarted'))
      })
      .catch(() => {
        // 用户取消重新开始
      })
  }

  return { startPreview, resetGame, startNextPlaythrough, restartGame }
}
