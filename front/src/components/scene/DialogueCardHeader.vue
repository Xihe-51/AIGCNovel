<template>
	<div class="dialogue-header">
		<div class="dialogue-header-left">
			<el-checkbox
				class="dlg-select"
				:model-value="selected"
				@change="emit('toggle-select')"
				@click.stop
			/>
			<span class="dialogue-index">{{ index + 1 }}</span>
			<el-dropdown trigger="click" @command="(cmd: string) => emit('set-fsm', cmd)">
				<span class="fsm-badge" :class="fsmState">
					{{ fsmStateLabels[fsmState] }}
				</span>
				<template #dropdown>
					<el-dropdown-menu>
						<el-dropdown-item
							v-for="s in fsmStates"
							:key="s.value"
							:command="s.value"
						>
							{{ s.label }} · {{ s.desc }}
						</el-dropdown-item>
					</el-dropdown-menu>
				</template>
			</el-dropdown>
		</div>

		<div class="dialogue-actions">
			<el-button
				size="small"
				@click="emit('open-directive')"
				class="directive-btn"
				title="演出指令：立绘位置、背景切换、音效"
			>演出</el-button>
			<el-button
				size="small"
				:class="['condition-btn', { 'has-condition': hasCondition }]"
				title="台词显示条件：条件不满足时顺序播放会跳过这条"
				@click="emit('open-node-condition')"
			>条件</el-button>
			<el-button
				size="small"
				class="play-btn"
				:disabled="!canPlay"
				title="从这条台词开始调试播放"
				@click="emit('play')"
			>试玩</el-button>
			<el-button
				size="small"
				icon="Delete"
				@click="emit('delete')"
				class="delete-btn"
				title="删除这条台词（会级联删除分支/数值/演出，不可撤销）"
			></el-button>
			<el-button
				size="small"
				icon="Top"
				@click="emit('move-up')"
				:disabled="index === 0"
				class="move-btn"
			></el-button>
			<el-button
				size="small"
				icon="Bottom"
				@click="emit('move-down')"
				:disabled="index === total - 1"
				class="move-btn"
			></el-button>
			<el-button size="small" type="success" @click="emit('add')">
				<el-icon><Plus /></el-icon>
			</el-button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { FSM_STATES, FSM_STATE_LABELS } from '@/composables/scene/useSceneFsmStates'

defineProps<{
	index: number
	total: number
	selected: boolean
	fsmState: string
	canPlay: boolean
	hasCondition: boolean
}>()

const emit = defineEmits<{
	(e: 'toggle-select'): void
	(e: 'set-fsm', state: string): void
	(e: 'open-directive'): void
	(e: 'open-node-condition'): void
	(e: 'play'): void
	(e: 'delete'): void
	(e: 'move-up'): void
	(e: 'move-down'): void
	(e: 'add'): void
}>()

const fsmStates = FSM_STATES
const fsmStateLabels = FSM_STATE_LABELS
</script>

<style scoped src="./dialogueCardHeader.css"></style>
