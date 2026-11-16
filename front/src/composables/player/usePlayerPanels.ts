/**
 * 播放器面板域（存档槽位 / 章节跳转 / 鉴赏收藏 / 更新日志 / 演出编辑 / 输入接入）。
 *
 * 这一域的状态全部由 usePlayerController 暴露的状态驱动，因此统一在编排层之后创建；
 * 创建完成后立刻把 7 个入口回填到 controller 的 playerPanelPort，供开局装载
 * （loadProgress / loadChapterData / loadPublicReleases / setPerformMode）与
 * 位置副作用（isRestoring / saveToSlot）回调使用。所有实际调用都发生在挂载后，
 * 端口哨兵不会触发。
 */
import { saveDialogues } from '@/api/dialogue'
import { updateScene } from '@/api/scenes'
import { usePlayerChangelog } from '@/composables/player/usePlayerChangelog'
import { usePlayerChapters } from '@/composables/player/usePlayerChapters'
import { usePlayerCollections } from '@/composables/player/usePlayerCollections'
import { usePlayerInput } from '@/composables/player/usePlayerInput'
import { usePlayerPerform } from '@/composables/player/usePlayerPerform'
import { usePlayerProgress } from '@/composables/player/usePlayerProgress'
import type { PlayerCore } from '@/composables/player/usePlayerController'

