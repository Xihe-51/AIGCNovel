<template>
  <div class="sge-root">
    <!-- 工具栏 -->
    <div class="sge-toolbar">
      <div class="sge-info">
        节点级剧情图 · <b>{{ nodes.length }}</b> 个剧情节点 · <b>{{ edges.length }}</b> 条分支
        <span v-if="dirty" class="sge-dirty">（有未保存改动）</span>
      </div>
      <div class="sge-tools">
        <button class="sge-btn" @click="autoLayout">自动布局</button>
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
          <svg class="sge-svg" :width="canvasW" :height="canvasH">
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
            v-for="n in nodes"
            :key="n.content_id"
            class="sge-node"
            :class="[nodeClass(n), {
              selected: selectedNodeId === n.content_id,
              hovered: connecting && connecting.hoverId === n.content_id,
            }]"
            :style="{ left: n._x + 'px', top: n._y + 'px', width: NODE_W + 'px' }"
            @mousedown.stop="onNodeDown($event, n)"
            @click.stop="selectNode(n)"
          >
            <div class="sge-node-head">
              <span class="sge-node-type">{{ n.content_type }}</span>
              <span class="sge-node-id">#{{ n.content_id }}</span>
            </div>
            <div class="sge-node-text">{{ snippet(n.content_text) }}</div>
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
            <el-select
              v-model="edgeForm.variable"
              size="small"
              clearable
              placeholder="无条件（始终显示）"
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
            <span class="sge-cond-tip">仅当条件成立才显示该选项</span>
          </div>
          <p v-if="sourceNotChoice" class="sge-warn">
            起点不是「选择」节点：该连线只参与剧情图结构校验，播放器不会按它跳转。
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
            <button class="sge-btn danger" @click="deleteNodeEdges(selectedNode)">清空该节点出边</button>
            <button class="sge-btn" @click="panelMode = 'none'">完成</button>
          </div>
        </template>

        <template v-else>
          <h4 class="sge-panel-title">操作提示</h4>
          <div class="sge-help">
            <p>· 拖拽节点可调整位置，位置会自动记忆。</p>
            <p>· 按住节点右侧的圆点，拖到另一个节点即可新建分支。</p>
            <p>· 点击实线可编辑「选项文案」与「显示条件」，或删除连线。</p>
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
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getStoryGraph, batchSaveBranches } from '@/api/branch'
import { listVariables } from '@/api/variable'

const props = defineProps<{ projectId: number }>()

const NODE_W = 210
const NODE_H = 70
const MIN_SCALE = 0.3
const MAX_SCALE = 2

const nodes = ref<any[]>([])
const edges = ref<any[]>([])
const variables = ref<any[]>([])

const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)

const canvasRef = ref<HTMLElement | null>(null)
const scale = ref(1)
const pan = ref({ x: 0, y: 0 })

const selectedNodeId = ref<number | null>(null)
const selectedEdge = ref<any>(null)
const panelMode = ref<'node' | 'edge' | 'none'>('none')

const edgeForm = ref<any>({ choice_text: '', variable: '', op: '>=', value: 0 })
let formSyncing = false

const connecting = ref<{ from: any; x: number; y: number; hoverId: number | null } | null>(null)

let dragNode: any = null
let dragOffset = { x: 0, y: 0 }
let nodeMoved = false
let panning = false
let panStart = { x: 0, y: 0 }

const posKey = computed(() => `aigcn.storyGraph.${props.projectId}`)

