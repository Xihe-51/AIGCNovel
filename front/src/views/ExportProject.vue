<template>
	<div class="export-project-container" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
		<!-- 阅读设置入口 -->
		<button v-if="!loading && !error" class="player-settings-btn" @click="openSettings" title="阅读设置">
			<el-icon><Setting /></el-icon>
		</button>
		<button v-if="!loading && !error && projectVariables.length" class="player-status-btn"
				@click="statusDialogVisible = true" title="当前状态">
			<el-icon><DataLine /></el-icon>
		</button>
		<button v-if="!loading && !error" class="player-gallery-btn"
				@click="openGallery" title="CG 鉴赏">
			<el-icon><Picture /></el-icon>
		</button>

		<!-- 竖屏提示 -->
		<div v-if="showRotateHint && !loading && !error" class="rotate-hint">
			<span>建议横屏体验</span>
			<button @click.stop="dismissRotateHint">知道了</button>
		</div>
		<!-- 预览区域 -->
		<div class="preview-panel">
			<!-- 背景音乐播放器 -->
			<audio 
				ref="backgroundMusic"
				:src="currentScene.music_url ? BASE_URL + currentScene.music_url : ''" 
				loop
				class="hidden-audio"
			>你的浏览器不支持音频播放</audio>
			
			<!-- 预览容器 -->
			<div class="preview-container" @wheel.prevent="handleWheel">
				<!-- 背景图（切图时先淡出、换图后再淡入） -->
				<div class="scene-background" @click="onDialogueClick">
					<img 
						:src="bgShown" 
						alt="场景背景" 
						class="background-image"
						:class="{ 'bg-fading': bgFading }"
						decoding="async"
					/>
				</div>
				
				<!-- 演出指令控制的立绘（左 / 中 / 右三槽位） -->
				<div v-if="hasStageAvatars" class="stage-layer">
					<div
						v-for="pos in stagePositions"
						:key="pos"
						v-show="stageAvatars[pos]"
						:class="['stage-avatar', 'pos-' + pos]"
					>
						<img :src="stageAvatars[pos]" alt="" decoding="async" />
					</div>
				</div>

				<!-- 回退：没有演出指令时，显示当前对话的立绘 -->
				<div v-else-if="!loading && !error && currentDialogue?.character_id" class="character-stand">
					<img 
						:src="getAvatarUrl(currentDialogue.avatar_id)" 
						alt="角色立绘" 
						class="character-image"
						loading="lazy"
						decoding="async"
					/>
				</div>
				
				<!-- 演出「停顿」指令生效时的提示 -->
				<div v-if="isWaiting && !loading && !error" class="wait-hint">
					<span></span><span></span><span></span>
				</div>

				<!-- 加载状态 -->
				<div v-if="loading" class="loading-indicator">
					<el-loading-spinner size="50" />
					<p>加载项目中...</p>
				</div>
				
				<!-- 错误信息 -->
				<div v-if="error" class="error-message">
					<el-icon color="#F56C6C" size="24"><WarningFilled /></el-icon>
					<p>错误: {{ error }}</p>
					<el-button type="primary" size="small" @click="backToHome">返回项目列表</el-button>
				</div>
				
				<!-- 历史对话弹窗 -->
				<div 
					v-if="showHistoryDialogue" 
					class="history-dialogue-container"
					@click="toggleHistoryDialogue"
				>
					<div class="history-dialogue-content">
						<div class="history-header">
							<h3>历史对话</h3>
							<el-icon @click.stop="toggleHistoryDialogue" class="close-btn">
								<CloseBold />
							</el-icon>
						</div>
						<div class="history-scroll-area">
							<div 
								v-for="(dialogue, index) in filteredHistoryDialogues" 
								:key="index" 
								class="history-item"
							>
								<div v-if="dialogue.scene_title" class="history-scene">{{ dialogue.scene_title }}</div>
								<span class="history-character">{{ getCharacterName(dialogue.character_id) }}</span>
								<span class="history-text">{{ dialogue.content_text }}</span>
								<div v-if="dialogue.chosen" class="history-chosen">选择：{{ dialogue.chosen }}</div>
							</div>
						</div>
					</div>
				</div>
				
				<!-- 对话显示区域（位于最上层） -->
				<div v-if="!loading && !error && showDialogueBox" class="dialogue-display">
					<!-- 当前对话 -->
					<div 
						v-if="currentDialogueIndex < currentSceneDialogues.length"
						:class="['dialogue-box', `box-${currentDialogue?.content_type}`]"
						@click="onDialogueClick"
					>
						<span class="character-name">{{ getCharacterName(currentDialogue.character_id) }}</span>
						<div class="dialogue-text">
							{{ displayedText }}
						</div>
						<!-- 语音播放 -->
						<div v-if="currentDialogue?.voice_url" class="dialogue-audio">
							<audio :src="BASE_URL + currentDialogue.voice_url" controls autoplay>你的浏览器不支持音频播放
						</audio>
						</div>

						<!-- 分支选项：选择后跳到目标节点，而不是线性继续 -->
						<div v-if="currentChoices.length" class="choice-panel" @click.stop>
							<button
								v-for="choice in currentChoices"
								:key="choice.path_id"
								class="choice-option"
								@click.stop="selectBranch(choice)"
							>
								{{ choice.choice_text || '继续' }}
							</button>
						</div>
						
						<!-- 功能按钮区 -->
						<div class="function-buttons">
							<el-tooltip content="查看历史对话" placement="top">
								<el-icon @click.stop="toggleHistoryDialogue" class="func-btn">
									<Search />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="隐藏对话框" placement="top">
								<el-icon @click.stop="toggleDialogueBox" class="func-btn">
									<Hide />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="快进" placement="top">
								<el-icon @click.stop="skipToNextScene" class="func-btn">
									<DArrowRight />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="autoPlay ? '关闭自动播放' : '开启自动播放'" placement="top">
								<el-icon @click.stop="toggleAutoPlay" class="func-btn">
									<VideoPlay />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="重新开始" placement="top">
								<el-icon @click.stop="restartGame" class="func-btn">
									<SwitchButton />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="存档当前进度" placement="top">
								<el-icon @click.stop="openSaveDialog" class="func-btn">
									<DocumentAdd />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="退出游戏" placement="top">
								<el-icon @click.stop="exitGame" class="func-btn">
									<CloseBold />
								</el-icon>
							</el-tooltip>
						</div>
					</div>
					
					<!-- 场景对话结束，自动进入下一场景 -->
					<div v-if="currentDialogueIndex >= currentSceneDialogues.length && currentSceneDialogues.length > 0" class="dialogue-end">
						<!-- 功能按钮区 -->
						<div class="function-buttons">
							<el-tooltip content="查看历史对话" placement="top">
								<el-icon @click.stop="toggleHistoryDialogue" class="func-btn">
									<Search />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="隐藏对话框" placement="top">
								<el-icon @click.stop="toggleDialogueBox" class="func-btn">
									<Hide />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="快进" placement="top">
								<el-icon @click.stop="skipToNextScene" class="func-btn">
									<DArrowRight />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="autoPlay ? '关闭自动播放' : '开启自动播放'" placement="top">
								<el-icon @click.stop="toggleAutoPlay" class="func-btn">
									<VideoPlay />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="重新开始" placement="top">
								<el-icon @click.stop="restartGame" class="func-btn">
									<SwitchButton />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="存档当前进度" placement="top">
								<el-icon @click.stop="openSaveDialog" class="func-btn">
									<DocumentAdd />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="退出游戏" placement="top">
								<el-icon @click.stop="exitGame" class="func-btn">
									<CloseBold />
								</el-icon>
							</el-tooltip>
						</div>
					</div>
					
					<!-- 场景无对话，自动进入下一场景 -->
					<div v-if="currentSceneDialogues.length === 0" class="no-dialogues-preview">
						<!-- 功能按钮区 -->
						<div class="function-buttons">
							<el-tooltip content="查看历史对话" placement="top">
								<el-icon @click.stop="toggleHistoryDialogue" class="func-btn">
									<Search />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="隐藏对话框" placement="top">
								<el-icon @click.stop="toggleDialogueBox" class="func-btn">
									<Hide />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="快进" placement="top">
								<el-icon @click.stop="skipToNextScene" class="func-btn">
									<DArrowRight />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="autoPlay ? '关闭自动播放' : '开启自动播放'" placement="top">
								<el-icon @click.stop="toggleAutoPlay" class="func-btn">
									<VideoPlay />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="重新开始" placement="top">
								<el-icon @click.stop="restartGame" class="func-btn">
									<SwitchButton />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="存档当前进度" placement="top">
								<el-icon @click.stop="openSaveDialog" class="func-btn">
									<DocumentAdd />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip content="退出游戏" placement="top">
								<el-icon @click.stop="exitGame" class="func-btn">
									<CloseBold />
								</el-icon>
							</el-tooltip>
						</div>
					</div>
				</div>
				
				<!-- 对话框隐藏时显示的显示按钮 -->
				<div v-if="!loading && !error && !showDialogueBox" class="show-dialogue-btn" @click="toggleDialogueBox">
					<el-tooltip content="显示对话框" placement="top">
						<el-icon size="30">
							<View />
						</el-icon>
					</el-tooltip>
				</div>
			</div>
		</div>

		<!-- 达成结局 -->
		<el-dialog v-model="endingDialogVisible" width="420px" class="ending-dialog"
				   :close-on-click-modal="false" :show-close="false">
			<div class="ending-content">
				<div class="ending-badge">ENDING</div>
				<h2>{{ currentEnding?.title }}</h2>
				<p>{{ currentEnding?.description || '恭喜达成这个结局。' }}</p>
			</div>
			<template #footer>
				<el-button @click="endingDialogVisible = false">继续阅读</el-button>
				<el-button @click="resetGame">重新开始</el-button>
				<el-button type="primary" @click="backToHome">返回项目</el-button>
			</template>
		</el-dialog>

		<!-- 当前状态 -->
		<el-dialog v-model="statusDialogVisible" title="当前状态" width="380px" class="status-dialog">
			<div v-for="v in projectVariables" :key="v.variable_id" class="status-row">
				<span class="status-label">{{ v.label }}</span>
				<span class="status-value">{{ variableValues[v.name] ?? v.initial_value }}</span>
			</div>
			<div v-if="!projectVariables.length" class="status-empty">项目还没有定义变量</div>
		</el-dialog>

		<!-- 存档 / 读档 -->
		<el-dialog v-model="saveDialogVisible" title="存档 / 读档" width="540px" class="save-dialog">
			<div v-for="s in slotDefs" :key="s.slot" class="save-slot">
				<div class="save-slot-info">
					<div class="save-slot-title">{{ s.label }}</div>
					<div class="save-slot-summary">{{ saveMap[s.slot]?.summary || '空存档位' }}</div>
					<div v-if="saveMap[s.slot]?.updated_at" class="save-slot-time">
						{{ formatSaveTime(saveMap[s.slot].updated_at) }}
					</div>
				</div>
				<div class="save-slot-actions">
					<el-button size="small" @click="saveToSlot(s.slot)">保存</el-button>
					<el-button size="small" :disabled="!saveMap[s.slot]" @click="loadFromSlot(s.slot)">读取</el-button>
					<el-button size="small" type="danger" :disabled="!saveMap[s.slot]" @click="deleteSlot(s.slot)">删除</el-button>
				</div>
			</div>
		</el-dialog>

		<!-- 阅读设置 -->
		<el-dialog v-model="settingsVisible" title="阅读设置" width="420px" class="player-settings-dialog">
			<div class="setting-row">
				<span class="setting-label">文字速度</span>
				<el-select v-model="playerSettings.textSpeed" size="small" style="width: 140px">
					<el-option label="瞬间显示" :value="0" />
					<el-option label="快" :value="1" />
					<el-option label="正常" :value="2" />
					<el-option label="慢" :value="3" />
				</el-select>
			</div>
			<div class="setting-row">
				<span class="setting-label">自动播放间隔</span>
				<el-slider v-model="playerSettings.autoDelay" :min="1" :max="6" :step="0.5" style="flex: 1" />
				<span class="setting-value">{{ playerSettings.autoDelay }}s</span>
			</div>
			<div class="setting-row">
				<span class="setting-label">背景音乐</span>
				<el-slider v-model="playerSettings.bgmVolume" :min="0" :max="100" style="flex: 1" />
				<span class="setting-value">{{ playerSettings.bgmVolume }}%</span>
			</div>
			<div class="setting-row">
				<span class="setting-label">语音音量</span>
				<el-slider v-model="playerSettings.voiceVolume" :min="0" :max="100" style="flex: 1" />
				<span class="setting-value">{{ playerSettings.voiceVolume }}%</span>
			</div>
			<div class="setting-row">
				<span class="setting-label">全屏</span>
				<el-switch v-model="playerSettings.fullscreen" @change="toggleFullscreen" />
			</div>
			<div class="setting-row">
				<span class="setting-label">跳过已读</span>
				<el-switch v-model="playerSettings.skipRead" />
			</div>
			<template #footer>
				<el-button @click="resetSettings">恢复默认</el-button>
				<el-button type="primary" @click="settingsVisible = false">完成</el-button>
			</template>
		</el-dialog>

		<!-- CG 鉴赏 -->
		<el-dialog v-model="galleryDialogVisible" width="680px" class="gallery-dialog">
			<template #header>
				<div class="gallery-header">
					<span>CG 鉴赏</span>
					<span class="gallery-count">已解锁 {{ galleryUnlocked }} / {{ galleryTotal }}</span>
				</div>
			</template>
			<div v-if="galleryItems.length" class="gallery-grid">
				<div v-for="cg in galleryItems" :key="cg.cg_id" class="gallery-item">
					<img v-if="cg.unlocked && cg.image_url" :src="BASE_URL + cg.image_url"
						 class="gallery-image" :alt="cg.title" loading="lazy" decoding="async" />
					<div v-else class="gallery-locked">未解锁</div>
					<div class="gallery-title">{{ cg.title }}</div>
					<div class="gallery-desc">
						{{ cg.unlocked ? (cg.description || '') :
							('解锁条件：达成结局「' + (cg.unlock_ending_title || '未知结局') + '」') }}
					</div>
				</div>
			</div>
			<div v-else class="gallery-empty">这部作品还没有登记 CG。</div>
		</el-dialog>
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
import {
	getDialoguesBySceneId,
	getCharactersByProjectId,
	getCharacterAvatars as getCharacterAvatarsApi,
} from '@/api/dialogue'
import {
	getScenes as getProjectScenes
} from '@/api/scenes'
import { listBranches } from '@/api/branch'
import { listSaves, getSave, putSave, deleteSave } from '@/api/save'
import { listReads, markReads } from '@/api/read'
import { listVariables, listEffects } from '@/api/variable'
import { listDirectives } from '@/api/directive'
import { listEndings, unlockEnding } from '@/api/ending'
import {
	BASE_URL
} from '@/utils/request'
import { 
  WarningFilled,
  View,
  Hide,
  DArrowRight,
  VideoPlay,
  DocumentAdd,
  CloseBold,
  SwitchButton,
  Search,  // 新增引入搜索图标
  Setting,
  DataLine,
  Picture
} from '@element-plus/icons-vue'
import { ElMessage, ElLoading, ElIcon, ElMessageBox } from 'element-plus'

