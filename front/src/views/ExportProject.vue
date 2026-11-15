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
import {
	defineProps,
	ref,
	onMounted,
	computed,
	nextTick,
	watch,
	onUnmounted,
	getCurrentInstance
} from 'vue'
import { useRoute } from 'vue-router'
import { jwtDecode } from 'jwt-decode'
import { saveDialogues } from '@/api/dialogue'
import { updateScene } from '@/api/scenes'
import { listPublicReleases } from '@/api/release'
import { unlockMusic } from '@/api/gallery'
import { themeClass } from '@/utils/uiThemes'
import { usePlayerSettings } from '@/composables/player/usePlayerSettings'
import { usePlayerTelemetry } from '@/composables/player/usePlayerTelemetry'
import { usePlayerAudio } from '@/composables/player/usePlayerAudio'
import { usePlayerProgress } from '@/composables/player/usePlayerProgress'
import { usePlayerRewind } from '@/composables/player/usePlayerRewind'
import { usePlayerLocale } from '@/composables/player/usePlayerLocale'
import { usePlayerReads } from '@/composables/player/usePlayerReads'
import { usePlayerCoverage } from '@/composables/player/usePlayerCoverage'
import { usePlayerDebugger } from '@/composables/player/usePlayerDebugger'
import { usePlayerTouch } from '@/composables/player/usePlayerTouch'
import { usePlayerGamepad } from '@/composables/player/usePlayerGamepad'
import { usePlayerKeyboard } from '@/composables/player/usePlayerKeyboard'
import { usePlayerPerform } from '@/composables/player/usePlayerPerform'
import { usePlayerAchievements } from '@/composables/player/usePlayerAchievements'
import { usePlayerEnding } from '@/composables/player/usePlayerEnding'
import { usePlayerConditions } from '@/composables/player/usePlayerConditions'
import { usePlayerVariables } from '@/composables/player/usePlayerVariables'
import { usePlayerStage } from '@/composables/player/usePlayerStage'
import { usePlayerStageFx } from '@/composables/player/usePlayerStageFx'
import { usePlayerVariableEffects } from '@/composables/player/usePlayerVariableEffects'
import { usePlayerLineLifecycle } from '@/composables/player/usePlayerLineLifecycle'
import { usePlayerPlaySession } from '@/composables/player/usePlayerPlaySession'
import { usePlayerDirectives } from '@/composables/player/usePlayerDirectives'
import { usePlayerPreview } from '@/composables/player/usePlayerPreview'
import { usePlayerTypewriter } from '@/composables/player/usePlayerTypewriter'
import { usePlayerFlow } from '@/composables/player/usePlayerFlow'
import { usePlayerChapters } from '@/composables/player/usePlayerChapters'
import { usePlayerCollections } from '@/composables/player/usePlayerCollections'
import { usePlayerBootstrap, buildHistoryDialogues } from '@/composables/player/usePlayerBootstrap'
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
import { parseRichText, renderRichHtml } from '@/utils/richText'
import {
	BASE_URL
} from '@/utils/request'
import { ElMessage, ElLoading, ElIcon } from 'element-plus'

// 获取路由实例
const { proxy } = getCurrentInstance();

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

// 定义emit事件
const emit = defineEmits(['close'])

// 发布模式：静态包固定开启；也支持 ?release=1 让作者以玩家视角预览
const route = useRoute()
const releaseView = computed(() => props.releaseMode || route.query.release === '1')
// 调试器：仅作者且非发布模式时，?debug=1 才生效；?start=<content_id> 同理
const debugRequested = route.query.debug === '1'
const debugMode = ref(false)
const debugPanelVisible = ref(false)

// 演出模式：仅作者本人带 ?edit=1 预览时可用；公开发布的玩家端不会渲染编辑入口
const currentUserId = (() => {
	try {
		const token = localStorage.getItem('token')
		const decoded = token ? jwtDecode(token) : null
		return decoded && decoded.identity ? String(decoded.identity) : ''
	} catch (e) {
		return ''
	}
})()
const projectOwnerId = ref(0)
const isOwner = computed(() =>
	!!currentUserId
	&& projectOwnerId.value > 0
	&& String(projectOwnerId.value) === currentUserId
)
const canPerform = computed(() =>
	!releaseView.value
	&& route.query.edit === '1'
	&& isOwner.value
)
// 演出模式表单与保存编排在 usePlayerPerform 内（见下方演出模式段落）

// ==================== 开局装载：作品 / 场景 / 台词 / 分支 / 角色 ====================
const {
	scenes,
	allDialogues,
	characters,
	branches,
	loading,
	error,
	historyDialogues,
	playTheme,
	projectCoverUrl,
	fetchProjectData,
} = usePlayerBootstrap({
	projectId: () => Number(props.projectId),
	releaseView: () => releaseView.value,
	debugRequested: () => debugRequested,
	isOwner: () => isOwner.value,
	canPerform: () => canPerform.value,
	startQuery: () => route.query.start,
	setDebugMode: (value) => { debugMode.value = value },
	setPerformMode: (value) => { performMode.value = value },
	setProjectOwnerId: (value) => { projectOwnerId.value = value },
	setSceneIndex: (value) => { currentSceneIndex.value = value },
	setDialogueIndex: (value) => { currentDialogueIndex.value = value },
	loadProgress: () => loadProgress(),
	loadStoryGraph: (projectId) => loadStoryGraph(projectId),
	loadReads: () => loadReads(),
	loadChapterData: () => loadChapterData(),
	loadDebugSnapshots: () => loadDebugSnapshots(),
	loadVariableSystem: () => loadVariableSystem(),
	loadEndings: () => loadEndings(),
	loadPlayerAchievements: () => loadPlayerAchievements(),
	loadPublicReleases: () => loadPublicReleases(),
	onLoaded: () => {
		startPreview();
		initHistoryDialogues();
		logStartOnce();
		nextTick(() => logCurrentScene());
		scheduleAchievementCheck();
	},
	t: (key, params) => t(key, params),
});