const innerStyle = computed(() => ({
  transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${scale.value})`,
  transformOrigin: '0 0',
}))

const canvasW = computed(() => {
  let maxX = 0
  for (const n of nodes.value) maxX = Math.max(maxX, n._x || 0)
  return Math.max(1200, maxX + NODE_W + 220)
})

const canvasH = computed(() => {
  let maxY = 0
  for (const n of nodes.value) maxY = Math.max(maxY, n._y || 0)
  return Math.max(720, maxY + NODE_H + 200)
})

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

const snippet = (text?: string | null) => {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  if (!t) return '（空内容）'
  return t.length > 22 ? t.slice(0, 22) + '…' : t
}

const nodeClass = (n: any) => {
  if (n.content_type === '选择') return 'is-choice'
  if (n.content_type === '描述') return 'is-narration'
  return 'is-dialogue'
}

const nodeLabel = (contentId: number) => {
  const n = nodes.value.find(x => x.content_id === contentId)
  if (!n) return `#${contentId}（已删除）`
  return `#${n.content_id} ${n.content_type} · ${snippet(n.content_text)}`
}

/** 按场景纵向分列排布 */
const computeAutoLayout = () => {
  const order: number[] = []
  const groups: Record<number, any[]> = {}
  const sorted = [...nodes.value].sort(
    (a, b) => (a.scene_order - b.scene_order) || (a.order_num - b.order_num) || (a.content_id - b.content_id)
  )
  for (const n of sorted) {
    if (!groups[n.scene_id]) {
      groups[n.scene_id] = []
      order.push(n.scene_id)
    }
    groups[n.scene_id].push(n)
  }
  order.forEach((sid, col) => {
    groups[sid].forEach((n, row) => {
      n._x = 40 + col * 300
      n._y = 40 + row * 94
    })
  })
}

const applyStoredPositions = () => {
  let stored: Record<string, [number, number]> = {}
  try {
    const raw = localStorage.getItem(posKey.value)
    if (raw) stored = JSON.parse(raw)
  } catch (e) {
    stored = {}
  }
  for (const n of nodes.value) {
    const p = stored[String(n.content_id)]
    if (Array.isArray(p) && p.length === 2) {
      n._x = Number(p[0])
      n._y = Number(p[1])
    }
  }
}

const persistPositions = () => {
  const map: Record<string, [number, number]> = {}
  for (const n of nodes.value) map[String(n.content_id)] = [Math.round(n._x || 0), Math.round(n._y || 0)]
  try {
    localStorage.setItem(posKey.value, JSON.stringify(map))
  } catch (e) {
    /* 隐私模式等忽略 */
  }
}

const autoLayout = () => {
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
  scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((scale.value + delta) * 100) / 100))
}

const onWheel = (e: WheelEvent) => {
  zoom(e.deltaY > 0 ? -0.1 : 0.1)
}

// ==================== 渲染边 ====================

const renderEdges = computed(() => {
  const byId: Record<number, any> = {}
  for (const n of nodes.value) byId[n.content_id] = n

  const out: any[] = []
  const explicitOut = new Set<number>()

  for (const e of edges.value) {
    const s = byId[e.source_content_id]
    const t = byId[e.target_content_id]
    if (!s || !t) continue
    explicitOut.add(e.source_content_id)
    let label = e.choice_text || ''
    if (!label) label = '（无选项文案）'
    if (e.conditions) label += ' ◇'
    out.push({
      key: 'p' + (e.path_id != null ? e.path_id : `${e.source_content_id}-${e.target_content_id}`),
      kind: 'branch',
      x1: s._x + NODE_W,
      y1: s._y + NODE_H / 2,
      x2: t._x,
      y2: t._y + NODE_H / 2,
      label,
      edge: e,
    })
  }

  // 顺序边（后端 auto_sequence 的前端镜像，仅展示，不可编辑）
  const ordered = [...nodes.value].sort(
    (a, b) => (a.scene_order - b.scene_order) || (a.order_num - b.order_num) || (a.content_id - b.content_id)
  )
  for (let i = 0; i < ordered.length - 1; i++) {
    const cur = ordered[i]
    const nxt = ordered[i + 1]
    if (explicitOut.has(cur.content_id)) continue
    out.push({
      key: 's' + cur.content_id + '-' + nxt.content_id,
      kind: 'sequence',
      x1: cur._x + NODE_W,
      y1: cur._y + NODE_H / 2,
      x2: nxt._x,
      y2: nxt._y + NODE_H / 2,
      label: '',
      edge: null,
    })
  }
  return out
})

// ==================== 交互 ====================

const toCanvas = (cx: number, cy: number) => {
  const rect = canvasRef.value?.getBoundingClientRect()
  const left = rect ? rect.left : 0
  const top = rect ? rect.top : 0
  return {
    x: (cx - left - pan.value.x) / scale.value,
    y: (cy - top - pan.value.y) / scale.value,
  }
}

