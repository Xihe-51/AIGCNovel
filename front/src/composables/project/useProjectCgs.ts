import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createCG, deleteCG, listCGs, updateCG } from '@/api/cg'
import type { CGPayload, ProjectCG } from '@/api/cg'
import { extractErrorMessage } from '@/utils/errorMessage'

/** 解锁条件文案：绑定结局时写明结局名，否则初始可见 */
export function describeCgUnlock(
  cg: Pick<ProjectCG, 'unlock_ending_id' | 'unlock_ending_title'> | null | undefined,
): string {
  if (!cg?.unlock_ending_id) return '初始可见'
  return `达成结局「${cg.unlock_ending_title || `#${cg.unlock_ending_id}`}」`
}

export interface ProjectCgsContext {
  projectId: () => number
  /** 打开 CG 弹窗前刷新结局，弹窗的「解锁条件」下拉依赖它 */
  ensureEndings: () => Promise<void> | void
}

export function useProjectCgs(ctx: ProjectCgsContext) {
  const cgs = ref<ProjectCG[]>([])
  const cgDialogVisible = ref(false)
  const editingCGId = ref<number | null>(null)
  const cgSaving = ref(false)
  /** 交给 CG 弹窗的初始行；null 表示新建 */
  const cgInitial = ref<ProjectCG | null>(null)

  const fetchCGs = async () => {
    try {
      cgs.value = await listCGs(ctx.projectId())
    } catch (e) {
      console.warn('读取 CG 失败:', e)
      cgs.value = []
    }
  }

  const openCreateCG = async () => {
    editingCGId.value = null
    cgInitial.value = null
    await ctx.ensureEndings()
    cgDialogVisible.value = true
  }

  const openEditCG = async (row: ProjectCG) => {
    editingCGId.value = row.cg_id
    await ctx.ensureEndings()
    cgInitial.value = row
    cgDialogVisible.value = true
  }

  /** CG 弹窗自己处理上传与市场选图，这里只负责落库与刷新 */
  const handleSaveCG = async ({ cgId, payload }: { cgId: number | null; payload: CGPayload }) => {
    cgSaving.value = true
    try {
      if (cgId) {
        await updateCG(ctx.projectId(), cgId, payload)
        ElMessage.success('CG 已更新')
      } else {
        await createCG(ctx.projectId(), payload)
        ElMessage.success('CG 已添加')
      }
      cgDialogVisible.value = false
      await fetchCGs()
    } catch (e: any) {
      ElMessage.error(extractErrorMessage(e, '保存 CG 失败'))
    } finally {
      cgSaving.value = false
    }
  }

  const removeCG = async (row: ProjectCG) => {
    try {
      await ElMessageBox.confirm(`删除 CG「${row.title}」？`, '删除 CG', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      })
      await deleteCG(ctx.projectId(), row.cg_id)
      ElMessage.success('CG 已删除')
      await fetchCGs()
    } catch (e) {
      // 取消
    }
  }

  return {
    cgs,
    cgDialogVisible,
    editingCGId,
    cgSaving,
    cgInitial,
    describeCgUnlock,
    fetchCGs,
    openCreateCG,
    openEditCG,
    handleSaveCG,
    removeCG,
  }
}
