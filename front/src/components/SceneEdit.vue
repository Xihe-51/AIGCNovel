<template>
	<div class="scene-editor-container">
		<!-- 左侧编辑面板 - 默认隐藏 -->
		<div :class="['editor-panel', isPanelOpen ? 'panel-open' : 'panel-closed']">
			<div class="panel-header">
				<h2 class="panel-title">场景编辑</h2>
				<button @click="togglePanel" class="toggle-btn">
					<el-icon :size="20" v-if="isPanelOpen"><ArrowRight /></el-icon>
					<el-icon :size="20" v-else><ArrowLeft /></el-icon>
				</button>
			</div>
			
			<!-- 场景设置部分 -->
			<div class="panel-section">
				<h3 class="section-title">场景设置</h3>
				
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
						<div class="field-label">背景图片</div>
						<div v-if="scene.background_url" class="bg-card">
							<img :src="BASE_URL + scene.background_url" alt="背景预览" />
							<el-upload
								class="bg-card-upload"
								action="#"
								:http-request="handleBackgroundUpload"
								accept="image/*"
								:show-file-list="false">
								<button type="button" class="bg-card-btn">更换</button>
							</el-upload>
						</div>
						<el-upload
							v-else
							class="bg-empty-upload"
							action="#"
							:http-request="handleBackgroundUpload"
							accept="image/*"
							:show-file-list="false">
							<button type="button" class="bg-empty">
								<span class="bg-empty-icon">＋</span>
								<span>上传背景图</span>
							</button>
						</el-upload>
					</div>
					
					<div class="field-block">
						<div class="field-label">背景音乐</div>
						<div v-if="scene.music_url" class="music-card">
							<button type="button" class="music-play" @click="toggleMusic">
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
									@input="seekMusic"
								/>
								<div class="music-time">{{ fmtTime(musicProgress) }} / {{ fmtTime(musicDuration) }}</div>
							</div>
							<el-upload
								class="music-replace"
								action="#"
								:http-request="handleMusicUpload"
								accept="audio/*"
								:show-file-list="false">
								<button type="button" class="music-link">更换</button>
							</el-upload>
							<audio
								ref="settingsAudio"
								:src="BASE_URL + scene.music_url"
								loop
								@timeupdate="onMusicTime"
								@loadedmetadata="onMusicMeta"
								@ended="musicPlaying = false">
							</audio>
						</div>
						<el-upload
							v-else
							class="bg-empty-upload"
							action="#"
							:http-request="handleMusicUpload"
							accept="audio/*"
							:show-file-list="false">
							<button type="button" class="bg-empty">
								<span class="bg-empty-icon">♪</span>
								<span>上传背景音乐</span>
							</button>
						</el-upload>
					</div>
					
					<button type="button" class="save-scene-btn" @click="saveSceneSettings">保存场景设置</button>
				</el-form>
			</div>
			
			<!-- 对话编辑部分 -->
			<div class="panel-section">
				<h3 class="section-title">对话编辑</h3>
				
				<div class="dialogue-controls">
					<el-button size="small" type="success" @click="addNewDialogue">
						<el-icon :size="16"><Plus /></el-icon> 添加对话
					</el-button>
					<el-button size="small" type="warning" @click="reorderDialogues">
						<el-icon :size="16"><RefreshLeft /></el-icon> 确认以当前顺序重新排序
					</el-button>
				</div>
				
				<div class="dialogues-editor">
					<div v-for="(dialogue, index) in dialogues" :key="dialogue.content_id || index" class="dialogue-editor-item">
						<div class="dialogue-header">
							<div class="dialogue-header-left">
								<span class="dialogue-index">{{ index + 1 }}</span>
								<el-dropdown trigger="click" @command="(cmd) => setFsmState(dialogue, cmd)">
									<span class="fsm-badge" :class="getFsmState(dialogue)">
										{{ fsmStateLabels[getFsmState(dialogue)] }}
									</span>
									<template #dropdown>
										<el-dropdown-menu>
											<el-dropdown-item
												v-for="s in fsmStates"
												:key="s.value"
												:command="s.value"
											>
												{{ s.label }} · {{ s.desc }}
											</el-dropdown-item>
										</el-dropdown-menu>
									</template>
								</el-dropdown>
							</div>
							
							<div class="dialogue-actions">
								<el-button
									size="mini"
									@click="openDirectiveDialog(index)"
									class="directive-btn"
									title="演出指令：立绘位置、背景切换、音效"
								>演出</el-button>
								<el-button 
									size="mini" 
									icon="Delete" 
									@click="deleteDialogue(index)"
									class="delete-btn"
								></el-button>
								<el-button 
									size="mini" 
									icon="Top" 
									@click="moveDialogueUp(index)"
									:disabled="index === 0"
									class="move-btn"
								></el-button>
								<el-button 
									size="mini" 
									icon="Bottom" 
									@click="moveDialogueDown(index)"
									:disabled="index === dialogues.length - 1"
									class="move-btn"
								></el-button>
								<el-button size="mini" type="success" @click="addNewDialogue">
									<el-icon><Plus /></el-icon>
								</el-button>
							</div>
						</div>
						
						<el-form :model="dialogue" label-width="70px" size="mini" class="dialogue-form">
							<el-form-item label="类型">
								<el-select 
									v-model="dialogue.content_type" 
									style="width: 100%"
									@change="onContentTypeChange(dialogue)"
								>
									<el-option label="对话" value="对话"></el-option>
									<el-option label="旁白" value="描述"></el-option>
									<el-option label="选择" value="选择"></el-option>
								</el-select>
							</el-form-item>
							
							<el-form-item label="角色" v-if="dialogue.content_type==='对话'">
								<el-select 
									v-model="dialogue.character_id" 
									style="width: 100%"
									@change="handleCharacterChange(index)"
								>
									<el-option 
										v-for="char in characters" 
										:key="char.character_id" 
										:label="char.name" 
										:value="char.character_id"
									></el-option>
								</el-select>
							</el-form-item>
							
							<el-form-item label="立绘类型" v-if="dialogue.content_type==='对话'">
								<el-select 
									v-model="dialogue.avatar_id" 
									style="width: 100%"
									:disabled="!dialogue.character_id"
								>
									<el-option 
										v-for="avatar in getCharacterAvatars(dialogue.character_id)" 
										:key="avatar.avatar_id" 
										:label="avatar.avatar_type" 
										:value="avatar.avatar_id"
									></el-option>
								</el-select>
							</el-form-item>
							
							<el-form-item label="内容">
								<el-input 
									type="textarea" 
									v-model="dialogue.content_text" 
									placeholder="输入对话内容" 
									rows="2"
								/>
							</el-form-item>

							<!-- 第 2 批：选择项 → branch_paths 分支 -->
							<el-form-item label="选择项" v-if="dialogue.content_type==='选择'">
								<div class="choice-editor">
									<div
										v-for="(opt, oi) in (dialogue._choices || [])"
										:key="oi"
										class="choice-item"
									>
										<div class="choice-row">
											<el-input
												v-model="opt.choice_text"
												size="mini"
												placeholder="选项文案"
												class="choice-text-input"
											/>
											<el-select
												v-model="opt.target_content_id"
												size="mini"
												placeholder="跳转到"
												class="choice-target-select"
											>
												<el-option
													v-for="t in choiceTargets(index)"
													:key="t.content_id"
													:label="choiceTargetLabel(t)"
													:value="t.content_id"
												></el-option>
											</el-select>
											<el-button
												size="mini"
												type="danger"
												icon="Delete"
												@click="removeChoice(dialogue, oi)"
											/>
										</div>

										<!-- 显示条件：变量 运算符 值；不填则无条件 -->
										<div class="choice-condition">
											<el-select
												v-model="opt.condition.variable"
												size="mini"
												clearable
												placeholder="无条件"
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
												v-model="opt.condition.op"
												size="mini"
												class="condition-op"
												:disabled="!opt.condition.variable"
											>
												<el-option label="≥" value=">=" />
												<el-option label=">" value=">" />
												<el-option label="≤" value="<=" />
												<el-option label="<" value="<" />
												<el-option label="=" value="==" />
												<el-option label="≠" value="!=" />
											</el-select>
											<el-input-number
												v-model="opt.condition.value"
												size="mini"
												:step="1"
												:disabled="!opt.condition.variable"
												class="condition-value"
											/>
											<span class="condition-tip" v-if="opt.condition.variable">
												仅当条件成立时显示该选项
											</span>
										</div>
									</div>

									<div class="choice-actions">
										<el-button size="mini" icon="Plus" @click="addChoice(dialogue)">添加选项</el-button>
										<el-button
											size="mini"
											type="primary"
											:disabled="!dialogue.content_id"
											@click="saveChoices(dialogue, index)"
										>保存分支</el-button>
									</div>
									<div class="choice-hint" v-if="!dialogue.content_id">
										请先点「保存」保存本条内容，之后才能配置分支选项
									</div>
									<div class="choice-hint" v-else>
										保存后即写入 branch_paths，可在「可视化剧情树」中看到分支连线
									</div>
								</div>
							</el-form-item>

							<!-- 节点数值变化（好感度/数值/开关） -->
							<el-form-item label="数值变化">
								<div class="effect-editor">
									<div
										v-for="(eff, ei) in getDialogueEffects(dialogue)"
										:key="ei"
										class="effect-row"
									>
										<el-select
											v-model="eff.variable_id"
											size="mini"
											placeholder="变量"
											class="effect-var"
										>
											<el-option
												v-for="v in variables"
												:key="v.variable_id"
												:label="v.label"
												:value="v.variable_id"
											></el-option>
										</el-select>
										<el-input-number
											v-model="eff.delta"
											size="mini"
											:step="1"
											class="effect-delta"
										/>
										<el-button
											size="mini"
											type="danger"
											icon="Delete"
											@click="removeEffect(dialogue, ei)"
										/>
									</div>

									<div class="effect-actions">
										<el-button size="mini" icon="Plus" @click="addEffect(dialogue)"
												   :disabled="!variables.length">添加数值</el-button>
										<el-button size="mini" type="primary"
												   :disabled="!dialogue.content_id"
												   @click="saveDialogueEffects(dialogue)">保存数值</el-button>
									</div>
									<div class="choice-hint" v-if="!variables.length">
										先在「项目 → 变量」里创建变量（如好感度）
									</div>
									<div class="choice-hint" v-else-if="!dialogue.content_id">
										请先点「保存」保存本条内容，之后才能配置数值变化
									</div>
								</div>
							</el-form-item>
							
							<el-form-item label="AI辅助">
							    <el-button 
							        size="mini" 
							        type="primary" 
							        @click="openAIDialog(index)"
							        class="ai-button"
							    >
							        <el-icon><MagicStick /></el-icon> AI生成
							    </el-button>
							</el-form-item>

							<el-form-item label="语音">
							    <el-upload
							        class="upload-demo"
							        action="#"
							        :http-request="(params) => handleVoiceUpload(params, index)"
							        accept="audio/*"
							        list-type="text">
							        <el-button size="mini" type="primary">上传语音</el-button>
							    </el-upload>
							</el-form-item>
							
							<el-form-item>
								<el-button size="mini" type="primary" @click="saveDialogue(index)">保存</el-button>
							</el-form-item>
						</el-form>
					</div>
					
					<div v-if="dialogues.length === 0 && !loading" class="no-dialogues">
						暂无对话，点击"添加对话"开始创建
					</div>
				</div>
			</div>
		</div>
		
		<!-- 右侧预览区域 -->
		<div class="preview-panel">
			<audio 
				ref="backgroundMusic"
				:src="scene.music_url ? BASE_URL + scene.music_url : ''" 
				loop
				class="hidden-audio"
			>你的浏览器不支持音频播放</audio>
			
			<button 
				@click="togglePanel" 
				class="panel-toggle-btn"
				:class="isPanelOpen ? 'toggle-hidden' : 'toggle-visible'"
			>
				<el-icon :size="24" v-if="isPanelOpen"><ArrowLeft /></el-icon>
				<el-icon :size="24" v-else><ArrowRight /></el-icon>
			</button>
			
			<div class="preview-container">
				<div class="scene-background">
					<img 
						:src="scene.background_url ? BASE_URL + scene.background_url : defaultBackground" 
						alt="场景背景" 
						style="width: 1350px;"
						class="background-image"
					/>
				</div>
				
				<div v-if="!loading && !error && currentDialogue?.character_id" class="character-stand">
					<img 
						:src="getAvatarUrl(currentDialogue.avatar_id)" 
						alt="角色立绘" 
						class="character-image"
					/>
				</div>
				
				<div v-if="loading" class="loading-indicator">
					<el-loading-spinner size="50" />
					<p>加载场景中...</p>
				</div>
				
				<div v-if="error" class="error-message">
					<el-icon color="#F56C6C" size="24"><WarningFilled /></el-icon>
					<p>错误: {{ error }}</p>
				</div>
				
				<div v-if="!loading && !error" style="width: 1350px;" class="dialogue-display">
					<div 
						v-if="currentDialogueIndex < dialogues.length"
						:class="['dialogue-box', `box-${currentDialogue?.content_type}`]"
						@click="nextDialogue"
					>
						<span class="character-name">{{ getCharacterName(currentDialogue.character_id) }}</span>
						<div class="dialogue-text">
							{{ currentDialogue?.content_text || '' }}
						</div>
						<div v-if="currentDialogue?.voice_url" class="dialogue-audio">
							<audio :src="BASE_URL + currentDialogue.voice_url" controls autoplay>你的浏览器不支持音频播放</audio>
						</div>
						<div class="continue-indicator">
							<el-icon size="20">></el-icon>
						</div>
					</div>
					
					<div v-if="currentDialogueIndex >= dialogues.length && dialogues.length > 0" class="dialogue-end">
						<p>场景对话结束</p>
						<el-button @click="restartDialogues">重新开始</el-button>
					</div>
					
					<div v-if="dialogues.length === 0" class="no-dialogues-preview">
						<p>该场景暂无对话内容</p>
						<el-button @click="togglePanel">去添加对话</el-button>
					</div>
				</div>
			</div>
		</div>
	</div>
	
	<!-- AI对话对话框 -->
	<el-dialog 
		v-model="aiDialogVisible" 
		:title="'AI 对话生成 - ' + (currentAIIndex !== null ? '第' + (currentAIIndex + 1) + '条对话' : '')" 
		width="600px"
		class="ai-dialog"
		:close-on-click-modal="false"
		append-to-body
	>
		<div class="ai-dialog-content">
			<div class="ai-question-section">
				<h4>你的问题</h4>
				<el-input
					v-model="aiQuestion"
					type="textarea"
					:rows="4"
					placeholder="请输入你的问题，例如：'生成一个关于告白的对话' 或 '帮我想一段悲伤的台词'"
				/>
			</div>
			
			<div v-if="aiAnswer" class="ai-answer-section">
				<h4>AI 回答</h4>
				<div v-if="aiRefs.length" class="ai-refs">
					<span class="ai-refs-label">本次参考角色设定：</span>
					<el-tag
						v-for="r in aiRefs"
						:key="r.character_id"
						size="small"
						effect="plain"
						class="ai-ref-tag"
					>{{ r.name }}</el-tag>
				</div>
				<div class="answer-box">
					<p>{{ aiAnswer }}</p>
				</div>
				<div class="answer-actions">
					<el-button size="small" type="success" @click="applyAIAnswer">
						应用到当前对话
					</el-button>
					<el-button size="small" @click="aiAnswer = ''">
						清空回答
					</el-button>
				</div>
			</div>
			
			<div v-if="aiLoading" class="ai-loading">
				<el-loading-spinner size="30" />
				<p>{{ aiStage || 'AI 正在思考中...' }}</p>
			</div>
		</div>
		
		<template #footer>
			<div class="dialog-footer">
				<el-button @click="aiDialogVisible = false">取消</el-button>
				<el-button type="primary" @click="sendToAI" :loading="aiLoading" :disabled="!aiQuestion.trim()">
					<el-icon><Promotion /></el-icon> 发送问题
				</el-button>
			</div>
		</template>
	</el-dialog>

		<!-- 演出指令弹窗 -->
		<el-dialog
			v-model="directiveDialogVisible"
			title="演出指令"
			width="520px"
			append-to-body
			class="directive-dialog"
		>
			<div class="dir-target">当前节点：{{ directiveTarget }}</div>

			<div v-if="!directives.length" class="dir-empty">
				还没有指令。立绘位置、背景切换、音效都可以在这里加。
			</div>
			<div v-else class="dir-list">
				<div v-for="d in directives" :key="d.directive_id" class="dir-row">
					<span class="dir-type">{{ directiveTypeLabel(d.directive_type) }}</span>
					<span class="dir-summary">{{ directiveSummary(d) }}</span>
					<button type="button" class="dir-del" @click="removeDirective(d)">删除</button>
				</div>
			</div>

			<div class="dir-add-title">新增指令</div>
			<div class="dir-add">
				<el-select v-model="newDirectiveType" size="small" class="dir-select-type">
					<el-option label="立绘" value="avatar" />
					<el-option label="背景" value="background" />
					<el-option label="音乐" value="music" />
					<el-option label="音效" value="sound" />
					<el-option label="停顿" value="wait" />
				</el-select>

				<template v-if="newDirectiveType === 'avatar'">
					<el-select v-model="dirForm.character_id" size="small" placeholder="角色" class="dir-field">
						<el-option v-for="c in characters" :key="c.character_id" :label="c.name" :value="c.character_id" />
					</el-select>
					<el-select v-model="dirForm.position" size="small" class="dir-field-sm">
						<el-option label="左侧" value="left" />
						<el-option label="中间" value="center" />
						<el-option label="右侧" value="right" />
					</el-select>
					<el-select v-model="dirForm.action" size="small" class="dir-field-sm">
						<el-option label="显示" value="show" />
						<el-option label="隐藏" value="hide" />
					</el-select>
				</template>

				<template v-else-if="newDirectiveType === 'background'">
					<el-input v-model="dirForm.url" size="small" placeholder="/static/... 背景图地址" class="dir-field-wide" />
				</template>

				<template v-else-if="newDirectiveType === 'music'">
					<el-input v-model="dirForm.url" size="small" placeholder="音乐地址" class="dir-field-wide" />
					<el-select v-model="dirForm.action" size="small" class="dir-field-sm">
						<el-option label="播放" value="play" />
						<el-option label="停止" value="stop" />
					</el-select>
				</template>

				<template v-else-if="newDirectiveType === 'sound'">
					<el-input v-model="dirForm.url" size="small" placeholder="音效地址" class="dir-field-wide" />
				</template>

				<template v-else>
					<el-input v-model.number="dirForm.ms" size="small" placeholder="毫秒" class="dir-field-sm" />
				</template>

				<el-button size="small" type="primary" @click="addDirective">添加</el-button>
			</div>

			<template #footer>
				<el-button @click="directiveDialogVisible = false">关闭</el-button>
			</template>
		</el-dialog>
