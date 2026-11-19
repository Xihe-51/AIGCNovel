import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { saveDialogues, deleteDialogue as apiDeleteDialogue, reorderDialoguesApi } from '@/api/dialogue'
import { createProjectVersion } from '@/api/version'
import { BASE_URL } from '@/utils/request'
import { getCharacterName as resolveCharacterName } from '@/utils/scene'
import { useSceneStageDomain } from '@/composables/scene/useSceneStageDomain'
import { useSceneTranslations } from '@/composables/scene/useSceneTranslations'
import { useSceneNodeEditors } from '@/composables/scene/useSceneNodeEditors'
import { useSceneVoiceBatch, EMOTION_OPTIONS } from '@/composables/scene/useSceneVoiceBatch'
import { useSceneVoiceDirector } from '@/composables/scene/useSceneVoiceDirector'
import { useSceneHistory } from '@/composables/scene/useSceneHistory'
import { useSceneSelection } from '@/composables/scene/useSceneSelection'
import { useSceneScriptImport } from '@/composables/scene/useSceneScriptImport'
import { useSceneSettingsAutosave } from '@/composables/scene/useSceneSettingsAutosave'
import { useSceneUploads } from '@/composables/scene/useSceneUploads'
import { useSceneDialogueList } from '@/composables/scene/useSceneDialogueList'
import { useSceneDialoguePreview } from '@/composables/scene/useSceneDialoguePreview'
import { useSceneBranches } from '@/composables/scene/useSceneBranches'
import { useSceneAssetPicker } from '@/composables/scene/useSceneAssetPicker'
import { useSceneDebugPlayback } from '@/composables/scene/useSceneDebugPlayback'
import { useSceneDirectives } from '@/composables/scene/useSceneDirectives'
import { useSceneLock } from '@/composables/scene/useSceneLock'
import { useSceneFsmStates } from '@/composables/scene/useSceneFsmStates'
import { useSceneAiAssistant } from '@/composables/scene/useSceneAiAssistant'
import { useSceneAudio } from '@/composables/scene/useSceneAudio'
import { useSceneLoader } from '@/composables/scene/useSceneLoader'
import { useSceneEditorShortcuts } from '@/composables/scene/useSceneEditorShortcuts'

export interface SceneEditorControllerOptions {
  sceneId: () => string
  focusContentId: () => number | null
  paused: () => boolean
  emit: (event: 'scene-updated' | 'open-graph', ...args: any[]) => void
}

/**
 * 场景编辑器的编排层：把 26 个领域 composable 装配成一个控制器。
 *
 * 分层约定：
 * - 本文件持有基础状态（场景 / 台词 / 角色 / 选中 …）与所有跨域联动，是唯一的编排点；
 * - 每个领域仍由各自的 composable 负责（history / selection / stage / dialogue-list …）；
 * - 视图只拿到「数据 + 领域事件处理器」，不直接接触 API 与副作用。
 *
 * 之所以集中在一个文件：这些 composable 互相依赖（撤销栈同时被台词与舞台使用、
 * 装载器要重置历史、同步器要拿两条撤销栈），拆散后只能靠大量回调互传，反而更难维护。
 */