// 获取路由实例
const { proxy } = getCurrentInstance();

// 定义接收的属性
const props = defineProps({
	projectId: {
		type: String,
		required: true
	}
})

// 定义emit事件
const emit = defineEmits(['close'])

// 状态管理
const scenes = ref([]); // 所有场景
const allDialogues = ref({}); // 按场景ID存储的所有对话 {sceneId: [dialogues]}
const characters = ref([]); // 所有角色
const loading = ref(true);
const error = ref('');
const isPlaying = ref(true); // 默认自动播放
const autoPlay = ref(false); // 始终自动播放
const defaultBackground = ''; // 默认背景图
const backgroundMusic = ref(null);
// 自动播放定时器（组件卸载时必须清理，否则会操作已销毁的组件）
let autoTimer = null;
const showDialogueBox = ref(true); // 控制对话框显示/隐藏
const showHistoryDialogue = ref(false); // 控制历史对话显示/隐藏
const historyDialogues = ref([]); // 存储历史对话记录
const branches = ref([]); // 剧情分支（branch_paths）

// 存档
const saveDialogVisible = ref(false);
const saves = ref([]);
const isRestoring = ref(false);
const slotDefs = [
	{ slot: 0, label: '自动存档' },
	{ slot: 1, label: '存档 1' },
	{ slot: 2, label: '存档 2' },
	{ slot: 3, label: '存档 3' },
];
const saveMap = computed(() => {
	const map = {};
	for (const s of saves.value) map[s.slot] = s;
	return map;
});
let autoSaveTimer = null;

