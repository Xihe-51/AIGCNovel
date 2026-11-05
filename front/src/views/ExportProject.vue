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
				@click="openGallery" title="鉴赏 / 收藏">
			<el-icon><Picture /></el-icon>
		</button>
		<button v-if="!loading && !error && publicReleases.length" class="player-changelog-btn"
				@click="changelogVisible = true" title="更新记录">
			更新
		</button>
		<button v-if="!loading && !error && chapterRoute.length" class="player-chapter-btn"
				@click="chaptersVisible = true" title="章节跳转 / 路线图鉴">
			章节
		</button>

		<!-- 调试器（仅 ?debug=1 时显示） -->
		<button v-if="debugMode && !loading && !error" class="player-debug-btn" @click="debugPanelVisible = !debugPanelVisible" title="调试器">
			调试
		</button>
		<div v-if="debugMode && debugPanelVisible && !loading && !error" class="debug-panel">
			<div class="debug-panel-head">
				<span>调试器</span>
				<button class="debug-close" @click="debugPanelVisible = false">×</button>
			</div>
			<div class="debug-pos">
				场景 {{ currentSceneIndex + 1 }}/{{ scenes.length }} · 节点 #{{ currentDialogue?.content_id || '-' }}
			</div>
			<div class="debug-jump">
				<input v-model="debugJumpId" type="number" placeholder="跳转到 content_id" />
				<button @click="debugJump">跳转</button>
			</div>
			<div class="debug-vars">
				<div v-for="v in projectVariables" :key="v.variable_id" class="debug-var">
					<span class="debug-var-label">{{ v.label }}</span>
					<span class="debug-var-key">{{ v.name }}</span>
					<input
						class="debug-var-input"
						type="number"
						:value="variableValues[v.name] ?? v.initial_value"
						@change="setDebugVar(v, $event)"
					/>
				</div>
				<div v-if="!projectVariables.length" class="debug-empty">项目还没有变量</div>
			</div>

			<!-- 条件断点 -->
			<div class="debug-section">
				<div class="debug-section-head">
					<span>条件断点</span>
					<button
						type="button"
						class="debug-mini-btn"
						:class="{ 'is-on': debugBreakpoint.enabled }"
						@click="debugBreakpoint = { ...debugBreakpoint, enabled: !debugBreakpoint.enabled }"
					>
						{{ debugBreakpoint.enabled ? '已开启' : '未开启' }}
					</button>
				</div>
				<div class="debug-break-row">
					<select v-model="debugBreakpoint.variable" class="debug-break-var">
						<option value="">选择变量</option>
						<option v-for="v in projectVariables" :key="v.variable_id" :value="v.name">{{ v.label }}</option>
					</select>
					<select v-model="debugBreakpoint.op" class="debug-break-op">
						<option value=">">&gt;</option>
						<option value=">=">≥</option>
						<option value="<">&lt;</option>
						<option value="<=">≤</option>
						<option value="==">=</option>
						<option value="!=">≠</option>
					</select>
					<input v-model.number="debugBreakpoint.value" type="number" class="debug-break-value" />
				</div>
				<div v-if="debugBreakpointHit" class="debug-break-hit">上次命中：{{ debugBreakpointHit }}</div>
			</div>

			<!-- 变量历史 -->
			<div class="debug-section">
				<div class="debug-section-head">
					<span>变量历史</span>
					<button type="button" class="debug-mini-btn" @click="variableHistory = []">清空</button>
				</div>
				<div class="debug-history">
					<div v-for="h in variableHistory.slice(0, 12)" :key="h.id" class="debug-history-item">
						<span class="debug-history-time">{{ h.at }}</span>
						<span class="debug-history-text">{{ h.label }} {{ h.from }}→{{ h.to }}</span>
						<span class="debug-history-reason">{{ h.reason }}</span>
					</div>
					<div v-if="!variableHistory.length" class="debug-empty">还没有变量变化</div>
				</div>
			</div>

			<!-- 状态快照 -->
			<div class="debug-section">
				<div class="debug-section-head">
					<span>状态快照</span>
					<button type="button" class="debug-mini-btn" @click="saveDebugSnapshot">保存快照</button>
				</div>
				<div class="debug-snapshots">
					<div v-for="s in debugSnapshots" :key="s.id" class="debug-snapshot-item">
						<span class="debug-snapshot-title">{{ s.time }} · #{{ s.node || '-' }}</span>
						<button type="button" class="debug-mini-btn" @click="restoreDebugSnapshot(s)">恢复</button>
						<button type="button" class="debug-mini-btn danger" @click="deleteDebugSnapshot(s.id)">删</button>
					</div>
					<div v-if="!debugSnapshots.length" class="debug-empty">最多保存 5 个快照</div>
				</div>
			</div>

			<!-- 覆盖率：本轮试玩走过的节点 / 分支 -->
			<div class="debug-coverage">
				<div class="debug-coverage-head">
					<span>覆盖率</span>
					<button type="button" class="debug-coverage-reset" @click="resetCoverage">重置</button>
				</div>
				<div class="debug-coverage-row">
					<span>节点</span>
					<span>{{ coverageStats.nodeVisited }} / {{ coverageStats.nodeTotal }}（{{ coverageStats.nodePct }}%）</span>
				</div>
				<div class="debug-bar">
					<div class="debug-bar-fill nodes" :style="{ width: coverageStats.nodePct + '%' }"></div>
				</div>
				<div class="debug-coverage-row">
					<span>分支</span>
					<span>{{ coverageStats.edgeVisited }} / {{ coverageStats.edgeTotal }}（{{ coverageStats.edgePct }}%）</span>
				</div>
				<div class="debug-bar">
					<div class="debug-bar-fill edges" :style="{ width: coverageStats.edgePct + '%' }"></div>
				</div>

				<div class="debug-uncovered">
					<div class="debug-uncovered-title">未走到节点（{{ uncoveredNodes.length }}）</div>
					<div class="debug-uncovered-list">
						<div
							v-for="n in uncoveredNodes.slice(0, 40)"
							:key="n.content_id"
							class="debug-uncovered-item"
							@click="debugJumpTo(n.content_id)"
						>
							<span class="debug-uncovered-id">#{{ n.content_id }}</span>
							<span class="debug-uncovered-scene">{{ n.scene_title }}</span>
							<span class="debug-uncovered-text">{{ n.content_text }}</span>
						</div>
						<div v-if="!uncoveredNodes.length" class="debug-empty">全部节点已走到</div>
					</div>
				</div>

				<div v-if="uncoveredEdges.length" class="debug-uncovered">
					<div class="debug-uncovered-title">未走分支（{{ uncoveredEdges.length }}）</div>
					<div class="debug-uncovered-list">
						<div v-for="e in uncoveredEdges.slice(0, 30)" :key="e.path_id" class="debug-uncovered-item">
							<span class="debug-uncovered-id">#{{ e.source_content_id }}</span>
							<span class="debug-uncovered-text">
								{{ e.choice_text ? '「' + e.choice_text + '」' : '自动跳转' }}
								→ #{{ e.target_content_id }}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>

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
			<div
				class="preview-container"
				:class="{ 'fx-shake': activeEffect && activeEffect.effect === 'shake' }"
				:style="{ '--fx-amp': (activeEffect && activeEffect.intensity ? activeEffect.intensity : 5) + 'px' }"
				@wheel.prevent="handleWheel"
			>
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

				<!-- 黑场转场遮罩 -->
				<div class="bg-blackout" :class="{ 'is-on': bgBlackout }"></div>
				
				<!-- 演出指令控制的立绘（左 / 中 / 右三槽位） -->
				<div v-if="hasStageAvatars" class="stage-layer">
						<div
							v-for="pos in stagePositions"
							:key="pos"
							v-show="stageAvatars[pos]"
							:class="['stage-avatar', 'pos-' + pos]"
							:style="stageAvatars[pos]?.boxStyle"
						>
							<img :src="stageAvatars[pos]?.src" :style="stageAvatars[pos]?.style" :class="{ 'sprite-motion': playerSettings.spriteMotion }" alt="" decoding="async" />
						</div>
					</div>

				<!-- 回退：没有演出指令时，显示当前（或最近一位）说话角色的立绘 -->
					<div v-else-if="!loading && !error && previewAvatarSrc" class="character-stand">
						<img 
							:src="previewAvatarSrc" 
							alt="角色立绘" 
							class="character-image"
							:class="{ 'sprite-motion': playerSettings.spriteMotion }"
							loading="lazy"
							decoding="async"
							@error="hideBrokenImage"
						/>
					</div>

					<!-- 演出指令：前景图层（覆盖在立绘之上、对话框之下） -->
					<div v-if="fgShown && stageLayerVisible.foreground !== false" class="stage-foreground">
						<img
							:src="fgShown"
							alt=""
							:class="{ 'fg-fading': fgFading }"
							decoding="async"
						/>
					</div>

				<!-- 演出效果：天气覆盖层 / 闪光 -->
				<div
					v-if="activeEffect && activeEffect.effect === 'weather'"
					class="fx-weather"
					:class="'fx-' + (activeEffect.weather || 'rain')"
				></div>
				<div
					v-if="activeEffect && activeEffect.effect === 'flash'"
					:key="activeEffect.key"
					class="fx-flash"
					:style="{ background: activeEffect.color || '#ffffff', animationDuration: activeEffect.duration_ms + 'ms' }"
				></div>
				
				<!-- 演出「停顿」指令生效时的提示 -->
				<div v-if="isWaiting && !loading && !error" class="wait-hint">
					<span></span><span></span><span></span>
				</div>

				<!-- 变量变化提示：好感度 +5 / 线索 +1 -->
				<div v-if="variableNotices.length" class="var-notice-layer">
					<div
						v-for="n in variableNotices"
						:key="n.id"
						:class="['var-notice', { 'is-down': n.delta < 0 }]"
					>
						<span class="var-notice-icon">{{ n.delta > 0 ? '♥' : '−' }}</span>
						<span class="var-notice-label">{{ n.label }}</span>
						<span class="var-notice-delta">{{ n.delta > 0 ? '+' + n.delta : n.delta }}</span>
					</div>
				</div>

				<!-- 加载状态 -->
				<div v-if="loading" class="loading-indicator">
					<span class="ui-spinner ui-spinner-lg"></span>
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
				<div v-if="!loading && !error && showDialogueBox && stageLayerVisible.dialogue !== false" class="dialogue-display">
					<!-- 当前对话 -->
					<div 
						v-if="currentDialogueIndex < currentSceneDialogues.length"
						:class="['dialogue-box', `box-${currentDialogue?.content_type}`, `style-${playerSettings.boxStyle || 'classic'}`]"
						@click="onDialogueClick"
					>
						<img
							v-if="playerSettings.boxStyle === 'bubble' && currentDialogue?.content_type === '对话' && previewAvatarSrc"
							class="bubble-avatar"
							:src="previewAvatarSrc"
							alt=""
							@error="hideBrokenImage"
						/>
						<span class="character-name">{{ getCharacterName(currentDialogue.character_id) }}</span>
						<button
							v-if="currentDialogue?.voice_url && playerSettings.voiceEnabled"
							type="button"
							class="voice-replay-btn"
							title="重播本句语音"
							@click.stop="replayVoice"
						>语音</button>
						<div
							class="dialogue-text"
							:style="{ fontSize: playerSettings.fontSize + 'px', lineHeight: playerSettings.lineHeight }"
							v-html="displayedHtml"
						></div>
						<!-- 语音播放 -->
						<div v-if="currentDialogue?.voice_url && playerSettings.voiceEnabled" class="dialogue-audio">
							<audio ref="dialogueVoice" :src="BASE_URL + currentDialogue.voice_url" controls autoplay
								@play="onVoicePlay" @ended="onVoiceEnded" @pause="onVoiceEnded">你的浏览器不支持音频播放
							</audio>
						</div>

						<!-- 分支选项：选择后跳到目标节点，而不是线性继续 -->
						<div v-if="currentChoices.length" class="choice-panel" @click.stop>
							<button
								v-for="choice in currentChoices"
								:key="choice.path_id"
								:class="['choice-option', { 'has-image': !!choice.image_url, 'is-locked': choice.locked }]"
								:disabled="choice.locked"
								:title="choice.locked ? ('条件未满足：' + conditionText(choice.conditions)) : ''"
								@click.stop="selectBranch(choice)"
							>
								<img
									v-if="choice.image_url"
									:src="BASE_URL + choice.image_url"
									class="choice-image"
									alt=""
									loading="lazy"
								/>
								<span class="choice-label">{{ choice.choice_text || '继续' }}</span>
								<span v-if="choice.locked" class="choice-lock-hint">
									未解锁 · {{ conditionText(choice.conditions) }}
								</span>
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
								<el-icon @click.stop="openSaveDialog" class="func-btn save-func-btn">
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
								<el-icon @click.stop="openSaveDialog" class="func-btn save-func-btn">
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
								<el-icon @click.stop="openSaveDialog" class="func-btn save-func-btn">
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
				<div v-if="!loading && !error && !showDialogueBox && stageLayerVisible.dialogue !== false" class="show-dialogue-btn" @click="toggleDialogueBox">
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
				<el-button @click="resetGame">从头开始（重置数值）</el-button>
				<el-button type="primary" @click="startNextPlaythrough">开始第 {{ playthrough + 1 }} 周目</el-button>
				<el-button @click="backToHome">返回项目</el-button>
			</template>
		</el-dialog>

		<!-- 当前状态 -->
		<el-dialog v-model="statusDialogVisible" title="当前状态" width="420px" class="status-dialog">
			<div class="status-row">
				<span class="status-label">当前周目</span>
				<span class="status-value">第 {{ playthrough }} 周目</span>
			</div>

			<template v-if="affinityVariables.length">
				<div class="status-section">角色好感</div>
				<div v-for="v in affinityVariables" :key="v.variable_id" class="affinity-item">
					<div class="affinity-head">
						<span class="affinity-name">{{ characterNameOf(v.character_id) }}</span>
						<span class="affinity-num">
							{{ variableValues[v.name] ?? v.initial_value }}
							<template v-if="v.max_value != null"> / {{ v.max_value }}</template>
						</span>
					</div>
					<div class="affinity-bar">
						<i :style="{ width: affinityPercent(v) }"></i>
					</div>
					<div class="affinity-label">
						{{ v.label }}
						<el-tag v-if="v.persist" type="warning" size="small" class="persist-badge">跨周目</el-tag>
					</div>
				</div>
			</template>

			<template v-if="otherVariables.length">
				<div class="status-section">其他属性</div>
				<div v-for="v in otherVariables" :key="v.variable_id" class="status-row">
					<span class="status-label">
						{{ v.label }}
						<el-tag v-if="v.persist" type="warning" size="small" class="persist-badge">跨周目</el-tag>
					</span>
					<span class="status-value">{{ variableValues[v.name] ?? v.initial_value }}</span>
				</div>
			</template>

			<div v-if="!projectVariables.length" class="status-empty">项目还没有定义变量</div>
		</el-dialog>

		<!-- 存档 / 读档 -->
		<el-dialog v-model="saveDialogVisible" title="存档 / 读档" width="540px" class="save-dialog">
			<div v-for="s in slotDefs" :key="s.slot" class="save-slot">
				<div class="save-slot-thumb">
					<img
						v-if="saveMap[s.slot]?.thumbnail_url"
						:src="thumbSrc(saveMap[s.slot].thumbnail_url)"
						alt=""
						loading="lazy"
					/>
					<span v-else class="save-slot-thumb-empty">无画面</span>
					<span v-if="saveMap[s.slot]?.scene_title" class="save-slot-thumb-title">
						{{ saveMap[s.slot].scene_title }}
					</span>
				</div>
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
				<span class="setting-label">语音播放</span>
				<el-switch v-model="playerSettings.voiceEnabled" />
			</div>
			<div class="setting-row">
				<span class="setting-label">对话字号</span>
				<el-slider v-model="playerSettings.fontSize" :min="14" :max="24" :step="1" style="flex: 1" />
				<span class="setting-value">{{ playerSettings.fontSize }}px</span>
			</div>
			<div class="setting-row">
				<span class="setting-label">对话行距</span>
				<el-slider v-model="playerSettings.lineHeight" :min="1.3" :max="2.2" :step="0.1" style="flex: 1" />
				<span class="setting-value">{{ playerSettings.lineHeight.toFixed(1) }}</span>
			</div>
			<div class="setting-row">
				<span class="setting-label">对话样式</span>
				<el-select v-model="playerSettings.boxStyle" size="small" style="width: 140px">
					<el-option label="经典底栏" value="classic" />
					<el-option label="气泡对话" value="bubble" />
				</el-select>
			</div>
			<div class="setting-row">
				<span class="setting-label">全屏</span>
				<el-switch v-model="playerSettings.fullscreen" @change="toggleFullscreen" />
			</div>
			<div class="setting-row">
				<span class="setting-label">跳过已读</span>
				<el-switch v-model="playerSettings.skipRead" />
			</div>
			<div class="setting-row">
				<span class="setting-label">数值变化提示</span>
				<el-switch v-model="playerSettings.showVariableNotice" />
			</div>
			<div class="setting-row">
				<span class="setting-label">立绘动态</span>
				<el-switch v-model="playerSettings.spriteMotion" />
			</div>
			<div class="setting-shortcuts">
				<span>快捷键：空格 / 回车 / → 继续，A 自动播放，S 跳过已读，H 回想，Esc 关闭面板</span>
				<span>手柄：A 继续，B 回想，X 自动播放</span>
			</div>
			<template #footer>
				<el-button @click="resetSettings">恢复默认</el-button>
				<el-button type="primary" @click="settingsVisible = false">完成</el-button>
			</template>
		</el-dialog>

		<!-- 更新记录 -->
		<el-dialog v-model="changelogVisible" title="更新记录" width="440px" class="changelog-dialog">
			<div v-if="!publicReleases.length" class="changelog-empty">暂无更新记录</div>
			<div v-else class="changelog-list">
				<div v-for="r in publicReleases" :key="r.release_id" class="changelog-item">
					<div class="changelog-head">
						<span class="changelog-no">v{{ r.release_no }}</span>
						<span class="changelog-time">{{ formatSaveTime(r.created_at) }}</span>
					</div>
					<div class="changelog-notes">{{ r.notes || '本次更新没有填写说明' }}</div>
					<div class="changelog-stats">
						{{ r.stats.scene_count }} 场景 · {{ r.stats.content_count }} 节点
					</div>
				</div>
			</div>
		</el-dialog>

		<!-- 章节快捷跳转 / 路线图鉴 -->
		<el-dialog v-model="chaptersVisible" title="章节 / 路线图鉴" width="560px" class="chapter-dialog">
			<div class="chapter-summary">
				<span>已读节点 {{ routeStats.read }} / {{ routeStats.total }}</span>
				<span>已达成结局 {{ routeStats.endingUnlocked }} / {{ endings.length }}</span>
			</div>
			<div class="chapter-list">
				<button
					v-for="c in chapterRoute"
					:key="c.chapter_id"
					type="button"
					:class="['chapter-item', { 'is-locked': !c.unlocked }]"
					@click="jumpToChapter(c)"
				>
					<span class="chapter-order">{{ c.order_num }}</span>
					<span class="chapter-title">{{ c.title }}</span>
					<span class="chapter-progress">{{ c.read }}/{{ c.total }}</span>
					<span class="chapter-action">{{ c.unlocked ? '跳转' : '未解锁' }}</span>
				</button>
				<div v-if="!chapterRoute.length" class="chapter-empty">作者还没有划分章节</div>
			</div>
			<div class="chapter-section-title">结局路线</div>
			<div class="route-endings">
				<div
					v-for="e in endings"
					:key="e.ending_id"
					:class="['route-ending', { 'is-unlocked': e.unlocked }]"
				>
					<span class="route-ending-title">{{ e.title }}</span>
					<el-tag :type="e.unlocked ? 'success' : 'info'" size="small">
						{{ e.unlocked ? '已达成' : '未达成' }}
					</el-tag>
				</div>
				<div v-if="!endings.length" class="chapter-empty">还没有配置结局</div>
			</div>
		</el-dialog>

		<!-- 鉴赏 / 收藏 -->
		<el-dialog v-model="galleryDialogVisible" width="680px" class="gallery-dialog">
			<template #header>
				<div class="gallery-header">
					<div class="gallery-tabs">
						<button
							v-for="t in galleryTabs"
							:key="t.key"
							type="button"
							:class="['gallery-tab', { 'is-active': galleryTab === t.key }]"
							@click="switchGalleryTab(t.key)"
						>{{ t.label }}</button>
					</div>
					<span class="gallery-count">{{ galleryCountText }}</span>
				</div>
			</template>

			<!-- CG -->
			<template v-if="galleryTab === 'cg'">
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
			</template>

			<!-- BGM -->
			<template v-else-if="galleryTab === 'bgm'">
				<div v-if="musicLoading" class="gallery-empty">加载中…</div>
				<div v-else-if="musicItems.length" class="music-gallery-list">
					<div
						v-for="m in musicItems"
						:key="m.music_url"
						:class="['music-gallery-item', { 'is-locked': !m.unlocked }]"
					>
						<div class="music-gallery-meta">
							<span class="music-gallery-title">{{ m.unlocked ? m.title : '未解锁曲目' }}</span>
							<span class="music-gallery-sub">{{ m.unlocked ? 'BGM' : '进入使用该音乐的场景后解锁' }}</span>
						</div>
						<audio
							v-if="m.unlocked"
							:src="BASE_URL + m.music_url"
							controls
							preload="none"
							class="music-gallery-audio"
						></audio>
						<span v-else class="music-gallery-lock">未解锁</span>
					</div>
				</div>
				<div v-else class="gallery-empty">这部作品还没有背景音乐。</div>
			</template>

			<!-- 成就 -->
			<template v-else-if="galleryTab === 'achievement'">
				<div v-if="achievements.length" class="achievement-gallery-list">
					<div
						v-for="a in achievements"
						:key="a.achievement_id"
						:class="['achievement-gallery-item', { 'is-locked': !a.unlocked }]"
					>
						<div class="achievement-gallery-badge">{{ a.unlocked ? '★' : '?' }}</div>
						<div class="achievement-gallery-meta">
							<span class="achievement-gallery-title">{{ a.unlocked ? a.title : '未解锁成就' }}</span>
							<span class="achievement-gallery-desc">
								{{ a.unlocked ? (a.description || '已解锁') : '达成对应条件后解锁' }}
							</span>
						</div>
					</div>
				</div>
				<div v-else class="gallery-empty">这部作品还没有成就。</div>
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
							<span class="ending-gallery-title">{{ e.unlocked ? e.title : '未解锁结局' }}</span>
							<span class="ending-gallery-desc">
								{{ e.unlocked ? (e.description || '已达成这个结局') : '达成对应条件后解锁' }}
							</span>
						</div>
					</div>
				</div>
				<div v-else class="gallery-empty">这部作品还没有登记结局。</div>
			</template>
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
import { useRoute } from 'vue-router'
import {
	getDialoguesBySceneId,
	getCharactersByProjectId,
	getCharacterAvatars as getCharacterAvatarsApi,
} from '@/api/dialogue'
import {
	getScenes as getProjectScenes,
	listSceneLocks
} from '@/api/scenes'
import { listBranches, getStoryGraph } from '@/api/branch'
import { recordPlayEvent } from '@/api/analytics'
import { listAchievements, checkAchievements } from '@/api/achievement'
import { listPublicReleases } from '@/api/release'
import { listSaves, getSave, putSave, deleteSave } from '@/api/save'
import { listReads, markReads } from '@/api/read'
import { listChapters } from '@/api/chapter'
import { listVariables, listEffects, getProjectMeta, saveProjectMeta } from '@/api/variable'
import { listDirectives } from '@/api/directive'
import { listEndings, unlockEnding } from '@/api/ending'
import { listMusicGallery, unlockMusic } from '@/api/gallery'
import { getProject } from '@/api/project'
import { themeClass } from '@/utils/uiThemes'
import { parseRichText, renderRichHtml } from '@/utils/richText'
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

