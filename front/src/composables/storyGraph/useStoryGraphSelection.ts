import { ref } from 'vue'
import type { GraphEdgeLike, GraphNodeLike } from '@/utils/storyGraph'

export type StoryGraphPanelMode = 'node' | 'edge' | 'none'

/** 选中态与右侧面板模式：纯状态机，不碰数据与视图变换 */
export function useStoryGraphSelection() {
  const selectedNodeId = ref<number | null>(null)
  const selectedNodeIds = ref<number[]>([])
  const selectedEdge = ref<GraphEdgeLike | null>(null)
  const panelMode = ref<StoryGraphPanelMode>('none')

  let suppressNextClick = false

  const isNodeSelected = (contentId: number) => selectedNodeIds.value.includes(contentId)

  const toggleNodeSelection = (contentId: number) => {
    if (isNodeSelected(contentId)) {
      selectedNodeIds.value = selectedNodeIds.value.filter(id => id !== contentId)
    } else {
      selectedNodeIds.value = [...selectedNodeIds.value, contentId]
    }
  }

  const setNodeSelectedIds = (ids: number[]) => {
    selectedNodeIds.value = ids
  }

  const clearNodeSelection = () => {
    selectedNodeId.value = null
    selectedNodeIds.value = []
  }

  /** 把某节点设为「主选中」并切到节点面板 */
  const selectPrimaryNode = (contentId: number) => {
    selectedNodeId.value = contentId
    selectedEdge.value = null
    panelMode.value = 'node'
  }

  const openPanel = () => {
    panelMode.value = 'edge'
  }

  const closePanel = () => {
    panelMode.value = 'none'
  }

  const clearSelection = () => {
    clearNodeSelection()
    selectedEdge.value = null
    panelMode.value = 'none'
  }

  /** 拖拽结束会紧跟一次 click，忽略它以免把多选塌缩成单选 */
  const suppressNextClickOnce = () => {
    suppressNextClick = true
    setTimeout(() => {
      suppressNextClick = false
    }, 0)
  }

  const selectByEvent = (node: GraphNodeLike, ev?: MouseEvent | KeyboardEvent) => {
    if (suppressNextClick) {
      suppressNextClick = false
      return
    }
    const additive = !!(ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey))
    if (additive) {
      toggleNodeSelection(node.content_id)
      selectedNodeId.value = isNodeSelected(node.content_id) ? node.content_id : (selectedNodeIds.value[0] ?? null)
      selectedEdge.value = null
      panelMode.value = selectedNodeId.value ? 'node' : 'none'
      return
    }
    selectedNodeIds.value = [node.content_id]
    selectPrimaryNode(node.content_id)
  }

  return {
    selectedNodeId,
    selectedNodeIds,
    selectedEdge,
    panelMode,
    isNodeSelected,
    toggleNodeSelection,
    setNodeSelectedIds,
    clearNodeSelection,
    selectPrimaryNode,
    openPanel,
    closePanel,
    clearSelection,
    suppressNextClickOnce,
    selectByEvent,
  }
}

export type StoryGraphSelection = ReturnType<typeof useStoryGraphSelection>
