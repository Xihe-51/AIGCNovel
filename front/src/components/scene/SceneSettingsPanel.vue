<template>
	<el-form :model="scene" size="small" class="scene-form">
		<div class="field-block">
			<div class="field-label">场景标题</div>
			<el-input v-model="scene.title" placeholder="例如：雨夜相遇" />
		</div>

		<div class="field-block">
			<div class="field-label">场景描述</div>
			<el-input
				v-model="scene.description"
				type="textarea"
				placeholder="一句话说明这个场景要发生什么"
				:rows="3"
				resize="none"
			/>
		</div>

		<div class="field-block">
			<div class="field-label">场景标题 / 描述译文</div>
			<div class="dlg-translation-bar">
				<el-button
					size="small"
					plain
					:disabled="!scene.scene_id"
					title="翻译场景标题与描述"
					@click="emit('open-scene-translation')"
				>
					场景译文
					<span v-if="sceneTranslationCount" class="dlg-translation-count">{{ sceneTranslationCount }}</span>
				</el-button>
				<span
					v-for="lang in translatedSceneLanguages"
					:key="lang.code"
					class="dlg-translation-tag"
				>{{ lang.label }}</span>
			</div>
		</div>

		<div class="field-block">
			<div class="field-label">播放条件（剧情锁）</div>
			<div class="scene-lock">
				<div v-if="sceneLockItems.length > 1" class="scene-lock-mode">
					<span class="scene-lock-mode-label">条件关系</span>
					<el-radio-group
						:model-value="sceneLockMode"
						size="small"
						@update:model-value="emit('update:sceneLockMode', $event)"
					>
						<el-radio-button value="and">全部满足</el-radio-button>
						<el-radio-button value="or">任一满足</el-radio-button>
					</el-radio-group>
				</div>
				<div
					v-for="(c, ci) in sceneLockItems"
					:key="ci"
					class="scene-lock-row"
				>
					<el-select
						v-model="c.variable"
						size="small"
						clearable
						placeholder="变量"
						class="condition-var"
					>
						<el-option
							v-for="v in variables"
							:key="v.variable_id"
							:label="v.label"
							:value="v.name"
						></el-option>
					</el-select>
					<el-select
						v-model="c.op"
						size="small"
						class="condition-op"
						:disabled="!c.variable"
					>
						<el-option label="≥" value=">=" />
						<el-option label=">" value=">" />
						<el-option label="≤" value="<=" />
						<el-option label="<" value="<" />
						<el-option label="=" value="==" />
						<el-option label="≠" value="!=" />
					</el-select>
					<el-input-number
						v-model="c.value"
						size="small"
						:step="1"
						:disabled="!c.variable"
						class="condition-value"
					/>
					<el-button
						size="small"
						type="danger"
						plain
						icon="Delete"
						@click="emit('remove-lock-condition', ci)"
					/>
				</div>
				<div class="scene-lock-actions">
					<el-button size="small" icon="Plus" @click="emit('add-lock-condition')">添加条件</el-button>
					<span class="condition-tip">条件不满足时，顺序播放会跳过该场景</span>
				</div>
			</div>
		</div>

		<div class="field-block">
			<div class="field-label">
				背景图片
				<button type="button" class="field-asset-btn" @click="emit('open-asset-picker', 'image')">素材库</button>
			</div>
			<div
				class="scene-drop-zone"
				:class="{ 'is-drop-over': dragOverBg }"
				@dragover.prevent="emit('update:dragOverBg', true)"
				@dragleave="emit('update:dragOverBg', false)"
				@drop.prevent="emit('background-drop', $event)"
			>
				<div v-if="scene.background_url" class="bg-card">
					<img v-if="!settingsBgFailed" :src="baseUrl + scene.background_url" alt="背景预览" @error="emit('update:settingsBgFailed', true)" />
					<div v-else class="bg-card-missing">图片文件已丢失</div>
					<el-upload
						class="bg-card-upload"
						action="#"
						:http-request="uploadBackground"
						accept="image/*"
						:show-file-list="false">
						<button type="button" class="bg-card-btn">更换</button>
					</el-upload>
				</div>
				<el-upload
					v-else
					class="bg-empty-upload"
					action="#"
					:http-request="uploadBackground"
					accept="image/*"
					:show-file-list="false">
					<button type="button" class="bg-empty">
						<span class="bg-empty-icon">＋</span>
						<span>上传背景图</span>
					</button>
				</el-upload>
			</div>
		</div>

		<div class="field-block">
			<div class="field-label">
				背景音乐
				<button type="button" class="field-asset-btn" @click="emit('open-asset-picker', 'audio')">素材库</button>
			</div>
			<div
				class="scene-drop-zone"
				:class="{ 'is-drop-over': dragOverMusic }"
				@dragover.prevent="emit('update:dragOverMusic', true)"
				@dragleave="emit('update:dragOverMusic', false)"
				@drop.prevent="emit('music-drop', $event)"
			>
				<div v-if="scene.music_url" class="music-card">
					<button type="button" class="music-play" @click="emit('toggle-music')">
						{{ musicPlaying ? '❚❚' : '▶' }}
					</button>
					<div class="music-main">
						<input
							class="music-progress"
							type="range"
							min="0"
							:max="musicDuration || 0"
							step="0.1"
							:value="musicProgress"
							@input="emit('seek-music', $event)"
						/>
						<div class="music-time">{{ formatClock(musicProgress) }} / {{ formatClock(musicDuration) }}</div>
					</div>
					<el-upload
						class="music-replace"
						action="#"
						:http-request="uploadMusic"
						accept="audio/*"
						:show-file-list="false">
						<button type="button" class="music-link">更换</button>
					</el-upload>
					<audio
						ref="settingsAudio"
						:src="baseUrl + scene.music_url"
						loop
						preload="metadata"
						@timeupdate="emit('music-time')"
						@loadedmetadata="emit('music-meta')"
						@ended="emit('music-ended')">
					</audio>
				</div>
				<el-upload
					v-else
					class="bg-empty-upload"
					action="#"
					:http-request="uploadMusic"
					accept="audio/*"
					:show-file-list="false">
					<button type="button" class="bg-empty">
						<span class="bg-empty-icon">♪</span>
						<span>上传背景音乐</span>
					</button>
				</el-upload>
			</div>
		</div>

		<button type="button" class="save-scene-btn" :disabled="sceneSaving || !sceneReady" @click="emit('save')">
			{{ sceneSaving ? '保存中…' : '保存场景设置' }}
		</button>
		<div :class="['scene-save-state', { 'is-dirty': sceneDirty }]">
			{{ !sceneReady ? '场景设置加载中…' : (sceneSaving ? '正在保存场景设置…' : (sceneDirty ? '场景设置有未保存改动，离开会自动保存' : '场景设置已保存')) }}
		</div>
	</el-form>
