import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useStoryGraphGestures } from '@/composables/storyGraph/useStoryGraphGestures'
import { useStoryGraphSelection } from '@/composables/storyGraph/useStoryGraphSelection'
import { NODE_H, NODE_W } from '@/utils/storyGraph'
import type { CanvasPoint, GraphEdgeLike, GraphNodeLike, RenderEdge } from '@/utils/storyGraph'

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

const infoMock = ElMessage.info as unknown as ReturnType<typeof vi.fn>
const successMock = ElMessage.success as unknown as ReturnType<typeof vi.fn>

function makeNode(contentId: number, x: number, y: number): GraphNodeLike {
  return { content_id: contentId, scene_id: 1, content_type: '台词', content_text: `第 ${contentId} 句`, _x: x, _y: y }
}

function mouse(x: number, y: number, mods: Partial<MouseEvent> = {}): MouseEvent {
  return { clientX: x, clientY: y, metaKey: false, ctrlKey: false, shiftKey: false, ...mods } as MouseEvent
}

function setup() {
  const nodes = ref<GraphNodeLike[]>([makeNode(1, 0, 0), makeNode(2, 300, 0)])
  const edges = ref<GraphEdgeLike[]>([])
  const displayNodes = ref<GraphNodeLike[]>(nodes.value)
  const pan = ref<CanvasPoint>({ x: 0, y: 0 })
  const selection = useStoryGraphSelection()

  const selectEdge = vi.fn()
  const pushHistory = vi.fn()
  const beginPendingHistory = vi.fn()
  const commitPendingHistory = vi.fn()
  const discardPendingHistory = vi.fn()
  const persistPositions = vi.fn()
  const markDirty = vi.fn()

  const hitTest = (point: CanvasPoint) => {
    for (let i = nodes.value.length - 1; i >= 0; i--) {
      const node = nodes.value[i]
      const x = node._x || 0
      const y = node._y || 0
      if (point.x >= x && point.x <= x + NODE_W && point.y >= y && point.y <= y + NODE_H) return node
    }
    return null
  }

  const gestures = useStoryGraphGestures({
    nodes,
    edges,
    displayNodes,
    selection,
    toCanvas: (clientX, clientY) => ({ x: clientX, y: clientY }),
    hitTest,
    pan,
    selectEdge,
    pushHistory,
    beginPendingHistory,
    commitPendingHistory,
    discardPendingHistory,
    persistPositions,
    markDirty,
  })

  return {
    gestures,
    nodes,
    edges,
    displayNodes,
    pan,
    selection,
    selectEdge,
    pushHistory,
    beginPendingHistory,
    commitPendingHistory,
    discardPendingHistory,
    persistPositions,
    markDirty,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useStoryGraphGestures / 画布平移', () => {
  it('按住空白处拖动会平移画布', () => {
    const { gestures, pan } = setup()
    gestures.onCanvasDown(mouse(50, 60))
    gestures.onCanvasMove(mouse(80, 90))
    expect(pan.value).toEqual({ x: 30, y: 30 })
  })

  it('存在临时连线时平移让位给连线跟随', () => {
    const { gestures, pan, nodes } = setup()
    gestures.startConnect(mouse(10, 10), nodes.value[0])
    gestures.onCanvasDown(mouse(50, 60))
    gestures.onCanvasMove(mouse(305, 20))
    expect(pan.value).toEqual({ x: 0, y: 0 })
    expect(gestures.connecting.value?.hoverId).toBe(2)
  })

  it('抬起后结束平移状态', () => {
    const { gestures, pan } = setup()
    gestures.onCanvasDown(mouse(50, 60))
    gestures.onCanvasMove(mouse(80, 90))
    gestures.onCanvasUp(mouse(80, 90))
    gestures.onCanvasMove(mouse(200, 200))
    expect(pan.value).toEqual({ x: 30, y: 30 })
  })
})