const debugJumpId = ref('')
// 条件调试器：变量变化历史 / 条件断点 / 状态快照 由 usePlayerDebugger 自管
// 分支覆盖率：本轮试玩走过的节点/分支（仅调试模式记录）由 usePlayerCoverage 自管
const {
	storyGraph,
	visitedContents,
	visitedEdges,
	coverageStats,
	uncoveredNodes,
	uncoveredEdges,
	markVisitedContent,
	markVisitedEdge,
	resetCoverage,
	restoreVisited,
	loadStoryGraph,
} = usePlayerCoverage({
	debugMode: () => debugMode.value,
	getCurrentDialogue: () => currentDialogue.value,
});

// ===== 条件调试器：变量历史 / 条件断点 / 状态快照 =====
const {
	variableHistory,
	debugBreakpoint,
	debugBreakpointHit,
	debugSnapshots,
	pushVariableHistory,
	checkDebugBreakpoint,
	loadDebugSnapshots,
	saveDebugSnapshot,
	restoreDebugSnapshot,
	deleteDebugSnapshot,
} = usePlayerDebugger({
	projectId: () => Number(props.projectId),
	debugMode: () => debugMode.value,
	getCurrentDialogue: () => currentDialogue.value,
	getProjectVariables: () => projectVariables.value,
	getVariableValues: () => variableValues.value,
	getSceneIndex: () => currentSceneIndex.value,
	getDialogueIndex: () => currentDialogueIndex.value,
	getVisited: () => [...visitedContents.value],
	evalSingleCondition: (condition) => evalSingleCondition(condition),
	restoreVisited,
	clearLineSnapshots: () => clearLineSnapshots(),
	startTyping: () => startTyping(),
	setAutoPlay: (value) => { autoPlay.value = value },
	setPanelVisible: (value) => { debugPanelVisible.value = value },
	setSceneIndex: (value) => { currentSceneIndex.value = value },
	setDialogueIndex: (value) => { currentDialogueIndex.value = value },
	setVariableValues: (value) => { variableValues.value = value },
});

// ===== 试玩埋点（调试模式不记录，避免作者自己测试污染数据）=====
const {
	resetTelemetryTracking,
	logPlayEvent,
	logStartOnce,
	logCurrentScene,
} = usePlayerTelemetry({
	getProjectId: () => Number(props.projectId),
	getDebugMode: () => debugMode.value,
	getIsOwner: () => isOwner.value,
	getLoading: () => loading.value,
	getError: () => error.value,
	getCurrentSceneId: () => Number(currentScene.value?.scene_id || 0),
})

// 周目：二周目继承上一周目的变量值，方便作者做「二周目解锁」
const playthroughKey = () => `aigc:playthrough:${props.projectId}`
const playthrough = ref(1)
try {
	const stored = Number(localStorage.getItem(playthroughKey()))
	if (Number.isFinite(stored) && stored > 0) playthrough.value = Math.floor(stored)
} catch (_) { /* ignore */ }

// 状态管理（场景 / 台词 / 角色 / 分支 / 加载态 / 历史回想 / 皮肤封面由 usePlayerBootstrap 自持）
const isPlaying = ref(true); // 默认自动播放
const autoPlay = ref(false); // 始终自动播放
const defaultBackground = ''; // 默认背景图
const backgroundMusic = ref(null);
const showDialogueBox = ref(true); // 控制对话框显示/隐藏
const showHistoryDialogue = ref(false); // 控制历史对话显示/隐藏
// 空场景（没有台词/选项节点）直接跳过，避免试玩停在只有背景的画面上
const sceneHasDialogues = (sceneId) => (allDialogues.value[sceneId] || []).length > 0;

// 存档
let autoSaveTimer = null;

// 已读记录（跳过已读 / 二周目）由 usePlayerReads 自管

// 移动端触控（旋转提示/滑动切回想/滑动吞点击）由 usePlayerTouch 自管
const {
	showRotateHint,
	onTouchStart,
	onTouchEnd,
	onDialogueClick,
	dismissRotateHint,
	bindOrientation,
	unbindOrientation,
} = usePlayerTouch({
	getShowHistory: () => showHistoryDialogue.value,
	setShowHistory: (value) => { showHistoryDialogue.value = value },
	getShowDialogueBox: () => showDialogueBox.value,
	setShowDialogueBox: (value) => { showDialogueBox.value = value },
	nextDialogue: () => nextDialogue(),
});

// 变量系统（定义/取值/跨周目持久化/行为变量/变化浮层）由 usePlayerVariables 自管
const {
	projectVariables,
	variableEffects,
	variableValues,
	variableNotices,
	sceneLocks,
	metaVariables,
	clampVariable,
	initialValueOf,
	initVariableValues,
	snapshotPersistVariables,
	syncProjectMeta,
	loadProjectMeta,
	loadVariableSystem,
	clearVariableNotices,
	pushVariableNotices,
	behaviorDefOf,
	setBehaviorVariable,
	markHesitationStart,
	commitHesitation,
	bumpBehaviorReview,
} = usePlayerVariables({
	projectId: () => Number(props.projectId),
	showNotices: () => playerSettings.value.showVariableNotice,
});
const statusDialogVisible = ref(false);
const lastEffectKey = ref('');

