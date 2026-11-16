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
						
			<!-- 对话编辑部分 -->
			<div v-show="panelTab === 'script'" class="panel-section">
				<h3 class="section-title">对话编辑</h3>
				
				<div class="dialogue-controls">
					<el-button size="small" type="success" @click="addNewDialogue">
						<el-icon :size="16"><Plus /></el-icon> 添加对话
					</el-button>
					<el-button size="small" @click="openScriptImport">导入剧本</el-button>
					<el-button size="small" :disabled="!canUndoAny" @click="undoLast">撤销</el-button>
					<el-button size="small" :disabled="!canRedo" @click="redo">重做</el-button>
					<el-button size="small" type="warning" @click="reorderDialogues">
						<el-icon :size="16"><RefreshLeft /></el-icon> 按当前顺序保存排序
					</el-button>
					<el-button size="small" type="primary" @click="saveAllDialogues">保存全部</el-button>
					<el-button size="small" @click="openGraph">剧情图</el-button>
					<el-button size="small" @click="openVoiceDirector">配音导演</el-button>
					<span :class="['save-state', { 'is-dirty': dirty }]" :title="dirty ? '台词有改动尚未保存到服务器' : '台词改动已保存到服务器'">
						{{ loading ? '保存中…' : (dirty ? '台词未保存' : '台词已保存') }}
					</span>
				</div>
				
				<div v-if="selectedIndexes.length" class="batch-bar">
						<span class="batch-count">已选 {{ selectedIndexes.length }} 条</span>
						<el-button size="small" type="danger" plain @click="batchDelete">批量删除</el-button>
						<el-button size="small" @click="batchDuplicate">批量复制</el-button>
						<el-button size="small" type="success" plain @click="openVoiceBatch">批量配音</el-button>
						<el-button size="small" text @click="clearSelection">取消选择</el-button>
					</div>

					<div
						class="dialogues-editor"
						@focusin="beginTextEdit"
						@input="queueTextHistory"
						@focusout="flushTextHistory"
					>
						<DialogueEditorCard
							v-for="(dialogue, index) in dialogues"
							:key="dialogue.content_id || index"
							:dialogue="dialogue"
							:index="index"
							:characters="characters"
							:variables="variables"
							:dialogues="dialogues"
							:project-nodes="projectNodes"
							:jump-map="jumpMap"
							:effects-map="effectsMap"
							:fsm-states-map="dialogueFsmStates"
							:selected="isSelected(index)"
							:focused="isDialogueFocused(dialogue.content_id)"
							@select="selectDialogue"
							@toggle-select="toggleSelect"
							@set-fsm="(payload) => setFsmState(payload.dialogue, payload.state)"
							@open-directive="openDirectiveDialog"
							@open-node-condition="openNodeConditionDialog"
							@play="playFromDialogue"
							@delete="deleteDialogue"
							@move-up="moveDialogueUp"
							@move-down="moveDialogueDown"
							@add="addNewDialogue"
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
						/>
					
					<div v-if="dialogues.length === 0 && !loading" class="no-dialogues">
						暂无对话，点击"添加对话"开始创建
					</div>
				</div>
			</div>
		</div>
		
		<!-- 右侧预览区域：舞台渲染拆到 SceneStagePreview -->
		<audio 
			ref="backgroundMusic"
			:src="scene.music_url ? BASE_URL + scene.music_url : ''" 
			loop
			class="hidden-audio"
		>你的浏览器不支持音频播放</audio>
		<SceneStagePreview
			:bg-src="previewBgSrc"
			:avatar-src="previewAvatarSrc"
			:avatar-sources="previewAvatarSources"
			:foreground-src="previewFgSrc"
			:slots="previewSlots"
			:has-slots="hasPreviewSlots"
			:active-effect="activeEffect"
			:loading="loading"
			:error="error"
			:dialogue-count="dialogues.length"
			:dialogue-index="currentDialogueIndex"
			:current-dialogue="currentDialogue"
			:speaker-name="currentSpeakerName"
			:dialogue-html="currentDialogueHtml"
			:show-bgm="!!scene.music_url"
			:bgm-muted="bgmMuted"
			:is-panel-open="isPanelOpen"
			:editable="stageEditing"
			:can-edit="!!currentDialogue?.content_id"
			:dialogue-key="currentDialogue?.content_id || ''"
			:can-undo="canUndoAvatar"
			:grid-snap="stageGridSnap"
			:stage-visibility="stageVisibility"
			:bg-available="bgAvailable"
			:fg-available="fgAvailable"
			:avatar-layers="avatarLayers"
			:max-layers="MAX_AVATAR_LAYERS"
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
	
	<!-- AI对话对话框 -->
	<AiAssistDialog
		v-model:visible="aiDialogVisible"
		v-model:question="aiQuestion"
		:index="currentAIIndex"
		:answer="aiAnswer"
		:refs="aiRefs"
		:loading="aiLoading"
		:stage="aiStage"
		@send="sendToAI"
		@apply="applyAIAnswer"
		@clear-answer="aiAnswer = ''"
	/>

		<!-- 演出指令弹窗 -->
		<DirectiveDialog
			ref="directiveDialogRef"
			v-model:visible="directiveDialogVisible"
			:project-id="Number(projectId)"
			:content-id="directiveContentId"
			:target-label="directiveTarget"
			:characters="characters"
			:default-character-id="currentDialogue?.character_id || null"
			:default-avatar-id="currentDialogue?.avatar_id || null"
			:asset-nonce="assetNonce"
			@changed="handleDirectivesChanged"
		/>

	<!-- 台词显示条件 -->
	<NodeConditionDialog
		v-model:visible="nodeConditionVisible"
		:target-label="nodeConditionTarget"
		:mode="nodeConditionMode"
		:items="nodeConditionItems"
		:variables="variables"
		@apply="applyNodeCondition"
		@clear="clearNodeCondition"
	/>

		<!-- 批量导入剧本 -->
		<ScriptImportDialog
			v-model:visible="scriptImportVisible"
			@import="handleScriptImport"
		/>

		<!-- 批量配音：选中台词逐条 TTS 并回填 voice_url -->
		<VoiceBatchDialog
			v-model:visible="voiceBatchVisible"
			:items="voiceBatchItems"
			:selected-count="selectedIndexes.length"
			:emotion-options="emotionOptions"
			:running="voiceBatchRunning"
			:done="voiceBatchDone"
			:total="voiceBatchTotal"
			:current="voiceBatchCurrent"
			:errors="voiceBatchErrors"
			@run="runVoiceBatch"
		/>

		<!-- 配音导演：场景情绪分布 + 规则自动标注 -->
		<VoiceDirectorDialog
			v-model:visible="voiceDirectorVisible"
			v-model:scope="emotionTagScope"
			v-model:only-unlabeled="emotionTagOnlyUnlabeled"
			:emotion-options="emotionOptions"
			:stat-rows="emotionStatRows"
			:scene-total="sceneEmotionStats.total"
			:scene-voicable-count="sceneVoicableCount"
			:selected-count="selectedIndexes.length"
			:rows="emotionTagRows"
			:running="emotionTagRunning"
			:checked-count="emotionTagCheckedCount"
			@tag="runEmotionAutoTag"
			@apply="applyEmotionTags"
		/>

		<!-- 逐句译文：一条台词在多种语言下的文本，缺失时播放器回退原文 -->
		<DialogueTranslationDialog
			v-model:visible="translationDialogVisible"
			:target="translationTarget"
			:saving="translationSaving"
			@save="saveTranslation"
		/>

		<!-- 场景标题/描述译文 -->
		<SceneTranslationDialog
			v-model:visible="sceneTransVisible"
			:title="scene.title || ''"
			:description="scene.description || ''"
			:translations="scene.translations || {}"
			:saving="sceneTransSaving"
			@save="saveSceneTranslations"
		/>

		<!-- 选项译文 -->
		<ChoiceTranslationDialog
			v-model:visible="choiceTransVisible"
			:target="choiceTransTarget"
			:saving="choiceTransSaving"
			@save="saveChoiceTranslation"
		/>

		<!-- 从项目素材库选择，复用已有背景/音乐 -->
		<AssetPickerDialog
			v-model:visible="assetPickerVisible"
			:kind="assetPickerKind"
			:loading="assetPickerLoading"
			:items="assetPickerItems"
			:base-url="BASE_URL"
			:selected-url="assetPickerKind === 'image' ? scene.background_url : scene.music_url"
			@select="useAssetFromLibrary"
		/>
	</template>