// 调试器：?debug=1 显示面板，?start=<content_id> 从指定节点开始
const route = useRoute()
const debugMode = ref(route.query.debug === '1')
const debugPanelVisible = ref(false)
const debugJumpId = ref('')
// 条件调试器：变量变化历史 / 条件断点 / 状态快照
const variableHistory = ref([])
const debugBreakpoint = ref({ enabled: false, variable: '', op: '>=', value: 0 })
const debugBreakpointHit = ref('')
const debugSnapshots = ref([])
// 分支覆盖率：本轮试玩走过的节点/分支（仅调试模式记录）
const storyGraph = ref(null)
const visitedContents = ref(new Set())
const visitedEdges = ref(new Set())
const edgeKey = (e) => `${Number(e.source_content_id)}->${Number(e.target_content_id)}`

const coverageStats = computed(() => {
	const nodes = storyGraph.value?.nodes || []
	const edges = storyGraph.value?.edges || []
	const nodeVisited = nodes.filter(n => visitedContents.value.has(Number(n.content_id))).length
	const edgeVisited = edges.filter(e => visitedEdges.value.has(edgeKey(e))).length
	return {
		nodeTotal: nodes.length,
		nodeVisited,
		nodePct: nodes.length ? Math.round(nodeVisited * 100 / nodes.length) : 0,
		edgeTotal: edges.length,
		edgeVisited,
		edgePct: edges.length ? Math.round(edgeVisited * 100 / edges.length) : 0,
	}
})

