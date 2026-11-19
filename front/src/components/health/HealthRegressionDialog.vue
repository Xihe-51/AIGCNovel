<template>
	<el-dialog
		v-model="visibleModel"
		title="自动全分支试玩（剧情回归）"
		width="720px"
		append-to-body
	>
		<div v-if="loading" class="hp-note">正在按播放器运行时规则推演所有可行分支…</div>
		<div v-else-if="error" class="hp-error">{{ error }}</div>
		<template v-else-if="data">
			<div class="pt-summary">
				<div class="pt-stat">
					<span class="pt-stat-num">{{ data.summary.path_count }}</span>
					<span class="pt-stat-label">可行路线</span>
				</div>
				<div :class="['pt-stat', data.summary.ending_reached ? 'is-good' : 'is-bad']">
					<span class="pt-stat-num">{{ data.summary.ending_reached }}/{{ data.summary.ending_total }}</span>
					<span class="pt-stat-label">结局可达</span>
				</div>
				<div class="pt-stat">
					<span class="pt-stat-num">{{ data.summary.node_pct }}%</span>
					<span class="pt-stat-label">节点覆盖</span>
				</div>
				<div :class="['pt-stat', data.summary.dead_end_count ? 'is-bad' : 'is-good']">
					<span class="pt-stat-num">{{ data.summary.dead_end_count }}</span>
					<span class="pt-stat-label">死路</span>
				</div>
				<div :class="['pt-stat', data.summary.gated_choice_count ? 'is-warn' : 'is-good']">
					<span class="pt-stat-num">{{ data.summary.gated_choice_count }}</span>
					<span class="pt-stat-label">永锁选项</span>
				</div>
				<div :class="['pt-stat', data.summary.locked_scene_count ? 'is-warn' : 'is-good']">
					<span class="pt-stat-num">{{ data.summary.locked_scene_count }}</span>
					<span class="pt-stat-label">锁住场景</span>
				</div>
			</div>
			<div v-if="data.summary.capped" class="pt-note">
				分支过多，已截断推演（运行上限会随项目节点数调整）。
			</div>

			<div class="pt-section-title">未达成结局（{{ data.endings.missed.length }}）</div>
			<div class="pt-path-list">
				<div
					v-for="e in data.endings.missed"
					:key="e.ending_id"
					class="pt-dead"
					@click="e.content_id && locate(nodeSceneMap[e.content_id], e.content_id)"
				>
					<span class="pt-end dead">未达</span>
					<span class="pt-dead-text">{{ e.title }}<template v-if="e.conditions">：{{ e.conditions }}</template></span>
				</div>
				<div v-if="!data.endings.missed.length" class="hp-note">所有结局都能走到。</div>
			</div>

			<template v-if="data.dead_ends.length">
				<div class="pt-section-title">死路（{{ data.dead_ends.length }}）</div>
				<div
					v-for="(d, di) in data.dead_ends"
					:key="di"
					class="pt-dead"
					@click="locate(d.scene_id, d.content_id)"
				>
					<span class="pt-end dead">死路</span>
					<span class="pt-dead-text">{{ d.scene_title }} · {{ d.text || '场景末尾' }}：{{ d.reason }}</span>
				</div>
			</template>

			<template v-if="data.gated_choices.length">
				<div class="pt-section-title">永远锁住的选项（{{ data.gated_choices.length }}）</div>
				<div
					v-for="c in data.gated_choices"
					:key="c.path_id"
					class="pt-dead"
					@click="locate(nodeSceneMap[c.from], c.from)"
				>
					<span class="pt-end dead">锁</span>
					<span class="pt-dead-text">#{{ c.from }} 的选项：{{ c.conditions }}</span>
				</div>
			</template>

			<template v-if="data.locked_scenes.length">
				<div class="pt-section-title">永远锁住的场景（{{ data.locked_scenes.length }}）</div>
				<div
					v-for="s in data.locked_scenes"
					:key="s.scene_id"
					class="pt-dead"
					@click="locate(s.scene_id, null)"
				>
					<span class="pt-end dead">锁</span>
					<span class="pt-dead-text">{{ s.title }}：{{ s.conditions }}</span>
				</div>
			</template>

			<template v-if="data.unvisited_nodes.length">
				<div class="pt-section-title">未走到的节点（{{ data.unvisited_nodes.length }}）</div>
				<div class="pt-path-list">
					<div
						v-for="n in data.unvisited_nodes"
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
			<el-button @click="visibleModel = false">关闭</el-button>
			<el-button type="primary" :loading="loading" @click="run">重新推演</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { getStoryRegression } from '@/api/patrol'
import type { StoryRegression } from '@/api/patrol'
import { useHealthReport } from '@/composables/project/useHealthReport'

const props = defineProps<{
	visible: boolean
	projectId: string | number
	nodeSceneMap: Record<number, number>
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'locate', sceneId: number, contentId: number | null): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const { loading, data, error, run } = useHealthReport<StoryRegression>({
	projectId: () => props.projectId,
	fetch: getStoryRegression,
	errorLabel: '推演失败',
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