</template>

<script setup>
// @ts-nocheck
// 本组件是从纯 JS 演进而来的大文件，暂不做类型检查；如需启用请逐段补类型后再删掉本行。
import {
	defineProps,
	ref,
	onMounted,
	computed,
	nextTick
} from 'vue'
import {
	getSceneById,
	getDialoguesBySceneId,
	saveDialogues,
	deleteDialogue as apiDeleteDialogue,
	getCharactersByProjectId,
	getCharacterAvatars as getCharacterAvatarsApi,
	reorderDialoguesApi
} from '@/api/dialogue'
import {
	BASE_URL
} from '@/utils/request'
import { generateText, continueStory } from '@/api/ai'  
import { listBranches, createBranch, deleteBranch, getStoryGraph } from '@/api/branch'
import { listVariables, listEffects, saveContentEffects } from '@/api/variable'
import { listNodeDirectives, createDirective, deleteDirective } from '@/api/directive'
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
  WarningFilled,
  MagicStick,
  Promotion  
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { updateScene, uploadSceneFile } from '@/api/scenes';

const props = defineProps({
	sceneId: {
		type: String,
		required: true
	}
})

// 原有状态
const scene = ref({});
const projectId = ref('')
const dialogues = ref([]);
// 项目内全部剧情节点（跨场景），用于分支跳转目标选择
const projectNodes = ref([]);
// 项目变量与节点数值变化
const variables = ref([]);
const effectsMap = ref({});
const characters = ref([]);
const loading = ref(true);
const error = ref('');
const isPanelOpen = ref(true);
const currentDialogueIndex = ref(0);
const defaultBackground = '';

