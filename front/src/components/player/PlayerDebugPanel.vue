<template>
	<div class="debug-panel">
		<div class="debug-panel-head">
			<span>调试器</span>
			<button class="debug-close" @click="emit('close')">×</button>
		</div>
		<div class="debug-pos">
			场景 {{ sceneIndex + 1 }}/{{ sceneCount }} · 节点 #{{ nodeId }}
		</div>
		<div class="debug-jump">
			<input
				:value="jumpId"
				type="number"
				placeholder="跳转到 content_id"
				@input="emit('update:jumpId', ($event.target as HTMLInputElement).value)"
			/>
			<button @click="emit('jump')">跳转</button>
		</div>
		<div class="debug-vars">
			<div v-for="v in variables" :key="v.variable_id" class="debug-var">
				<span class="debug-var-label">{{ v.label }}</span>
				<span class="debug-var-key">{{ v.name }}</span>
				<input
					class="debug-var-input"
					type="number"
					:value="variableValues[v.name] ?? v.initial_value"
					@change="emit('set-var', v, ($event.target as HTMLInputElement).value)"
				/>
			</div>
			<div v-if="!variables.length" class="debug-empty">项目还没有变量</div>
		</div>

		<!-- 条件断点 -->
		<div class="debug-section">
			<div class="debug-section-head">
				<span>条件断点</span>
				<button
					type="button"
					class="debug-mini-btn"
					:class="{ 'is-on': breakpoint.enabled }"
					@click="patchBreakpoint({ enabled: !breakpoint.enabled })"
				>
					{{ breakpoint.enabled ? '已开启' : '未开启' }}
				</button>
			</div>
			<div class="debug-break-row">
				<select
					:value="breakpoint.variable"
					class="debug-break-var"
					@change="patchBreakpoint({ variable: ($event.target as HTMLSelectElement).value })"
				>
					<option value="">选择变量</option>
					<option v-for="v in variables" :key="v.variable_id" :value="v.name">{{ v.label }}</option>
				</select>
				<select
					:value="breakpoint.op"
					class="debug-break-op"
					@change="patchBreakpoint({ op: ($event.target as HTMLSelectElement).value })"
				>
					<option value=">">&gt;</option>
					<option value=">=">≥</option>
					<option value="<">&lt;</option>
					<option value="<=">≤</option>
					<option value="==">=</option>
					<option value="!=">≠</option>
				</select>
				<input
					:value="breakpoint.value"
					type="number"
					class="debug-break-value"
					@input="patchBreakpoint({ value: readNumber($event) })"
				/>
			</div>
			<div v-if="breakpointHit" class="debug-break-hit">上次命中：{{ breakpointHit }}</div>
		</div>

		<!-- 变量历史 -->
		<div class="debug-section">
			<div class="debug-section-head">
				<span>变量历史</span>
				<button type="button" class="debug-mini-btn" @click="emit('clear-history')">清空</button>
			</div>
			<div class="debug-history">
				<div v-for="h in history.slice(0, 12)" :key="h.id" class="debug-history-item">
					<span class="debug-history-time">{{ h.at }}</span>
					<span class="debug-history-text">{{ h.label }} {{ h.from }}→{{ h.to }}</span>
					<span class="debug-history-reason">{{ h.reason }}</span>
				</div>
				<div v-if="!history.length" class="debug-empty">还没有变量变化</div>
			</div>
		</div>

		<!-- 状态快照 -->
		<div class="debug-section">
			<div class="debug-section-head">
				<span>状态快照</span>
				<button type="button" class="debug-mini-btn" @click="emit('save-snapshot')">保存快照</button>
			</div>
			<div class="debug-snapshots">
				<div v-for="s in snapshots" :key="s.id" class="debug-snapshot-item">
					<span class="debug-snapshot-title">{{ s.time }} · #{{ s.node || '-' }}</span>
					<button type="button" class="debug-mini-btn" @click="emit('restore-snapshot', s)">恢复</button>
					<button type="button" class="debug-mini-btn danger" @click="emit('delete-snapshot', s.id)">删</button>
				</div>
				<div v-if="!snapshots.length" class="debug-empty">最多保存 5 个快照</div>
			</div>
		</div>

		<!-- 覆盖率：本轮试玩走过的节点 / 分支 -->
		<div class="debug-coverage">
			<div class="debug-coverage-head">
				<span>覆盖率</span>
				<button type="button" class="debug-coverage-reset" @click="emit('reset-coverage')">重置</button>
			</div>
			<div class="debug-coverage-row">
				<span>节点</span>
				<span>{{ coverage.nodeVisited }} / {{ coverage.nodeTotal }}（{{ coverage.nodePct }}%）</span>
			</div>
			<div class="debug-bar">
				<div class="debug-bar-fill nodes" :style="{ width: coverage.nodePct + '%' }"></div>
			</div>
			<div class="debug-coverage-row">
				<span>分支</span>
				<span>{{ coverage.edgeVisited }} / {{ coverage.edgeTotal }}（{{ coverage.edgePct }}%）</span>
			</div>
			<div class="debug-bar">
				<div class="debug-bar-fill edges" :style="{ width: coverage.edgePct + '%' }"></div>
			</div>

			<div class="debug-uncovered">
				<div class="debug-uncovered-title">未走到节点（{{ uncoveredNodes.length }}）</div>
				<div class="debug-uncovered-list">
					<div
						v-for="n in uncoveredNodes.slice(0, 40)"
						:key="n.content_id"
						class="debug-uncovered-item"
						@click="emit('jump-to', n.content_id)"
					>
						<span class="debug-uncovered-id">#{{ n.content_id }}</span>
						<span class="debug-uncovered-scene">{{ n.scene_title }}</span>
						<span class="debug-uncovered-text">{{ n.content_text }}</span>
					</div>
					<div v-if="!uncoveredNodes.length" class="debug-empty">全部节点已走到</div>
				</div>
			</div>

			<div v-if="uncoveredEdges.length" class="debug-uncovered">
				<div class="debug-uncovered-title">未走分支（{{ uncoveredEdges.length }}）</div>
				<div class="debug-uncovered-list">
					<div v-for="e in uncoveredEdges.slice(0, 30)" :key="e.path_id" class="debug-uncovered-item">
						<span class="debug-uncovered-id">#{{ e.source_content_id }}</span>
						<span class="debug-uncovered-text">
							{{ e.choice_text ? '「' + e.choice_text + '」' : '自动跳转' }}
							→ #{{ e.target_content_id }}
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// 调试器面板：变量热改 / 条件断点 / 变量历史 / 状态快照 / 覆盖率全部只做展示，
// 具体读写与跳转由 usePlayerDebugger、usePlayerCoverage 负责，本组件只上抛领域事件。
interface DebugBreakpoint {
	enabled: boolean
	variable: string
	op: string
	value: number | string
}

