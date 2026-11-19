<template>
	<el-dialog
		v-model="visibleModel"
		:title="dialogTitle"
		width="600px"
		class="ai-dialog"
		:close-on-click-modal="false"
		append-to-body
	>
		<div class="ai-dialog-content">
			<div class="ai-question-section">
				<h4>你的问题</h4>
				<el-input
					v-model="questionModel"
					type="textarea"
					:rows="4"
					placeholder="请输入你的问题，例如：'生成一个关于告白的对话' 或 '帮我想一段悲伤的台词'"
				/>
			</div>

			<div v-if="answer" class="ai-answer-section">
				<h4>AI 回答</h4>
				<div v-if="refs.length" class="ai-refs">
					<span class="ai-refs-label">本次参考角色设定：</span>
					<el-tag
						v-for="r in refs"
						:key="r.character_id"
						size="small"
						effect="plain"
						class="ai-ref-tag"
					>{{ r.name }}</el-tag>
				</div>
				<div class="answer-box">
					<p>{{ answer }}</p>
				</div>
				<div class="answer-actions">
					<el-button size="small" type="success" @click="emit('apply')">应用到当前对话</el-button>
					<el-button size="small" @click="emit('clear-answer')">清空回答</el-button>
				</div>
			</div>

			<div v-if="loading" class="ai-loading">
				<span class="ui-spinner ui-spinner-sm"></span>
				<p>{{ stage || 'AI 正在思考中...' }}</p>
			</div>
		</div>

		<template #footer>
			<div class="dialog-footer">
				<el-button @click="visibleModel = false">取消</el-button>
				<el-button type="primary" :loading="loading" :disabled="!question.trim()" @click="emit('send')">
					<el-icon><Promotion /></el-icon> 发送问题
				</el-button>
			</div>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Promotion } from '@element-plus/icons-vue'

const props = defineProps<{
	visible: boolean
	index: number | null
	question: string
	answer: string
	refs: any[]
	loading: boolean
	stage: string
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'update:question', value: string): void
	(e: 'send'): void
	(e: 'apply'): void
	(e: 'clear-answer'): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const questionModel = computed({
	get: () => props.question,
	set: (value: string) => emit('update:question', value),
})

const dialogTitle = computed(() =>
	'AI 对话生成 - ' + (props.index !== null ? '第' + (props.index + 1) + '条对话' : '')
)
</script>

<style src="./aiAssistDialog.css"></style>
