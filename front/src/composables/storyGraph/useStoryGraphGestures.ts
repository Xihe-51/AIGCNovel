import { ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { CanvasPoint, GraphEdgeLike, GraphNodeLike, RenderEdge } from '@/utils/storyGraph'
import type { StoryGraphSelection } from '@/composables/storyGraph/useStoryGraphSelection'

export interface StoryGraphConnecting {
  from: GraphNodeLike
  x: number
  y: number
  hoverId: number | null
}

export interface UseStoryGraphGesturesOptions {
  nodes: Ref<GraphNodeLike[]>
  edges: Ref<GraphEdgeLike[]>
  displayNodes: Ref<GraphNodeLike[]>
  selection: StoryGraphSelection
  toCanvas: (clientX: number, clientY: number) => CanvasPoint
  hitTest: (point: CanvasPoint) => GraphNodeLike | null
  pan: Ref<CanvasPoint>
  selectEdge: (edge: GraphEdgeLike) => void
  pushHistory: () => void
  beginPendingHistory: () => void
  commitPendingHistory: () => void
  discardPendingHistory: () => void
  persistPositions: () => void
  markDirty: () => void
}

const DRAG_THRESHOLD = 2

/** 画布手势：平移、节点拖拽（含多选整组拖动）、连线拖拽 */
export function useStoryGraphGestures(options: UseStoryGraphGesturesOptions) {
  const { nodes, edges, displayNodes, selection, toCanvas, hitTest, pan } = options

  const connecting = ref<StoryGraphConnecting | null>(null)

  let dragGroup: Array<{ node: GraphNodeLike; startX: number; startY: number }> = []
  let dragStartPoint: CanvasPoint = { x: 0, y: 0 }
  let nodeMoved = false
  let panning = false
  let panStart: CanvasPoint = { x: 0, y: 0 }

  const onCanvasDown = (ev: MouseEvent) => {
    panning = true
    panStart = { x: ev.clientX - pan.value.x, y: ev.clientY - pan.value.y }
  }

  const onCanvasMove = (ev: MouseEvent) => {
    const point = toCanvas(ev.clientX, ev.clientY)
    if (connecting.value) {
      connecting.value.x = point.x
      connecting.value.y = point.y
      const hit = hitTest(point)
      connecting.value.hoverId = hit ? hit.content_id : null
      return
    }
    if (dragGroup.length) {
      const dx = point.x - dragStartPoint.x
      const dy = point.y - dragStartPoint.y
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) nodeMoved = true
      for (const item of dragGroup) {
        item.node._x = item.startX + dx
        item.node._y = item.startY + dy
      }
      return
    }
    if (panning) {
      pan.value = { x: ev.clientX - panStart.x, y: ev.clientY - panStart.y }
    }
  }

  const onCanvasUp = (ev: MouseEvent) => {
    if (connecting.value) finishConnect(ev)
    if (dragGroup.length && nodeMoved) {
      options.persistPositions()
      options.commitPendingHistory()
      selection.suppressNextClickOnce()
    } else {
      options.discardPendingHistory()
    }
    dragGroup = []
    nodeMoved = false
    panning = false
  }

  const onNodeDown = (ev: MouseEvent, node: GraphNodeLike) => {
    if (connecting.value) return
    // 多选交给 click 处理，避免 mousedown + click 各切换一次
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return
    // 已在多选组里的节点按下时保留整组，直接拖动整组
    if (!selection.isNodeSelected(node.content_id)) {
      selection.setNodeSelectedIds([node.content_id])
    }
    selection.selectPrimaryNode(node.content_id)
    options.beginPendingHistory()
    dragStartPoint = toCanvas(ev.clientX, ev.clientY)
    dragGroup = selection.selectedNodeIds.value
      .map(id => nodes.value.find(x => x.content_id === id))
      .filter((item): item is GraphNodeLike => !!item)
      .filter(node => displayNodes.value.some(d => d.content_id === node.content_id))
      .map(node => ({ node, startX: node._x || 0, startY: node._y || 0 }))
    nodeMoved = false
  }

  const startConnect = (ev: MouseEvent, node: GraphNodeLike) => {
    const point = toCanvas(ev.clientX, ev.clientY)
    connecting.value = { from: node, x: point.x, y: point.y, hoverId: null }
  }

  const finishConnect = (ev: MouseEvent) => {
    const current = connecting.value
    connecting.value = null
    if (!current) return
    const target = hitTest(toCanvas(ev.clientX, ev.clientY))
    if (!target) return
    if (target.content_id === current.from.content_id) {
      ElMessage.info('连线起点与终点不能相同')
      return
    }
    const duplicated = edges.value.some(
      e => e.source_content_id === current.from.content_id && e.target_content_id === target.content_id
    )
    if (duplicated) {
      ElMessage.info('这条分支已经存在')
      return
    }
    options.pushHistory()
    edges.value.push({
      path_id: undefined,
      source_content_id: current.from.content_id,
      target_content_id: target.content_id,
      choice_text: '',
      conditions: null,
    })
    options.markDirty()
    options.selectEdge(edges.value[edges.value.length - 1])
    ElMessage.success('已新建分支连线，别忘点「保存拓扑」')
  }

  const selectRenderEdge = (renderEdge: RenderEdge | null) => {
    if (!renderEdge || !renderEdge.edge) return
    options.selectEdge(renderEdge.edge)
  }

  return {
    connecting,
    onCanvasDown,
    onCanvasMove,
    onCanvasUp,
    onNodeDown,
    startConnect,
    finishConnect,
    selectRenderEdge,
  }
}

export type StoryGraphGestures = ReturnType<typeof useStoryGraphGestures>