// ==================== 结局 ====================
// 结局清单 / 已触发集合 / 结局页可见性由 usePlayerEnding 自管
const {
	endings,
	triggeredEndings,
	endingDialogVisible,
	currentEnding,
	loadEndings,
	checkEndingForCurrent,
	resetEndings,
} = usePlayerEnding({
	projectId: () => Number(props.projectId),
	getCurrentDialogue: () => currentDialogue.value,
	getCurrentScene: () => currentScene.value,
	evalCondition: (condition) => evalCondition(condition),
	logPlayEvent: (event, payload) => logPlayEvent(event, payload),
	scheduleAchievementCheck: () => scheduleAchievementCheck(),
	clearTyping: () => clearTyping(),
	clearAutoTimer: () => clearAutoTimer(),
});

// 更新日志 / 公开版本
const changelogVisible = ref(false);
const publicReleases = ref([]);

// ==================== 章节快捷跳转 / 路线图鉴 ====================
const {
	chaptersVisible,
	chapterRoute,
	routeStats,
	loadChapterData,
	jumpToChapter,
} = usePlayerChapters({
	projectId: () => Number(props.projectId),
	getScenes: () => scenes.value,
	getAllDialogues: () => allDialogues.value,
	getEndings: () => endings.value,
	hasRead: (contentId) => hasRead(contentId),
	scenePlayable: (sceneId) => scenePlayable(sceneId),
	firstPlayableNodeIndex: (sceneId) => firstPlayableNodeIndex(sceneId),
	setSceneIndex: (value) => { currentSceneIndex.value = value },
	setDialogueIndex: (value) => { currentDialogueIndex.value = value },
	clearLineSnapshots: () => clearLineSnapshots(),
	startPreview: () => startPreview(),
	t: (key, params) => t(key, params),
});

// ==================== 鉴赏 / 收藏 ====================
const {
	galleryDialogVisible,
	galleryTab,
	galleryItems,
	galleryCountText,
	musicItems,
	musicLoading,
	switchGalleryTab,
	openGallery,
} = usePlayerCollections({
	projectId: () => Number(props.projectId),
	getEndings: () => endings.value,
	getAchievements: () => achievements.value,
	getUnlockedAchievementCount: () => unlockedAchievementCount.value,
	loadPlayerAchievements: () => loadPlayerAchievements(),
	loadEndings: () => loadEndings(),
	t: (key, params) => t(key, params),
});

// 阅读设置（localStorage 持久化）
const {
	playerSettings,
	settingsVisible,
	loadSettings,
	saveSettings,
	openSettings,
	resetSettings,
	toggleFullscreen,
} = usePlayerSettings({
	onSettingsChange: () => applyVolumes(),
	onReset: () => startTyping(),
});
const dialogueVoice = ref(null);

// ==================== 界面文案与多语言 ====================
// 文案挑选与译文回退由 usePlayerLocale 托管
const {
	t,
	localizedCharacterName,
	characterNames,
	localizedText,
	localizedSceneTitle,
	sceneTitleById,
	localizedChoice,
	choiceTextById,
	historySceneTitle,
	historyChoiceText,
} = usePlayerLocale({
	getLanguage: () => playerSettings.value.language,
	getCharacters: () => characters.value,
	getScenes: () => scenes.value,
	getBranches: () => branches.value,
});

// 对白富文本：纯文本用于逐字显示，HTML 用于渲染颜色/加粗/注音
const richContent = computed(() => parseRichText(localizedText(currentDialogue.value)));
const displayedHtml = computed(() => renderRichHtml(richContent.value, displayedText.value.length));

// 当前预览状态
const currentSceneIndex = ref(0);
const currentDialogueIndex = ref(0);

// 计算属性
const currentScene = computed(() => {
	return scenes.value[currentSceneIndex.value] || {};
});

// 场景切换时记录到达埋点（首个场景由加载完成后单独补记）
watch(currentSceneIndex, () => {
	if (loading.value || error.value) return;
	nextTick(() => logCurrentScene());
});

// 进入使用某首 BGM 的场景时解锁曲目
const unlockedMusic = ref([]);
watch(
	() => currentScene.value.music_url,
	(url) => {
		if (!url || loading.value || !sceneHasDialogues(currentScene.value.scene_id)) return;
		if (unlockedMusic.value.includes(url)) return;
		unlockedMusic.value.push(url);
		unlockMusic(Number(props.projectId), url).catch(() => { /* 非作者或未登录时忽略 */ });
	},
	{ immediate: true }
);

const currentSceneDialogues = computed(() => {
	return allDialogues.value[currentScene.value.scene_id] || [];
});

const currentDialogue = computed(() => {
	return currentSceneDialogues.value[currentDialogueIndex.value];
});

// 调试覆盖率：当前节点一展示即记为已走
watch(
	() => currentDialogue.value?.content_id,
	(id) => {
		if (debugMode.value && id) markVisitedContent(id)
	},
	{ immediate: true }
);