interface CoverageStats {
	nodeTotal: number
	nodeVisited: number
	nodePct: number
	edgeTotal: number
	edgeVisited: number
	edgePct: number
}

const props = defineProps<{
	sceneIndex: number
	sceneCount: number
	nodeId: string | number
	jumpId: string
	variables: any[]
	variableValues: Record<string, any>
	breakpoint: DebugBreakpoint
	breakpointHit: string
	history: any[]
	snapshots: any[]
	coverage: CoverageStats
	uncoveredNodes: any[]
	uncoveredEdges: any[]
}>()

const emit = defineEmits<{
	(e: 'update:jumpId', value: string): void
	(e: 'jump'): void
	(e: 'set-var', variable: any, value: string): void
	(e: 'update:breakpoint', value: DebugBreakpoint): void
	(e: 'clear-history'): void
	(e: 'save-snapshot'): void
	(e: 'restore-snapshot', snapshot: any): void
	(e: 'delete-snapshot', id: any): void
	(e: 'reset-coverage'): void
	(e: 'jump-to', contentId: number): void
	(e: 'close'): void
}>()

const patchBreakpoint = (patch: Partial<DebugBreakpoint>) =>
	emit('update:breakpoint', { ...props.breakpoint, ...patch })

const readNumber = (event: Event) => {
	const raw = (event.target as HTMLInputElement).value
	return raw === '' ? '' : Number(raw)
}
</script>

