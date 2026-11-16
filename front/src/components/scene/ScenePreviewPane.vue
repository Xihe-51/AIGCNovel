<template>
	<audio
		ref="backgroundMusic"
		:src="musicUrl ? baseUrl + musicUrl : ''"
		loop
		class="hidden-audio"
	>你的浏览器不支持音频播放</audio>

	<SceneStagePreview
		:bg-src="stage.bgSrc"
		:avatar-src="stage.avatarSrc"
		:avatar-sources="stage.avatarSources"
		:foreground-src="stage.foregroundSrc"
		:slots="stage.slots"
		:has-slots="stage.hasSlots"
		:active-effect="stage.activeEffect"
		:loading="stage.loading"
		:error="stage.error"
		:dialogue-count="stage.dialogueCount"
		:dialogue-index="stage.dialogueIndex"
		:current-dialogue="stage.currentDialogue"
		:speaker-name="stage.speakerName"
		:dialogue-html="stage.dialogueHtml"
		:show-bgm="!!musicUrl"
		:bgm-muted="stage.bgmMuted"
		:is-panel-open="stage.isPanelOpen"
		:editable="stage.editable"
		:can-edit="stage.canEdit"
		:dialogue-key="stage.dialogueKey"
		:can-undo="stage.canUndo"
		:grid-snap="stage.gridSnap"
		:stage-visibility="stage.stageVisibility"
		:bg-available="stage.bgAvailable"
		:fg-available="stage.fgAvailable"
		:avatar-layers="stage.avatarLayers"
		:max-layers="stage.maxLayers"
		@toggle-panel="emit('toggle-panel')"
		@toggle-bgm="emit('toggle-bgm')"
		@toggle-edit="emit('toggle-edit')"
		@next="emit('next')"
		@restart="emit('restart')"
		@avatar-group-move="(payload) => emit('avatar-group-move', payload)"
		@avatar-transform="(payload) => emit('avatar-transform', payload)"
		@avatar-add-new="emit('avatar-add-new')"
		@avatar-remove="(layerId) => emit('avatar-remove', layerId)"
		@avatar-rename="(layerId) => emit('avatar-rename', layerId)"
		@avatar-visibility="(layerId, visible) => emit('avatar-visibility', layerId, visible)"
		@avatar-order="(layerId, direction) => emit('avatar-order', layerId, direction)"
		@avatar-reorder="(from, to) => emit('avatar-reorder', from, to)"
		@stage-visibility="(layerKey, visible) => emit('stage-visibility', layerKey, visible)"
		@undo="emit('undo')"
		@toggle-grid="emit('toggle-grid')"
		@asset-drop="(payload) => emit('asset-drop', payload)"
		@avatar-replace-asset="(layerId, payload) => emit('avatar-replace-asset', layerId, payload)"
		@reload-assets="emit('reload-assets')"
	/>
</template>

<script setup>
/**
 * 场景预览区：舞台渲染 + 舞台 BGM。
 *
 * 舞台本身的渲染、拖拽与图层编辑都在 SceneStagePreview 里；这里只做两件事：
 * 1. 挂载 BGM 的 <audio>，并通过 defineExpose 交给父级统一控制（见 useSceneAudio）；
 * 2. 把舞台的交互事件原样转发给父级，不吞任何业务语义。
 *
 * `stage` 是预览视图模型（由父级的 useSceneStagePreview / useSceneDialoguePreview 组装）：
 * bgSrc / avatarSrc / avatarSources / foregroundSrc / slots / hasSlots / activeEffect /
 * loading / error / dialogueCount / dialogueIndex / currentDialogue / speakerName /
 * dialogueHtml / bgmMuted / isPanelOpen / editable / canEdit / dialogueKey / canUndo /
 * gridSnap / stageVisibility / bgAvailable / fgAvailable / avatarLayers / maxLayers
 */
import { ref } from 'vue'
import SceneStagePreview from '@/components/SceneStagePreview.vue'

defineProps({
	musicUrl: { type: String, default: '' },
	baseUrl: { type: String, default: '' },
	stage: { type: Object, required: true }
})

const emit = defineEmits([
	'toggle-panel',
	'toggle-bgm',
	'toggle-edit',
	'next',
	'restart',
	'avatar-group-move',
	'avatar-transform',
	'avatar-add-new',
	'avatar-remove',
	'avatar-rename',
	'avatar-visibility',
	'avatar-order',
	'avatar-reorder',
	'stage-visibility',
	'undo',
	'toggle-grid',
	'asset-drop',
	'avatar-replace-asset',
	'reload-assets'
])

const backgroundMusic = ref(null)

defineExpose({ backgroundMusic })
</script>

<style scoped>
/* 音频元素不需要占位，只用来出声 */
.hidden-audio { display: none; }
</style>
