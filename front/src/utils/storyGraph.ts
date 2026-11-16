export const NODE_W = 210
export const NODE_H = 70
export const MIN_SCALE = 0.3
export const MAX_SCALE = 2

const LAYOUT_PAD_X = 40
const LAYOUT_PAD_Y = 40
const LAYOUT_COL_STEP = 300
const LAYOUT_ROW_STEP = 94
const CANVAS_MIN_W = 1200
const CANVAS_MIN_H = 720
const CANVAS_TAIL_X = 220
const CANVAS_TAIL_Y = 200
const FIT_PAD = 48

export interface GraphNodeLike {
  content_id: number
  content_type?: string
  content_text?: string | null
  scene_id: number
  scene_title?: string
  scene_order?: number
  order_num?: number
  _x?: number
  _y?: number
}

export interface GraphEdgeLike {
  path_id?: number | null
  source_content_id: number
  target_content_id: number
  choice_text?: string | null
  image_url?: string | null
  conditions?: any
}

export interface NodePosition {
  content_id: number
  x: number
  y: number
}

export interface CanvasPoint {
  x: number
  y: number
}

export interface CanvasRect {
  left: number
  top: number
}

export type StoredPositions = Record<string, [number, number]>

export interface RenderEdge {
  key: string
  kind: 'branch' | 'sequence'
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  edge: GraphEdgeLike | null
}

/** 节点气泡上只展示一小段正文，超出截断 */
export function snippetText(text?: string | null, maxLength = 22): string {
  const normalized = (text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return '（空内容）'
  return normalized.length > maxLength ? normalized.slice(0, maxLength) + '…' : normalized
}

export function nodeToneClass(contentType?: string): string {
  if (contentType === '选择') return 'is-choice'
  if (contentType === '描述') return 'is-narration'
  return 'is-dialogue'
}

export function describeNode(node: GraphNodeLike): string {
  return `#${node.content_id} ${node.content_type} · ${snippetText(node.content_text)}`
}

export function labelOfNode(nodes: GraphNodeLike[], contentId: number): string {
  const node = nodes.find(n => n.content_id === contentId)
  if (!node) return `#${contentId}（已删除）`
  return describeNode(node)
}

/** 播放顺序：先按场景顺序，再按场景内顺序，最后按内容 id */
export function sortNodesByPlayOrder(nodes: GraphNodeLike[]): GraphNodeLike[] {
  return [...nodes].sort(
    (a, b) =>
      ((a.scene_order || 0) - (b.scene_order || 0)) ||
      ((a.order_num || 0) - (b.order_num || 0)) ||
      (a.content_id - b.content_id)
  )
}

/** 按场景纵向分列排布：一个场景一列，场景内从上到下 */
export function computeAutoLayoutPositions(nodes: GraphNodeLike[]): NodePosition[] {
  const columnOf: number[] = []
  const rowsByScene: Record<number, GraphNodeLike[]> = {}
  for (const node of sortNodesByPlayOrder(nodes)) {
    if (!rowsByScene[node.scene_id]) {
      rowsByScene[node.scene_id] = []
      columnOf.push(node.scene_id)
    }
    rowsByScene[node.scene_id].push(node)
  }
  const positions: NodePosition[] = []
  columnOf.forEach((sceneId, col) => {
    rowsByScene[sceneId].forEach((node, row) => {
      positions.push({
        content_id: node.content_id,
        x: LAYOUT_PAD_X + col * LAYOUT_COL_STEP,
        y: LAYOUT_PAD_Y + row * LAYOUT_ROW_STEP,
      })
    })
  })
  return positions
}

export function applyNodePositions(nodes: GraphNodeLike[], positions: NodePosition[]): void {
  const byId = new Map<number, NodePosition>()
  for (const position of positions) byId.set(Number(position.content_id), position)
  for (const node of nodes) {
    const position = byId.get(Number(node.content_id))
    if (!position) continue
    node._x = position.x
    node._y = position.y
  }
}

export function parseStoredPositions(raw: string | null | undefined): StoredPositions {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as StoredPositions : {}
  } catch (e) {
    return {}
  }
}

/** 把本地记忆的位置套回节点；没有记忆的节点保持自动布局结果 */
export function applyStoredPositions(nodes: GraphNodeLike[], stored: StoredPositions): void {
  for (const node of nodes) {
    const pair = stored[String(node.content_id)]
    if (Array.isArray(pair) && pair.length === 2) {
      node._x = Number(pair[0])
      node._y = Number(pair[1])
    }
  }
}

export function serializeNodePositions(nodes: GraphNodeLike[]): StoredPositions {
  const map: StoredPositions = {}
  for (const node of nodes) {
    map[String(node.content_id)] = [Math.round(node._x || 0), Math.round(node._y || 0)]
  }
  return map
}

export function canvasExtent(nodes: GraphNodeLike[]): { width: number; height: number } {
  let maxX = 0
  let maxY = 0
  for (const node of nodes) {
    maxX = Math.max(maxX, node._x || 0)
    maxY = Math.max(maxY, node._y || 0)
  }
  return {
    width: Math.max(CANVAS_MIN_W, maxX + NODE_W + CANVAS_TAIL_X),
    height: Math.max(CANVAS_MIN_H, maxY + NODE_H + CANVAS_TAIL_Y),
  }
}

