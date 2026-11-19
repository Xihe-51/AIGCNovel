<template>
	<el-dialog
		v-model="visibleModel"
		title="批量导入剧本"
		width="560px"
		append-to-body
	>
		<div class="import-hint">
			每行一条，支持下面两种写法；角色名要和项目里已有角色一致，其他行按旁白处理。
			<div class="import-example">【林瑶】暮尘，我也要。</div>
			<div class="import-example">林瑶：暮尘，我也要。</div>
		</div>
		<el-input
			v-model="text"
			type="textarea"
			:rows="10"
			resize="none"
			placeholder="在这里粘贴剧本…"
		/>
		<div class="import-mode">
			<span class="import-mode-label">导入方式</span>
			<label class="import-radio"><input type="radio" value="append" v-model="mode" /> 追加到末尾</label>
			<label class="import-radio"><input type="radio" value="replace" v-model="mode" /> 替换全部</label>
		</div>
		<template #footer>
			<el-button @click="visibleModel = false">取消</el-button>
			<el-button type="primary" @click="submit">导入</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface ScriptEntry {
	name: string
	text: string
}

const props = defineProps<{
	visible: boolean
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'import', payload: { mode: string; entries: ScriptEntry[] }): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const text = ref('')
const mode = ref('append')

watch(
	() => props.visible,
	(open: boolean) => {
		if (!open) return
		text.value = ''
		mode.value = 'append'
	}
)

const stripQuotes = (s: string) => {
	let t = String(s || '').trim()
	const pairs = [['“', '”'], ['"', '"'], ['「', '」'], ['‘', '’']]
	for (const [l, r] of pairs) {
		if (t.startsWith(l) && t.endsWith(r)) {
			t = t.slice(1, -1).trim()
			break
		}
	}
	return t
}

const parseLine = (line: string): ScriptEntry | null => {
	const raw = String(line || '').trim()
	if (!raw) return null
	let m = raw.match(/^【([^】]{1,24})】\s*(.+)$/)
	if (m) return { name: m[1].trim(), text: stripQuotes(m[2]) }
	m = raw.match(/^([^：:]{1,12})[：:]\s*(.+)$/)
	if (m) return { name: m[1].trim(), text: stripQuotes(m[2]) }
	return { name: '', text: stripQuotes(raw) }
}

const submit = () => {
	const entries = text.value
		.split(/\r?\n/)
		.map(parseLine)
		.filter(Boolean) as ScriptEntry[]
	emit('import', { mode: mode.value, entries })
}
</script>

<style scoped>
/* 批量导入剧本 */
.import-hint {
  font-size: 12px;
  color: #8a6a76;
  line-height: 1.7;
  margin-bottom: 10px;
}

.import-example {
  margin-top: 4px;
  padding: 4px 8px;
  background: #fdf3f7;
  border: 1px dashed #f0cfdc;
  border-radius: 6px;
  color: #a84463;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
}

.import-mode {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 10px;
  font-size: 12px;
  color: #8a6a76;
}

.import-mode-label {
  color: #a84463;
}

.import-radio {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}

.import-radio input {
  accent-color: #e8467c;
}
</style>
