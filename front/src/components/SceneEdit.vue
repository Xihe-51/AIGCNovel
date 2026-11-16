<template>
	<div class="scene-editor-container">
		<!-- 左侧编辑面板 - 默认隐藏 -->
		<div :class="['editor-panel', isPanelOpen ? 'panel-open' : 'panel-closed']">
			<div class="panel-header">
				<div class="panel-tabs">
					<button
						type="button"
						:class="['panel-tab', { 'is-active': panelTab === 'script' }]"
						@click="panelTab = 'script'"
					>脚本</button>
					<button
						type="button"
						:class="['panel-tab', { 'is-active': panelTab === 'settings' }]"
						@click="panelTab = 'settings'"
					>场景设置</button>
				</div>
				<button @click="togglePanel" class="toggle-btn" :title="isPanelOpen ? '收起面板，预览舞台' : '展开编辑面板'">
					<el-icon :size="20" v-if="isPanelOpen"><ArrowRight /></el-icon>
					<el-icon :size="20" v-else><ArrowLeft /></el-icon>
				</button>
			</div>
			
			<!-- 场景设置部分 -->
			<div v-show="panelTab === 'settings'" class="panel-section">
				<h3 class="section-title">场景设置</h3>
				<SceneSettingsPanel
					ref="settingsPanelRef"
					:scene="scene"
					:variables="variables"
					:base-url="BASE_URL"
					:scene-lock-mode="sceneLockMode"
					:scene-lock-items="sceneLockItems"
					:scene-translation-count="sceneTranslationCount"
					:translated-scene-languages="translatedSceneLanguages"
					:drag-over-bg="dragOverBg"
					:drag-over-music="dragOverMusic"
					:settings-bg-failed="settingsBgFailed"
					:music-playing="musicPlaying"
					:music-progress="musicProgress"
					:music-duration="musicDuration"
					:scene-saving="sceneSaving"
					:scene-ready="sceneReady"
					:scene-dirty="sceneDirty"
					@update:scene-lock-mode="sceneLockMode = $event"
					@update:drag-over-bg="dragOverBg = $event"
					@update:drag-over-music="dragOverMusic = $event"
					@update:settings-bg-failed="settingsBgFailed = $event"
					@open-scene-translation="openSceneTranslationDialog"
					@add-lock-condition="addSceneLockCondition"
					@remove-lock-condition="removeSceneLockCondition"
					@open-asset-picker="openAssetPicker"
					@background-drop="onBackgroundDrop"
					@music-drop="onMusicDrop"
					@background-upload="handleBackgroundUpload"
					@music-upload="handleMusicUpload"
					@toggle-music="toggleMusic"
					@seek-music="seekMusic"
					@music-time="onMusicTime"
					@music-meta="onMusicMeta"
					@music-ended="musicPlaying = false"
					@save="saveSceneSettings"
				/>
			</div>
						
			<!-- 对话编辑部分：工具栏 / 批量条 / 台词卡片列表由 SceneScriptPanel 承载 -->
			<div v-show="panelTab === 'script'" class="panel-section">
				<h3 class="section-title">对话编辑</h3>
				<SceneScriptPanel
					:dialogues="dialogues"
					:characters="characters"
					:variables="variables"
					:project-nodes="projectNodes"
					:jump-map="jumpMap"
					:effects-map="effectsMap"
					:fsm-states-map="dialogueFsmStates"
					:selected-indexes="selectedIndexes"
					:focused-content-id="activeFocusId"
					:loading="loading"
					:dirty="dirty"
					:can-undo="canUndoAny"
					:can-redo="canRedo"
					@add="addNewDialogue"
					@import-script="openScriptImport"
					@undo="undoLast"
					@redo="redo"
					@reorder="reorderDialogues"
					@save-all="saveAllDialogues"
					@open-graph="openGraph"
					@open-voice-director="openVoiceDirector"
					@batch-delete="batchDelete"
					@batch-duplicate="batchDuplicate"
					@open-voice-batch="openVoiceBatch"
					@clear-selection="clearSelection"
					@select="selectDialogue"
					@toggle-select="toggleSelect"
					@set-fsm="(payload) => setFsmState(payload.dialogue, payload.state)"
					@open-directive="openDirectiveDialog"
					@open-node-condition="openNodeConditionDialog"
					@play="playFromDialogue"
					@delete="deleteDialogue"
					@move-up="moveDialogueUp"
					@move-down="moveDialogueDown"
					@content-type-change="onContentTypeChange"
					@character-change="handleCharacterChange"
					@open-translation="openTranslationDialog"
					@set-jump="(payload) => setJumpTarget(payload.dialogue, payload.target)"
					@open-choice-translation="openChoiceTranslationDialog"
					@remove-choice="(payload) => removeChoice(payload.dialogue, payload.optionIndex)"
					@upload-choice-image="(payload) => handleChoiceImageUpload(payload.options, payload.option)"
					@clear-choice-image="clearChoiceImage"
					@remove-choice-condition="(payload) => removeChoiceCondition(payload.dialogue, payload.optionIndex, payload.conditionIndex)"
					@add-choice-condition="(payload) => addChoiceCondition(payload.dialogue, payload.optionIndex)"
					@add-choice="addChoice"
					@save-choices="(payload) => saveChoices(payload.dialogue, payload.index)"
					@remove-effect="(payload) => removeEffect(payload.dialogue, payload.effectIndex)"
					@add-effect="addEffect"
					@save-effects="saveDialogueEffects"
					@open-ai="openAIDialog"
					@upload-voice="(payload) => handleVoiceUpload(payload.options, payload.index)"
					@save="saveDialogue"
					@text-history-begin="beginTextEdit"
					@text-history-queue="queueTextHistory"
					@text-history-flush="flushTextHistory"
				/>
			</div>
		</div>
		
		<!-- 右侧预览区域：舞台渲染 + BGM 由 ScenePreviewPane 承载 -->
	<ScenePreviewPane
		ref="previewPaneRef"
		:music-url="scene.music_url || ''"
		:base-url="BASE_URL"
		:stage="previewStage"
		@toggle-panel="togglePanel"
		@toggle-bgm="toggleBgm"
		@toggle-edit="stageEditing = !stageEditing"
		@next="nextDialogue"
		@restart="restartDialogues"
		@avatar-group-move="handleAvatarGroupMove"
		@avatar-transform="handleAvatarTransform"
		@avatar-add-new="handleAvatarAddNew"
		@avatar-remove="handleAvatarRemove"
		@avatar-rename="handleAvatarRename"
		@avatar-visibility="handleAvatarVisibility"
		@avatar-order="handleAvatarOrder"
		@avatar-reorder="handleAvatarReorder"
		@asset-drop="onStageAssetDrop"
		@avatar-replace-asset="onAvatarReplaceAsset"
		@reload-assets="hotReloadAssets"
		@stage-visibility="handleStageVisibility"
		@undo="undoAvatar"
		@toggle-grid="stageGridSnap = stageGridSnap > 0 ? 0 : 5"
	/>
	</div>
	
	<!-- 场景编辑器的全部弹窗集中在 SceneDialogsHost：父级只维护数据与领域事件 -->
	<SceneDialogsHost
		ref="dialogsHostRef"
		v-bind="dialogData"
		@update:visible="onDialogVisible"
		@update:field="onDialogField"
		@ai-send="sendToAI"
		@ai-apply="applyAIAnswer"
		@clear-ai-answer="aiAnswer = ''"
		@directives-changed="handleDirectivesChanged"
		@condition-apply="applyNodeCondition"
		@condition-clear="clearNodeCondition"
		@script-import="handleScriptImport"
		@voice-batch-run="runVoiceBatch"
		@voice-director-tag="runEmotionAutoTag"
		@voice-director-apply="applyEmotionTags"
		@translation-save="saveTranslation"
		@scene-translation-save="saveSceneTranslations"
		@choice-translation-save="saveChoiceTranslation"
		@asset-select="useAssetFromLibrary"
	/>
	</template>