const uncoveredNodes = computed(() =>
	(storyGraph.value?.nodes || []).filter(n => !visitedContents.value.has(Number(n.content_id)))
)

const uncoveredEdges = computed(() =>
	(storyGraph.value?.edges || []).filter(e => !visitedEdges.value.has(edgeKey(e)))
)

const markVisitedContent = (id) => {
	if (!debugMode.value || !id) return
	const num = Number(id)
	if (visitedContents.value.has(num)) return
	const next = new Set(visitedContents.value)
	next.add(num)
	visitedContents.value = next
}

const markVisitedEdge = (sourceId, targetId) => {
	if (!debugMode.value) return
	const key = `${Number(sourceId)}->${Number(targetId)}`
	if (visitedEdges.value.has(key)) return
	const next = new Set(visitedEdges.value)
	next.add(key)
	visitedEdges.value = next
}

const resetCoverage = () => {
	visitedContents.value = new Set()
	visitedEdges.value = new Set()
	maskCoverageCurrent()
}

// 重置后把当前停留的节点也记为已走，避免一打开就显示未走
const maskCoverageCurrent = () => {
	const id = currentDialogue.value?.content_id
	if (id) markVisitedContent(id)
}

// ===== 条件调试器：变量历史 / 条件断点 / 状态快照 =====
const pushVariableHistory = (label, from, to, reason) => {
	if (!debugMode.value) return
	variableHistory.value = [{
		id: Date.now() + Math.random(),
		at: new Date().toLocaleTimeString(),
		label,
		from,
		to,
		reason,
	}, ...variableHistory.value].slice(0, 40)
}

const checkDebugBreakpoint = () => {
	const bp = debugBreakpoint.value
	if (!debugMode.value || !bp.enabled || !bp.variable) return;
	const v = projectVariables.value.find(x => x.name === bp.variable)
	if (!v) return;
	const current = Number(variableValues.value[v.name] ?? v.initial_value)
	const hit = evalSingleCondition({ variable: bp.variable, op: bp.op, value: bp.value })
	if (!hit) return;
	const text = `#${currentDialogue.value?.content_id || '-'} ${v.label} ${bp.op} ${bp.value}（当前 ${current}）`
	debugBreakpointHit.value = text
	// 命中后自动关闭，避免每句都弹
	debugBreakpoint.value = { ...bp, enabled: false }
	autoPlay.value = false
	ElMessage.warning('条件断点命中：' + text)
}

const debugSnapshotKey = () => `aigc:debugSnapshots:${props.projectId}`

const loadDebugSnapshots = () => {
	if (!debugMode.value) return;
	try {
		const raw = localStorage.getItem(debugSnapshotKey())
		const list = raw ? JSON.parse(raw) : []
		debugSnapshots.value = Array.isArray(list) ? list.slice(0, 5) : []
	} catch (e) {
		debugSnapshots.value = []
	}
}

const persistDebugSnapshots = () => {
	try {
		localStorage.setItem(debugSnapshotKey(), JSON.stringify(debugSnapshots.value))
	} catch (e) { /* ignore */ }
}

const saveDebugSnapshot = () => {
	if (!debugMode.value) return;
	const snap = {
		id: Date.now(),
		time: new Date().toLocaleTimeString(),
		node: currentDialogue.value?.content_id || null,
		sceneIndex: currentSceneIndex.value,
		dialogueIndex: currentDialogueIndex.value,
		variables: { ...variableValues.value },
		visited: [...visitedContents.value],
	}
	debugSnapshots.value = [snap, ...debugSnapshots.value].slice(0, 5)
	persistDebugSnapshots()
	ElMessage.success('已保存状态快照')
}

const restoreDebugSnapshot = (snap) => {
	currentSceneIndex.value = snap.sceneIndex
	currentDialogueIndex.value = snap.dialogueIndex
	variableValues.value = { ...(snap.variables || {}) }
	visitedContents.value = new Set(snap.visited || [])
	debugPanelVisible.value = true
	nextTick(() => startTyping())
	ElMessage.success('已恢复快照')
}

const deleteDebugSnapshot = (id) => {
	debugSnapshots.value = debugSnapshots.value.filter(s => s.id !== id)
	persistDebugSnapshots()
}

// ===== 试玩埋点（调试模式不记录，避免作者自己测试污染数据）=====
const telemetrySessionId = (() => {
	try {
		if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
	} catch (_) { /* ignore */ }
	return 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
})()
let telemetryStartLogged = false
let lastSceneLogId = 0
let lastSceneLogAt = 0

const logPlayEvent = (type, extra = {}) => {
	if (debugMode.value || loading.value || error.value) return
	recordPlayEvent(Number(props.projectId), {
		session_id: telemetrySessionId,
		event_type: type,
		...extra,
	}).catch(() => { /* 埋点失败不影响试玩 */ })
}

const logCurrentScene = () => {
	const sid = Number(currentScene.value?.scene_id || 0)
	if (!sid) return
	const now = Date.now()
	if (sid === lastSceneLogId && now - lastSceneLogAt < 500) return
	lastSceneLogId = sid
	lastSceneLogAt = now
	logPlayEvent('scene_enter', { scene_id: sid })
}

// 周目：二周目继承上一周目的变量值，方便作者做「二周目解锁」
const playthroughKey = () => `aigc:playthrough:${props.projectId}`
const playthrough = ref(1)
try {
	const stored = Number(localStorage.getItem(playthroughKey()))
	if (Number.isFinite(stored) && stored > 0) playthrough.value = Math.floor(stored)
} catch (_) { /* ignore */ }

// 作品 UI 皮肤（作者在创作页「外观」里选择）
const playTheme = ref('classic')

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
// 空场景（没有台词/选项节点）直接跳过，避免试玩停在只有背景的画面上
const sceneHasDialogues = (sceneId) => (allDialogues.value[sceneId] || []).length > 0;

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
// 变量变化提示（好感度 +5 / 线索 +1 之类，短暂浮层）
const variableNotices = ref([]);
const variableNoticeTimers = new Set();
let variableNoticeSeq = 0;
// 跨周目变量：服务端保存的 persist 变量值（重新开始/下一周目/重进作品时沿用）
const metaVariables = ref({});
let metaSaveTimer = null;

const clearVariableNotices = () => {
	variableNoticeTimers.forEach((timer) => clearTimeout(timer));
	variableNoticeTimers.clear();
	variableNotices.value = [];
};

const pushVariableNotices = (items) => {
	if (!items.length || !playerSettings.value.showVariableNotice) return;
	for (const item of items) {
		const id = ++variableNoticeSeq;
		variableNotices.value.push({ id, label: item.label, delta: item.delta });
		const timer = setTimeout(() => {
			variableNotices.value = variableNotices.value.filter((n) => n.id !== id);
			variableNoticeTimers.delete(timer);
		}, 2600);
		variableNoticeTimers.add(timer);
	}
	// 单节点变量太多时只保留最近几条，避免浮层堆满画面
	if (variableNotices.value.length > 8) {
		variableNotices.value = variableNotices.value.slice(-8);
	}
};
// 好感度面板：绑定角色的变量单独展示，其余变量仍走属性列表
const affinityVariables = computed(() =>
	projectVariables.value.filter((v) => !!v.character_id)
);
const otherVariables = computed(() =>
	projectVariables.value.filter((v) => !v.character_id)
);
const characterNameOf = (id) => {
	const c = characters.value.find((x) => x.character_id === id);
	return c ? c.name : '未命名角色';
};
const affinityPercent = (v) => {
	const max = v.max_value == null ? 100 : Number(v.max_value);
	const min = v.min_value == null ? 0 : Number(v.min_value);
	const val = Number(variableValues.value[v.name] ?? v.initial_value ?? 0);
	if (max === min) return val >= max ? '100%' : '0%';
	const pct = ((val - min) / (max - min)) * 100;
	return Math.max(0, Math.min(100, pct)) + '%';
};
// 场景播放条件（剧情锁）：scene_id → 条件组
const sceneLocks = ref({});
const statusDialogVisible = ref(false);
const lastEffectKey = ref('');

// 结局
const endings = ref([]);
const triggeredEndings = ref(new Set());
const endingDialogVisible = ref(false);
const currentEnding = ref(null);

// 成就
const achievements = ref([]);
let achievementTimer = null;
let achievementRunning = false;
let achievementFinished = false;

const unlockedAchievementCount = computed(() =>
	achievements.value.filter(a => a.unlocked).length
);

// 鉴赏 / 收藏：CG、BGM、结局
const galleryDialogVisible = ref(false);
const changelogVisible = ref(false);
const publicReleases = ref([]);
// 章节快捷跳转 / 路线图鉴
const chaptersVisible = ref(false);
const chapterData = ref({ chapters: [], scene_map: {} });

const loadChapterData = async () => {
	try {
		const data = await listChapters(Number(props.projectId));
		chapterData.value = {
			chapters: (data && data.chapters) || [],
			scene_map: (data && data.scene_map) || {},
		};
	} catch (e) {
		chapterData.value = { chapters: [], scene_map: {} };
	}
};

// 每个章节的场景 / 节点 / 已读进度；第一个章节与读过的章节可跳转
const chapterRoute = computed(() => {
	const chapters = chapterData.value.chapters || [];
	const sceneMap = chapterData.value.scene_map || {};
	return chapters.map((c, index) => {
		const sceneIndexes = scenes.value
			.map((s, idx) => ({ s, idx }))
			.filter(({ s }) => sceneMap[String(s.scene_id)] === c.chapter_id)
			.map(({ idx }) => idx);
		let total = 0;
		let read = 0;
		for (const idx of sceneIndexes) {
			const list = allDialogues.value[scenes.value[idx].scene_id] || [];
			total += list.length;
			for (const node of list) {
				if (readSet.value.has(Number(node.content_id))) read += 1;
			}
		}
		return {
			chapter_id: c.chapter_id,
			title: c.title,
			order_num: c.order_num ?? index + 1,
			sceneIndexes,
			total,
			read,
			unlocked: index === 0 || read > 0,
		};
	});
});