// 场景设置里的背景音乐迷你播放器
const settingsAudio = ref<HTMLAudioElement | null>(null);
const musicPlaying = ref(false);
const musicProgress = ref(0);
const musicDuration = ref(0);

const fmtTime = (s) => {
	if (!s || Number.isNaN(s)) return '0:00';
	const m = Math.floor(s / 60);
	const sec = Math.floor(s % 60);
	return `${m}:${sec < 10 ? '0' : ''}${sec}`;
};

const toggleMusic = () => {
	const el = settingsAudio.value;
	if (!el) return;
	if (el.paused) {
		el.play().then(() => { musicPlaying.value = true; }).catch(() => {});
	} else {
		el.pause();
		musicPlaying.value = false;
	}
};

const onMusicTime = () => {
	if (settingsAudio.value) musicProgress.value = settingsAudio.value.currentTime;
};

const onMusicMeta = () => {
	if (settingsAudio.value) musicDuration.value = settingsAudio.value.duration || 0;
};

const seekMusic = (e) => {
	const v = Number(e.target.value);
	if (settingsAudio.value) settingsAudio.value.currentTime = v;
	musicProgress.value = v;
};

/* ===== 演出指令（节点级）===== */
const directiveDialogVisible = ref(false);
const directives = ref([]);
const directiveContentId = ref(null);
const directiveTarget = ref('');
const newDirectiveType = ref('avatar');
const dirForm = ref({
	character_id: null,
	position: 'center',
	action: 'show',
	url: '',
	ms: 500
});

const directiveTypeLabel = (t) => ({
	avatar: '立绘',
	background: '背景',
	music: '音乐',
	sound: '音效',
	wait: '停顿'
}[t] || t);

const directiveSummary = (d) => {
	const p = d.payload || {};
	if (d.directive_type === 'avatar') {
		const c = characters.value.find(x => x.character_id === p.character_id);
		const posMap = { left: '左侧', center: '中间', right: '右侧' };
		return `${c ? c.name : '角色'} · ${posMap[p.position] || '中间'} · ${p.action === 'hide' ? '隐藏' : '显示'}`;
	}
	if (d.directive_type === 'background') return p.url || '（未填地址）';
	if (d.directive_type === 'music') return `${p.action === 'stop' ? '停止' : '播放'} · ${p.url || '（未填）'}`;
	if (d.directive_type === 'sound') return p.url || '（未填地址）';
	if (d.directive_type === 'wait') return `${p.ms || 0} 毫秒`;
	return '';
};