<script setup>
// 薄壳组件：状态、跨域联动与全部副作用都在 useSceneEditorController，
// 这里只负责把控制器暴露的数据与领域事件接到模板上。
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { BASE_URL } from '@/utils/request'
import ScenePreviewPane from '@/components/scene/ScenePreviewPane.vue'
import SceneDialogsHost from '@/components/scene/SceneDialogsHost.vue'
import SceneScriptPanel from '@/components/scene/SceneScriptPanel.vue'
import SceneSettingsPanel from '@/components/scene/SceneSettingsPanel.vue'
import { useSceneEditorController } from '@/composables/scene/useSceneEditorController'

const props = defineProps({
	sceneId: {
		type: String,
		required: true
	},
	focusContentId: {
		type: Number,
		default: null
	},
	paused: {
		type: Boolean,
		default: false
	}
})

// 场景标题/封面保存后通知外层刷新左栏列表
const emit = defineEmits(['scene-updated', 'open-graph'])

const {
	// 外壳
	isPanelOpen,
	panelTab,
	togglePanel,
	// 场景设置
	scene,
	variables,
	sceneLockMode,
	sceneLockItems,
	sceneTranslationCount,
	translatedSceneLanguages,
	dragOverBg,
	dragOverMusic,
	settingsBgFailed,
	musicPlaying,
	musicProgress,
	musicDuration,
	sceneSaving,
	sceneReady,
	sceneDirty,
	settingsPanelRef,
	openSceneTranslationDialog,
	addSceneLockCondition,
	removeSceneLockCondition,
	openAssetPicker,
	onBackgroundDrop,
	onMusicDrop,
	handleBackgroundUpload,
	handleMusicUpload,
	toggleMusic,
	seekMusic,
	onMusicTime,
	onMusicMeta,
	saveSceneSettings,
	// 脚本列表
	dialogues,
	characters,
	projectNodes,
	jumpMap,
	effectsMap,
	dialogueFsmStates,
	selectedIndexes,
	activeFocusId,
	loading,
	dirty,
	canUndoAny,
	canRedo,
	addNewDialogue,
	openScriptImport,
	undoLast,
	redo,
	reorderDialogues,
	saveAllDialogues,
	openGraph,
	openVoiceDirector,
	batchDelete,
	batchDuplicate,
	openVoiceBatch,
	clearSelection,
	selectDialogue,
	toggleSelect,
	setFsmState,
	openDirectiveDialog,
	openNodeConditionDialog,
	playFromDialogue,
	deleteDialogue,
	moveDialogueUp,
	moveDialogueDown,
	onContentTypeChange,
	handleCharacterChange,
	openTranslationDialog,
	setJumpTarget,
	openChoiceTranslationDialog,
	removeChoice,
	handleChoiceImageUpload,
	clearChoiceImage,
	removeChoiceCondition,
	addChoiceCondition,
	addChoice,
	saveChoices,
	removeEffect,
	addEffect,
	saveDialogueEffects,
	openAIDialog,
	handleVoiceUpload,
	saveDialogue,
	beginTextEdit,
	queueTextHistory,
	flushTextHistory,
	// 预览舞台
	previewPaneRef,
	previewStage,
	toggleBgm,
	stageEditing,
	nextDialogue,
	restartDialogues,
	handleAvatarGroupMove,
	handleAvatarTransform,
	handleAvatarAddNew,
	handleAvatarRemove,
	handleAvatarRename,
	handleAvatarVisibility,
	handleAvatarOrder,
	handleAvatarReorder,
	onStageAssetDrop,
	onAvatarReplaceAsset,
	hotReloadAssets,
	handleStageVisibility,
	undoAvatar,
	stageGridSnap,
	// 弹窗宿主
	dialogsHostRef,
	dialogData,
	onDialogVisible,
	onDialogField,
	sendToAI,
	applyAIAnswer,
	aiAnswer,
	handleDirectivesChanged,
	applyNodeCondition,
	clearNodeCondition,
	handleScriptImport,
	runVoiceBatch,
	runEmotionAutoTag,
	applyEmotionTags,
	saveTranslation,
	saveSceneTranslations,
	saveChoiceTranslation,
	useAssetFromLibrary
} = useSceneEditorController({
	sceneId: () => props.sceneId,
	focusContentId: () => props.focusContentId,
	paused: () => props.paused,
	emit
})
</script>

<style scoped src="./scene/sceneShell.css"></style>
<style scoped src="./scene/sceneResponsive.css"></style>