// 已读记录（跳过已读 / 二周目）
const readSet = ref(new Set());
const pendingReads = new Set();
let readFlushTimer = null;
let skipGuard = 0;
const readStorageKey = () => `aigc:reads:${props.projectId}`;

// 移动端触控
const showRotateHint = ref(false);
const touchStart = { x: 0, y: 0, t: 0 };
let suppressClick = false;

// 项目变量（好感度/数值/开关）
const projectVariables = ref([]);
const variableEffects = ref([]);
const variableValues = ref({});
const statusDialogVisible = ref(false);
const lastEffectKey = ref('');

// 结局
const endings = ref([]);
const triggeredEndings = ref(new Set());
const endingDialogVisible = ref(false);
const currentEnding = ref(null);

// CG 鉴赏
const galleryDialogVisible = ref(false);
const galleryItems = ref([]);
const galleryTotal = ref(0);
const galleryUnlocked = ref(0);

const openGallery = async () => {
	galleryDialogVisible.value = true;
	try {
		const data = await getGallery(Number(props.projectId));
		galleryItems.value = data?.items || [];
		galleryTotal.value = data?.total || 0;
		galleryUnlocked.value = data?.unlocked_count || 0;
	} catch (e) {
		galleryItems.value = [];
		galleryTotal.value = 0;
		galleryUnlocked.value = 0;
		ElMessage.error(e?.response?.data?.message || '读取鉴赏数据失败');
	}
};

// 阅读设置（localStorage 持久化）
const SETTINGS_KEY = 'aigc:player:settings';
	const DEFAULT_SETTINGS = {
	textSpeed: 2,      // 0 瞬间 / 1 快 / 2 正常 / 3 慢
	autoDelay: 3,      // 自动播放间隔（秒）
	bgmVolume: 60,     // 0-100
	voiceVolume: 80,   // 0-100
	fullscreen: false,
	skipRead: false,   // 跳过已读
};
const playerSettings = ref({ ...DEFAULT_SETTINGS });
const settingsVisible = ref(false);
const displayedText = ref('');
const isTyping = ref(false);
let typingTimer = null;
let typeIndex = 0;

// 当前预览状态
const currentSceneIndex = ref(0);
const currentDialogueIndex = ref(0);

// 计算属性
const currentScene = computed(() => {
	return scenes.value[currentSceneIndex.value] || {};
});

const currentSceneDialogues = computed(() => {
	return allDialogues.value[currentScene.value.scene_id] || [];
});

const currentDialogue = computed(() => {
	return currentSceneDialogues.value[currentDialogueIndex.value];
});

// 当前「选择」节点的分支选项（按变量条件过滤）
const currentChoices = computed(() => {
	const d = currentDialogue.value;
	if (!d || d.content_type !== '选择') return [];
	return (branches.value || []).filter(b =>
		b.source_content_id === d.content_id && evalCondition(b.conditions)
	);
});

// 完整回想：显示全局历史（不再只过滤当前场景）
const filteredHistoryDialogues = computed(() => {
	return historyDialogues.value;
});

// 获取项目数据
const fetchProjectData = async () => {
	try {
		loading.value = true;
		const projectIdNum = Number(props.projectId);

		if (isNaN(projectIdNum)) {
			throw new Error('无效的项目ID');
		}

		// 尝试从本地存储加载进度
		loadProgress();

		// 获取项目下的所有场景（按顺序排列）
		const scenesData = await getProjectScenes(projectIdNum);
		scenes.value = scenesData.sort((a, b) => a.order_num - b.order_num);
		
		if (scenes.value.length === 0) {
			throw new Error('该项目下没有场景数据');
		}

		// 获取所有场景的对话
		for (const scene of scenes.value) {
			const dialoguesData = await getDialoguesBySceneId(scene.scene_id);
			// 为每个对话添加场景ID，方便后续过滤
			const dialoguesWithSceneId = dialoguesData.map(d => ({
				...d,
				scene_id: scene.scene_id
			}));
			allDialogues.value[scene.scene_id] = dialoguesWithSceneId.sort((a, b) => a.order_num - b.order_num);
		}

		// 剧情分支：播放器要按 branch_paths 跳转，而不是永远线性往下走
		try {
			branches.value = await listBranches(projectIdNum);
		} catch (e) {
			console.warn('读取剧情分支失败，按线性剧情播放:', e);
			branches.value = [];
		}

		// 已读记录：跳过已读功能依赖它
		await loadReads();

		// 项目变量与节点数值变化
		await loadVariableSystem();

		// 结局定义
		await loadEndings();
		
		// 获取角色列表及对应的头像
		const chars = await getCharactersByProjectId(projectIdNum);
		
		// 为每个角色查询并关联自己的头像
		const charactersWithAvatars = await Promise.all(
			chars.map(async (char) => {
				const avatars = await getCharacterAvatarsApi(char.character_id);
				return {
					...char,
					avatars: avatars || []
				};
			})
		);
		
		characters.value = charactersWithAvatars;

	} catch (err) {
		console.error('获取项目数据失败:', err);
		error.value = err.message || '获取数据失败，请稍后重试';
		ElMessage.error(error.value);
	} finally {
		loading.value = false;
		// 数据加载完成后自动开始播放
		if (!error.value) {
			startPreview();
			// 初始化历史对话
			initHistoryDialogues();
		}
	}
}

