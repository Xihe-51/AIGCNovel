/**
 * 场景编辑器的舞台写操作：图层显隐/排序/重命名/删除/拖动/属性。
 *
 * 预览模型由 useSceneStagePreview 提供；这里只负责把编辑动作写成节点演出指令。
 * 每次写操作前由调用方注入的 snapshotStageDirectives 入栈，失败时 dropStageUndo 回滚，
 * 成功时 markStageUndoApplied 记录「操作后」指纹——撤销逻辑全部收在 useStageUndo。
 */
import type { ComputedRef, Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createDirective,
  deleteDirective,
  updateDirective,
} from '@/api/directive'
import { layerIdOf, stageDefaultX } from '@/composables/player/usePlayerStage'
import { MAX_AVATAR_LAYERS } from '@/composables/scene/useDirectiveEditor'
import {
  buildAvatarTransformPatch,
  clampStagePercent,
  pickFreeStageX,
} from './stageLayerGeometry'
import { formatErrorMessage } from '@/utils/errorMessage'

export interface StageLayerActionsContext {
  projectId: Ref<string | number>
  currentDialogue: ComputedRef<any>
  previewDirectives: Ref<any[]>
  avatarLayers: ComputedRef<any[]>
  previewSlots: ComputedRef<Record<string, any>>
  previewSpeaker: ComputedRef<any>
  loadPreviewDirectives: (contentId: number | string | null | undefined) => Promise<void>
  refreshDirectiveList: () => Promise<void>
  snapshotStageDirectives: (contentId?: number | string | null) => void
  markStageUndoApplied: () => void
  /** 写操作失败时弹掉刚入栈的快照 */
  dropStageUndo: () => void
}