// ==================== 上一句回退 ====================
// 行快照入栈 / 去重 / 截断与回退还原由 usePlayerRewind 托管
const {
	canRollback,
	captureLineSnapshot,
	pushLineSnapshot,
	clearLineSnapshots,
	rollbackOneLine,
} = usePlayerRewind({
	getDialogue: () => currentDialogue.value,
	getSceneIndex: () => currentSceneIndex.value,
	setSceneIndex: (value) => { currentSceneIndex.value = value },
	getDialogueIndex: () => currentDialogueIndex.value,
	setDialogueIndex: (value) => { currentDialogueIndex.value = value },
	getVariables: () => variableValues.value,
	setVariables: (value) => { variableValues.value = value },
	getLastEffectKey: () => lastEffectKey.value,
	setLastEffectKey: (value) => { lastEffectKey.value = value },
	getEndings: () => triggeredEndings.value,
	setEndings: (value) => { triggeredEndings.value = value },
	getHistory: () => historyDialogues.value,
	setHistory: (value) => { historyDialogues.value = value },
	setIsWaiting: (value) => { isWaiting.value = value },
	setIsPlaying: (value) => { isPlaying.value = value },
	setShowDialogueBox: (value) => { showDialogueBox.value = value },
	bumpBehaviorReview: () => bumpBehaviorReview(),
	clearWait: () => clearWait(),
	clearTyping: () => clearTyping(),
	resetAutoTimer: () => clearAutoTimer(),
	markSkipRestoredLine: () => markSkipRestoredLine(),
	startTyping: () => startTyping(),
	applyVolumes: () => applyVolumes(),
});

// ==================== 预览派生状态 ====================
// 说话人回溯、立绘分层与分支选项由 usePlayerPreview 托管
const { previewSpeaker, previewAvatarLayers, previewAvatarSrc, currentChoices } = usePlayerPreview({
	getDialogues: () => currentSceneDialogues.value,
	getCurrentIndex: () => currentDialogueIndex.value,
	getCurrentDialogue: () => currentDialogue.value,
	getBranches: () => branches.value,
	avatarLayersOf: (avatarId) => avatarLayersOf(avatarId),
	defaultAvatarLayersOf: (characterId) => defaultAvatarLayersOf(characterId),
	evalCondition: (conditions) => evalCondition(conditions),
});

// 完整回想：显示全局历史（不再只过滤当前场景）
const filteredHistoryDialogues = computed(() => {
	return historyDialogues.value;
});

// 历史回想浮层的展示模型（文本/作者/场景标题在此定稿，浮层组件只负责渲染）
const historyItemViews = computed(() =>
	filteredHistoryDialogues.value.map((dialogue, index) => ({
		key: index,
		sceneTitle: historySceneTitle(dialogue),
		character: getCharacterName(dialogue.character_id),
		text: localizedText(dialogue),
		chosen: !!dialogue.chosen,
		choiceText: dialogue.chosen ? historyChoiceText(dialogue) : '',
	})),
);

// 初始化历史对话（根据当前进度）
const initHistoryDialogues = () => {
	historyDialogues.value = buildHistoryDialogues(
		scenes.value,
		allDialogues.value,
		currentSceneIndex.value,
		currentDialogueIndex.value,
	);
};

// ==================== 音频混音：BGM 淡入 + 语音闪避 ====================
const {
	bgmTargetVolume,
	fadeBgmTo,
	playBackgroundMusic,
	stopBackgroundMusic,
	setBgmDucking,
	onVoicePlay,
	onVoiceEnded,
	applyVolumes,
	replayVoice,
} = usePlayerAudio({
	backgroundMusic,
	dialogueVoice,
	playerSettings,
	getCurrentScene: () => currentScene.value,
})

// ==================== 阅读设置 ====================
// 逐字显示屏、补全与自动前进排期由 usePlayerTypewriter 托管
const fullText = () => localizedText(currentDialogue.value) || '';

const {
	displayedText,
	isTyping,
	clearTyping,
	finishTyping,
	typeOut,
	scheduleAutoAdvance,
	scheduleAutoAdvanceAfter,
	clearAutoTimer,
	disposeTypewriter,
} = usePlayerTypewriter({
	getFullText: () => fullText(),
	getSpeed: () => Number(playerSettings.value.textSpeed),
	canAutoAdvance: () => (
		!!autoPlay.value
		&& isPlaying.value
		&& !isTyping.value
		&& !isWaiting.value
		&& !currentChoices.value.length
	),
	getAutoDelay: () => Number(playerSettings.value.autoDelay),
	onAdvance: () => nextDialogue(),
});

// ==================== 已读记录 ====================
const {
	readSet,
	loadReads,
	hasRead,
	markCurrentRead,
	shouldSkipCurrent,
	allowSkip,
	resetSkipGuard,
	markSkipRestoredLine,
	consumeSkipRestoredLine,
	disposeReads,
} = usePlayerReads({
	projectId: () => Number(props.projectId),
	getCurrentDialogue: () => currentDialogue.value,
	hasChoices: () => currentChoices.value.length > 0,
	skipReadEnabled: () => !!playerSettings.value.skipRead,
});

// 调试探针（仅开发环境，便于无头浏览器排查）
if (import.meta.env.DEV && typeof window !== 'undefined') {
	window.__aigcPlayerDebug = () => ({
		readCount: readSet.value.size,
		readIds: [...readSet.value],
		skipRead: playerSettings.value.skipRead,
		currentId: currentDialogue.value?.content_id,
		shouldSkip: shouldSkipCurrent(),
		isTyping: isTyping.value,
		endingsCount: endings.value.length,
		endingVisible: endingDialogVisible.value,
		triggered: [...triggeredEndings.value],
		variables: variableValues.value,
		coverage: {
			...coverageStats.value,
			visitedNodes: [...visitedContents.value],
			visitedEdges: [...visitedEdges.value],
		},
		perform: {
			currentUserId,
			projectOwnerId: projectOwnerId.value,
			canPerform: canPerform.value,
			performMode: performMode.value,
			queryEdit: route.query.edit,
		},
	});
}