const routeStats = computed(() => {
	let total = 0;
	let read = 0;
	for (const list of Object.values(allDialogues.value)) {
		for (const node of list || []) {
			total += 1;
			if (readSet.value.has(Number(node.content_id))) read += 1;
		}
	}
	return {
		total,
		read,
		endingUnlocked: endings.value.filter((e) => e.unlocked).length,
	};
});

// 跳到章节内第一个可播放场景的第一条可播放台词
const jumpToChapter = (chapter) => {
	if (!chapter.unlocked) {
		ElMessage.warning('该章节还未读过，先按顺序阅读解锁');
		return;
	}
	const sceneIdx = chapter.sceneIndexes.find((idx) => (
		scenePlayable(scenes.value[idx].scene_id)
		&& (allDialogues.value[scenes.value[idx].scene_id] || []).length
	));
	if (sceneIdx === undefined) {
		ElMessage.warning('该章节暂时没有可播放的场景');
		return;
	}
	const di = firstPlayableNodeIndex(scenes.value[sceneIdx].scene_id);
	currentSceneIndex.value = sceneIdx;
	currentDialogueIndex.value = di;
	chaptersVisible.value = false;
	nextTick(() => startPreview());
	ElMessage.success(`已跳转到「${chapter.title}」`);
};
const galleryTab = ref('cg');
const galleryTabs = [
	{ key: 'cg', label: 'CG 鉴赏' },
	{ key: 'bgm', label: 'BGM 鉴赏' },
	{ key: 'ending', label: '结局收藏' },
	{ key: 'achievement', label: '成就' },
];
const galleryItems = ref([]);
const galleryTotal = ref(0);
const galleryUnlocked = ref(0);
const musicItems = ref([]);
const musicTotal = ref(0);
const musicUnlocked = ref(0);
const musicLoading = ref(false);

const galleryCountText = computed(() => {
	if (galleryTab.value === 'cg') return `已解锁 ${galleryUnlocked.value} / ${galleryTotal.value}`;
	if (galleryTab.value === 'bgm') return `已解锁 ${musicUnlocked.value} / ${musicTotal.value}`;
	if (galleryTab.value === 'achievement') {
		return `已解锁 ${unlockedAchievementCount.value} / ${achievements.value.length}`;
	}
	const unlocked = endings.value.filter((e) => e.unlocked).length;
	return `已达成 ${unlocked} / ${endings.value.length}`;
});

