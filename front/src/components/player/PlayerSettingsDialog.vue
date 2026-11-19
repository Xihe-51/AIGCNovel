<template>
	<el-dialog
		v-model="visibleModel"
		:title="t('settings.title')"
		width="420px"
		class="player-settings-dialog"
	>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.textSpeed') }}</span>
			<el-select v-model="settings.textSpeed" size="small" style="width: 140px">
				<el-option :label="t('settings.instant')" :value="0" />
				<el-option :label="t('settings.fast')" :value="1" />
				<el-option :label="t('settings.normal')" :value="2" />
				<el-option :label="t('settings.slow')" :value="3" />
			</el-select>
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.language') }}</span>
			<el-select v-model="settings.language" size="small" style="width: 140px">
				<el-option
					v-for="lang in PLAYER_LANGUAGES"
					:key="lang.code"
					:label="lang.label"
					:value="lang.code"
				/>
			</el-select>
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.autoDelay') }}</span>
			<el-slider v-model="settings.autoDelay" :min="1" :max="6" :step="0.5" style="flex: 1" />
			<span class="setting-value">{{ settings.autoDelay }}s</span>
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.bgm') }}</span>
			<el-slider v-model="settings.bgmVolume" :min="0" :max="100" style="flex: 1" />
			<span class="setting-value">{{ settings.bgmVolume }}%</span>
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.voiceVolume') }}</span>
			<el-slider v-model="settings.voiceVolume" :min="0" :max="100" style="flex: 1" />
			<span class="setting-value">{{ settings.voiceVolume }}%</span>
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.voicePlayback') }}</span>
			<el-switch v-model="settings.voiceEnabled" />
		</div>
		<div class="setting-row">
			<span class="setting-label" :title="t('settings.audioDramaHint')">{{ t('settings.audioDrama') }}</span>
			<el-switch v-model="settings.audioDrama" />
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.fontSize') }}</span>
			<el-slider v-model="settings.fontSize" :min="14" :max="24" :step="1" style="flex: 1" />
			<span class="setting-value">{{ settings.fontSize }}px</span>
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.lineHeight') }}</span>
			<el-slider v-model="settings.lineHeight" :min="1.3" :max="2.2" :step="0.1" style="flex: 1" />
			<span class="setting-value">{{ settings.lineHeight.toFixed(1) }}</span>
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.boxStyle') }}</span>
			<el-select v-model="settings.boxStyle" size="small" style="width: 140px">
				<el-option :label="t('settings.classic')" value="classic" />
				<el-option :label="t('settings.bubble')" value="bubble" />
			</el-select>
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.fullscreen') }}</span>
			<el-switch v-model="settings.fullscreen" @change="emit('toggle-fullscreen')" />
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.skipRead') }}</span>
			<el-switch v-model="settings.skipRead" />
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.varNotice') }}</span>
			<el-switch v-model="settings.showVariableNotice" />
		</div>
		<div class="setting-row">
			<span class="setting-label">{{ t('settings.spriteMotion') }}</span>
			<el-switch v-model="settings.spriteMotion" />
		</div>
		<div class="setting-shortcuts">
			<span>{{ t('settings.shortcuts') }}</span>
			<span>{{ t('settings.gamepad') }}</span>
			<span>{{ t('settings.audioDramaHint') }}</span>
		</div>
		<template #footer>
			<el-button @click="emit('reset')">{{ t('settings.reset') }}</el-button>
			<el-button type="primary" @click="visibleModel = false">{{ t('settings.done') }}</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PLAYER_LANGUAGES } from '@/api/translation'
import { playerText } from '@/utils/playerI18n'

const props = defineProps<{
	visible: boolean
	settings: Record<string, any>
	language: string
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'toggle-fullscreen'): void
	(e: 'reset'): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const t = (key: string, params?: Record<string, string | number>) =>
	playerText(props.language, key, params)
</script>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.setting-label {
  width: 92px;
  color: #555;
  font-size: 14px;
}

.setting-value {
  width: 44px;
  text-align: right;
  color: #888;
  font-size: 13px;
}

.setting-shortcuts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
  color: #777;
  font-size: 12px;
  line-height: 1.6;
}
</style>