export function useSceneEditorController(options: SceneEditorControllerOptions) {
  const { sceneId, focusContentId, paused, emit } = options

  // ==================== 基础状态 ====================
  const scene = ref<any>({})
  const projectId = ref<any>('')
  // 素材库拖拽到场景槽位
  const dragOverBg = ref(false)
  const dragOverMusic = ref(false)
  const dialogues = ref<any[]>([])
  // 场景播放条件（剧情锁）：见 useSceneLock
  const {
    sceneLockMode,
    sceneLockItems,
    addSceneLockCondition,
    removeSceneLockCondition,
    loadSceneLock,
    buildSceneLockPayload,
  } = useSceneLock({ projectId, sceneId })
  // 搜索定位时高亮的节点（响应式，避免被后续渲染冲掉）
  const focusedContentId = ref<any>(null)
  // 搜索/剧情图定位的高亮：短时高亮优先，其次保留外层传入的定位目标
  const activeFocusId = computed(() => focusedContentId.value ?? focusContentId() ?? null)

  // ==================== 撤销 / 重做 / 未保存草稿 ====================
  const {
    undoStack,
    redoStack,
    dirty,
    canRedo,
    cloneDialogues,
    pushHistory,
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
  } = useSceneHistory({
    sceneId,
    getDialogues: () => dialogues.value,
    setDialogues: (list: any[]) => { dialogues.value = list },
    getCurrentIndex: () => currentDialogueIndex.value,
    setCurrentIndex: (i: number) => { currentDialogueIndex.value = i },
    clearSelection: () => clearSelection(),
    reloadDirectives: () => {
      const cur = currentDialogue.value
      stage.loadPreviewDirectives(cur ? cur.content_id : null)
    },
  })

  // ==================== 多选与批量操作 ====================
  const {
    selectedIndexes,
    toggleSelect,
    clearSelection,
    batchDelete,
    batchDuplicate,
  } = useSceneSelection({
    dialogues,
    getDirty: () => dirty.value,
    pushHistory,
    clearHistory,
    markDirty,
    clearDraft,
    dropProjectNode: (contentId: any) => {
      projectNodes.value = projectNodes.value.filter((n: any) => n.content_id !== contentId)
    },
  })

  // ==================== 批量配音：选中台词逐条 TTS，生成后回填 voice_url ====================
  // 配音导演：台词情绪标签（与后端 EMOTION_OPTIONS 一致）
  const emotionOptions = EMOTION_OPTIONS
  const {
    voiceBatchVisible,
    voiceBatchRunning,
    voiceBatchDone,
    voiceBatchTotal,
    voiceBatchCurrent,
    voiceBatchErrors,
    voiceBatchItems,
    openVoiceBatch,
    runVoiceBatch,
  } = useSceneVoiceBatch({
    projectId,
    scene,
    dialogues,
    selectedIndexes,
    getCharacters: () => characters.value,
  })

  // ==================== 配音导演：场景情绪分布 + 规则自动标注 ====================
  const {
    voiceDirectorVisible,
    emotionTagScope,
    emotionTagOnlyUnlabeled,
    emotionTagRunning,
    emotionTagRows,
    sceneVoicableCount,
    sceneEmotionStats,
    emotionStatRows,
    emotionTagCheckedCount,
    openVoiceDirector,
    runEmotionAutoTag,
    applyEmotionTags,
  } = useSceneVoiceDirector({
    projectId,
    scene,
    dialogues,
    selectedIndexes,
    snapshot: cloneDialogues,
    pushHistory,
    markDirty,
  })

  // ==================== 剧本批量导入 ====================
  const {
    scriptImportVisible,
    openScriptImport,
    handleScriptImport,
  } = useSceneScriptImport({
    dialogues,
    scene,
    getCharacters: () => characters.value,
    pushHistory,
    markDirty,
    clearSelection,
  })

  // 项目内全部剧情节点（跨场景），用于分支跳转目标选择
  const projectNodes = ref<any[]>([])
  // 非「选择」节点的自动跳转边（source_content_id → branch）
  const jumpMap = ref<any>({})
  // 项目变量与节点数值变化
  const variables = ref<any[]>([])
  const effectsMap = ref<any>({})
  const characters = ref<any[]>([])
  const loading = ref(true)
  const error = ref('')
  const isPanelOpen = ref(true)
  // 编辑面板默认进入「脚本」，场景设置收进第二个 tab，避免打开先看到大背景图
  const panelTab = ref('script')
  // 舞台直接拖拽立绘（画布第一版）：拖动后写回 avatar 演出指令
  const stageEditing = ref(false)
  // 拖拽网格吸附：0 = 关闭，5 = 吸附到 5% 网格
  const stageGridSnap = ref(0)
  // 场景设置（标题/描述/背景/音乐/剧情锁）的独立保存状态：
  // 台词有 dirty，场景设置也必须有自己的 dirty，否则切场景会静默丢改动。
  const sceneReady = ref(false)
  const {
    sceneDirty,
    sceneSaving,
    resetSnapshot,
    refreshSceneDirty,
    cancelScheduledSave,
    persistSceneSettings,
    saveSceneSettings,
  } = useSceneSettingsAutosave({
    sceneId,
    scene,
    projectId: () => projectId.value,
    getSceneReady: () => sceneReady.value,
    buildLock: () => buildSceneLockPayload(),
    onSaved: () => emit('scene-updated'),
  })
  const currentDialogueIndex = ref(0)
  const defaultBackground = ''

  // 场景设置面板里的试听 <audio> 由子组件持有并 defineExpose，音频控制仍统一在编排层
  const settingsPanelRef = ref<any>(null)
  const settingsAudio = computed(() => settingsPanelRef.value?.settingsAudio || null)
  // 舞台 BGM 的 <audio> 由 ScenePreviewPane 持有并 defineExpose，播放控制仍统一在编排层
  const previewPaneRef = ref<any>(null)
  const backgroundMusic = computed(() => previewPaneRef.value?.backgroundMusic || null)

  // ==================== 音频：场景设置试听 + 舞台 BGM（见 useSceneAudio） ====================
  const {
    musicPlaying,
    musicProgress,
    musicDuration,
    bgmMuted,
    toggleMusic,
    onMusicTime,
    onMusicMeta,
    seekMusic,
    playBackgroundMusic,
    toggleBgm,
    stopBackgroundMusic,
    stopSettingsAudio,
  } = useSceneAudio({ scene, settingsAudio, backgroundMusic })

  // ==================== 演出指令（节点级）：弹窗自己读写指令，编排层管撤销栈与预览刷新 ====================
  // 弹窗宿主内部持有 DirectiveDialog 的 ref，并 defineExpose 转发 reload
  const dialogsHostRef = ref<any>(null)
  const directiveDialogRef = computed(() => dialogsHostRef.value || null)
  const {
    directiveDialogVisible,
    directiveContentId,
    directiveTarget,
    refreshDirectiveList,
    handleDirectivesChanged,
    openDirectiveDialog,
  } = useSceneDirectives({
    dialogues,
    currentDialogueIndex,
    directiveDialogRef,
    // 舞台域在下方装配，这里只登记回调，调用发生在交互时
    recordStageUndo: (contentId: any, before: any, after: any) => stage.recordStageUndo(contentId, before, after),
    syncPreviewIfCurrent: (contentId: any) => stage.syncPreviewIfCurrent(contentId),
  })

  // ==================== AI 续写/问答：弹窗状态 + /ai/continue_story 请求编排（见 useSceneAiAssistant） ====================
  const {
    aiDialogVisible,
    aiQuestion,
    aiAnswer,
    aiLoading,
    currentAIIndex,
    aiStage,
    aiRefs,
    openAIDialog,
    sendToAI,
    applyAIAnswer,
  } = useSceneAiAssistant({
    projectId,
    scene,
    dialogues,
    getCharacterName: (characterId: any) => getCharacterName(characterId),
  })

  // ==================== 台词审校状态（FSM）：只存本地 localStorage（见 useSceneFsmStates） ====================
  const {
    dialogueFsmStates,
    loadFsmStates,
    setFsmState,
  } = useSceneFsmStates({ sceneId })

  const togglePanel = () => {
    isPanelOpen.value = !isPanelOpen.value
  }

  // ==================== 节点级编辑：显示条件 / 数值变化（见 useSceneNodeEditors） ====================
  const {
    nodeConditionVisible,
    nodeConditionMode,
    nodeConditionItems,
    nodeConditionTarget,
    openNodeConditionDialog,
    applyNodeCondition,
    clearNodeCondition,
    addEffect,
    removeEffect,
    saveDialogueEffects,
  } = useSceneNodeEditors({
    projectId,
    dialogues,
    variables,
    effectsMap,
    markDirty,
    pushHistory,
  })

  // ==================== 预览联动：当前台词 / 搜索定位 / 立绘与素材地址（见 useSceneDialoguePreview） ====================
  const {
    currentDialogue,
    currentSpeakerName,
    currentDialogueHtml,
    selectDialogue,
    focusDialogueByContentId,
    nextDialogue,
    restartDialogues,
    assetNonce,
    assetSrc,
    avatarLayersOf,
    cancelFocusPulse,
  } = useSceneDialoguePreview({
    dialogues,
    characters,
    currentDialogueIndex,
    focusedContentId,
    focusContentId,
    getCharacterName: (characterId: any) => getCharacterName(characterId),
  })

  // 切到剧情图等视图时暂停 BGM，回到脚本再继续
  watch(paused, (isPaused) => {
    if (isPaused) {
      stopBackgroundMusic()
      stopSettingsAudio()
    } else {
      nextTick(() => { playBackgroundMusic() })
    }
  })

  // ==================== 演出舞台域：预览模型 / 图层写操作 / 素材拖拽 / 撤销同步（见 useSceneStageDomain） ====================
  const stage = useSceneStageDomain({
    projectId,
    scene,
    characters,
    dialogues,
    currentDialogueIndex,
    currentDialogue,
    assetSrc,
    avatarLayersOf,
    defaultBackground,
    refreshDirectiveList,
    dragOverBg,
    dragOverMusic,
    musicPlaying,
    musicProgress,
    musicDuration,
    pushHistory,
    markDirty,
    undoStack,
    redoStack,
    undoDialogue: undo,
    bumpAssetNonce: () => { assetNonce.value = Date.now() },
    loading,
    error,
    currentSpeakerName,
    currentDialogueHtml,
    bgmMuted,
    isPanelOpen,
    stageEditing,
    stageGridSnap,
  })
  // 场景设置面板与素材库复用会读它判断背景是否加载失败
  const { settingsBgFailed } = stage

  // ==================== 台词列表：增删改排序与落库（见 useSceneDialogueList） ====================
  const {
    handleCharacterChange,
    addNewDialogue,
    saveDialogue,
    saveAllDialogues,
    deleteDialogue,
    moveDialogueUp,
    moveDialogueDown,
    reorderDialogues,
  } = useSceneDialogueList({
    dialogues,
    scene,
    projectId,
    getSceneId: sceneId,
    loading,
    dirty,
    undoStack,
    redoStack,
    projectNodes,
    effectsMap,
    pushHistory,
    markDirty,
    clearDraft,
    clearSelection,
    saveDialogues,
    deleteDialogueApi: apiDeleteDialogue,
    reorderDialoguesApi,
    createProjectVersion,
  })

  // ==================== 译文：逐句 / 场景 / 选项（见 useSceneTranslations） ====================
  const {
    translationDialogVisible,
    translationSaving,
    translationTarget,
    openTranslationDialog,
    saveTranslation,
    sceneTransVisible,
    sceneTransSaving,
    sceneTranslationCount,
    translatedSceneLanguages,
    openSceneTranslationDialog,
    saveSceneTranslations,
    choiceTransVisible,
    choiceTransSaving,
    choiceTransTarget,
    openChoiceTranslationDialog,
    saveChoiceTranslation,
  } = useSceneTranslations({ scene })

  // 跳到剧情图并定位当前台词（没有台词时定位场景首个节点）
  const openGraph = () => {
    const node = currentDialogue.value && currentDialogue.value.content_id
      ? currentDialogue.value
      : dialogues.value.find((d: any) => d.content_id)
    emit('open-graph', Number(sceneId()), node?.content_id ?? null)
  }

  // 从指定台词开始调试播放：播放器带 ?debug=1&start=<content_id>（见 useSceneDebugPlayback）
  const { playFromDialogue } = useSceneDebugPlayback({ projectId, scene })

  // ==================== 素材上传：背景图 / 背景音乐 / 语音（见 useSceneUploads） ====================
  const { handleBackgroundUpload, handleMusicUpload, handleVoiceUpload } = useSceneUploads({
    projectId,
    scene,
    dialogues,
  })

  // ==================== 素材库复用：从项目已有素材中选择背景/音乐（见 useSceneAssetPicker） ====================
  const {
    assetPickerVisible,
    assetPickerKind,
    assetPickerLoading,
    assetPickerItems,
    openAssetPicker,
    useAssetFromLibrary,
  } = useSceneAssetPicker({ projectId, scene, settingsBgFailed, stopSettingsAudio })

  // 角色名解析统一走 utils/scene（旁白 / 角色加载中 / 未知角色 的兜底文案只维护一份）
  const getCharacterName = (characterId: any) => resolveCharacterName(characters.value, characterId)

  // ==================== 选择项 ↔ branch_paths ====================

  // ==================== 分支编排：选择项 / 自动跳转（见 useSceneBranches） ====================
  const {
    loadJumpMap,
    setJumpTarget,
    onContentTypeChange,
    ensureChoices,
    addChoice,
    addChoiceCondition,
    removeChoiceCondition,
    removeChoice,
    handleChoiceImageUpload,
    clearChoiceImage,
    saveChoices,
  } = useSceneBranches({
    projectId,
    dialogues,
    projectNodes,
    jumpMap,
    pushHistory,
    markDirty,
    getCharacterName,
  })

  // ==================== 场景数据装载：场景 / 节点 / 变量 / 角色 / 台词一次拉齐（见 useSceneLoader） ====================
  const { fetchSceneData } = useSceneLoader({
    sceneId,
    focusContentId,
    scene,
    projectId,
    dialogues,
    projectNodes,
    variables,
    effectsMap,
    characters,
    loading,
    error,
    sceneReady,
    loadSceneLock,
    resetSnapshot,
    loadJumpMap,
    loadFsmStates,
    ensureChoices,
    resetHistory: () => {
      clearHistory()
      dirty.value = false
    },
    maybeRestoreDraft,
    focusDialogueByContentId: (id: any) => focusDialogueByContentId(id),
  })

  // ==================== 弹窗数据模型：10 个弹窗各自的只读入参（见 SceneDialogsHost） ====================
  const dialogData = computed(() => ({
    ai: {
      visible: aiDialogVisible.value,
      question: aiQuestion.value,
      index: currentAIIndex.value,
      answer: aiAnswer.value,
      refs: aiRefs.value,
      loading: aiLoading.value,
      stage: aiStage.value
    },
    directive: {
      visible: directiveDialogVisible.value,
      projectId: Number(projectId.value),
      contentId: directiveContentId.value,
      targetLabel: directiveTarget.value,
      characters: characters.value,
      defaultCharacterId: currentDialogue.value?.character_id || null,
      defaultAvatarId: currentDialogue.value?.avatar_id || null,
      assetNonce: assetNonce.value
    },
    condition: {
      visible: nodeConditionVisible.value,
      targetLabel: nodeConditionTarget.value,
      mode: nodeConditionMode.value,
      items: nodeConditionItems.value,
      variables: variables.value
    },
    scriptImport: {
      visible: scriptImportVisible.value
    },
    voiceBatch: {
      visible: voiceBatchVisible.value,
      items: voiceBatchItems.value,
      selectedCount: selectedIndexes.value.length,
      emotionOptions,
      running: voiceBatchRunning.value,
      done: voiceBatchDone.value,
      total: voiceBatchTotal.value,
      current: voiceBatchCurrent.value,
      errors: voiceBatchErrors.value
    },
    voiceDirector: {
      visible: voiceDirectorVisible.value,
      scope: emotionTagScope.value,
      onlyUnlabeled: emotionTagOnlyUnlabeled.value,
      emotionOptions,
      statRows: emotionStatRows.value,
      sceneTotal: sceneEmotionStats.value.total,
      sceneVoicableCount: sceneVoicableCount.value,
      selectedCount: selectedIndexes.value.length,
      rows: emotionTagRows.value,
      running: emotionTagRunning.value,
      checkedCount: emotionTagCheckedCount.value
    },
    translation: {
      visible: translationDialogVisible.value,
      target: translationTarget.value,
      saving: translationSaving.value
    },
    sceneTranslation: {
      visible: sceneTransVisible.value,
      title: scene.value.title || '',
      description: scene.value.description || '',
      translations: scene.value.translations || {},
      saving: sceneTransSaving.value
    },
    choiceTranslation: {
      visible: choiceTransVisible.value,
      target: choiceTransTarget.value,
      saving: choiceTransSaving.value
    },
    assetPicker: {
      visible: assetPickerVisible.value,
      kind: assetPickerKind.value,
      loading: assetPickerLoading.value,
      items: assetPickerItems.value,
      baseUrl: BASE_URL,
      selectedUrl: assetPickerKind.value === 'image' ? scene.value.background_url : scene.value.music_url
    }
  }))

  // ==================== 弹窗注册表：宿主只回传 key，落到哪个 ref 由编排层决定 ====================
  const dialogVisibilityTargets: Record<string, any> = {
    ai: aiDialogVisible,
    directive: directiveDialogVisible,
    condition: nodeConditionVisible,
    scriptImport: scriptImportVisible,
    voiceBatch: voiceBatchVisible,
    voiceDirector: voiceDirectorVisible,
    translation: translationDialogVisible,
    sceneTranslation: sceneTransVisible,
    choiceTranslation: choiceTransVisible,
    assetPicker: assetPickerVisible
  }
  const onDialogVisible = (key: string, visible: boolean) => {
    const target = dialogVisibilityTargets[key]
    if (target) target.value = visible
  }

  const dialogFieldTargets: Record<string, any> = {
    aiQuestion,
    emotionTagScope,
    emotionTagOnlyUnlabeled
  }
  const onDialogField = (key: string, value: any) => {
    const target = dialogFieldTargets[key]
    if (target) target.value = value
  }

  // 场景设置（含剧情锁）改动 → 标记 dirty 并防抖自动保存
  watch(
    [scene, sceneLockMode, sceneLockItems],
    () => {
      refreshSceneDirty()
    },
    { deep: true }
  )

  // 全局快捷键（Ctrl/Cmd+S 保存全部、Ctrl/Cmd+Z 撤销/重做）与离场守卫（见 useSceneEditorShortcuts）
  useSceneEditorShortcuts({
    saveAll: saveAllDialogues,
    isSaving: () => loading.value,
    undo: stage.undoLast,
    redo,
    hasDialogueDirty: () => dirty.value,
    hasSceneDirty: () => sceneDirty.value,
    saveDraft: saveDraftNow,
    persistScene: () => persistSceneSettings({ silent: true, version: false }),
  })

  onMounted(() => {
    fetchSceneData()
  })

  onBeforeUnmount(() => {
    stopBackgroundMusic()
    stopSettingsAudio()
    cancelFocusPulse()
    cancelScheduledSave()
    flushTextHistory()
    saveDraftNow()
    // 切场景时兜底保存场景设置，避免标题/背景/音乐改动被静默丢掉
    if (sceneDirty.value) persistSceneSettings({ silent: true, version: false })
  })

  return {
    // 外壳
    isPanelOpen,
    panelTab,
    togglePanel,
    // 场景设置
    scene,
    variables,
    sceneLockMode,
    sceneLockItems,
    sceneTranslationCount,
    translatedSceneLanguages,
    dragOverBg,
    dragOverMusic,
    musicPlaying,
    musicProgress,
    musicDuration,
    sceneSaving,
    sceneReady,
    sceneDirty,
    settingsPanelRef,
    openSceneTranslationDialog,
    addSceneLockCondition,
    removeSceneLockCondition,
    openAssetPicker,
    handleBackgroundUpload,
    handleMusicUpload,
    toggleMusic,
    seekMusic,
    onMusicTime,
    onMusicMeta,
    saveSceneSettings,
    // settingsBgFailed / onBackgroundDrop / onMusicDrop 由下方舞台域展开提供
    // 脚本列表
    dialogues,
    characters,
    projectNodes,
    jumpMap,
    effectsMap,
    dialogueFsmStates,
    selectedIndexes,
    activeFocusId,
    loading,
    dirty,
    canRedo,
    addNewDialogue,
    openScriptImport,
    redo,
    reorderDialogues,
    saveAllDialogues,
    openGraph,
    openVoiceDirector,
    batchDelete,
    batchDuplicate,
    openVoiceBatch,
    clearSelection,
    selectDialogue,
    toggleSelect,
    setFsmState,
    openDirectiveDialog,
    openNodeConditionDialog,
    playFromDialogue,
    deleteDialogue,
    moveDialogueUp,
    moveDialogueDown,
    onContentTypeChange,
    handleCharacterChange,
    openTranslationDialog,
    setJumpTarget,
    openChoiceTranslationDialog,
    removeChoice,
    handleChoiceImageUpload,
    clearChoiceImage,
    removeChoiceCondition,
    addChoiceCondition,
    addChoice,
    saveChoices,
    removeEffect,
    addEffect,
    saveDialogueEffects,
    openAIDialog,
    handleVoiceUpload,
    saveDialogue,
    beginTextEdit,
    queueTextHistory,
    flushTextHistory,
    // 预览舞台（预览模型、图层写操作、素材拖拽、撤销联动统一由舞台域提供）
    ...stage,
    previewPaneRef,
    toggleBgm,
    stageEditing,
    nextDialogue,
    restartDialogues,
    stageGridSnap,
    // 弹窗宿主
    dialogsHostRef,
    dialogData,
    onDialogVisible,
    onDialogField,
    sendToAI,
    applyAIAnswer,
    aiAnswer,
    handleDirectivesChanged,
    applyNodeCondition,
    clearNodeCondition,
    handleScriptImport,
    runVoiceBatch,
    runEmotionAutoTag,
    applyEmotionTags,
    saveTranslation,
    saveSceneTranslations,
    saveChoiceTranslation,
    useAssetFromLibrary,
  }
}