<style scoped>
.debug-panel {
  position: absolute;
  top: 58px;
  left: 16px;
  z-index: 31;
  width: 260px;
  max-height: 60vh;
  overflow-y: auto;
  background: rgba(20, 20, 24, 0.88);
  color: #fff;
  border-radius: 10px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(8px);
  font-size: 12px;
}

.debug-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 6px;
}

.debug-close {
  border: none;
  background: transparent;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}

.debug-pos {
  color: #cbd5e1;
  font-size: 11px;
  margin-bottom: 8px;
}

.debug-jump {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.debug-jump input {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  padding: 4px 6px;
  font-size: 12px;
}

.debug-jump button {
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}

.debug-var {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}

.debug-var-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.debug-var-key {
  color: #94a3b8;
  font-size: 10px;
}

.debug-var-input {
  width: 62px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  padding: 3px 5px;
  font-size: 12px;
}

.debug-empty {
  color: #94a3b8;
  font-size: 11px;
}

.debug-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
}

.debug-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 8px;
}

.debug-mini-btn {
  border: none;
  background: rgba(255, 255, 255, 0.14);
  color: #e2e8f0;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.debug-mini-btn.is-on {
  background: #22c55e;
  color: #052e16;
}

.debug-mini-btn.danger {
  background: rgba(239, 68, 68, 0.25);
  color: #fecaca;
}

.debug-break-row {
  display: flex;
  gap: 4px;
}

.debug-break-var,
.debug-break-op,
.debug-break-value {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  font-size: 11px;
  padding: 3px 4px;
  min-width: 0;
}

.debug-break-var { flex: 1; }
.debug-break-op { width: 48px; }
.debug-break-value { width: 56px; }

.debug-break-hit {
  margin-top: 6px;
  color: #fbbf24;
  font-size: 11px;
  line-height: 1.4;
  word-break: break-all;
}

.debug-history {
  max-height: 110px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.debug-history-item {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-size: 11px;
  color: #cbd5e1;
}

.debug-history-time { color: #64748b; }
.debug-history-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.debug-history-reason { color: #93c5fd; }

.debug-snapshots {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.debug-snapshot-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #cbd5e1;
}

.debug-snapshot-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.debug-coverage {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
}

.debug-coverage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 8px;
}

.debug-coverage-reset {
  border: none;
  background: transparent;
  color: #93c5fd;
  font-size: 11px;
  cursor: pointer;
}

.debug-coverage-row {
  display: flex;
  justify-content: space-between;
  color: #cbd5e1;
  font-size: 11px;
  margin: 4px 0 3px;
}

.debug-bar {
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.16);
  overflow: hidden;
  margin-bottom: 6px;
}

.debug-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.2s;
}

.debug-bar-fill.nodes {
  background: linear-gradient(90deg, #e8467c, #ff9db5);
}

.debug-bar-fill.edges {
  background: linear-gradient(90deg, #5b8def, #93c5fd);
}

.debug-uncovered {
  margin-top: 10px;
}

.debug-uncovered-title {
  color: #cbd5e1;
  font-size: 11px;
  margin-bottom: 5px;
}

.debug-uncovered-list {
  max-height: 130px;
  overflow-y: auto;
}

.debug-uncovered-item {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 4px;
  border-radius: 5px;
  cursor: pointer;
}

.debug-uncovered-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.debug-uncovered-id {
  color: #f59e0b;
  font-size: 10px;
  flex-shrink: 0;
}

.debug-uncovered-scene {
  color: #94a3b8;
  font-size: 10px;
  flex-shrink: 0;
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.debug-uncovered-text {
  color: #e2e8f0;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