</template>

<script setup>
import { ref } from 'vue'
import { formatClock } from '@/composables/scene/useSceneAudio'

defineProps({
	scene: { type: Object, required: true },
	variables: { type: Array, default: () => [] },
	baseUrl: { type: String, default: '' },
	sceneLockMode: { type: String, default: 'and' },
	sceneLockItems: { type: Array, default: () => [] },
	sceneTranslationCount: { type: Number, default: 0 },
	translatedSceneLanguages: { type: Array, default: () => [] },
	dragOverBg: { type: Boolean, default: false },
	dragOverMusic: { type: Boolean, default: false },
	settingsBgFailed: { type: Boolean, default: false },
	musicPlaying: { type: Boolean, default: false },
	musicProgress: { type: Number, default: 0 },
	musicDuration: { type: Number, default: 0 },
	sceneSaving: { type: Boolean, default: false },
	sceneReady: { type: Boolean, default: false },
	sceneDirty: { type: Boolean, default: false }
})

const emit = defineEmits([
	'update:sceneLockMode',
	'update:dragOverBg',
	'update:dragOverMusic',
	'update:settingsBgFailed',
	'open-scene-translation',
	'add-lock-condition',
	'remove-lock-condition',
	'open-asset-picker',
	'background-drop',
	'music-drop',
	'background-upload',
	'music-upload',
	'toggle-music',
	'seek-music',
	'music-time',
	'music-meta',
	'music-ended',
	'save'
])

const settingsAudio = ref(null)

const uploadBackground = (options) => new Promise((resolve, reject) => {
	emit('background-upload', { ...options, onSuccess: resolve, onError: reject })
})

const uploadMusic = (options) => new Promise((resolve, reject) => {
	emit('music-upload', { ...options, onSuccess: resolve, onError: reject })
})

defineExpose({ settingsAudio })
</script>

<style scoped src="./sceneSettingsPanel.css"></style>
