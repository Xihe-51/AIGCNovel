/**
 * 播放器云端存档：槽位列表、保存/读档/删除，云端失败时回退本地存档。
 *
 * 播放器状态通过 capture / apply 适配器注入，composable 只负责存档领域逻辑，
 * 不直接操作页面里的播放进度与舞台状态。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { confirmAction } from '@/utils/confirm'
import { listSaves, getSave, putSave, deleteSave } from '@/api/save'

export interface SaveSlotsContext {
  projectId: () => number
  /** 采集当前播放状态与存档摘要 */
  capture: () => { state: Record<string, any>; summary: string }
  /** 把存档状态写回播放器（含逐字恢复、音量应用） */
  apply: (state: Record<string, any>) => Promise<void> | void
  /** 云端保存失败时回退本地 */
  onCloudSaveFailed: () => void
  /** 云端读取失败时回退本地 */
  onCloudLoadFailed: () => void
  t: (key: string, params?: Record<string, any>) => string
}

export function useSaveSlots(ctx: SaveSlotsContext) {
  const saves = ref<any[]>([])
  const saveDialogVisible = ref(false)
  const isRestoring = ref(false)
  const loadingSaves = ref(false)

  const refreshSaves = async () => {
    loadingSaves.value = true
    try {
      saves.value = await listSaves(ctx.projectId())
    } catch (e) {
      console.warn('读取云端存档失败:', e)
    } finally {
      loadingSaves.value = false
    }
  }

  const openSaveDialog = () => {
    saveDialogVisible.value = true
    refreshSaves()
  }

  const saveToSlot = async (slot: number, silent = false) => {
    try {
      const { state, summary } = ctx.capture()
      const info = await putSave(ctx.projectId(), slot, state, summary)
      saves.value = [...saves.value.filter(s => s.slot !== slot), info]
        .sort((a, b) => a.slot - b.slot)
      if (!silent) {
        ElMessage.success(slot === 0 ? ctx.t('save.autoSaved') : ctx.t('save.saved'))
      }
    } catch (e) {
      console.warn('云端存档失败，回退到本地:', e)
      ctx.onCloudSaveFailed()
      if (!silent) ElMessage.warning(ctx.t('save.cloudSaveFailed'))
    }
  }

  const loadFromSlot = async (slot: number) => {
    try {
      isRestoring.value = true
      const detail = await getSave(ctx.projectId(), slot)
      await ctx.apply(detail.state || {})
      saveDialogVisible.value = false
      ElMessage.success(ctx.t('save.loaded'))
    } catch (e) {
      console.warn('读取云端存档失败，尝试本地:', e)
      ctx.onCloudLoadFailed()
      saveDialogVisible.value = false
    } finally {
      setTimeout(() => { isRestoring.value = false }, 300)
    }
  }

  const deleteSlot = async (slot: number) => {
    const confirmed = await confirmAction(ctx.t('save.deleteConfirm'), {
      title: ctx.t('save.deleteTitle'),
      confirmButtonText: ctx.t('save.delete'),
      cancelButtonText: ctx.t('common.cancel'),
    })
    if (!confirmed) return
    try {
      await deleteSave(ctx.projectId(), slot)
      saves.value = saves.value.filter(s => s.slot !== slot)
      ElMessage.success(ctx.t('save.deleted'))
    } catch (e) {
      console.warn('删除存档失败:', e)
      ElMessage.error(ctx.t('save.deleteFailed'))
    }
  }

  return {
    saves,
    saveDialogVisible,
    isRestoring,
    loadingSaves,
    refreshSaves,
    openSaveDialog,
    saveToSlot,
    loadFromSlot,
    deleteSlot,
  }
}
