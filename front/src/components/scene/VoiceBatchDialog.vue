<template>
	<el-dialog
		v-model="visibleModel"
		title="批量配音"
		width="460px"
		append-to-body
		:close-on-click-modal="!running"
		:close-on-press-escape="!running"
		:show-close="!running"
	>
		<div class="voice-batch-hint">
			将按当前筛选处理 <b>{{ queue.length }}</b> 条台词（已选 {{ selectedCount }} 条），生成后写入对应台词的配音。
		</div>
		<div class="voice-batch-row">
			<span class="voice-batch-label">音色</span>
			<el-select v-model="voice" size="small" class="voice-batch-select" :disabled="running">
				<el-option
					v-for="v in voiceOptions"
					:key="v.value"
					:label="v.label"
					:value="v.value"
				/>
			</el-select>
		</div>
		<div class="voice-batch-row">
			<span class="voice-batch-label">情绪</span>
			<el-select v-model="emotionFilter" size="small" class="voice-batch-select" :disabled="running">
				<el-option label="全部情绪" value="all" />
				<el-option label="仅未标注情绪" value="none" />
				<el-option v-for="e in emotionOptions" :key="e" :label="`仅 ${e}`" :value="e" />
			</el-select>
		</div>
		<div class="voice-batch-checks">
			<label class="voice-batch-check">
				<input v-model="overwrite" type="checkbox" :disabled="running" />
				<span>覆盖已有配音</span>
			</label>
			<label class="voice-batch-check">
				<input v-model="useCharacter" type="checkbox" :disabled="running" />
				<span>优先使用角色默认音色（角色未设置时用上面的音色）</span>
			</label>
			<label class="voice-batch-check">
				<input v-model="useEmotion" type="checkbox" :disabled="running" />
				<span>按台词情绪调整语速/音调（生气更快、低声更慢、哭腔更轻）</span>
			</label>
			<label class="voice-batch-check">
				<input v-model="autoTag" type="checkbox" :disabled="running" />
				<span>未标注情绪的台词先自动识别（规则推断，仅补全空白）</span>
			</label>
		</div>
		<div v-if="running" class="voice-batch-progress">
			正在生成 {{ done }} / {{ total }}
			<div class="voice-batch-bar">
				<div class="voice-batch-bar-fill" :style="{ width: percent + '%' }"></div>
			</div>
			<div class="voice-batch-current">{{ current }}</div>
		</div>
		<div v-if="errors.length" class="voice-batch-errors">
			失败 {{ errors.length }} 条：{{ errors.join('；') }}
		</div>
		<template #footer>
			<el-button :disabled="running" @click="visibleModel = false">关闭</el-button>
			<el-button type="primary" :loading="running" @click="startRun">
				{{ running ? '生成中…' : '开始生成' }}
			</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface BatchItem {
	index: number
	dialogue: any
}

const props = defineProps<{
	visible: boolean
	items: BatchItem[]
	selectedCount: number
	emotionOptions: string[]
	running: boolean
	done: number
	total: number
	current: string
	errors: string[]
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'run', payload: {
		voice: string
		emotionFilter: string
		overwrite: boolean
		useCharacter: boolean
		useEmotion: boolean
		autoTag: boolean
		queue: number[]
	}): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const voiceOptions = [
	{ value: 'BV001_streaming', label: '通用女声 · 童声偏亮' },
	{ value: 'BV002_streaming', label: '通用男声 · 沉稳' },
	{ value: 'BV700_streaming', label: '通用女声 · 知性' },
	{ value: 'BV705_streaming', label: '通用女声 · 活泼' },
	{ value: 'BV701_streaming', label: '通用男声 · 磁性' },
]

const voice = ref('BV001_streaming')
const overwrite = ref(false)
const useCharacter = ref(true)
const useEmotion = ref(true)
const autoTag = ref(true)
const emotionFilter = ref('all')

const emotionFilterMatches = (dialogue: any) => {
	const filter = emotionFilter.value
	if (filter === 'all') return true
	// 非标准值一律视为未标注，避免历史脏数据绕过筛选
	const labeled = props.emotionOptions.includes(dialogue.emotion)
	if (filter === 'none') return !labeled
	return dialogue.emotion === filter
}

// 队列预览：与父级实际执行的筛选条件保持一致
const queue = computed(() => props.items.filter(({ dialogue }) => {
	const d = dialogue
	return d &&
		d.content_type !== '选择' &&
		String(d.content_text || '').trim() &&
		(overwrite.value || !d.voice_url) &&
		emotionFilterMatches(d)
}))

const percent = computed(() =>
	props.total ? Math.round(props.done * 100 / props.total) : 0
)

const startRun = () => {
	emit('run', {
		voice: voice.value,
		emotionFilter: emotionFilter.value,
		overwrite: overwrite.value,
		useCharacter: useCharacter.value,
		useEmotion: useEmotion.value,
		autoTag: autoTag.value,
		queue: queue.value.map(item => item.index),
	})
}
</script>

<style src="./voiceDialog.css"></style>