// 初始化历史对话（根据当前进度）
const initHistoryDialogues = () => {
	historyDialogues.value = [];
	
	// 添加之前场景的所有对话
	for (let i = 0; i < currentSceneIndex.value; i++) {
		const sceneId = scenes.value[i].scene_id;
		const sceneTitle = scenes.value[i].title || '';
		if (allDialogues.value[sceneId]) {
			historyDialogues.value.push(
				...allDialogues.value[sceneId].map(d => ({ ...d, scene_title: sceneTitle }))
			);
		}
	}
	
	// 添加当前场景的历史对话（不包含当前对话）
	if (currentScene.value.scene_id && allDialogues.value[currentScene.value.scene_id]) {
		historyDialogues.value.push(
			...allDialogues.value[currentScene.value.scene_id]
				.slice(0, currentDialogueIndex.value)
				.map(d => ({ ...d, scene_title: currentScene.value.title || '' }))
		);
	}
};

// 开始预览
const startPreview = () => {
	isPlaying.value = true;
	playBackgroundMusic();
	startTyping();
};

// 播放背景音乐
const playBackgroundMusic = () => {
	if (backgroundMusic.value && currentScene.value.music_url) {
		backgroundMusic.value.volume = playerSettings.value.bgmVolume / 100;
		backgroundMusic.value.play().catch(e => {
			console.log('背景音乐自动播放失败，需要用户交互后才能播放:', e);
		});
	}
};

// 停止背景音乐
const stopBackgroundMusic = () => {
	if (backgroundMusic.value) {
		backgroundMusic.value.pause();
		backgroundMusic.value.currentTime = 0;
	}
};

// ==================== 阅读设置 ====================
const loadSettings = () => {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (raw) {
			playerSettings.value = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
		}
		// 全屏状态以浏览器实际状态为准（刷新后不会自动全屏）
		playerSettings.value.fullscreen = !!document.fullscreenElement;
	} catch (e) {
		console.warn('读取阅读设置失败，使用默认值:', e);
	}
};

const saveSettings = () => {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(playerSettings.value));
	} catch (e) {
		console.warn('保存阅读设置失败:', e);
	}
};

const applyVolumes = () => {
	if (backgroundMusic.value) {
		backgroundMusic.value.volume = playerSettings.value.bgmVolume / 100;
	}
	document.querySelectorAll('.dialogue-display audio').forEach(audio => {
		audio.volume = playerSettings.value.voiceVolume / 100;
	});
};

const openSettings = () => {
	settingsVisible.value = true;
};

const resetSettings = () => {
	playerSettings.value = { ...DEFAULT_SETTINGS };
	saveSettings();
	applyVolumes();
	startTyping();
};

const toggleFullscreen = async (val) => {
	try {
		if (val && !document.fullscreenElement) {
			await document.documentElement.requestFullscreen();
		} else if (!val && document.fullscreenElement) {
			await document.exitFullscreen();
		}
	} catch (e) {
		// 浏览器不允许（或 headless 不支持）时回滚开关状态
		playerSettings.value.fullscreen = !!document.fullscreenElement;
		console.warn('全屏切换失败:', e);
	}
};

// 逐字显示
const fullText = () => judge(currentDialogue.value?.content_text) || '';

const clearTyping = () => {
	if (typingTimer) {
		clearInterval(typingTimer);
		typingTimer = null;
	}
};

const scheduleAutoAdvance = () => {
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}
	if (!autoPlay.value || !isPlaying.value || isTyping.value || isWaiting.value || currentChoices.value.length) return;
	autoTimer = setTimeout(() => {
		autoTimer = null;
		nextDialogue();
	}, Math.max(500, Number(playerSettings.value.autoDelay) * 1000));
};

const finishTyping = () => {
	clearTyping();
	displayedText.value = fullText();
	isTyping.value = false;
	scheduleAutoAdvance();
};

// ==================== 已读记录 ====================
const loadReads = async () => {
	let local = [];
	try {
		local = JSON.parse(localStorage.getItem(readStorageKey()) || '[]');
	} catch (e) {
		local = [];
	}
	let cloud = [];
	try {
		cloud = await listReads(Number(props.projectId));
	} catch (e) {
		console.warn('读取云端已读记录失败，使用本地记录:', e);
	}
	readSet.value = new Set([...(cloud || []), ...(local || [])]);
};

const flushReads = async () => {
	const ids = [...pendingReads];
	pendingReads.clear();
	if (!ids.length) return;
	try {
		await markReads(Number(props.projectId), ids);
	} catch (e) {
		// 云端失败写本地，下次再合并
		try {
			const cur = new Set(JSON.parse(localStorage.getItem(readStorageKey()) || '[]'));
			ids.forEach(i => cur.add(i));
			localStorage.setItem(readStorageKey(), JSON.stringify([...cur]));
		} catch (_) { /* ignore */ }
	}
};

const markCurrentRead = () => {
	const id = currentDialogue.value?.content_id;
	if (!id || readSet.value.has(id)) return;
	readSet.value.add(id);
	pendingReads.add(id);
	if (readFlushTimer) clearTimeout(readFlushTimer);
	readFlushTimer = setTimeout(() => {
		readFlushTimer = null;
		flushReads();
	}, 1500);
};

const shouldSkipCurrent = () => {
	if (!playerSettings.value.skipRead) return false;
	const d = currentDialogue.value;
	if (!d?.content_id || currentChoices.value.length) return false;
	return readSet.value.has(d.content_id);
};

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
	});
}

// ==================== 移动端触控 ====================
const onTouchStart = (e) => {
	const t = e.touches && e.touches[0];
	if (!t) return;
	touchStart.x = t.clientX;
	touchStart.y = t.clientY;
	touchStart.t = Date.now();
};

const onTouchEnd = (e) => {
	const t = e.changedTouches && e.changedTouches[0];
	if (!t) return;
	const dx = t.clientX - touchStart.x;
	const dy = t.clientY - touchStart.y;

	// 只处理明显的纵向滑动，避免和横向误触冲突
	if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)) {
		suppressClick = true;
		setTimeout(() => { suppressClick = false; }, 350);
		if (dy < 0) {
			// 上滑：打开完整回想
			showHistoryDialogue.value = true;
		} else if (showHistoryDialogue.value) {
			// 下滑：先关回想
			showHistoryDialogue.value = false;
		} else {
			// 下滑：隐藏 UI，沉浸阅读
			showDialogueBox.value = false;
		}
	}
};

// 触控滑动后，浏览器还会补一个 click，这里吃掉它
const onDialogueClick = () => {
	if (suppressClick) {
		suppressClick = false;
		return;
	}
	nextDialogue();
};

const updateOrientation = () => {
	const portrait = window.matchMedia('(orientation: portrait)').matches && window.innerWidth < 900;
	showRotateHint.value = portrait && sessionStorage.getItem('aigc:rotateHintDismissed') !== '1';
};

const dismissRotateHint = () => {
	showRotateHint.value = false;
	try {
		sessionStorage.setItem('aigc:rotateHintDismissed', '1');
	} catch (e) { /* ignore */ }
};

// ==================== 项目变量 ====================
const initVariableValues = () => {
	const next = { ...variableValues.value };
	for (const v of projectVariables.value) {
		if (!(v.name in next)) next[v.name] = v.initial_value;
	}
	variableValues.value = next;
};

