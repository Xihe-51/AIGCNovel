<template>
	<div class="effect-editor">
		<div
			v-for="(eff, ei) in effects"
			:key="ei"
			class="effect-row"
		>
			<el-select
				v-model="eff.variable_id"
				size="small"
				placeholder="变量"
				class="effect-var"
			>
				<el-option
					v-for="v in variables"
					:key="v.variable_id"
					:label="v.label"
					:value="v.variable_id"
				></el-option>
			</el-select>
			<el-input-number
				v-model="eff.delta"
				size="small"
				:step="1"
				class="effect-delta"
			/>
			<el-button
				size="small"
				type="danger"
				icon="Delete"
				@click="emit('remove-effect', ei)"
			/>
		</div>

		<div class="effect-actions">
			<el-button size="small" icon="Plus" @click="emit('add-effect')"
					   :disabled="!variables.length">添加数值</el-button>
			<el-button size="small" type="primary"
					   :disabled="!hasContentId"
					   @click="emit('save-effects')">保存数值</el-button>
		</div>
		<div class="choice-hint" v-if="!variables.length">
			先在「项目 → 变量」里创建变量（如好感度）
		</div>
		<div class="choice-hint" v-else-if="!hasContentId">
			请先点「保存」保存本条内容，之后才能配置数值变化
		</div>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	effects: any[]
	variables: any[]
	hasContentId: boolean
}>()

const emit = defineEmits<{
	(e: 'add-effect'): void
	(e: 'remove-effect', effectIndex: number): void
	(e: 'save-effects'): void
}>()
</script>

<style scoped src="./dialogueEffectEditor.css"></style>