export function useStageLayerActions(ctx: StageLayerActionsContext) {
  /** 找当前台词某个图层最后一条可显示 avatar 指令 */
  const findAvatarDirective = (layerId: string) => ctx.previewDirectives.value
    .filter(d => d.directive_type === 'avatar')
    .filter(d => layerIdOf(d.payload || {}) === layerId)
    .filter(d => d.payload?.action !== 'hide')
    .pop()

  /** 多角色入场自动站位：挑一个没被占用的 X 坐标 */
  const nextFreeStageX = () => pickFreeStageX(
    Object.values(ctx.previewSlots.value)
      .filter(Boolean)
      .filter(s => s.visible !== false)
      .map(s => Number(s.x))
  )

  const nextLayerOrder = () => (ctx.avatarLayers.value.length
    ? Math.max(...ctx.avatarLayers.value.map(l => Number(l.order) || 0)) + 1
    : 0)

  const nextLayerName = () => `立绘 ${ctx.avatarLayers.value.length + 1}`

  const layerMetaFor = (layerId: string) => {
    const hit = ctx.avatarLayers.value.find(l => l.layer_id === layerId)
    return {
      layer_id: layerId,
      layer_name: hit?.label || ({ left: '左侧', center: '中间', right: '右侧' } as any)[layerId] || '立绘',
      order: hit ? Number(hit.order) || 0 : nextLayerOrder()
    }
  }

  const avatarLayersOf = (layerId: string) => ctx.previewDirectives.value.filter(d =>
    d.directive_type === 'avatar' && layerIdOf(d.payload || {}) === layerId
  )

  const handleAvatarVisibility = async (layerId: string, visible: boolean) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) { ElMessage.warning('请先保存当前台词'); return }
    const pid = Number(ctx.projectId.value)
    const contentId = Number(dialogue.content_id)
    const existing = findAvatarDirective(layerId)
    if (!existing) { ElMessage.warning('该图层还没有立绘'); return }
    ctx.snapshotStageDirectives()
    try {
      await updateDirective(pid, existing.directive_id, {
        payload: { ...(existing.payload || {}), visible }
      })
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      ctx.markStageUndoApplied()
      ElMessage.success(visible ? '立绘已显示' : '立绘已隐藏')
    } catch (e: any) {
      ctx.dropStageUndo()
      console.error('切换立绘显隐失败:', e)
      ElMessage.error(formatErrorMessage('切换显隐失败', e))
    }
  }

  /** 把图层顺序写回所有 avatar 指令：layerIds 按从后到前排列 */
  const applyAvatarLayerOrders = async (layerIds: string[]) => {
    const pid = Number(ctx.projectId.value)
    const contentId = Number(ctx.currentDialogue.value?.content_id || 0)
    if (!pid || !contentId) return false
    const wanted = new Map(layerIds.map((id, idx) => [id, idx]))
    ctx.snapshotStageDirectives()
    try {
      for (const d of ctx.previewDirectives.value.filter(x => x.directive_type === 'avatar')) {
        const id = layerIdOf(d.payload || {})
        const order = wanted.get(id)
        if (order === undefined) continue
        await updateDirective(pid, d.directive_id, {
          payload: { ...(d.payload || {}), layer_id: id, order }
        })
      }
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      ctx.markStageUndoApplied()
      return true
    } catch (e) {
      ctx.dropStageUndo()
      throw e
    }
  }

  const orderedAvatarLayerIds = () => ctx.avatarLayers.value
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map(l => l.layer_id)

  const handleAvatarOrder = async (layerId: string, direction: 'up' | 'down') => {
    const ids = orderedAvatarLayerIds()
    const index = ids.indexOf(layerId)
    const target = index + (direction === 'up' ? 1 : -1)
    if (index < 0 || target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      await applyAvatarLayerOrders(ids)
      ElMessage.success(`图层已${direction === 'up' ? '上移' : '下移'}`)
    } catch (e: any) {
      console.error('调整层级失败:', e)
      ElMessage.error(formatErrorMessage('调整层级失败', e))
    }
  }

  /** 图层列表拖拽排序：把 from 放到 to 的位置，重排所有图层的 order */
  const handleAvatarReorder = async (from: string, to: string) => {
    const ids = orderedAvatarLayerIds()
    const fromIdx = ids.indexOf(from)
    const toIdx = ids.indexOf(to)
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, from)
    try {
      await applyAvatarLayerOrders(ids)
      ElMessage.success('图层层级已调整')
    } catch (e: any) {
      console.error('图层排序失败:', e)
      ElMessage.error(formatErrorMessage('图层排序失败', e))
    }
  }

  /** 删除图层：清掉该图层在当前节点的全部 avatar 指令 */
  const handleAvatarRemove = async (layerId: string) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) { ElMessage.warning('请先保存当前台词'); return }
    const pid = Number(ctx.projectId.value)
    const contentId = Number(dialogue.content_id)
    const rows = avatarLayersOf(layerId)
    if (!rows.length) return
    ctx.snapshotStageDirectives()
    try {
      for (const d of rows) await deleteDirective(pid, d.directive_id)
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      ctx.markStageUndoApplied()
      ElMessage.success('图层已删除')
    } catch (e: any) {
      ctx.dropStageUndo()
      console.error('删除图层失败:', e)
      ElMessage.error(formatErrorMessage('删除图层失败', e))
    }
  }

  /** 重命名图层：更新该图层在当前节点的全部 avatar 指令 */
  const handleAvatarRename = async (layerId: string) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) { ElMessage.warning('请先保存当前台词'); return }
    const layer = ctx.avatarLayers.value.find(l => l.layer_id === layerId)
    if (!layer) return
    let nextName = ''
    try {
      const result: any = await ElMessageBox.prompt('图层名称', '重命名图层', {
        inputValue: layer.label,
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValidator: (v: any) => (String(v || '').trim() ? true : '请输入图层名称')
      })
      nextName = String(result.value || '').trim().slice(0, 30)
    } catch (e) {
      return
    }
    if (!nextName || nextName === layer.label) return
    const pid = Number(ctx.projectId.value)
    const contentId = Number(dialogue.content_id)
    const rows = avatarLayersOf(layerId)
    if (!rows.length) return
    ctx.snapshotStageDirectives()
    try {
      for (const d of rows) {
        await updateDirective(pid, d.directive_id, {
          payload: { ...(d.payload || {}), layer_id: layerId, layer_name: nextName }
        })
      }
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      ctx.markStageUndoApplied()
      ElMessage.success('图层已重命名')
    } catch (e: any) {
      ctx.dropStageUndo()
      console.error('重命名图层失败:', e)
      ElMessage.error(formatErrorMessage('重命名图层失败', e))
    }
  }

  /** 背景/前景/对话框显隐：写入节点级 stage 指令 */
  const handleStageVisibility = async (layerKey: string, visible: boolean) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) { ElMessage.warning('请先保存当前台词'); return }
    const pid = Number(ctx.projectId.value)
    const contentId = Number(dialogue.content_id)
    const existing = ctx.previewDirectives.value.filter(d => d.directive_type === 'stage').pop()
    const next = { ...(existing?.payload || {}), [layerKey]: visible }
    ctx.snapshotStageDirectives()
    try {
      if (existing) {
        await updateDirective(pid, existing.directive_id, { payload: next })
      } else {
        await createDirective(pid, { content_id: contentId, directive_type: 'stage', payload: next })
      }
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      ctx.markStageUndoApplied()
      ElMessage.success(visible ? '已显示' : '已隐藏')
    } catch (e: any) {
      ctx.dropStageUndo()
      console.error('切换舞台层显隐失败:', e)
      ElMessage.error(formatErrorMessage('切换显隐失败', e))
    }
  }

  /** 舞台拖拽：支持多选成组移动，把像素位移折算成每个图层的 x/y 百分比 */
  const handleAvatarGroupMove = async ({ updates }: { updates: any[] }) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) {
      ElMessage.warning('请先保存当前台词，再调整立绘位置')
      return
    }
    const pid = Number(ctx.projectId.value)
    if (!pid) return
    const list = Array.isArray(updates) ? updates : []
    if (!list.length) return
    const contentId = Number(dialogue.content_id)
    const missing = list.filter(u => !findAvatarDirective(u.layerId || 'center'))
    const speaker = ctx.previewSpeaker.value || dialogue
    if (missing.length && !speaker?.character_id) {
      ElMessage.warning('当前台词没有角色，无法添加立绘')
      return
    }
    if (missing.length && ctx.avatarLayers.value.length >= MAX_AVATAR_LAYERS) {
      ElMessage.warning(`最多 ${MAX_AVATAR_LAYERS} 个立绘图层`)
      return
    }
    ctx.snapshotStageDirectives()
    try {
      for (const u of list) {
        const lid = u.layerId || 'center'
        const nx = clampStagePercent(u.x)
        const ny = clampStagePercent(u.y)
        const existing = findAvatarDirective(lid)
        if (existing) {
          await updateDirective(pid, existing.directive_id, {
            payload: {
              ...(existing.payload || {}),
              layer_id: lid,
              coord: 'stage',
              x: nx,
              y: ny
            }
          })
        } else {
          const meta = layerMetaFor(lid)
          await createDirective(pid, {
            content_id: contentId,
            directive_type: 'avatar',
            payload: {
              layer_id: lid,
              layer_name: meta.layer_name,
              order: meta.order,
              character_id: speaker.character_id,
              avatar_id: speaker.avatar_id || null,
              action: 'show',
              coord: 'stage',
              x: nx,
              y: ny,
              scale: 1,
              opacity: 1,
              rotate: 0
            }
          })
        }
      }
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      ctx.markStageUndoApplied()
      ElMessage.success(list.length > 1 ? `已移动 ${list.length} 个图层` : '立绘位置已保存')
    } catch (e: any) {
      ctx.dropStageUndo()
      console.error('保存立绘位置失败:', e)
      ElMessage.error(formatErrorMessage('保存立绘位置失败', e))
    }
  }

  /** 属性条改缩放/透明度/旋转，写回同一条 avatar 指令 */
  const handleAvatarTransform = async (
    { layerId, layerName, scale, opacity, rotate, x, y, reset }: any
  ) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) {
      ElMessage.warning('请先保存当前台词，再调整立绘属性')
      return
    }
    const pid = Number(ctx.projectId.value)
    if (!pid) return
    const lid = layerId || 'center'
    const contentId = Number(dialogue.content_id)
    const patch: any = buildAvatarTransformPatch({ scale, opacity, rotate })
    const hideExists = ctx.previewDirectives.value.some(d =>
      d.directive_type === 'avatar' &&
      layerIdOf(d.payload || {}) === lid &&
      d.payload?.action === 'hide'
    )
    const existing = hideExists ? null : findAvatarDirective(lid)
    if (reset) {
      // 多角色入场：自动挑一个没被占用的站位，避免新角色和已有立绘重叠
      patch.x = nextFreeStageX()
      patch.y = 100
    } else {
      if (x !== undefined && x !== null) patch.x = clampStagePercent(x)
      if (y !== undefined && y !== null) patch.y = clampStagePercent(y)
    }
    const speaker = existing ? null : (ctx.previewSpeaker.value || dialogue)
    if (!existing && !speaker?.character_id) {
      ElMessage.warning('当前台词没有角色，无法添加立绘')
      return
    }
    if (!existing && ctx.avatarLayers.value.length >= MAX_AVATAR_LAYERS) {
      ElMessage.warning(`最多 ${MAX_AVATAR_LAYERS} 个立绘图层`)
      return
    }
    const meta = layerMetaFor(lid)
    ctx.snapshotStageDirectives()
    try {
      if (existing) {
        await updateDirective(pid, existing.directive_id, {
          payload: {
            ...(existing.payload || {}),
            layer_id: lid,
            coord: 'stage',
            ...patch
          }
        })
      } else {
        await createDirective(pid, {
          content_id: contentId,
          directive_type: 'avatar',
          payload: {
            layer_id: lid,
            layer_name: layerName || meta.layer_name,
            order: meta.order,
            character_id: speaker.character_id,
            avatar_id: speaker.avatar_id || null,
            action: 'show',
            coord: 'stage',
            x: patch.x ?? stageDefaultX(lid),
            y: patch.y ?? 100,
            scale: patch.scale,
            opacity: patch.opacity,
            rotate: patch.rotate
          }
        })
      }
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      ctx.markStageUndoApplied()
      ElMessage.success('立绘属性已保存')
    } catch (e: any) {
      ctx.dropStageUndo()
      console.error('保存立绘属性失败:', e)
      ElMessage.error(formatErrorMessage('保存立绘属性失败', e))
    }
  }

  /** 新建一个立绘层：用当前说话角色创建一条 show 指令 */
  const handleAvatarAddNew = () => {
    if (ctx.avatarLayers.value.length >= MAX_AVATAR_LAYERS) {
      ElMessage.warning(`最多 ${MAX_AVATAR_LAYERS} 个立绘图层`)
      return
    }
    const layerId = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    handleAvatarTransform({
      layerId,
      layerName: nextLayerName(),
      scale: 1,
      opacity: 1,
      rotate: 0,
      reset: true
    })
  }

  return {
    findAvatarDirective,
    nextFreeStageX,
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
  }
}