<script setup>
// 本组件是从纯 JS 演进而来的大文件；当前仍是 JS 脚本，类型检查未开启，拆分/转 TS 见后续重构计划。
import {
	defineProps,
	ref,
	onMounted,
	onBeforeUnmount,
	computed,
	nextTick,
	watch
} from 'vue'
import {
	saveDialogues,
	deleteDialogue as apiDeleteDialogue,
	reorderDialoguesApi
} from '@/api/dialogue'
import {
	BASE_URL
} from '@/utils/request'
import { getCharacterName as resolveCharacterName } from '@/utils/scene'
import { generateText, continueStory } from '@/api/ai'  
import { listBranches, createBranch, deleteBranch } from '@/api/branch'
import { createProjectVersion } from '@/api/version'
import { saveBranchTranslation } from '@/api/translation'
import { 
  ArrowLeft, 
  ArrowRight, 
  Plus, 
  RefreshLeft, 
  ArrowDown,
  Edit, 
  Delete, 
  Top, 
  Bottom, 
  MagicStick,
  Promotion  
} from '@element-plus/icons-vue'
import SceneStagePreview from '@/components/SceneStagePreview.vue';
import DialogueTranslationDialog from '@/components/scene/DialogueTranslationDialog.vue';
import SceneTranslationDialog from '@/components/scene/SceneTranslationDialog.vue';
import ChoiceTranslationDialog from '@/components/scene/ChoiceTranslationDialog.vue';
import VoiceBatchDialog from '@/components/scene/VoiceBatchDialog.vue';
import VoiceDirectorDialog from '@/components/scene/VoiceDirectorDialog.vue';
import ScriptImportDialog from '@/components/scene/ScriptImportDialog.vue';
import DirectiveDialog from '@/components/scene/DirectiveDialog.vue';
import AiAssistDialog from '@/components/scene/AiAssistDialog.vue';
import NodeConditionDialog from '@/components/scene/NodeConditionDialog.vue';
import AssetPickerDialog from '@/components/scene/AssetPickerDialog.vue';
import DialogueEditorCard from '@/components/scene/DialogueEditorCard.vue';
import SceneSettingsPanel from '@/components/scene/SceneSettingsPanel.vue';
import { MAX_AVATAR_LAYERS } from '@/composables/scene/useDirectiveEditor';
import { useSceneStagePreview } from '@/composables/scene/useSceneStagePreview';
import { useSceneStageActions } from '@/composables/scene/useSceneStageActions';
import { useSceneTranslations } from '@/composables/scene/useSceneTranslations';
import { useSceneNodeEditors } from '@/composables/scene/useSceneNodeEditors';
import { useSceneVoiceBatch, EMOTION_OPTIONS } from '@/composables/scene/useSceneVoiceBatch';
import { useSceneVoiceDirector } from '@/composables/scene/useSceneVoiceDirector';
import { useSceneHistory } from '@/composables/scene/useSceneHistory';
import { useSceneSelection } from '@/composables/scene/useSceneSelection';
import { useSceneScriptImport } from '@/composables/scene/useSceneScriptImport';
import { useSceneSettingsAutosave } from '@/composables/scene/useSceneSettingsAutosave';
import { useSceneUploads } from '@/composables/scene/useSceneUploads';
import { useSceneStageSync } from '@/composables/scene/useSceneStageSync';
import { useSceneDialogueList } from '@/composables/scene/useSceneDialogueList';
import { useSceneDialoguePreview } from '@/composables/scene/useSceneDialoguePreview';
import { useSceneAssetDrop } from '@/composables/scene/useSceneAssetDrop';
import { useSceneBranches } from '@/composables/scene/useSceneBranches';
import { useSceneAssetPicker } from '@/composables/scene/useSceneAssetPicker';
import { useSceneDebugPlayback } from '@/composables/scene/useSceneDebugPlayback';
import { useSceneDirectives } from '@/composables/scene/useSceneDirectives';
import { useSceneLock } from '@/composables/scene/useSceneLock';
import { useSceneFsmStates } from '@/composables/scene/useSceneFsmStates';
import { useSceneAiAssistant } from '@/composables/scene/useSceneAiAssistant';
import { useSceneAudio } from '@/composables/scene/useSceneAudio';
import { useSceneLoader } from '@/composables/scene/useSceneLoader';
import { layerIdOf, layerNameOf, layerOrderOf, stageDefaultX } from '@/composables/player/usePlayerStage';

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
// 原有状态
const scene = ref({});
const projectId = ref('');
// 素材库拖拽到场景槽位
const dragOverBg = ref(false);
const dragOverMusic = ref(false);
const dialogues = ref([]);
// 场景播放条件（剧情锁）：见 useSceneLock
const {
	sceneLockMode,
	sceneLockItems,
	addSceneLockCondition,
	removeSceneLockCondition,
	loadSceneLock,
	buildSceneLockPayload,
} = useSceneLock({ projectId, sceneId: () => props.sceneId });
// 搜索定位时高亮的节点（响应式，避免被后续渲染冲掉）
const focusedContentId = ref(null);
// 搜索/剧情图定位的高亮：短时高亮优先，其次保留外层传入的定位目标
const activeFocusId = computed(() => focusedContentId.value ?? props.focusContentId ?? null);
const isDialogueFocused = (contentId) => {
	if (activeFocusId.value === null || activeFocusId.value === undefined) return false;
	return String(contentId) === String(activeFocusId.value);
};