// ==================== 项目变量 ====================
// 变量定义/取值/持久化/行为变量在 usePlayerVariables 内，
// 条件求值在 usePlayerConditions 内，效果结算与重置在 usePlayerVariableEffects 内；
// 这里只剩三个部件的装配与 lastEffectKey 这一处共享状态。

// 条件求值（变量比较 / 条件组 / 剧情锁 / 台词级条件）由 usePlayerConditions 自管
const {
	evalSingleCondition,
	evalCondition,
	scenePlayable,
	nodePlayable,
	firstPlayableNodeIndex,
	sceneHasPlayableDialogues,
	conditionText,
} = usePlayerConditions({ projectVariables, variableValues, sceneLocks, allDialogues });

// 分支选项的展示模型：文案 / 图片地址 / 锁定提示在这里一次性算好，
// PlayerDialogueBox 只负责按数组渲染，不再回调任何业务函数。
const dialogueChoiceViews = computed(() => currentChoices.value.map((choice) => ({
	id: choice.path_id,
	label: localizedChoice(choice) || t('choice.continue'),
	imageUrl: choice.image_url ? BASE_URL + choice.image_url : '',
	locked: !!choice.locked,
	lockText: choice.locked ? t('choice.locked', { cond: conditionText(choice.conditions) }) : '',
	title: choice.locked ? t('choice.conditionNotMet', { cond: conditionText(choice.conditions) }) : '',
})));


// 按台词应用变量效果 / 周目重置由 usePlayerVariableEffects 编排；
// lastEffectKey 仍留在视图，作为「同节点只结算一次」的共享标记（存档也要读它）。
const { applyEffectsForCurrent, resetVariables } = usePlayerVariableEffects({
	getCurrentDialogue: () => currentDialogue.value,
	getSceneIndex: () => currentSceneIndex.value,
	getDialogueIndex: () => currentDialogueIndex.value,
	getLastEffectKey: () => lastEffectKey.value,
	setLastEffectKey: (value) => { lastEffectKey.value = value },
	getProjectVariables: () => projectVariables.value,
	getVariableEffects: () => variableEffects.value,
	getVariableValues: () => variableValues.value,
	setVariableValues: (value) => { variableValues.value = value },
	clampVariable: (v, value) => clampVariable(v, value),
	initialValueOf: (v) => initialValueOf(v),
	syncProjectMeta: () => syncProjectMeta(),
	pushVariableNotices: (items) => pushVariableNotices(items),
	pushVariableHistory: (label, before, after, reason) => pushVariableHistory(label, before, after, reason),
	checkDebugBreakpoint: () => checkDebugBreakpoint(),
	scheduleAchievementCheck: () => scheduleAchievementCheck(),
});

/* ===== 调试器：变量热改 / 任意节点跳转 ===== */
const setDebugVar = (v, raw) => {
	const next = Number(raw);
	if (!Number.isFinite(next)) return;
	const before = Number(variableValues.value[v.name] ?? v.initial_value);
	const after = clampVariable(v, next);
	variableValues.value = { ...variableValues.value, [v.name]: after };
	if (before !== after) pushVariableHistory(v.label || v.name, before, after, '手动调试');
	if (v.persist) syncProjectMeta();
	checkDebugBreakpoint();
};

const debugJump = () => {
	const id = Number(debugJumpId.value);
	if (!id) return;
	for (let si = 0; si < scenes.value.length; si++) {
		const list = allDialogues.value[scenes.value[si].scene_id] || [];
		const di = list.findIndex(d => Number(d.content_id) === id);
		if (di >= 0) {
			clearWait();
			clearAutoTimer();
			// 调试跳转是瞬移，清空旧的「上一句」快照
			clearLineSnapshots();
			currentSceneIndex.value = si;
			currentDialogueIndex.value = di;
			showDialogueBox.value = true;
			nextTick(() => startTyping());
			return;
		}
	}
	ElMessage.warning(t('toast.nodeMissing', { id }));
};

// 覆盖率列表点节点：直接跳过去，顺便把它标记为已走
const debugJumpTo = (contentId) => {
	debugJumpId.value = String(contentId);
	debugJump();
};

// ==================== 成就 ====================
const {
	achievements,
	unlockedAchievementCount,
	loadPlayerAchievements,
	scheduleAchievementCheck,
	resetAchievementState,
} = usePlayerAchievements({
	projectId: () => Number(props.projectId),
	getDebugMode: () => debugMode.value,
	getVariables: () => variableValues.value,
	getEndings: () => [...triggeredEndings.value],
	t,
})

// 玩家侧更新日志（公开作品才会返回）
const loadPublicReleases = async () => {
	try {
		publicReleases.value = await listPublicReleases(Number(props.projectId));
	} catch (e) {
		publicReleases.value = [];
	}
};

