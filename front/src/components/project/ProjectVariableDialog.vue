<template>
	<el-dialog
		v-model="visibleModel"
		:title="editingId ? '编辑变量' : '新建变量'"
		width="480px"
		class="custom-dialog"
	>
		<el-form label-position="top">
			<el-form-item label="展示名" required>
				<el-input v-model="form.label" placeholder="如：林瑶好感度" />
			</el-form-item>
			<el-form-item label="变量名（英文 key）" required>
				<el-input v-model="form.name" placeholder="affection_lin" :disabled="!!editingId" />
			</el-form-item>
			<el-form-item label="初始值">
				<el-input v-model="form.initial_value" placeholder="0" />
			</el-form-item>
			<el-form-item label="绑定角色（可选，用于好感度面板）">
				<el-select v-model="form.character_id" clearable placeholder="不绑定角色" style="width: 100%">
					<el-option
						v-for="c in characters"
						:key="c.character_id"
						:label="c.name"
						:value="String(c.character_id)"
					/>
				</el-select>
			</el-form-item>
			<div class="variable-range">
				<el-form-item label="最小值">
					<el-input v-model="form.min_value" placeholder="留空表示不限" />
				</el-form-item>
				<el-form-item label="最大值">
					<el-input v-model="form.max_value" placeholder="留空表示不限" />
				</el-form-item>
			</div>
			<el-form-item label="说明">
				<el-input v-model="form.description" placeholder="可选" />
			</el-form-item>
			<el-form-item label="跨周目保留">
				<el-switch v-model="form.persist" />
				<span class="variable-persist-tip">开启后，重新开始/进入下一周目时保留该变量的当前值</span>
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

const props = defineProps<{
	visible: boolean
	saving: boolean
	editingId: number | null
	initial: any | null
	characters: any[]
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'save', payload: { variableId: number | null; payload: Record<string, any> }): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const emptyForm = () => ({
	label: '',
	name: '',
	character_id: '',
	initial_value: '0',
	min_value: '',
	max_value: '',
	description: '',
	persist: false
})

const form = ref<any>(emptyForm())

watch(
	() => props.visible,
	(open: boolean) => {
		if (!open) return
		const row = props.initial
		form.value = row
			? {
				label: row.label || '',
				name: row.name || '',
				character_id: row.character_id ? String(row.character_id) : '',
				initial_value: String(row.initial_value ?? 0),
				min_value: row.min_value == null ? '' : String(row.min_value),
				max_value: row.max_value == null ? '' : String(row.max_value),
				description: row.description || '',
				persist: !!row.persist
			}
			: emptyForm()
	}
)

const parseOptionalInt = (value: any) => {
	if (value === '' || value === null || value === undefined) return null
	const n = Number(value)
	return Number.isFinite(n) ? Math.trunc(n) : null
}

const submit = () => {
	const label = String(form.value.label || '').trim()
	const name = String(form.value.name || '').trim()
	if (!label) {
		ElMessage.warning('请填写展示名')
		return
	}
	if (!/^[A-Za-z_][A-Za-z0-9_]{0,49}$/.test(name)) {
		ElMessage.warning('变量名只能包含字母/数字/下划线，且以字母或下划线开头')
		return
	}
	emit('save', {
		variableId: props.editingId,
		payload: {
			name,
			label,
			character_id: form.value.character_id ? Number(form.value.character_id) : null,
			initial_value: parseOptionalInt(form.value.initial_value) ?? 0,
			min_value: parseOptionalInt(form.value.min_value),
			max_value: parseOptionalInt(form.value.max_value),
			description: String(form.value.description || '').trim(),
			persist: !!form.value.persist
		}
	})
}
</script>

<style src="./projectDialog.css"></style>
