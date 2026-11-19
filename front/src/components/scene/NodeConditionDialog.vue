<template>
	<el-dialog v-model="visibleModel" title="台词显示条件" width="470px" append-to-body>
		<div class="node-cond-target">当前台词：{{ targetLabel || '（空）' }}</div>
		<div class="node-cond-hint">条件不满足时，顺序播放会跳过这条台词；不填变量表示无条件。</div>
		<div v-if="draftItems.length > 1" class="scene-lock-mode">
			<span class="scene-lock-mode-label">条件关系</span>
			<el-radio-group v-model="mode" size="small">
				<el-radio-button value="and">全部满足</el-radio-button>
				<el-radio-button value="or">任一满足</el-radio-button>
			</el-radio-group>
		</div>
		<div v-for="(c, ci) in draftItems" :key="ci" class="scene-lock-row">
			<el-select v-model="c.variable" size="small" clearable placeholder="变量" class="condition-var">
				<el-option
					v-for="v in variables"
					:key="v.variable_id"
					:label="v.label"
					:value="v.name"
				></el-option>
			</el-select>
			<el-select v-model="c.op" size="small" class="condition-op" :disabled="!c.variable">
				<el-option label="≥" value=">=" />
				<el-option label=">" value=">" />
				<el-option label="≤" value="<=" />
				<el-option label="<" value="<" />
				<el-option label="=" value="==" />
				<el-option label="≠" value="!=" />
			</el-select>
			<el-input-number
				v-model="c.value"
				size="small"
				:step="1"
				:disabled="!c.variable"
				class="condition-value"
			/>
			<el-button size="small" type="danger" plain icon="Delete" @click="removeItem(ci)" />
		</div>
		<div class="scene-lock-actions">
			<el-button size="small" icon="Plus" @click="addItem">添加条件</el-button>
		</div>
		<template #footer>
			<el-button size="small" @click="visibleModel = false">取消</el-button>
			<el-button size="small" @click="emit('clear')">清除条件</el-button>
			<el-button size="small" type="primary" @click="apply">确定</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { NodeConditionItem } from '@/utils/scene'

const props = defineProps<{
	visible: boolean
	targetLabel: string
	mode: string
	items: NodeConditionItem[]
	variables: any[]
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'apply', payload: { mode: string; items: NodeConditionItem[] }): void
	(e: 'clear'): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const draftItems = ref<NodeConditionItem[]>([])
const mode = ref('and')

watch(
	() => props.visible,
	(open: boolean) => {
		if (!open) return
		mode.value = props.mode === 'or' ? 'or' : 'and'
		draftItems.value = (props.items || []).map(item => ({
			variable: item.variable || '',
			op: item.op || '>=',
			value: Math.trunc(Number(item.value) || 0),
		}))
	}
)

const addItem = () => {
	draftItems.value.push({ variable: '', op: '>=', value: 0 })
}

const removeItem = (index: number) => {
	draftItems.value.splice(index, 1)
}

const apply = () => {
	emit('apply', {
		mode: mode.value,
		items: draftItems.value.map(item => ({ ...item })),
	})
}
</script>

<style src="./nodeConditionDialog.css"></style>
