<template>
	<div class="hp-root">
		<div class="hp-head">
			<span class="hp-title">发布前自检</span>
			<div class="hp-actions">
				<button class="hp-run" @click="patrolVisible = true">自动巡检</button>
				<button class="hp-run" @click="regressionVisible = true">全分支试玩</button>
				<button class="hp-run" @click="readersVisible = true">合成读者</button>
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

		<HealthPatrolDialog
			v-model:visible="patrolVisible"
			:project-id="projectId"
			@locate="locate"
		/>
		<HealthRegressionDialog
			v-model:visible="regressionVisible"
			:project-id="projectId"
			:node-scene-map="nodeSceneMap"
			@locate="locate"
		/>
		<HealthReadersDialog
			v-model:visible="readersVisible"
			:project-id="projectId"
			@locate="locate"
		/>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import HealthPatrolDialog from '@/components/health/HealthPatrolDialog.vue'
import HealthRegressionDialog from '@/components/health/HealthRegressionDialog.vue'
import HealthReadersDialog from '@/components/health/HealthReadersDialog.vue'
import { useProjectHealthCheck } from '@/composables/project/useProjectHealthCheck'
import { buildHealthReport } from '@/utils/projectHealth'
import { downloadFile } from '@/utils/download'

const props = defineProps<{
	projectId: string | number
}>()

const emit = defineEmits<{
	(e: 'locate', sceneId: number, contentId: number | null): void
}>()

const {
	loading,
	error,
	missingAssets,
	errors,
	warnings,
	endings,
	unreachableEndings,
	healthy,
	nodeSceneMap,
	reachableEndingCount,
	runCheck,
	locate,
	locateIssue,
} = useProjectHealthCheck({
	projectId: () => props.projectId,
	onLocate: (sceneId, contentId) => emit('locate', sceneId, contentId),
})

const patrolVisible = ref(false)
const regressionVisible = ref(false)
const readersVisible = ref(false)

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
	downloadFile(text, `项目${props.projectId}-自检报告.txt`, 'text/plain;charset=utf-8')
}

onMounted(runCheck)
</script>

<style scoped lang="scss" src="./projectHealthPanel.scss"></style>