export function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 100) / 100))
}

/** 适配视图：把全部节点缩放平移到可视区域 */
export function computeFitView(
  nodes: GraphNodeLike[],
  viewport: { width: number; height: number },
): { scale: number; pan: CanvasPoint } | null {
  if (!nodes.length) return null
  const { width, height } = viewport
  if (!width || !height) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node._x || 0)
    minY = Math.min(minY, node._y || 0)
    maxX = Math.max(maxX, (node._x || 0) + NODE_W)
    maxY = Math.max(maxY, (node._y || 0) + NODE_H)
  }
  const fitScale = Math.min(
    (width - FIT_PAD * 2) / Math.max(1, maxX - minX),
    (height - FIT_PAD * 2) / Math.max(1, maxY - minY),
  )
  const scale = clampScale(fitScale)
  return {
    scale,
    pan: {
      x: (width - (maxX - minX) * scale) / 2 - minX * scale,
      y: (height - (maxY - minY) * scale) / 2 - minY * scale,
    },
  }
}

/** 自上而下命中检测，后渲染的节点优先 */
export function hitTestNode(nodes: GraphNodeLike[], point: CanvasPoint): GraphNodeLike | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    const x = node._x || 0
    const y = node._y || 0
    if (point.x >= x && point.x <= x + NODE_W && point.y >= y && point.y <= y + NODE_H) return node
  }
  return null
}

/** 屏幕坐标 → 画布坐标（考虑容器偏移、平移与缩放） */
export function toCanvasPoint(
  clientX: number,
  clientY: number,
  rect: CanvasRect | null,
  pan: CanvasPoint,
  scale: number,
): CanvasPoint {
  const left = rect ? rect.left : 0
  const top = rect ? rect.top : 0
  const safeScale = scale || 1
  return {
    x: (clientX - left - pan.x) / safeScale,
    y: (clientY - top - pan.y) / safeScale,
  }
}

/**
 * 生成 SVG 连线。
 * branch：后端保存的真实分支（可编辑）
 * sequence：按播放顺序自动生成的虚线（只读，后端 auto_sequence 的前端镜像）
 */
export function buildRenderEdges(
  displayNodes: GraphNodeLike[],
  edges: GraphEdgeLike[],
): RenderEdge[] {
  const byId: Record<number, GraphNodeLike> = {}
  for (const node of displayNodes) byId[node.content_id] = node

  const rendered: RenderEdge[] = []
  const explicitOut = new Set<number>()

  for (const edge of edges) {
    const source = byId[edge.source_content_id]
    const target = byId[edge.target_content_id]
    if (!source || !target) continue
    explicitOut.add(edge.source_content_id)
    let label = edge.choice_text || ''
    if (!label) label = '（无选项文案）'
    if (edge.conditions) label += ' ◇'
    rendered.push({
      key: 'p' + (edge.path_id != null ? edge.path_id : `${edge.source_content_id}-${edge.target_content_id}`),
      kind: 'branch',
      x1: (source._x || 0) + NODE_W,
      y1: (source._y || 0) + NODE_H / 2,
      x2: target._x || 0,
      y2: (target._y || 0) + NODE_H / 2,
      label,
      edge,
    })
  }

  const ordered = sortNodesByPlayOrder(displayNodes)
  for (let i = 0; i < ordered.length - 1; i++) {
    const current = ordered[i]
    const next = ordered[i + 1]
    if (explicitOut.has(current.content_id)) continue
    rendered.push({
      key: 's' + current.content_id + '-' + next.content_id,
      kind: 'sequence',
      x1: (current._x || 0) + NODE_W,
      y1: (current._y || 0) + NODE_H / 2,
      x2: next._x || 0,
      y2: (next._y || 0) + NODE_H / 2,
      label: '',
      edge: null,
    })
  }

  return rendered
}

/** 场景下拉：按场景首次出现顺序去重 */
export function buildSceneOptions(nodes: GraphNodeLike[]): Array<{ scene_id: number; title: string; order: number }> {
  const map = new Map<number, { scene_id: number; title: string; order: number }>()
  for (const node of nodes) {
    if (map.has(node.scene_id)) continue
    map.set(node.scene_id, {
      scene_id: node.scene_id,
      title: node.scene_title || `场景 ${node.scene_id}`,
      order: node.scene_order || 0,
    })
  }
  return Array.from(map.values()).sort((a, b) => a.order - b.order)
}

/** 当前场景筛选下应渲染的连线数量 */
export function countVisibleEdges(
  displayNodes: GraphNodeLike[],
  edges: GraphEdgeLike[],
  filtered: boolean,
): number {
  if (!filtered) return edges.length
  const ids = new Set(displayNodes.map(n => n.content_id))
  return edges.filter(e => ids.has(e.source_content_id) && ids.has(e.target_content_id)).length
}
