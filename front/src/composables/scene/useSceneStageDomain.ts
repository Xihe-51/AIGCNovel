/**
 * 场景编辑器的「演出舞台」域：把预览模型、图层写操作、素材拖拽与撤销同步装配成一个整体。
 *
 * 四块职责：
 * - useSceneStagePreview：按当前台词的演出指令推导图层/背景/前景/特效（只读）；
 * - useSceneStageActions：图层显隐/排序/重命名/删除/拖动/属性，写前快照入舞台撤销栈；
 * - useSceneAssetDrop：素材库拖到舞台或场景设置槽位；
 * - useSceneStageSync：台词栈与舞台栈统一撤销、素材热重载、切换台词时跟随刷新。
 *
 * 最后再把散落在上述 composable 里的舞台状态收敛成 previewStage 只读视图模型，
 * 供 ScenePreviewPane 直接消费。依赖全部通过 ref / getter 注入，不反向依赖编排层内部状态。
 */
import { computed } from 'vue'
import type { Ref } from 'vue'
import { MAX_AVATAR_LAYERS } from '@/composables/scene/useDirectiveEditor'
import { useSceneStagePreview } from '@/composables/scene/useSceneStagePreview'
import { useSceneStageActions } from '@/composables/scene/useSceneStageActions'
import { useSceneAssetDrop } from '@/composables/scene/useSceneAssetDrop'
import { useSceneStageSync } from '@/composables/scene/useSceneStageSync'

export interface SceneStageDomainContext {
  // 数据源
  projectId: Ref<any>
  scene: Ref<any>
  characters: Ref<any[]>
  dialogues: Ref<any[]>
  currentDialogueIndex: Ref<number>
  currentDialogue: Ref<any>
  assetSrc: (url: string) => string
  avatarLayersOf: (avatarId: number | null | undefined) => string[]
  defaultBackground: string
  // 指令列表刷新（由演出指令 composable 提供）
  refreshDirectiveList: () => any
  // 场景设置交互态（拖拽高亮、BGM 播放态）
  dragOverBg: Ref<boolean>
  dragOverMusic: Ref<boolean>
  musicPlaying: Ref<boolean>
  musicProgress: Ref<number>
  musicDuration: Ref<number>
  // 台词历史栈
  pushHistory: () => void
  markDirty: () => void
  undoStack: Ref<any[]>
  redoStack: Ref<any[]>
  undoDialogue: () => void
  bumpAssetNonce: () => void
  // 视图模型需要的外壳状态
  loading: Ref<boolean>
  error: Ref<string>
  currentSpeakerName: Ref<any>
  currentDialogueHtml: Ref<any>
  bgmMuted: Ref<boolean>
  isPanelOpen: Ref<boolean>
  stageEditing: Ref<boolean>
  stageGridSnap: Ref<number>
}

