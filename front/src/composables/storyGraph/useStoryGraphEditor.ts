import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { batchSaveBranches, getStoryGraph } from '@/api/branch'
import { listVariables } from '@/api/variable'
import { createProjectVersion } from '@/api/version'
import { useStoryGraphEdgeForm } from '@/composables/storyGraph/useStoryGraphEdgeForm'
import { useStoryGraphGestures } from '@/composables/storyGraph/useStoryGraphGestures'
import { useStoryGraphSelection } from '@/composables/storyGraph/useStoryGraphSelection'
import { useStoryGraphTopology } from '@/composables/storyGraph/useStoryGraphTopology'
import { useStoryGraphViewport } from '@/composables/storyGraph/useStoryGraphViewport'
import type { GraphEdgeLike, GraphNodeLike } from '@/utils/storyGraph'
import {
  NODE_H,
  NODE_W,
  applyNodePositions,
  applyStoredPositions,
  buildRenderEdges,
  buildSceneOptions,
  canvasExtent,
  computeAutoLayoutPositions,
  countVisibleEdges,
  labelOfNode,
  parseStoredPositions,
  serializeNodePositions,
} from '@/utils/storyGraph'

export interface UseStoryGraphEditorOptions {
  projectId: () => number
  focusContentId: () => number | null | undefined
  rootRef: Ref<HTMLElement | null>
  getCanvasRect: () => { left: number; top: number } | null
  getViewportSize: () => { width: number; height: number }
  locate: (sceneId: number, contentId: number | null) => void
}

const isEditableTarget = (target: any) => {
  const tag = target && target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(target && target.isContentEditable)
}

