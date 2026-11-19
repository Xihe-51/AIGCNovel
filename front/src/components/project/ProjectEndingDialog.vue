<template>
	<el-dialog
		v-model="visibleModel"
		:title="editingId ? '编辑结局' : '新建结局'"
		width="560px"
		class="custom-dialog"
	>
		<el-form label-position="top">
			<el-form-item label="结局标题" required>
				<el-input v-model="form.title" placeholder="如：林瑶的告白" />
			</el-form-item>
			<el-form-item label="结局描述">
				<el-input v-model="form.description" type="textarea" :rows="3" placeholder="结局页展示的文字" />
			</el-form-item>
			<el-form-item label="触发节点" required>
				<el-select v-model="form.content_id" placeholder="选择到达哪个节点时判定" style="width: 100%" filterable>
					<el-option
						v-for="n in nodeOptions"
						:key="n.content_id"
						:label="n.label"
						:value="n.content_id"
					/>
				</el-select>
			</el-form-item>
			<el-form-item label="触发条件（全部成立）">
				<div class="ending-conditions">
					<div v-for="(c, ci) in form.conditions" :key="ci" class="ending-condition-row">
						<el-select v-model="c.variable" size="small" placeholder="变量" class="condition-var">
							<el-option v-for="v in variables" :key="v.variable_id" :label="v.label" :value="v.name" />
						</el-select>
						<el-select v-model="c.op" size="small" class="condition-op">
							<el-option label="≥" value=">=" />
							<el-option label=">" value=">" />
							<el-option label="≤" value="<=" />
							<el-option label="<" value="<" />
							<el-option label="=" value="==" />
							<el-option label="≠" value="!=" />
						</el-select>
						<el-input-number v-model="c.value" size="small" :step="1" class="condition-value" />
						<button type="button" class="action-btn delete" @click="removeCondition(ci)">删除</button>
					</div>
					<button type="button" class="action-btn" @click="addCondition">添加条件</button>
				</div>
			</el-form-item>
		</el-form>
		<template #footer>
			<button class="dialog-btn cancel" @click="visibleModel = false">取消</button>
			<button class="dialog-btn confirm" @click="submit" :disabled="saving">保存</button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { EndingPayload } from '@/api/ending'

interface NodeOption {
	content_id: number
	label: string
}

const props = defineProps<{
	visible: boolean
	saving: boolean
	editingId: number | null
	initial: any | null
	nodeOptions: NodeOption[]
	variables: any[]
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'save', payload: { endingId: number | null; payload: EndingPayload }): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const form = ref<any>({ title: '', description: '', content_id: null, conditions: [] })

watch(
	() => props.visible,
	(open: boolean) => {
		if (!open) return
		const row = props.initial
		form.value = row
			? {
				title: row.title || '',
				description: row.description || '',
				content_id: row.content_id ?? null,
				conditions: (row.conditions || []).map((c: any) => ({ ...c }))
			}
			: { title: '', description: '', content_id: null, conditions: [] }
	}
)

const addCondition = () => {
	form.value.conditions.push({ variable: '', op: '>=', value: 0 })
}

const removeCondition = (index: number) => {
	form.value.conditions.splice(index, 1)
}

const submit = () => {
	const title = String(form.value.title || '').trim()
	if (!title) {
		ElMessage.warning('请填写结局标题')
		return
	}
	if (!form.value.content_id) {
		ElMessage.warning('请选择触发节点')
		return
	}
	const conditions = form.value.conditions
		.filter((c: any) => c.variable)
		.map((c: any) => ({
			variable: c.variable,
			op: c.op || '>=',
			value: Math.trunc(Number(c.value) || 0)
		}))
	emit('save', {
		endingId: props.editingId,
		payload: {
			title,
			description: String(form.value.description || '').trim(),
			content_id: form.value.content_id,
			conditions
		}
	})
}
</script>

<style src="./projectDialog.css"></style>
