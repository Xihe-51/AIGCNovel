<template>
	<el-dialog
		v-model="visibleModel"
		:title="t('changelog.title')"
		width="440px"
		class="changelog-dialog"
	>
		<div v-if="!releases.length" class="changelog-empty">{{ t('changelog.empty') }}</div>
		<div v-else class="changelog-list">
			<div v-for="r in releases" :key="r.release_id" class="changelog-item">
				<div class="changelog-head">
					<span class="changelog-no">v{{ r.release_no }}</span>
					<span class="changelog-time">{{ formatSaveTime(r.created_at) }}</span>
				</div>
				<div class="changelog-notes">{{ r.notes || t('changelog.noNotes') }}</div>
				<div class="changelog-stats">
					{{ t('changelog.stats', { scenes: r.stats.scene_count, nodes: r.stats.content_count }) }}
				</div>
			</div>
		</div>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { playerText } from '@/utils/playerI18n'

const props = defineProps<{
	visible: boolean
	releases: any[]
	language: string
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const t = (key: string, params?: Record<string, string | number>) =>
	playerText(props.language, key, params)

const formatSaveTime = (iso: string) => {
	try {
		return new Date(iso).toLocaleString()
	} catch (e) {
		return iso
	}
}
</script>

<style scoped>
.changelog-list {
  max-height: 50vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.changelog-item {
  border: 1px solid #f5e4ea;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fffafc;
}

.changelog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.changelog-no {
  font-size: 13px;
  font-weight: 600;
  color: #c81f4a;
}

.changelog-time {
  font-size: 11px;
  color: #b99aa5;
}

.changelog-notes {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.changelog-stats {
  margin-top: 5px;
  font-size: 10px;
  color: #b99aa5;
}

.changelog-empty {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: #b37d8f;
}
</style>