const loadVariableSystem = async () => {
	try {
		projectVariables.value = await listVariables(Number(props.projectId));
		variableEffects.value = await listEffects(Number(props.projectId));
		initVariableValues();
	} catch (e) {
		console.warn('读取项目变量失败:', e);
		projectVariables.value = [];
		variableEffects.value = [];
	}
};

const clampVariable = (v, value) => {
	let n = Number(value) || 0;
	if (v.min_value !== null && v.min_value !== undefined) n = Math.max(Number(v.min_value), n);
	if (v.max_value !== null && v.max_value !== undefined) n = Math.min(Number(v.max_value), n);
	return n;
};

const evalCondition = (cond) => {
	if (!cond || !cond.variable) return true;
	const v = projectVariables.value.find(x => x.name === cond.variable);
	if (!v) return false;
	const current = Number(variableValues.value[cond.variable] ?? v.initial_value);
	const target = Number(cond.value);
	switch (cond.op) {
		case '>': return current > target;
		case '>=': return current >= target;
		case '<': return current < target;
		case '<=': return current <= target;
		case '==': return current === target;
		case '!=': return current !== target;
		default: return false;
	}
};

const applyEffectsForCurrent = () => {
	const d = currentDialogue.value;
	if (!d?.content_id) return;
	const key = `${currentSceneIndex.value}:${currentDialogueIndex.value}:${d.content_id}`;
	if (key === lastEffectKey.value) return;
	lastEffectKey.value = key;

	const list = variableEffects.value.filter(e => e.content_id === d.content_id);
	if (!list.length) return;

	const next = { ...variableValues.value };
	for (const e of list) {
		const v = projectVariables.value.find(x => x.variable_id === e.variable_id);
		if (!v) continue;
		const current = next[v.name] ?? v.initial_value;
		next[v.name] = clampVariable(v, Number(current) + Number(e.delta));
	}
	variableValues.value = next;
};

const resetVariables = () => {
	const next = {};
	for (const v of projectVariables.value) next[v.name] = v.initial_value;
	variableValues.value = next;
	lastEffectKey.value = '';
};

// ==================== 结局 ====================
const loadEndings = async () => {
	try {
		endings.value = await listEndings(Number(props.projectId));
	} catch (e) {
		console.warn('读取结局失败:', e);
		endings.value = [];
	}
};

const endingMatches = (ending) => {
	const conditions = ending?.conditions || [];
	return conditions.every(c => evalCondition(c));
};

const checkEndingForCurrent = () => {
	const d = currentDialogue.value;
	if (!d?.content_id || !endings.value.length) return false;
	for (const ending of endings.value) {
		if (Number(ending.content_id) !== Number(d.content_id)) continue;
		if (triggeredEndings.value.has(ending.ending_id)) continue;
		if (!endingMatches(ending)) continue;
		triggerEnding(ending);
		return true;
	}
	return false;
};

const triggerEnding = async (ending) => {
	triggeredEndings.value.add(ending.ending_id);
	currentEnding.value = ending;
	endingDialogVisible.value = true;
	clearTyping();
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}
	try {
		await unlockEnding(Number(props.projectId), ending.ending_id);
	} catch (e) {
		console.warn('记录结局失败:', e);
	}
};

const resetGame = () => {
	stopBackgroundMusic();
	currentSceneIndex.value = 0;
	currentDialogueIndex.value = 0;
	historyDialogues.value = [];
	triggeredEndings.value = new Set();
	endingDialogVisible.value = false;
	resetVariables();
	nextTick(() => startPreview());
};

const startTyping = () => {
	applyEffectsForCurrent();
	// 到达结局节点且条件成立：弹结局页，不再继续打字
	if (checkEndingForCurrent()) return;
	clearTyping();
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}

	// 跳过已读：连续跳过已读节点，直到未读或遇到选择
	if (shouldSkipCurrent()) {
		skipGuard += 1;
		if (skipGuard <= 500) {
			nextDialogue();
			return;
		}
		skipGuard = 0;
	} else {
		skipGuard = 0;
	}

	markCurrentRead();

	const full = fullText();
	const speed = Number(playerSettings.value.textSpeed);
	if (!full || speed === 0) {
		displayedText.value = full;
		isTyping.value = false;
		scheduleAutoAdvance();
		return;
	}

	const interval = speed === 1 ? 15 : speed === 2 ? 30 : 60;
	displayedText.value = '';
	isTyping.value = true;
	typeIndex = 0;
	typingTimer = setInterval(() => {
		typeIndex += 1;
		displayedText.value = full.slice(0, typeIndex);
		if (typeIndex >= full.length) {
			finishTyping();
		}
	}, interval);
};

// 设置变化：持久化并立即应用音量
watch(playerSettings, () => {
	saveSettings();
	applyVolumes();
}, { deep: true });

// 文字速度变化时，当前句按新速度重新显示
watch(() => playerSettings.value.textSpeed, () => startTyping());
watch(() => playerSettings.value.autoDelay, () => scheduleAutoAdvance());