// ===== 撤销 / 重做 / 未保存草稿 =====
const {
	undoStack,
	redoStack,
	dirty,
	canUndo,
	canRedo,
	cloneDialogues,
	pushHistory,
	applySnapshot,
	undo,
	clearHistory,
	redo,
	saveDraftNow,
	markDirty,
	clearDraft,
	beginTextEdit,
	queueTextHistory,
	flushTextHistory,
	maybeRestoreDraft,
} = useSceneHistory({
	sceneId: () => props.sceneId,
	getDialogues: () => dialogues.value,
	setDialogues: (list) => { dialogues.value = list; },
	getCurrentIndex: () => currentDialogueIndex.value,
	setCurrentIndex: (i) => { currentDialogueIndex.value = i; },
	clearSelection: () => clearSelection(),
	reloadDirectives: () => {
		const cur = currentDialogue.value;
		loadPreviewDirectives(cur ? cur.content_id : null);
	},
});

const onWindowKeydown = (e) => {
	const tag = (e.target && e.target.tagName) || '';
	const inField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
	if (!(e.ctrlKey || e.metaKey)) return;
	const key = (e.key || '').toLowerCase();
	// Ctrl+S / Cmd+S：输入框里也允许全保存
	if (key === 's') {
		e.preventDefault();
		if (!loading.value) saveAllDialogues();
		return;
	}
	if (inField) return;
	if (key === 'z') {
		e.preventDefault();
		e.shiftKey ? redo() : undoLast();
	} else if (key === 'y') {
		e.preventDefault();
		redo();
	}
};

