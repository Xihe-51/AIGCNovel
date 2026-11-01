<template>
	<div class="hp-root">
		<div class="hp-head">
			<span class="hp-title">发布前自检</span>
			<div class="hp-actions">
				<button class="hp-run" @click="openPatrol">自动巡检</button>
				<button class="hp-run" @click="openRegression">全分支试玩</button>
				<button class="hp-run" :disabled="loading" @click="exportReport">导出报告</button>
				<button class="hp-run" :disabled="loading" @click="runCheck">
					{{ loading ? '检查中…' : '重新检查' }}
				</button>
			</div>
		</div>

		<div v-if="error" class="hp-error">{{ error }}</div>

		<template v-else>
			<div class="hp-cards">
				<div :class="['hp-card', missingAssets.length ? 'is-bad' : 'is-good']">
					<div class="hp-card-num">{{ missingAssets.length }}</div>
					<div class="hp-card-label">缺失素材</div>
				</div>
				<div :class="['hp-card', errors.length ? 'is-bad' : 'is-good']">
					<div class="hp-card-num">{{ errors.length }}</div>
					<div class="hp-card-label">剧情错误</div>
				</div>
				<div :class="['hp-card', warnings.length ? 'is-warn' : 'is-good']">
					<div class="hp-card-num">{{ warnings.length }}</div>
					<div class="hp-card-label">提醒</div>
				</div>
				<div :class="['hp-card', unreachableEndings.length ? 'is-bad' : 'is-good']">
					<div class="hp-card-num">{{ reachableEndingCount }}/{{ endings.length }}</div>
					<div class="hp-card-label">结局可达</div>
				</div>
			</div>

			<div class="hp-note" v-if="!loading && healthy">一切正常，可以发布。</div>

			<section v-if="missingAssets.length" class="hp-section">
				<h4 class="hp-section-title">缺失素材</h4>
				<div
					v-for="(m, i) in missingAssets"
					:key="'m' + i"
					class="hp-item hp-item-bad"
					@click="locate(m.scene_id, null)"
				>
					<span class="hp-item-tag">{{ m.kind_label }}</span>
					<span class="hp-item-text">{{ m.where }}</span>
				</div>
			</section>

			<section v-if="errors.length" class="hp-section">
				<h4 class="hp-section-title">剧情错误</h4>
				<div
					v-for="(e, i) in errors"
					:key="'e' + i"
					class="hp-item hp-item-bad"
					@click="locateIssue(e)"
				>
					<span class="hp-item-tag">{{ e.code }}</span>
					<span class="hp-item-text">{{ e.message }}</span>
				</div>
			</section>

			<section v-if="warnings.length" class="hp-section">
				<h4 class="hp-section-title">提醒（不阻断发布）</h4>
				<div
					v-for="(w, i) in warnings"
					:key="'w' + i"
					class="hp-item hp-item-warn"
					@click="locateIssue(w)"
				>
					<span class="hp-item-tag">{{ w.code }}</span>
					<span class="hp-item-text">{{ w.message }}</span>
				</div>
			</section>

			<section v-if="unreachableEndings.length" class="hp-section">
				<h4 class="hp-section-title">不可达结局</h4>
				<div
					v-for="(en, i) in unreachableEndings"
					:key="'en' + i"
					class="hp-item hp-item-bad"
					@click="locate(en.sceneId, null)"
				>
					<span class="hp-item-tag">结局</span>
					<span class="hp-item-text">{{ en.title }}：{{ en.reason }}</span>
				</div>
			</section>
		</template>

		<el-dialog
			v-model="patrolVisible"
			title="自动分支巡检"
			width="720px"
			append-to-body
		>
			<div v-if="patrolling" class="hp-note">正在遍历所有分支…</div>
			<div v-else-if="patrolError" class="hp-error">{{ patrolError }}</div>
			<template v-else-if="patrol">
				<div class="pt-summary">
					<div class="pt-stat">
						<span class="pt-stat-num">{{ patrol.summary.path_count }}</span>
						<span class="pt-stat-label">路径</span>
					</div>
					<div class="pt-stat is-good">
						<span class="pt-stat-num">{{ patrol.summary.complete_paths }}</span>
						<span class="pt-stat-label">到结局</span>
					</div>
					<div :class="['pt-stat', patrol.summary.dead_end_paths ? 'is-bad' : 'is-good']">
						<span class="pt-stat-num">{{ patrol.summary.dead_end_paths }}</span>
						<span class="pt-stat-label">死路</span>
					</div>
					<div :class="['pt-stat', patrol.summary.loop_paths ? 'is-warn' : 'is-good']">
						<span class="pt-stat-num">{{ patrol.summary.loop_paths }}</span>
						<span class="pt-stat-label">环路路径</span>
					</div>
					<div :class="['pt-stat', patrol.summary.unreachable_nodes ? 'is-bad' : 'is-good']">
						<span class="pt-stat-num">{{ patrol.summary.unreachable_nodes }}</span>
						<span class="pt-stat-label">不可达节点</span>
					</div>
				</div>
				<div v-if="patrol.summary.capped" class="pt-note">
					路径数量过多，已截断统计（最多 2000 条）。
				</div>

				<div class="pt-section-title">路径（展示前 {{ patrol.paths.length }} 条）</div>
				<div class="pt-path-list">
					<div v-for="(p, pi) in patrol.paths" :key="pi" class="pt-path">
						<div class="pt-path-head">
							<span class="pt-path-idx">#{{ pi + 1 }}</span>
							<span :class="['pt-end', p.end_type]">
								{{ p.end_type === 'ending' ? ('结局：' + p.end_label) : (p.end_type === 'dead' ? '死路' : '环路') }}
							</span>
							<span class="pt-path-len">{{ p.length }} 个节点</span>
						</div>
						<div class="pt-path-flow">
							<template v-for="(n, ni) in p.nodes" :key="ni">
								<span class="pt-path-node" :title="`#${n.content_id} ${n.text}`">
									{{ n.scene_title || ('#' + n.content_id) }}
								</span>
								<span v-if="ni < p.nodes.length - 1" class="pt-path-arrow">→</span>
							</template>
							<span v-if="p.truncated" class="pt-path-more">…</span>
						</div>
						<div v-if="p.transitions.length" class="pt-path-choices">
							<span v-for="(t, ti) in p.transitions" :key="ti" class="pt-path-choice">{{ t.choice_text }}</span>
						</div>
					</div>
					<div v-if="!patrol.paths.length" class="hp-note">没有可遍历的路径。</div>
				</div>

				<template v-if="patrol.dead_ends.length">
					<div class="pt-section-title">死路节点（走到这里没结局也没后续）</div>
					<div
						v-for="d in patrol.dead_ends"
						:key="d.content_id"
						class="pt-dead"
						@click="locate(d.scene_id, d.content_id)"
					>
						<span class="pt-end dead">死路</span>
						<span class="pt-dead-text">{{ d.scene_title }} · {{ d.text }}</span>
						<span class="pt-dead-count">{{ d.path_count }} 条路径</span>
					</div>
				</template>

				<template v-if="patrol.cycles.length">
					<div class="pt-section-title">环路</div>
					<div v-for="(c, ci) in patrol.cycles" :key="ci" class="pt-cycle">
						{{ c.nodes.map(n => n.scene_title + ' · ' + n.text).join(' → ') }}
					</div>
				</template>
			</template>

			<template #footer>
				<el-button @click="patrolVisible = false">关闭</el-button>
				<el-button type="primary" :loading="patrolling" @click="runPatrol">重新巡检</el-button>
			</template>
		</el-dialog>

		<el-dialog
			v-model="regressionVisible"
			title="自动全分支试玩（剧情回归）"
			width="720px"
			append-to-body
		>
			<div v-if="regressing" class="hp-note">正在按播放器运行时规则推演所有可行分支…</div>
			<div v-else-if="regressionError" class="hp-error">{{ regressionError }}</div>
			<template v-else-if="regression">
				<div class="pt-summary">
					<div class="pt-stat">
						<span class="pt-stat-num">{{ regression.summary.path_count }}</span>
						<span class="pt-stat-label">可行路线</span>
					</div>
					<div :class="['pt-stat', regression.summary.ending_reached ? 'is-good' : 'is-bad']">
						<span class="pt-stat-num">{{ regression.summary.ending_reached }}/{{ regression.summary.ending_total }}</span>
						<span class="pt-stat-label">结局可达</span>
					</div>
					<div class="pt-stat">
						<span class="pt-stat-num">{{ regression.summary.node_pct }}%</span>
						<span class="pt-stat-label">节点覆盖</span>
					</div>
					<div :class="['pt-stat', regression.summary.dead_end_count ? 'is-bad' : 'is-good']">
						<span class="pt-stat-num">{{ regression.summary.dead_end_count }}</span>
						<span class="pt-stat-label">死路</span>
					</div>
					<div :class="['pt-stat', regression.summary.gated_choice_count ? 'is-warn' : 'is-good']">
						<span class="pt-stat-num">{{ regression.summary.gated_choice_count }}</span>
						<span class="pt-stat-label">永锁选项</span>
					</div>
					<div :class="['pt-stat', regression.summary.locked_scene_count ? 'is-warn' : 'is-good']">
						<span class="pt-stat-num">{{ regression.summary.locked_scene_count }}</span>
						<span class="pt-stat-label">锁住场景</span>
					</div>
				</div>
				<div v-if="regression.summary.capped" class="pt-note">
					分支过多，已截断推演（最多 3000 个状态）。
				</div>

				<div class="pt-section-title">未达成结局（{{ regression.endings.missed.length }}）</div>
				<div class="pt-path-list">
					<div
						v-for="e in regression.endings.missed"
						:key="e.ending_id"
						class="pt-dead"
						@click="e.content_id && locate(nodeSceneMap[e.content_id], e.content_id)"
					>
						<span class="pt-end dead">未达</span>
						<span class="pt-dead-text">{{ e.title }}<template v-if="e.conditions">：{{ e.conditions }}</template></span>
					</div>
					<div v-if="!regression.endings.missed.length" class="hp-note">所有结局都能走到。</div>
				</div>

				<template v-if="regression.dead_ends.length">
					<div class="pt-section-title">死路（{{ regression.dead_ends.length }}）</div>
					<div
						v-for="(d, di) in regression.dead_ends"
						:key="di"
						class="pt-dead"
						@click="locate(d.scene_id, d.content_id)"
					>
						<span class="pt-end dead">死路</span>
						<span class="pt-dead-text">{{ d.scene_title }} · {{ d.text || '场景末尾' }}：{{ d.reason }}</span>
					</div>
				</template>

				<template v-if="regression.gated_choices.length">
					<div class="pt-section-title">永远锁住的选项（{{ regression.gated_choices.length }}）</div>
					<div
						v-for="c in regression.gated_choices"
						:key="c.path_id"
						class="pt-dead"
						@click="locate(nodeSceneMap[c.from], c.from)"
					>
						<span class="pt-end dead">锁</span>
						<span class="pt-dead-text">#{{ c.from }} 的选项：{{ c.conditions }}</span>
					</div>
				</template>

				<template v-if="regression.locked_scenes.length">
					<div class="pt-section-title">永远锁住的场景（{{ regression.locked_scenes.length }}）</div>
					<div
						v-for="s in regression.locked_scenes"
						:key="s.scene_id"
						class="pt-dead"
						@click="locate(s.scene_id, null)"
					>
						<span class="pt-end dead">锁</span>
						<span class="pt-dead-text">{{ s.title }}：{{ s.conditions }}</span>
					</div>
				</template>

				<template v-if="regression.unvisited_nodes.length">
					<div class="pt-section-title">未走到的节点（{{ regression.unvisited_nodes.length }}）</div>
					<div class="pt-path-list">
						<div
							v-for="n in regression.unvisited_nodes"
							:key="n.content_id"
							class="pt-dead"
							@click="locate(n.scene_id, n.content_id)"
						>
							<span class="pt-end dead">未走</span>
							<span class="pt-dead-text">{{ n.scene_title }} · {{ n.text }}</span>
						</div>
					</div>
				</template>
			</template>

			<template #footer>
				<el-button @click="regressionVisible = false">关闭</el-button>
				<el-button type="primary" :loading="regressing" @click="runRegression">重新推演</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed, onMounted } from 'vue'
	import { checkProjectAssets } from '@/api/asset'
	import { getStoryGraph } from '@/api/branch'
	import { listEndings } from '@/api/ending'
	import { getStoryPatrol } from '@/api/patrol'
	import type { StoryPatrol } from '@/api/patrol'
	import { getStoryRegression } from '@/api/patrol'
	import type { StoryRegression } from '@/api/patrol'
	import type { StoryIssue } from '@/api/branch'

	const props = defineProps<{
		projectId: string | number
	}>()

	const emit = defineEmits<{
		(e: 'locate', sceneId: number, contentId: number | null): void
	}>()

	type MissingAsset = {
		kind_label: string
		where: string
		scene_id?: number
		content_id?: number
	}

	const loading = ref(false)
	const error = ref('')
	const missingAssets = ref<MissingAsset[]>([])
	const errors = ref<StoryIssue[]>([])
	const warnings = ref<StoryIssue[]>([])
	const endings = ref<any[]>([])
	const unreachableEndings = ref<{ title: string; reason: string; sceneId: number }[]>([])
	const healthy = ref(false)

	const reachableEndingCount = computed(() => endings.value.length - unreachableEndings.value.length)

	const nodeSceneMap = ref<Record<number, number>>({})

	const runCheck = async () => {
		loading.value = true
		error.value = ''
		try {
			const [assetRes, graphRes, endingRows] = await Promise.all([
				checkProjectAssets(Number(props.projectId)),
				getStoryGraph(Number(props.projectId), true),
				listEndings(Number(props.projectId)),
			])

			missingAssets.value = (assetRes?.missing || []) as MissingAsset[]

			const validation = graphRes?.validation
			errors.value = validation?.errors || []
			warnings.value = validation?.warnings || []

			const sceneMap: Record<number, number> = {}
			for (const n of graphRes?.nodes || []) sceneMap[n.content_id] = n.scene_id
			nodeSceneMap.value = sceneMap

			endings.value = endingRows || []
			const orphans = new Set(validation?.orphans || [])
			const bad: { title: string; reason: string; sceneId: number }[] = []
			for (const en of endings.value) {
				const sceneId = sceneMap[en.content_id] || 0
				if (!sceneMap[en.content_id]) {
					bad.push({ title: en.title, reason: `指向的节点 #${en.content_id} 不存在`, sceneId: 0 })
				} else if (orphans.has(en.content_id)) {
					bad.push({ title: en.title, reason: '结局节点从主入口不可达', sceneId })
				}
			}
			unreachableEndings.value = bad

			healthy.value = !missingAssets.value.length && !errors.value.length && !bad.length
		} catch (e: any) {
			console.error('项目自检失败:', e)
			error.value = '自检失败：' + (e?.response?.data?.message || e?.message || '未知错误')
		} finally {
			loading.value = false
		}
	}

	const locate = (sceneId?: number, contentId?: number | null) => {
		if (!sceneId) return
		emit('locate', Number(sceneId), contentId ?? null)
	}

	// 把当前自检结果导出成 txt，方便存档或发给协作者
	const exportReport = () => {
		const lines = [
			`项目 #${props.projectId} 发布前自检报告`,
			`生成时间：${new Date().toLocaleString()}`,
			`结论：${healthy.value ? '通过，可以发布' : '存在问题，建议修复后再发布'}`,
			'',
			`缺失素材（${missingAssets.value.length}）`,
			...missingAssets.value.map(m => `- [${m.kind_label}] ${m.where}`),
			'',
			`剧情错误（${errors.value.length}）`,
			...errors.value.map(e => `- [${e.code}] ${e.message}`),
			'',
			`提醒（${warnings.value.length}）`,
			...warnings.value.map(w => `- [${w.code}] ${w.message}`),
			'',
			`不可达结局（${unreachableEndings.value.length}）`,
			...unreachableEndings.value.map(en => `- ${en.title}：${en.reason}`),
		]
		const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `项目${props.projectId}-自检报告.txt`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	// 从问题详情里尽量找出可定位的节点
	const locateIssue = (issue: StoryIssue) => {
		const detail = issue.detail || {}
		const contentId = detail.content_id
			|| (Array.isArray(detail.cycle) ? detail.cycle[0] : null)
			|| detail.source_content_id
		const sceneId = detail.scene_id || (contentId ? nodeSceneMap.value[contentId] : null)
		locate(sceneId, contentId ?? null)
	}

	// ---- 自动分支巡检 ----
	const patrolVisible = ref(false)
	const patrolling = ref(false)
	const patrol = ref<StoryPatrol | null>(null)
	const patrolError = ref('')

	const runPatrol = async () => {
		if (!props.projectId || patrolling.value) return
		patrolling.value = true
		patrolError.value = ''
		try {
			patrol.value = await getStoryPatrol(Number(props.projectId))
		} catch (e: any) {
			patrol.value = null
			patrolError.value = '巡检失败：' + (e?.response?.data?.message || e?.message || '未知错误')
		} finally {
			patrolling.value = false
		}
	}

	const openPatrol = () => {
		patrolVisible.value = true
		runPatrol()
	}

	// ---- 自动全分支试玩 / 剧情回归 ----
	const regressionVisible = ref(false)
	const regressing = ref(false)
	const regression = ref<StoryRegression | null>(null)
	const regressionError = ref('')

	const runRegression = async () => {
		if (!props.projectId || regressing.value) return
		regressing.value = true
		regressionError.value = ''
		try {
			regression.value = await getStoryRegression(Number(props.projectId))
		} catch (e: any) {
			regression.value = null
			regressionError.value = '推演失败：' + (e?.response?.data?.message || e?.message || '未知错误')
		} finally {
			regressing.value = false
		}
	}

	const openRegression = () => {
		regressionVisible.value = true
		runRegression()
	}

	onMounted(runCheck)
</script>

<style scoped>
	.hp-root {
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		padding: 10px 12px 16px;
		box-sizing: border-box;
	}

	.hp-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
		flex-shrink: 0;
	}

	.hp-title {
		font-size: 13px;
		font-weight: 600;
		color: #c81f4a;
	}

	.hp-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.hp-run {
		border: 1px solid #f0d0dc;
		background: #fff;
		color: #c81f4a;
		font-size: 11px;
		padding: 4px 10px;
		border-radius: 7px;
		cursor: pointer;
	}

	.hp-run:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.hp-error {
		font-size: 12px;
		color: #d33;
		padding: 8px;
	}

	.hp-cards {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
		flex-shrink: 0;
	}

	.hp-card {
		border-radius: 9px;
		padding: 8px 6px;
		text-align: center;
		border: 1px solid #eee;
		background: #fff;
	}

	.hp-card-num {
		font-size: 16px;
		font-weight: 700;
		line-height: 1.2;
	}

	.hp-card-label {
		font-size: 10px;
		color: #8a6a76;
		margin-top: 2px;
	}

	.hp-card.is-good { border-color: #cdebd8; background: #f4fbf6; }
	.hp-card.is-good .hp-card-num { color: #1f9d55; }
	.hp-card.is-warn { border-color: #f7e3b5; background: #fffaf0; }
	.hp-card.is-warn .hp-card-num { color: #c98a00; }
	.hp-card.is-bad { border-color: #f6cdd5; background: #fff5f7; }
	.hp-card.is-bad .hp-card-num { color: #cf2e4e; }

	.hp-note {
		margin-top: 10px;
		font-size: 12px;
		color: #1f9d55;
		background: #f4fbf6;
		border: 1px solid #cdebd8;
		border-radius: 8px;
		padding: 8px 10px;
	}

	.hp-section {
		margin-top: 12px;
	}

	.hp-section-title {
		font-size: 12px;
		margin: 0 0 6px;
		color: #64748b;
		font-weight: 600;
	}

	.hp-item {
		display: flex;
		gap: 6px;
		align-items: flex-start;
		padding: 7px 8px;
		border-radius: 7px;
		margin-bottom: 5px;
		font-size: 11px;
		line-height: 1.5;
		cursor: pointer;
		border: 1px solid transparent;
		transition: background 0.15s;
	}

	.hp-item-bad {
		background: #fff6f8;
		border-color: #f8dbe2;
	}

	.hp-item-warn {
		background: #fffaf0;
		border-color: #f5e6c2;
	}

	.hp-item:hover {
		background: #fff;
	}

	.hp-item-tag {
		flex-shrink: 0;
		font-size: 10px;
		color: #b07a8c;
		background: #fdeef3;
		padding: 0 5px;
		border-radius: 5px;
	}

	.hp-item-text {
		color: #475569;
		word-break: break-word;
	}

	/* ---- 自动巡检弹窗 ---- */
	.pt-summary {
		display: flex;
		gap: 8px;
		margin-bottom: 10px;
	}

	.pt-stat {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		border-radius: 9px;
		border: 1px solid #f5e4ea;
		background: #fffafc;
	}

	.pt-stat.is-good {
		border-color: #cdeeda;
		background: #eefaf4;
	}

	.pt-stat.is-bad {
		border-color: #f3c9d3;
		background: #fff5f7;
	}

	.pt-stat.is-warn {
		border-color: #f6dfc8;
		background: #fff8f0;
	}

	.pt-stat-num {
		font-size: 18px;
		font-weight: 600;
		color: #3d2b32;
	}

	.pt-stat-label {
		font-size: 10px;
		color: #8a6a76;
	}

	.pt-note {
		font-size: 11px;
		color: #a8562a;
		margin-bottom: 8px;
	}

	.pt-section-title {
		font-size: 12px;
		font-weight: 600;
		color: #8a6a76;
		margin: 12px 0 6px;
	}

	.pt-path-list {
		max-height: 300px;
		overflow-y: auto;
		border: 1px solid #f5e4ea;
		border-radius: 9px;
		padding: 6px 8px;
		background: #fffafc;
	}

	.pt-path {
		padding: 6px 0;
		border-bottom: 1px dashed #f7e3ea;
	}

	.pt-path:last-child {
		border-bottom: none;
	}

	.pt-path-head {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}

	.pt-path-idx {
		font-size: 10px;
		color: #b07a8c;
	}

	.pt-end {
		font-size: 10px;
		border-radius: 5px;
		padding: 1px 6px;
	}

	.pt-end.ending {
		color: #1f9d76;
		background: #eefaf4;
	}

	.pt-end.dead {
		color: #c0392b;
		background: #fff0f2;
	}

	.pt-end.loop {
		color: #a8562a;
		background: #fff6ec;
	}

	.pt-path-len {
		margin-left: auto;
		font-size: 10px;
		color: #b99aa5;
	}

	.pt-path-flow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 3px;
		font-size: 11px;
		color: #475569;
	}

	.pt-path-node {
		max-width: 130px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		background: #fdf3f7;
		border-radius: 5px;
		padding: 1px 5px;
	}

	.pt-path-arrow {
		color: #c9a2ae;
	}

	.pt-path-more {
		color: #b99aa5;
	}

	.pt-path-choices {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}

	.pt-path-choice {
		font-size: 10px;
		color: #a84463;
		background: #fff;
		border: 1px solid #f6d6e2;
		border-radius: 5px;
		padding: 0 5px;
	}

	.pt-dead {
		display: flex;
		align-items: baseline;
		gap: 7px;
		padding: 5px 6px;
		border-radius: 6px;
		cursor: pointer;
	}

	.pt-dead:hover {
		background: #fff5f8;
	}

	.pt-dead-text {
		flex: 1;
		min-width: 0;
		font-size: 11px;
		color: #475569;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pt-dead-count {
		flex-shrink: 0;
		font-size: 10px;
		color: #b07a8c;
	}

	.pt-cycle {
		font-size: 11px;
		color: #a8562a;
		background: #fff8f0;
		border: 1px solid #f6dfc8;
		border-radius: 7px;
		padding: 6px 8px;
		margin-bottom: 6px;
		line-height: 1.6;
	}
</style>
