/**
 * 场景编辑器里的舞台写操作：图层显隐/排序/重命名/删除/拖动/属性，以及舞台撤销栈。
 *
 * 预览模型由 useSceneStagePreview 提供；这里只负责把编辑动作写成节点演出指令，
 * 并在每次写操作前对当前台词的全部指令做快照入栈。
 */
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listNodeDirectives,
  createDirective,
  updateDirective,
  deleteDirective,
} from '@/api/directive'
import { layerIdOf, stageDefaultX } from '@/composables/player/usePlayerStage'
import { MAX_AVATAR_LAYERS } from '@/composables/scene/useDirectiveEditor'

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
  // 每次写操作前对「当前台词的全部指令」做快照入栈；演出弹窗的增删改也走同一栈。
  // 栈顶一步持久化到 localStorage，刷新后若服务端指令未变，仍可撤销。
  const stageUndoStack = ref<any[]>([])
  const canUndoAvatar = computed(() => stageUndoStack.value.length > 0)

  const stageUndoStorageKey = (contentId: number | string) => `aigc:stageUndo:${ctx.projectId.value}:${contentId}`
  const directivesFingerprint = (rows: any[]) => JSON.stringify(
    rows.map(r => [r.directive_id, r.directive_type, r.order_num, r.payload]).sort()
  )
  const previewRows = () => ctx.previewDirectives.value.map(d => ({
    directive_id: d.directive_id,
    directive_type: d.directive_type,
    order_num: d.order_num,
    payload: d.payload || {}
  }))

  const persistStageUndo = () => {
    const top = stageUndoStack.value[stageUndoStack.value.length - 1]
    if (!top || !top.contentId) return
    try {
      // 只持久化栈顶：刷新后恢复一步，避免旧快照覆盖服务端新改动
      localStorage.setItem(stageUndoStorageKey(top.contentId), JSON.stringify(top))
    } catch (e) {
      console.warn('持久化撤销栈失败:', e)
    }
  }

  // 写操作成功后调用：记录"操作后"指纹，刷新后据此判断快照是否仍然有效
  const markStageUndoApplied = () => {
    const top = stageUndoStack.value[stageUndoStack.value.length - 1]
    if (!top) return
    top.after = directivesFingerprint(previewRows())
    persistStageUndo()
  }

  const clearPersistedStageUndo = (contentId: number | string | null | undefined) => {
    if (!contentId) return
    try { localStorage.removeItem(stageUndoStorageKey(contentId)) } catch (e) { /* ignore */ }
  }

  // 刷新/切台词后：校验服务端指令指纹与快照基线一致才恢复，否则丢弃
  const restorePersistedStageUndo = (contentId: number | string | null | undefined) => {
    if (!contentId) return
    try {
      const raw = localStorage.getItem(stageUndoStorageKey(contentId))
      if (!raw) return
      const saved = JSON.parse(raw)
      if (!saved || !Array.isArray(saved.rows)) { clearPersistedStageUndo(contentId); return }
      const baseline = saved.baseline
      const after = saved.after
      const current = directivesFingerprint(previewRows())
      // 当前服务端应处于"操作后"状态；若仍处于"操作前"说明没生效，也无需撤销
      const valid = (after && current === after) || (!after && current === baseline)
      if (!valid) {
        // 服务端已被其它修改，快照失效
        clearPersistedStageUndo(contentId)
        return
      }
      // 同一 contentId 只保留一条持久化快照，避免重复
      stageUndoStack.value = stageUndoStack.value.filter(e => String(e.contentId) !== String(contentId))
      stageUndoStack.value.push({ contentId: Number(contentId), rows: saved.rows, at: saved.at || Date.now() })
    } catch (e) {
      console.warn('恢复撤销栈失败:', e)
    }
  }

  const pushStageUndo = (entry: any) => {
    stageUndoStack.value.push(entry)
    if (stageUndoStack.value.length > 20) stageUndoStack.value.shift()
    // 新的舞台操作让台词重做失效，保持统一撤销的线性语义
    ctx.clearRedo()
    persistStageUndo()
  }

  const snapshotStageDirectives = (contentId?: number | string | null) => {
    const cid = Number(contentId || ctx.currentDialogue.value?.content_id || 0)
    const rows = ctx.previewDirectives.value.map(d => ({
      directive_id: d.directive_id,
      directive_type: d.directive_type,
      order_num: d.order_num,
      payload: { ...(d.payload || {}) }
    }))
    // baseline = 快照时刻服务端状态指纹；刷新后据此校验快照是否还有效
    const entry = { contentId: cid, rows, baseline: directivesFingerprint(rows), at: Date.now() }
    pushStageUndo(entry)
  }

  // 演出指令弹窗直接读写指令，父级通过 before/after 快照把它也纳入同一撤销栈
  const recordStageUndo = (contentId: number | string | null, rows: any[], afterRows: any[] | null) => {
    const cid = Number(contentId || 0)
    const snapshot = (rows || []).map(d => ({
      directive_id: d.directive_id,
      directive_type: d.directive_type,
      order_num: d.order_num,
      payload: { ...(d.payload || {}) }
    }))
    const entry: any = { contentId: cid, rows: snapshot, baseline: directivesFingerprint(snapshot), at: Date.now() }
    if (afterRows) entry.after = directivesFingerprint(afterRows)
    pushStageUndo(entry)
  }

  const undoAvatar = async () => {
    const entry = stageUndoStack.value.pop()
    if (!entry) return
    const pid = Number(ctx.projectId.value)
    const contentId = Number(entry.contentId || ctx.currentDialogue.value?.content_id || 0)
    if (!pid || !contentId) return
    const snapshot = entry.rows
    try {
      const current = await listNodeDirectives(pid, contentId)
      // 删除当前多出来的，再按快照逐条恢复 payload/order_num/type
      const snapshotIds = new Set(snapshot.map((r: any) => r.directive_id))
      for (const d of current) {
        if (!snapshotIds.has(d.directive_id)) await deleteDirective(pid, d.directive_id)
      }
      for (const row of snapshot) {
        const live = current.find((d: any) => d.directive_id === row.directive_id)
        if (live) {
          await updateDirective(pid, row.directive_id, {
            payload: row.payload,
            order_num: row.order_num,
            directive_type: row.directive_type
          })
        } else {
          await createDirective(pid, {
            content_id: contentId,
            directive_type: row.directive_type,
            payload: row.payload
          })
        }
      }
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      // 撤销后栈顶变化：同步持久化（空栈则清除）
      const top = stageUndoStack.value[stageUndoStack.value.length - 1]
      if (top) persistStageUndo()
      else clearPersistedStageUndo(contentId)
      ElMessage.success('已撤销上一步')
    } catch (e: any) {
      console.error('撤销失败:', e)
      ElMessage.error('撤销失败: ' + (e.message || '未知错误'))
    }
  }

  // 多角色入场自动站位：挑一个没被占用的 X 坐标
  const STAGE_ENTRY_XS = [50, 25, 75, 18, 82, 35, 65]
  const nextFreeStageX = () => {
    const used = Object.values(ctx.previewSlots.value)
      .filter(Boolean)
      .filter(s => s.visible !== false)
      .map(s => Number(s.x))
      .filter(v => Number.isFinite(v))
    for (const x of STAGE_ENTRY_XS) {
      if (!used.some(u => Math.abs(u - x) < 9)) return x
    }
    return 50
  }

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

  // 找当前台词某个图层最后一条可显示 avatar 指令
  const findAvatarDirective = (layerId: string) => ctx.previewDirectives.value
    .filter(d => d.directive_type === 'avatar')
    .filter(d => layerIdOf(d.payload || {}) === layerId)
    .filter(d => d.payload?.action !== 'hide')
    .pop()

  const handleAvatarVisibility = async (layerId: string, visible: boolean) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) { ElMessage.warning('请先保存当前台词'); return }
    const pid = Number(ctx.projectId.value)
    const contentId = Number(dialogue.content_id)
    const existing = findAvatarDirective(layerId)
    if (!existing) { ElMessage.warning('该图层还没有立绘'); return }
    snapshotStageDirectives()
    try {
      await updateDirective(pid, existing.directive_id, {
        payload: { ...(existing.payload || {}), visible }
      })
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      markStageUndoApplied()
      ElMessage.success(visible ? '立绘已显示' : '立绘已隐藏')
    } catch (e: any) {
      stageUndoStack.value.pop()
      console.error('切换立绘显隐失败:', e)
      ElMessage.error('切换显隐失败: ' + (e.message || '未知错误'))
    }
  }

  // 把图层顺序写回所有 avatar 指令：layerIds 按从后到前排列
  const applyAvatarLayerOrders = async (layerIds: string[]) => {
    const pid = Number(ctx.projectId.value)
    const contentId = Number(ctx.currentDialogue.value?.content_id || 0)
    if (!pid || !contentId) return false
    const wanted = new Map(layerIds.map((id, idx) => [id, idx]))
    snapshotStageDirectives()
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
      markStageUndoApplied()
      return true
    } catch (e) {
      stageUndoStack.value.pop()
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
      ElMessage.error('调整层级失败: ' + (e.message || '未知错误'))
    }
  }

  // 图层列表拖拽排序：把 from 放到 to 的位置，重排所有图层的 order
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
      ElMessage.error('图层排序失败: ' + (e.message || '未知错误'))
    }
  }

  // 删除图层：清掉该图层在当前节点的全部 avatar 指令
  const handleAvatarRemove = async (layerId: string) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) { ElMessage.warning('请先保存当前台词'); return }
    const pid = Number(ctx.projectId.value)
    const contentId = Number(dialogue.content_id)
    const rows = ctx.previewDirectives.value.filter(d =>
      d.directive_type === 'avatar' && layerIdOf(d.payload || {}) === layerId
    )
    if (!rows.length) return
    snapshotStageDirectives()
    try {
      for (const d of rows) await deleteDirective(pid, d.directive_id)
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      markStageUndoApplied()
      ElMessage.success('图层已删除')
    } catch (e: any) {
      stageUndoStack.value.pop()
      console.error('删除图层失败:', e)
      ElMessage.error('删除图层失败: ' + (e.message || '未知错误'))
    }
  }

  // 重命名图层：更新该图层在当前节点的全部 avatar 指令
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
    const rows = ctx.previewDirectives.value.filter(d =>
      d.directive_type === 'avatar' && layerIdOf(d.payload || {}) === layerId
    )
    if (!rows.length) return
    snapshotStageDirectives()
    try {
      for (const d of rows) {
        await updateDirective(pid, d.directive_id, {
          payload: { ...(d.payload || {}), layer_id: layerId, layer_name: nextName }
        })
      }
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      markStageUndoApplied()
      ElMessage.success('图层已重命名')
    } catch (e: any) {
      stageUndoStack.value.pop()
      console.error('重命名图层失败:', e)
      ElMessage.error('重命名图层失败: ' + (e.message || '未知错误'))
    }
  }

  // 背景/前景/对话框显隐：写入节点级 stage 指令
  const handleStageVisibility = async (layerKey: string, visible: boolean) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) { ElMessage.warning('请先保存当前台词'); return }
    const pid = Number(ctx.projectId.value)
    const contentId = Number(dialogue.content_id)
    const existing = ctx.previewDirectives.value.filter(d => d.directive_type === 'stage').pop()
    const next = { ...(existing?.payload || {}), [layerKey]: visible }
    snapshotStageDirectives()
    try {
      if (existing) {
        await updateDirective(pid, existing.directive_id, { payload: next })
      } else {
        await createDirective(pid, { content_id: contentId, directive_type: 'stage', payload: next })
      }
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      markStageUndoApplied()
      ElMessage.success(visible ? '已显示' : '已隐藏')
    } catch (e: any) {
      stageUndoStack.value.pop()
      console.error('切换舞台层显隐失败:', e)
      ElMessage.error('切换显隐失败: ' + (e.message || '未知错误'))
    }
  }

  // 舞台拖拽：支持多选成组移动，把像素位移折算成每个图层的 x/y 百分比
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
    const clamp = (v: any) => Math.max(0, Math.min(100, Number(v) || 0))
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
    snapshotStageDirectives()
    try {
      for (const u of list) {
        const lid = u.layerId || 'center'
        const nx = clamp(u.x)
        const ny = clamp(u.y)
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
      markStageUndoApplied()
      ElMessage.success(list.length > 1 ? `已移动 ${list.length} 个图层` : '立绘位置已保存')
    } catch (e: any) {
      stageUndoStack.value.pop()
      console.error('保存立绘位置失败:', e)
      ElMessage.error('保存立绘位置失败: ' + (e.message || '未知错误'))
    }
  }

  // 属性条改缩放/透明度/旋转，写回同一条 avatar 指令
  const handleAvatarTransform = async ({ layerId, layerName, scale, opacity, rotate, x, y, reset }: any) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) {
      ElMessage.warning('请先保存当前台词，再调整立绘属性')
      return
    }
    const pid = Number(ctx.projectId.value)
    if (!pid) return
    const lid = layerId || 'center'
    const contentId = Number(dialogue.content_id)
    const clamp = (v: any, min: number, max: number) => Math.max(min, Math.min(max, Number(v)))
    const opRaw = opacity === undefined || opacity === null ? 1 : Number(opacity)
    const patch: any = {
      scale: clamp(Number.isFinite(Number(scale)) ? Number(scale) : 1, 0.2, 3),
      opacity: clamp(Number.isFinite(opRaw) ? opRaw : 1, 0, 1),
      rotate: clamp(Number.isFinite(Number(rotate)) ? Number(rotate) : 0, -45, 45)
    }
    const hideExists = ctx.previewDirectives.value.some(d =>
      d.directive_type === 'avatar' &&
      layerIdOf(d.payload || {}) === lid &&
      d.payload?.action === 'hide'
    )
    const existing = hideExists ? null : findAvatarDirective(lid)
    const clampXY = (v: any) => Math.max(0, Math.min(100, Number(v) || 0))
    if (reset) {
      // 多角色入场：自动挑一个没被占用的站位，避免新角色和已有立绘重叠
      patch.x = nextFreeStageX()
      patch.y = 100
    } else {
      if (x !== undefined && x !== null) patch.x = clampXY(x)
      if (y !== undefined && y !== null) patch.y = clampXY(y)
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
    snapshotStageDirectives()
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
      markStageUndoApplied()
      ElMessage.success('立绘属性已保存')
    } catch (e: any) {
      stageUndoStack.value.pop()
      console.error('保存立绘属性失败:', e)
      ElMessage.error('保存立绘属性失败: ' + (e.message || '未知错误'))
    }
  }

  // 新建一个立绘层：用当前说话角色创建一条 show 指令
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
    stageUndoStack,
    canUndoAvatar,
    recordStageUndo,
    snapshotStageDirectives,
    markStageUndoApplied,
    clearPersistedStageUndo,
    restorePersistedStageUndo,
    undoAvatar,
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
