<template>
	<el-dialog
		v-model="visibleModel"
		:title="t('save.title')"
		width="540px"
		class="save-dialog"
	>
		<div v-for="s in slotDefs" :key="s.slot" class="save-slot">
			<div class="save-slot-thumb">
				<img
					v-if="saveMap[s.slot]?.thumbnail_url"
					:src="thumbSrc(saveMap[s.slot].thumbnail_url)"
					alt=""
					loading="lazy"
				/>
				<span v-else class="save-slot-thumb-empty">{{ t('save.noImage') }}</span>
				<span v-if="saveSlotTitle(saveMap[s.slot])" class="save-slot-thumb-title">
					{{ saveSlotTitle(saveMap[s.slot]) }}
				</span>
			</div>
			<div class="save-slot-info">
				<div class="save-slot-title">{{ s.label }}</div>
				<div class="save-slot-summary">{{ saveMap[s.slot]?.summary || t('save.emptySlot') }}</div>
				<div v-if="saveMap[s.slot]?.updated_at" class="save-slot-time">
					{{ formatSaveTime(saveMap[s.slot].updated_at) }}
				</div>
			</div>
			<div class="save-slot-actions">
				<el-button size="small" @click="emit('save', s.slot)">{{ t('save.save') }}</el-button>
				<el-button size="small" :disabled="!saveMap[s.slot]" @click="emit('load', s.slot)">{{ t('save.load') }}</el-button>
				<el-button size="small" type="danger" :disabled="!saveMap[s.slot]" @click="emit('delete', s.slot)">{{ t('save.delete') }}</el-button>
			</div>
		</div>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BASE_URL } from '@/utils/request'
import { playerText } from '@/utils/playerI18n'

const props = defineProps<{
	visible: boolean
	language: string
	saves: any[]
	sceneTitleOf: (sceneId: number) => string
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'save', slot: number): void
	(e: 'load', slot: number): void
	(e: 'delete', slot: number): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const t = (key: string, params?: Record<string, string | number>) =>
	playerText(props.language, key, params)

const slotDefs = computed(() => [
	{ slot: 0, label: t('save.slotAuto') },
	{ slot: 1, label: t('save.slotN', { n: 1 }) },
	{ slot: 2, label: t('save.slotN', { n: 2 }) },
	{ slot: 3, label: t('save.slotN', { n: 3 }) },
])

const saveMap = computed(() => {
	const map: Record<number, any> = {}
	for (const s of props.saves) map[s.slot] = s
	return map
})

const formatSaveTime = (iso: string) => {
	try {
		return new Date(iso).toLocaleString()
	} catch (e) {
		return iso
	}
}

// 存档列表里的场景名：新存档带 scene_id 可实时切换语言，老存档回退已存标题
const saveSlotTitle = (slot: any) => {
	if (!slot) return ''
	return (slot.scene_id ? props.sceneTitleOf(slot.scene_id) : '') || slot.scene_title || ''
}

// 本地静态地址补 BASE_URL，外链直接使用
const thumbSrc = (url: string) => {
	if (!url) return ''
	return /^http/i.test(url) ? url : BASE_URL + url
}
</script>

<style scoped>
/* 存档面板 */
.save-slot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #f3d6df;
  border-radius: 10px;
  margin-bottom: 10px;
  background: #fff8fa;
}

.save-slot-info {
  flex: 1;
  min-width: 0;
}

.save-slot-thumb {
  position: relative;
  width: 96px;
  height: 58px;
  border-radius: 7px;
  overflow: hidden;
  flex-shrink: 0;
  background: #f6e9ee;
}

.save-slot-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.save-slot-thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 10px;
  color: #b99aa5;
}

.save-slot-thumb-title {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 5px;
  font-size: 9px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
}

.save-slot-title {
  font-weight: 600;
  color: #b3244a;
  font-size: 14px;
}

.save-slot-summary {
  color: #666;
  font-size: 13px;
  margin-top: 2px;
}

.save-slot-time {
  color: #aaa;
  font-size: 12px;
  margin-top: 2px;
}

.save-slot-actions {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
}
</style>