const hitTest = (p: { x: number; y: number }) => {
  for (let i = nodes.value.length - 1; i >= 0; i--) {
    const n = nodes.value[i]
    if (p.x >= n._x && p.x <= n._x + NODE_W && p.y >= n._y && p.y <= n._y + NODE_H) return n
  }
  return null
}

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
  if (dragNode) {
    dragNode._x = p.x - dragOffset.x
    dragNode._y = p.y - dragOffset.y
    nodeMoved = true
    return
  }
  if (panning) {
    pan.value = { x: ev.clientX - panStart.x, y: ev.clientY - panStart.y }
  }
}

const onCanvasUp = (ev: MouseEvent) => {
  if (connecting.value) finishConnect(ev)
  if (dragNode && nodeMoved) persistPositions()
  dragNode = null
  nodeMoved = false
  panning = false
}

const onNodeDown = (ev: MouseEvent, n: any) => {
  if (connecting.value) return
  const p = toCanvas(ev.clientX, ev.clientY)
  dragNode = n
  dragOffset = { x: p.x - n._x, y: p.y - n._y }
  nodeMoved = false
  selectedNodeId.value = n.content_id
  selectedEdge.value = null
  panelMode.value = 'node'
}

const selectNode = (n: any) => {
  selectedNodeId.value = n.content_id
  selectedEdge.value = null
  panelMode.value = 'node'
}

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

const selectEdge = (e: any) => {
  selectedEdge.value = e
  selectedNodeId.value = null
  panelMode.value = 'edge'
  formSyncing = true
  edgeForm.value = {
    choice_text: e.choice_text || '',
    variable: e.conditions && e.conditions.variable ? e.conditions.variable : '',
    op: e.conditions && e.conditions.op ? e.conditions.op : '>=',
    value: Number(e.conditions && e.conditions.value != null ? e.conditions.value : 0),
  }
  nextTick(() => {
    formSyncing = false
  })
}

watch(
  edgeForm,
  () => {
    if (formSyncing) return
    const e = selectedEdge.value
    if (!e) return
    e.choice_text = edgeForm.value.choice_text
    e.conditions = edgeForm.value.variable
      ? { variable: edgeForm.value.variable, op: edgeForm.value.op, value: Number(edgeForm.value.value) || 0 }
      : null
    dirty.value = true
  },
  { deep: true }
)

const deleteEdge = (e: any) => {
  const idx = edges.value.indexOf(e)
  if (idx >= 0) edges.value.splice(idx, 1)
  selectedEdge.value = null
  panelMode.value = 'none'
  dirty.value = true
}

const deleteNodeEdges = (n: any) => {
  const before = edges.value.length
  edges.value = edges.value.filter(e => e.source_content_id !== n.content_id)
  if (edges.value.length !== before) {
    dirty.value = true
    ElMessage.success('已移除该节点的全部出边（保存后生效）')
  }
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
    applyStoredPositions()
    variables.value = vars || []
    selectedNodeId.value = null
    selectedEdge.value = null
    panelMode.value = 'none'
    dirty.value = false
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
        conditions: e.conditions || null,
      })),
      true
    )
    ElMessage.success('拓扑已保存')
    dirty.value = false
    await reload()
  } catch (e: any) {
    ElMessage.error((e && e.response && e.response.data && e.response.data.message) || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(reload)

defineExpose({ reload })
</script>

<style scoped>
.sge-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 520px;
  background: #fbfbfd;
  border-radius: 10px;
  overflow: hidden;
}

.sge-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: #fff;
  border-bottom: 1px solid #eef0f4;
  flex-wrap: wrap;
}

.sge-info {
  font-size: 13px;
  color: #475569;
}
.sge-info b {
  color: #c81f4a;
}
.sge-dirty {
  color: #e6a23c;
}

.sge-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sge-zoom {
  font-size: 12px;
  color: #64748b;
  min-width: 40px;
  text-align: center;
}

.sge-btn {
  padding: 5px 10px;
  font-size: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}
.sge-btn:hover {
  border-color: #ff8fab;
  color: #c81f4a;
}
.sge-btn.primary {
  background: #ff8fab;
  border-color: #ff8fab;
  color: #fff;
}
.sge-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sge-btn.danger {
  color: #f56c6c;
  border-color: #fbc4c4;
}
.sge-btn.danger:hover {
  background: #f56c6c;
  color: #fff;
}

.sge-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.sge-canvas {
  position: relative;
  flex: 1;
  min-height: 480px;
  overflow: hidden;
  cursor: grab;
  background-image: radial-gradient(#e6e9f0 1px, transparent 1px);
  background-size: 22px 22px;
}
.sge-canvas:active {
  cursor: grabbing;
}

.sge-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 14px;
  text-align: center;
  padding: 0 30px;
}

