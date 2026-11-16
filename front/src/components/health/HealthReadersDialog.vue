<template>
	<el-dialog
		v-model="visibleModel"
		title="合成读者报告（规则版）"
		width="820px"
		append-to-body
	>
		<div v-if="loading" class="hp-note">正在模拟速通 / 全收集 / 恋爱线 / 低耐心四类读者…</div>
		<div v-else-if="error" class="hp-error">{{ error }}</div>
		<template v-else-if="data">
			<div class="sr-grid">
				<div v-for="r in data.readers" :key="r.key" class="sr-card">
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

			<section v-if="data.aggregate.ignored_options.length" class="sr-section">
				<h4 class="hp-section-title">被所有读者冷落的选项（{{ data.aggregate.ignored_option_count }}）</h4>
				<div
					v-for="opt in data.aggregate.ignored_options"
					:key="opt.path_id"
					class="pt-dead"
					@click="opt.scene_id && locate(opt.scene_id, opt.content_id)"
				>
					<span class="pt-end dead">冷落</span>
					<span class="pt-dead-text">{{ opt.scene_title }} · {{ opt.choice_text }}（{{ opt.source_text }}）</span>
				</div>
			</section>

			<section v-if="data.aggregate.impossible_choices.length" class="sr-section">
				<h4 class="hp-section-title">明显永假的条件（{{ data.aggregate.impossible_choice_count }}）</h4>
				<div
					v-for="opt in data.aggregate.impossible_choices"
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
				<span v-if="data.aggregate.endings_seen.length">本次触达结局：{{ data.aggregate.endings_seen.join('、') }}</span>
			</div>
		</template>
		<template #footer>
			<el-button @click="visibleModel = false">关闭</el-button>
			<el-button type="primary" :loading="loading" @click="run">重新模拟</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { getSyntheticReaders } from '@/api/readers'
import type { SyntheticReaders } from '@/api/readers'
import { useHealthReport } from '@/composables/project/useHealthReport'
import { stopReasonClass, stopReasonLabel } from '@/utils/projectHealth'

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

const { loading, data, error, run } = useHealthReport<SyntheticReaders>({
	projectId: () => props.projectId,
	fetch: getSyntheticReaders,
	errorLabel: '模拟失败',
})

const stopLabel = stopReasonLabel
const stopClass = stopReasonClass

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
@use './healthReadersDialog';
</style>