const loadDirectives = async (contentId) => {
	directives.value = await listNodeDirectives(Number(projectId.value), Number(contentId));
};

const openDirectiveDialog = async (index) => {
	const d = dialogues.value[index];
	if (!d || !d.content_id) {
		ElMessage.warning('先保存这条对话，再配置演出');
		return;
	}
	directiveContentId.value = d.content_id;
	const kind = d.content_type === '描述' ? '旁白' : (d.content_type || '对话');
	directiveTarget.value = `${kind}：${(d.content_text || '').slice(0, 18) || '（空）'}`;
	newDirectiveType.value = 'avatar';
	dirForm.value = { character_id: null, position: 'center', action: 'show', url: '', ms: 500 };
	directiveDialogVisible.value = true;
	try {
		await loadDirectives(d.content_id);
	} catch (e) {
		ElMessage.error('读取演出指令失败');
	}
};

const addDirective = async () => {
	if (!directiveContentId.value) return;
	const t = newDirectiveType.value;
	let payload = {};
	if (t === 'avatar') {
		if (!dirForm.value.character_id) {
			ElMessage.warning('请选择角色');
			return;
		}
		payload = {
			character_id: dirForm.value.character_id,
			position: dirForm.value.position,
			action: dirForm.value.action
		};
	} else if (t === 'background') {
		if (!dirForm.value.url) {
			ElMessage.warning('请填写背景图地址');
			return;
		}
		payload = { url: dirForm.value.url, transition: 'fade', duration_ms: 400 };
	} else if (t === 'music') {
		if (!dirForm.value.url) {
			ElMessage.warning('请填写音乐地址');
			return;
		}
		payload = { url: dirForm.value.url, action: dirForm.value.action, loop: true };
	} else if (t === 'sound') {
		if (!dirForm.value.url) {
			ElMessage.warning('请填写音效地址');
			return;
		}
		payload = { url: dirForm.value.url };
	} else {
		payload = { ms: Number(dirForm.value.ms) || 500 };
	}

	try {
		await createDirective(Number(projectId.value), {
			content_id: directiveContentId.value,
			directive_type: t,
			payload
		});
		await loadDirectives(directiveContentId.value);
		ElMessage.success('已添加');
	} catch (e) {
		ElMessage.error('添加失败');
	}
};

const removeDirective = async (d) => {
	try {
		await deleteDirective(Number(projectId.value), d.directive_id);
		await loadDirectives(directiveContentId.value);
	} catch (e) {
		ElMessage.error('删除失败');
	}
};
const backgroundMusic = ref(null);

const aiDialogVisible = ref(false);
const aiQuestion = ref('');
const aiAnswer = ref('');
const aiLoading = ref(false);
const currentAIIndex = ref(null);
// 第 2 批：后端续写返回的进度文案与 RAG 命中的角色人设
const aiStage = ref('');
const aiRefs = ref([]);

const fsmStates = [
  { value: 'draft', label: '草稿', desc: '手动创建，待编辑', color: '#b8b8b8' },
  { value: 'ai_generated', label: 'AI生成', desc: 'AI产出，待审核', color: '#ffa726' },
  { value: 'reviewed', label: '已审核', desc: '审核通过，可发布', color: '#66bb6a' },
  { value: 'published', label: '已发布', desc: '锁定，不可编辑', color: '#42a5f5' }
]

const fsmStateLabels = {
  'draft': '草稿',
  'ai_generated': 'AI生成',
  'reviewed': '已审核',
  'published': '已发布'
}

const dialogueFsmStates = ref({})

const fsmStorageKey = () => `aigc:fsm:${props.sceneId}`

const loadFsmStates = () => {
  try {
    const raw = localStorage.getItem(fsmStorageKey())
    dialogueFsmStates.value = raw ? JSON.parse(raw) : {}
  } catch (e) {
    dialogueFsmStates.value = {}
  }
}

const persistFsmStates = () => {
  try {
    localStorage.setItem(fsmStorageKey(), JSON.stringify(dialogueFsmStates.value))
  } catch (e) {
    console.warn('保存审校状态失败:', e)
  }
}

const getFsmState = (dialogue) => {
  const key = dialogue.content_id || `new_${dialogue.order_num}`
  return dialogueFsmStates.value[key] || 'draft'
}

const setFsmState = (dialogue, state) => {
  const key = dialogue.content_id || `new_${dialogue.order_num}`
  dialogueFsmStates.value[key] = state
  persistFsmStates()
  ElMessage.success(`状态已切换为：${fsmStateLabels[state]}`)
}

// ==================== 原有方法 ====================
const togglePanel = () => {
	isPanelOpen.value = !isPanelOpen.value;
};

/** 加载项目全部剧情节点（供分支跳转目标选择，支持跨场景） */
const loadProjectNodes = async () => {
	if (!projectId.value) return;
	try {
		const graph = await getStoryGraph(Number(projectId.value), false);
		projectNodes.value = graph?.nodes || [];
	} catch (e) {
		console.warn('加载项目剧情节点失败，分支目标仅限当前场景:', e);
		projectNodes.value = [];
	}
};

/** 加载项目变量与全部节点的数值变化 */
const loadVariablesAndEffects = async () => {
	if (!projectId.value) return;
	try {
		variables.value = await listVariables(Number(projectId.value));
		const all = await listEffects(Number(projectId.value));
		const map = {};
		for (const e of all) {
			if (!map[e.content_id]) map[e.content_id] = [];
			map[e.content_id].push({
				variable_id: e.variable_id,
				label: e.label,
				delta: e.delta,
			});
		}
		effectsMap.value = map;
	} catch (e) {
		console.warn('加载变量/数值变化失败:', e);
		variables.value = [];
		effectsMap.value = {};
	}
};

const fetchSceneData = async () => {
	try {
		loading.value = true;
		const sceneIdNum = Number(props.sceneId);
		if (isNaN(sceneIdNum)) throw new Error('无效的场景ID');

		const sceneData = await getSceneById(sceneIdNum);
		scene.value = sceneData;

		// 先确定 projectId：ensureChoices 依赖它，否则已有分支选项会加载成空数组
		// （表现为「库里有分支，编辑器里一个选项都不显示」）
		projectId.value = sceneData.project_id || '';
		await loadProjectNodes();
		await loadVariablesAndEffects();

		const dialoguesData = await getDialoguesBySceneId(sceneIdNum);
		dialogues.value = dialoguesData.sort((a, b) => a.order_num - b.order_num);
		loadFsmStates();

		// 为「选择」类型的内容预加载已有分支选项（此时 projectId 已就绪）
		await Promise.all(
			dialogues.value
				.filter(d => d.content_type === '选择')
				.map(d => ensureChoices(d))
		);
		
		if (sceneData.project_id) {
			const chars = await getCharactersByProjectId(sceneData.project_id);
			const charactersWithAvatars = await Promise.all(
				chars.map(async (char) => {
					const avatars = await getCharacterAvatarsApi(char.character_id);
					return { ...char, avatars: avatars || [] };
				})
			);
			characters.value = charactersWithAvatars;
		}

		nextTick(() => { playBackgroundMusic(); });
	} catch (err) {
		console.error('获取场景数据失败:', err);
		error.value = err.message || '获取数据失败，请稍后重试';
		ElMessage.error(error.value);
	} finally {
		loading.value = false;
	}
}

const playBackgroundMusic = () => {
	if (backgroundMusic.value && scene.value.music_url) {
		backgroundMusic.value.play().catch(e => {
			console.log('背景音乐自动播放失败:', e);
		});
	}
};

const currentDialogue = computed(() => dialogues.value[currentDialogueIndex.value]);