const onBeforeUnload = (e) => {
	if (sceneDirty.value) {
		persistSceneSettings({ silent: true, version: false });
		e.preventDefault();
		e.returnValue = '';
		return;
	}
	if (!dirty.value) return;
	saveDraftNow();
	e.preventDefault();
	e.returnValue = '';
};

// ===== 多选与批量操作 =====
const {
	selectedIndexes,
	isSelected,
	toggleSelect,
	clearSelection,
	batchDelete,
	batchDuplicate,
} = useSceneSelection({
	dialogues,
	getDirty: () => dirty.value,
	pushHistory,
	clearHistory,
	markDirty,
	clearDraft,
	dropProjectNode: (contentId) => {
		projectNodes.value = projectNodes.value.filter(n => n.content_id !== contentId);
	},
});

// ===== 批量配音：选中台词逐条 TTS，生成后回填 voice_url =====
// 配音导演：台词情绪标签（与后端 EMOTION_OPTIONS 一致）
const emotionOptions = EMOTION_OPTIONS;
const {
	voiceBatchVisible,
	voiceBatchRunning,
	voiceBatchDone,
	voiceBatchTotal,
	voiceBatchCurrent,
	voiceBatchErrors,
	voiceBatchItems,
	openVoiceBatch,
	characterVoiceFor,
	runVoiceBatch,
} = useSceneVoiceBatch({
	projectId,
	scene,
	dialogues,
	selectedIndexes,
	getCharacters: () => characters.value,
});