describe('useStoryGraphGestures / 节点拖拽', () => {
  it('拖动单个节点会带上位移', () => {
    const { gestures, nodes, beginPendingHistory, persistPositions, commitPendingHistory } = setup()
    gestures.onNodeDown(mouse(10, 10), nodes.value[0])
    gestures.onCanvasMove(mouse(60, 40))
    expect(nodes.value[0]._x).toBe(50)
    expect(nodes.value[0]._y).toBe(30)
    expect(beginPendingHistory).toHaveBeenCalledTimes(1)
    gestures.onCanvasUp(mouse(60, 40))
    expect(persistPositions).toHaveBeenCalledTimes(1)
    expect(commitPendingHistory).toHaveBeenCalledTimes(1)
  })

  it('多选组内的节点会让整组一起移动', () => {
    const { gestures, nodes, selection } = setup()
    selection.setNodeSelectedIds([1, 2])
    gestures.onNodeDown(mouse(310, 10), nodes.value[1])
    gestures.onCanvasMove(mouse(330, 50))
    expect(nodes.value[0]._x).toBe(20)
    expect(nodes.value[0]._y).toBe(40)
    expect(nodes.value[1]._x).toBe(320)
    expect(nodes.value[1]._y).toBe(40)
  })

  it('按下未选中的节点会重置为单选', () => {
    const { gestures, nodes, selection } = setup()
    selection.setNodeSelectedIds([2])
    selection.selectPrimaryNode(2)
    gestures.onNodeDown(mouse(10, 10), nodes.value[0])
    expect(selection.selectedNodeIds.value).toEqual([1])
    expect(selection.selectedNodeId.value).toBe(1)
  })

  it('位移未超过阈值时不记为拖动', () => {
    const { gestures, nodes, commitPendingHistory, discardPendingHistory, persistPositions } = setup()
    gestures.onNodeDown(mouse(10, 10), nodes.value[0])
    gestures.onCanvasMove(mouse(11, 11))
    gestures.onCanvasUp(mouse(11, 11))
    expect(nodes.value[0]._x).toBe(1)
    expect(persistPositions).not.toHaveBeenCalled()
    expect(commitPendingHistory).not.toHaveBeenCalled()
    expect(discardPendingHistory).toHaveBeenCalledTimes(1)
  })

  it('按住修饰键时把多选交给 click 处理，不启动拖拽', () => {
    const { gestures, nodes, beginPendingHistory, selection } = setup()
    gestures.onNodeDown(mouse(10, 10, { ctrlKey: true }), nodes.value[0])
    gestures.onCanvasMove(mouse(60, 60))
    expect(beginPendingHistory).not.toHaveBeenCalled()
    expect(nodes.value[0]._x).toBe(0)
    expect(selection.selectedNodeIds.value).toEqual([])
  })

  it('连线过程中忽略节点按下', () => {
    const { gestures, nodes, beginPendingHistory } = setup()
    gestures.startConnect(mouse(10, 10), nodes.value[0])
    gestures.onNodeDown(mouse(310, 10), nodes.value[1])
    expect(beginPendingHistory).not.toHaveBeenCalled()
  })

  it('只拖动当前筛选结果内的节点', () => {
    const { gestures, nodes, displayNodes } = setup()
    displayNodes.value = [nodes.value[0]]
    gestures.onNodeDown(mouse(310, 10), nodes.value[1])
    gestures.onCanvasMove(mouse(330, 50))
    expect(nodes.value[1]._x).toBe(300)
    expect(nodes.value[1]._y).toBe(0)
  })

  it('拖动结束后吞掉紧随的一次 click', () => {
    const { gestures, nodes, selection } = setup()
    gestures.onNodeDown(mouse(10, 10), nodes.value[0])
    gestures.onCanvasMove(mouse(60, 40))
    gestures.onCanvasUp(mouse(60, 40))
    selection.selectByEvent(nodes.value[1])
    expect(selection.selectedNodeIds.value).toEqual([1])
  })
})