/** 剧情图编辑器的装配层：数据、派生视图、手势与快捷键 */
export function useStoryGraphEditor(options: UseStoryGraphEditorOptions) {
  const nodes = ref<GraphNodeLike[]>([])
  const edges = ref<GraphEdgeLike[]>([])
  const variables = ref<any[]>([])
  // 大项目按场景筛选：只渲染当前场景的节点与场景内连线
  const sceneFilter = ref<number | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const dirty = ref(false)

  const selection = useStoryGraphSelection()

  const sceneOptions = computed(() => buildSceneOptions(nodes.value))

  const displayNodes = computed(() => {
    if (!sceneFilter.value) return nodes.value
    const sid = Number(sceneFilter.value)
    return nodes.value.filter(n => Number(n.scene_id) === sid)
  })

  const displayEdgeCount = computed(() =>
    countVisibleEdges(displayNodes.value, edges.value, !!sceneFilter.value)
  )

  const sceneCount = computed(() => {
    const seen = new Set<number>()
    for (const node of nodes.value) seen.add(node.scene_id)
    return seen.size
  })

  const selectedNode = computed(() =>
    selection.selectedNodeId.value == null
      ? null
      : nodes.value.find(n => n.content_id === selection.selectedNodeId.value) || null
  )

  const nodeOutEdges = computed(() =>
    selection.selectedNodeId.value == null
      ? []
      : edges.value.filter(e => e.source_content_id === selection.selectedNodeId.value)
  )

  const sourceNotChoice = computed(() => {
    const edge = selection.selectedEdge.value
    if (!edge) return false
    const node = nodes.value.find(x => x.content_id === edge.source_content_id)
    return !!node && node.content_type !== '选择'
  })

  const renderEdges = computed(() => buildRenderEdges(displayNodes.value, edges.value))
  const canvasSize = computed(() => canvasExtent(displayNodes.value))

  // ==================== 节点位置记忆 ====================

  const posKey = computed(() => `aigcn.storyGraph.${options.projectId()}`)

  /** 本地记忆的节点位置：读取失败（隐私模式/坏数据）时回落到自动布局 */
  const restoreStoredPositions = () => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(posKey.value)
    } catch (e) {
      raw = null
    }
    applyStoredPositions(nodes.value, parseStoredPositions(raw))
  }

  const persistPositions = () => {
    try {
      localStorage.setItem(posKey.value, JSON.stringify(serializeNodePositions(nodes.value)))
    } catch (e) {
      /* 隐私模式等忽略 */
    }
  }

  const computeAutoLayout = () => {
    applyNodePositions(nodes.value, computeAutoLayoutPositions(nodes.value))
  }

  const markDirty = () => {
    dirty.value = true
  }

  // ==================== 撤销 / 重做 ====================

  const topology = useStoryGraphTopology({
    nodes,
    edges,
    persistPositions,
    clearSelection: selection.clearSelection,
    markDirty,
  })

  const {
    history,
    future,
    clipboardBranches,
    pushHistory,
    beginPendingHistory,
    commitPendingHistory,
    discardPendingHistory,
    undoTopology,
    redoTopology,
    resetHistory,
  } = topology

  // ==================== 连线表单 ====================

  const { edgeForm, edgeGroupLock, selectEdge, deleteEdge, deleteNodeEdges } = useStoryGraphEdgeForm({
    edges,
    selectedEdge: selection.selectedEdge,
    pushHistory,
    markDirty,
    clearNodeSelection: selection.clearNodeSelection,
    openPanel: selection.openPanel,
    closePanel: selection.closePanel,
  })

  // ==================== 视图变换 ====================

  const viewport = useStoryGraphViewport({
    getCanvasRect: options.getCanvasRect,
    getViewportSize: options.getViewportSize,
    getFitNodes: () => displayNodes.value,
    getHitNodes: () => nodes.value,
  })

  // ==================== 画布手势 ====================

  const gestures = useStoryGraphGestures({
    nodes,
    edges,
    displayNodes,
    selection,
    toCanvas: viewport.toCanvas,
    hitTest: viewport.hitTest,
    pan: viewport.pan,
    selectEdge,
    pushHistory,
    beginPendingHistory,
    commitPendingHistory,
    discardPendingHistory,
    persistPositions,
    markDirty,
  })

  // ==================== 渲染辅助 ====================

  const nodeLabel = (contentId: number) => labelOfNode(nodes.value, contentId)

  /** 临时连线起点：从节点卡片右侧中点出发 */
  const connectFrom = computed(() => {
    const from = gestures.connecting.value?.from
    if (!from) return { x: 0, y: 0 }
    return { x: (from._x || 0) + NODE_W, y: (from._y || 0) + NODE_H / 2 }
  })

  // ==================== 布局动作 ====================

  const autoLayout = () => {
    pushHistory()
    computeAutoLayout()
    persistPositions()
    viewport.resetView()
    ElMessage.success('已按场景重新排布')
  }

  /** 选中并居中某个节点（从脚本页跳转过来时用） */
  const focusNode = (contentId: number | null | undefined) => {
    if (contentId == null) return
    const node = nodes.value.find(x => Number(x.content_id) === Number(contentId))
    if (!node) return
    // 定位前清掉场景筛选，避免目标节点被过滤掉
    sceneFilter.value = null
    selection.setNodeSelectedIds([node.content_id])
    selection.selectPrimaryNode(node.content_id)
    viewport.centerOn({
      x: (node._x || 0) + NODE_W / 2,
      y: (node._y || 0) + NODE_H / 2,
    })
  }

  watch(
    () => options.focusContentId(),
    (value) => {
      if (value == null) return
      nextTick(() => setTimeout(() => focusNode(value), 0))
    }
  )

  // ==================== 分支复制 / 粘贴 ====================

  const copyBranches = () => topology.copyBranches(selection.selectedEdge.value, selection.selectedNodeIds.value)

  const pasteBranches = () => topology.pasteBranches(selection.selectedNodeId.value)

  const setSceneFilter = (value: number | null) => {
    sceneFilter.value = value
  }

  // ==================== 节点动作 ====================

  /** 优先脚本中定位：切回脚本页并滚动到对应台词 */
  const locateInScript = (node: GraphNodeLike | null) => {
    if (!node) return
    options.locate(Number(node.scene_id), Number(node.content_id))
  }

  /** 调试器：从指定节点开始试玩（新窗口，带 debug=1） */
  const playFromNode = (node: GraphNodeLike | null) => {
    if (!node || !node.content_id) return
    window.open(`/view/${options.projectId()}?debug=1&start=${node.content_id}`, '_blank')
  }

  // ==================== 数据 ====================

  const reload = async () => {
    loading.value = true
    try {
      const [graph, vars] = await Promise.all([
        getStoryGraph(options.projectId()),
        listVariables(options.projectId()).catch(() => []),
      ])
      nodes.value = ((graph as any)?.nodes || []).map((n: any) => ({ ...n }))
      edges.value = ((graph as any)?.edges || []).map((e: any) => ({ ...e }))
      computeAutoLayout()
      restoreStoredPositions()
      variables.value = (vars as any[]) || []
      selection.clearSelection()
      resetHistory()
      dirty.value = false
      if (options.focusContentId() != null) {
        nextTick(() => setTimeout(() => focusNode(options.focusContentId()), 0))
      }
    } catch (e) {
      ElMessage.error('加载剧情节点失败')
      nodes.value = []
      edges.value = []
    } finally {
      loading.value = false
    }
  }

  const saveTopology = async () => {
    saving.value = true
    try {
      await batchSaveBranches(
        options.projectId(),
        edges.value.map(e => ({
          source_content_id: e.source_content_id,
          target_content_id: e.target_content_id,
          choice_text: e.choice_text || '',
          image_url: e.image_url || null,
          conditions: e.conditions || null,
        })),
        true
      )
      ElMessage.success('拓扑已保存')
      createProjectVersion(options.projectId(), '保存剧情图').catch(() => {})
      dirty.value = false
      await reload()
    } catch (e: any) {
      ElMessage.error((e && e.response && e.response.data && e.response.data.message) || '保存失败')
    } finally {
      saving.value = false
    }
  }

  // ==================== 键盘快捷键 ====================

  const onKeyDown = (ev: KeyboardEvent) => {
    // 剧情图在创作页靠 v-show 常驻：切到脚本页时监听仍在，必须按可见性拦截，
    // 否则脚本页按 Ctrl+Z / Ctrl+C 会误触剧情图的撤销与复制。
    const el = options.rootRef.value
    if (!el || el.offsetParent === null) return
    if (isEditableTarget(ev.target)) return
    if (!(ev.ctrlKey || ev.metaKey)) return
    const key = ev.key.toLowerCase()
    if (key === 'z') {
      ev.preventDefault()
      if (ev.shiftKey) redoTopology()
      else undoTopology()
    } else if (key === 'y') {
      ev.preventDefault()
      redoTopology()
    } else if (key === 'c') {
      ev.preventDefault()
      copyBranches()
    } else if (key === 'v') {
      ev.preventDefault()
      pasteBranches()
    }
  }

  onMounted(() => {
    reload()
    window.addEventListener('keydown', onKeyDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
  })

  return {
    nodes,
    edges,
    variables,
    sceneFilter,
    setSceneFilter,
    sceneOptions,
    displayNodes,
    displayEdgeCount,
    sceneCount,
    selectedNode,
    nodeOutEdges,
    sourceNotChoice,
    renderEdges,
    canvasSize,
    connectFrom,
    nodeLabel,
    loading,
    saving,
    dirty,
    selectedNodeId: selection.selectedNodeId,
    selectedNodeIds: selection.selectedNodeIds,
    selectedEdge: selection.selectedEdge,
    panelMode: selection.panelMode,
    isNodeSelected: selection.isNodeSelected,
    selectByEvent: selection.selectByEvent,
    closePanel: selection.closePanel,
    history,
    future,
    clipboardBranches,
    edgeForm,
    edgeGroupLock,
    scale: viewport.scale,
    innerStyle: viewport.innerStyle,
    zoom: viewport.zoom,
    onWheel: viewport.onWheel,
    zoomToFit: viewport.zoomToFit,
    resetView: viewport.resetView,
    connecting: gestures.connecting,
    onCanvasDown: gestures.onCanvasDown,
    onCanvasMove: gestures.onCanvasMove,
    onCanvasUp: gestures.onCanvasUp,
    onNodeDown: gestures.onNodeDown,
    startConnect: gestures.startConnect,
    selectRenderEdge: gestures.selectRenderEdge,
    autoLayout,
    undoTopology,
    redoTopology,
    copyBranches,
    pasteBranches,
    selectEdge,
    deleteEdge,
    deleteNodeEdges,
    locateInScript,
    playFromNode,
    reload,
    saveTopology,
  }
}

export type StoryGraphEditorController = ReturnType<typeof useStoryGraphEditor>