// 一句台词开始播放时的固定顺序（结算变量 → 回退标记 → 结局 → 清定时器 → 跳过已读
// → 记录已读 → 选择计时 → 逐字显示）以及设置变更后的重播监听，全部由
// usePlayerLineLifecycle 编排；这里只提供各步骤的实现。
const { startTyping } = usePlayerLineLifecycle({
	currentDialogue,
	sceneIndex: currentSceneIndex,
	dialogueIndex: currentDialogueIndex,
	settings: playerSettings,
	isPlaying,
	applyEffectsForCurrent: () => applyEffectsForCurrent(),
	checkEndingForCurrent: () => checkEndingForCurrent(),
	consumeSkipRestoredLine: () => consumeSkipRestoredLine(),
	shouldSkipCurrent: () => shouldSkipCurrent(),
	allowSkip: () => allowSkip(),
	resetSkipGuard: () => resetSkipGuard(),
	markCurrentRead: () => markCurrentRead(),
	markHesitationStart: (contentId) => markHesitationStart(contentId),
	clearTyping: () => clearTyping(),
	clearAutoTimer: () => clearAutoTimer(),
	typeOut: () => typeOut(),
	finishTyping: () => finishTyping(),
	scheduleAutoAdvance: () => scheduleAutoAdvance(),
	nextDialogue: () => nextDialogue(),
	setBgmDucking: (on) => setBgmDucking(on),
	applyVolumes: () => applyVolumes(),
});

// ==================== 开局与重开 ====================
// 起点修正（起始场景/台词被剧情锁或条件挡住时向后找）、完整重置、二周目推进、
// 玩家主动重开四个入口由 usePlayerPlaySession 编排；这里只提供状态引用与各步骤实现。
const { startPreview, resetGame, startNextPlaythrough, restartGame } = usePlayerPlaySession({
	scenes,
	allDialogues,
	sceneIndex: currentSceneIndex,
	dialogueIndex: currentDialogueIndex,
	history: historyDialogues,
	isPlaying,
	playthrough,
	playthroughKey: () => playthroughKey(),
	scenePlayable: (sceneId) => scenePlayable(sceneId),
	sceneHasPlayableDialogues: (sceneId) => sceneHasPlayableDialogues(sceneId),
	nodePlayable: (node) => nodePlayable(node),
	firstPlayableNodeIndex: (sceneId, from) => firstPlayableNodeIndex(sceneId, from),
	playBackgroundMusic: () => playBackgroundMusic(),
	stopBackgroundMusic: () => stopBackgroundMusic(),
	clearAutoTimer: () => clearAutoTimer(),
	startTyping: () => startTyping(),
	resetEndings: () => resetEndings(),
	resetAchievementState: () => resetAchievementState(),
	resetVariables: () => resetVariables(),
	resetTelemetryTracking: () => resetTelemetryTracking(),
	clearLineSnapshots: () => clearLineSnapshots(),
	clearVariableNotices: () => clearVariableNotices(),
	syncProjectMeta: (immediate) => syncProjectMeta(immediate),
	setLastEffectKey: (value) => { lastEffectKey.value = value },
	t: (key, params) => t(key, params),
});

// 自动存档：每次推进对话后延迟写入 slot 0（不打扰玩家）
watch([currentSceneIndex, currentDialogueIndex], () => {
	if (isRestoring.value || loading.value || error.value) return;
	if (autoSaveTimer) clearTimeout(autoSaveTimer);
	autoSaveTimer = setTimeout(() => {
		autoSaveTimer = null;
		saveToSlot(0, true);
	}, 1500);
});

// ==================== 演出时序 ====================
// 画面效果与「停顿」的定时器由 usePlayerStageFx 自管
const {
	activeEffect,
	isWaiting,
	triggerEffect,
	clearEffect,
	clearWait,
	scheduleWait,
	disposeStageFx,
} = usePlayerStageFx({
	scheduleAutoAdvance: () => scheduleAutoAdvance(),
});

/* ===== 节点演出指令（任意图层 / 背景切换 / 音效）===== */
const {
	stageAvatars,
	bgFromDirective,
	bgTransition,
	bgDuration,
	fgFromDirective,
	directivesByContent,
	stageLayerVisible,
	stageLayers,
	hasStageAvatars,
	avatarLayersOf,
	defaultAvatarLayersOf,
	loadDirectiveData,
	resetStage,
	clearStageTransitions,
	bgShown,
	bgFading,
	bgBlackout,
	fgShown,
	fgFading,
} = usePlayerStage({
	getProjectId: () => Number(props.projectId),
	getCurrentScene: () => currentScene.value,
	getCharacters: () => characters.value,
	getDefaultBackground: () => defaultBackground,
	onReset: () => {
		clearWait();
		clearEffect();
	},
});

// ==================== 演出指令应用 ====================
// 指令解析以及舞台 / 音频副作用由 usePlayerDirectives 托管
const { applyDirectives } = usePlayerDirectives({
	getDirectivesByContent: () => directivesByContent.value,
	stageAvatars,
	stageLayerVisible,
	fgFromDirective,
	bgFromDirective,
	bgTransition,
	bgDuration,
	getBackgroundMusic: () => backgroundMusic.value,
	fadeBgmTo: (volume, duration) => fadeBgmTo(volume, duration),
	getBgmTargetVolume: () => bgmTargetVolume(),
	avatarLayersOf: (avatarId) => avatarLayersOf(avatarId),
	defaultAvatarLayersOf: (characterId) => defaultAvatarLayersOf(characterId),
	triggerEffect: (payload) => triggerEffect(payload),
	scheduleWait: (ms) => scheduleWait(ms),
});

// 应用到新对话时，若还在加载或指令尚未拉回，等完成后自动重试
watch(
	() => [loading.value, error.value, currentDialogue.value?.content_id, directivesByContent.value],
	() => {
		if (loading.value || error.value) return;
		resetStage();
		applyDirectives(currentDialogue.value);
	},
	{ immediate: true }
);

loadSettings();
saveSettings();

