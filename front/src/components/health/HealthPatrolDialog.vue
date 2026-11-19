<template>
	<el-dialog
		v-model="visibleModel"
		title="自动分支巡检"
		width="720px"
		append-to-body
	>
		<div v-if="loading" class="hp-note">正在遍历所有分支…</div>
		<div v-else-if="error" class="hp-error">{{ error }}</div>
		<template v-else-if="data">
			<div class="pt-summary">
				<div class="pt-stat">
					<span class="pt-stat-num">{{ data.summary.path_count }}</span>
					<span class="pt-stat-label">路径</span>
				</div>
				<div class="pt-stat is-good">
					<span class="pt-stat-num">{{ data.summary.complete_paths }}</span>
					<span class="pt-stat-label">到结局</span>
				</div>
				<div :class="['pt-stat', data.summary.dead_end_paths ? 'is-bad' : 'is-good']">
					<span class="pt-stat-num">{{ data.summary.dead_end_paths }}</span>
					<span class="pt-stat-label">死路</span>
				</div>
				<div :class="['pt-stat', data.summary.loop_paths ? 'is-warn' : 'is-good']">
					<span class="pt-stat-num">{{ data.summary.loop_paths }}</span>
					<span class="pt-stat-label">环路路径</span>
				</div>
				<div :class="['pt-stat', data.summary.unreachable_nodes ? 'is-bad' : 'is-good']">
					<span class="pt-stat-num">{{ data.summary.unreachable_nodes }}</span>
					<span class="pt-stat-label">不可达节点</span>
				</div>
			</div>
			<div v-if="data.summary.capped" class="pt-note">
				路径数量过多，已截断统计（最多 2000 条）。
			</div>

			<div class="pt-section-title">路径（展示前 {{ data.paths.length }} 条）</div>
			<div class="pt-path-list">
				<div v-for="(p, pi) in data.paths" :key="pi" class="pt-path">
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
				<div v-if="!data.paths.length" class="hp-note">没有可遍历的路径。</div>
			</div>

			<template v-if="data.dead_ends.length">
				<div class="pt-section-title">死路节点（走到这里没结局也没后续）</div>
				<div
					v-for="d in data.dead_ends"
					:key="d.content_id"
					class="pt-dead"
					@click="locate(d.scene_id, d.content_id)"
				>
					<span class="pt-end dead">死路</span>
					<span class="pt-dead-text">{{ d.scene_title }} · {{ d.text }}</span>
					<span class="pt-dead-count">{{ d.path_count }} 条路径</span>
				</div>
			</template>

			<template v-if="data.cycles.length">
				<div class="pt-section-title">环路</div>
				<div v-for="(c, ci) in data.cycles" :key="ci" class="pt-cycle">
					{{ c.nodes.map(n => n.scene_title + ' · ' + n.text).join(' → ') }}
				</div>
			</template>
		</template>

		<template #footer>
			<el-button @click="visibleModel = false">关闭</el-button>
			<el-button type="primary" :loading="loading" @click="run">重新巡检</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { getStoryPatrol } from '@/api/patrol'
import type { StoryPatrol } from '@/api/patrol'
import { useHealthReport } from '@/composables/project/useHealthReport'

const props = defineProps<{
	visible: boolean
	projectId: string | number
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'locate', sceneId: number, contentId: number | null): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const { loading, data, error, run } = useHealthReport<StoryPatrol>({
	projectId: () => props.projectId,
	fetch: getStoryPatrol,
	errorLabel: '巡检失败',
})

const locate = (sceneId?: number, contentId?: number | null) => {
	if (!sceneId) return
	emit('locate', Number(sceneId), contentId ?? null)
}

watch(
	() => props.visible,
	(open) => {
		if (open) void run()
	},
)
</script>

<style scoped lang="scss">
@use './healthPathStyles';
</style>
