<template>
	<el-dialog
		v-model="visibleModel"
		width="680px"
		class="gallery-dialog"
	>
		<template #header>
			<div class="gallery-header">
				<div class="gallery-tabs">
					<button
						v-for="item in tabs"
						:key="item.key"
						type="button"
						:class="['gallery-tab', { 'is-active': tab === item.key }]"
						@click="emit('switch-tab', item.key)"
					>{{ item.label }}</button>
				</div>
				<span class="gallery-count">{{ countText }}</span>
			</div>
		</template>

		<!-- CG -->
		<template v-if="tab === 'cg'">
			<div v-if="items.length" class="gallery-grid">
				<div v-for="cg in items" :key="cg.cg_id" class="gallery-item">
					<img v-if="cg.unlocked && cg.image_url" :src="BASE_URL + cg.image_url"
						 class="gallery-image" :alt="cg.title" loading="lazy" decoding="async" />
					<div v-else class="gallery-locked">{{ t('gallery.locked') }}</div>
					<div class="gallery-title">{{ cg.title }}</div>
					<div class="gallery-desc">
						{{ cg.unlocked ? (cg.description || '') :
							t('gallery.unlockEndingCondition', { title: cg.unlock_ending_title || t('gallery.lockedEnding') }) }}
					</div>
				</div>
			</div>
			<div v-else class="gallery-empty">{{ t('gallery.emptyCg') }}</div>
		</template>

		<!-- BGM -->
		<template v-else-if="tab === 'bgm'">
			<div v-if="musicLoading" class="gallery-empty">{{ t('gallery.loading') }}</div>
			<div v-else-if="musicItems.length" class="music-gallery-list">
				<div
					v-for="m in musicItems"
					:key="m.music_url"
					:class="['music-gallery-item', { 'is-locked': !m.unlocked }]"
				>
					<div class="music-gallery-meta">
						<span class="music-gallery-title">{{ m.unlocked ? m.title : t('gallery.lockedTrack') }}</span>
						<span class="music-gallery-sub">{{ m.unlocked ? 'BGM' : t('gallery.unlockBgmHint') }}</span>
					</div>
					<audio
						v-if="m.unlocked"
						:src="BASE_URL + m.music_url"
						controls
						preload="none"
						class="music-gallery-audio"
					></audio>
					<span v-else class="music-gallery-lock">{{ t('gallery.locked') }}</span>
				</div>
			</div>
			<div v-else class="gallery-empty">{{ t('gallery.emptyBgm') }}</div>
		</template>

		<!-- 成就 -->
		<template v-else-if="tab === 'achievement'">
			<div v-if="achievements.length" class="achievement-gallery-list">
				<div
					v-for="a in achievements"
					:key="a.achievement_id"
					:class="['achievement-gallery-item', { 'is-locked': !a.unlocked }]"
				>
					<div class="achievement-gallery-badge">{{ a.unlocked ? '★' : '?' }}</div>
					<div class="achievement-gallery-meta">
						<span class="achievement-gallery-title">{{ a.unlocked ? a.title : t('gallery.lockedAchievement') }}</span>
						<span class="achievement-gallery-desc">
							{{ a.unlocked ? (a.description || t('gallery.achievementUnlocked')) : t('gallery.unlockAchievementHint') }}
						</span>
					</div>
				</div>
			</div>
			<div v-else class="gallery-empty">{{ t('gallery.emptyAchievement') }}</div>
		</template>

		<!-- 结局 -->
		<template v-else>
			<div v-if="endings.length" class="ending-gallery-list">
				<div
					v-for="e in endings"
					:key="e.ending_id"
					:class="['ending-gallery-item', { 'is-locked': !e.unlocked }]"
				>
					<div class="ending-gallery-badge">{{ e.unlocked ? 'END' : '?' }}</div>
					<div class="ending-gallery-meta">
						<span class="ending-gallery-title">{{ e.unlocked ? e.title : t('gallery.lockedEnding') }}</span>
						<span class="ending-gallery-desc">
							{{ e.unlocked ? (e.description || t('gallery.endingReached')) : t('gallery.unlockEndingHint') }}
						</span>
					</div>
				</div>
			</div>
			<div v-else class="gallery-empty">{{ t('gallery.emptyEnding') }}</div>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BASE_URL } from '@/utils/request'