export function usePlayerPanels(core: PlayerCore) {
  // ==================== 更新日志 / 公开版本 ====================
  const {
    changelogVisible,
    publicReleases,
    loadPublicReleases,
  } = usePlayerChangelog({
    projectId: () => core.resolveProjectId(),
  })

  // ==================== 章节快捷跳转 / 路线图鉴 ====================
  const {
    chaptersVisible,
    chapterRoute,
    routeStats,
    loadChapterData,
    jumpToChapter,
  } = usePlayerChapters({
    projectId: () => core.resolveProjectId(),
    getScenes: () => core.scenes.value,
    getAllDialogues: () => core.allDialogues.value,
    getEndings: () => core.endings.value,
    hasRead: (contentId) => core.hasRead(contentId),
    scenePlayable: (sceneId) => core.scenePlayable(sceneId),
    firstPlayableNodeIndex: (sceneId) => core.firstPlayableNodeIndex(sceneId),
    setSceneIndex: (value) => { core.currentSceneIndex.value = value },
    setDialogueIndex: (value) => { core.currentDialogueIndex.value = value },
    clearLineSnapshots: () => core.clearLineSnapshots(),
    startPreview: () => core.startPreview(),
    t: (key, params) => core.t(key, params),
  })

  // ==================== 鉴赏 / 收藏 ====================
  const {
    galleryDialogVisible,
    galleryTab,
    galleryItems,
    galleryCountText,
    musicItems,
    musicLoading,
    switchGalleryTab,
    openGallery,
  } = usePlayerCollections({
    projectId: () => core.resolveProjectId(),
    getEndings: () => core.endings.value,
    getAchievements: () => core.achievements.value,
    getUnlockedAchievementCount: () => core.unlockedAchievementCount.value,
    loadPlayerAchievements: () => core.loadPlayerAchievements(),
    loadEndings: () => core.loadEndings(),
    t: (key, params) => core.t(key, params),
  })

  // ==================== 进度存档（本地兜底 + 云端槽位 + 退出） ====================
  const {
    saves,
    saveDialogVisible,
    isRestoring,
    loadProgress,
    exitGame,
    openSaveDialog,
    saveToSlot,
    loadFromSlot,
    deleteSlot,
  } = usePlayerProgress({
    projectId: () => core.resolveProjectId(),
    getSceneIndex: () => core.currentSceneIndex.value,
    setSceneIndex: (value) => { core.currentSceneIndex.value = value },
    getDialogueIndex: () => core.currentDialogueIndex.value,
    setDialogueIndex: (value) => { core.currentDialogueIndex.value = value },
    getHistory: () => core.historyDialogues.value,
    setHistory: (value) => { core.historyDialogues.value = value },
    getVariables: () => core.variableValues.value,
    setVariables: (value) => { core.variableValues.value = value },
    getLastEffectKey: () => core.lastEffectKey.value,
    setLastEffectKey: (value) => { core.lastEffectKey.value = value },
    getEndings: () => core.triggeredEndings.value,
    setEndings: (value) => { core.triggeredEndings.value = value },
    getPlaythrough: () => core.playthrough.value,
    setPlaythrough: (value) => { core.playthrough.value = value },
    playthroughKey: () => core.playthroughKey(),
    getScene: () => core.currentScene.value,
    getDialogue: () => core.currentDialogue.value,
    getCoverUrl: () => core.projectCoverUrl.value,
    sceneTitleOf: (scene) => core.localizedSceneTitle(scene),
    textOf: (dialogue) => core.localizedText(dialogue),
    initVariableValues: () => core.initVariableValues(),
    clearLineSnapshots: () => core.clearLineSnapshots(),
    syncProjectMeta: (immediate) => core.syncProjectMeta(immediate),
    startTyping: () => core.startTyping(),
    applyVolumes: () => core.applyVolumes(),
    stopBackgroundMusic: () => core.stopBackgroundMusic(),
    exitToHome: () => core.exitToHome(),
    t: (key, params) => core.t(key, params),
  })

  // ==================== 演出模式（作者预览热更新） ====================
  const {
    performMode,
    performSaving,
    performText,
    performAvatarId,
    performBackground,
    performMusic,
    performStatus,
    togglePerformMode,
    savePerformEdit,
  } = usePlayerPerform({
    canPerform: () => core.canPerform.value,
    getDialogue: () => core.currentDialogue.value,
    getScene: () => core.currentScene.value,
    getDialogues: () => core.allDialogues.value,
    setDialogues: (value) => { core.allDialogues.value = value },
    getHistory: () => core.historyDialogues.value,
    setHistory: (value) => { core.historyDialogues.value = value },
    getDirectives: () => core.directivesByContent.value,
    getScenes: () => core.scenes.value,
    setScenes: (value) => { core.scenes.value = value },
    getBackgroundMusic: () => core.backgroundMusic.value,
    isPlaying: () => core.isPlaying.value,
    fadeBgmTo: (volume, duration) => core.fadeBgmTo(volume, duration),
    bgmTargetVolume: () => core.bgmTargetVolume(),
    markSkipRestoredLine: () => core.markSkipRestoredLine(),
    startTyping: () => core.startTyping(),
    saveDialogues: (payload) => saveDialogues(payload),
    updateScene: (sceneId, patch) => updateScene(sceneId, patch),
    projectId: () => core.resolveProjectId(),
  })

  // ==================== 输入接入（键盘 / 手柄 / 音频解锁） ====================
  const ESC_PANELS = [
    core.settingsVisible,
    galleryDialogVisible,
    saveDialogVisible,
    core.statusDialogVisible,
    chaptersVisible,
    core.showHistoryDialogue,
    core.debugPanelVisible,
  ]
  const ACTIVE_PANELS = [...ESC_PANELS, core.endingDialogVisible, changelogVisible]
  usePlayerInput({
    getEscPanels: () => ESC_PANELS,
    getActivePanels: () => ACTIVE_PANELS,
    getSkipRead: () => core.playerSettings.value.skipRead,
    setSkipRead: (value) => {
      core.playerSettings.value.skipRead = value
    },
    rollbackOneLine: () => core.rollbackOneLine(),
    nextDialogue: () => core.nextDialogue(),
    toggleHistoryDialogue: () => core.toggleHistoryDialogue(),
    toggleAutoPlay: () => core.toggleAutoPlay(),
    playBackgroundMusic: () => core.playBackgroundMusic(),
    t: (key) => core.t(key),
  })

  // 回填端口：开局装载与位置副作用在挂载后才会调用这些入口
  Object.assign(core.panelPort, {
    loadProgress,
    loadChapterData,
    loadPublicReleases,
    saveToSlot,
    setPerformMode: (value: boolean) => { performMode.value = value },
    getPerformMode: () => performMode.value,
    getIsRestoring: () => isRestoring.value,
  })

  return {
    changelogVisible,
    publicReleases,
    loadPublicReleases,
    chaptersVisible,
    chapterRoute,
    routeStats,
    loadChapterData,
    jumpToChapter,
    galleryDialogVisible,
    galleryTab,
    galleryItems,
    galleryCountText,
    musicItems,
    musicLoading,
    switchGalleryTab,
    openGallery,
    saves,
    saveDialogVisible,
    isRestoring,
    loadProgress,
    exitGame,
    openSaveDialog,
    saveToSlot,
    loadFromSlot,
    deleteSlot,
    performMode,
    performSaving,
    performText,
    performAvatarId,
    performBackground,
    performMusic,
    performStatus,
    togglePerformMode,
    savePerformEdit,
  }
}

export type PlayerPanels = ReturnType<typeof usePlayerPanels>
