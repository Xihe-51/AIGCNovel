/**
 * 场景台词的多选与批量操作（批量删除 / 批量复制）。
 *
 * 选中下标是批量配音、配音导演等多个功能的共享状态，集中在这里；
 * 历史栈与脏标记通过回调注入，composable 不直接依赖编辑器的撤销实现。
 */
import { ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteDialogue as apiDeleteDialogue } from '@/api/dialogue'

export interface SceneSelectionContext {
  dialogues: Ref<any[]>
  /** 当前是否有未保存改动 */
  getDirty: () => boolean
  /** 记录一条撤销历史 */
  pushHistory: () => void
  /** 清空撤销/重做栈（服务端已删除的节点无法靠本地撤销恢复） */
  clearHistory: () => void
  markDirty: () => void
  clearDraft: () => void
  /** 从项目节点列表里移除某条台词 */
  dropProjectNode: (contentId: number) => void
}

export function useSceneSelection(ctx: SceneSelectionContext) {
  const selectedIndexes = ref<number[]>([])

  const isSelected = (i: number) => selectedIndexes.value.includes(i)

  const toggleSelect = (i: number) => {
    const pos = selectedIndexes.value.indexOf(i)
    if (pos >= 0) selectedIndexes.value.splice(pos, 1)
    else selectedIndexes.value.push(i)
  }

  const clearSelection = () => { selectedIndexes.value = [] }

  const batchDelete = async () => {
    const indexes = [...selectedIndexes.value].sort((a, b) => b - a)
    if (!indexes.length) return
    try {
      await ElMessageBox.confirm(
        `删除选中的 ${indexes.length} 条台词会同时删除它们的分支、数值变化、演出指令、结局与已读记录，且无法撤销。确定删除？`,
        '批量删除',
        {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
    } catch (e) {
      return
    }
    const hadUnsaved = ctx.getDirty()
    for (const i of indexes) {
      const d = ctx.dialogues.value[i]
      if (!d) continue
      if (d.content_id) {
        try { await apiDeleteDialogue(d.content_id) } catch (e) {
          console.error('批量删除失败:', e)
          ElMessage.error('删除失败，已中止')
          break
        }
        ctx.dropProjectNode(d.content_id)
      }
      ctx.dialogues.value.splice(i, 1)
    }
    clearSelection()
    ctx.dialogues.value.forEach((d: any, i: number) => d.order_num = i + 1)
    // 服务端已删除的节点不能靠本地撤销恢复，清空快照避免"幽灵节点"
    ctx.clearHistory()
    if (hadUnsaved) ctx.markDirty()
    else ctx.clearDraft()
    ElMessage.success('已删除选中对话（不可撤销）')
  }

  const batchDuplicate = () => {
    const indexes = [...selectedIndexes.value].sort((a, b) => a - b)
    if (!indexes.length) return
    ctx.pushHistory()
    const clones = indexes.map(i => {
      const d = ctx.dialogues.value[i]
      const copy = JSON.parse(JSON.stringify(d))
      delete copy.content_id
      copy.voice_url = ''
      copy.order_num = 0
      return copy
    })
    const insertAt = indexes[indexes.length - 1] + 1
    ctx.dialogues.value.splice(insertAt, 0, ...clones)
    ctx.dialogues.value.forEach((d: any, i: number) => d.order_num = i + 1)
    clearSelection()
    ctx.markDirty()
    ElMessage.success(`已复制 ${clones.length} 条，记得保存`)
  }

  return {
    selectedIndexes,
    isSelected,
    toggleSelect,
    clearSelection,
    batchDelete,
    batchDuplicate,
  }
}