const nextDialogue = () => {
	if (currentDialogueIndex.value <= dialogues.value.length - 1) {
		currentDialogueIndex.value++;
		const audioElement = document.querySelector('.dialogue-box audio');
		if (audioElement) audioElement.play().catch(e => console.log('自动播放失败:', e));
	}
};

const restartDialogues = () => { currentDialogueIndex.value = 0; };

const getCharacterAvatars = (characterId) => {
	if (!characterId) return [];
	const char = characters.value.find(c => c.character_id === characterId);
	return char ? char.avatars : [];
};

const getAvatarUrl = (avatarId) => {
	if (!avatarId) return '';
	for (const char of characters.value) {
		const avatar = char.avatars.find(a => a.avatar_id === avatarId);
		if (avatar && avatar.image_url) return BASE_URL + avatar.image_url;
	}
	return '';
};

const handleCharacterChange = (index) => { dialogues.value[index].avatar_id = ''; };

const saveSceneSettings = async () => {
	try {
		loading.value = true;
		await updateScene(Number(props.sceneId), scene.value);
		ElMessage.success('场景设置保存成功');
		nextTick(() => { playBackgroundMusic(); });
	} catch (err) {
		console.error('保存场景设置失败:', err);
		ElMessage.error('保存场景设置失败: ' + (err.message || '未知错误'));
	} finally {
		loading.value = false;
	}
};

const addNewDialogue = () => {
	const newDialogue = {
		project_id: scene.value.project_id,
		scene_id: scene.value.scene_id,
		content_type: '对话',
		content_text: '',
		order_num: dialogues.value.length + 1,
		character_id: '',
		avatar_id: ''
	};
	dialogues.value.push(newDialogue);
};

const saveDialogue = async (index) => {
	try {
		loading.value = true;
		const dialogue = dialogues.value[index];
		dialogue.order_num = index + 1;
		const saved = await saveDialogues(dialogue);
		// 保留已加载的分支选项与数值变化，否则保存后它们会从界面消失
		dialogues.value[index] = { ...saved, _choices: dialogue._choices, _effects: dialogue._effects };
		// 新保存的节点要能立刻作为其它节点的跳转目标
		if (saved?.content_id && !projectNodes.value.some(n => n.content_id === saved.content_id)) {
			projectNodes.value.push({ ...saved, scene_title: scene.value.title });
		}
		ElMessage.success('对话保存成功');
	} catch (err) {
		console.error('保存对话失败:', err);
		ElMessage.error('保存对话失败: ' + (err.message || '未知错误'));
	} finally {
		loading.value = false;
	}
};

const deleteDialogue = async (index) => {
	try {
		const dialogue = dialogues.value[index];
		if (dialogue.content_id) {
			await apiDeleteDialogue(dialogue.content_id);
			projectNodes.value = projectNodes.value.filter(n => n.content_id !== dialogue.content_id);
			const rest = { ...effectsMap.value };
			delete rest[dialogue.content_id];
			effectsMap.value = rest;
		}
		dialogues.value.splice(index, 1);
		dialogues.value.forEach((d, i) => d.order_num = i + 1);
		ElMessage.success('对话已删除');
	} catch (err) {
		console.error('删除对话失败:', err);
		ElMessage.error('删除对话失败: ' + (err.message || '未知错误'));
	}
};

const moveDialogueUp = (index) => {
	if (index > 0) {
		const temp = dialogues.value[index];
		dialogues.value[index] = dialogues.value[index - 1];
		dialogues.value[index - 1] = temp;
		dialogues.value.forEach((d, i) => d.order_num = i + 1);
	}
};

const moveDialogueDown = (index) => {
	if (index < dialogues.value.length - 1) {
		const temp = dialogues.value[index];
		dialogues.value[index] = dialogues.value[index + 1];
		dialogues.value[index + 1] = temp;
		dialogues.value.forEach((d, i) => d.order_num = i + 1);
	}
};

const reorderDialogues = async () => {
  try {
    loading.value = true;
    const orderedContentIds = dialogues.value.map(d => d.content_id);
    const response = await reorderDialoguesApi(Number(props.sceneId), orderedContentIds);
    if (response.success) {
      dialogues.value = response.data;
      ElMessage.success('对话已重新排序并保存');
    } else {
      ElMessage.error('重新排序失败: ' + (response.message || '未知错误'));
    }
  } catch (err) {
    console.error('重新排序失败:', err);
    ElMessage.error('重新排序失败: ' + (err.message || '网络错误'));
  } finally {
    loading.value = false;
  }
};

const handleBackgroundUpload = async (params) => {
	try {
		const formData = new FormData();
		formData.append('file', params.file);
		formData.append('project_id', projectId.value);
		formData.append('file_type', 'image'); 
		const response = await uploadSceneFile(formData);
		if (response.success) {
			scene.value.background_url = response.data.url;
			ElMessage.success('背景图上传成功');
			params.onSuccess(response); 
		} else {
			throw new Error(response.message || '背景图上传失败');
		}
	} catch (err) {
		console.error('背景图上传失败:', err);
		ElMessage.error('背景图上传失败: ' + (err.message || '未知错误'));
		params.onError(err);
	}
};

const handleMusicUpload = async (params) => {
	try {
		const formData = new FormData();
		formData.append('file', params.file);
		formData.append('project_id', projectId.value);
		formData.append('file_type', 'audio'); 
		const response = await uploadSceneFile(formData);
		if (response.success) {
			scene.value.music_url = response.data.url;
			ElMessage.success('背景音乐上传成功');
			params.onSuccess(response); 
			nextTick(() => { playBackgroundMusic(); });
		} else {
			throw new Error(response.message || '背景音乐上传失败');
		}
	} catch (err) {
		console.error('背景音乐上传失败:', err);
		ElMessage.error('背景音乐上传失败: ' + (err.message || '未知错误'));
		params.onError(err); 
	}
};

const handleVoiceUpload = async (params, index) => {
    try {
        const formData = new FormData();
        formData.append('file', params.file);
        formData.append('project_id', projectId.value);
        formData.append('file_type', 'voice');
        const response = await uploadSceneFile(formData);
        if (response.success) {
            dialogues.value[index].voice_url = response.data.url;
            ElMessage.success('语音上传成功');
            params.onSuccess(response); 
        } else {
            throw new Error(response.message || '语音上传失败');
        }
    } catch (err) {
        console.error('语音上传失败:', err);
        ElMessage.error('语音上传失败: ' + (err.message || '未知错误'));
        params.onError(err); 
    }
};

const openAIDialog = (index) => {
  currentAIIndex.value = index;
  aiQuestion.value = '';
  aiAnswer.value = '';
  aiDialogVisible.value = true;
};

const getCharacterName = (characterId) => {
  if (!characterId) return '旁白';
  const charList = characters.value || [];
  if (charList.length === 0) return '角色加载中';
  const char = charList.find(c => c.character_id === characterId);
  return char ? char.name : '未知角色';
};

// ==================== 第 2 批：选择项 ↔ branch_paths ====================

/** 可选跳转目标：项目内全部已保存节点（支持跨场景），并合并当前场景未刷新到的节点 */
const choiceTargets = (selfIndex) => {
  const selfId = dialogues.value[selfIndex]?.content_id;
  const map = new Map();
  for (const n of (projectNodes.value || [])) {
    if (n.content_id) map.set(n.content_id, n);
  }
  for (const d of (dialogues.value || [])) {
    if (d.content_id) map.set(d.content_id, { ...map.get(d.content_id), ...d });
  }
  return Array.from(map.values()).filter(n => n.content_id && n.content_id !== selfId);
};