// ===== 配音导演：场景情绪分布 + 规则自动标注 =====
const {
	voiceDirectorVisible,
	emotionTagScope,
	emotionTagOnlyUnlabeled,
	emotionTagRunning,
	emotionTagRows,
	sceneVoicableCount,
	sceneEmotionStats,
	emotionStatRows,
	emotionTagCheckedCount,
	openVoiceDirector,
	emotionTagTargets,
	runEmotionAutoTag,
	applyEmotionTags,
} = useSceneVoiceDirector({
	projectId,
	scene,
	dialogues,
	selectedIndexes,
	snapshot: cloneDialogues,
	pushHistory,
	markDirty,
});

// ===== 剧本批量导入 =====
const {
	scriptImportVisible,
	openScriptImport,
	handleScriptImport,
} = useSceneScriptImport({
	dialogues,
	scene,
	getCharacters: () => characters.value,
	pushHistory,
	markDirty,
	clearSelection,
});
// 项目内全部剧情节点（跨场景），用于分支跳转目标选择
const projectNodes = ref([]);
// 非「选择」节点的自动跳转边（source_content_id → branch）
const jumpMap = ref({});
// 项目变量与节点数值变化
const variables = ref([]);
const effectsMap = ref({});
const characters = ref([]);
const loading = ref(true);
const error = ref('');
const isPanelOpen = ref(true);
// 编辑面板默认进入「脚本」，场景设置收进第二个 tab，避免打开先看到大背景图
const panelTab = ref('script');
// 舞台直接拖拽立绘（画布第一版）：拖动后写回 avatar 演出指令
const stageEditing = ref(false);
// 拖拽网格吸附：0 = 关闭，5 = 吸附到 5% 网格
const stageGridSnap = ref(0);
// 场景设置（标题/描述/背景/音乐/剧情锁）的独立保存状态：
// 台词有 dirty，场景设置也必须有自己的 dirty，否则切场景会静默丢改动。
const sceneReady = ref(false);
const {
	sceneDirty,
	sceneSaving,
	resetSnapshot,
	refreshSceneDirty,
	cancelScheduledSave,
	persistSceneSettings,
	saveSceneSettings,
} = useSceneSettingsAutosave({
	sceneId: () => props.sceneId,
	scene,
	projectId: () => projectId.value,
	getSceneReady: () => sceneReady.value,
	buildLock: () => buildSceneLockPayload(),
	onSaved: () => emit('scene-updated'),
});
const currentDialogueIndex = ref(0);
const defaultBackground = '';

// 场景设置面板里的试听 <audio> 由子组件持有并 defineExpose，音频控制仍统一在父级
const settingsPanelRef = ref(null);
const settingsAudio = computed(() => settingsPanelRef.value?.settingsAudio || null);
const backgroundMusic = ref(null);

