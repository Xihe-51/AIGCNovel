<template>
  <div ref="rootRef" class="sge-root">
    <!-- 工具栏 -->
    <div class="sge-toolbar">
      <div class="sge-info">
        节点级剧情图 · <b>{{ displayNodes.length }}</b>
        <span v-if="sceneFilter" class="sge-filter-total">/ {{ nodes.length }}</span>
        个剧情节点 · <b>{{ displayEdgeCount }}</b> 条分支
        <span v-if="dirty" class="sge-dirty">（有未保存改动）</span>
      </div>
      <div class="sge-tools">
        <el-select
          v-model="sceneFilter"
          size="small"
          clearable
          placeholder="全部场景"
          class="sge-scene-filter"
          :teleported="false"
        >
          <el-option
            v-for="s in sceneOptions"
            :key="s.scene_id"
            :label="`${s.order}. ${s.title}`"
            :value="s.scene_id"
          />
        </el-select>
        <button class="sge-btn" @click="autoLayout">自动布局</button>
        <button class="sge-btn" :disabled="!history.length" title="撤销上一步拓扑/位置调整（Ctrl+Z）" @click="undoTopology">撤销</button>
        <button class="sge-btn" :disabled="!future.length" title="重做（Ctrl+Shift+Z）" @click="redoTopology">重做</button>
        <button class="sge-btn" title="把全部节点缩放平移到可视区域" @click="zoomToFit">适配视图</button>
        <button
          class="sge-btn"
          :disabled="!selectedEdge && !selectedNodeIds.length"
          title="复制选中连线；或复制选中节点的全部出边（Ctrl+C）"
          @click="copyBranches"
        >复制分支</button>
        <button
          class="sge-btn"
          :disabled="!clipboardBranches.length || !selectedNodeId"
          title="把复制的分支挂到当前选中节点（Ctrl+V）"
          @click="pasteBranches"
        >粘贴到节点</button>
        <button class="sge-btn" @click="zoom(-0.1)">－</button>
        <span class="sge-zoom">{{ Math.round(scale * 100) }}%</span>
        <button class="sge-btn" @click="zoom(0.1)">＋</button>
        <button class="sge-btn" @click="resetView">重置视图</button>
        <button class="sge-btn" @click="reload">刷新</button>
        <button class="sge-btn primary" :disabled="!dirty || saving" @click="saveTopology">
          {{ saving ? '保存中…' : '保存拓扑' }}
        </button>
      </div>
    </div>

    <div class="sge-body">
      <!-- 画布 -->
      <div
        ref="canvasRef"
        class="sge-canvas"
        @wheel.prevent="onWheel"
        @mousedown="onCanvasDown"
        @mousemove="onCanvasMove"
        @mouseup="onCanvasUp"
        @mouseleave="onCanvasUp"
      >
        <div v-if="loading" class="sge-status">正在加载剧情节点…</div>
        <div v-else-if="!nodes.length" class="sge-status">
          该项目还没有剧情节点，请先在「场景编辑」中创建内容后再打开本编辑器。
        </div>

        <div v-else class="sge-inner" :style="innerStyle">
          <svg class="sge-svg" :width="canvasSize.width" :height="canvasSize.height">
            <g v-for="e in renderEdges" :key="e.key">
              <line
                class="sge-edge-hit"
                :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
                @click.stop="selectRenderEdge(e)"
              />
              <line
                :class="['sge-edge', e.kind]"
                :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
                :stroke-dasharray="e.kind === 'sequence' ? '6 4' : ''"
                :marker-end="e.kind === 'branch' ? 'url(#sge-arrow)' : 'url(#sge-arrow-seq)'"
              />
              <text
                v-if="e.label"
                :x="(e.x1 + e.x2) / 2" :y="(e.y1 + e.y2) / 2 - 6"
                text-anchor="middle" font-size="11"
                :fill="e.kind === 'branch' ? '#c81f4a' : '#94a3b8'"
              >{{ e.label }}</text>
            </g>

            <line
              v-if="connecting"
              class="sge-edge connect-temp"
              :x1="connectFrom.x" :y1="connectFrom.y"
              :x2="connecting.x" :y2="connecting.y"
              marker-end="url(#sge-arrow)"
            />

            <defs>
              <marker id="sge-arrow" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 9 3.5, 0 7" fill="#ff8fab" />
              </marker>
              <marker id="sge-arrow-seq" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 9 3.5, 0 7" fill="#cbd5e1" />
              </marker>
            </defs>
          </svg>

          <div
            v-for="n in displayNodes"
            :key="n.content_id"
            class="sge-node"
            role="button"
            tabindex="0"
            :aria-label="`节点 #${n.content_id}`"
            :class="[nodeToneClass(n.content_type), {
              selected: isNodeSelected(n.content_id),
              primary: selectedNodeId === n.content_id,
              hovered: connecting && connecting.hoverId === n.content_id,
            }]"
            :style="{ left: n._x + 'px', top: n._y + 'px', width: NODE_W + 'px' }"
            @mousedown.stop="onNodeDown($event, n)"
            @click.stop="selectNode(n, $event)"
            @keydown.enter.prevent="selectNode(n, $event)"
            @keydown.space.prevent="selectNode(n, $event)"
          >
            <div class="sge-node-head">
              <span class="sge-node-type">{{ n.content_type }}</span>
              <span class="sge-node-id">#{{ n.content_id }}</span>
            </div>
            <div class="sge-node-text">{{ snippetText(n.content_text) }}</div>
            <div class="sge-node-meta">{{ n.scene_title }}</div>
            <span
              class="sge-handle"
              title="按住并拖到另一个节点，即可建立分支连线"
              @mousedown.stop.prevent="startConnect($event, n)"
            ></span>
          </div>
        </div>
      </div>

      <!-- 属性 / 编辑面板 -->
      <div class="sge-panel">
        <template v-if="panelMode === 'edge' && selectedEdge">
          <h4 class="sge-panel-title">分支连线</h4>
          <div class="sge-field">
            <label>起点</label>
            <div class="sge-read">{{ nodeLabel(selectedEdge.source_content_id) }}</div>
          </div>
          <div class="sge-field">
            <label>终点</label>
            <div class="sge-read">{{ nodeLabel(selectedEdge.target_content_id) }}</div>
          </div>
          <div class="sge-field">
            <label>选项文案</label>
            <el-input v-model="edgeForm.choice_text" size="small" placeholder="玩家看到的选项文字（可空）" />
          </div>
          <div class="sge-field">
            <label>显示条件</label>
            <div v-if="edgeGroupLock" class="sge-read" style="margin-bottom: 6px">
              该连线使用多条件组（{{ selectedEdge.conditions.mode === 'or' ? '任一满足' : '全部满足' }}，{{ (selectedEdge.conditions.items || []).length }} 条）
              —— 请到场景编辑器的「选择项」里修改
            </div>
            <el-select
              v-model="edgeForm.variable"
              size="small"
              clearable
              placeholder="无条件（始终显示）"
              :disabled="edgeGroupLock"
              style="width: 100%"
            >
              <el-option v-for="v in variables" :key="v.variable_id" :label="v.label" :value="v.name" />
            </el-select>
          </div>
          <div v-if="edgeForm.variable" class="sge-cond-row">
            <el-select v-model="edgeForm.op" size="small" style="width: 78px">
              <el-option label="≥" value=">=" />
              <el-option label=">" value=">" />
              <el-option label="≤" value="<=" />
              <el-option label="<" value="<" />
              <el-option label="=" value="==" />
              <el-option label="≠" value="!=" />
            </el-select>
            <el-input-number v-model="edgeForm.value" size="small" :step="1" :controls="false" style="width: 96px" />
            <span class="sge-cond-tip">{{ sourceNotChoice ? '仅当条件成立才自动跳转' : '仅当条件成立才显示该选项' }}</span>
          </div>
          <p v-if="sourceNotChoice" class="sge-warn">
            起点不是「选择」节点：播放完该节点后会按这条连线自动跳转（多条时取第一条条件成立的边）。
          </p>
          <div class="sge-panel-actions">
            <button class="sge-btn danger" @click="deleteEdge(selectedEdge)">删除连线</button>
            <button class="sge-btn" @click="panelMode = 'none'">完成</button>
          </div>
        </template>

        <template v-else-if="panelMode === 'node' && selectedNode">
          <h4 class="sge-panel-title">
            {{ selectedNode.content_type }} #{{ selectedNode.content_id }}
          </h4>
          <div class="sge-field">
            <label>所属场景</label>
            <div class="sge-read">{{ selectedNode.scene_title }}（第 {{ selectedNode.scene_order }} 幕）</div>
          </div>
          <div class="sge-field">
            <label>内容</label>
            <div class="sge-read sge-read-text">{{ selectedNode.content_text || '（空）' }}</div>
          </div>
          <div class="sge-field">
            <label>出边 {{ nodeOutEdges.length }} 条</label>
            <div v-if="nodeOutEdges.length" class="sge-edge-list">
              <div v-for="(e, i) in nodeOutEdges" :key="'oe' + i" class="sge-edge-item" @click="selectEdge(e)">
                <span class="sge-edge-arrow">→</span>
                <span class="sge-edge-target">{{ nodeLabel(e.target_content_id) }}</span>
                <span v-if="e.conditions" class="sge-edge-cond">条件</span>
                <span v-if="!e.choice_text" class="sge-edge-note">无文案</span>
              </div>
            </div>
            <div v-else class="sge-read sge-muted">暂无出边（按顺序播放到下一个节点）</div>
          </div>
          <p v-if="selectedNode.content_type !== '选择'" class="sge-warn">
            该节点不是「选择」节点：它的出边只用于剧情图校验，播放器不会按它跳转。
          </p>
          <div class="sge-panel-actions">
            <button class="sge-btn primary" @click="locateInScript(selectedNode)">在脚本中编辑</button>
            <button class="sge-btn" @click="playFromNode(selectedNode)">从此节点试玩</button>
            <button class="sge-btn danger" @click="deleteNodeEdges(selectedNode)">清空该节点出边</button>
            <button class="sge-btn" @click="panelMode = 'none'">完成</button>
          </div>
        </template>

        <template v-else>
          <h4 class="sge-panel-title">操作提示</h4>
          <div class="sge-help">
            <p>· 拖拽节点可调整位置，位置会自动记忆；按住 Ctrl/Shift 点击可多选并整组拖动。</p>
            <p>· 按住节点右侧的圆点，拖到另一个节点即可新建分支。</p>
            <p>· 点击实线可编辑「选项文案」与「显示条件」，或删除连线。</p>
            <p>· Ctrl+C 复制选中连线/节点的出边，选中目标节点后 Ctrl+V 粘贴为新分支。</p>
            <p>· Ctrl+Z 撤销、Ctrl+Shift+Z 重做；「适配视图」会把全部节点缩放到可视野。</p>
            <p>· 虚线是自然顺序播放（自动生成，不可编辑）。</p>
            <p>· 改完记得点右上角「保存拓扑」写回服务器。</p>
          </div>
          <div class="sge-stats">
            <div><span>节点</span><b>{{ nodes.length }}</b></div>
            <div><span>分支</span><b>{{ edges.length }}</b></div>
            <div><span>场景</span><b>{{ sceneCount }}</b></div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getStoryGraph, batchSaveBranches } from '@/api/branch'