const choiceTargetLabel = (d) => {
  const scenePart = d.scene_title ? `${d.scene_title} · ` : '';
  const name = getCharacterName(d.character_id);
  const text = (d.content_text || '').replace(/\n/g, ' ').slice(0, 12);
  const who = name && name !== '未知角色' ? `${name}：` : '';
  return `${scenePart}#${d.order_num} ${who}${text}`;
};

/** 切换类型时，若是「选择」则按需加载已有分支 */
const onContentTypeChange = (dialogue) => {
  if (dialogue.content_type === '选择') ensureChoices(dialogue);
};

/** 懒加载某条内容的分支选项 */
const ensureChoices = async (dialogue, force = false) => {
  if (dialogue._choices && !force) return;
  dialogue._choices = [];
  if (!dialogue.content_id || !projectId.value) return;
  try {
    const all = await listBranches(projectId.value);
    dialogue._choices = (all || [])
      .filter(b => b.source_content_id === dialogue.content_id)
      .map(b => ({
        path_id: b.path_id,
        choice_text: b.choice_text || '',
        target_content_id: b.target_content_id,
        condition: b.conditions
          ? {
              variable: b.conditions.variable || '',
              op: b.conditions.op || '>=',
              value: b.conditions.value ?? 0,
            }
          : { variable: '', op: '>=', value: 0 },
      }));
  } catch (e) {
    console.warn('加载分支选项失败:', e);
  }
};

const addChoice = (dialogue) => {
  if (!dialogue._choices) dialogue._choices = [];
  dialogue._choices.push({
    choice_text: '',
    target_content_id: null,
    condition: { variable: '', op: '>=', value: 0 },
  });
};

const removeChoice = (dialogue, i) => {
  dialogue._choices.splice(i, 1);
};

/**
 * 保存某条内容的分支选项到 branch_paths。
 * 策略：先删除该起点已有的分支，再按当前编辑结果重建 —— 保证界面与库内一致。
 */
const saveChoices = async (dialogue, index) => {
  if (!dialogue.content_id) {
    ElMessage.warning('请先保存本条内容，再配置分支选项');
    return;
  }
  if (!projectId.value) {
    ElMessage.warning('项目信息加载中，请稍后再试');
    return;
  }

  const items = (dialogue._choices || [])
    .filter(c => (c.choice_text || '').trim() && c.target_content_id);

  if (items.length === 0) {
    ElMessage.warning('请至少配置一个「有文案 + 有跳转目标」的选项');
    return;
  }

  // 前端先做一轮友好校验，避免无谓请求
  const seen = new Set();
  for (const it of items) {
    if (it.target_content_id === dialogue.content_id) {
      ElMessage.error('选项不能跳转到自己');
      return;
    }
    if (seen.has(it.target_content_id)) {
      ElMessage.error('存在重复的跳转目标，请调整后再保存');
      return;
    }
    if (it.condition?.variable && !Number.isFinite(Number(it.condition.value))) {
      ElMessage.error('显示条件的比较值必须是数字');
      return;
    }
    seen.add(it.target_content_id);
  }

  try {
    const all = await listBranches(projectId.value);
    const old = (all || []).filter(b => b.source_content_id === dialogue.content_id);
    for (const b of old) {
      await deleteBranch(b.path_id);
    }
    for (const it of items) {
      const condition = it.condition?.variable
        ? {
            variable: it.condition.variable,
            op: it.condition.op || '>=',
            value: Math.trunc(Number(it.condition.value)),
          }
        : null;
      await createBranch(projectId.value, {
        source_content_id: dialogue.content_id,
        target_content_id: it.target_content_id,
        choice_text: it.choice_text.trim(),
        conditions: condition,
      });
    }
    await ensureChoices(dialogue, true);
    ElMessage.success(`已保存 ${items.length} 个分支选项`);
  } catch (e) {
    console.error('保存分支失败:', e);
    ElMessage.error('保存分支失败：' + (e?.response?.data?.message || e?.message || '未知错误'));
  }
};

// ==================== 节点数值变化 ====================
const getDialogueEffects = (dialogue) => {
	if (!dialogue._effects) {
		dialogue._effects = (effectsMap.value[dialogue.content_id] || []).map(e => ({ ...e }));
	}
	return dialogue._effects;
};

const addEffect = (dialogue) => {
	const list = getDialogueEffects(dialogue);
	list.push({
		variable_id: variables.value[0]?.variable_id || null,
		delta: 1,
	});
};

const removeEffect = (dialogue, index) => {
	getDialogueEffects(dialogue).splice(index, 1);
};

const saveDialogueEffects = async (dialogue) => {
	if (!dialogue.content_id) {
		ElMessage.warning('请先保存本条内容，再配置数值变化');
		return;
	}
	const list = (getDialogueEffects(dialogue) || [])
		.filter(e => e.variable_id && Number(e.delta) !== 0)
		.map(e => ({ variable_id: Number(e.variable_id), delta: Math.trunc(Number(e.delta)) }));

	try {
		await saveContentEffects(Number(projectId.value), dialogue.content_id, list);
		effectsMap.value = {
			...effectsMap.value,
			[dialogue.content_id]: list.map(e => ({
				...e,
				label: variables.value.find(v => v.variable_id === e.variable_id)?.label || '',
			})),
		};
		dialogue._effects = (effectsMap.value[dialogue.content_id] || []).map(e => ({ ...e }));
		ElMessage.success(`已保存 ${list.length} 条数值变化`);
	} catch (e) {
		console.error('保存数值变化失败:', e);
		ElMessage.error('保存数值变化失败：' + (e?.response?.data?.message || e?.message || '未知错误'));
	}
};

// 说明（第 2 批改造）：
// 原先这里有一个前端自制的 generateHistorySummary()，用「近邻 5 条 + 固定规则截断」
// 拼上下文，再手工拼成一大段 prompt 发给 /ai/generate/text。
// 现已改为调用后端 /ai/continue_story：
//   - 上下文压缩交给 LangChain ConversationSummaryBufferMemory（近期原文 + 远期 LLM 摘要）
//   - 角色人设由 RAG 向量检索自动注入，保证人物一致性
//   - 前端只负责把「已写剧情 + 本次要求」传过去

const sendToAI = async () => {
  if (!aiQuestion.value.trim()) { ElMessage.warning('请输入问题'); return; }
  if (!projectId.value) { ElMessage.warning('项目信息加载中，请稍后再试'); return; }

  aiLoading.value = true;
  aiAnswer.value = '';
  aiRefs.value = [];
  aiStage.value = '正在整理上下文…';

  try {
    // 把当前条目之前已写好的剧情交给后端（由后端决定压缩策略）
    const cut = currentAIIndex.value !== null ? currentAIIndex.value : dialogues.value.length;
    const history = dialogues.value.slice(0, cut)
      .filter(d => (d.content_text || '').trim())
      .map(d => ({
        content_type: d.content_type,
        character_name: getCharacterName(d.character_id),
        content_text: d.content_text,
      }));

    const result = await continueStory({
      project_id: projectId.value,
      scene_id: scene.value.scene_id,
      user_input: aiQuestion.value,
      history,
      use_rag: true,
      length: 500,
      temperature: 0.8,
      forbidden_words: '',
    }, {
      onProgress: (s) => { if (s?.progress?.stage) aiStage.value = s.progress.stage },
    });

    aiAnswer.value = result?.generated_text || '';
    aiRefs.value = result?.persona_hits || [];

    if (!aiAnswer.value) {
      ElMessage.error('AI生成失败：返回内容为空');
    } else if (aiRefs.value.length) {
      ElMessage.success('已生成（参考角色：' + aiRefs.value.map(r => r.name).join('、') + '）');
    }
  } catch (err) {
    console.error('AI请求失败:', err);
    ElMessage.error('AI服务请求失败：' + (err.message || '未知错误'));
  } finally {
    aiLoading.value = false;
    aiStage.value = '';
  }
};