const loadCgGallery = async () => {
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

const loadMusicGallery = async () => {
	musicLoading.value = true;
	try {
		const data = await listMusicGallery(Number(props.projectId));
		musicItems.value = data?.items || [];
		musicTotal.value = data?.total || 0;
		musicUnlocked.value = data?.unlocked_count || 0;
	} catch (e) {
		musicItems.value = [];
		musicTotal.value = 0;
		musicUnlocked.value = 0;
	} finally {
		musicLoading.value = false;
	}
};

const switchGalleryTab = (key) => {
	galleryTab.value = key;
	if (key === 'cg') loadCgGallery();
	else if (key === 'bgm') loadMusicGallery();
	else if (key === 'achievement') loadPlayerAchievements();
	else if (!endings.value.length) loadEndings();
};

const openGallery = async () => {
	galleryDialogVisible.value = true;
	await switchGalleryTab(galleryTab.value);
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
	boxStyle: 'classic', // classic 经典底栏 / bubble 气泡对话
	fontSize: 18,      // 对话字号 14-24
	lineHeight: 1.6,   // 对话行距 1.3-2.2
	showVariableNotice: true, // 变量变化时显示「好感度 +5」浮层
	voiceEnabled: true, // 自动播放台词语音
	spriteMotion: true, // 立绘轻微呼吸动态
};
const playerSettings = ref({ ...DEFAULT_SETTINGS });
const settingsVisible = ref(false);
const displayedText = ref('');
const dialogueVoice = ref(null);
const isTyping = ref(false);

// 对白富文本：纯文本用于逐字显示，HTML 用于渲染颜色/加粗/注音
const richContent = computed(() => parseRichText(currentDialogue.value?.content_text || ''));
const displayedHtml = computed(() => renderRichHtml(richContent.value, displayedText.value.length));
let typingTimer = null;
let typeIndex = 0;

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

// 预览立绘：旁白沿用本场景最近一位说话的角色，直到出现新角色
const previewSpeaker = computed(() => {
	const list = currentSceneDialogues.value || [];
	for (let i = Math.min(currentDialogueIndex.value, list.length - 1); i >= 0; i--) {
		const d = list[i];
		if (d && d.character_id) return d;
	}
	return null;
});

const previewAvatarSrc = computed(() => {
	const d = previewSpeaker.value;
	if (!d) return '';
	return getAvatarUrl(d.avatar_id) || defaultAvatarOf(d.character_id);
});

// 当前「选择」节点的分支选项；条件未满足时保留按钮但标记为锁定
const currentChoices = computed(() => {
	const d = currentDialogue.value;
	if (!d || d.content_type !== '选择') return [];
	return (branches.value || [])
		.filter(b => b.source_content_id === d.content_id)
		.map(b => ({ ...b, locked: !evalCondition(b.conditions) }));
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

		// 作品皮肤：作者可在创作页「外观」里切换
		try {
			const projectInfo = await getProject(projectIdNum);
			playTheme.value = projectInfo.ui_theme || 'classic';
			projectCoverUrl.value = projectInfo.cover_url || '';
		} catch (e) {
			playTheme.value = 'classic';
		}

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

		// 调试模式：读取完整拓扑，用于面板里的覆盖率统计
		if (debugMode.value) {
			try {
				storyGraph.value = await getStoryGraph(projectIdNum, false);
			} catch (e) {
				console.warn('读取剧情图失败，覆盖率不可用:', e);
				storyGraph.value = null;
			}
		}

		// 已读记录：跳过已读功能依赖它
		await loadReads();

		// 章节（章节快捷跳转 / 路线图鉴）
		await loadChapterData();

		// 调试状态快照（仅调试模式）
		if (debugMode.value) loadDebugSnapshots();

		// 项目变量与节点数值变化
		await loadVariableSystem();

		// 结局定义
		await loadEndings();

		// 成就定义与本人解锁状态
		await loadPlayerAchievements();

		// 更新记录（公开作品）
		await loadPublicReleases();

		// 调试：从 ?start=<content_id> 指定节点开始
		const startId = Number(route.query.start || 0);
		if (startId) {
			let found = false;
			for (let si = 0; si < scenes.value.length; si++) {
				const list = allDialogues.value[scenes.value[si].scene_id] || [];
				const di = list.findIndex(d => Number(d.content_id) === startId);
				if (di >= 0) {
					currentSceneIndex.value = si;
					currentDialogueIndex.value = di;
					found = true;
					break;
				}
			}
			if (!found) ElMessage.warning(`找不到起始节点 #${startId}，将从开头播放`);
		}
		
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
			// 试玩数据：记录开局与首个到达场景（调试模式自动跳过）
			if (!telemetryStartLogged) {
				telemetryStartLogged = true;
				logPlayEvent('start');
			}
			nextTick(() => logCurrentScene());
			scheduleAchievementCheck();
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
	// 起始场景若被剧情锁挡住或没有可播放台词，自动跳到下一个可播放场景
	let idx = currentSceneIndex.value;
	if (scenes.value[idx] && (
		!scenePlayable(scenes.value[idx].scene_id) ||
		!sceneHasPlayableDialogues(scenes.value[idx].scene_id)
	)) {
		while (idx < scenes.value.length && (
			!scenePlayable(scenes.value[idx].scene_id) ||
			!sceneHasPlayableDialogues(scenes.value[idx].scene_id)
		)) idx++;
		if (idx < scenes.value.length) {
			currentSceneIndex.value = idx;
			currentDialogueIndex.value = 0;
		}
	}

	// 当前台词条件不满足时，从当前位置向后找第一条可播放台词
	const list = allDialogues.value[scenes.value[idx]?.scene_id] || [];
	if (list.length && !nodePlayable(list[currentDialogueIndex.value])) {
		let di = firstPlayableNodeIndex(scenes.value[idx].scene_id, currentDialogueIndex.value);
		if (di >= list.length) di = firstPlayableNodeIndex(scenes.value[idx].scene_id, 0);
		if (di < list.length) currentDialogueIndex.value = di;
	}

	isPlaying.value = true;
	playBackgroundMusic();
	startTyping();
};

// ==================== 音频混音：BGM 淡入 + 语音闪避 ====================
// 用 setInterval + Date.now() 计时而非 requestAnimationFrame：
// 后台标签页 rAF 会被完全暂停，淡入会卡在中间音量（甚至 0，音频仍在播）。
// setInterval 后台虽被节流，但每个 tick 按真实经过时间推进，回来后会直接补到终值。
let bgmFadeTimer = null;
let bgmFadeTarget = 0;
let bgmDuckActive = false;

const cancelBgmFade = () => {
	if (bgmFadeTimer) clearInterval(bgmFadeTimer);
	bgmFadeTimer = null;
};

// 目标音量：用户设置 × 闪避系数（语音播放时压到 35%）
const bgmTargetVolume = () => (
	(playerSettings.value.bgmVolume / 100) * (bgmDuckActive ? 0.35 : 1)
);

const fadeBgmTo = (target, duration = 600) => {
	const audio = backgroundMusic.value;
	if (!audio) return;
	cancelBgmFade();
	const from = Number(audio.volume) || 0;
	const to = Math.max(0, Math.min(1, target));
	bgmFadeTarget = to;
	if (duration <= 0 || Math.abs(to - from) < 0.001) {
		audio.volume = to;
		return;
	}
	const startAt = Date.now();
	const tick = () => {
		const t = Math.min(1, (Date.now() - startAt) / duration);
		audio.volume = from + (to - from) * t;
		if (t >= 1) {
			cancelBgmFade();
			audio.volume = to;   // 终值兜底
		}
	};
	bgmFadeTimer = setInterval(tick, 40);
	tick();  // 立即走一步，避免等第一个 interval
};

// 标签页重新可见时，若淡入还没结束就直接补到终值，不依赖被暂停的定时器
const onBgmVisibilityChange = () => {
	if (document.visibilityState !== 'visible') return;
	const audio = backgroundMusic.value;
	if (audio && bgmFadeTimer) {
		cancelBgmFade();
		audio.volume = bgmFadeTarget;
	}
};

// 播放背景音乐（同一首持续播放时只微调音量，不重头播放）
const playBackgroundMusic = () => {
	const audio = backgroundMusic.value;
	if (!audio || !currentScene.value.music_url) return;
	const target = bgmTargetVolume();
	if (!audio.paused) {
		fadeBgmTo(target, 400);
		return;
	}
	audio.volume = 0;
	audio.play().then(() => {
		fadeBgmTo(target, 900);
	}).catch(e => {
		console.log('背景音乐自动播放失败，需要用户交互后才能播放:', e);
	});
};

// 停止背景音乐
const stopBackgroundMusic = () => {
	cancelBgmFade();
	if (backgroundMusic.value) {
		backgroundMusic.value.pause();
		backgroundMusic.value.currentTime = 0;
	}
};

// 语音播放期间压低 BGM，语音结束/暂停后恢复
const setBgmDucking = (active) => {
	if (bgmDuckActive === active) return;
	bgmDuckActive = active;
	const audio = backgroundMusic.value;
	if (audio && !audio.paused) fadeBgmTo(bgmTargetVolume(), active ? 250 : 450);
};

const onVoicePlay = () => setBgmDucking(true);
const onVoiceEnded = () => setBgmDucking(false);

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
	const bgm = backgroundMusic.value;
	if (bgm) {
		if (bgm.paused) bgm.volume = bgmTargetVolume();
		else fadeBgmTo(bgmTargetVolume(), 200);
	}
	document.querySelectorAll('.dialogue-display audio').forEach(audio => {
		audio.volume = playerSettings.value.voiceVolume / 100;
	});
};

// 重播本句语音（语音总开关关闭时按钮不显示）
const replayVoice = () => {
	const audio = dialogueVoice.value;
	if (!audio) return;
	try {
		audio.currentTime = 0;
		audio.volume = playerSettings.value.voiceVolume / 100;
		audio.play().catch(() => { /* 浏览器拦截时忽略 */ });
	} catch (_) { /* ignore */ }
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
		coverage: {
			...coverageStats.value,
			visitedNodes: [...visitedContents.value],
			visitedEdges: [...visitedEdges.value],
		},
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
// 变量初始值：persist 变量优先沿用服务端保存的跨周目值
const initialValueOf = (v) => {
	if (v.persist && metaVariables.value[v.name] != null) {
		return clampVariable(v, metaVariables.value[v.name]);
	}
	return v.initial_value;
};

const initVariableValues = () => {
	const next = { ...variableValues.value };
	for (const v of projectVariables.value) {
		if (!(v.name in next)) next[v.name] = initialValueOf(v);
	}
	variableValues.value = next;
};

// 只收集 persist 变量的当前值，交给后端按用户/项目保存
const snapshotPersistVariables = () => {
	const out = {};
	for (const v of projectVariables.value) {
		if (!v.persist) continue;
		out[v.name] = Number(variableValues.value[v.name] ?? v.initial_value);
	}
	return out;
};

// 本地同步 + 防抖写回服务端（变量频繁变化时只在停止变化后发一次）
const syncProjectMeta = (immediate = false) => {
	const snapshot = snapshotPersistVariables();
	if (!Object.keys(snapshot).length) return;
	metaVariables.value = { ...metaVariables.value, ...snapshot };
	if (metaSaveTimer) {
		clearTimeout(metaSaveTimer);
		metaSaveTimer = null;
	}
	const push = () => {
		saveProjectMeta(Number(props.projectId), snapshot).catch((e) => {
			console.warn('保存跨周目变量失败:', e);
		});
	};
	if (immediate) push();
	else metaSaveTimer = setTimeout(() => {
		metaSaveTimer = null;
		push();
	}, 500);
};

const loadProjectMeta = async () => {
	try {
		const meta = await getProjectMeta(Number(props.projectId));
		metaVariables.value = meta.variables || {};
	} catch (e) {
		metaVariables.value = {};
	}
};

const loadVariableSystem = async () => {
	try {
		projectVariables.value = await listVariables(Number(props.projectId));
		variableEffects.value = await listEffects(Number(props.projectId));
		sceneLocks.value = await listSceneLocks(Number(props.projectId)) || {};
		await loadProjectMeta();
		initVariableValues();
	} catch (e) {
		console.warn('读取项目变量失败:', e);
		projectVariables.value = [];
		variableEffects.value = [];
		sceneLocks.value = {};
	}
};

const clampVariable = (v, value) => {
	let n = Number(value) || 0;
	if (v.min_value !== null && v.min_value !== undefined) n = Math.max(Number(v.min_value), n);
	if (v.max_value !== null && v.max_value !== undefined) n = Math.min(Number(v.max_value), n);
	return n;
};

const evalSingleCondition = (cond) => {
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

// 兼容单条件 {variable,op,value} 与条件组 {mode:'and'|'or', items:[...]}
const evalCondition = (cond) => {
	if (!cond || typeof cond !== 'object') return true;
	if (Array.isArray(cond.items)) {
		const items = cond.items.filter(c => c && c.variable);
		if (!items.length) return true;
		return cond.mode === 'or'
			? items.some(evalSingleCondition)
			: items.every(evalSingleCondition);
	}
	return evalSingleCondition(cond);
};

// 场景播放条件（剧情锁）
const scenePlayable = (sceneId) => evalCondition(sceneLocks.value[String(sceneId)] || null);

// 台词级显示条件：未配置或条件满足时才会播放
const nodePlayable = (node) => evalCondition(node?.branch_condition || null);

// 从 from 开始找下一条可播放台词；返回列表长度表示本场景没有更多可播放内容
const firstPlayableNodeIndex = (sceneId, from = 0) => {
	const list = allDialogues.value[sceneId] || [];
	for (let i = Math.max(0, from); i < list.length; i++) {
		if (nodePlayable(list[i])) return i;
	}
	return list.length;
};

// 场景内至少有一条条件满足的台词
const sceneHasPlayableDialogues = (sceneId) => (
	firstPlayableNodeIndex(sceneId) < (allDialogues.value[sceneId] || []).length
);

// 把条件对象描述成「林瑶好感度 ≥ 5 且 线索数 ≥ 1」，用于锁定提示
const conditionText = (cond) => {
	if (!cond || typeof cond !== 'object') return '';
	const items = Array.isArray(cond.items)
		? cond.items.filter(c => c && c.variable)
		: (cond.variable ? [cond] : []);
	if (!items.length) return '';
	const opLabels = { '>': '>', '>=': '≥', '<': '<', '<=': '≤', '==': '=', '!=': '≠' };
	const parts = items.map((c) => {
		const v = projectVariables.value.find(x => x.name === c.variable);
		return `${v?.label || c.variable} ${opLabels[c.op] || c.op} ${c.value}`;
	});
	return parts.join(cond.mode === 'or' ? ' 或 ' : ' 且 ');
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
	const notices = [];
	let touchedPersist = false;
	for (const e of list) {
		const v = projectVariables.value.find(x => x.variable_id === e.variable_id);
		if (!v) continue;
		const current = Number(next[v.name] ?? v.initial_value);
		const after = clampVariable(v, current + Number(e.delta));
		const delta = after - current;
		if (delta !== 0) {
			notices.push({ label: v.label || v.name, delta });
			pushVariableHistory(v.label || v.name, current, after, `节点 #${d.content_id}`);
		}
		next[v.name] = after;
		if (v.persist) touchedPersist = true;
	}
	variableValues.value = next;
	if (touchedPersist) syncProjectMeta();
	if (notices.length) pushVariableNotices(notices);
	checkDebugBreakpoint();
	scheduleAchievementCheck();
};

const resetVariables = () => {
	const next = {};
	const changed = [];
	for (const v of projectVariables.value) {
		next[v.name] = initialValueOf(v);
		const before = Number(variableValues.value[v.name] ?? v.initial_value);
		if (before !== next[v.name]) changed.push([v, before, next[v.name]]);
	}
	variableValues.value = next;
	lastEffectKey.value = '';
	for (const [v, before, after] of changed) {
		pushVariableHistory(v.label || v.name, before, after, '重置');
	}
	checkDebugBreakpoint();
};

/* ===== 调试器：变量热改 / 任意节点跳转 ===== */
const setDebugVar = (v, e) => {
	const raw = Number(e?.target?.value);
	if (!Number.isFinite(raw)) return;
	const before = Number(variableValues.value[v.name] ?? v.initial_value);
	const after = clampVariable(v, raw);
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
			if (autoTimer) {
				clearTimeout(autoTimer);
				autoTimer = null;
			}
			currentSceneIndex.value = si;
			currentDialogueIndex.value = di;
			showDialogueBox.value = true;
			nextTick(() => startTyping());
			return;
		}
	}
	ElMessage.warning(`找不到节点 #${id}`);
};

// 覆盖率列表点节点：直接跳过去，顺便把它标记为已走
const debugJumpTo = (contentId) => {
	debugJumpId.value = String(contentId);
	debugJump();
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

// ==================== 成就 ====================
const loadPlayerAchievements = async () => {
	try {
		achievements.value = await listAchievements(Number(props.projectId));
	} catch (e) {
		console.warn('读取成就失败:', e);
		achievements.value = [];
	}
};

// 玩家侧更新日志（公开作品才会返回）
const loadPublicReleases = async () => {
	try {
		publicReleases.value = await listPublicReleases(Number(props.projectId));
	} catch (e) {
		publicReleases.value = [];
	}
};

const runAchievementCheck = async () => {
	if (debugMode.value || achievementRunning || !achievements.value.length) return;
	achievementRunning = true;
	try {
		const res = await checkAchievements(Number(props.projectId), {
			variables: variableValues.value,
			endings: [...triggeredEndings.value],
			finished: achievementFinished,
		});
		if (res?.achievements) achievements.value = res.achievements;
		const fresh = res?.newly_unlocked || [];
		for (const a of fresh) {
			ElMessage.success(`成就解锁：${a.title}`);
		}
	} catch (e) {
		/* 成就检查失败不影响试玩 */
	} finally {
		achievementRunning = false;
	}
};

const scheduleAchievementCheck = (finished = false) => {
	if (debugMode.value) return;
	if (finished) achievementFinished = true;
	if (achievementTimer) clearTimeout(achievementTimer);
	achievementTimer = setTimeout(() => {
		achievementTimer = null;
		runAchievementCheck();
	}, 900);
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
	logPlayEvent('ending', {
		ending_id: Number(ending.ending_id) || null,
		content_id: Number(currentDialogue.value?.content_id) || null,
		scene_id: Number(currentScene.value?.scene_id) || null,
	});
	scheduleAchievementCheck();
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
	achievementFinished = false;
	resetVariables();
	nextTick(() => startPreview());
};

// 二周目：从头播放，但保留上一周目结束时的变量值
const startNextPlaythrough = () => {
	stopBackgroundMusic();
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}
	endingDialogVisible.value = false;
	currentSceneIndex.value = 0;
	currentDialogueIndex.value = 0;
	historyDialogues.value = [];
	triggeredEndings.value = new Set();
	achievementFinished = false;
	clearVariableNotices();
	lastEffectKey.value = '';
	// 进入下一周目前，把本周目结束时的跨周目变量写回服务端
	syncProjectMeta(true);
	playthrough.value += 1;
	try {
		localStorage.setItem(playthroughKey(), String(playthrough.value));
	} catch (_) { /* ignore */ }
	nextTick(() => startPreview());
	ElMessage.success(`已进入第 ${playthrough.value} 周目，变量沿用上一周目`);
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
// 关闭语音时立刻恢复 BGM 音量
watch(() => playerSettings.value.voiceEnabled, (on) => {
	if (!on) setBgmDucking(false);
});

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
const stageAvatars = ref({ left: null, center: null, right: null });
const bgFromDirective = ref('');
const bgTransition = ref('fade');
const bgDuration = ref(400);
const fgFromDirective = ref('');
const directivesByContent = ref({});
// 节点级舞台层可见性（背景/前景/对话框），由 stage 指令控制
const stageLayerVisible = ref({ background: true, foreground: true, dialogue: true });

const hasStageAvatars = computed(() =>
	stagePositions.some(p => !!stageAvatars.value[p])
);

const stageBackground = computed(() => {
	if (stageLayerVisible.value.background === false) return '';
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
	stageAvatars.value = { left: null, center: null, right: null };
	bgFromDirective.value = '';
	bgTransition.value = 'fade';
	bgDuration.value = 400;
	fgFromDirective.value = '';
	stageLayerVisible.value = { background: true, foreground: true, dialogue: true };
	clearWait();
	clearEffect();
};

/* ===== 画面效果（effect）===== */
const activeEffect = ref(null);
let effectTimer = null;

const clearEffect = () => {
	if (effectTimer) {
		clearTimeout(effectTimer);
		effectTimer = null;
	}
	activeEffect.value = null;
};

const triggerEffect = (p) => {
	clearEffect();
	if (!p) return;
	const duration = Math.max(100, Number(p.duration_ms) || (p.effect === 'weather' ? 3000 : 400));
	nextTick(() => {
		activeEffect.value = { ...p, duration_ms: duration, key: Date.now() };
		effectTimer = setTimeout(() => {
			effectTimer = null;
			activeEffect.value = null;
		}, duration);
	});
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

/* ===== 背景淡入淡出 / 硬切 / 黑场 ===== */
const bgShown = ref('');
const bgFading = ref(false);
const bgBlackout = ref(false);
let bgSwapTimer = null;

const swapBackground = (url) => {
	if (bgSwapTimer) {
		clearTimeout(bgSwapTimer);
		bgSwapTimer = null;
	}
	if (!url || url === bgShown.value) return;

	const transition = bgTransition.value || 'fade';
	const duration = Math.max(100, Number(bgDuration.value) || 400);

	// 硬切：直接换图，不做任何过渡
	if (transition === 'cut') {
		bgFading.value = false;
		bgBlackout.value = false;
		bgShown.value = url;
		return;
	}

	// 先淡出旧图（黑场则同时压黑），换完图并解码成功后再淡入
	bgFading.value = true;
	if (transition === 'black') bgBlackout.value = true;
	bgSwapTimer = setTimeout(() => {
		bgShown.value = url;
		const img = new Image();
		const done = () => {
			bgFading.value = false;
			bgBlackout.value = false;
			bgSwapTimer = null;
		};
		img.onload = done;
		img.onerror = done;
		img.src = url;
	}, transition === 'black' ? Math.floor(duration / 2) : 260);
};

watch(stageBackground, (url) => {
	// 背景层被 stage 指令隐藏时，直接清空当前背景，避免残留
	if (!url) {
		if (bgSwapTimer) {
			clearTimeout(bgSwapTimer);
			bgSwapTimer = null;
		}
		bgFading.value = false;
		bgBlackout.value = false;
		bgShown.value = '';
		return;
	}
	if (!bgShown.value) {
		bgShown.value = url;
		return;
	}
	swapBackground(url);
}, { immediate: true });

/* ===== 前景图层 ===== */
const fgShown = ref('');
const fgFading = ref(false);
let fgSwapTimer = null;

watch(
	() => (fgFromDirective.value ? BASE_URL + fgFromDirective.value : ''),
	(url) => {
		if (fgSwapTimer) {
			clearTimeout(fgSwapTimer);
			fgSwapTimer = null;
		}
		if (!url) {
			fgShown.value = '';
			fgFading.value = false;
			return;
		}
		fgFading.value = true;
		fgSwapTimer = setTimeout(() => {
			fgShown.value = url;
			const img = new Image();
			const done = () => {
				fgFading.value = false;
				fgSwapTimer = null;
			};
			img.onload = done;
			img.onerror = done;
			img.src = url;
		}, 180);
	}
);

const applyDirectives = (dialogue) => {
	if (!dialogue) return;
	const list = directivesByContent.value[dialogue.content_id] || [];
	if (!list.length) return;

	const next = { ...stageAvatars.value };
	let waitMs = 0;
	let lastEffect = null;
	for (const d of list) {
		const p = d.payload || {};
		if (d.directive_type === 'avatar') {
			const pos = p.position || 'center';
			if (p.action === 'hide') {
				next[pos] = null;
			} else {
				const src = getAvatarUrl(p.avatar_id) || defaultAvatarOf(p.character_id);
				if (src) {
					const x = Number(p.x) || 0;
					const y = Number(p.y) || 0;
					const scale = Number(p.scale) || 1;
					const opacity = p.opacity === undefined || p.opacity === null ? 1 : Number(p.opacity);
					const rotate = Number(p.rotate) || 0;
					const coord = p.coord === 'stage' ? 'stage' : 'sprite';
					const visible = p.visible !== false;
					const zIndex = 10 + (Number(p.z) || 0);
					let style;
					let boxStyle;
					if (coord === 'stage') {
						boxStyle = {
							left: `${x}%`,
							top: `${y}%`,
							bottom: 'auto',
							right: 'auto',
							transform: 'translate(-50%, -100%)',
							zIndex
						};
						style = {
							transform: `scale(${scale}) rotate(${rotate}deg)`,
							opacity
						};
					} else {
						boxStyle = { zIndex };
						style = {
							transform: `translate(${x}%, ${y}%) scale(${scale}) rotate(${rotate}deg)`,
							opacity
						};
					}
					if (!visible) boxStyle.display = 'none';
					next[pos] = { src, style, boxStyle };
				}
			}
		} else if (d.directive_type === 'background') {
			if (p.layer === 'foreground') {
				fgFromDirective.value = p.url || '';
			} else {
				bgTransition.value = p.transition || 'fade';
				bgDuration.value = Number(p.duration_ms) || 400;
				bgFromDirective.value = p.url || '';
			}
		} else if (d.directive_type === 'music') {
			if (p.action === 'stop') {
				if (backgroundMusic.value) {
					backgroundMusic.value.pause();
					backgroundMusic.value.currentTime = 0;
				}
			} else if (p.url && backgroundMusic.value) {
				backgroundMusic.value.src = BASE_URL + p.url;
				backgroundMusic.value.volume = 0;
				backgroundMusic.value.play().then(() => {
					fadeBgmTo(bgmTargetVolume(), 600);
				}).catch(() => {});
			}
		} else if (d.directive_type === 'sound' && p.url) {
			const a = new Audio(BASE_URL + p.url);
			a.volume = 1;
			a.play().catch(() => {});
		} else if (d.directive_type === 'wait') {
			waitMs += Math.max(0, Number(p.ms) || 0);
		} else if (d.directive_type === 'effect') {
			lastEffect = p;
		} else if (d.directive_type === 'stage') {
			// 节点级舞台层显隐：背景 / 前景 / 对话框
			const vis = { ...stageLayerVisible.value };
			if (typeof p.background === 'boolean') vis.background = p.background;
			if (typeof p.foreground === 'boolean') vis.foreground = p.foreground;
			if (typeof p.dialogue === 'boolean') vis.dialogue = p.dialogue;
			stageLayerVisible.value = vis;
		}
	}
	stageAvatars.value = next;
	if (lastEffect) triggerEffect(lastEffect);
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

// 跳到指定剧情节点；返回 ok / locked / missing
const jumpToDialogue = (targetId) => {
	for (let si = 0; si < scenes.value.length; si++) {
		const list = allDialogues.value[scenes.value[si].scene_id] || [];
		const di = list.findIndex(d => Number(d.content_id) === Number(targetId));
		if (di >= 0) {
			if (!scenePlayable(scenes.value[si].scene_id)) return 'locked';
			if (!debugMode.value && !nodePlayable(list[di])) return 'locked';
			currentSceneIndex.value = si;
			currentDialogueIndex.value = di;
			showDialogueBox.value = true;
			nextTick(() => {
				if (isPlaying.value) {
					playBackgroundMusic();
					if (autoPlay.value) autoAdvanceDialogue();
				}
			});
			return 'ok';
		}
	}
	return 'missing';
};

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

	// 非「选择」节点若配置了自动跳转，播完本节点后直接跳过去
	const cur = currentDialogue.value;
	if (cur && cur.content_type !== '选择') {
		const edge = (branches.value || []).find(b =>
			Number(b.source_content_id) === Number(cur.content_id) &&
			!(b.choice_text || '').trim() &&
			evalCondition(b.conditions)
		);
		if (edge) {
			markVisitedEdge(cur.content_id, edge.target_content_id);
			historyDialogues.value.push({
				...cur,
				scene_id: currentScene.value.scene_id,
				scene_title: currentScene.value.title || '',
			});
			const result = jumpToDialogue(edge.target_content_id);
			if (result === 'ok') {
				showDialogueBox.value = true;
				return;
			}
			if (result === 'locked') {
				ElMessage.warning('跳转目标场景尚未解锁，改为顺序播放');
			}
		}
	}

	if (currentDialogueIndex.value < currentSceneDialogues.value.length) {
		// 将当前对话添加到历史记录中
		if (currentDialogue.value) {
				historyDialogues.value.push({
					...currentDialogue.value,
					scene_id: currentScene.value.scene_id,
					scene_title: currentScene.value.title || '',
				});
			}
			
			// 跳过条件不满足的台词，直接推进到下一条可播放内容
			const list = currentSceneDialogues.value;
			let nextIndex = currentDialogueIndex.value + 1;
			while (nextIndex < list.length && !nodePlayable(list[nextIndex])) nextIndex++;
			currentDialogueIndex.value = nextIndex;
			
			// 本场景没有更多可播放台词，进入下一场景
			if (nextIndex >= list.length) {
				nextScene();
			}
		}
	showDialogueBox.value = true;
};

// 选择分支：跳到目标节点所在的场景/位置
const selectBranch = (branch) => {
	if (!branch) return;
	if (branch.locked) {
		ElMessage.warning('条件未满足：' + conditionText(branch.conditions));
		return;
	}
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
		markVisitedEdge(currentDialogue.value.content_id, branch.target_content_id);
		logPlayEvent('choice', {
			scene_id: Number(currentScene.value.scene_id) || null,
			content_id: Number(currentDialogue.value.content_id) || null,
			path_id: Number(branch.path_id) || null,
			payload: {
				choice_text: branch.choice_text || '',
				target_content_id: Number(branch.target_content_id) || null,
			},
		});
	}

	const targetId = branch.target_content_id;
	for (let si = 0; si < scenes.value.length; si++) {
		const list = allDialogues.value[scenes.value[si].scene_id] || [];
		const di = list.findIndex(d => d.content_id === targetId);
		if (di >= 0) {
			if (!scenePlayable(scenes.value[si].scene_id)) {
				ElMessage.warning('目标场景尚未解锁，先推进剧情或调整条件');
				return;
			}
			if (!nodePlayable(list[di])) {
				ElMessage.warning('目标台词条件未满足：' + conditionText(list[di].branch_condition));
				return;
			}
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

	// 跳过播放条件不满足、没有可播放台词或台词全部被条件过滤的场景
	let nextIndex = currentSceneIndex.value + 1;
	while (nextIndex < scenes.value.length && (
		!scenePlayable(scenes.value[nextIndex].scene_id) ||
		!sceneHasPlayableDialogues(scenes.value[nextIndex].scene_id)
	)) {
		nextIndex++;
	}

	if (nextIndex < scenes.value.length) {
		// 切换到下一个可播放场景（从第一条条件满足的台词开始）
		currentSceneIndex.value = nextIndex;
		currentDialogueIndex.value = firstPlayableNodeIndex(scenes.value[nextIndex].scene_id);
		
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
		logPlayEvent('finish', {
			scene_id: Number(currentScene.value?.scene_id) || null,
		});
		scheduleAchievementCheck(true);
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

// 保存当前进度到本地存储（云端不可用时的兜底）
const saveProgress = (silent = false) => {
	try {
		const progressData = {
			projectId: props.projectId,
			currentSceneIndex: currentSceneIndex.value,
			currentDialogueIndex: currentDialogueIndex.value,
			historyDialogues: historyDialogues.value, // 保存历史对话
			playthrough: playthrough.value,
			// 变量与数值变化进度，避免本地兜底存档丢变量
			variables: variableValues.value,
			lastEffectKey: lastEffectKey.value,
			triggeredEndings: [...triggeredEndings.value],
			saveTime: new Date().toISOString()
		};
		
		localStorage.setItem(`gameProgress_${props.projectId}`, JSON.stringify(progressData));
		if (!silent) ElMessage.success('进度已保存');
	} catch (error) {
		console.error('保存进度失败:', error);
		if (!silent) ElMessage.error('保存进度失败，请重试');
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
	playthrough: playthrough.value,
	// 存档缩略图：优先当前场景背景，没有背景时用作品封面
	scene_title: currentScene.value.title || '',
	thumbnail_url: currentScene.value.background_url || projectCoverUrl.value || '',
	savedAt: new Date().toISOString(),
});

// 本地静态地址补 BASE_URL，外链直接使用
const thumbSrc = (url) => {
	if (!url) return '';
	return /^http/i.test(url) ? url : BASE_URL + url;
};

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
		saveProgress(true);
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
		if (state.playthrough) {
			playthrough.value = Number(state.playthrough) || playthrough.value;
			try {
				localStorage.setItem(playthroughKey(), String(playthrough.value));
			} catch (_) { /* ignore */ }
		}
		initVariableValues();
		// 读档后把跨周目变量同步为存档里的值
		syncProjectMeta(true);
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
				historyDialogues: savedHistory,
				playthrough: savedPlaythrough,
				variables: savedVariables,
				lastEffectKey: savedEffectKey,
				triggeredEndings: savedEndings
			} = JSON.parse(progressData);
			currentSceneIndex.value = sceneIdx;
			currentDialogueIndex.value = dialogueIdx;
			historyDialogues.value = savedHistory || [];
			if (savedPlaythrough) playthrough.value = Number(savedPlaythrough) || playthrough.value;
			// 恢复变量与已触发的数值变化，避免读本地进度后数值归零/重复加分
			if (savedVariables && typeof savedVariables === 'object') {
				variableValues.value = { ...savedVariables };
			}
			syncProjectMeta(true);
			lastEffectKey.value = savedEffectKey || '';
			if (Array.isArray(savedEndings)) {
				triggeredEndings.value = new Set(savedEndings);
			}
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

// 素材文件丢失时不显示裂图
const hideBrokenImage = (e) => {
	if (e && e.target) e.target.style.visibility = 'hidden';
};

// 键盘事件处理
const isEditableTarget = (target) => {
	const tag = target && target.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
		|| !!(target && target.isContentEditable);
};

// Esc 关闭已打开的播放器面板，返回是否关闭了某个面板
const closePlayerPanels = () => {
	if (settingsVisible.value) { settingsVisible.value = false; return true; }
	if (galleryDialogVisible.value) { galleryDialogVisible.value = false; return true; }
	if (saveDialogVisible.value) { saveDialogVisible.value = false; return true; }
	if (statusDialogVisible.value) { statusDialogVisible.value = false; return true; }
	if (chaptersVisible.value) { chaptersVisible.value = false; return true; }
	if (showHistoryDialogue.value) { showHistoryDialogue.value = false; return true; }
	if (debugPanelVisible.value) { debugPanelVisible.value = false; return true; }
	return false;
};

const isPanelOpen = () => settingsVisible.value || galleryDialogVisible.value
	|| saveDialogVisible.value || statusDialogVisible.value
	|| chaptersVisible.value
	|| showHistoryDialogue.value || debugPanelVisible.value
	|| endingDialogVisible.value || changelogVisible.value;

const handleKeydown = (e) => {
	if (e.key === 'Escape') {
		if (closePlayerPanels()) e.preventDefault();
		return;
	}

	// 调试器输入框等可编辑区域不拦截其他按键
	if (isEditableTarget(e.target)) return;

	// 空格 / 回车 / → 继续对话
	if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
		if (isPanelOpen()) return;
		e.preventDefault(); // 防止空格滚动页面
		nextDialogue();
		return;
	}

	const key = e.key.toLowerCase();
	// H 键切换历史对话显示
	if (key === 'h') {
		e.preventDefault();
		toggleHistoryDialogue();
		return;
	}
	// S 切换跳过已读（设置类操作，弹窗打开时也生效）
	if (key === 's') {
		e.preventDefault();
		playerSettings.value.skipRead = !playerSettings.value.skipRead;
		ElMessage.info(playerSettings.value.skipRead ? '已开启跳过已读' : '已关闭跳过已读');
		return;
	}
	if (isPanelOpen()) return;
	// A 切换自动播放
	if (key === 'a') {
		e.preventDefault();
		toggleAutoPlay();
	}
};

// ==================== 手柄操作（标准按键映射） ====================
// A(0) 继续对话 / B(1) 回想 / X(2) 自动播放
const gamepadPrev = { 0: false, 1: false, 2: false };
let gamepadTimer = null;

const pollGamepad = () => {
	if (!navigator.getGamepads) return;
	// 只在页面可见时响应手柄，避免后台标签误推进剧情
	if (document.visibilityState !== 'visible') return;
	const pads = Array.from(navigator.getGamepads()).filter(p => p && p.connected);
	if (!pads.length) return;
	const pad = pads[0];
	const panelsOpen = isPanelOpen();

	Object.keys(gamepadPrev).forEach((idx) => {
		const pressed = !!(pad.buttons[Number(idx)] && pad.buttons[Number(idx)].pressed);
		if (pressed && !gamepadPrev[idx] && !panelsOpen) {
			if (idx === '0') nextDialogue();
			else if (idx === '1') toggleHistoryDialogue();
			else if (idx === '2') toggleAutoPlay();
		}
		gamepadPrev[idx] = pressed;
	});
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

	// 手柄轮询（无手柄时不做任何操作）
	gamepadTimer = setInterval(pollGamepad, 200);

	// 移动端方向提示
	updateOrientation();
	window.addEventListener('resize', updateOrientation);
	window.addEventListener('orientationchange', updateOrientation);
	// 后台标签页 rAF/定时器被暂停后，回到前台补一次 BGM 终值
	document.addEventListener('visibilitychange', onBgmVisibilityChange);
});

// 组件卸载时清理定时器、音频与全局事件，避免内存泄漏与操作已销毁组件
onUnmounted(() => {
	clearTyping();
	clearVariableNotices();
	if (metaSaveTimer) {
		clearTimeout(metaSaveTimer);
		metaSaveTimer = null;
		syncProjectMeta(true);
	}
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
	clearEffect();
	if (bgSwapTimer) {
		clearTimeout(bgSwapTimer);
		bgSwapTimer = null;
	}
	if (fgSwapTimer) {
		clearTimeout(fgSwapTimer);
		fgSwapTimer = null;
	}
	stopBackgroundMusic();
	if (gamepadTimer) {
		clearInterval(gamepadTimer);
		gamepadTimer = null;
	}
	document.removeEventListener('keydown', handleKeydown);
	document.removeEventListener('click', playBackgroundMusic);
	document.removeEventListener('keydown', playBackgroundMusic);
	document.removeEventListener('touchstart', playBackgroundMusic);
	window.removeEventListener('resize', updateOrientation);
	window.removeEventListener('orientationchange', updateOrientation);
	document.removeEventListener('visibilitychange', onBgmVisibilityChange);
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
  /* 作品皮肤变量：作者在创作页「外观」切换，下面是「经典粉白」默认值 */
  --ui-page-bg: #fff5f7;
  --ui-dialog-bg: rgba(255, 255, 255, 0.9);
  --ui-dialog-text: #333333;
  --ui-name: #d81f37;
  --ui-name-bg: rgba(255, 255, 255, 0.92);
  --ui-bubble-bg: rgba(255, 255, 255, 0.94);
  --ui-choice-bg: linear-gradient(135deg, #fff0f4 0%, #ffe4ec 100%);
  --ui-choice-border: #ffb6c1;
  --ui-choice-text: #b3244a;
  --ui-accent: #ff6b8b;

  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: var(--ui-page-bg);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

/* ---- 播放器皮肤预设 ---- */
.export-project-container.theme-sakura {
  --ui-page-bg: #fff1f4;
  --ui-dialog-bg: rgba(255, 250, 247, 0.92);
  --ui-dialog-text: #4a3036;
  --ui-name: #d95f86;
  --ui-name-bg: #fffaf7;
  --ui-bubble-bg: #fffaf7;
  --ui-choice-bg: linear-gradient(135deg, #fff5f7 0%, #ffe7ee 100%);
  --ui-choice-border: #f2b3c8;
  --ui-choice-text: #b3446b;
  --ui-accent: #e58aa8;
}

.export-project-container.theme-ink {
  --ui-page-bg: #f3efe6;
  --ui-dialog-bg: rgba(250, 247, 240, 0.94);
  --ui-dialog-text: #3d3a33;
  --ui-name: #3d3a33;
  --ui-name-bg: #f7f2e7;
  --ui-bubble-bg: #faf7f0;
  --ui-choice-bg: linear-gradient(135deg, #f7f2e7 0%, #ece5d6 100%);
  --ui-choice-border: #c9bfa8;
  --ui-choice-text: #4a4438;
  --ui-accent: #8a7a5c;
}

.export-project-container.theme-midnight {
  --ui-page-bg: #101623;
  --ui-dialog-bg: rgba(23, 30, 46, 0.92);
  --ui-dialog-text: #dbe6f7;
  --ui-name: #8ab4ff;
  --ui-name-bg: #1b2438;
  --ui-bubble-bg: #1b2438;
  --ui-choice-bg: linear-gradient(135deg, #1b2438 0%, #22304a 100%);
  --ui-choice-border: #3f5a86;
  --ui-choice-text: #bcd2f5;
  --ui-accent: #8ab4ff;
}

.export-project-container.theme-mint {
  --ui-page-bg: #eefaf3;
  --ui-dialog-bg: rgba(255, 255, 255, 0.94);
  --ui-dialog-text: #234438;
  --ui-name: #1f8f6a;
  --ui-name-bg: #f4fdf8;
  --ui-bubble-bg: #f4fdf8;
  --ui-choice-bg: linear-gradient(135deg, #f0fdf7 0%, #ddf5e9 100%);
  --ui-choice-border: #9fd8bf;
  --ui-choice-text: #1f7a5b;
  --ui-accent: #2aa37b;
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

.player-changelog-btn {
  position: absolute;
  top: 16px;
  right: 172px;
  z-index: 30;
  height: 42px;
  min-width: 54px;
  padding: 0 12px;
  border-radius: 21px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: all 0.2s ease;
}

.player-changelog-btn:hover {
  background: rgba(0, 0, 0, 0.45);
}

/* 章节跳转 / 路线图鉴入口 */
.player-chapter-btn {
  position: absolute;
  top: 16px;
  right: 236px;
  z-index: 30;
  height: 42px;
  min-width: 54px;
  padding: 0 12px;
  border-radius: 21px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.player-chapter-btn:hover {
  background: rgba(0, 0, 0, 0.45);
}

.chapter-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #8a7f92;
}

.chapter-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 40vh;
  overflow-y: auto;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #f0e3e8;
  background: #fffafc;
  cursor: pointer;
  text-align: left;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.chapter-item:hover:not(.is-locked) {
  border-color: #e8467c;
  background: #fff3f7;
}

.chapter-item.is-locked {
  opacity: 0.55;
  cursor: not-allowed;
}

.chapter-order {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffe3ec;
  color: #e8467c;
  font-size: 12px;
}

.chapter-title {
  flex: 1;
  font-size: 14px;
  color: #5b4b55;
}

.chapter-progress {
  font-size: 12px;
  color: #b99aa5;
}

.chapter-action {
  font-size: 12px;
  color: #e8467c;
}

.chapter-item.is-locked .chapter-action {
  color: #b99aa5;
}

.chapter-section-title {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #5b4b55;
}

.route-endings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 24vh;
  overflow-y: auto;
}

.route-ending {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
  background: #faf7f9;
  font-size: 13px;
  color: #8a7f92;
}

.route-ending.is-unlocked {
  background: #fff3f7;
  color: #5b4b55;
}

.chapter-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: #b99aa5;
}

.changelog-list {
  max-height: 50vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.changelog-item {
  border: 1px solid #f5e4ea;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fffafc;
}

.changelog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.changelog-no {
  font-size: 13px;
  font-weight: 600;
  color: #c81f4a;
}

.changelog-time {
  font-size: 11px;
  color: #b99aa5;
}

.changelog-notes {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.changelog-stats {
  margin-top: 5px;
  font-size: 10px;
  color: #b99aa5;
}

.changelog-empty {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: #b37d8f;
}

/* 调试器入口与面板 */
.player-debug-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 31;
  padding: 0 14px;
  height: 34px;
  border-radius: 17px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.32);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(6px);
}

.debug-panel {
  position: absolute;
  top: 58px;
  left: 16px;
  z-index: 31;
  width: 260px;
  max-height: 60vh;
  overflow-y: auto;
  background: rgba(20, 20, 24, 0.88);
  color: #fff;
  border-radius: 10px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(8px);
  font-size: 12px;
}

.debug-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 6px;
}

.debug-close {
  border: none;
  background: transparent;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}

.debug-pos {
  color: #cbd5e1;
  font-size: 11px;
  margin-bottom: 8px;
}

.debug-jump {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.debug-jump input {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  padding: 4px 6px;
  font-size: 12px;
}

.debug-jump button {
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}

.debug-var {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}

.debug-var-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.debug-var-key {
  color: #94a3b8;
  font-size: 10px;
}

.debug-var-input {
  width: 62px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  padding: 3px 5px;
  font-size: 12px;
}

.debug-empty {
  color: #94a3b8;
  font-size: 11px;
}

/* 调试器：条件断点 / 变量历史 / 状态快照 */
.debug-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
}

.debug-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 8px;
}

.debug-mini-btn {
  border: none;
  background: rgba(255, 255, 255, 0.14);
  color: #e2e8f0;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.debug-mini-btn.is-on {
  background: #22c55e;
  color: #052e16;
}

.debug-mini-btn.danger {
  background: rgba(239, 68, 68, 0.25);
  color: #fecaca;
}

.debug-break-row {
  display: flex;
  gap: 4px;
}

.debug-break-var,
.debug-break-op,
.debug-break-value {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  font-size: 11px;
  padding: 3px 4px;
  min-width: 0;
}

.debug-break-var { flex: 1; }
.debug-break-op { width: 48px; }
.debug-break-value { width: 56px; }

.debug-break-hit {
  margin-top: 6px;
  color: #fbbf24;
  font-size: 11px;
  line-height: 1.4;
  word-break: break-all;
}

.debug-history {
  max-height: 110px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.debug-history-item {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-size: 11px;
  color: #cbd5e1;
}

.debug-history-time { color: #64748b; }
.debug-history-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.debug-history-reason { color: #93c5fd; }

.debug-snapshots {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.debug-snapshot-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #cbd5e1;
}

.debug-snapshot-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 调试器：覆盖率 */
.debug-coverage {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
}

.debug-coverage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 8px;
}

.debug-coverage-reset {
  border: none;
  background: transparent;
  color: #93c5fd;
  font-size: 11px;
  cursor: pointer;
}

.debug-coverage-row {
  display: flex;
  justify-content: space-between;
  color: #cbd5e1;
  font-size: 11px;
  margin: 4px 0 3px;
}

.debug-bar {
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.16);
  overflow: hidden;
  margin-bottom: 6px;
}

.debug-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.2s;
}

.debug-bar-fill.nodes {
  background: linear-gradient(90deg, #e8467c, #ff9db5);
}

.debug-bar-fill.edges {
  background: linear-gradient(90deg, #5b8def, #93c5fd);
}

.debug-uncovered {
  margin-top: 10px;
}

.debug-uncovered-title {
  color: #cbd5e1;
  font-size: 11px;
  margin-bottom: 5px;
}

.debug-uncovered-list {
  max-height: 130px;
  overflow-y: auto;
}

.debug-uncovered-item {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 4px;
  border-radius: 5px;
  cursor: pointer;
}

.debug-uncovered-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.debug-uncovered-id {
  color: #f59e0b;
  font-size: 10px;
  flex-shrink: 0;
}

.debug-uncovered-scene {
  color: #94a3b8;
  font-size: 10px;
  flex-shrink: 0;
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.debug-uncovered-text {
  color: #e2e8f0;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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

/* 好感度面板 */
.status-section {
  margin-top: 10px;
  padding: 4px 2px;
  font-size: 12px;
  font-weight: 600;
  color: #b07d8d;
  letter-spacing: 0.5px;
}

.affinity-item {
  padding: 8px 4px 10px;
  border-bottom: 1px dashed #f3d6df;
}

.affinity-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.affinity-name {
  color: #3d2b32;
  font-size: 14px;
  font-weight: 600;
}

.affinity-num {
  color: #c81f4a;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.affinity-bar {
  margin-top: 6px;
  height: 8px;
  border-radius: 4px;
  background: #fbe7ee;
  overflow: hidden;
}

.affinity-bar i {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #ff9fba 0%, #e8467c 100%);
  transition: width 0.3s ease;
}

.affinity-label {
  margin-top: 4px;
  font-size: 11px;
  color: #b99aa5;
}

.persist-badge {
  margin-left: 6px;
  transform: scale(0.85);
  transform-origin: left center;
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

.save-slot-info {
  flex: 1;
  min-width: 0;
}

.save-slot-thumb {
  position: relative;
  width: 96px;
  height: 58px;
  border-radius: 7px;
  overflow: hidden;
  flex-shrink: 0;
  background: #f6e9ee;
}

.save-slot-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.save-slot-thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 10px;
  color: #b99aa5;
}

.save-slot-thumb-title {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 5px;
  font-size: 9px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
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

/* 黑场转场遮罩 */
.bg-blackout {
  position: absolute;
  inset: 0;
  z-index: 8;
  background: #000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}

.bg-blackout.is-on { opacity: 1; }

/* 前景图层 */
.stage-foreground {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.stage-foreground img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 1;
  transition: opacity 0.18s ease;
}

.stage-foreground img.fg-fading { opacity: 0; }

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

/* 变量变化浮层：顶部居中的「好感度 +5」提示 */
.var-notice-layer {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 6;
  pointer-events: none;
}

.var-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  background: linear-gradient(135deg, rgba(232, 70, 124, 0.92), rgba(255, 138, 168, 0.92));
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(4px);
  animation: varNoticeIn 0.28s ease-out;
}

.var-notice.is-down {
  background: linear-gradient(135deg, rgba(90, 110, 140, 0.92), rgba(130, 148, 176, 0.92));
}

.var-notice-icon {
  font-size: 15px;
  line-height: 1;
}

.var-notice-label {
  letter-spacing: 0.02em;
}

.var-notice-delta {
  font-variant-numeric: tabular-nums;
}

@keyframes varNoticeIn {
  from { opacity: 0; transform: translateY(-10px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
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

/* 轻动态立绘：用独立 translate 属性做呼吸起伏，不覆盖演出指令的 transform 微调 */
.sprite-motion {
  animation: sprite-breathe 6s ease-in-out infinite;
  will-change: translate;
}

@keyframes sprite-breathe {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -8px; }
}

@media (prefers-reduced-motion: reduce) {
  .sprite-motion { animation: none; }
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

/* 演出效果：闪光 / 震动 / 天气 */
.fx-flash {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
  animation-name: fxFlashFade;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}

@keyframes fxFlashFade {
  0% { opacity: 0; }
  12% { opacity: 0.92; }
  100% { opacity: 0; }
}

.preview-container.fx-shake {
  animation: fxShake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes fxShake {
  10%, 90% { transform: translate3d(calc(var(--fx-amp) * -0.5), 0, 0); }
  20%, 80% { transform: translate3d(var(--fx-amp), 0, 0); }
  30%, 50%, 70% { transform: translate3d(calc(var(--fx-amp) * -1), 0, 0); }
  40%, 60% { transform: translate3d(var(--fx-amp), 0, 0); }
}

.fx-weather {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  overflow: hidden;
}

.fx-weather.fx-rain {
  background-image: repeating-linear-gradient(
    105deg,
    rgba(174, 214, 241, 0) 0 7px,
    rgba(174, 214, 241, 0.5) 7px 9px
  );
  animation: fxRainFall 0.55s linear infinite;
  opacity: 0.75;
}

@keyframes fxRainFall {
  from { background-position: 0 0; }
  to { background-position: 0 240px; }
}

.fx-weather.fx-snow {
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.95) 1.6px, transparent 2px),
    radial-gradient(circle, rgba(255, 255, 255, 0.7) 1.2px, transparent 1.8px);
  background-size: 120px 160px, 90px 120px;
  animation: fxSnowFall 3s linear infinite;
}

@keyframes fxSnowFall {
  from { background-position: 0 0, 40px 60px; }
  to { background-position: 40px 200px, -20px 260px; }
}

.fx-weather.fx-wind {
  background-image: repeating-linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0 36px,
    rgba(255, 255, 255, 0.35) 36px 72px
  );
  animation: fxWindBlow 0.9s linear infinite;
  opacity: 0.35;
}

@keyframes fxWindBlow {
  from { background-position: -20% 0; }
  to { background-position: 120% 0; }
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
  background-color: var(--ui-dialog-bg);
  color: var(--ui-dialog-text);
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

/* 气泡对话样式 */
.dialogue-box.style-bubble {
  background: transparent;
  box-shadow: none;
  max-width: 760px;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.dialogue-box.style-bubble:hover {
  transform: none;
  box-shadow: none;
}

.dialogue-box.style-bubble .bubble-avatar {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.95);
  margin-bottom: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.dialogue-box.style-bubble .character-name {
  display: inline-block;
  background: var(--ui-name-bg);
  color: var(--ui-name);
  padding: 3px 12px;
  border-radius: 12px 12px 12px 3px;
  font-size: 13px;
  margin-bottom: 6px;
}

.dialogue-box.style-bubble .dialogue-text {
  background: var(--ui-bubble-bg);
  border-radius: 3px 16px 16px 16px;
  padding: 14px 18px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16);
  color: var(--ui-dialog-text);
  min-width: 220px;
}

/* 旁白气泡：居中、半透明深色，不走角色气泡 */
.dialogue-box.style-bubble.box-描述 {
  align-items: center;
}

.dialogue-box.style-bubble.box-描述 .character-name {
  display: none;
}

.dialogue-box.style-bubble.box-描述 .dialogue-text {
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border-radius: 16px;
  text-align: center;
  padding: 12px 22px;
}

.dialogue-box.style-bubble .continue-indicator {
  align-self: flex-end;
}

.character-name {
  font-weight: bold;
  color: var(--ui-name);
  font-size: 16px;
}

.voice-replay-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  border: 1px solid var(--ui-choice-border);
  background: var(--ui-choice-bg);
  color: var(--ui-choice-text);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.16s ease;
}

.voice-replay-btn:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
}

.dialogue-text strong {
  font-weight: 700;
}

.dialogue-text ruby rt {
  font-size: 0.55em;
  color: #b37d8f;
  letter-spacing: 0;
}

.dialogue-text {
  font-size: 18px;
  line-height: 1.6;
  color: var(--ui-dialog-text);
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
  border: 1px solid var(--ui-choice-border);
  border-radius: 10px;
  background: var(--ui-choice-bg);
  color: var(--ui-choice-text);
  font-size: 16px;
  text-align: left;
  cursor: pointer;
  transition: all 0.18s ease;
}

/* 图片选项：上方配图 + 下方文案 */
.choice-option.has-image {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}

.choice-image {
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: 8px;
  display: block;
}

.choice-label {
  display: block;
}

.choice-option.has-image .choice-label {
  padding: 0 6px 4px;
}

.choice-option:hover {
  transform: translateX(4px);
  border-color: #ff7b9c;
  box-shadow: 0 4px 14px rgba(255, 123, 156, 0.25);
}

.choice-option.is-locked {
  opacity: 0.62;
  cursor: not-allowed;
  filter: grayscale(0.45);
}

.choice-option.is-locked:hover {
  transform: none;
  border-color: var(--ui-choice-border);
  box-shadow: none;
}

.choice-lock-hint {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #9a7a86;
  line-height: 1.5;
}

.continue-indicator {
  position: absolute;
  bottom: 10px;
  right: 150px; /* 留出更多功能按钮的位置 */
  color: var(--ui-accent);
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

  .player-changelog-btn {
    top: 10px;
    right: 168px;
    height: 44px;
  }

  .player-chapter-btn {
    top: 10px;
    right: 232px;
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
