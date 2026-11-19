<template>
	<el-dialog
		v-model="visibleModel"
		title="可视化剧情树"
		width="900px"
		class="custom-dialog"
		:close-on-click-modal="false"
	>
		<div class="feature-preview-content">
			<!-- 工具栏 -->
			<div class="canvas-toolbar">
				<span class="toolbar-title">
					剧情树编辑器 — 当前项目：{{ projectTitle || '未命名' }}（{{ flowNodes.length }}个节点）
				</span>
				<div class="toolbar-actions">
					<button class="tool-btn" @click="zoomIn">🔍+</button>
					<button class="tool-btn" @click="zoomOut">🔍-</button>
					<button class="tool-btn" @click="resetCanvas">↺ 重置</button>
					<button class="tool-btn" @click="refreshCanvas">🔄 刷新数据</button>
					<button class="tool-btn" @click="emit('open-node-editor')">🧩 节点级编辑</button>
				</div>
			</div>

			<!-- 可拖拽画布 -->
			<div
				class="flow-canvas-wrapper"
				@wheel.prevent="handleWheel"
				@mousedown="startPan"
				@mousemove="onPan"
				@mouseup="endPan"
				@mouseleave="endPan"
			>
				<!-- 加载状态 -->
				<div v-if="canvasLoading" class="canvas-status">
					<el-icon class="is-loading" :size="32"><Loading /></el-icon>
					<p>正在从服务器加载场景数据...</p>
				</div>

				<!-- 空状态 -->
				<div v-else-if="flowNodes.length === 0" class="canvas-status">
					<el-icon :size="32"><WarningFilled /></el-icon>
					<p>当前项目暂无场景</p>
					<p style="font-size: 12px; color: #999; margin-top: 8px;">请先在“场景编辑”中创建场景，再打开此预览</p>
				</div>

				<!-- 画布内容 -->
				<div
					v-else
					class="flow-canvas-inner"
					:style="{
						transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
						transformOrigin: '0 0'
					}"
				>
					<!-- SVG连线 -->
					<svg class="flow-svg" :width="canvasWidth" :height="canvasHeight">
						<g v-for="(edge, i) in edges" :key="'e'+i">
							<line
								:x1="edge.x1" :y1="edge.y1"
								:x2="edge.x2" :y2="edge.y2"
								:stroke="edge.kind === 'branch' ? '#ff8fab' : '#cbd5e1'"
								:stroke-width="edge.kind === 'branch' ? 2.5 : 1.5"
								:stroke-dasharray="edge.kind === 'branch' ? '' : '6 4'"
								:marker-end="edge.kind === 'branch' ? 'url(#arrowhead)' : 'url(#arrowhead-seq)'"
							>
								<title>{{ edge.kind === 'branch' ? ('分支：' + (edge.choice || '（无选项文案）')) : '顺序播放' }}</title>
							</line>
							<text
								v-if="edge.kind === 'branch' && edge.choice"
								:x="(edge.x1 + edge.x2) / 2"
								:y="(edge.y1 + edge.y2) / 2 - 4"
								text-anchor="middle"
								font-size="11"
								fill="#c81f4a"
							>{{ edge.choice.length > 12 ? edge.choice.slice(0, 12) + '…' : edge.choice }}</text>
						</g>
						<defs>
							<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
								<polygon points="0 0, 8 3, 0 6" fill="#ff8fab"/>
							</marker>
							<marker id="arrowhead-seq" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
								<polygon points="0 0, 8 3, 0 6" fill="#cbd5e1"/>
							</marker>
						</defs>
					</svg>

					<!-- 节点 -->
					<div
						v-for="node in flowNodes"
						:key="node.id"
						class="flow-node"
						:class="[node.type, { selected: selectedNode?.id === node.id }]"
						:style="{ left: node.x + 'px', top: node.y + 'px' }"
						@mousedown.stop="startDragNode($event, node)"
						@click.stop="selectNode(node)"
					>
						<span class="node-icon">{{ node.icon }}</span>
						<span class="node-label">{{ node.label }}</span>
						<span class="node-order">#{{ node.order }}</span>
					</div>
				</div>
			</div>

			<!-- 节点属性面板 -->
			<div v-if="selectedNode" class="node-props-panel">
				<h5>{{ selectedNode.icon }} {{ selectedNode.label }}</h5>
				<div class="prop-row">
					<span>场景ID：</span>
					<span>{{ selectedNode.sceneId }}</span>
				</div>
				<div class="prop-row">
					<span>序号：</span>
					<span>第 {{ selectedNode.order }} 幕</span>
				</div>
				<div class="prop-row">
					<span>描述：</span>
					<span>{{ selectedNode.scene || '暂无描述' }}</span>
				</div>
				<div class="prop-row">
					<span>类型：</span>
					<span>{{ selectedNode.type === 'start' ? '起始场景' : selectedNode.type === 'ending' ? '结局场景' : selectedNode.type === 'branch' ? '分支场景' : '中间场景' }}</span>
				</div>
				<div v-if="selectedNode.choiceCount" class="prop-row">
					<span>选择项：</span>
					<span>该场景含 {{ selectedNode.choiceCount }} 条「选择」类型内容</span>
				</div>
				<div v-if="selectedNode.branchOut" class="prop-row">
					<span>分叉：</span>
					<span>该场景存在多选分支出口</span>
				</div>
			</div>

			<!-- FSM 剧情链校验面板 -->
			<div v-if="storyValidation" class="story-check-panel">
				<div class="check-head">
					<span class="check-title">剧情链校验</span>
					<el-tag
						:type="storyValidation.ok ? 'success' : 'danger'"
						size="small"
						effect="dark"
					>{{ storyValidation.ok ? '结构正常' : (storyValidation.errors.length + ' 个问题') }}</el-tag>
					<span class="check-stats">
						节点 {{ storyValidation.summary.nodes }} ·
						分支 {{ storyValidation.summary.edges }} ·
						结局 {{ storyValidation.summary.endings }} ·
						路径 {{ storyValidation.summary.path_count < 0 ? '—' : storyValidation.summary.path_count }} ·
						覆盖率 {{ Math.round((storyValidation.summary.coverage || 0) * 100) }}%
					</span>
				</div>

				<div v-if="storyValidation.errors.length" class="check-list error">
					<div v-for="(it, i) in storyValidation.errors" :key="'ce'+i" class="check-item">
						<span class="check-code">{{ it.code }}</span>
						<span>{{ it.message }}</span>
					</div>
				</div>

				<div v-if="storyValidation.warnings.length" class="check-list warn">
					<div v-for="(it, i) in storyValidation.warnings" :key="'cw'+i" class="check-item">
						<span class="check-code">{{ it.code }}</span>
						<span>{{ it.message }}</span>
					</div>
				</div>

				<div v-if="!storyValidation.errors.length && !storyValidation.warnings.length" class="check-ok">
					未发现死循环、孤儿节点或未配置分支的选择节点
				</div>
			</div>

			<!-- 底部说明 -->
			<p class="feature-note">
				节点数据来源：{{ graphSource === 'branch_paths'
					? 'branch_paths 真实分支拓扑（' + (storyGraph?.stats?.edge_count || 0) + ' 条分支）'
					: 'scenes 表顺序（未检测到分支数据，已回退）' }}
				&nbsp;|&nbsp;实线 = 玩家选择分支，虚线 = 顺序播放
				&nbsp;|&nbsp;点击查看属性
			</p>
		</div>
		<template #footer>
			<button class="dialog-btn confirm" @click="visibleModel = false">知道了</button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
