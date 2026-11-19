/**
 * 播放器编排层（基础状态 + 播放推进）。
 *
 * 视图只保留模板与子组件，这里承担三件事：
 * 1. 播放器共享状态（播放开关、对话框显隐、周目、最后结算节点）；
 * 2. 开局装载、叙事位置、条件求值、多语言、阅读设置等基础域；
 * 3. 演出推进域（音频 / 逐字 / 舞台 / 指令 / 推进 / 回退 / 埋点 / 存档位置副作用）。
 *
 * 面板域（存档槽位 / 章节 / 鉴赏 / 更新日志 / 演出编辑 / 输入接入）依赖这里的状态，
 * 但它们内部的入口又要在开局装载与位置副作用里被回调，两者通过
 * playerPanelPort 惰性端口解开循环依赖（端口在 setup 内同步回填，调用都在挂载后）。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { PlayEventType } from '@/api/analytics'
import { unlockMusic } from '@/api/gallery'
import { usePlayerAchievements } from '@/composables/player/usePlayerAchievements'
import { usePlayerAudio } from '@/composables/player/usePlayerAudio'
import { usePlayerBootstrap, buildHistoryDialogues } from '@/composables/player/usePlayerBootstrap'
import { usePlayerConditions } from '@/composables/player/usePlayerConditions'
import { usePlayerCoverage } from '@/composables/player/usePlayerCoverage'
import { usePlayerDebugger } from '@/composables/player/usePlayerDebugger'
import { usePlayerDevProbe } from '@/composables/player/usePlayerDevProbe'
import { usePlayerDirectives } from '@/composables/player/usePlayerDirectives'
import { usePlayerEnding } from '@/composables/player/usePlayerEnding'
import { usePlayerFlow } from '@/composables/player/usePlayerFlow'
import { usePlayerLineLifecycle } from '@/composables/player/usePlayerLineLifecycle'
import { usePlayerLocale } from '@/composables/player/usePlayerLocale'
import { usePlayerNarrative } from '@/composables/player/usePlayerNarrative'
import { usePlayerOwnership } from '@/composables/player/usePlayerOwnership'
import { usePlayerPlaySession } from '@/composables/player/usePlayerPlaySession'
import { usePlayerPlayback } from '@/composables/player/usePlayerPlayback'
import { usePlayerPositionEffects } from '@/composables/player/usePlayerPositionEffects'
import { usePlayerPreview } from '@/composables/player/usePlayerPreview'
import { usePlayerReads } from '@/composables/player/usePlayerReads'
import { usePlayerRewind } from '@/composables/player/usePlayerRewind'
import { usePlayerSettings } from '@/composables/player/usePlayerSettings'
import { usePlayerStage } from '@/composables/player/usePlayerStage'
import { usePlayerStageFx } from '@/composables/player/usePlayerStageFx'
import { usePlayerTelemetry } from '@/composables/player/usePlayerTelemetry'
import { usePlayerTouch } from '@/composables/player/usePlayerTouch'
import { usePlayerTypewriter } from '@/composables/player/usePlayerTypewriter'
import { usePlayerVariableEffects } from '@/composables/player/usePlayerVariableEffects'
import { usePlayerVariables } from '@/composables/player/usePlayerVariables'
import { buildChoiceViews } from '@/composables/player/playerChoiceViews'
import { createPlayerPanelPort } from '@/composables/player/playerPanelPort'
import type { PlayerPanelPort } from '@/composables/player/playerPanelPort'

export interface PlayerControllerOptions {
  /** 作品 ID */
  projectId: () => string | number
  /** 静态网页包 / 发布预览：固定剥离调试器与演出编辑工具 */
  releaseMode: () => boolean
  /** 路由 query，用于 ?release=1 / ?debug=1 / ?edit=1 / ?start= 判定 */
  routeQuery: () => Record<string, any>
  /** 回首页 */
  goHome: () => void
}