/* ===== 音频：场景设置试听 + 舞台 BGM（见 useSceneAudio） ===== */
const {
	musicPlaying,
	musicProgress,
	musicDuration,
	bgmMuted,
	toggleMusic,
	onMusicTime,
	onMusicMeta,
	seekMusic,
	playBackgroundMusic,
	toggleBgm,
	stopBackgroundMusic,
	stopSettingsAudio,
} = useSceneAudio({ scene, settingsAudio, backgroundMusic });

/* ===== 演出指令（节点级）：弹窗自己读写指令，父级管撤销栈与预览刷新（见 useSceneDirectives） ===== */
const directiveDialogRef = ref(null);
const {
	directiveDialogVisible,
	directiveContentId,
	directiveTarget,
	refreshDirectiveList,
	handleDirectivesChanged,
	openDirectiveDialog,
} = useSceneDirectives({
	dialogues,
	currentDialogueIndex,
	directiveDialogRef,
	recordStageUndo: (contentId, before, after) => recordStageUndo(contentId, before, after),
	syncPreviewIfCurrent: (contentId) => syncPreviewIfCurrent(contentId),
});

/* ===== AI 续写/问答：弹窗状态 + /ai/continue_story 请求编排（见 useSceneAiAssistant） ===== */
const {
	aiDialogVisible,
	aiQuestion,
	aiAnswer,
	aiLoading,
	currentAIIndex,
	aiStage,
	aiRefs,
	openAIDialog,
	sendToAI,
	applyAIAnswer,
} = useSceneAiAssistant({
	projectId,
	scene,
	dialogues,
	getCharacterName: (characterId) => getCharacterName(characterId),
});

/* ===== 台词审校状态（FSM）：只存本地 localStorage（见 useSceneFsmStates） ===== */
const {
	dialogueFsmStates,
	loadFsmStates,
	persistFsmStates,
	setFsmState,
} = useSceneFsmStates({ sceneId: () => props.sceneId });

// ==================== 原有方法 ====================
const togglePanel = () => {
	isPanelOpen.value = !isPanelOpen.value;
};

/* ===== 节点级编辑：显示条件 / 数值变化（见 useSceneNodeEditors） ===== */
const {
	nodeConditionVisible,
	nodeConditionIndex,
	nodeConditionMode,
	nodeConditionItems,
	nodeConditionTarget,
	openNodeConditionDialog,
	applyNodeCondition,
	clearNodeCondition,
	addEffect,
	removeEffect,
	saveDialogueEffects,
} = useSceneNodeEditors({
	projectId,
	dialogues,
	variables,
	effectsMap,
	markDirty,
	pushHistory,
});

/* ===== 预览联动：当前台词 / 搜索定位 / 立绘与素材地址（见 useSceneDialoguePreview） ===== */
const {
	currentDialogue,
	richPreviewHtml,
	currentSpeakerName,
	currentDialogueHtml,
	selectDialogue,
	focusDialogueByContentId,
	nextDialogue,
	restartDialogues,
	assetNonce,
	assetSrc,
	avatarLayersOf,
	cancelFocusPulse,
} = useSceneDialoguePreview({
	dialogues,
	characters,
	currentDialogueIndex,
	focusedContentId,
	focusContentId: () => props.focusContentId,
	getCharacterName: (characterId) => getCharacterName(characterId),
});

// 切到剧情图等视图时暂停 BGM，回到脚本再继续
watch(() => props.paused, (paused) => {
	if (paused) {
		stopBackgroundMusic();
		stopSettingsAudio();
	} else {
		nextTick(() => { playBackgroundMusic(); });
	}
});

