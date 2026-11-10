<template>
	<el-dialog
		v-model="visibleModel"
		width="420px"
		class="ending-dialog"
		:close-on-click-modal="false"
		:show-close="false"
	>
		<div class="ending-content">
			<div class="ending-badge">ENDING</div>
			<h2>{{ ending?.title }}</h2>
			<p>{{ ending?.description || t('ending.congrats') }}</p>
		</div>
		<template #footer>
			<el-button @click="visibleModel = false">{{ t('ending.continueReading') }}</el-button>
			<el-button @click="emit('restart')">{{ t('ending.restartReset') }}</el-button>
			<el-button type="primary" @click="emit('next')">{{ t('ending.nextPlaythrough', { n: playthrough + 1 }) }}</el-button>
			<el-button @click="emit('back')">{{ t('ending.backToProject') }}</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { playerText } from '@/utils/playerI18n'

const props = defineProps<{
	visible: boolean
	language: string
	ending: any | null
	playthrough: number
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'restart'): void
	(e: 'next'): void
	(e: 'back'): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const t = (key: string, params?: Record<string, string | number>) =>
	playerText(props.language, key, params)
</script>

<style scoped>
/* 结局页 */
.ending-content {
  text-align: center;
  padding: 10px 0 4px;
}

.ending-badge {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 999px;
  background: #ffe4ec;
  color: #c81f4a;
  font-size: 12px;
  letter-spacing: 2px;
}

.ending-content h2 {
  margin: 14px 0 8px;
  color: #c81f4a;
}

.ending-content p {
  color: #666;
  line-height: 1.7;
}
</style>