/**
 * 可视化剧情树：场景级只读预览 + 平移缩放拖拽 + FSM 校验结果。
 *
 * 自己拉场景与剧情拓扑，打开时刷新；父级只控制显隐并接「节点级编辑」事件。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading, WarningFilled } from '@element-plus/icons-vue'
import { getScenes } from '@/api/scenes'
import { getStoryGraph } from '@/api/branch'

const props = defineProps<{
	visible: boolean
	projectId: number
	projectTitle: string
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'open-node-editor'): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const scenes = ref<any[]>([])

// 画布状态
const scale = ref(1)
const panOffset = ref({ x: 0, y: 0 })
const canvasWidth = 1000
const canvasHeight = 600
const selectedNode = ref<any>(null)
const canvasLoading = ref(false)
const flowNodes = ref<any[]>([])
const edges = ref<any[]>([])
// 真实剧情拓扑（branch_paths）与 FSM 校验结果
const storyGraph = ref<any>(null)
const storyValidation = ref<any>(null)
const graphSource = ref<'branch_paths' | 'scenes'>('scenes')

// 画布交互
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const draggingNode = ref<any>(null)
const dragOffset = ref({ x: 0, y: 0 })

const zoomIn = () => { scale.value = Math.min(2, scale.value + 0.1) }
const zoomOut = () => { scale.value = Math.max(0.3, scale.value - 0.1) }
const resetCanvas = () => { scale.value = 1; panOffset.value = { x: 0, y: 0 }; selectedNode.value = null }
const refreshCanvas = async () => {
	await loadScenes()
	await generateFlow()
	ElMessage.success('画布已刷新')
}

const handleWheel = (e: WheelEvent) => {
	scale.value = Math.max(0.3, Math.min(2, scale.value - e.deltaY * 0.001))
}

const startPan = (e: MouseEvent) => {
	if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('flow-canvas-wrapper')) {
		isPanning.value = true
		panStart.value = { x: e.clientX - panOffset.value.x, y: e.clientY - panOffset.value.y }
	}
}

const onPan = (e: MouseEvent) => {
	if (isPanning.value && !draggingNode.value) {
		panOffset.value = { x: e.clientX - panStart.value.x, y: e.clientY - panStart.value.y }
	}
	if (draggingNode.value) {
		draggingNode.value.x = e.clientX - dragOffset.value.x
		draggingNode.value.y = e.clientY - dragOffset.value.y
	}
}

const endPan = () => { isPanning.value = false; draggingNode.value = null }

const startDragNode = (e: MouseEvent, node: any) => {
	draggingNode.value = node
	dragOffset.value = { x: e.clientX - node.x, y: e.clientY - node.y }
}

const selectNode = (node: any) => { selectedNode.value = node }

const loadScenes = async () => {
	try {
		scenes.value = (await getScenes(props.projectId)) || []
	} catch (e) {
		console.warn('读取场景列表失败:', e)
		scenes.value = []
	}
}

/**
 * 优先读取 branch_paths 的真实拓扑，把「剧情节点级」的边聚合到「场景级」展示；
 * 接口不可用时回退到旧的按场景顺序连线。
 */