/* ===== 预览区：按当前对话的演出指令渲染（模型见 useSceneStagePreview） ===== */
const {
	previewDirectives,
	previewSlots,
	hasPreviewSlots,
	avatarLayers,
	stageVisibility,
	previewBgSrc,
	bgAvailable,
	fgAvailable,
	previewFgSrc,
	previewAvatarSources,
	previewAvatarSrc,
	previewSpeaker,
	settingsBgFailed,
	activeEffect,
	loadPreviewDirectives,
} = useSceneStagePreview({
	projectId,
	characters,
	scene,
	dialogues,
	currentDialogueIndex,
	assetSrc,
	avatarLayersOf,
	defaultBackground,
});
/* ===== 舞台写操作：图层/显隐/撤销栈（见 useSceneStageActions） ===== */
const {
	stageUndoStack,
	canUndoAvatar,
	recordStageUndo,
	snapshotStageDirectives,
	markStageUndoApplied,
	clearPersistedStageUndo,
	restorePersistedStageUndo,
	undoAvatar,
	findAvatarDirective,
	nextLayerOrder,
	handleAvatarVisibility,
	handleAvatarOrder,
	handleAvatarReorder,
	handleAvatarRemove,
	handleAvatarRename,
	handleStageVisibility,
	handleAvatarGroupMove,
	handleAvatarTransform,
	handleAvatarAddNew,
} = useSceneStageActions({
	projectId,
	currentDialogue,
	previewDirectives,
	avatarLayers,
	previewSlots,
	previewSpeaker,
	loadPreviewDirectives,
	refreshDirectiveList,
	clearRedo: () => { redoStack.value = []; },
});
/* ===== 素材拖拽：舞台直出 / 场景设置槽位（见 useSceneAssetDrop） ===== */
const {
	onStageAssetDrop,
	onAvatarReplaceAsset,
	onBackgroundDrop,
	onMusicDrop,
} = useSceneAssetDrop({
	projectId,
	currentDialogue,
	avatarLayers,
	scene,
	stageUndoStack,
	dragOverBg,
	dragOverMusic,
	settingsBgFailed,
	musicPlaying,
	musicProgress,
	musicDuration,
	snapshotStageDirectives,
	markStageUndoApplied,
	nextLayerOrder,
	findAvatarDirective,
	loadPreviewDirectives,
	refreshDirectiveList,
	pushHistory,
	markDirty,
});

/* ===== 舞台与预览同步：统一撤销 / 素材热重载 / 预览跟随（见 useSceneStageSync） ===== */
const { canUndoAny, undoLast, hotReloadAssets, syncPreviewIfCurrent } = useSceneStageSync({
	currentDialogue,
	undoStack,
	stageUndoStack,
	undoDialogue: undo,
	undoStage: undoAvatar,
	reloadPreviewDirectives: loadPreviewDirectives,
	restorePersistedStageUndo,
	bumpAssetNonce: () => { assetNonce.value = Date.now(); },
});

/* ===== 台词列表：增删改排序与落库（见 useSceneDialogueList） ===== */
const {
	handleCharacterChange,
	addNewDialogue,
	saveDialogue,
	saveAllDialogues,
	deleteDialogue,
	moveDialogueUp,
	moveDialogueDown,
	reorderDialogues,
} = useSceneDialogueList({
	dialogues,
	scene,
	projectId,
	getSceneId: () => props.sceneId,
	loading,
	dirty,
	undoStack,
	redoStack,
	projectNodes,
	effectsMap,
	pushHistory,
	markDirty,
	clearDraft,
	clearSelection,
	saveDialogues,
	deleteDialogueApi: apiDeleteDialogue,
	reorderDialoguesApi,
	createProjectVersion,
});

// ===== 译文：逐句 / 场景 / 选项（见 useSceneTranslations） =====
const {
	translationDialogVisible,
	translationSaving,
	translationTarget,
	openTranslationDialog,
	saveTranslation,
	sceneTransVisible,
	sceneTransSaving,
	sceneTranslationCount,
	translatedSceneLanguages,
	openSceneTranslationDialog,
	saveSceneTranslations,
	choiceTransVisible,
	choiceTransSaving,
	choiceTransTarget,
	openChoiceTranslationDialog,
	saveChoiceTranslation,
} = useSceneTranslations({ scene });