const applyAIAnswer = () => {
  if (currentAIIndex.value !== null && aiAnswer.value) {
    dialogues.value[currentAIIndex.value].content_text = aiAnswer.value;
    ElMessage.success('已应用到当前对话');
    aiDialogVisible.value = false;
  }
};

onMounted(() => {
	fetchSceneData();
	document.addEventListener('click', playBackgroundMusic, { once: true });
	document.addEventListener('keydown', playBackgroundMusic, { once: true });
});
</script>

<style scoped>
/* 主容器 */
.scene-editor-container {
  position: relative;
  /* 不能写 100vw：100vw 会比父容器宽 98px，导致横向滚动/裁切 */
  width: 100%;
  /* 创作工作台里由中栏容器给定高度，不再写死 85vh */
  height: 100%;
  overflow: hidden;
  background: linear-gradient(135deg, #fdf2f8 0%, #fef7ff 100%);
}

/* 编辑面板 */
.editor-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #ffffff;
  box-shadow: 3px 0 20px rgba(0, 0, 0, 0.08);
  transition: transform 0.32s cubic-bezier(0.25, 0.8, 0.25, 1);
  overflow-y: auto;
  z-index: 100;
  transform: translateX(-100%);
}

.panel-open { transform: translateX(0); }
.panel-closed { transform: translateX(-100%); }

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 13px 18px;
  background: #ffffff;
  border-bottom: 1px solid #f2e3e9;
  position: sticky;
  top: 0;
  z-index: 101;
}

.panel-title {
  margin: 0;
  color: #3d2b32;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.toggle-btn {
  background: rgba(255, 255, 255, 0.3);
  border: none;
  color: #c81f4a;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.5);
  transform: scale(1.08);
}

.panel-section { padding: 16px 18px; border-bottom: 1px solid #f7e6ec; }

.section-title {
  margin-top: 0;
  color: #3d2b32;
  font-size: 14px;
  border-left: 3px solid #e8467c;
  padding-left: 9px;
  margin-bottom: 14px;
  font-weight: 600;
}

/* ===== 场景设置：字段块 ===== */
.field-block { margin-bottom: 16px; }

.field-label {
  font-size: 12px;
  color: #8a6a76;
  margin-bottom: 7px;
}

/* 输入框统一成卡片风格 */
.scene-form :deep(.el-input__wrapper),
.scene-form :deep(.el-textarea__inner) {
  border-radius: 10px;
  box-shadow: 0 0 0 1px #f2e3e9 inset;
  background: #fffafc;
}

.scene-form :deep(.el-input__wrapper) {
  padding: 5px 11px;
}

.scene-form :deep(.el-textarea__inner) {
  padding: 8px 11px;
  line-height: 1.65;
  font-family: inherit;
}

.scene-form :deep(.el-input__wrapper:hover),
.scene-form :deep(.el-textarea__inner:hover) {
  box-shadow: 0 0 0 1px #f0bfd0 inset;
}

.scene-form :deep(.el-input__wrapper.is-focus),
.scene-form :deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px #e8467c inset;
  background: #ffffff;
}

.scene-form :deep(.el-input__inner),
.scene-form :deep(.el-textarea__inner) {
  font-size: 13px;
  color: #3d2b32;
}

.scene-form :deep(.el-input__inner::placeholder),
.scene-form :deep(.el-textarea__inner::placeholder) {
  color: #c9aeb9;
}

.scene-form :deep(.el-form-item) {
  margin-bottom: 0;
}

/* 背景图卡片 */
.bg-card {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #f2e3e9;
  background: #fdf6f9;
  line-height: 0;
}

.bg-card img {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
}

.bg-card-upload {
  position: absolute;
  right: 8px;
  bottom: 8px;
}

.bg-card-btn {
  padding: 5px 14px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  color: #c81f4a;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.15s;
}

.bg-card-btn:hover { background: #fff; color: #a3163c; }

/* 空态上传（背景图 / 音乐共用） */
.bg-empty-upload { width: 100%; }

.bg-empty-upload :deep(.el-upload) { width: 100%; }

.bg-empty {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 22px 12px;
  border: 1px dashed #f0c9d8;
  border-radius: 12px;
  background: #fffafc;
  color: #b3788e;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.bg-empty:hover { border-color: #e8467c; color: #c81f4a; background: #fdeef3; }

.bg-empty-icon { font-size: 15px; line-height: 1; }

/* 音乐迷你播放器 */
.music-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #f2e3e9;
  border-radius: 12px;
  background: #fffafc;
}

.music-play {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: #e8467c;
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.music-play:hover { background: #d33a6c; }

.music-main { flex: 1; min-width: 0; }

.music-progress {
  width: 100%;
  height: 3px;
  -webkit-appearance: none;
  appearance: none;
  background: #f2d9e3;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.music-progress::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e8467c;
  cursor: pointer;
}

.music-progress::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: none;
  border-radius: 50%;
  background: #e8467c;
  cursor: pointer;
}

.music-time {
  font-size: 10px;
  color: #b99aa5;
  margin-top: 5px;
  font-variant-numeric: tabular-nums;
}

.music-link {
  border: none;
  background: transparent;
  color: #c81f4a;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 2px;
  flex-shrink: 0;
}

.music-link:hover { text-decoration: underline; }

/* 保存按钮 */
.save-scene-btn {
  width: 100%;
  padding: 9px 0;
  margin-top: 4px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #e8467c, #c81f4a);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 3px 10px rgba(200, 31, 74, 0.2);
}

.save-scene-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(200, 31, 74, 0.28);
}

.hidden-audio { display: none; }

.dialogue-controls { display: flex; gap: 12px; margin-bottom: 20px; }
.dialogues-editor { display: flex; flex-direction: column; gap: 18px; }

.dialogue-editor-item {
  border: 1px solid #f8e1e8;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.25s ease;
  background: #fffafc;
}

.dialogue-editor-item:hover {
  box-shadow: 0 4px 15px rgba(255, 123, 156, 0.08);
  border-color: #ffc0d0;
}

.dialogue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(90deg, #fff0f5 0%, #fff5f9 100%);
  padding: 10px 16px;
  border-bottom: 1px solid #f8e1e8;
}

/* FSM状态机样式 */
.dialogue-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fsm-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
}

.fsm-badge:hover { transform: scale(1.05); }

.fsm-badge.draft {
  background: #f5f5f5;
  color: #999;
  border: 1px solid #e0e0e0;
}

.fsm-badge.ai_generated {
  background: #fff3e0;
  color: #e65100;
  border: 1px solid #ffcc80;
}

.fsm-badge.reviewed {
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
}

.fsm-badge.published {
  background: #e3f2fd;
  color: #1565c0;
  border: 1px solid #90caf9;
}

.fsm-arrow { font-size: 10px; margin-left: 2px; }

.fsm-menu { display: flex; flex-direction: column; gap: 2px; }

.fsm-menu-title {
  padding: 6px 12px 8px;
  font-size: 12px;
  color: #b8a0aa;
  border-bottom: 1px solid #f8e1e8;
  margin-bottom: 4px;
}

.fsm-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #555;
  transition: background 0.15s;
}