// 切换对话/场景时重新逐字显示
watch([currentSceneIndex, currentDialogueIndex], () => {
	nextTick(() => {
		startTyping();
		applyVolumes();
	});
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

/* ===== 节点演出指令（立绘三槽位 / 背景切换 / 音效）===== */
const stagePositions = ['left', 'center', 'right'];
const stageAvatars = ref({ left: '', center: '', right: '' });
const bgFromDirective = ref('');
const directivesByContent = ref({});

const hasStageAvatars = computed(() =>
	stagePositions.some(p => !!stageAvatars.value[p])
);

const stageBackground = computed(() => {
	if (bgFromDirective.value) return BASE_URL + bgFromDirective.value;
	return currentScene.value?.background_url
		? BASE_URL + currentScene.value.background_url
		: defaultBackground;
});

const defaultAvatarOf = (characterId) => {
	const c = characters.value.find(x => x.character_id === characterId);
	if (!c) return '';
	const list = c.avatars || [];
	const def = list.find(a => a.is_default) || list[0];
	if (def && def.image_url) return BASE_URL + def.image_url;
	return c.avatar_url ? BASE_URL + c.avatar_url : '';
};

const loadDirectiveData = async () => {
	try {
		const rows = await listDirectives(Number(props.projectId));
		const map = {};
		for (const r of rows) {
			if (!map[r.content_id]) map[r.content_id] = [];
			map[r.content_id].push(r);
		}
		directivesByContent.value = map;
	} catch (e) {
		console.warn('读取演出指令失败:', e);
		directivesByContent.value = {};
	}
};

const resetStage = () => {
	stageAvatars.value = { left: '', center: '', right: '' };
	bgFromDirective.value = '';
	clearWait();
};

/* ===== 演出「停顿」（wait）===== */
const isWaiting = ref(false);
let waitTimer = null;

const clearWait = () => {
	if (waitTimer) {
		clearTimeout(waitTimer);
		waitTimer = null;
	}
	isWaiting.value = false;
};

/** 按毫秒数阻塞推进：停顿期间点击/自动播放都不生效，结束后恢复自动节奏 */
const scheduleWait = (ms) => {
	clearWait();
	const delay = Math.max(0, Number(ms) || 0);
	if (!delay) return;
	isWaiting.value = true;
	waitTimer = setTimeout(() => {
		waitTimer = null;
		isWaiting.value = false;
		scheduleAutoAdvance();
	}, delay);
};

/* ===== 背景淡入淡出 ===== */
const bgShown = ref('');
const bgFading = ref(false);
let bgSwapTimer = null;

const swapBackground = (url) => {
	if (bgSwapTimer) {
		clearTimeout(bgSwapTimer);
		bgSwapTimer = null;
	}
	if (!url || url === bgShown.value) return;
	// 先淡出旧图，换完图并解码成功后再淡入，避免白闪
	bgFading.value = true;
	bgSwapTimer = setTimeout(() => {
		bgShown.value = url;
		const img = new Image();
		const done = () => {
			bgFading.value = false;
			bgSwapTimer = null;
		};
		img.onload = done;
		img.onerror = done;
		img.src = url;
	}, 260);
};

watch(stageBackground, (url) => {
	if (!bgShown.value) {
		bgShown.value = url;
		return;
	}
	swapBackground(url);
}, { immediate: true });

const applyDirectives = (dialogue) => {
	if (!dialogue) return;
	const list = directivesByContent.value[dialogue.content_id] || [];
	if (!list.length) return;

	const next = { ...stageAvatars.value };
	let waitMs = 0;
	for (const d of list) {
		const p = d.payload || {};
		if (d.directive_type === 'avatar') {
			const pos = p.position || 'center';
			next[pos] = p.action === 'hide'
				? ''
				: (getAvatarUrl(p.avatar_id) || defaultAvatarOf(p.character_id));
		} else if (d.directive_type === 'background') {
			bgFromDirective.value = p.url || '';
		} else if (d.directive_type === 'music') {
			if (p.action === 'stop') {
				if (backgroundMusic.value) {
					backgroundMusic.value.pause();
					backgroundMusic.value.currentTime = 0;
				}
			} else if (p.url && backgroundMusic.value) {
				backgroundMusic.value.src = BASE_URL + p.url;
				backgroundMusic.value.volume = playerSettings.value.bgmVolume / 100;
				backgroundMusic.value.play().catch(() => {});
			}
		} else if (d.directive_type === 'sound' && p.url) {
			const a = new Audio(BASE_URL + p.url);
			a.volume = 1;
			a.play().catch(() => {});
		} else if (d.directive_type === 'wait') {
			waitMs += Math.max(0, Number(p.ms) || 0);
		}
	}
	stageAvatars.value = next;
	if (waitMs) scheduleWait(waitMs);
};

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

// 下一个对话
const nextDialogue = () => {
	// 正在逐字显示时，第一次点击先把文字补全
	if (isTyping.value) {
		finishTyping();
		return;
	}
	// 演出「停顿」期间不允许推进
	if (isWaiting.value) return;
	// 「选择」节点必须等玩家点选项，不能自动往下走
	if (currentChoices.value.length) return;
	if (currentDialogueIndex.value < currentSceneDialogues.value.length) {
		// 将当前对话添加到历史记录中
		if (currentDialogue.value) {
			historyDialogues.value.push({
				...currentDialogue.value,
				scene_id: currentScene.value.scene_id,
				scene_title: currentScene.value.title || '',
			});
		}
		
		currentDialogueIndex.value++;
		
		// 如果是最后一个对话且开启自动播放，自动进入下一场景
		if (currentDialogueIndex.value >= currentSceneDialogues.value.length) {
			nextScene();
		}
	}
	showDialogueBox.value = true;
};

// 选择分支：跳到目标节点所在的场景/位置
const selectBranch = (branch) => {
	if (!branch) return;
	clearWait();
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}

	if (currentDialogue.value) {
		historyDialogues.value.push({
			...currentDialogue.value,
			scene_id: currentScene.value.scene_id,
			scene_title: currentScene.value.title || '',
			chosen: branch.choice_text || '',
		});
	}

	const targetId = branch.target_content_id;
	for (let si = 0; si < scenes.value.length; si++) {
		const list = allDialogues.value[scenes.value[si].scene_id] || [];
		const di = list.findIndex(d => d.content_id === targetId);
		if (di >= 0) {
			currentSceneIndex.value = si;
			currentDialogueIndex.value = di;
			showDialogueBox.value = true;
			nextTick(() => {
				if (isPlaying.value) {
					playBackgroundMusic();
					if (autoPlay.value) autoAdvanceDialogue();
				}
			});
			return;
		}
	}

	ElMessage.warning('分支目标不存在，可能已被删除');
};

// 自动前进对话：统一交给 scheduleAutoAdvance（受设置里的间隔控制）
const autoAdvanceDialogue = () => {
	scheduleAutoAdvance();
};

// 下一个场景
const nextScene = () => {
	// 停止当前场景音乐
	stopBackgroundMusic();
	
	if (currentSceneIndex.value < scenes.value.length - 1) {
		// 切换到下一场景（无场景提示）
		currentSceneIndex.value++;
		currentDialogueIndex.value = 0;
		
		// 播放新场景音乐
		nextTick(() => {
			if (isPlaying.value) {
				playBackgroundMusic();
				
				// 自动播放，继续自动前进
				if (autoPlay.value) {
					if (autoTimer) clearTimeout(autoTimer);
					autoTimer = setTimeout(() => { autoTimer = null; autoAdvanceDialogue(); }, 1000);
				}
			}
		});
	} else {
		// 所有场景预览结束，弹出游戏结束提示
		isPlaying.value = false;
		ElMessageBox.alert('游戏结束', '提示', {
			confirmButtonText: '确定',
			callback: () => {
				proxy.$router.push('/home');
			}
		});
	}
};

// 快进至下一场景
const skipToNextScene = () => {
	nextScene();
};

// 重新开始游戏
const restartGame = () => {
	ElMessageBox.confirm(
		'确定要重新开始游戏吗？当前进度将会丢失。',
		'重新开始',
		{
			confirmButtonText: '确定',
			cancelButtonText: '取消',
			type: 'info',
		}
	)
	.then(() => {
		// 停止当前音乐
		stopBackgroundMusic();
		
		// 重置进度和历史对话
		currentSceneIndex.value = 0;
		currentDialogueIndex.value = 0;
		historyDialogues.value = [];
		resetVariables();
		
		// 重新开始
		nextTick(() => {
			startPreview();
		});
		
		ElMessage.success('游戏已重新开始');
	})
	.catch(() => {
		// 用户取消重新开始
	});
};

// 切换对话框显示/隐藏
const toggleDialogueBox = () => {
	showDialogueBox.value = !showDialogueBox.value;
};

// 切换历史对话显示/隐藏
const toggleHistoryDialogue = () => {
	showHistoryDialogue.value = !showHistoryDialogue.value;
};

// 切换自动播放状态
const toggleAutoPlay = () => {
	autoPlay.value = !autoPlay.value;
	if (autoPlay.value) {
		autoAdvanceDialogue();
	}
};

// 保存当前进度到本地存储
const saveProgress = () => {
	try {
		const progressData = {
			projectId: props.projectId,
			currentSceneIndex: currentSceneIndex.value,
			currentDialogueIndex: currentDialogueIndex.value,
			historyDialogues: historyDialogues.value, // 保存历史对话
			saveTime: new Date().toISOString()
		};
		
		localStorage.setItem(`gameProgress_${props.projectId}`, JSON.stringify(progressData));
		ElMessage.success('进度已保存');
	} catch (error) {
		console.error('保存进度失败:', error);
		ElMessage.error('保存进度失败，请重试');
	}
};

// ==================== 云端存档 ====================
const formatSaveTime = (iso) => {
	try {
		return new Date(iso).toLocaleString();
	} catch (e) {
		return iso;
	}
};

const currentSaveSummary = () => {
	const title = currentScene.value.title || '未命名场景';
	const text = (currentDialogue.value?.content_text || '').replace(/\s+/g, ' ').slice(0, 24);
	return text ? `${title} · ${text}` : title;
};

const buildSaveState = () => ({
	sceneIndex: currentSceneIndex.value,
	dialogueIndex: currentDialogueIndex.value,
	historyDialogues: historyDialogues.value,
	variables: variableValues.value,
	lastEffectKey: lastEffectKey.value,
	triggeredEndings: [...triggeredEndings.value],
	savedAt: new Date().toISOString(),
});

const refreshSaves = async () => {
	try {
		saves.value = await listSaves(Number(props.projectId));
	} catch (e) {
		console.warn('读取云端存档失败:', e);
	}
};

const openSaveDialog = () => {
	saveDialogVisible.value = true;
	refreshSaves();
};

const saveToSlot = async (slot, silent = false) => {
	try {
		const info = await putSave(
			Number(props.projectId),
			slot,
			buildSaveState(),
			currentSaveSummary()
		);
		saves.value = [...saves.value.filter(s => s.slot !== slot), info]
			.sort((a, b) => a.slot - b.slot);
		if (!silent) {
			ElMessage.success(slot === 0 ? '自动存档已更新' : '存档成功');
		}
	} catch (e) {
		console.warn('云端存档失败，回退到本地:', e);
		saveProgress();
		if (!silent) ElMessage.warning('云端存档失败，已保存到本地');
	}
};

const loadFromSlot = async (slot) => {
	try {
		isRestoring.value = true;
		const detail = await getSave(Number(props.projectId), slot);
		const state = detail.state || {};
		currentSceneIndex.value = Number(state.sceneIndex) || 0;
		currentDialogueIndex.value = Number(state.dialogueIndex) || 0;
		historyDialogues.value = state.historyDialogues || [];
		variableValues.value = state.variables || {};
		lastEffectKey.value = state.lastEffectKey || '';
		triggeredEndings.value = new Set(state.triggeredEndings || []);
		initVariableValues();
		saveDialogVisible.value = false;
		await nextTick();
		startTyping();
		applyVolumes();
		ElMessage.success('已读取存档');
	} catch (e) {
		console.warn('读取云端存档失败，尝试本地:', e);
		loadProgress();
		saveDialogVisible.value = false;
	} finally {
		setTimeout(() => { isRestoring.value = false; }, 300);
	}
};

const deleteSlot = async (slot) => {
	try {
		await ElMessageBox.confirm('确定删除该存档吗？', '删除存档', {
			confirmButtonText: '删除',
			cancelButtonText: '取消',
			type: 'warning',
		});
		await deleteSave(Number(props.projectId), slot);
		saves.value = saves.value.filter(s => s.slot !== slot);
		ElMessage.success('存档已删除');
	} catch (e) {
		if (e !== 'cancel' && e !== 'close') {
			console.warn('删除存档失败:', e);
			ElMessage.error('删除存档失败');
		}
	}
};

// 从本地存储加载进度
const loadProgress = () => {
	try {
		const progressData = localStorage.getItem(`gameProgress_${props.projectId}`);
		if (progressData) {
			const { 
				currentSceneIndex: sceneIdx, 
				currentDialogueIndex: dialogueIdx,
				historyDialogues: savedHistory 
			} = JSON.parse(progressData);
			currentSceneIndex.value = sceneIdx;
			currentDialogueIndex.value = dialogueIdx;
			historyDialogues.value = savedHistory || [];
			ElMessage.success('已加载上次保存的进度');
		}
	} catch (error) {
		console.error('加载进度失败:', error);
		// 加载失败不提示，使用默认进度
	}
};

// 退出游戏
const exitGame = () => {
	ElMessageBox.confirm(
		'确定要退出游戏吗？建议先保存当前进度。',
		'退出游戏',
		{
			confirmButtonText: '退出',
			cancelButtonText: '取消',
			type: 'warning',
		}
	)
	.then(() => {
		// 用户确认退出
		stopBackgroundMusic();
		proxy.$router.push('/home');
	})
	.catch(() => {
		// 用户取消退出
		ElMessage.info('已取消退出');
	});
};

// 处理鼠标滚轮事件
const handleWheel = (e) => {
	// 向上滚动且不在自动播放状态时显示历史对话
	if (e.deltaY < 0 && !autoPlay.value) {
		toggleHistoryDialogue();
	}
};

// 获取角色名称
const getCharacterName = (characterId) => {
	const char = characters.value.find(c => c.character_id === characterId);
	return char ? char.name : '';
};
const judge = (content_text) => {
	if(content_text===""){
		showDialogueBox.value = !showDialogueBox.value;
	}
	else {
		return content_text
	}
}
// 获取角色头像URL
const getAvatarUrl = (avatarId) => {
	if (!avatarId) return '';
	
	// 在所有角色的头像中查找匹配的头像
	for (const char of characters.value) {
		const avatar = char.avatars.find(a => a.avatar_id === avatarId);
		if (avatar && avatar.image_url) {
			return BASE_URL + avatar.image_url;
		}
	}
	
	// 找不到时返回空
	return '';
};

// 键盘事件处理
const handleKeydown = (e) => {
	// 空格或回车键触发下一个对话
	if (e.key === ' ' || e.key === 'Enter') {
		e.preventDefault(); // 防止空格滚动页面
		nextDialogue();
	}
	// H键切换历史对话显示
	if (e.key.toLowerCase() === 'h') {
		e.preventDefault();
		toggleHistoryDialogue();
	}
};

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

	// 移动端方向提示
	updateOrientation();
	window.addEventListener('resize', updateOrientation);
	window.addEventListener('orientationchange', updateOrientation);
});

