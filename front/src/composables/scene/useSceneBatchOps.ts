/**
 * 场景左栏的批量操作：换背景/音乐、移动章节、复制、删除。
 *
 * 批量的“写库后刷新”统一走注入进来的 reload，避免 composable 关心左栏
 * 的加载态与初始场景选择；删除后还要重排剩余场景序号，这里一并处理。
 */
import { ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { confirmDanger } from '@/utils/confirm'
import {
  updateScene,
  deleteScene,
  duplicateScene,
  uploadSceneFile,
} from '@/api/scenes'
import type { Scene } from '@/api/scenes'
import { assignSceneChapter } from '@/api/chapter'
import { renumberScenes } from '@/utils/sceneList'
import { formatErrorMessage } from '@/utils/errorMessage'

export interface SceneBatchOpsContext {
  projectId: Ref<string | number>
  scenes: Ref<Scene[]>
  /** 已按 order_num 排好序的场景，用于删除后重排 */
  sortedScenes: Ref<Scene[]>
  /** 序号持久化进行中（左栏显示“保存中…”） */
  savingOrder: Ref<boolean>
  isActive: (sceneId: number) => boolean
  reloadScenes: () => Promise<void>
  reloadChapters: () => Promise<void>
  onDataChanged: () => void
  emitDeleted: (sceneId: string) => void
  emitSelect: (sceneId: string) => void
  /** 退出批量模式时清理拖拽态 */
  clearDragState: () => void
}

export function useSceneBatchOps(ctx: SceneBatchOpsContext) {
  const batchMode = ref(false)
  const selectedIds = ref<number[]>([])
  const batchBusy = ref(false)
  const assetDialog = ref(false)
  const assetKind = ref<'image' | 'audio'>('image')
  const assetFile = ref<File | null>(null)
  const moveDialog = ref(false)
  const moveChapter = ref('')

  const isChecked = (id: number) => selectedIds.value.includes(id)

  const toggleSelect = (id: number) => {
    const i = selectedIds.value.indexOf(id)
    if (i >= 0) selectedIds.value.splice(i, 1)
    else selectedIds.value.push(id)
  }

  const toggleBatch = () => {
    batchMode.value = !batchMode.value
    selectedIds.value = []
    ctx.clearDragState()
  }

  const toggleSelectAll = () => {
    selectedIds.value = selectedIds.value.length === ctx.scenes.value.length
      ? []
      : ctx.scenes.value.map(s => s.scene_id)
  }

  const openAsset = (kind: 'image' | 'audio') => {
    if (!selectedIds.value.length) return
    assetKind.value = kind
    assetFile.value = null
    assetDialog.value = true
  }

  const onFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement
    assetFile.value = input.files?.[0] || null
  }

  const applyAsset = async () => {
    const file = assetFile.value
    if (!file || !selectedIds.value.length || batchBusy.value) return
    batchBusy.value = true
    const ids = selectedIds.value.slice()
    const isImage = assetKind.value === 'image'
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('project_id', String(ctx.projectId.value))
      form.append('file_type', assetKind.value)
      const up = await uploadSceneFile(form)
      const url = up?.data?.url
      if (!url) throw new Error('上传未返回文件地址')
      await Promise.all(ids.map(id => updateScene(
        id,
        isImage ? { background_url: url } : { music_url: url }
      )))
      assetDialog.value = false
      selectedIds.value = []
      await ctx.reloadScenes()
      ctx.onDataChanged()
      ElMessage.success(`已更新 ${ids.length} 个场景的${isImage ? '背景' : '音乐'}`)
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('批量更新失败', e))
    } finally {
      batchBusy.value = false
    }
  }

  const clearMusic = async () => {
    if (!selectedIds.value.length || batchBusy.value) return
    batchBusy.value = true
    const ids = selectedIds.value.slice()
    try {
      await Promise.all(ids.map(id => updateScene(id, { music_url: '' })))
      assetDialog.value = false
      selectedIds.value = []
      await ctx.reloadScenes()
      ctx.onDataChanged()
      ElMessage.success(`已清空 ${ids.length} 个场景的音乐`)
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('清空音乐失败', e))
    } finally {
      batchBusy.value = false
    }
  }

  const openMove = async () => {
    if (!selectedIds.value.length) return
    await ctx.reloadChapters()
    moveChapter.value = ''
    moveDialog.value = true
  }

  const applyMove = async () => {
    if (!selectedIds.value.length || batchBusy.value) return
    batchBusy.value = true
    const ids = selectedIds.value.slice()
    const cid = moveChapter.value ? Number(moveChapter.value) : null
    try {
      await Promise.all(ids.map(id => assignSceneChapter(Number(ctx.projectId.value), id, cid)))
      moveDialog.value = false
      selectedIds.value = []
      await ctx.reloadChapters()
      ctx.onDataChanged()
      ElMessage.success(`已移动 ${ids.length} 个场景`)
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('移动失败', e))
    } finally {
      batchBusy.value = false
    }
  }

  const duplicate = async () => {
    if (!selectedIds.value.length || batchBusy.value) return
    batchBusy.value = true
    const ids = selectedIds.value.slice()
    try {
      for (const id of ids) await duplicateScene(id)
      selectedIds.value = []
      await ctx.reloadScenes()
      ctx.onDataChanged()
      ElMessage.success(`已复制 ${ids.length} 个场景`)
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('批量复制失败', e))
    } finally {
      batchBusy.value = false
    }
  }

  const remove = async () => {
    if (!selectedIds.value.length || batchBusy.value) return
    const ids = selectedIds.value.slice()
    const confirmed = await confirmDanger(
      `删除选中的 ${ids.length} 个场景？场景里的对话和分支会一起删除，无法撤销。`,
      { title: '批量删除场景' },
    )
    if (!confirmed) return
    batchBusy.value = true
    const wasActive = ids.some(id => ctx.isActive(id))
    try {
      for (const id of ids) await deleteScene(id)
      selectedIds.value = []
      await ctx.reloadScenes()
      ids.forEach(id => ctx.emitDeleted(String(id)))

      // 剩余场景重新连续编号
      const { list: rest, changed } = renumberScenes(ctx.sortedScenes.value)
      if (changed.length) {
        ctx.savingOrder.value = true
        Promise.all(changed.map(x => updateScene(x.scene_id, { order_num: x.order_num })))
          .catch(e => console.error('重排场景序号失败:', e))
          .finally(() => { ctx.savingOrder.value = false })
      }
      if (wasActive) ctx.emitSelect(rest.length ? String(rest[0].scene_id) : '')
      ctx.onDataChanged()
      ElMessage.success(`已删除 ${ids.length} 个场景`)
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('批量删除失败', e))
      await ctx.reloadScenes()
    } finally {
      batchBusy.value = false
    }
  }

  return {
    batchMode,
    selectedIds,
    batchBusy,
    assetDialog,
    assetKind,
    assetFile,
    moveDialog,
    moveChapter,
    isChecked,
    toggleSelect,
    toggleBatch,
    toggleSelectAll,
    openAsset,
    onFileChange,
    applyAsset,
    clearMusic,
    openMove,
    applyMove,
    duplicate,
    remove,
  }
}