.fsm-menu-item:hover { background: #fef8ff; }
.fsm-menu-item.active { background: #fff0f5; color: #c81f4a; font-weight: 500; }

.fsm-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.fsm-desc {
  margin-left: auto;
  font-size: 11px;
  color: #b8a0aa;
}

.fsm-check { margin-left: 4px; color: #c81f4a; font-weight: bold; }

.dialogue-index {
  background: linear-gradient(135deg, #ff7b9c, #ff9ebb);
  color: #fff;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 12px;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(255, 123, 156, 0.3);
}

.dialogue-actions { display: flex; gap: 6px; }
.dialogue-form { padding: 18px; }

.no-dialogues {
  text-align: center;
  padding: 28px;
  color: #b899a2;
  background: #fffafc;
  border-radius: 12px;
  border: 1px dashed #f8e1e8;
}

.preview-panel { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; }

.panel-toggle-btn {
  position: absolute;
  top: 50%;
  /* 面板满宽后，圆形钮固定在中栏右侧边缘 */
  left: calc(100% - 68px);
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #ffc0d0;
  color: #c81f4a;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 50;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.12);
}

.panel-toggle-btn:hover {
  background: #ffffff;
  transform: translateY(-50%) scale(1.12);
  box-shadow: 0 6px 20px rgba(255, 123, 156, 0.18);
}

.toggle-hidden { left: calc(100% - 68px); }

.preview-container { width: 100%; height: 100%; position: relative; overflow: hidden; }
.scene-background { width: 100%; height: 100%; position: relative; z-index: 1; }

.background-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.4s ease;
}

.character-stand {
  position: absolute;
  bottom: 0;
  left: 200px;
  z-index: 2;
  height: 80%;
  width: auto;
  pointer-events: none;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.2));
}

.character-image { height: 100%; width: auto; object-fit: contain; transition: opacity 0.4s ease; }

.loading-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  background: rgba(255, 255, 255, 0.88);
  padding: 24px 32px;
  border-radius: 16px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
  z-index: 10;
  backdrop-filter: blur(4px);
}

.error-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  background: rgba(247, 91, 91, 0.9);
  color: white;
  padding: 24px 32px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12);
  z-index: 10;
  backdrop-filter: blur(4px);
}

.dialogue-display { position: absolute; bottom: 0; left: 0; right: 0; padding: 28px; z-index: 3; }

.dialogue-box {
  background: rgba(255, 252, 254, 0.94);
  border-radius: 20px;
  padding: 28px 32px;
  max-width: 820px;
  margin: 0 auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: transform 0.25s, box-shadow 0.25s;
  position: relative;
  border: 1px solid rgba(255, 192, 208, 0.3);
  backdrop-filter: blur(6px);
}

.dialogue-box:hover { transform: translateY(-4px); box-shadow: 0 15px 35px rgba(0, 0, 0, 0.18); }

.character-name {
  font-weight: 700;
  color: #c81f4a;
  font-size: 18px;
  margin-bottom: 10px;
  display: inline-block;
  padding-bottom: 4px;
  border-bottom: 2px solid #ffc0d0;
}

.dialogue-text {
  font-size: 20px;
  line-height: 1.7;
  color: #2c2c2c;
  margin-bottom: 20px;
  min-height: 70px;
  font-weight: 400;
}

.dialogue-audio { display: none; }

.continue-indicator {
  position: absolute;
  bottom: 18px;
  right: 28px;
  color: #ff7b9c;
  animation: bounce 1.6s infinite ease-in-out;
  font-weight: bold;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(6px); }
}

.dialogue-end, .no-dialogues-preview {
  text-align: center;
  background: rgba(255, 252, 254, 0.94);
  padding: 28px;
  border-radius: 20px;
  max-width: 520px;
  margin: 0 auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(255, 192, 208, 0.3);
}

.ai-dialog :deep(.el-dialog__body) { padding: 24px; max-height: 60vh; overflow-y: auto; }
.ai-dialog-content { display: flex; flex-direction: column; gap: 24px; }

.ai-question-section h4,
.ai-context-section h4,
.ai-answer-section h4 {
  margin: 0 0 12px 0;
  color: #c81f4a;
  font-size: 15px;
  border-left: 4px solid #ff7b9c;
  padding-left: 10px;
  font-weight: 600;
}

/* 第 2 批：选择项编辑器 */
.choice-editor {
  width: 100%;
}

.choice-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}

.choice-item {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #f3d6df;
}

.choice-condition {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 2px;
}

.condition-var {
  flex: 1 1 160px;
  min-width: 130px;
}

.condition-op {
  flex: 0 0 76px;
}

.condition-value {
  flex: 0 0 110px;
}

.condition-tip {
  font-size: 12px;
  color: #94a3b8;
}

.choice-text-input { flex: 1 1 160px; min-width: 120px; }
/* 目标节点文案包含「场景 · #序号 角色：内容」，160px 会被截断，放宽并允许省略号 */
.choice-target-select { flex: 1 1 240px; min-width: 180px; }

:deep(.choice-target-select .el-select__placeholder),
:deep(.choice-target-select .el-select__selected-item) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.choice-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.choice-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

/* 节点数值变化 */
.effect-editor {
  width: 100%;
}

.effect-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}

.effect-var {
  flex: 1 1 180px;
  min-width: 140px;
}

.effect-delta {
  flex: 0 0 120px;
}

.effect-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.ai-refs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.ai-refs-label {
  font-size: 13px;
  color: #64748b;
}

.ai-ref-tag {
  --el-tag-bg-color: #fff1f5;
  --el-tag-border-color: #ffc7d8;
  --el-tag-text-color: #c81f4a;
}

.answer-box {
  background: linear-gradient(135deg, #f0fdf4 0%, #f0fbf7 100%);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #d1fae5;
  margin-bottom: 16px;
  min-height: 100px;
}

.answer-box p { margin: 0; color: #1e293b; font-size: 15px; line-height: 1.7; }
.answer-actions { display: flex; gap: 12px; justify-content: flex-end; }

.ai-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px;
  color: #947a83;
}

.ai-loading p { margin-top: 12px; font-size: 15px; }
.ai-button { display: flex; align-items: center; gap: 5px; }

@media (max-width: 1200px) {
  .editor-panel { width: 60%; }
  .character-stand { left: 24px; height: 72%; }
}

@media (max-width: 768px) {
  .editor-panel { width: 100%; }
  .dialogue-text { font-size: 17px; }
  .toggle-hidden { left: calc(100% - 68px); }
  .character-stand { left: 12px; height: 62%; }
}

/* ===== 演出指令弹窗 ===== */
.directive-btn {
  border-color: #f0cfdc !important;
  color: #c81f4a !important;
  background: #fffafc !important;
  padding: 5px 9px !important;
  font-size: 11px !important;
}

.directive-btn:hover {
  background: #fdeef3 !important;
  border-color: #e8467c !important;
}

.dir-target {
  font-size: 12px;
  color: #8a6a76;
  background: #fffafc;
  border: 1px solid #f5e4ea;
  border-radius: 8px;
  padding: 8px 11px;
  margin-bottom: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dir-empty {
  font-size: 12px;
  color: #b99aa5;
  text-align: center;
  padding: 18px 8px;
  background: #fffdfe;
  border: 1px dashed #eddbe3;
  border-radius: 10px;
}

.dir-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.dir-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #f5e4ea;
  border-radius: 9px;
  background: #fff;
}

.dir-type {
  flex-shrink: 0;
  font-size: 10px;
  color: #c81f4a;
  background: #fdeef3;
  border: 1px solid #f6d6e2;
  border-radius: 6px;
  padding: 1px 7px;
}

.dir-summary {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #3d2b32;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dir-del {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #c98aa0;
  font-size: 11px;
  cursor: pointer;
}

.dir-del:hover { color: #d9534f; }

.dir-add-title {
  font-size: 12px;
  color: #8a6a76;
  margin: 16px 0 8px;
}

.dir-add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px dashed #eddbe3;
  border-radius: 10px;
  background: #fffdfe;
}

.dir-select-type { width: 96px; flex-shrink: 0; }
.dir-field { width: 120px; }
.dir-field-sm { width: 96px; }
.dir-field-wide { flex: 1; min-width: 150px; }
</style>