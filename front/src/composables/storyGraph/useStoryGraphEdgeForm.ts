import { nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { GraphEdgeLike, GraphNodeLike } from '@/utils/storyGraph'

export interface EdgeFormState {
  choice_text: string
  variable: string
  op: string
  value: number
}

export interface UseStoryGraphEdgeFormOptions {
  edges: Ref<GraphEdgeLike[]>
  selectedEdge: Ref<GraphEdgeLike | null>
  pushHistory: () => void
  markDirty: () => void
  clearNodeSelection: () => void
  openPanel: () => void
  closePanel: () => void
}

const emptyEdgeForm = (): EdgeFormState => ({ choice_text: '', variable: '', op: '>=', value: 0 })

/** 多条件组（AND/OR）在剧情树里只读，避免保存时被压成单条件 */
export const isConditionGroupLocked = (conditions: any) => !!(conditions && Array.isArray(conditions.items))

export function useStoryGraphEdgeForm(options: UseStoryGraphEdgeFormOptions) {
  const { edges, selectedEdge, pushHistory, markDirty, clearNodeSelection, openPanel, closePanel } = options

  const edgeForm = ref<EdgeFormState>(emptyEdgeForm())
  const edgeGroupLock = ref(false)

  let formSyncing = false
  let edgeEditHistoryTaken = false

  const selectEdge = (edge: GraphEdgeLike | null) => {
    if (!edge) return
    selectedEdge.value = edge
    clearNodeSelection()
    openPanel()
    edgeEditHistoryTaken = false
    formSyncing = true
    edgeGroupLock.value = isConditionGroupLocked(edge.conditions)
    const cond: any = edge.conditions
    edgeForm.value = {
      choice_text: edge.choice_text || '',
      variable: cond && cond.variable ? cond.variable : '',
      op: cond && cond.op ? cond.op : '>=',
      value: Number(cond && cond.value != null ? cond.value : 0),
    }
    nextTick(() => {
      formSyncing = false
    })
  }

  watch(
    edgeForm,
    () => {
      if (formSyncing) return
      const edge = selectedEdge.value
      if (!edge) return
      // 每条连线只记录一次编辑前快照，避免打字时塞满撤销栈
      if (!edgeEditHistoryTaken) {
        pushHistory()
        edgeEditHistoryTaken = true
      }
      edge.choice_text = edgeForm.value.choice_text
      if (edgeGroupLock.value) {
        markDirty()
        return
      }
      edge.conditions = edgeForm.value.variable
        ? { variable: edgeForm.value.variable, op: edgeForm.value.op, value: Number(edgeForm.value.value) || 0 }
        : null
      markDirty()
    },
    { deep: true }
  )

  const deleteEdge = (edge: GraphEdgeLike) => {
    const idx = edges.value.indexOf(edge)
    if (idx >= 0) {
      pushHistory()
      edges.value.splice(idx, 1)
    }
    selectedEdge.value = null
    closePanel()
    markDirty()
  }

  const deleteNodeEdges = (node: GraphNodeLike) => {
    const next = edges.value.filter(e => e.source_content_id !== node.content_id)
    if (next.length !== edges.value.length) {
      pushHistory()
      edges.value = next
      markDirty()
      ElMessage.success('已移除该节点的全部出边（保存后生效）')
    }
  }

  return {
    edgeForm,
    edgeGroupLock,
    selectEdge,
    deleteEdge,
    deleteNodeEdges,
  }
}
