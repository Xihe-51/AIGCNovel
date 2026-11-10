<template>
	<el-dialog
		v-model="visibleModel"
		:title="t('status.title')"
		width="420px"
		class="status-dialog"
	>
		<div class="status-row">
			<span class="status-label">{{ t('status.playthroughLabel') }}</span>
			<span class="status-value">{{ t('status.playthroughValue', { n: playthrough }) }}</span>
		</div>

		<template v-if="affinityVariables.length">
			<div class="status-section">{{ t('status.affinity') }}</div>
			<div v-for="v in affinityVariables" :key="v.variable_id" class="affinity-item">
				<div class="affinity-head">
					<span class="affinity-name">{{ characterNameOf(v.character_id) }}</span>
					<span class="affinity-num">
						{{ variableValues[v.name] ?? v.initial_value }}
						<template v-if="v.max_value != null"> / {{ v.max_value }}</template>
					</span>
				</div>
				<div class="affinity-bar">
					<i :style="{ width: affinityPercent(v) }"></i>
				</div>
				<div class="affinity-label">
					{{ v.label }}
					<el-tag v-if="v.persist" type="warning" size="small" class="persist-badge">{{ t('status.persist') }}</el-tag>
				</div>
			</div>
		</template>

		<template v-if="otherVariables.length">
			<div class="status-section">{{ t('status.other') }}</div>
			<div v-for="v in otherVariables" :key="v.variable_id" class="status-row">
				<span class="status-label">
					{{ v.label }}
					<el-tag v-if="v.persist" type="warning" size="small" class="persist-badge">{{ t('status.persist') }}</el-tag>
				</span>
				<span class="status-value">{{ variableValues[v.name] ?? v.initial_value }}</span>
			</div>
		</template>

		<div v-if="!projectVariables.length" class="status-empty">{{ t('status.empty') }}</div>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { playerText } from '@/utils/playerI18n'

const props = defineProps<{
	visible: boolean
	language: string
	playthrough: number
	projectVariables: any[]
	variableValues: Record<string, any>
	characterNames: Record<string, string>
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

// 好感度面板：绑定角色的变量单独展示，其余变量仍走属性列表
const affinityVariables = computed(() =>
	props.projectVariables.filter(v => !!v.character_id)
)
const otherVariables = computed(() =>
	props.projectVariables.filter(v => !v.character_id && !v.name.startsWith('behavior_'))
)

const characterNameOf = (id: number) => {
	return props.characterNames?.[id] || t('character.unnamed')
}

const affinityPercent = (v: any) => {
	const max = v.max_value == null ? 100 : Number(v.max_value)
	const min = v.min_value == null ? 0 : Number(v.min_value)
	const val = Number(props.variableValues[v.name] ?? v.initial_value ?? 0)
	if (max === min) return val >= max ? '100%' : '0%'
	const pct = ((val - min) / (max - min)) * 100
	return Math.max(0, Math.min(100, pct)) + '%'
}
</script>

<style scoped>
.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 4px;
  border-bottom: 1px dashed #f3d6df;
}

.status-label {
  color: #555;
  font-size: 14px;
}

.status-value {
  color: #c81f4a;
  font-weight: 600;
  font-size: 16px;
}

.status-empty {
  color: #999;
  text-align: center;
  padding: 20px;
}

/* 好感度面板 */
.status-section {
  margin-top: 10px;
  padding: 4px 2px;
  font-size: 12px;
  font-weight: 600;
  color: #b07d8d;
  letter-spacing: 0.5px;
}

.affinity-item {
  padding: 8px 4px 10px;
  border-bottom: 1px dashed #f3d6df;
}

.affinity-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.affinity-name {
  color: #3d2b32;
  font-size: 14px;
  font-weight: 600;
}

.affinity-num {
  color: #c81f4a;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.affinity-bar {
  margin-top: 6px;
  height: 8px;
  border-radius: 4px;
  background: #fbe7ee;
  overflow: hidden;
}

.affinity-bar i {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #ff9fba 0%, #e8467c 100%);
  transition: width 0.3s ease;
}

.affinity-label {
  margin-top: 4px;
  font-size: 11px;
  color: #b99aa5;
}

.persist-badge {
  margin-left: 6px;
  transform: scale(0.85);
  transform-origin: left center;
}
</style>
