<template>
	<el-dialog
		v-model="visibleModel"
		title="配音导演"
		width="560px"
		append-to-body
	>
		<div class="director-section">
			<div class="director-section-title">场景情绪分布</div>
			<template v-if="sceneTotal">
				<div class="director-dist-bar">
					<div
						v-for="row in distSegments"
						:key="row.emotion"
						class="director-dist-seg"
						:class="emotionClass(row.emotion)"
						:style="{ width: row.percent + '%' }"
						:title="`${row.emotion} ${row.count} 条`"
					></div>
				</div>
				<div class="director-dist-legend">
					<span v-for="row in statRows" :key="row.emotion" class="director-dist-item">
						<i class="director-dot" :class="emotionClass(row.emotion)"></i>
						{{ row.emotion }} {{ row.count }}
					</span>
				</div>
			</template>
			<div v-else class="director-empty">当前场景还没有可标注情绪的台词。</div>
		</div>

		<div class="director-section">
			<div class="director-section-title">自动标注情绪</div>
			<div class="director-toolbar">
				<el-select v-model="scopeModel" size="small" style="width: 180px" :disabled="running">
					<el-option :label="`本场景全部台词（${sceneVoicableCount}）`" value="all" />
					<el-option :label="`仅选中的 ${selectedCount} 条`" value="selected" :disabled="!selectedCount" />
				</el-select>
				<label class="voice-batch-check">
					<input v-model="onlyUnlabeledModel" type="checkbox" :disabled="running" />
					<span>仅补全未标注情绪</span>
				</label>
				<el-button size="small" type="primary" :loading="running" @click="emit('tag')">
					识别情绪
				</el-button>
			</div>
			<div v-if="rows.length" class="director-suggest-list">
				<div v-for="row in rows" :key="row.index" class="director-suggest-row">
					<el-checkbox v-model="row.checked" />
					<div class="director-suggest-main">
						<div class="director-suggest-text">#{{ row.index + 1 }} {{ row.text || '（空台词）' }}</div>
						<div class="director-suggest-reason">
							建议依据：{{ row.reason }}
							<span v-if="row.confidence === 'low'" class="director-low">（低置信，可手动改）</span>
						</div>
					</div>
					<el-select v-model="row.emotion" size="small" style="width: 100px">
						<el-option v-for="e in emotionOptions" :key="e" :label="e" :value="e" />
					</el-select>
				</div>
			</div>
			<div v-else class="director-empty">选择范围后点击「识别情绪」，确认建议后应用为标签。</div>
		</div>

		<template #footer>
			<el-button @click="visibleModel = false">关闭</el-button>
			<el-button type="primary" :disabled="!rows.length" @click="emit('apply')">
				应用标注（{{ checkedCount }}）
			</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface EmotionStatRow {
	emotion: string
	count: number
	percent: number
}

interface EmotionTagRow {
	index: number
	text: string
	emotion: string
	reason: string
	confidence: string
	checked: boolean
}

const props = defineProps<{
	visible: boolean
	emotionOptions: string[]
	statRows: EmotionStatRow[]
	sceneTotal: number
	sceneVoicableCount: number
	selectedCount: number
	rows: EmotionTagRow[]
	running: boolean
	checkedCount: number
	scope: string
	onlyUnlabeled: boolean
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'update:scope', value: string): void
	(e: 'update:onlyUnlabeled', value: boolean): void
	(e: 'tag'): void
	(e: 'apply'): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const scopeModel = computed({
	get: () => props.scope,
	set: (value: string) => emit('update:scope', value),
})

const onlyUnlabeledModel = computed({
	get: () => props.onlyUnlabeled,
	set: (value: boolean) => emit('update:onlyUnlabeled', value),
})

const distSegments = computed(() => props.statRows.filter(row => row.count > 0))

const emotionClass = (emotion: string) => ({
	'平静': 'emotion-calm',
	'犹豫': 'emotion-hesitate',
	'生气': 'emotion-angry',
	'哭腔': 'emotion-cry',
	'低声': 'emotion-whisper',
	'未标注': 'emotion-none'
}[emotion] || 'emotion-none')
</script>

<style src="./voiceDialog.css"></style>