// 组件卸载时清理定时器、音频与全局事件，避免内存泄漏与操作已销毁组件
onUnmounted(() => {
	clearTyping();
	if (readFlushTimer) {
		clearTimeout(readFlushTimer);
		readFlushTimer = null;
		flushReads();
	}
	if (autoSaveTimer) {
		clearTimeout(autoSaveTimer);
		autoSaveTimer = null;
	}
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}
	stopBackgroundMusic();
	document.removeEventListener('keydown', handleKeydown);
	document.removeEventListener('click', playBackgroundMusic);
	document.removeEventListener('keydown', playBackgroundMusic);
	document.removeEventListener('touchstart', playBackgroundMusic);
	window.removeEventListener('resize', updateOrientation);
	window.removeEventListener('orientationchange', updateOrientation);
});

const backToHome = () => {
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}
	proxy?.$router?.push('/home');
};
</script>

<style scoped>
/* 基础样式 */
.export-project-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #fff5f7;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

/* 阅读设置入口 */
.player-settings-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 30;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: all 0.2s ease;
}

.player-settings-btn:hover {
  background: rgba(0, 0, 0, 0.45);
  transform: rotate(20deg);
}

/* 状态入口 */
.player-status-btn {
  position: absolute;
  top: 16px;
  right: 68px;
  z-index: 30;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: all 0.2s ease;
}

.player-status-btn:hover {
  background: rgba(0, 0, 0, 0.45);
}

/* CG 鉴赏入口 */
.player-gallery-btn {
  position: absolute;
  top: 16px;
  right: 120px;
  z-index: 30;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: all 0.2s ease;
}

.player-gallery-btn:hover {
  background: rgba(0, 0, 0, 0.45);
}

/* CG 鉴赏弹窗 */
.gallery-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
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

/* 结局页 */
.ending-content {
  text-align: center;
  padding: 10px 0 4px;
}

