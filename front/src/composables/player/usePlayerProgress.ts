/**
 * 播放器进度存档：本地兜底存档、云端存档槽位编排与退出游戏。
 *
 * 播放进度、变量、回退快照等状态通过适配器注入，composable 只负责存档领域逻辑，
 * 不直接持有剧情数据，也不直接操作路由。
 */
import { nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { confirmAction } from '@/utils/confirm'
import { useSaveSlots } from '@/composables/player/useSaveSlots'

export interface PlayerProgressContext {
  projectId: () => number
  getSceneIndex: () => number
  setSceneIndex: (value: number) => void
  getDialogueIndex: () => number
  setDialogueIndex: (value: number) => void
  getHistory: () => any[]
  setHistory: (value: any[]) => void
  getVariables: () => Record<string, any>
  setVariables: (value: Record<string, any>) => void
  getLastEffectKey: () => string
  setLastEffectKey: (value: string) => void
  getEndings: () => Set<any>
  setEndings: (value: Set<any>) => void
  getPlaythrough: () => number
  setPlaythrough: (value: number) => void
  playthroughKey: () => string
  getScene: () => any
  getDialogue: () => any
  getCoverUrl: () => string
  sceneTitleOf: (scene: any) => string
  textOf: (dialogue: any) => string
  initVariableValues: () => void
  clearLineSnapshots: () => void
  syncProjectMeta: (immediate?: boolean) => void
  startTyping: () => void
  applyVolumes: () => void
  stopBackgroundMusic: () => void
  exitToHome: () => void
  t: (key: string, params?: Record<string, any>) => string
}

export function usePlayerProgress(ctx: PlayerProgressContext) {
  const progressKey = () => `gameProgress_${ctx.projectId()}`

  const saveProgress = (silent = false) => {
    try {
      const progressData = {
        projectId: ctx.projectId(),
        currentSceneIndex: ctx.getSceneIndex(),
        currentDialogueIndex: ctx.getDialogueIndex(),
        historyDialogues: ctx.getHistory(),
        playthrough: ctx.getPlaythrough(),
        variables: ctx.getVariables(),
        lastEffectKey: ctx.getLastEffectKey(),
        triggeredEndings: [...ctx.getEndings()],
        saveTime: new Date().toISOString(),
      }
      localStorage.setItem(progressKey(), JSON.stringify(progressData))
      if (!silent) ElMessage.success(ctx.t('save.saved'))
    } catch (error) {
      console.error('保存进度失败:', error)
      if (!silent) ElMessage.error(ctx.t('save.saveFailed'))
    }
  }

  const currentSaveSummary = () => {
    const title = ctx.sceneTitleOf(ctx.getScene()) || ctx.t('save.unnamedScene')
    const text = String(ctx.textOf(ctx.getDialogue()) || '').replace(/\s+/g, ' ').slice(0, 24)
    return text ? `${title} · ${text}` : title
  }

  const buildSaveState = () => {
    const scene = ctx.getScene() || {}
    return {
      sceneIndex: ctx.getSceneIndex(),
      dialogueIndex: ctx.getDialogueIndex(),
      historyDialogues: ctx.getHistory(),
      variables: ctx.getVariables(),
      lastEffectKey: ctx.getLastEffectKey(),
      triggeredEndings: [...ctx.getEndings()],
      playthrough: ctx.getPlaythrough(),
      scene_id: scene.scene_id || null,
      scene_title: scene.title || '',
      thumbnail_url: scene.background_url || ctx.getCoverUrl() || '',
      savedAt: new Date().toISOString(),
    }
  }

  const applySaveState = async (state: Record<string, any>) => {
    ctx.setSceneIndex(Number(state.sceneIndex) || 0)
    ctx.setDialogueIndex(Number(state.dialogueIndex) || 0)
    ctx.setHistory(state.historyDialogues || [])
    ctx.setVariables(state.variables || {})
    ctx.setLastEffectKey(state.lastEffectKey || '')
    ctx.setEndings(new Set(state.triggeredEndings || []))
    if (state.playthrough) {
      ctx.setPlaythrough(Number(state.playthrough) || ctx.getPlaythrough())
      try {
        localStorage.setItem(ctx.playthroughKey(), String(ctx.getPlaythrough()))
      } catch (_) { /* ignore */ }
    }
    ctx.initVariableValues()
    ctx.clearLineSnapshots()
    ctx.syncProjectMeta(true)
    await nextTick()
    ctx.startTyping()
    ctx.applyVolumes()
    // 读档后同步本地进度，避免刷新时回到读档前的旧位置
    saveProgress(true)
  }

  const {
    saves,
    saveDialogVisible,
    isRestoring,
    openSaveDialog,
    saveToSlot,
    loadFromSlot,
    deleteSlot,
  } = useSaveSlots({
    projectId: () => Number(ctx.projectId()),
    capture: () => ({ state: buildSaveState(), summary: currentSaveSummary() }),
    apply: applySaveState,
    onCloudSaveFailed: () => saveProgress(true),
    onCloudLoadFailed: () => loadProgress(),
    t: ctx.t,
  })

  const loadProgress = () => {
    try {
      const stored = localStorage.getItem(progressKey())
      if (!stored) return
      const {
        currentSceneIndex: sceneIdx,
        currentDialogueIndex: dialogueIdx,
        historyDialogues: savedHistory,
        playthrough: savedPlaythrough,
        variables: savedVariables,
        lastEffectKey: savedEffectKey,
        triggeredEndings: savedEndings,
      } = JSON.parse(stored)
      ctx.setSceneIndex(sceneIdx)
      ctx.setDialogueIndex(dialogueIdx)
      ctx.setHistory(savedHistory || [])
      if (savedPlaythrough) ctx.setPlaythrough(Number(savedPlaythrough) || ctx.getPlaythrough())
      if (savedVariables && typeof savedVariables === 'object') {
        ctx.setVariables({ ...savedVariables })
        ctx.clearLineSnapshots()
        ctx.syncProjectMeta(true)
      }
      ctx.setLastEffectKey(savedEffectKey || '')
      if (Array.isArray(savedEndings)) ctx.setEndings(new Set(savedEndings))
      ElMessage.success(ctx.t('toast.progressLoaded'))
    } catch (error) {
      console.error('加载进度失败:', error)
    }
  }

  const exitGame = async () => {
    const confirmed = await confirmAction(ctx.t('toast.exitConfirm'), {
      title: ctx.t('toast.exitTitle'),
      confirmButtonText: ctx.t('toast.exitBtn'),
      cancelButtonText: ctx.t('common.cancel'),
    })
    if (!confirmed) {
      ElMessage.info(ctx.t('toast.exitCancelled'))
      return
    }
    ctx.stopBackgroundMusic()
    ctx.exitToHome()
  }

  return {
    saves,
    saveDialogVisible,
    isRestoring,
    saveProgress,
    loadProgress,
    exitGame,
    openSaveDialog,
    saveToSlot,
    loadFromSlot,
    deleteSlot,
  }
}