// ==================== 剧情推进 ====================
// 节点寻址、下一句 / 下一场景与选项分支跳转由 usePlayerFlow 托管
const { jumpToDialogue, nextDialogue, selectBranch, nextScene } = usePlayerFlow({
	getScenes: () => scenes.value,
	getAllDialogues: () => allDialogues.value,
	getBranches: () => branches.value,
	getCurrentDialogue: () => currentDialogue.value,
	getCurrentScene: () => currentScene.value,
	getCurrentSceneDialogues: () => currentSceneDialogues.value,
	getHistory: () => historyDialogues.value,
	hasChoices: () => currentChoices.value.length > 0,
	getSceneIndex: () => currentSceneIndex.value,
	setSceneIndex: (value) => { currentSceneIndex.value = value },
	getDialogueIndex: () => currentDialogueIndex.value,
	setDialogueIndex: (value) => { currentDialogueIndex.value = value },
	setShowDialogueBox: (value) => { showDialogueBox.value = value },
	scenePlayable: (sceneId) => scenePlayable(sceneId),
	nodePlayable: (node) => nodePlayable(node),
	sceneHasPlayableDialogues: (sceneId) => sceneHasPlayableDialogues(sceneId),
	firstPlayableNodeIndex: (sceneId) => firstPlayableNodeIndex(sceneId),
	evalCondition: (conditions) => evalCondition(conditions),
	conditionText: (conditions) => conditionText(conditions),
	isDebugMode: () => debugMode.value,
	isPlaying: () => isPlaying.value,
	isTyping: () => isTyping.value,
	isWaiting: () => isWaiting.value,
	getAutoPlay: () => autoPlay.value,
	setIsPlaying: (value) => { isPlaying.value = value },
	finishTyping: () => finishTyping(),
	playBackgroundMusic: () => playBackgroundMusic(),
	stopBackgroundMusic: () => stopBackgroundMusic(),
	scheduleAutoAdvance: () => scheduleAutoAdvance(),
	scheduleAutoAdvanceAfter: (ms) => scheduleAutoAdvanceAfter(ms),
	clearAutoTimer: () => clearAutoTimer(),
	clearWait: () => clearWait(),
	commitHesitation: () => commitHesitation(),
	pushLineSnapshot: (snapshot) => pushLineSnapshot(snapshot),
	captureLineSnapshot: () => captureLineSnapshot(),
	markVisitedEdge: (sourceId, targetId) => markVisitedEdge(sourceId, targetId),
	logPlayEvent: (type, payload) => logPlayEvent(type, payload),
	scheduleAchievementCheck: (force) => scheduleAchievementCheck(force),
	goHome: () => { proxy.$router.push('/home'); },
	t: (key, params) => t(key, params),
});

// 自动前进对话：统一交给 scheduleAutoAdvance（受设置里的间隔控制）
const autoAdvanceDialogue = () => {
	scheduleAutoAdvance();
};

// 快进至下一场景
const skipToNextScene = () => {
	pushLineSnapshot();
	nextScene();
};

// 切换对话框显示/隐藏
const toggleDialogueBox = () => {
	showDialogueBox.value = !showDialogueBox.value;
};

// 切换历史对话显示/隐藏
const toggleHistoryDialogue = () => {
	if (!showHistoryDialogue.value) bumpBehaviorReview();
	showHistoryDialogue.value = !showHistoryDialogue.value;
};

// 切换自动播放状态
const toggleAutoPlay = () => {
	autoPlay.value = !autoPlay.value;
	if (autoPlay.value) {
		autoAdvanceDialogue();
	}
};

// ==================== 进度存档（本地兜底 + 云端槽位 + 退出） ====================
// 存档采集、槽位编排与退出流程由 usePlayerProgress 托管
const {
	saves,
	saveDialogVisible,
	isRestoring,
	loadProgress,
	exitGame,
	openSaveDialog,
	saveToSlot,
	loadFromSlot,
	deleteSlot,
} = usePlayerProgress({
	projectId: () => Number(props.projectId),
	getSceneIndex: () => currentSceneIndex.value,
	setSceneIndex: (value) => { currentSceneIndex.value = value },
	getDialogueIndex: () => currentDialogueIndex.value,
	setDialogueIndex: (value) => { currentDialogueIndex.value = value },
	getHistory: () => historyDialogues.value,
	setHistory: (value) => { historyDialogues.value = value },
	getVariables: () => variableValues.value,
	setVariables: (value) => { variableValues.value = value },
	getLastEffectKey: () => lastEffectKey.value,
	setLastEffectKey: (value) => { lastEffectKey.value = value },
	getEndings: () => triggeredEndings.value,
	setEndings: (value) => { triggeredEndings.value = value },
	getPlaythrough: () => playthrough.value,
	setPlaythrough: (value) => { playthrough.value = value },
	playthroughKey: () => playthroughKey(),
	getScene: () => currentScene.value,
	getDialogue: () => currentDialogue.value,
	getCoverUrl: () => projectCoverUrl.value,
	sceneTitleOf: (scene) => localizedSceneTitle(scene),
	textOf: (dialogue) => localizedText(dialogue),
	initVariableValues: () => initVariableValues(),
	clearLineSnapshots: () => clearLineSnapshots(),
	syncProjectMeta: (immediate) => syncProjectMeta(immediate),
	startTyping: () => startTyping(),
	applyVolumes: () => applyVolumes(),
	stopBackgroundMusic: () => stopBackgroundMusic(),
	exitToHome: () => { proxy?.$router?.push('/home') },
	t: (key, params) => t(key, params),
});