import { playerText } from '@/utils/playerI18n'

const props = defineProps<{
	visible: boolean
	language: string
	tab: string
	items: any[]
	countText: string
	musicItems: any[]
	musicLoading: boolean
	achievements: any[]
	endings: any[]
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'switch-tab', key: string): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const t = (key: string, params?: Record<string, string | number>) =>
	playerText(props.language, key, params)

const tabs = computed(() => [
	{ key: 'cg', label: t('gallery.tabCg') },
	{ key: 'bgm', label: t('gallery.tabBgm') },
	{ key: 'ending', label: t('gallery.tabEnding') },
	{ key: 'achievement', label: t('gallery.tabAchievement') },
])
</script>

<style scoped>
/* CG 鉴赏弹窗 */
.gallery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.gallery-tabs {
  display: flex;
  gap: 4px;
}

.gallery-tab {
  border: 1px solid transparent;
  background: transparent;
  color: #b07d8d;
  font-size: 14px;
  padding: 5px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.gallery-tab:hover {
  color: #c81f4a;
}

.gallery-tab.is-active {
  color: #c81f4a;
  font-weight: 600;
  border-color: #f3d6df;
  background: #fff5f8;
}

/* BGM 鉴赏 */
.music-gallery-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 60vh;
  overflow-y: auto;
}

.music-gallery-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #f3d6df;
  border-radius: 10px;
}

.music-gallery-item.is-locked {
  opacity: 0.55;
  background: #fafafa;
}

.music-gallery-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.music-gallery-title {
  font-size: 14px;
  color: #3d2b32;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-gallery-sub {
  font-size: 11px;
  color: #b99aa5;
}

.music-gallery-audio {
  width: 220px;
  height: 32px;
}

.music-gallery-lock {
  font-size: 12px;
  color: #b99aa5;
}

/* 成就收藏 */
.achievement-gallery-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 60vh;
  overflow-y: auto;
}

.achievement-gallery-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #f3d6df;
  border-radius: 10px;
}

.achievement-gallery-item.is-locked {
  opacity: 0.62;
  background: #fafafa;
}

.achievement-gallery-badge {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #ffcf70, #f0a020);
}

.achievement-gallery-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.achievement-gallery-title {
  font-size: 14px;
  font-weight: 600;
  color: #3d2b32;
}

.achievement-gallery-desc {
  font-size: 12px;
  color: #8a6a76;
}

/* 结局收藏 */
.ending-gallery-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 60vh;
  overflow-y: auto;
}

.ending-gallery-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #f3d6df;
  border-radius: 10px;
}

.ending-gallery-item.is-locked {
  opacity: 0.6;
  background: #fafafa;
}

.ending-gallery-badge {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #ff9fba, #e8467c);
}

.ending-gallery-item.is-locked .ending-gallery-badge {
  background: #d9d9d9;
}

.ending-gallery-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ending-gallery-title {
  font-size: 14px;
  color: #3d2b32;
}

.ending-gallery-desc {
  font-size: 11px;
  color: #b99aa5;
}

.gallery-count {
  color: #ff8fab;
  font-size: 13px;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
  max-height: 60vh;
  overflow-y: auto;
}

.gallery-item {
  border: 1px solid #f3d6df;
  border-radius: 10px;
  background: #fff9fc;
  padding: 8px;
}

.gallery-image,
.gallery-locked {
  width: 100%;
  height: 120px;
  border-radius: 6px;
  display: block;
}

.gallery-image {
  object-fit: cover;
}

.gallery-locked {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f4eef1;
  color: #bbb;
  font-size: 13px;
  letter-spacing: 2px;
}

.gallery-title {
  margin-top: 8px;
  font-size: 14px;
  color: #555;
  font-weight: 600;
}

.gallery-desc {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
  line-height: 1.5;
  min-height: 18px;
}

.gallery-empty {
  text-align: center;
  color: #bbb;
  padding: 24px 0;
}
</style>