describe('useStoryGraphGestures / 连线创建', () => {
  it('startConnect 记录起点与初始指针位置', () => {
    const { gestures, nodes } = setup()
    gestures.startConnect(mouse(40, 30), nodes.value[0])
    expect(gestures.connecting.value).toMatchObject({
      from: nodes.value[0],
      x: 40,
      y: 30,
      hoverId: null,
    })
  })

  it('起点终点相同会提示并且不建边', () => {
    const { gestures, nodes, edges, pushHistory } = setup()
    gestures.startConnect(mouse(10, 10), nodes.value[0])
    gestures.finishConnect(mouse(10, 10))
    expect(infoMock).toHaveBeenCalledWith('连线起点与终点不能相同')
    expect(edges.value).toHaveLength(0)
    expect(pushHistory).not.toHaveBeenCalled()
    expect(gestures.connecting.value).toBeNull()
  })

  it('重复的分支不会重复建边', () => {
    const { gestures, nodes, edges, pushHistory } = setup()
    edges.value.push({ path_id: 9, source_content_id: 1, target_content_id: 2, choice_text: '' })
    gestures.startConnect(mouse(10, 10), nodes.value[0])
    gestures.finishConnect(mouse(310, 10))
    expect(infoMock).toHaveBeenCalledWith('这条分支已经存在')
    expect(edges.value).toHaveLength(1)
    expect(pushHistory).not.toHaveBeenCalled()
  })

  it('落在空白处会静默结束', () => {
    const { gestures, nodes, edges, pushHistory } = setup()
    gestures.startConnect(mouse(10, 10), nodes.value[0])
    gestures.finishConnect(mouse(700, 500))
    expect(edges.value).toHaveLength(0)
    expect(pushHistory).not.toHaveBeenCalled()
    expect(infoMock).not.toHaveBeenCalled()
    expect(gestures.connecting.value).toBeNull()
  })

  it('命中目标节点时新建分支并选中它', () => {
    const { gestures, nodes, edges, pushHistory, markDirty, selectEdge } = setup()
    gestures.startConnect(mouse(10, 10), nodes.value[0])
    gestures.finishConnect(mouse(310, 10))
    expect(pushHistory).toHaveBeenCalledTimes(1)
    expect(edges.value).toHaveLength(1)
    expect(edges.value[0]).toMatchObject({
      path_id: undefined,
      source_content_id: 1,
      target_content_id: 2,
      choice_text: '',
      conditions: null,
    })
    expect(markDirty).toHaveBeenCalledTimes(1)
    expect(selectEdge).toHaveBeenCalledWith(edges.value[0])
    expect(successMock).toHaveBeenCalledTimes(1)
  })

  it('没有临时连线时 finishConnect 不做任何事', () => {
    const { gestures, edges, pushHistory } = setup()
    gestures.finishConnect(mouse(310, 10))
    expect(edges.value).toHaveLength(0)
    expect(pushHistory).not.toHaveBeenCalled()
  })
})

describe('useStoryGraphGestures / 连线选中', () => {
  const renderEdge = (edge: GraphEdgeLike | null): RenderEdge => ({
    key: 'k',
    kind: 'branch',
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    label: '',
    edge,
  })

  it('点击可编辑连线会选中对应分支', () => {
    const { gestures, selectEdge } = setup()
    const edge: GraphEdgeLike = { path_id: 3, source_content_id: 1, target_content_id: 2 }
    gestures.selectRenderEdge(renderEdge(edge))
    expect(selectEdge).toHaveBeenCalledWith(edge)
  })

  it('只读序列线或空值不会触发选中', () => {
    const { gestures, selectEdge } = setup()
    gestures.selectRenderEdge(null)
    gestures.selectRenderEdge(renderEdge(null))
    expect(selectEdge).not.toHaveBeenCalled()
  })
})