import { listVariables } from '@/api/variable'
import { createProjectVersion } from '@/api/version'
import { useStoryGraphEdgeForm } from '@/composables/storyGraph/useStoryGraphEdgeForm'
import { useStoryGraphTopology } from '@/composables/storyGraph/useStoryGraphTopology'
import {
  NODE_H,
  NODE_W,
  applyNodePositions,
  applyStoredPositions,
  buildRenderEdges,
  buildSceneOptions,
  canvasExtent,
  clampScale,
  computeAutoLayoutPositions,
  computeFitView,
  countVisibleEdges,
  hitTestNode,
  labelOfNode,
  nodeToneClass,
  parseStoredPositions,
  serializeNodePositions,
  snippetText,
  toCanvasPoint,
} from '@/utils/storyGraph'

const props = defineProps<{ projectId: number; focusContentId?: number | null }>()

const emit = defineEmits<{
  (e: 'locate', sceneId: number, contentId: number | null): void
}>()

const nodes = ref<any[]>([])
const edges = ref<any[]>([])
const variables = ref<any[]>([])
// 大项目按场景筛选：只渲染当前场景的节点与场景内连线
const sceneFilter = ref<number | null>(null)

const sceneOptions = computed(() => buildSceneOptions(nodes.value))

const displayNodes = computed(() => {
  if (!sceneFilter.value) return nodes.value
  const sid = Number(sceneFilter.value)
  return nodes.value.filter(n => Number(n.scene_id) === sid)
})

