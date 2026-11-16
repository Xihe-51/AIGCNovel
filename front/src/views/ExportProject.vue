<template>
	<div class="export-project-container" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
		<!-- 右上角入口栏 + 竖屏提示 -->
		<PlayerEntryBar
			:language="playerSettings.language"
			:loading="loading"
			:error="error"
			:can-rollback="canRollback"
			:can-perform="canPerform"
			:perform-mode="performMode"
			:has-variables="!!projectVariables.length"
			:has-releases="!!publicReleases.length"
			:has-chapters="!!chapterRoute.length"
			:debug-mode="debugMode"
			:show-rotate-hint="showRotateHint"
			@open-settings="openSettings"
			@rollback="rollbackOneLine"
			@toggle-perform="togglePerformMode"
			@open-status="statusDialogVisible = true"
			@open-gallery="openGallery"
			@open-changelog="changelogVisible = true"
			@open-chapters="chaptersVisible = true"
			@toggle-debug="debugPanelVisible = !debugPanelVisible"
			@dismiss-rotate="dismissRotateHint"
		/>

		<!-- 演出模式：仅作者预览（?edit=1）可见，公开发布后玩家端不会出现 -->
		<PlayerPerformPanel
			v-if="canPerform && performMode && !loading && !error"
			v-model:content-text="performText"
			v-model:avatar-id="performAvatarId"
			v-model:background="performBackground"
			v-model:music="performMusic"
			:scene-index="currentSceneIndex"
			:scene-count="scenes.length"
			:node-id="currentDialogue?.content_id || '-'"
			:characters="characters"
			:content-type="currentDialogue?.content_type || ''"
			:saving="performSaving"
			:status="performStatus"
			@save="savePerformEdit"
			@close="performMode = false"
		/>

		<!-- 调试器（仅 ?debug=1 时显示） -->
		<PlayerDebugPanel
			v-if="debugMode && debugPanelVisible && !loading && !error"
			v-model:jump-id="debugJumpId"
			v-model:breakpoint="debugBreakpoint"
			:scene-index="currentSceneIndex"
			:scene-count="scenes.length"
			:node-id="currentDialogue?.content_id || '-'"
			:variables="projectVariables"
			:variable-values="variableValues"
			:breakpoint-hit="debugBreakpointHit"
			:history="variableHistory"
			:snapshots="debugSnapshots"
			:coverage="coverageStats"
			:uncovered-nodes="uncoveredNodes"
			:uncovered-edges="uncoveredEdges"
			@jump="debugJump"
			@set-var="setDebugVar"
			@clear-history="variableHistory = []"
			@save-snapshot="saveDebugSnapshot"
			@restore-snapshot="restoreDebugSnapshot"
			@delete-snapshot="deleteDebugSnapshot"
			@reset-coverage="resetCoverage"
			@jump-to="debugJumpTo"
			@close="debugPanelVisible = false"
		/>

		<!-- 背景音乐播放器 -->
		<audio 
			ref="backgroundMusic"
			:src="currentScene.music_url ? BASE_URL + currentScene.music_url : ''" 
			loop
			class="hidden-audio"
		>你的浏览器不支持音频播放</audio>

		<!-- 角色语音播放器（隐藏，仅承载播放与闪避状态） -->
		<audio
			v-if="currentDialogue?.voice_url && playerSettings.voiceEnabled"
			ref="dialogueVoice"
			:src="BASE_URL + currentDialogue.voice_url"
			controls
			autoplay
			class="hidden-audio"
			@play="onVoicePlay"
			@ended="onVoiceEnded"
			@pause="onVoiceEnded"
		>你的浏览器不支持音频播放</audio>

		<!-- 预览区域：背景 / 立绘 / 演出效果（浮层由插槽投放） -->
		<PlayerPreviewStage
			:language="playerSettings.language"
			:bg-src="bgShown"
			:bg-fading="bgFading"
			:bg-blackout="bgBlackout"
			:stage-layers="stageLayers"
			:has-stage-avatars="hasStageAvatars"
			:preview-avatar-layers="previewAvatarLayers"
			:fg-src="fgShown"
			:fg-fading="fgFading"
			:show-foreground="stageLayerVisible.foreground !== false"
			:active-effect="activeEffect"
			:is-waiting="isWaiting"
			:variable-notices="variableNotices"
			:audio-drama="playerSettings.audioDrama"
			:sprite-motion="playerSettings.spriteMotion"
			:loading="loading"
			:error="error"
			@background-click="onDialogueClick"
			@wheel-up="onWheelUp"
			@back-home="backToHome"
		>
			<!-- 历史对话弹窗 -->
			<PlayerHistoryDialog
				:language="playerSettings.language"
				:visible="showHistoryDialogue"
				:items="historyItemViews"
				@close="toggleHistoryDialogue"
			/>
			
			<!-- 对话显示区域（含选项与功能键） -->
			<PlayerDialogueBox
				:language="playerSettings.language"
				:visible="!loading && !error && showDialogueBox && stageLayerVisible.dialogue !== false"
				:has-line="currentDialogueIndex < currentSceneDialogues.length"
				:scene-ended="currentDialogueIndex >= currentSceneDialogues.length && currentSceneDialogues.length > 0"
				:no-dialogues="currentSceneDialogues.length === 0"
				:content-type="currentDialogue?.content_type || ''"
				:box-style="playerSettings.boxStyle || 'classic'"
				:font-size="playerSettings.fontSize"
				:line-height="playerSettings.lineHeight"
				:character-name="getCharacterName(currentDialogue?.character_id)"
				:text-html="displayedHtml"
				:avatar-src="previewAvatarSrc"
				:show-voice-button="!!(currentDialogue?.voice_url && playerSettings.voiceEnabled)"
				:auto-play="autoPlay"
				:show-reveal-button="!loading && !error && !showDialogueBox && stageLayerVisible.dialogue !== false"
				:choices="dialogueChoiceViews"
				@advance="onDialogueClick"
				@replay-voice="replayVoice"
				@select-choice="handleChoiceSelect"
				@history="toggleHistoryDialogue"
				@toggle-box="toggleDialogueBox"
				@skip="skipToNextScene"
				@toggle-auto="toggleAutoPlay"
				@restart="restartGame"
				@save="openSaveDialog"
				@exit="exitGame"
				@reveal-box="toggleDialogueBox"
			/>
		</PlayerPreviewStage>

		<!-- 达成结局 -->
		<PlayerEndingDialog
			v-model:visible="endingDialogVisible"
			:language="playerSettings.language"
			:ending="currentEnding"
			:playthrough="playthrough"
			@restart="resetGame"
			@next="startNextPlaythrough"
			@back="backToHome"
		/>

		<!-- 当前状态 -->
		<PlayerStatusDialog
			v-model:visible="statusDialogVisible"
			:language="playerSettings.language"
			:playthrough="playthrough"
			:project-variables="projectVariables"
			:variable-values="variableValues"
			:character-names="characterNames"
		/>

		<!-- 存档 / 读档 -->
		<PlayerSaveDialog
			v-model:visible="saveDialogVisible"
			:language="playerSettings.language"
			:saves="saves"
			:scene-title-of="sceneTitleById"
			@save="saveToSlot"
			@load="loadFromSlot"
			@delete="deleteSlot"
		/>

		<!-- 阅读设置 -->
		<PlayerSettingsDialog
			v-model:visible="settingsVisible"
			:settings="playerSettings"
			:language="playerSettings.language"
			@toggle-fullscreen="toggleFullscreen"
			@reset="resetSettings"
		/>

		<!-- 更新记录 -->
		<PlayerChangelogDialog
			v-model:visible="changelogVisible"
			:releases="publicReleases"
			:language="playerSettings.language"
		/>

		<!-- 章节快捷跳转 / 路线图鉴 -->
		<PlayerChaptersDialog
			v-model:visible="chaptersVisible"
			:chapters="chapterRoute"
			:route-stats="routeStats"
			:endings="endings"
			:language="playerSettings.language"
			@jump-chapter="jumpToChapter"
		/>

		<!-- 鉴赏 / 收藏 -->
		<PlayerGalleryDialog
			v-model:visible="galleryDialogVisible"
			:language="playerSettings.language"
			:tab="galleryTab"
			:items="galleryItems"
			:count-text="galleryCountText"
			:music-items="musicItems"
			:music-loading="musicLoading"
			:achievements="achievements"
			:endings="endings"
			@switch-tab="switchGalleryTab"
		/>
	</div>