const generateFlow = async () => {
	if (!scenes.value.length) {
		flowNodes.value = []
		edges.value = []
		storyGraph.value = null
		storyValidation.value = null
		return
	}

	canvasLoading.value = true

	// ---- 1. 拉真实拓扑（失败则回退） ----
	let graph: any = null
	try {
		graph = await getStoryGraph(props.projectId)
	} catch (e) {
		console.warn('剧情拓扑接口不可用，回退到场景顺序视图：', e)
		graph = null
	}
	storyGraph.value = graph
	storyValidation.value = graph?.validation || null
	graphSource.value = graph ? 'branch_paths' : 'scenes'

	const sortedScenes = [...scenes.value].sort((a, b) => a.order_num - b.order_num)
	const nodes: any[] = []
	const lines: any[] = []

	const startX = 400
	const startY = 40
	const rowHeight = 140
	const colWidth = 260

	// ---- 2. 计算场景级坐标 ----
	const posOf: Record<number, { x: number; y: number }> = {}
	sortedScenes.forEach((scene, index) => {
		const row = Math.floor(index / 3)
		const col = index % 3
		const totalInRow = Math.min(sortedScenes.length - row * 3, 3)
		const rowStartX = startX - (totalInRow - 1) * colWidth / 2
		posOf[scene.scene_id] = { x: rowStartX + col * colWidth, y: startY + row * rowHeight }
	})

	// ---- 3. 按场景聚合剧情节点统计 ----
	const sceneStat: Record<number, any> = {}
	const contentToScene: Record<number, number> = {}
	if (graph) {
		for (const n of graph.nodes || []) {
			contentToScene[n.content_id] = n.scene_id
			const st = sceneStat[n.scene_id] || (sceneStat[n.scene_id] = {
				dialogue: 0, narration: 0, choice: 0, isStart: false, isEnding: false, hasBranchOut: false,
			})
			if (n.content_type === '对话') st.dialogue++
			else if (n.content_type === '描述') st.narration++
			else if (n.content_type === '选择') st.choice++
		}
		const v = graph.validation
		if (v) {
			if (v.primary_start != null) {
				const sid = contentToScene[v.primary_start]
				if (sid != null && sceneStat[sid]) sceneStat[sid].isStart = true
			}
			for (const t of v.terminal_nodes || []) {
				const sid = contentToScene[t]
				if (sid != null && sceneStat[sid]) sceneStat[sid].isEnding = true
			}
		}
		// 哪些场景有真实分叉出口
		const outCount: Record<number, number> = {}
		for (const e of graph.edges || []) {
			outCount[e.source_content_id] = (outCount[e.source_content_id] || 0) + 1
		}
		for (const cid of Object.keys(outCount)) {
			if (outCount[Number(cid)] >= 2) {
				const sid = contentToScene[Number(cid)]
				if (sid != null && sceneStat[sid]) sceneStat[sid].hasBranchOut = true
			}
		}
	}

	// ---- 4. 生成节点 ----
	sortedScenes.forEach((scene, index) => {
		const { x, y } = posOf[scene.scene_id]
		const st = sceneStat[scene.scene_id]

		let nodeType = 'middle'
		let icon = '📖'

		if (st?.isStart) {
			nodeType = 'start'; icon = '🎬'
		} else if (st?.isEnding) {
			nodeType = 'ending'; icon = '🏁'
		} else if (st?.hasBranchOut || (st?.choice || 0) > 0) {
			nodeType = 'branch'; icon = '🔀'
		} else if (!graph && index === 0) {
			// 回退模式：沿用旧的「第一个场景 = 起始」规则
			nodeType = 'start'; icon = '🎬'
		} else if (!graph) {
			// 回退模式：标题关键词猜测
			if (scene.title?.includes('结局') || scene.title?.includes('最终') ||
					scene.title?.includes('尾声') || scene.title?.includes('结尾') ||
					scene.title?.includes('结束') || scene.title?.includes('终')) {
				nodeType = 'ending'; icon = '🏁'
			} else if (scene.title?.includes('分支') || scene.title?.includes('选择') ||
									scene.title?.includes('分岔') || scene.title?.includes('岔路')) {
				nodeType = 'branch'; icon = '🔀'
			}
		}

		const statText = st
			? `对话${st.dialogue} · 旁白${st.narration}${st.choice ? ' · 选择' + st.choice : ''}`
			: (scene.description || `第${scene.order_num}幕`)

		nodes.push({
			id: `scene_${scene.scene_id}`,
			x, y,
			icon,
			label: scene.title || `场景${scene.order_num}`,
			type: nodeType,
			scene: statText,
			order: scene.order_num,
			sceneId: scene.scene_id,
			choiceCount: st?.choice || 0,
			branchOut: st?.hasBranchOut || false,
		})
	})

	// ---- 5. 生成连线 ----
	const scenePairSeen = new Set<string>()
	if (graph && (graph.edges || []).length) {
		// 5.1 真实跨场景分支（带选项文案）
		for (const e of graph.edges) {
			const s = contentToScene[e.source_content_id]
			const t = contentToScene[e.target_content_id]
			if (s == null || t == null || s === t) continue
			const key = `${s}->${t}`
			if (scenePairSeen.has(key)) continue
			scenePairSeen.add(key)
			const a = posOf[s], b = posOf[t]
			if (!a || !b) continue
			lines.push({
				x1: a.x + 50, y1: a.y + 30,
				x2: b.x, y2: b.y + 15,
				choice: e.choice_text || '',
				kind: 'branch',
			})
		}
	}

	// 5.2 顺序连线（补足未被分支覆盖的场景衔接，还原自然播放流）
	sortedScenes.forEach((scene, index) => {
		if (index >= sortedScenes.length - 1) return
		const next = sortedScenes[index + 1]
		const key = `${scene.scene_id}->${next.scene_id}`
		if (scenePairSeen.has(key)) return
		const a = posOf[scene.scene_id], b = posOf[next.scene_id]
		if (!a || !b) return
		scenePairSeen.add(key)
		lines.push({
			x1: a.x + 50, y1: a.y + 30,
			x2: b.x, y2: b.y + 15,
			choice: '',
			kind: 'sequence',
		})
	})

	flowNodes.value = nodes
	edges.value = lines
	canvasLoading.value = false
}

// 打开时重新拉取场景与拓扑，避免看到上一次编辑前的旧结构
watch(() => props.visible, async (open) => {
	if (!open) return
	selectedNode.value = null
	resetCanvas()
	await loadScenes()
	await generateFlow()
})
</script>

<style scoped lang="scss" src="./projectFlowPreview.scss"></style>