export function useSceneStageDomain(ctx: SceneStageDomainContext) {
  // ==================== 预览模型：按当前对话的演出指令渲染 ====================
  const {
    previewDirectives,
    previewSlots,
    hasPreviewSlots,
    avatarLayers,
    stageVisibility,
    previewBgSrc,
    bgAvailable,
    fgAvailable,
    previewFgSrc,
    previewAvatarSources,
    previewAvatarSrc,
    previewSpeaker,
    settingsBgFailed,
    activeEffect,
    loadPreviewDirectives,
  } = useSceneStagePreview({
    projectId: ctx.projectId,
    characters: ctx.characters,
    scene: ctx.scene,
    dialogues: ctx.dialogues,
    currentDialogueIndex: ctx.currentDialogueIndex,
    assetSrc: ctx.assetSrc,
    avatarLayersOf: ctx.avatarLayersOf,
    defaultBackground: ctx.defaultBackground,
  })

  // ==================== 舞台写操作：图层/显隐/撤销栈 ====================
  const {
    stageUndoStack,
    canUndoAvatar,
    recordStageUndo,
    snapshotStageDirectives,
    markStageUndoApplied,
    restorePersistedStageUndo,
    undoAvatar,
    findAvatarDirective,
    nextLayerOrder,
    handleAvatarVisibility,
    handleAvatarOrder,
    handleAvatarReorder,
    handleAvatarRemove,
    handleAvatarRename,
    handleStageVisibility,
    handleAvatarGroupMove,
    handleAvatarTransform,
    handleAvatarAddNew,
  } = useSceneStageActions({
    projectId: ctx.projectId,
    currentDialogue: ctx.currentDialogue as any,
    previewDirectives,
    avatarLayers,
    previewSlots,
    previewSpeaker,
    loadPreviewDirectives,
    refreshDirectiveList: ctx.refreshDirectiveList,
    clearRedo: () => { ctx.redoStack.value = [] },
  })

  // ==================== 素材拖拽：舞台直出 / 场景设置槽位 ====================
  const {
    onStageAssetDrop,
    onAvatarReplaceAsset,
    onBackgroundDrop,
    onMusicDrop,
  } = useSceneAssetDrop({
    projectId: ctx.projectId,
    currentDialogue: ctx.currentDialogue as any,
    avatarLayers,
    scene: ctx.scene,
    stageUndoStack,
    dragOverBg: ctx.dragOverBg,
    dragOverMusic: ctx.dragOverMusic,
    settingsBgFailed,
    musicPlaying: ctx.musicPlaying,
    musicProgress: ctx.musicProgress,
    musicDuration: ctx.musicDuration,
    snapshotStageDirectives,
    markStageUndoApplied,
    nextLayerOrder,
    findAvatarDirective,
    loadPreviewDirectives,
    refreshDirectiveList: ctx.refreshDirectiveList,
    pushHistory: ctx.pushHistory,
    markDirty: ctx.markDirty,
  })

  // ==================== 舞台与预览同步：统一撤销 / 素材热重载 / 预览跟随 ====================
  const { canUndoAny, undoLast, hotReloadAssets, syncPreviewIfCurrent } = useSceneStageSync({
    currentDialogue: ctx.currentDialogue,
    undoStack: ctx.undoStack,
    stageUndoStack,
    undoDialogue: ctx.undoDialogue,
    undoStage: undoAvatar,
    reloadPreviewDirectives: loadPreviewDirectives,
    restorePersistedStageUndo,
    bumpAssetNonce: ctx.bumpAssetNonce,
  })

  // ==================== 舞台视图模型：收敛成一个只读对象（见 ScenePreviewPane） ====================
  const previewStage = computed(() => ({
    bgSrc: previewBgSrc.value,
    avatarSrc: previewAvatarSrc.value,
    avatarSources: previewAvatarSources.value,
    foregroundSrc: previewFgSrc.value,
    slots: previewSlots.value,
    hasSlots: hasPreviewSlots.value,
    activeEffect: activeEffect.value,
    loading: ctx.loading.value,
    error: ctx.error.value,
    dialogueCount: ctx.dialogues.value.length,
    dialogueIndex: ctx.currentDialogueIndex.value,
    currentDialogue: ctx.currentDialogue.value,
    speakerName: ctx.currentSpeakerName.value,
    dialogueHtml: ctx.currentDialogueHtml.value,
    bgmMuted: ctx.bgmMuted.value,
    isPanelOpen: ctx.isPanelOpen.value,
    editable: ctx.stageEditing.value,
    canEdit: !!ctx.currentDialogue.value?.content_id,
    dialogueKey: ctx.currentDialogue.value?.content_id || '',
    canUndo: canUndoAvatar.value,
    gridSnap: ctx.stageGridSnap.value,
    stageVisibility: stageVisibility.value,
    bgAvailable: bgAvailable.value,
    fgAvailable: fgAvailable.value,
    avatarLayers: avatarLayers.value,
    maxLayers: MAX_AVATAR_LAYERS
  }))

  return {
    // 预览模型
    previewDirectives,
    previewSlots,
    hasPreviewSlots,
    avatarLayers,
    stageVisibility,
    previewBgSrc,
    bgAvailable,
    fgAvailable,
    previewFgSrc,
    previewAvatarSources,
    previewAvatarSrc,
    previewSpeaker,
    settingsBgFailed,
    activeEffect,
    loadPreviewDirectives,
    // 舞台写操作
    stageUndoStack,
    canUndoAvatar,
    recordStageUndo,
    snapshotStageDirectives,
    markStageUndoApplied,
    restorePersistedStageUndo,
    undoAvatar,
    findAvatarDirective,
    nextLayerOrder,
    handleAvatarVisibility,
    handleAvatarOrder,
    handleAvatarReorder,
    handleAvatarRemove,
    handleAvatarRename,
    handleStageVisibility,
    handleAvatarGroupMove,
    handleAvatarTransform,
    handleAvatarAddNew,
    // 素材拖拽
    onStageAssetDrop,
    onAvatarReplaceAsset,
    onBackgroundDrop,
    onMusicDrop,
    // 撤销与同步
    canUndoAny,
    undoLast,
    hotReloadAssets,
    syncPreviewIfCurrent,
    // 视图模型
    previewStage
  }
}
