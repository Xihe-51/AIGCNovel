/**
 * 场景编辑器的舞台写操作装配层。
 *
 * 拆成两块后再在这里合并：
 * - useStageUndo      撤销栈（快照入栈、localStorage 持久化、撤销回放）
 * - useStageLayerActions  图层显隐/排序/重命名/删除/拖动/属性
 *
 * 保持单入口对外，调用方（useSceneStageDomain）无需感知内部分工。
 */
import type { ComputedRef, Ref } from 'vue'
import { useStageUndo } from './useStageUndo'
import { useStageLayerActions } from './useStageLayerActions'

export interface SceneStageActionsContext {
  projectId: Ref<string | number>
  currentDialogue: ComputedRef<any>
  previewDirectives: Ref<any[]>
  avatarLayers: ComputedRef<any[]>
  previewSlots: ComputedRef<Record<string, any>>
  previewSpeaker: ComputedRef<any>
  loadPreviewDirectives: (contentId: number | string | null | undefined) => Promise<void>
  refreshDirectiveList: () => Promise<void>
  /** 新的舞台操作让台词重做失效，保持统一撤销的线性语义 */
  clearRedo: () => void
}

export function useSceneStageActions(ctx: SceneStageActionsContext) {
  const undo = useStageUndo({
    projectId: ctx.projectId,
    currentDialogue: ctx.currentDialogue,
    previewDirectives: ctx.previewDirectives,
    loadPreviewDirectives: ctx.loadPreviewDirectives,
    refreshDirectiveList: ctx.refreshDirectiveList,
    clearRedo: ctx.clearRedo,
  })

  const layers = useStageLayerActions({
    projectId: ctx.projectId,
    currentDialogue: ctx.currentDialogue,
    previewDirectives: ctx.previewDirectives,
    avatarLayers: ctx.avatarLayers,
    previewSlots: ctx.previewSlots,
    previewSpeaker: ctx.previewSpeaker,
    loadPreviewDirectives: ctx.loadPreviewDirectives,
    refreshDirectiveList: ctx.refreshDirectiveList,
    snapshotStageDirectives: undo.snapshotStageDirectives,
    markStageUndoApplied: undo.markStageUndoApplied,
    dropStageUndo: undo.dropStageUndo,
  })

  return {
    stageUndoStack: undo.stageUndoStack,
    canUndoAvatar: undo.canUndoAvatar,
    recordStageUndo: undo.recordStageUndo,
    snapshotStageDirectives: undo.snapshotStageDirectives,
    markStageUndoApplied: undo.markStageUndoApplied,
    clearPersistedStageUndo: undo.clearPersistedStageUndo,
    restorePersistedStageUndo: undo.restorePersistedStageUndo,
    undoAvatar: undo.undoAvatar,
    findAvatarDirective: layers.findAvatarDirective,
    nextFreeStageX: layers.nextFreeStageX,
    nextLayerOrder: layers.nextLayerOrder,
    handleAvatarVisibility: layers.handleAvatarVisibility,
    handleAvatarOrder: layers.handleAvatarOrder,
    handleAvatarReorder: layers.handleAvatarReorder,
    handleAvatarRemove: layers.handleAvatarRemove,
    handleAvatarRename: layers.handleAvatarRename,
    handleStageVisibility: layers.handleStageVisibility,
    handleAvatarGroupMove: layers.handleAvatarGroupMove,
    handleAvatarTransform: layers.handleAvatarTransform,
    handleAvatarAddNew: layers.handleAvatarAddNew,
  }
}