.ending-badge {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 999px;
  background: #ffe4ec;
  color: #c81f4a;
  font-size: 12px;
  letter-spacing: 2px;
}

.ending-content h2 {
  margin: 14px 0 8px;
  color: #c81f4a;
}

.ending-content p {
  color: #666;
  line-height: 1.7;
}

/* 竖屏提示 */
.rotate-hint {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  backdrop-filter: blur(6px);
}

.rotate-hint button {
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: transparent;
  color: #fff;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}

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

/* 预览区域 */
.preview-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
}

/* 隐藏的背景音乐播放器 */
.hidden-audio {
  display: none;
}

/* 预览容器 - 铺满整个界面 */
.preview-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

/* 背景图样式 - 铺满整个预览区 */
.scene-background {
  width: 100%;
  height: 100%;
  position: relative;
  cursor: pointer;
  z-index: 1; /* 背景图层级最低 */
}

.background-image {
  width: 100%;
  height: 100%;
  object-fit: cover; /* 确保图片铺满且保持比例 */
  transition: filter 0.3s ease, opacity 0.28s ease;
}

.background-image.bg-fading { opacity: 0; }

/* 演出「停顿」提示：三个呼吸的圆点 */
.wait-hint {
  position: absolute;
  left: 50%;
  bottom: 26%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 4;
  pointer-events: none;
}

.wait-hint span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
  animation: waitPulse 1.2s ease-in-out infinite;
}

.wait-hint span:nth-child(2) { animation-delay: 0.18s; }
.wait-hint span:nth-child(3) { animation-delay: 0.36s; }

@keyframes waitPulse {
  0%, 100% { opacity: 0.25; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-3px); }
}

/* 角色立绘样式 - 位于背景之上，对话框之下 */
.character-stand {
  position: absolute;
  bottom: 0;
  left: 200px;
  z-index: 2; /* 角色图层级高于背景，低于对话框 */
  height: 80%; /* 立绘高度为预览区的80% */
  width: auto;
  pointer-events: none; /* 点击穿透，不影响对话框交互 */
}

.character-image {
  height: 100%;
  width: auto;
  object-fit: contain;
  transition: opacity 0.3s ease;
}

/* 演出指令：立绘三槽位 */
.stage-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.stage-avatar {
  position: absolute;
  bottom: 0;
  height: 78%;
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.stage-avatar img {
  height: 100%;
  width: auto;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.18));
}

.stage-avatar.pos-left {
  left: 4%;
}

.stage-avatar.pos-center {
  left: 50%;
  transform: translateX(-50%);
}

.stage-avatar.pos-right {
  right: 4%;
}

/* 加载和错误状态 */
.loading-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 20px 30px;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.error-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  background-color: rgba(245, 108, 108, 0.8);
  color: white;
  padding: 20px 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

/* 历史对话弹窗样式 */
.history-dialogue-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

.history-dialogue-content {
  width: 100%;
  max-width: 800px;
  background-color: rgba(0, 0, 0, 0.85);
  border-radius: 12px;
  padding: 20px;
  color: white;
  max-height: 80vh;
  position: relative;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.history-header h3 {
  margin: 0;
  font-size: 18px;
}

.history-scroll-area {
  max-height: calc(80vh - 80px);
  overflow-y: auto;
  padding-right: 10px;
}

.history-item {
  margin-bottom: 15px;
  padding: 10px;
  border-radius: 6px;
  background-color: rgba(255, 255, 255, 0.1);
}

.history-character {
  font-weight: bold;
  color: #ff6b8b;
  margin-right: 10px;
}

.history-scene {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 4px;
}

.history-chosen {
  margin-top: 4px;
  font-size: 13px;
  color: #ffd1dc;
}

.history-text {
  line-height: 1.6;
}

.close-btn {
  color: white;
  cursor: pointer;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #ff6b8b;
}

/* 对话显示区域 - 位于最上层 */
.dialogue-display {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px;
  z-index: 3; /* 对话框层级最高 */
}

.dialogue-box {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
}

.dialogue-box:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.25);
}

.character-name {
  font-weight: bold;
  color: #d81f37;
  font-size: 16px;
}

.dialogue-text {
  font-size: 18px;
  line-height: 1.6;
  color: #333;
  margin-bottom: 15px;
  min-height: 100px;
}

.dialogue-audio {
	display: none;
}

/* 分支选项 */
.choice-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 8px 0 16px;
}

.choice-option {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #ffb6c1;
  border-radius: 10px;
  background: linear-gradient(135deg, #fff0f4 0%, #ffe4ec 100%);
  color: #b3244a;
  font-size: 16px;
  text-align: left;
  cursor: pointer;
  transition: all 0.18s ease;
}

.choice-option:hover {
  transform: translateX(4px);
  border-color: #ff7b9c;
  box-shadow: 0 4px 14px rgba(255, 123, 156, 0.25);
}

.continue-indicator {
  position: absolute;
  bottom: 10px;
  right: 150px; /* 留出更多功能按钮的位置 */
  color: #ff6b8b;
  animation: bounce 1.5s infinite;
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(5px);
  }
}

/* 功能按钮区域 */
.function-buttons {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: flex;
  gap: 10px;
  z-index: 4;
}

.func-btn {
  width: 30px;
  height: 30px;
  color: #d81f37;
  cursor: pointer;
  transition: all 0.2s;
  background-color: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.func-btn:hover {
  transform: scale(1.1);
  color: #ff6b8b;
}

/* 显示对话框按钮（当对话框隐藏时） */
.show-dialogue-btn {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background-color: rgba(255, 255, 255, 0.8);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  z-index: 4;
  color: #d81f37;
}

.show-dialogue-btn:hover {
  background-color: white;
}

/* 对话结束和无对话状态 */
.dialogue-end, .no-dialogues-preview {
  text-align: center;
  background-color: rgba(255, 255, 255, 0.9);
  padding: 20px;
  border-radius: 12px;
  max-width: 500px;
  margin: 0 auto;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
  position: relative;
  min-height: 100px; /* 确保有足够空间显示按钮 */
}

/* 响应式调整 */
@media (max-width: 1200px) {
  .character-stand {
    left: 20px;
    height: 70%;
  }
  
  .continue-indicator {
    right: 130px;
  }
}

@media (max-width: 768px) {
  .dialogue-display {
    padding: 10px;
  }

  .dialogue-box {
    padding: 14px;
    border-radius: 10px;
  }

  .dialogue-text {
    font-size: 16px;
    min-height: 72px;
    margin-bottom: 8px;
  }
  
  .character-stand {
    left: 10px;
    height: 60%;
  }
  
  .continue-indicator {
    right: 100px;
  }
  
  /* 触控目标不小于 40px */
  .func-btn {
    width: 40px;
    height: 40px;
    font-size: 20px;
  }

  .function-buttons {
    gap: 8px;
    flex-wrap: wrap;
  }

  .player-settings-btn {
    top: 10px;
    right: 10px;
    width: 44px;
    height: 44px;
  }

  .player-status-btn {
    top: 10px;
    right: 62px;
    width: 44px;
    height: 44px;
  }

  .player-gallery-btn {
    top: 10px;
    right: 114px;
    width: 44px;
    height: 44px;
  }

  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    max-height: 52vh;
  }

  .choice-option {
    padding: 14px;
    font-size: 15px;
  }
  
  .history-dialogue-content {
    width: 94vw;
    max-height: 82vh;
  }
}
</style>
