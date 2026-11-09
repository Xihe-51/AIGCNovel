<template>
	<el-dialog
		v-model="visibleModel"
		:title="t('chapters.title')"
		width="560px"
		class="chapter-dialog"
	>
		<div class="chapter-summary">
			<span>{{ t('chapters.readStats', { read: routeStats.read, total: routeStats.total }) }}</span>
			<span>{{ t('chapters.endingStats', { unlocked: routeStats.endingUnlocked, total: endings.length }) }}</span>
		</div>
		<div class="chapter-list">
			<button
				v-for="c in chapters"
				:key="c.chapter_id"
				type="button"
				:class="['chapter-item', { 'is-locked': !c.unlocked }]"
				@click="emit('jump-chapter', c)"
			>
				<span class="chapter-order">{{ c.order_num }}</span>
				<span class="chapter-title">{{ c.title }}</span>
				<span class="chapter-progress">{{ c.read }}/{{ c.total }}</span>
				<span class="chapter-action">{{ c.unlocked ? t('chapters.jump') : t('chapters.locked') }}</span>
			</button>
			<div v-if="!chapters.length" class="chapter-empty">{{ t('chapters.empty') }}</div>
		</div>
		<div class="chapter-section-title">{{ t('chapters.endingRoutes') }}</div>
		<div class="route-endings">
			<div
				v-for="e in endings"
				:key="e.ending_id"
				:class="['route-ending', { 'is-unlocked': e.unlocked }]"
			>
				<span class="route-ending-title">{{ e.title }}</span>
				<el-tag :type="e.unlocked ? 'success' : 'info'" size="small">
					{{ e.unlocked ? t('chapters.reached') : t('chapters.notReached') }}
				</el-tag>
			</div>
			<div v-if="!endings.length" class="chapter-empty">{{ t('chapters.noEndings') }}</div>
		</div>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { playerText } from '@/utils/playerI18n'

const props = defineProps<{
	visible: boolean
	chapters: any[]
	routeStats: { read: number; total: number; endingUnlocked: number }
	endings: any[]
	language: string
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'jump-chapter', chapter: any): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const t = (key: string, params?: Record<string, string | number>) =>
	playerText(props.language, key, params)
</script>

<style scoped>
.chapter-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #8a7f92;
}

.chapter-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 40vh;
  overflow-y: auto;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #f0e3e8;
  background: #fffafc;
  cursor: pointer;
  text-align: left;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.chapter-item:hover:not(.is-locked) {
  border-color: #e8467c;
  background: #fff3f7;
}

.chapter-item.is-locked {
  opacity: 0.55;
  cursor: not-allowed;
}

.chapter-order {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffe3ec;
  color: #e8467c;
  font-size: 12px;
}

.chapter-title {
  flex: 1;
  font-size: 14px;
  color: #5b4b55;
}

.chapter-progress {
  font-size: 12px;
  color: #b99aa5;
}

.chapter-action {
  font-size: 12px;
  color: #e8467c;
}

.chapter-item.is-locked .chapter-action {
  color: #b99aa5;
}

.chapter-section-title {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #5b4b55;
}

.route-endings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 24vh;
  overflow-y: auto;
}

.route-ending {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
  background: #faf7f9;
  font-size: 13px;
  color: #8a7f92;
}

.route-ending.is-unlocked {
  background: #fff3f7;
  color: #5b4b55;
}

.chapter-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: #b99aa5;
}
</style>