const displayEdgeCount = computed(() =>
  countVisibleEdges(displayNodes.value, edges.value, !!sceneFilter.value)
)

const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)

const canvasRef = ref<HTMLElement | null>(null)
const scale = ref(1)
const pan = ref({ x: 0, y: 0 })

const selectedNodeId = ref<number | null>(null)
// 多选：Ctrl/Shift 点击累加，拖动任意选中节点整组移动
const selectedNodeIds = ref<number[]>([])
const selectedEdge = ref<any>(null)
const panelMode = ref<'node' | 'edge' | 'none'>('none')

const connecting = ref<{ from: any; x: number; y: number; hoverId: number | null } | null>(null)

let dragGroup: Array<{ node: any; startX: number; startY: number }> = []
let dragStartPoint = { x: 0, y: 0 }
let nodeMoved = false
let suppressNextClick = false
let panning = false
let panStart = { x: 0, y: 0 }

const posKey = computed(() => `aigcn.storyGraph.${props.projectId}`)

const innerStyle = computed(() => ({
  transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${scale.value})`,
  transformOrigin: '0 0',
}))

const canvasSize = computed(() => canvasExtent(displayNodes.value))

const sceneCount = computed(() => {
  const s = new Set<number>()
  for (const n of nodes.value) s.add(n.scene_id)
  return s.size
})

const selectedNode = computed(() =>
  selectedNodeId.value == null ? null : nodes.value.find(n => n.content_id === selectedNodeId.value) || null
)

const nodeOutEdges = computed(() =>
  selectedNodeId.value == null ? [] : edges.value.filter(e => e.source_content_id === selectedNodeId.value)
)

const sourceNotChoice = computed(() => {
  if (!selectedEdge.value) return false
  const n = nodes.value.find(x => x.content_id === selectedEdge.value.source_content_id)
  return !!n && n.content_type !== '选择'
})

const connectFrom = computed(() => {
  const from = connecting.value?.from
  if (!from) return { x: 0, y: 0 }
  return { x: from._x + NODE_W, y: from._y + NODE_H / 2 }
})

// ==================== 布局 ====================

const nodeLabel = (contentId: number) => labelOfNode(nodes.value, contentId)

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

const autoLayout = () => {
  pushHistory()
  computeAutoLayout()
  persistPositions()
  resetView()
  ElMessage.success('已按场景重新排布')
}

const resetView = () => {
  scale.value = 1
  pan.value = { x: 0, y: 0 }
}

const zoom = (delta: number) => {
  scale.value = clampScale(scale.value + delta)
}

const onWheel = (e: WheelEvent) => {
  zoom(e.deltaY > 0 ? -0.1 : 0.1)
}

// 适配视图：把全部节点缩放到可视区域
const zoomToFit = () => {
  const view = computeFitView(displayNodes.value, {
    width: canvasRef.value?.clientWidth || 0,
    height: canvasRef.value?.clientHeight || 0,
  })
  if (!view) return
  scale.value = view.scale
  pan.value = view.pan
}

// ==================== 撤销 / 重做 ====================

const topology = useStoryGraphTopology({
  nodes,
  edges,
  persistPositions,
  clearSelection: () => {
    selectedNodeId.value = null
    selectedNodeIds.value = []
    selectedEdge.value = null
    panelMode.value = 'none'
  },
  markDirty: () => {
    dirty.value = true
  },
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
  selectedEdge,
  pushHistory,
  markDirty: () => {
    dirty.value = true
  },
  clearNodeSelection: () => {
    selectedNodeId.value = null
    selectedNodeIds.value = []
  },
  openPanel: () => {
    panelMode.value = 'edge'
  },
  closePanel: () => {
    panelMode.value = 'none'
  },
})

// ==================== 多选 / 复制粘贴分支 ====================

const isNodeSelected = (contentId: number) => selectedNodeIds.value.includes(contentId)

const toggleNodeSelection = (contentId: number) => {
  if (isNodeSelected(contentId)) {
    selectedNodeIds.value = selectedNodeIds.value.filter(id => id !== contentId)
  } else {
    selectedNodeIds.value = [...selectedNodeIds.value, contentId]
  }
}

const copyBranches = () => topology.copyBranches(selectedEdge.value, selectedNodeIds.value)

const pasteBranches = () => topology.pasteBranches(selectedNodeId.value)

// ==================== 渲染边 ====================

const renderEdges = computed(() => buildRenderEdges(displayNodes.value, edges.value))

// ==================== 交互 ====================

const toCanvas = (cx: number, cy: number) =>
  toCanvasPoint(cx, cy, canvasRef.value ? canvasRef.value.getBoundingClientRect() : null, pan.value, scale.value)

const hitTest = (p: { x: number; y: number }) => hitTestNode(nodes.value, p)

const onCanvasDown = (ev: MouseEvent) => {
  panning = true
  panStart = { x: ev.clientX - pan.value.x, y: ev.clientY - pan.value.y }
}

const onCanvasMove = (ev: MouseEvent) => {
  const p = toCanvas(ev.clientX, ev.clientY)
  if (connecting.value) {
    connecting.value.x = p.x
    connecting.value.y = p.y
    const hit = hitTest(p)
    connecting.value.hoverId = hit ? hit.content_id : null
    return
  }
  if (dragGroup.length) {
    const dx = p.x - dragStartPoint.x
    const dy = p.y - dragStartPoint.y
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) nodeMoved = true
    for (const g of dragGroup) {
      g.node._x = g.startX + dx
      g.node._y = g.startY + dy
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
    persistPositions()
    commitPendingHistory()
    // 拖拽结束会紧跟一次 click，忽略它以免把多选塌缩成单选
    suppressNextClick = true
    setTimeout(() => { suppressNextClick = false }, 0)
  } else {
    discardPendingHistory()
  }
  dragGroup = []
  nodeMoved = false
  panning = false
}

const onNodeDown = (ev: MouseEvent, n: any) => {
  if (connecting.value) return
  const additive = ev.metaKey || ev.ctrlKey || ev.shiftKey
  // 多选交给 click 处理，避免 mousedown + click 各切换一次
  if (additive) return
  // 已在多选组里的节点按下时保留整组，直接拖动整组
  if (!isNodeSelected(n.content_id)) {
    selectedNodeIds.value = [n.content_id]
  }
  selectedNodeId.value = n.content_id
  selectedEdge.value = null
  panelMode.value = 'node'
  beginPendingHistory()
  const p = toCanvas(ev.clientX, ev.clientY)
  dragStartPoint = p
  dragGroup = selectedNodeIds.value
    .map(id => nodes.value.find(x => x.content_id === id))
    .filter(Boolean)
    .filter(node => displayNodes.value.some(d => d.content_id === node.content_id))
    .map(node => ({ node, startX: node._x, startY: node._y }))
  nodeMoved = false
}

const selectNode = (n: any, ev?: MouseEvent | KeyboardEvent) => {
  if (suppressNextClick) {
    suppressNextClick = false
    return
  }
  const additive = ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey)
  if (additive) {
    toggleNodeSelection(n.content_id)
    selectedNodeId.value = isNodeSelected(n.content_id) ? n.content_id : (selectedNodeIds.value[0] ?? null)
    selectedEdge.value = null
    panelMode.value = selectedNodeId.value ? 'node' : 'none'
    return
  }
  selectedNodeIds.value = [n.content_id]
  selectedNodeId.value = n.content_id
  selectedEdge.value = null
  panelMode.value = 'node'
}

/** 优先脚本中定位：切回脚本页并滚动到对应台词 */
const locateInScript = (node: any) => {
  if (!node) return
  emit('locate', Number(node.scene_id), Number(node.content_id))
}

/** 选中并居中某个节点（从脚本页跳转过来时用） */
const focusNode = (contentId: number | null | undefined) => {
  if (contentId == null) return
  const n = nodes.value.find(x => Number(x.content_id) === Number(contentId))
  if (!n) return
  // 定位前清掉场景筛选，避免目标节点被过滤掉
  sceneFilter.value = null
  selectedNodeId.value = n.content_id
  selectedNodeIds.value = [n.content_id]
  selectedEdge.value = null
  panelMode.value = 'node'
  const w = canvasRef.value?.clientWidth || 0
  const h = canvasRef.value?.clientHeight || 0
  if (w && h) {
    pan.value = {
      x: w / 2 - ((n._x || 0) + NODE_W / 2) * scale.value,
      y: h / 2 - ((n._y || 0) + NODE_H / 2) * scale.value,
    }
  }
}

watch(
  () => props.focusContentId,
  (v) => {
    if (v == null) return
    nextTick(() => setTimeout(() => focusNode(v), 0))
  }
)

const startConnect = (ev: MouseEvent, n: any) => {
  const p = toCanvas(ev.clientX, ev.clientY)
  connecting.value = { from: n, x: p.x, y: p.y, hoverId: null }
}

const finishConnect = (ev: MouseEvent) => {
  const c = connecting.value
  connecting.value = null
  if (!c) return
  const p = toCanvas(ev.clientX, ev.clientY)
  const target = hitTest(p)
  if (!target) return
  if (target.content_id === c.from.content_id) {
    ElMessage.info('连线起点与终点不能相同')
    return
  }
  const dup = edges.value.some(
    e => e.source_content_id === c.from.content_id && e.target_content_id === target.content_id
  )
  if (dup) {
    ElMessage.info('这条分支已经存在')
    return
  }
  pushHistory()
  edges.value.push({
    path_id: undefined,
    source_content_id: c.from.content_id,
    target_content_id: target.content_id,
    choice_text: '',
    conditions: null,
  })
  dirty.value = true
  selectEdge(edges.value[edges.value.length - 1])
  ElMessage.success('已新建分支连线，别忘点「保存拓扑」')
}

const selectRenderEdge = (e: any) => {
  if (!e || !e.edge) return
  selectEdge(e.edge)
}

// 调试器：从指定节点开始试玩（新窗口，带 debug=1）
const playFromNode = (node: any) => {
  if (!node || !node.content_id) return
  const url = `/view/${props.projectId}?debug=1&start=${node.content_id}`
  window.open(url, '_blank')
}

// ==================== 数据 ====================

const reload = async () => {
  loading.value = true
  try {
    const [graph, vars] = await Promise.all([
      getStoryGraph(props.projectId),
      listVariables(props.projectId).catch(() => []),
    ])
    nodes.value = (graph?.nodes || []).map((n: any) => ({ ...n }))
    edges.value = (graph?.edges || []).map((e: any) => ({ ...e }))
    computeAutoLayout()
    restoreStoredPositions()
    variables.value = vars || []
    selectedNodeId.value = null
    selectedNodeIds.value = []
    selectedEdge.value = null
    panelMode.value = 'none'
    resetHistory()
    dirty.value = false
    if (props.focusContentId != null) {
      nextTick(() => setTimeout(() => focusNode(props.focusContentId), 0))
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
      props.projectId,
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
    createProjectVersion(props.projectId, '保存剧情图').catch(() => {})
    dirty.value = false
    await reload()
  } catch (e: any) {
    ElMessage.error((e && e.response && e.response.data && e.response.data.message) || '保存失败')
  } finally {
    saving.value = false
  }
}

// ==================== 键盘快捷键 ====================

const isEditableTarget = (target: any) => {
  const tag = target && target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(target && target.isContentEditable)
}

// 剧情图组件根节点：用于判断是否处于可见的剧情图页签
const rootRef = ref<HTMLElement | null>(null)

const onKeyDown = (ev: KeyboardEvent) => {
  // 剧情图在创作页靠 v-show 常驻：切到脚本页时监听仍在，必须按可见性拦截，
  // 否则脚本页按 Ctrl+Z / Ctrl+C 会误触剧情图的撤销与复制。
  const el = rootRef.value
  if (!el || el.offsetParent === null) return
  if (isEditableTarget(ev.target)) return
  const mod = ev.ctrlKey || ev.metaKey
  if (!mod) return
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

defineExpose({ reload })
</script>

<style scoped lang="scss" src="./storyGraphEditor.scss"></style>