.sge-inner {
  position: absolute;
  top: 0;
  left: 0;
}

.sge-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  overflow: visible;
}
.sge-svg .sge-edge-hit {
  stroke: transparent;
  stroke-width: 14;
  pointer-events: stroke;
  cursor: pointer;
}
.sge-svg .sge-edge {
  pointer-events: none;
}
.sge-svg .sge-edge.branch {
  stroke: #ff8fab;
  stroke-width: 2.5;
}
.sge-svg .sge-edge.sequence {
  stroke: #cbd5e1;
  stroke-width: 1.5;
}
.sge-svg .sge-edge.connect-temp {
  stroke: #c81f4a;
  stroke-width: 2;
  stroke-dasharray: 5 4;
}

.sge-node {
  position: absolute;
  box-sizing: border-box;
  height: 70px;
  padding: 7px 10px;
  border-radius: 9px;
  background: #fff;
  border: 1.5px solid #dbe1ea;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
  cursor: move;
  user-select: none;
  overflow: visible;
}
.sge-node.is-choice {
  border-color: #ffcc80;
  background: #fff8ee;
}
.sge-node.is-narration {
  border-color: #c8d6e5;
  background: #f4f8fc;
}
.sge-node.selected {
  border-color: #c81f4a;
  box-shadow: 0 0 0 2px rgba(200, 31, 74, 0.18);
}
.sge-node.hovered {
  border-color: #ff8fab;
  box-shadow: 0 0 0 3px rgba(255, 143, 171, 0.35);
}
.sge-node-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  margin-bottom: 3px;
}
.sge-node-type {
  padding: 0 6px;
  border-radius: 8px;
  background: #f1f5f9;
  color: #475569;
}
.sge-node-id {
  color: #b0b7c3;
}
.sge-node-text {
  font-size: 12.5px;
  color: #334155;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sge-node-meta {
  margin-top: 3px;
  font-size: 11px;
  color: #a0a8b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sge-handle {
  position: absolute;
  right: -7px;
  top: 50%;
  width: 13px;
  height: 13px;
  margin-top: -6.5px;
  border-radius: 50%;
  background: #ff8fab;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #ff8fab;
  cursor: crosshair;
}
.sge-handle:hover {
  background: #c81f4a;
}

.sge-panel {
  width: 288px;
  flex: 0 0 288px;
  padding: 14px;
  background: #fff;
  border-left: 1px solid #eef0f4;
  overflow-y: auto;
}
.sge-panel-title {
  margin: 0 0 12px;
  font-size: 14px;
  color: #1f2937;
}
.sge-field {
  margin-bottom: 12px;
}
.sge-field label {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 4px;
}
.sge-read {
  font-size: 12.5px;
  color: #475569;
  line-height: 1.45;
}
.sge-read-text {
  max-height: 96px;
  overflow-y: auto;
  background: #f8fafc;
  border-radius: 6px;
  padding: 6px 8px;
}
.sge-muted {
  color: #b0b7c3;
}
.sge-cond-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.sge-cond-tip {
  font-size: 11px;
  color: #94a3b8;
  width: 100%;
}
.sge-warn {
  font-size: 12px;
  color: #b88230;
  background: #fdf6ec;
  border-radius: 6px;
  padding: 7px 9px;
  line-height: 1.5;
  margin: 0 0 12px;
}
.sge-panel-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.sge-help p {
  margin: 0 0 8px;
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.55;
}
.sge-stats {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.sge-stats > div {
  flex: 1;
  text-align: center;
  background: #f8fafc;
  border-radius: 8px;
  padding: 8px 0;
}
.sge-stats span {
  display: block;
  font-size: 11px;
  color: #94a3b8;
}
.sge-stats b {
  font-size: 16px;
  color: #c81f4a;
}
.sge-edge-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sge-edge-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid #eef0f4;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #475569;
}
.sge-edge-item:hover {
  border-color: #ff8fab;
  background: #fff6f8;
}
.sge-edge-arrow {
  color: #ff8fab;
}
.sge-edge-target {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sge-edge-cond {
  color: #e6a23c;
  font-size: 11px;
}
.sge-edge-note {
  color: #b0b7c3;
  font-size: 11px;
}
</style>