// ==================== 演出模式（作者预览热更新） ====================
// 表单快照 / 脏字段比对 / 保存编排由 usePlayerPerform 自管
const {
	performMode,
	performSaving,
	performText,
	performAvatarId,
	performBackground,
	performMusic,
	performStatus,
	togglePerformMode,
	savePerformEdit,
} = usePlayerPerform({
	canPerform: () => canPerform.value,
	getDialogue: () => currentDialogue.value,
	getScene: () => currentScene.value,
	getDialogues: () => allDialogues.value,
	setDialogues: (value) => { allDialogues.value = value },
	getHistory: () => historyDialogues.value,
	setHistory: (value) => { historyDialogues.value = value },
	getDirectives: () => directivesByContent.value,
	getScenes: () => scenes.value,
	setScenes: (value) => { scenes.value = value },
	getBackgroundMusic: () => backgroundMusic.value,
	isPlaying: () => isPlaying.value,
	fadeBgmTo: (volume, duration) => fadeBgmTo(volume, duration),
	bgmTargetVolume: () => bgmTargetVolume(),
	markSkipRestoredLine: () => markSkipRestoredLine(),
	startTyping: () => startTyping(),
	saveDialogues: (payload) => saveDialogues(payload),
	updateScene: (sceneId, patch) => updateScene(sceneId, patch),
	projectId: () => Number(props.projectId),
});

// 舞台上滑（子组件已判定方向）：不在自动播放状态时唤出历史对话
const onWheelUp = () => {
	if (!autoPlay.value) {
		toggleHistoryDialogue();
	}
};

// 选项点击：按 path_id 找回原始分支对象，再交给流程层处理锁定/跳转
const handleChoiceSelect = (pathId) => {
	const branch = currentChoices.value.find((choice) => choice.path_id === pathId);
	if (branch) selectBranch(branch);
};

// 获取角色名称（按当前阅读语言显示译名）
const getCharacterName = (characterId) => {
	const char = characters.value.find(c => c.character_id === characterId);
	return char ? localizedCharacterName(char) : '';
};

// ==================== 键盘快捷键 ====================
// 按键判定与面板关闭优先级由 usePlayerKeyboard 托管
const ESC_PANELS = [
	settingsVisible,
	galleryDialogVisible,
	saveDialogVisible,
	statusDialogVisible,
	chaptersVisible,
	showHistoryDialogue,
	debugPanelVisible,
];
const ACTIVE_PANELS = [...ESC_PANELS, endingDialogVisible, changelogVisible];
const { isPanelOpen, handleKeydown } = usePlayerKeyboard({
	getEscPanels: () => ESC_PANELS,
	getActivePanels: () => ACTIVE_PANELS,
	rollbackOneLine: () => rollbackOneLine(),
	nextDialogue: () => nextDialogue(),
	toggleHistoryDialogue: () => toggleHistoryDialogue(),
	toggleAutoPlay: () => toggleAutoPlay(),
	toggleSkipRead: () => {
		playerSettings.value.skipRead = !playerSettings.value.skipRead;
		return playerSettings.value.skipRead;
	},
	t: (key) => t(key),
});

// ==================== 手柄操作（标准按键映射） ====================
// A(0) 继续对话 / B(1) 回想 / X(2) 自动播放；轮询与边沿判定由 usePlayerGamepad 自管
const { startGamepad, stopGamepad } = usePlayerGamepad({
	isPanelOpen: () => isPanelOpen(),
	nextDialogue: () => nextDialogue(),
	toggleHistoryDialogue: () => toggleHistoryDialogue(),
	toggleAutoPlay: () => toggleAutoPlay(),
});

// 监听场景变化，更新背景音乐
watch(currentScene, (newScene, oldScene) => {
	if (newScene.scene_id !== oldScene.scene_id && isPlaying.value) {
		nextTick(() => {
			playBackgroundMusic();
		});
	}
});

// 组件挂载时获取数据并设置事件监听
onMounted(() => {
	fetchProjectData();
	loadDirectiveData();
	
	// 监听用户交互，一旦有交互就尝试播放音乐（解决浏览器自动播放限制）
	document.addEventListener('click', playBackgroundMusic, { once: true });
	document.addEventListener('keydown', playBackgroundMusic, { once: true });
	document.addEventListener('touchstart', playBackgroundMusic, { once: true, passive: true });
	
	// 监听键盘事件
	document.addEventListener('keydown', handleKeydown);

	// 手柄轮询（无手柄时不做任何操作）
	startGamepad();

	// 移动端方向提示
	bindOrientation();
});

// 组件卸载时清理定时器、音频与全局事件，避免内存泄漏与操作已销毁组件
onUnmounted(() => {
	disposeTypewriter();
	clearVariableNotices();
	disposeReads();
	if (autoSaveTimer) {
		clearTimeout(autoSaveTimer);
		autoSaveTimer = null;
	}
	disposeStageFx();
	clearStageTransitions();
	stopBackgroundMusic();
	stopGamepad();
	document.removeEventListener('keydown', handleKeydown);
	document.removeEventListener('click', playBackgroundMusic);
	document.removeEventListener('keydown', playBackgroundMusic);
	document.removeEventListener('touchstart', playBackgroundMusic);
	unbindOrientation();
});

const backToHome = () => {
	clearAutoTimer();
	proxy?.$router?.push('/home');
};
</script>

<style scoped src="./player/playerShell.css"></style>
<style scoped src="./player/playerResponsive.css"></style>