export function usePlayerController(options: PlayerControllerOptions) {
  const resolveProjectId = () => Number(options.projectId())
  const query = () => options.routeQuery() || {}
  const panelPort: PlayerPanelPort = createPlayerPanelPort()

  // 发布模式：静态包固定开启；也支持 ?release=1 让作者以玩家视角预览
  const releaseView = computed(
    () => options.releaseMode() || query().release === '1',
  )
  // 调试器：仅作者且非发布模式时，?debug=1 才生效
  const debugRequested = query().debug === '1'
  const debugMode = ref(false)
  const debugPanelVisible = ref(false)

  // 演出模式：仅作者本人带 ?edit=1 预览时可用；公开发布的玩家端不会渲染编辑入口
  const ownershipApi = usePlayerOwnership({
    isReleaseView: () => releaseView.value,
    isEditQuery: () => query().edit === '1',
  })
  const {
    currentUserId,
    projectOwnerId,
    isOwner,
    canPerform,
    setProjectOwnerId,
  } = ownershipApi;

  // ==================== 开局装载：作品 / 场景 / 台词 / 分支 / 角色 ====================
  // 面板域（存档 / 章节 / 更新日志 / 演出编辑）的载入入口通过端口延后调用
  const bootstrapApi = usePlayerBootstrap({
    projectId: () => resolveProjectId(),
    releaseView: () => releaseView.value,
    debugRequested: () => debugRequested,
    isOwner: () => isOwner.value,
    canPerform: () => canPerform.value,
    startQuery: () => query().start,
    setDebugMode: (value) => { debugMode.value = value },
    setPerformMode: (value) => panelPort.setPerformMode(value),
    setProjectOwnerId: (value) => setProjectOwnerId(value),
    setSceneIndex: (value) => { currentSceneIndex.value = value },
    setDialogueIndex: (value) => { currentDialogueIndex.value = value },
    loadProgress: () => panelPort.loadProgress(),
    loadStoryGraph: (projectId) => loadStoryGraph(projectId),
    loadReads: () => loadReads(),
    loadChapterData: () => panelPort.loadChapterData(),
    loadDebugSnapshots: () => loadDebugSnapshots(),
    loadVariableSystem: () => loadVariableSystem(),
    loadEndings: () => loadEndings(),
    loadPlayerAchievements: () => loadPlayerAchievements(),
    loadPublicReleases: () => panelPort.loadPublicReleases(),
    onLoaded: () => {
      startPreview();
      initHistoryDialogues();
      logStartOnce();
      nextTick(() => logCurrentScene());
      scheduleAchievementCheck();
    },
    t: (key, params) => t(key, params),
  });
  const {
    scenes,
    allDialogues,
    characters,
    branches,
    loading,
    error,
    historyDialogues,
    fetchProjectData,
  } = bootstrapApi;

  // 分支覆盖率：本轮试玩走过的节点/分支（仅调试模式记录）由 usePlayerCoverage 自管
  const coverageApi = usePlayerCoverage({
    debugMode: () => debugMode.value,
    getCurrentDialogue: () => currentDialogue.value,
  });
  const {
    visitedContents,
    visitedEdges,
    coverageStats,
    uncoveredNodes,
    uncoveredEdges,
    markVisitedContent,
    markVisitedEdge,
    resetCoverage,
    restoreVisited,
    loadStoryGraph,
  } = coverageApi;

  // ===== 条件调试器：变量历史 / 条件断点 / 状态快照 / 热改与跳转 =====
  const debugApi = usePlayerDebugger({
    projectId: () => resolveProjectId(),
    debugMode: () => debugMode.value,
    getCurrentDialogue: () => currentDialogue.value,
    getProjectVariables: () => projectVariables.value,
    getVariableValues: () => variableValues.value,
    getSceneIndex: () => currentSceneIndex.value,
    getDialogueIndex: () => currentDialogueIndex.value,
    getVisited: () => [...visitedContents.value],
    getScenes: () => scenes.value,
    getDialogues: () => allDialogues.value,
    evalSingleCondition: (condition) => evalSingleCondition(condition),
    restoreVisited,
    clearLineSnapshots: () => clearLineSnapshots(),
    clearWait: () => clearWait(),
    clearAutoTimer: () => clearAutoTimer(),
    clampVariable: (v, value) => clampVariable(v, value),
    syncProjectMeta: () => syncProjectMeta(),
    startTyping: () => startTyping(),
    setAutoPlay: (value) => { autoPlay.value = value },
    setPanelVisible: (value) => { debugPanelVisible.value = value },
    setDialogueBoxVisible: (value) => { showDialogueBox.value = value },
    setSceneIndex: (value) => { currentSceneIndex.value = value },
    setDialogueIndex: (value) => { currentDialogueIndex.value = value },
    setVariableValues: (value) => { variableValues.value = value },
    t: (key, params) => t(key, params),
  });
  const { pushVariableHistory, checkDebugBreakpoint, loadDebugSnapshots } = debugApi;

  // ===== 试玩埋点（调试模式不记录，避免作者自己测试污染数据）=====
  const telemetryApi = usePlayerTelemetry({
    getProjectId: () => resolveProjectId(),
    getDebugMode: () => debugMode.value,
    getIsOwner: () => isOwner.value,
    getLoading: () => loading.value,
    getError: () => error.value,
    getCurrentSceneId: () => Number(currentScene.value?.scene_id || 0),
  })
  const { resetTelemetryTracking, logPlayEvent, logStartOnce, logCurrentScene } = telemetryApi;

  // 周目：二周目继承上一周目的变量值，方便作者做「二周目解锁」
  const playthroughKey = () => `aigc:playthrough:${options.projectId()}`
  const playthrough = ref(1)
  try {
    const stored = Number(localStorage.getItem(playthroughKey()))
    if (Number.isFinite(stored) && stored > 0) playthrough.value = Math.floor(stored)
  } catch (_) { /* ignore */ }

  // 状态管理（场景 / 台词 / 角色 / 分支 / 加载态 / 历史回想 / 皮肤封面由 usePlayerBootstrap 自持）
  const isPlaying = ref(true); // 默认自动播放
  const autoPlay = ref(false); // 始终自动播放
  const defaultBackground = ''; // 默认背景图
  const backgroundMusic = ref(null);
  const showDialogueBox = ref(true); // 控制对话框显示/隐藏
  const showHistoryDialogue = ref(false); // 控制历史对话显示/隐藏
  // 空场景（没有台词/选项节点）直接跳过，避免试玩停在只有背景的画面上
  const sceneHasDialogues = (sceneId: any) => (allDialogues.value[sceneId] || []).length > 0;

  // 移动端触控（旋转提示/滑动切回想/滑动吞点击）由 usePlayerTouch 自管
  const touchApi = usePlayerTouch({
    getShowHistory: () => showHistoryDialogue.value,
    setShowHistory: (value) => { showHistoryDialogue.value = value },
    getShowDialogueBox: () => showDialogueBox.value,
    setShowDialogueBox: (value) => { showDialogueBox.value = value },
    nextDialogue: () => nextDialogue(),
  });
  const { bindOrientation, unbindOrientation } = touchApi;

  // 变量系统（定义/取值/跨周目持久化/行为变量/变化浮层）由 usePlayerVariables 自管
  const variablesApi = usePlayerVariables({
    projectId: () => resolveProjectId(),
    showNotices: () => playerSettings.value.showVariableNotice,
  });
  const {
    projectVariables,
    variableEffects,
    variableValues,
    sceneLocks,
    clampVariable,
    initialValueOf,
    syncProjectMeta,
    loadVariableSystem,
    clearVariableNotices,
    pushVariableNotices,
    markHesitationStart,
    commitHesitation,
    bumpBehaviorReview,
  } = variablesApi;
  const statusDialogVisible = ref(false);
  const lastEffectKey = ref('');

  // ==================== 结局 ====================
  // 结局清单 / 已触发集合 / 结局页可见性由 usePlayerEnding 自管
  const endingApi = usePlayerEnding({
    projectId: () => resolveProjectId(),
    getCurrentDialogue: () => currentDialogue.value,
    getCurrentScene: () => currentScene.value,
    evalCondition: (condition) => evalCondition(condition),
    logPlayEvent: (event: string, payload: Record<string, any>) => logPlayEvent(event as PlayEventType, payload),
    scheduleAchievementCheck: () => scheduleAchievementCheck(),
    clearTyping: () => clearTyping(),
    clearAutoTimer: () => clearAutoTimer(),
  });
  const {
    endings,
    triggeredEndings,
    endingDialogVisible,
    loadEndings,
    checkEndingForCurrent,
    resetEndings,
  } = endingApi;

  // 阅读设置（localStorage 持久化）
  const settingsApi = usePlayerSettings({
    onSettingsChange: () => applyVolumes(),
    onReset: () => startTyping(),
  });
  const { playerSettings, loadSettings, saveSettings } = settingsApi;
  const dialogueVoice = ref(null);

  // ==================== 界面文案与多语言 ====================
  // 文案挑选与译文回退由 usePlayerLocale 托管
  const localeApi = usePlayerLocale({
    getLanguage: () => playerSettings.value.language,
    getCharacters: () => characters.value,
    getScenes: () => scenes.value,
    getBranches: () => branches.value,
  });
  const {
    t,
    localizedCharacterName,
    localizedText,
    localizedChoice,
    historySceneTitle,
    historyChoiceText,
  } = localeApi;

  // ==================== 叙事位置与派生 ====================
  // 当前场景 / 当前台词 / 富文本 / 回想展示模型，以及场景埋点、曲目解锁、节点覆盖率
  // 三个跟随播放位置的 watch，全部由 usePlayerNarrative 托管
  const narrativeApi = usePlayerNarrative({
    projectId: () => resolveProjectId(),
    getScenes: () => scenes.value,
    getAllDialogues: () => allDialogues.value,
    getHistory: () => historyDialogues.value,
    setHistory: (value) => { historyDialogues.value = value },
    getLoading: () => loading.value,
    getError: () => error.value,
    getDebugMode: () => debugMode.value,
    getDisplayedLength: () => displayedText.value.length,
    localizedText: (dialogue) => localizedText(dialogue),
    getCharacterName: (characterId) => getCharacterName(characterId),
    historySceneTitle: (dialogue) => historySceneTitle(dialogue),
    historyChoiceText: (dialogue) => historyChoiceText(dialogue),
    buildHistoryDialogues,
    logCurrentScene: () => logCurrentScene(),
    markVisitedContent: (contentId) => markVisitedContent(contentId),
    sceneHasDialogues: (sceneId) => sceneHasDialogues(sceneId),
    unlockMusic: (projectId, url) => unlockMusic(projectId, url),
  });
  const {
    currentSceneIndex,
    currentDialogueIndex,
    currentScene,
    currentSceneDialogues,
    currentDialogue,
    initHistoryDialogues,
  } = narrativeApi;

  // ==================== 上一句回退 ====================
  // 行快照入栈 / 去重 / 截断与回退还原由 usePlayerRewind 托管
  const rewindApi = usePlayerRewind({
    getDialogue: () => currentDialogue.value,
    getSceneIndex: () => currentSceneIndex.value,
    setSceneIndex: (value) => { currentSceneIndex.value = value },
    getDialogueIndex: () => currentDialogueIndex.value,
    setDialogueIndex: (value) => { currentDialogueIndex.value = value },
    getVariables: () => variableValues.value,
    setVariables: (value) => { variableValues.value = value },
    getLastEffectKey: () => lastEffectKey.value,
    setLastEffectKey: (value) => { lastEffectKey.value = value },
    getEndings: () => triggeredEndings.value,
    setEndings: (value) => { triggeredEndings.value = value },
    getHistory: () => historyDialogues.value,
    setHistory: (value) => { historyDialogues.value = value },
    setIsWaiting: (value) => { isWaiting.value = value },
    setIsPlaying: (value) => { isPlaying.value = value },
    setShowDialogueBox: (value) => { showDialogueBox.value = value },
    bumpBehaviorReview: () => bumpBehaviorReview(),
    clearWait: () => clearWait(),
    clearTyping: () => clearTyping(),
    resetAutoTimer: () => clearAutoTimer(),
    markSkipRestoredLine: () => markSkipRestoredLine(),
    startTyping: () => startTyping(),
    applyVolumes: () => applyVolumes(),
  });
  const { captureLineSnapshot, pushLineSnapshot, clearLineSnapshots } = rewindApi;

  // ==================== 预览派生状态 ====================
  // 说话人回溯、立绘分层与分支选项由 usePlayerPreview 托管
  const previewApi = usePlayerPreview({
    getDialogues: () => currentSceneDialogues.value,
    getCurrentIndex: () => currentDialogueIndex.value,
    getCurrentDialogue: () => currentDialogue.value,
    getBranches: () => branches.value,
    avatarLayersOf: (avatarId) => avatarLayersOf(avatarId),
    defaultAvatarLayersOf: (characterId) => defaultAvatarLayersOf(characterId),
    evalCondition: (conditions) => evalCondition(conditions),
  });
  const { currentChoices } = previewApi;

  // ==================== 音频混音：BGM 淡入 + 语音闪避 ====================
  const audioApi = usePlayerAudio({
    backgroundMusic,
    dialogueVoice,
    playerSettings,
    getCurrentScene: () => currentScene.value,
  })
  const {
    bgmTargetVolume,
    fadeBgmTo,
    playBackgroundMusic,
    stopBackgroundMusic,
    setBgmDucking,
    applyVolumes,
  } = audioApi;

  // ==================== 逐字显示 ====================
  // 逐字显示屏、补全与自动前进排期由 usePlayerTypewriter 托管
  const fullText = () => localizedText(currentDialogue.value) || '';

  const typewriterApi = usePlayerTypewriter({
    getFullText: () => fullText(),
    getSpeed: () => Number(playerSettings.value.textSpeed),
    canAutoAdvance: () => (
      !!autoPlay.value
      && isPlaying.value
      && !isTyping.value
      && !isWaiting.value
      && !currentChoices.value.length
    ),
    getAutoDelay: () => Number(playerSettings.value.autoDelay),
    onAdvance: () => nextDialogue(),
  });
  const {
    displayedText,
    isTyping,
    clearTyping,
    finishTyping,
    typeOut,
    scheduleAutoAdvance,
    scheduleAutoAdvanceAfter,
    clearAutoTimer,
    disposeTypewriter,
  } = typewriterApi;

  // ==================== 已读记录 ====================
  const readsApi = usePlayerReads({
    projectId: () => resolveProjectId(),
    getCurrentDialogue: () => currentDialogue.value,
    hasChoices: () => currentChoices.value.length > 0,
    skipReadEnabled: () => !!playerSettings.value.skipRead,
  });
  const {
    readSet,
    loadReads,
    markCurrentRead,
    shouldSkipCurrent,
    allowSkip,
    resetSkipGuard,
    markSkipRestoredLine,
    consumeSkipRestoredLine,
    disposeReads,
  } = readsApi;

  // 调试探针（仅开发环境，便于无头浏览器排查）：挂载与快照结构由 usePlayerDevProbe 自管
  usePlayerDevProbe({
    getReadSet: () => readSet.value,
    getSkipRead: () => playerSettings.value.skipRead,
    getCurrentContentId: () => currentDialogue.value?.content_id,
    shouldSkipCurrent: () => shouldSkipCurrent(),
    getIsTyping: () => isTyping.value,
    getEndingsCount: () => endings.value.length,
    getEndingVisible: () => endingDialogVisible.value,
    getTriggeredEndings: () => triggeredEndings.value,
    getVariableValues: () => variableValues.value,
    getCoverageStats: () => coverageStats.value,
    getVisitedNodes: () => visitedContents.value,
    getVisitedEdges: () => visitedEdges.value,
    getCurrentUserId: () => currentUserId,
    getProjectOwnerId: () => projectOwnerId.value,
    getCanPerform: () => canPerform.value,
    getPerformMode: () => panelPort.getPerformMode(),
    getQueryEdit: () => query().edit,
  });

  // ==================== 项目变量 ====================
  // 条件求值（变量比较 / 条件组 / 剧情锁 / 台词级条件）由 usePlayerConditions 自管
  const conditionsApi = usePlayerConditions({ projectVariables, variableValues, sceneLocks, allDialogues });

  // 分支选项的展示模型：文案 / 图片地址 / 锁定提示在这里一次性算好，
  // PlayerDialogueBox 只负责按数组渲染，不再回调任何业务函数。
  const dialogueChoiceViews = computed(() => buildChoiceViews(currentChoices.value, {
    localizedChoice,
    t,
    conditionText,
  }));

  // 按台词应用变量效果 / 周目重置由 usePlayerVariableEffects 编排；
  // lastEffectKey 由编排层持有，作为「同节点只结算一次」的共享标记（存档也要读它）。
  const variableEffectsApi = usePlayerVariableEffects({
    getCurrentDialogue: () => currentDialogue.value,
    getSceneIndex: () => currentSceneIndex.value,
    getDialogueIndex: () => currentDialogueIndex.value,
    getLastEffectKey: () => lastEffectKey.value,
    setLastEffectKey: (value) => { lastEffectKey.value = value },
    getProjectVariables: () => projectVariables.value,
    getVariableEffects: () => variableEffects.value,
    getVariableValues: () => variableValues.value,
    setVariableValues: (value) => { variableValues.value = value },
    clampVariable: (v, value) => clampVariable(v, value),
    initialValueOf: (v) => initialValueOf(v),
    syncProjectMeta: () => syncProjectMeta(),
    pushVariableNotices: (items) => pushVariableNotices(items),
    pushVariableHistory: (label, before, after, reason) => pushVariableHistory(label, before, after, reason),
    checkDebugBreakpoint: () => checkDebugBreakpoint(),
    scheduleAchievementCheck: () => scheduleAchievementCheck(),
  });
  const { applyEffectsForCurrent, resetVariables } = variableEffectsApi;
  const {
    evalSingleCondition,
    evalCondition,
    scenePlayable,
    nodePlayable,
    firstPlayableNodeIndex,
    sceneHasPlayableDialogues,
    conditionText,
  } = conditionsApi;

  // ==================== 成就 ====================
  const achievementsApi = usePlayerAchievements({
    projectId: () => resolveProjectId(),
    getDebugMode: () => debugMode.value,
    getVariables: () => variableValues.value,
    getEndings: () => [...triggeredEndings.value],
    t,
  })
  const {
    loadPlayerAchievements,
    scheduleAchievementCheck,
    resetAchievementState,
  } = achievementsApi;

  // 一句台词开始播放时的固定顺序（结算变量 → 回退标记 → 结局 → 清定时器 → 跳过已读
  // → 记录已读 → 选择计时 → 逐字显示）以及设置变更后的重播监听，全部由
  // usePlayerLineLifecycle 编排；这里只提供各步骤的实现。
  const lineLifecycleApi = usePlayerLineLifecycle({
    currentDialogue,
    sceneIndex: currentSceneIndex,
    dialogueIndex: currentDialogueIndex,
    settings: playerSettings,
    isPlaying,
    applyEffectsForCurrent: () => applyEffectsForCurrent(),
    checkEndingForCurrent: () => checkEndingForCurrent(),
    consumeSkipRestoredLine: () => consumeSkipRestoredLine(),
    shouldSkipCurrent: () => shouldSkipCurrent(),
    allowSkip: () => allowSkip(),
    resetSkipGuard: () => resetSkipGuard(),
    markCurrentRead: () => markCurrentRead(),
    markHesitationStart: (contentId) => markHesitationStart(contentId),
    clearTyping: () => clearTyping(),
    clearAutoTimer: () => clearAutoTimer(),
    typeOut: () => typeOut(),
    finishTyping: () => finishTyping(),
    scheduleAutoAdvance: () => scheduleAutoAdvance(),
    nextDialogue: () => nextDialogue(),
    setBgmDucking: (on) => setBgmDucking(on),
    applyVolumes: () => applyVolumes(),
  });
  const { startTyping } = lineLifecycleApi;

  // ==================== 开局与重开 ====================
  // 起点修正（起始场景/台词被剧情锁或条件挡住时向后找）、完整重置、二周目推进、
  // 玩家主动重开四个入口由 usePlayerPlaySession 编排；这里只提供状态引用与各步骤实现。
  const playSessionApi = usePlayerPlaySession({
    scenes,
    allDialogues,
    sceneIndex: currentSceneIndex,
    dialogueIndex: currentDialogueIndex,
    history: historyDialogues,
    isPlaying,
    playthrough,
    playthroughKey: () => playthroughKey(),
    scenePlayable: (sceneId) => scenePlayable(sceneId),
    sceneHasPlayableDialogues: (sceneId) => sceneHasPlayableDialogues(sceneId),
    nodePlayable: (node) => nodePlayable(node),
    firstPlayableNodeIndex: (sceneId, from) => firstPlayableNodeIndex(sceneId, from),
    playBackgroundMusic: () => playBackgroundMusic(),
    stopBackgroundMusic: () => stopBackgroundMusic(),
    clearAutoTimer: () => clearAutoTimer(),
    startTyping: () => startTyping(),
    resetEndings: () => resetEndings(),
    resetAchievementState: () => resetAchievementState(),
    resetVariables: () => resetVariables(),
    resetTelemetryTracking: () => resetTelemetryTracking(),
    clearLineSnapshots: () => clearLineSnapshots(),
    clearVariableNotices: () => clearVariableNotices(),
    syncProjectMeta: (immediate) => syncProjectMeta(immediate),
    setLastEffectKey: (value) => { lastEffectKey.value = value },
    t: (key, params) => t(key, params),
  });
  const { startPreview } = playSessionApi;

  // ==================== 演出时序 ====================
  // 画面效果与「停顿」的定时器由 usePlayerStageFx 自管
  const stageFxApi = usePlayerStageFx({
    scheduleAutoAdvance: () => scheduleAutoAdvance(),
  });
  const {
    isWaiting,
    triggerEffect,
    clearEffect,
    clearWait,
    scheduleWait,
    disposeStageFx,
  } = stageFxApi;

  /* ===== 节点演出指令（任意图层 / 背景切换 / 音效）===== */
  // 获取角色名称（按当前阅读语言显示译名）
  const getCharacterName = (characterId: any) => {
    const char = characters.value.find(c => c.character_id === characterId);
    return char ? localizedCharacterName(char) : '';
  };

  const stageApi = usePlayerStage({
    getProjectId: () => resolveProjectId(),
    getCurrentScene: () => currentScene.value,
    getCharacters: () => characters.value,
    getDefaultBackground: () => defaultBackground,
    onReset: () => {
      clearWait();
      clearEffect();
    },
  });
  const {
    stageAvatars,
    bgFromDirective,
    bgTransition,
    bgDuration,
    fgFromDirective,
    directivesByContent,
    stageLayerVisible,
    avatarLayersOf,
    defaultAvatarLayersOf,
    loadDirectiveData,
    resetStage,
    clearStageTransitions,
  } = stageApi;

  // ==================== 演出指令应用 ====================
  // 指令解析以及舞台 / 音频副作用由 usePlayerDirectives 托管
  const directivesApi = usePlayerDirectives({
    getDirectivesByContent: () => directivesByContent.value,
    stageAvatars,
    stageLayerVisible,
    fgFromDirective,
    bgFromDirective,
    bgTransition,
    bgDuration,
    getBackgroundMusic: () => backgroundMusic.value,
    fadeBgmTo: (volume, duration) => fadeBgmTo(volume, duration),
    getBgmTargetVolume: () => bgmTargetVolume(),
    avatarLayersOf: (avatarId) => avatarLayersOf(avatarId),
    defaultAvatarLayersOf: (characterId) => defaultAvatarLayersOf(characterId),
    characterNameOf: (characterId) => getCharacterName(characterId),
    triggerEffect: (payload) => triggerEffect(payload),
    scheduleWait: (ms) => scheduleWait(ms),
  });
  const { applyDirectives } = directivesApi;

  loadSettings();
  saveSettings();

  // ==================== 剧情推进 ====================
  // 节点寻址、下一句 / 下一场景与选项分支跳转由 usePlayerFlow 托管
  const flowApi = usePlayerFlow({
    getScenes: () => scenes.value,
    getAllDialogues: () => allDialogues.value,
    getBranches: () => branches.value,
    getCurrentDialogue: () => currentDialogue.value,
    getCurrentScene: () => currentScene.value,
    getCurrentSceneDialogues: () => currentSceneDialogues.value,
    getHistory: () => historyDialogues.value,
    hasChoices: () => currentChoices.value.length > 0,
    getSceneIndex: () => currentSceneIndex.value,
    setSceneIndex: (value) => { currentSceneIndex.value = value },
    getDialogueIndex: () => currentDialogueIndex.value,
    setDialogueIndex: (value) => { currentDialogueIndex.value = value },
    setShowDialogueBox: (value) => { showDialogueBox.value = value },
    scenePlayable: (sceneId) => scenePlayable(sceneId),
    nodePlayable: (node) => nodePlayable(node),
    sceneHasPlayableDialogues: (sceneId) => sceneHasPlayableDialogues(sceneId),
    firstPlayableNodeIndex: (sceneId) => firstPlayableNodeIndex(sceneId),
    evalCondition: (conditions) => evalCondition(conditions),
    conditionText: (conditions) => conditionText(conditions),
    isDebugMode: () => debugMode.value,
    isPlaying: () => isPlaying.value,
    isTyping: () => isTyping.value,
    isWaiting: () => isWaiting.value,
    getAutoPlay: () => autoPlay.value,
    setIsPlaying: (value) => { isPlaying.value = value },
    finishTyping: () => finishTyping(),
    playBackgroundMusic: () => playBackgroundMusic(),
    stopBackgroundMusic: () => stopBackgroundMusic(),
    scheduleAutoAdvance: () => scheduleAutoAdvance(),
    scheduleAutoAdvanceAfter: (ms) => scheduleAutoAdvanceAfter(ms),
    clearAutoTimer: () => clearAutoTimer(),
    clearWait: () => clearWait(),
    commitHesitation: () => commitHesitation(),
    pushLineSnapshot: (snapshot) => pushLineSnapshot(snapshot),
    captureLineSnapshot: () => captureLineSnapshot(),
    markVisitedEdge: (sourceId, targetId) => markVisitedEdge(sourceId, targetId),
    logPlayEvent: (type: string, payload?: any) => logPlayEvent(type as PlayEventType, payload),
    scheduleAchievementCheck: (force) => scheduleAchievementCheck(force),
    goHome: () => { options.goHome(); },
    t: (key, params) => t(key, params),
  });
  const { nextDialogue, selectBranch, nextScene } = flowApi;

  // ==================== 播放控制 ====================
  // 自动前进 / 快进下一场景 / 对话框与回想显隐 / 上滑唤回想 / 选项点击由 usePlayerPlayback 托管
  const playbackApi = usePlayerPlayback({
    getAutoPlay: () => autoPlay.value,
    setAutoPlay: (value) => { autoPlay.value = value },
    getShowDialogueBox: () => showDialogueBox.value,
    setShowDialogueBox: (value) => { showDialogueBox.value = value },
    getShowHistory: () => showHistoryDialogue.value,
    setShowHistory: (value) => { showHistoryDialogue.value = value },
    getChoices: () => currentChoices.value,
    scheduleAutoAdvance: () => scheduleAutoAdvance(),
    pushLineSnapshot: () => pushLineSnapshot(),
    nextScene: () => nextScene(),
    selectBranch: (branch) => selectBranch(branch),
    bumpBehaviorReview: () => bumpBehaviorReview(),
  });

  // ==================== 位置副作用（自动存档 / 指令重放 / 换场换曲） ====================
  // 三处 watch 由 usePlayerPositionEffects 统一注册，自动存档定时器也归它清理
  usePlayerPositionEffects({
    isLoading: () => loading.value,
    getError: () => error.value,
    isRestoring: () => panelPort.getIsRestoring(),
    getSceneIndex: () => currentSceneIndex.value,
    getDialogueIndex: () => currentDialogueIndex.value,
    saveToSlot: (slot, silent) => panelPort.saveToSlot(slot, silent),
    saveProgress: (silent) => panelPort.saveProgress(silent),
    getCurrentDialogue: () => currentDialogue.value,
    getCurrentScene: () => currentScene.value,
    getDirectivesByContent: () => directivesByContent.value,
    getIsPlaying: () => isPlaying.value,
    resetStage: () => resetStage(),
    applyDirectives: (dialogue) => applyDirectives(dialogue),
    playBackgroundMusic: () => playBackgroundMusic(),
  });

  // 组件挂载时获取数据并设置事件监听
  // 键盘 / 手柄 / 音频解锁监听由 usePlayerInput 在自身生命周期内注册
  onMounted(() => {
    fetchProjectData();
    loadDirectiveData();
    bindOrientation();
  });

  // 卸载时清理定时器、音频与全局事件，避免内存泄漏与操作已销毁组件
  onUnmounted(() => {
    disposeTypewriter();
    clearVariableNotices();
    disposeReads();
    disposeStageFx();
    clearStageTransitions();
    stopBackgroundMusic();
    unbindOrientation();
  });

  const backToHome = () => {
    clearAutoTimer();
    options.goHome();
  };

  return {
    panelPort,
    resolveProjectId,
    releaseView,
    debugMode,
    debugPanelVisible,
    currentUserId,
    projectOwnerId,
    isOwner,
    canPerform,
    ...bootstrapApi,
    visitedContents,
    visitedEdges,
    coverageStats,
    uncoveredNodes,
    uncoveredEdges,
    markVisitedContent,
    markVisitedEdge,
    resetCoverage,
    restoreVisited,
    ...debugApi,
    ...telemetryApi,
    playthrough,
    playthroughKey,
    isPlaying,
    autoPlay,
    defaultBackground,
    backgroundMusic,
    showDialogueBox,
    showHistoryDialogue,
    sceneHasDialogues,
    ...touchApi,
    ...variablesApi,
    statusDialogVisible,
    lastEffectKey,
    ...endingApi,
    ...settingsApi,
    dialogueVoice,
    ...localeApi,
    ...narrativeApi,
    ...rewindApi,
    ...previewApi,
    ...audioApi,
    ...typewriterApi,
    ...readsApi,
    ...conditionsApi,
    dialogueChoiceViews,
    ...variableEffectsApi,
    ...achievementsApi,
    ...lineLifecycleApi,
    ...playSessionApi,
    ...stageFxApi,
    ...stageApi,
    ...directivesApi,
    ...flowApi,
    ...playbackApi,
    getCharacterName,
    backToHome,
    exitToHome: options.goHome,
  }
}

export type PlayerCore = ReturnType<typeof usePlayerController>