</template>

<script setup>
import { defineProps, getCurrentInstance } from 'vue'
import { useRoute } from 'vue-router'
import { BASE_URL } from '@/utils/request'
import { usePlayerController } from '@/composables/player/usePlayerController'
import { usePlayerPanels } from '@/composables/player/usePlayerPanels'
import PlayerChangelogDialog from '@/components/player/PlayerChangelogDialog.vue'
import PlayerChaptersDialog from '@/components/player/PlayerChaptersDialog.vue'
import PlayerSettingsDialog from '@/components/player/PlayerSettingsDialog.vue'
import PlayerEndingDialog from '@/components/player/PlayerEndingDialog.vue'
import PlayerStatusDialog from '@/components/player/PlayerStatusDialog.vue'
import PlayerSaveDialog from '@/components/player/PlayerSaveDialog.vue'
import PlayerGalleryDialog from '@/components/player/PlayerGalleryDialog.vue'
import PlayerDialogueBox from '@/components/player/PlayerDialogueBox.vue'
import PlayerPreviewStage from '@/components/player/PlayerPreviewStage.vue'
import PlayerHistoryDialog from '@/components/player/PlayerHistoryDialog.vue'
import PlayerEntryBar from '@/components/player/PlayerEntryBar.vue'
import PlayerPerformPanel from '@/components/player/PlayerPerformPanel.vue'
import PlayerDebugPanel from '@/components/player/PlayerDebugPanel.vue'