// 跳到剧情图并定位当前台词（没有台词时定位场景首个节点）
const openGraph = () => {
	const node = currentDialogue.value && currentDialogue.value.content_id
		? currentDialogue.value
		: dialogues.value.find(d => d.content_id)
	emit('open-graph', Number(props.sceneId), node?.content_id ?? null)
};

// 从指定台词开始调试播放：播放器带 ?debug=1&start=<content_id>（见 useSceneDebugPlayback）
const { playFromDialogue } = useSceneDebugPlayback({ projectId, scene });

/* ===== 素材上传：背景图 / 背景音乐 / 语音（见 useSceneUploads） ===== */
const { handleBackgroundUpload, handleMusicUpload, handleVoiceUpload } = useSceneUploads({
	projectId,
	scene,
	dialogues,
});

// ===== 素材库复用：从项目已有素材中选择背景/音乐（见 useSceneAssetPicker） =====
const {
	assetPickerVisible,
	assetPickerKind,
	assetPickerLoading,
	assetPickerItems,
	openAssetPicker,
	useAssetFromLibrary,
} = useSceneAssetPicker({ projectId, scene, settingsBgFailed, stopSettingsAudio });

// 角色名解析统一走 utils/scene（旁白 / 角色加载中 / 未知角色 的兜底文案只维护一份）
const getCharacterName = (characterId) => resolveCharacterName(characters.value, characterId);

// ==================== 第 2 批：选择项 ↔ branch_paths ====================

/* ===== 分支编排：选择项 / 自动跳转（见 useSceneBranches） ===== */
const {
	loadJumpMap,
	setJumpTarget,
	onContentTypeChange,
	ensureChoices,
	addChoice,
	addChoiceCondition,
	removeChoiceCondition,
	removeChoice,
	handleChoiceImageUpload,
	clearChoiceImage,
	saveChoices,
} = useSceneBranches({
	projectId,
	dialogues,
	projectNodes,
	jumpMap,
	pushHistory,
	markDirty,
	getCharacterName,
});

/* ===== 场景数据装载：场景 / 节点 / 变量 / 角色 / 台词一次拉齐（见 useSceneLoader） ===== */
const { fetchSceneData } = useSceneLoader({
	sceneId: () => props.sceneId,
	focusContentId: () => props.focusContentId,
	scene,
	projectId,
	dialogues,
	projectNodes,
	variables,
	effectsMap,
	characters,
	loading,
	error,
	sceneReady,
	loadSceneLock,
	resetSnapshot,
	loadJumpMap,
	loadFsmStates,
	ensureChoices,
	resetHistory: () => {
		clearHistory();
		dirty.value = false;
	},
	maybeRestoreDraft,
	focusDialogueByContentId: (id) => focusDialogueByContentId(id),
});

// 场景设置（含剧情锁）改动 → 标记 dirty 并防抖自动保存
watch(
	[scene, sceneLockMode, sceneLockItems],
	() => {
		refreshSceneDirty();
	},
	{ deep: true }
);

onMounted(() => {
	fetchSceneData();
	window.addEventListener('keydown', onWindowKeydown);
	window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(() => {
	stopBackgroundMusic();
	stopSettingsAudio();
	window.removeEventListener('keydown', onWindowKeydown);
	window.removeEventListener('beforeunload', onBeforeUnload);
	cancelFocusPulse();
	cancelScheduledSave();
	flushTextHistory();
	saveDraftNow();
	// 切场景时兜底保存场景设置，避免标题/背景/音乐改动被静默丢掉
	if (sceneDirty.value) persistSceneSettings({ silent: true, version: false });
});
</script>

<style scoped src="./scene/sceneShell.css"></style>
<style scoped src="./scene/sceneDialogue.css"></style>
<style scoped src="./scene/sceneResponsive.css"></style>
<style scoped src="./scene/sceneDialogs.css"></style>