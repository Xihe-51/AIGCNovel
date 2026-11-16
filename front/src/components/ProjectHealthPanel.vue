<template>
	<div class="hp-root">
		<div class="hp-head">
			<span class="hp-title">发布前自检</span>
			<div class="hp-actions">
				<button class="hp-run" @click="openPatrol">自动巡检</button>
				<button class="hp-run" @click="openRegression">全分支试玩</button>
				<button class="hp-run" @click="openReaders">合成读者</button>
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
					分支过多，已截断推演（运行上限会随项目节点数调整）。
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

		<el-dialog
			v-model="readersVisible"
			title="合成读者报告（规则版）"
			width="820px"
			append-to-body
		>
			<div v-if="readersLoading" class="hp-note">正在模拟速通 / 全收集 / 恋爱线 / 低耐心四类读者…</div>
			<div v-else-if="readersError" class="hp-error">{{ readersError }}</div>
			<template v-else-if="readersData">
				<div class="sr-grid">
					<div v-for="r in readersData.readers" :key="r.key" class="sr-card">
						<div class="sr-card-head">
							<span class="sr-name">{{ r.name }}</span>
							<span :class="['sr-stop', stopClass(r.stop_reason)]">{{ stopLabel(r.stop_reason) }}</span>
						</div>
						<div class="sr-desc">{{ r.description }}</div>
						<div class="sr-stats">
							{{ r.stats.node_count }} 个节点 · {{ r.stats.choice_count }} 次选择 · 约 {{ r.stats.est_minutes }} 分钟
						</div>
						<div class="sr-outcome">
							<template v-if="r.ending">结局：{{ r.ending.title }}</template>
							<template v-else-if="r.dropoff">流失于：{{ r.dropoff.scene_title }} · {{ r.dropoff.text }}</template>
							<template v-else>{{ stopLabel(r.stop_reason) }}</template>
						</div>
						<div class="sr-route">
							<div
								v-for="(n, ni) in r.route"
								:key="ni"
								class="sr-route-node"
								@click="locate(n.scene_id, n.content_id)"
							>
								<span class="sr-route-scene">{{ n.scene_title }}</span>
								<span class="sr-route-text">{{ n.character_name ? n.character_name + '：' : '' }}{{ n.text }}</span>
							</div>
							<div v-if="r.route_truncated" class="sr-route-more">路线过长，仅展示前 80 个节点</div>
						</div>
					</div>
				</div>

				<section v-if="readersData.aggregate.ignored_options.length" class="sr-section">
					<h4 class="hp-section-title">被所有读者冷落的选项（{{ readersData.aggregate.ignored_option_count }}）</h4>
					<div
						v-for="opt in readersData.aggregate.ignored_options"
						:key="opt.path_id"
						class="pt-dead"
						@click="opt.scene_id && locate(opt.scene_id, opt.content_id)"
					>
						<span class="pt-end dead">冷落</span>
						<span class="pt-dead-text">{{ opt.scene_title }} · {{ opt.choice_text }}（{{ opt.source_text }}）</span>
					</div>
				</section>

				<section v-if="readersData.aggregate.impossible_choices.length" class="sr-section">
					<h4 class="hp-section-title">明显永假的条件（{{ readersData.aggregate.impossible_choice_count }}）</h4>
					<div
						v-for="opt in readersData.aggregate.impossible_choices"
						:key="opt.path_id"
						class="pt-dead"
						@click="opt.scene_id && locate(opt.scene_id, opt.content_id)"
					>
						<span class="pt-end dead">永假</span>
						<span class="pt-dead-text">{{ opt.scene_title }} · {{ opt.choice_text }}：{{ opt.conditions }}</span>
					</div>
				</section>

				<div class="sr-note">
					合成读者是规则模拟，不代表真实玩家；请把结论当作可定位的检查清单，而不是评分。
					<span v-if="readersData.aggregate.endings_seen.length">本次触达结局：{{ readersData.aggregate.endings_seen.join('、') }}</span>
				</div>
			</template>
			<template #footer>
				<el-button @click="readersVisible = false">关闭</el-button>
				<el-button type="primary" :loading="readersLoading" @click="runReaders">重新模拟</el-button>
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
	import { getSyntheticReaders } from '@/api/readers'
	import type { SyntheticReaders } from '@/api/readers'
	import type { StoryIssue } from '@/api/branch'
	import {
		buildHealthReport,
		buildNodeSceneMap,
		findUnreachableEndings,
		isProjectHealthy,
		resolveIssueTarget,
		stopReasonClass,
		stopReasonLabel,
	} from '@/utils/projectHealth'
	import type { MissingAssetLike, UnreachableEnding } from '@/utils/projectHealth'

	const props = defineProps<{
		projectId: string | number
	}>()

	const emit = defineEmits<{
		(e: 'locate', sceneId: number, contentId: number | null): void
	}>()

	const loading = ref(false)
	const error = ref('')
	const missingAssets = ref<MissingAssetLike[]>([])
	const errors = ref<StoryIssue[]>([])
	const warnings = ref<StoryIssue[]>([])
	const endings = ref<any[]>([])
	const unreachableEndings = ref<UnreachableEnding[]>([])
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

			missingAssets.value = (assetRes?.missing || []) as MissingAssetLike[]

			const validation = graphRes?.validation
			errors.value = validation?.errors || []
			warnings.value = validation?.warnings || []

			const sceneMap = buildNodeSceneMap(graphRes?.nodes || [])
			nodeSceneMap.value = sceneMap

			endings.value = endingRows || []
			unreachableEndings.value = findUnreachableEndings(endings.value, sceneMap, validation?.orphans || [])

			healthy.value = isProjectHealthy({
				missing: missingAssets.value.length,
				errors: errors.value.length,
				unreachable: unreachableEndings.value.length,
			})
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
		const text = buildHealthReport({
			projectId: props.projectId,
			healthy: healthy.value,
			missingAssets: missingAssets.value,
			errors: errors.value,
			warnings: warnings.value,
			unreachableEndings: unreachableEndings.value,
		})
		const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
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
		const target = resolveIssueTarget(issue, nodeSceneMap.value)
		locate(target.sceneId ?? undefined, target.contentId)
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

	// ---- 规则版合成读者 ----
	const readersVisible = ref(false)
	const readersLoading = ref(false)
	const readersData = ref<SyntheticReaders | null>(null)
	const readersError = ref('')

	const stopLabel = stopReasonLabel
	const stopClass = stopReasonClass

	const runReaders = async () => {
		if (!props.projectId || readersLoading.value) return
		readersLoading.value = true
		readersError.value = ''
		try {
			readersData.value = await getSyntheticReaders(Number(props.projectId))
		} catch (e: any) {
			readersData.value = null
			readersError.value = '模拟失败：' + (e?.response?.data?.message || e?.message || '未知错误')
		} finally {
			readersLoading.value = false
		}
	}

	const openReaders = () => {
		readersVisible.value = true
		runReaders()
	}

	onMounted(runCheck)
</script>

<style scoped lang="scss" src="./projectHealthPanel.scss"></style>