// 获取路由实例（退出游戏回首页）
const { proxy } = getCurrentInstance()

// 定义接收的属性
const props = defineProps({
	projectId: {
		type: String,
		required: true
	},
	// 静态网页包 / 发布预览：固定剥离调试器与演出编辑工具
	releaseMode: {
		type: Boolean,
		default: false
	}
})

const route = useRoute()

// 编排层：基础状态 + 演出推进（开局装载 / 叙事位置 / 条件 / 音频 / 舞台 / 推进 / 存档副作用）
const core = usePlayerController({
	projectId: () => props.projectId,
	releaseMode: () => props.releaseMode,
	routeQuery: () => route.query,
	goHome: () => { proxy?.$router?.push('/home') },
})

// 面板域：存档槽位 / 章节 / 鉴赏 / 更新日志 / 演出编辑 / 输入接入
const panels = usePlayerPanels(core)

const {
	playerSettings,
	loading,
	error,
	canRollback,
	canPerform,
	projectVariables,
	debugMode,
	debugPanelVisible,
	showRotateHint,
	onTouchStart,
	onTouchEnd,
	dismissRotateHint,
	openSettings,
	rollbackOneLine,
	statusDialogVisible,
	scenes,
	characters,
	currentScene,
	currentSceneIndex,
	currentDialogue,
	currentDialogueIndex,
	currentSceneDialogues,
	displayedHtml,
	autoPlay,
	dialogueChoiceViews,
	previewAvatarSrc,
	historyItemViews,
	showHistoryDialogue,
	showDialogueBox,
	stageLayers,
	hasStageAvatars,
	previewAvatarLayers,
	stageLayerVisible,
	bgShown,
	bgFading,
	bgBlackout,
	fgShown,
	fgFading,
	activeEffect,
	isWaiting,
	variableNotices,
	backgroundMusic,
	dialogueVoice,
	onVoicePlay,
	onVoiceEnded,
	onDialogueClick,
	onWheelUp,
	replayVoice,
	handleChoiceSelect,
	toggleHistoryDialogue,
	toggleDialogueBox,
	skipToNextScene,
	toggleAutoPlay,
	restartGame,
	endingDialogVisible,
	currentEnding,
	playthrough,
	resetGame,
	startNextPlaythrough,
	characterNames,
	sceneTitleById,
	settingsVisible,
	toggleFullscreen,
	resetSettings,
	achievements,
	endings,
	getCharacterName,
	backToHome,
	debugJumpId,
	debugBreakpoint,
	debugBreakpointHit,
	variableValues,
	variableHistory,
	debugSnapshots,
	coverageStats,
	uncoveredNodes,
	uncoveredEdges,
	debugJump,
	setDebugVar,
	saveDebugSnapshot,
	restoreDebugSnapshot,
	deleteDebugSnapshot,
	resetCoverage,
	debugJumpTo,
} = core

const {
	performMode,
	togglePerformMode,
	performText,
	performAvatarId,
	performBackground,
	performMusic,
	performSaving,
	performStatus,
	savePerformEdit,
	publicReleases,
	changelogVisible,
	chaptersVisible,
	chapterRoute,
	routeStats,
	jumpToChapter,
	saveDialogVisible,
	saves,
	saveToSlot,
	loadFromSlot,
	deleteSlot,
	openSaveDialog,
	exitGame,
	galleryDialogVisible,
	galleryTab,
	galleryItems,
	galleryCountText,
	musicItems,
	musicLoading,
	switchGalleryTab,
	openGallery,
} = panels
</script>

<style scoped src="./player/playerShell.css"></style>
<style scoped src="./player/playerResponsive.css"></style>
