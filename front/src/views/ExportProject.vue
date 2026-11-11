<template>
	<div class="export-project-container" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
		<!-- 阅读设置入口 -->
		<button v-if="!loading && !error" class="player-settings-btn" @click="openSettings" :title="t('player.settingsTitle')">
			<el-icon><Setting /></el-icon>
		</button>
		<button
			v-if="!loading && !error && canRollback"
			class="player-back-btn"
			@click="rollbackOneLine"
			:title="t('player.backOneLine')"
		>
			<el-icon><RefreshLeft /></el-icon>
		</button>
		<button
			v-if="!loading && !error && canPerform"
			class="player-perform-btn"
			:class="{ 'is-active': performMode }"
			@click="togglePerformMode"
			title="演出模式（作者预览）"
		>
			<el-icon><EditPen /></el-icon>
		</button>
		<button v-if="!loading && !error && projectVariables.length" class="player-status-btn"
				@click="statusDialogVisible = true" :title="t('player.statusTitle')">
			<el-icon><DataLine /></el-icon>
		</button>
		<button v-if="!loading && !error" class="player-gallery-btn"
				@click="openGallery" :title="t('player.galleryTitle')">
			<el-icon><Picture /></el-icon>
		</button>
		<button v-if="!loading && !error && publicReleases.length" class="player-changelog-btn"
				@click="changelogVisible = true" :title="t('changelog.title')">
			{{ t('player.updateBtn') }}
		</button>
		<button v-if="!loading && !error && chapterRoute.length" class="player-chapter-btn"
				@click="chaptersVisible = true" :title="t('chapters.title')">
			{{ t('player.chapterBtn') }}
		</button>

		<!-- 演出模式：仅作者预览（?edit=1）可见，公开发布后玩家端不会出现 -->
		<div v-if="canPerform && performMode && !loading && !error" class="perform-panel">
			<div class="perform-head">
				<span>演出模式</span>
				<button class="perform-close" @click="performMode = false">×</button>
			</div>
			<div class="perform-pos">
				场景 {{ currentSceneIndex + 1 }}/{{ scenes.length }} · 节点 #{{ currentDialogue?.content_id || '-' }}
			</div>
			<div class="perform-tip">改动直接写入作品，保存后当前画面热更新；玩家端不显示此面板。</div>

			<label class="perform-label">台词</label>
			<textarea
				v-model="performText"
				class="perform-textarea"
				rows="3"
				placeholder="当前节点台词"
			></textarea>

			<template v-if="currentDialogue?.content_type === '对话'">
				<label class="perform-label">差分立绘</label>
				<select v-model="performAvatarId" class="perform-select">
					<option value="">跟随角色默认立绘</option>
					<optgroup v-for="c in characters" :key="c.character_id" :label="c.name">
						<option
							v-for="a in (c.avatars || [])"
							:key="a.avatar_id"
							:value="String(a.avatar_id)"
						>{{ a.avatar_type || '立绘' }} #{{ a.avatar_id }}</option>
					</optgroup>
				</select>
			</template>

			<label class="perform-label">场景背景 URL</label>
			<input
				v-model="performBackground"
				class="perform-input"
				placeholder="/uploads/... 或 https://..."
			/>

			<label class="perform-label">场景 BGM URL</label>
			<input
				v-model="performMusic"
				class="perform-input"
				placeholder="留空表示本场景无背景音乐"
			/>

			<button class="perform-save" type="button" :disabled="performSaving" @click="savePerformEdit">
				{{ performSaving ? '保存中…' : '保存并热更新' }}
			</button>
			<div class="perform-status">{{ performStatus }}</div>
		</div>

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
			<span>{{ t('player.rotateHint') }}</span>
			<button @click.stop="dismissRotateHint">{{ t('player.gotIt') }}</button>
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
				:class="{
					'fx-shake': activeEffect && activeEffect.effect === 'shake',
					'is-audio-drama': playerSettings.audioDrama
				}"
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
				
				<!-- 演出指令控制的立绘：任意数量图层，按 order 叠放；每层可带差分叠加图 -->
				<div v-if="hasStageAvatars" class="stage-layer">
						<div
							v-for="layer in stageLayers"
							:key="layer.layer_id"
							v-show="layer.visible !== false"
							class="stage-avatar"
							:style="layer.boxStyle"
						>
							<div
								class="sprite-stack"
								:style="layer.style"
								:class="{ 'sprite-motion': playerSettings.spriteMotion }"
							>
								<img
									v-for="(src, si) in (layer.sources && layer.sources.length ? layer.sources : [layer.src])"
									:key="si"
									:src="src"
									:class="{ 'sprite-overlay': si > 0 }"
									alt=""
									decoding="async"
								/>
							</div>
						</div>
					</div>

				<!-- 回退：没有演出指令时，显示当前（或最近一位）说话角色的立绘 -->
					<div v-else-if="!loading && !error && previewAvatarLayers.length" class="character-stand">
						<div class="sprite-stack" :class="{ 'sprite-motion': playerSettings.spriteMotion }">
							<img
								v-for="(src, si) in previewAvatarLayers"
								:key="si"
								:src="src"
								alt="角色立绘"
								class="character-image"
								:class="{ 'sprite-overlay': si > 0 }"
								loading="lazy"
								decoding="async"
								@error="hideBrokenImage"
							/>
						</div>
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
					<p>{{ t('common.loading') }}</p>
				</div>
				
				<!-- 错误信息 -->
				<div v-if="error" class="error-message">
					<el-icon color="#F56C6C" size="24"><WarningFilled /></el-icon>
					<p>{{ t('common.error') }}: {{ error }}</p>
					<el-button type="primary" size="small" @click="backToHome">{{ t('common.backToList') }}</el-button>
				</div>
				
				<!-- 历史对话弹窗 -->
				<div 
					v-if="showHistoryDialogue" 
					class="history-dialogue-container"
					@click="toggleHistoryDialogue"
				>
					<div class="history-dialogue-content">
						<div class="history-header">
							<h3>{{ t('history.title') }}</h3>
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
								<div v-if="historySceneTitle(dialogue)" class="history-scene">{{ historySceneTitle(dialogue) }}</div>
								<span class="history-character">{{ getCharacterName(dialogue.character_id) }}</span>
								<span class="history-text">{{ localizedText(dialogue) }}</span>
								<div v-if="dialogue.chosen" class="history-chosen">{{ t('history.choiceLabel') }}{{ historyChoiceText(dialogue) }}</div>
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
							:title="t('player.voiceReplay')"
							@click.stop="replayVoice"
						>{{ t('player.voiceBtn') }}</button>
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
								:title="choice.locked ? t('choice.conditionNotMet', { cond: conditionText(choice.conditions) }) : ''"
								@click.stop="selectBranch(choice)"
							>
								<img
									v-if="choice.image_url"
									:src="BASE_URL + choice.image_url"
									class="choice-image"
									alt=""
									loading="lazy"
								/>
								<span class="choice-label">{{ localizedChoice(choice) || t('choice.continue') }}</span>
								<span v-if="choice.locked" class="choice-lock-hint">
									{{ t('choice.locked', { cond: conditionText(choice.conditions) }) }}
								</span>
							</button>
						</div>
						
						<!-- 功能按钮区 -->
						<div class="function-buttons">
							<el-tooltip :content="t('tooltip.history')" placement="top">
								<el-icon @click.stop="toggleHistoryDialogue" class="func-btn">
									<Search />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.hideBox')" placement="top">
								<el-icon @click.stop="toggleDialogueBox" class="func-btn">
									<Hide />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.skip')" placement="top">
								<el-icon @click.stop="skipToNextScene" class="func-btn">
									<DArrowRight />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="autoPlay ? t('tooltip.autoOff') : t('tooltip.autoOn')" placement="top">
								<el-icon @click.stop="toggleAutoPlay" class="func-btn">
									<VideoPlay />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.restart')" placement="top">
								<el-icon @click.stop="restartGame" class="func-btn">
									<SwitchButton />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.saveProgress')" placement="top">
								<el-icon @click.stop="openSaveDialog" class="func-btn save-func-btn">
									<DocumentAdd />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.exitGame')" placement="top">
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
							<el-tooltip :content="t('tooltip.history')" placement="top">
								<el-icon @click.stop="toggleHistoryDialogue" class="func-btn">
									<Search />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.hideBox')" placement="top">
								<el-icon @click.stop="toggleDialogueBox" class="func-btn">
									<Hide />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.skip')" placement="top">
								<el-icon @click.stop="skipToNextScene" class="func-btn">
									<DArrowRight />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="autoPlay ? t('tooltip.autoOff') : t('tooltip.autoOn')" placement="top">
								<el-icon @click.stop="toggleAutoPlay" class="func-btn">
									<VideoPlay />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.restart')" placement="top">
								<el-icon @click.stop="restartGame" class="func-btn">
									<SwitchButton />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.saveProgress')" placement="top">
								<el-icon @click.stop="openSaveDialog" class="func-btn save-func-btn">
									<DocumentAdd />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.exitGame')" placement="top">
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
							<el-tooltip :content="t('tooltip.history')" placement="top">
								<el-icon @click.stop="toggleHistoryDialogue" class="func-btn">
									<Search />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.hideBox')" placement="top">
								<el-icon @click.stop="toggleDialogueBox" class="func-btn">
									<Hide />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.skip')" placement="top">
								<el-icon @click.stop="skipToNextScene" class="func-btn">
									<DArrowRight />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="autoPlay ? t('tooltip.autoOff') : t('tooltip.autoOn')" placement="top">
								<el-icon @click.stop="toggleAutoPlay" class="func-btn">
									<VideoPlay />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.restart')" placement="top">
								<el-icon @click.stop="restartGame" class="func-btn">
									<SwitchButton />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.saveProgress')" placement="top">
								<el-icon @click.stop="openSaveDialog" class="func-btn save-func-btn">
									<DocumentAdd />
								</el-icon>
							</el-tooltip>
							
							<el-tooltip :content="t('tooltip.exitGame')" placement="top">
								<el-icon @click.stop="exitGame" class="func-btn">
									<CloseBold />
								</el-icon>
							</el-tooltip>
						</div>
					</div>
				</div>
				
				<!-- 对话框隐藏时显示的显示按钮 -->
				<div v-if="!loading && !error && !showDialogueBox && stageLayerVisible.dialogue !== false" class="show-dialogue-btn" @click="toggleDialogueBox">
					<el-tooltip :content="t('tooltip.showBox')" placement="top">
						<el-icon size="30">
							<View />
						</el-icon>
					</el-tooltip>
				</div>
			</div>
		</div>

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
import {
	getDialoguesBySceneId,
	getCharactersByProjectId,
	getCharacterAvatars as getCharacterAvatarsApi,
	saveDialogues,
} from '@/api/dialogue'
import {
	getScenes as getProjectScenes,
	listSceneLocks,
	updateScene,
} from '@/api/scenes'
import { listBranches, getStoryGraph } from '@/api/branch'
import { listPublicReleases } from '@/api/release'
import { listReads, markReads } from '@/api/read'
import { listChapters } from '@/api/chapter'
import { listVariables, listEffects, getProjectMeta, saveProjectMeta } from '@/api/variable'
import { listEndings, unlockEnding } from '@/api/ending'
import { listMusicGallery, unlockMusic } from '@/api/gallery'
import { getGallery } from '@/api/cg'
import { getProject } from '@/api/project'
import { themeClass } from '@/utils/uiThemes'
import { playerText } from '@/utils/playerI18n'
import { usePlayerSettings } from '@/composables/player/usePlayerSettings'
import { usePlayerTelemetry } from '@/composables/player/usePlayerTelemetry'
import { usePlayerAudio } from '@/composables/player/usePlayerAudio'
import { useSaveSlots } from '@/composables/player/useSaveSlots'
import { usePlayerAchievements } from '@/composables/player/usePlayerAchievements'
import {
	usePlayerStage,
	layerIdOf,
	layerNameOf,
	layerOrderOf,
	stageDefaultX,
} from '@/composables/player/usePlayerStage'
import PlayerChangelogDialog from '@/components/player/PlayerChangelogDialog.vue'
import PlayerChaptersDialog from '@/components/player/PlayerChaptersDialog.vue'
import PlayerSettingsDialog from '@/components/player/PlayerSettingsDialog.vue'
import PlayerEndingDialog from '@/components/player/PlayerEndingDialog.vue'
import PlayerStatusDialog from '@/components/player/PlayerStatusDialog.vue'
import PlayerSaveDialog from '@/components/player/PlayerSaveDialog.vue'
import PlayerGalleryDialog from '@/components/player/PlayerGalleryDialog.vue'
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
  Picture,
  RefreshLeft,
  EditPen
} from '@element-plus/icons-vue'
import { ElMessage, ElLoading, ElIcon, ElMessageBox } from 'element-plus'

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
const performMode = ref(false)
const performSaving = ref(false)
const performText = ref('')
const performAvatarId = ref('')
const performBackground = ref('')
const performMusic = ref('')
const performStatus = ref('')

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
	// 调试快照是任意时间点，恢复后旧的「上一句」快照不再可信
	clearLineSnapshots()
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

// 作品 UI 皮肤（作者在创作页「外观」里选择）
const playTheme = ref('classic')
// 作品封面：存档缩略图兜底，同时用于作者预览的演出模式归属判断
const projectCoverUrl = ref('')

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
// 场景播放条件（剧情锁）：scene_id → 条件组
const sceneLocks = ref({});
const statusDialogVisible = ref(false);
const lastEffectKey = ref('');

// 结局
const endings = ref([]);
const triggeredEndings = ref(new Set());
const endingDialogVisible = ref(false);
const currentEnding = ref(null);

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
		ElMessage.warning(t('chapters.lockedToast'));
		return;
	}
	const sceneIdx = chapter.sceneIndexes.find((idx) => (
		scenePlayable(scenes.value[idx].scene_id)
		&& (allDialogues.value[scenes.value[idx].scene_id] || []).length
	));
	if (sceneIdx === undefined) {
		ElMessage.warning(t('chapters.emptyToast'));
		return;
	}
	const di = firstPlayableNodeIndex(scenes.value[sceneIdx].scene_id);
	// 章节跳转属于「瞬移」，清空回退快照，避免回退到跳转前的位置
	clearLineSnapshots();
	currentSceneIndex.value = sceneIdx;
	currentDialogueIndex.value = di;
	chaptersVisible.value = false;
	nextTick(() => startPreview());
	ElMessage.success(t('chapters.jumpedToast', { title: chapter.title }));
};
const galleryTab = ref('cg');
const galleryItems = ref([]);
const galleryTotal = ref(0);
const galleryUnlocked = ref(0);
const musicItems = ref([]);
const musicTotal = ref(0);
const musicUnlocked = ref(0);
const musicLoading = ref(false);

const galleryCountText = computed(() => {
	if (galleryTab.value === 'cg') return t('gallery.unlockedStats', { n: galleryUnlocked.value, total: galleryTotal.value });
	if (galleryTab.value === 'bgm') return t('gallery.unlockedStats', { n: musicUnlocked.value, total: musicTotal.value });
	if (galleryTab.value === 'achievement') {
		return t('gallery.unlockedStats', { n: unlockedAchievementCount.value, total: achievements.value.length });
	}
	const unlocked = endings.value.filter((e) => e.unlocked).length;
	return t('gallery.reachedStats', { n: unlocked, total: endings.value.length });
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
		ElMessage.error(e?.response?.data?.message || t('gallery.loadFailed'));
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
const displayedText = ref('');
const dialogueVoice = ref(null);
const isTyping = ref(false);

// 播放器界面文案：随阅读语言切换，缺失时回退简体中文
const t = (key, params) => playerText(playerSettings.value.language, key, params);

// 当前语言下的角色名：优先译名，缺失时回退原名
const localizedCharacterName = (character) => {
	if (!character) return '';
	const lang = playerSettings.value.language;
	const translated = lang && lang !== 'zh-CN'
		? character.name_translations?.[lang]
		: '';
	return (translated && String(translated).trim()) ? translated : (character.name || '');
};

// 状态弹窗用：character_id → 当前语言角色名
const characterNames = computed(() => {
	const map = {};
	for (const c of characters.value) map[c.character_id] = localizedCharacterName(c);
	return map;
});

// 当前语言下的台词文本：优先译文，缺失时回退原文
const localizedText = (dialogue) => {
	if (!dialogue) return '';
	const lang = playerSettings.value.language;
	const translated = lang && lang !== 'zh-CN' ? dialogue.translations?.[lang] : '';
	return (translated && String(translated).trim()) ? translated : (dialogue.content_text || '');
};

// 当前语言下的场景标题：优先译文，缺失时回退原文
const localizedSceneTitle = (scene) => {
	if (!scene) return '';
	const lang = playerSettings.value.language;
	const payload = lang && lang !== 'zh-CN' ? scene.translations?.[lang] : null;
	const title = payload && payload.title ? String(payload.title).trim() : '';
	return title || scene.title || '';
};

const sceneTitleById = (sceneId) => {
	const scene = (scenes.value || []).find(s => Number(s.scene_id) === Number(sceneId));
	return scene ? localizedSceneTitle(scene) : '';
};

// 当前语言下的选项文案：优先译文，缺失时回退原文
const localizedChoice = (branch) => {
	if (!branch) return '';
	const lang = playerSettings.value.language;
	const translated = lang && lang !== 'zh-CN' ? branch.translations?.[lang] : '';
	return (translated && String(translated).trim()) ? translated : (branch.choice_text || '');
};

const choiceTextById = (pathId) => {
	const branch = (branches.value || []).find(b => Number(b.path_id) === Number(pathId));
	return branch ? localizedChoice(branch) : '';
};

// 回想里的场景名：老存档只有 scene_title 字符串，新数据可用 scene_id 实时本地化
const historySceneTitle = (dialogue) => {
	const title = dialogue?.scene_id ? sceneTitleById(dialogue.scene_id) : '';
	return title || dialogue?.scene_title || '';
};

// 回想里的选项：优先按 path_id 实时本地化，老存档回退已存文案
const historyChoiceText = (dialogue) => {
	const text = dialogue?.chosen_path_id ? choiceTextById(dialogue.chosen_path_id) : '';
	return text || dialogue?.chosen || '';
};

// 对白富文本：纯文本用于逐字显示，HTML 用于渲染颜色/加粗/注音
const richContent = computed(() => parseRichText(localizedText(currentDialogue.value)));
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

// ==================== 上一句回退 ====================
// 内存环形快照：每次推进前记录当前位置与关键状态，不落盘，刷新即失效。
const LINE_SNAPSHOT_LIMIT = 30;
const lineSnapshots = ref([]);
const canRollback = computed(() => lineSnapshots.value.length > 0);

const captureLineSnapshot = () => {
	const dlg = currentDialogue.value;
	if (!dlg) return null;
	return {
		sceneIndex: currentSceneIndex.value,
		dialogueIndex: currentDialogueIndex.value,
		variables: { ...variableValues.value },
		lastEffectKey: lastEffectKey.value,
		endings: [...triggeredEndings.value],
		historyLength: historyDialogues.value.length,
	};
};

const pushLineSnapshot = (snap = null) => {
	const item = snap || captureLineSnapshot();
	if (!item) return;
	const last = lineSnapshots.value[lineSnapshots.value.length - 1];
	if (last && last.sceneIndex === item.sceneIndex && last.dialogueIndex === item.dialogueIndex) {
		return;
	}
	lineSnapshots.value = [...lineSnapshots.value, item].slice(-LINE_SNAPSHOT_LIMIT);
};

const clearLineSnapshots = () => {
	lineSnapshots.value = [];
};

const rollbackOneLine = () => {
	const snap = lineSnapshots.value[lineSnapshots.value.length - 1];
	if (!snap) return;
	lineSnapshots.value = lineSnapshots.value.slice(0, -1);
	bumpBehaviorReview();

	// 停掉正在进行的逐字、停顿与自动推进，避免回退后继续往前跑
	clearWait();
	clearTyping();
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}
	isWaiting.value = false;
	isPlaying.value = true;
	showDialogueBox.value = true;

	// 回退期间不记录埋点（已读记录本身按 content_id 去重）
	currentSceneIndex.value = snap.sceneIndex;
	currentDialogueIndex.value = snap.dialogueIndex;
	variableValues.value = { ...snap.variables };
	lastEffectKey.value = snap.lastEffectKey;
	triggeredEndings.value = new Set(snap.endings);
	historyDialogues.value = historyDialogues.value.slice(0, snap.historyLength);
	skipRestoredLine = true;

	nextTick(() => {
		startTyping();
		applyVolumes();
	});
};

// 预览立绘：旁白沿用本场景最近一位说话的角色，直到出现新角色
const previewSpeaker = computed(() => {
	const list = currentSceneDialogues.value || [];
	for (let i = Math.min(currentDialogueIndex.value, list.length - 1); i >= 0; i--) {
		const d = list[i];
		if (d && d.character_id) return d;
	}
	return null;
});

// 基础图 + 差分层：按 order 从小到大叠放
const previewAvatarLayers = computed(() => {
	const d = previewSpeaker.value;
	if (!d) return [];
	const byAvatar = avatarLayersOf(d.avatar_id);
	if (byAvatar.length) return byAvatar;
	return defaultAvatarLayersOf(d.character_id);
});

const previewAvatarSrc = computed(() => previewAvatarLayers.value[0] || '');

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
			projectOwnerId.value = Number(projectInfo.user_id) || 0;
		} catch (e) {
			playTheme.value = 'classic';
			projectOwnerId.value = 0;
		}

		// 发布版只保留玩家能力：调试器 / 演出入口 / 节点跳转均需作者身份
		debugMode.value = debugRequested && isOwner.value && !releaseView.value;
		performMode.value = canPerform.value;

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
		const startId = debugMode.value ? Number(route.query.start || 0) : 0;
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
			if (!found) ElMessage.warning(t('toast.startNodeMissing', { id: startId }));
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
			logStartOnce();
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
// 逐字显示
const fullText = () => localizedText(currentDialogue.value) || '';

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

// 回退后停在上一句时不立刻触发「跳过已读」
let skipRestoredLine = false

const shouldSkipCurrent = (forceShow = false) => {
	if (forceShow) return false;
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
		perform: {
			currentUserId,
			projectOwnerId: projectOwnerId.value,
			canPerform: canPerform.value,
			performMode: performMode.value,
			queryEdit: route.query.edit,
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

// ==================== 活叙事：行为变量 ====================
// 仅当作者显式启用了 behavior_hesitation / behavior_review 时才记录，不默认采集。
const BEHAVIOR_HESITATION = 'behavior_hesitation';
const BEHAVIOR_REVIEW = 'behavior_review';
let hesitationStartedAt = 0;
let hesitationContentId = null;

const behaviorDefOf = (name) => projectVariables.value.find(v => v.name === name);

const setBehaviorVariable = (name, value) => {
	const def = behaviorDefOf(name);
	if (!def) return;
	const next = clampVariable(def, Math.max(0, Math.round(Number(value) || 0)));
	if (Number(variableValues.value[name] ?? def.initial_value) === next) return;
	variableValues.value = { ...variableValues.value, [name]: next };
};

// 同一选择节点只记一次开始时间，避免设置/打字重入把犹豫时间清零
const markHesitationStart = (contentId) => {
	if (!contentId || hesitationContentId === contentId) return;
	hesitationContentId = contentId;
	hesitationStartedAt = Date.now();
};

const commitHesitation = () => {
	if (!hesitationStartedAt) return;
	const seconds = Math.min(60, Math.floor((Date.now() - hesitationStartedAt) / 1000));
	hesitationStartedAt = 0;
	hesitationContentId = null;
	setBehaviorVariable(BEHAVIOR_HESITATION, seconds);
};

const bumpBehaviorReview = () => {
	const def = behaviorDefOf(BEHAVIOR_REVIEW);
	if (!def) return;
	const current = Number(variableValues.value[BEHAVIOR_REVIEW] ?? def.initial_value);
	setBehaviorVariable(BEHAVIOR_REVIEW, current + 1);
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
	const endingRow = endings.value.find(e => Number(e.ending_id) === Number(ending.ending_id));
	if (endingRow) endingRow.unlocked = true;
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
	resetAchievementState();
	resetVariables();
	clearLineSnapshots();
	resetTelemetryTracking();
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
	resetAchievementState();
	clearVariableNotices();
	lastEffectKey.value = '';
	clearLineSnapshots();
	resetTelemetryTracking();
	// 进入下一周目前，把本周目结束时的跨周目变量写回服务端
	syncProjectMeta(true);
	playthrough.value += 1;
	try {
		localStorage.setItem(playthroughKey(), String(playthrough.value));
	} catch (_) { /* ignore */ }
	nextTick(() => startPreview());
	ElMessage.success(t('toast.nextPlaythrough', { n: playthrough.value }));
};

const startTyping = () => {
	if (!currentDialogue.value) return;
	applyEffectsForCurrent();
	// 回退/演出编辑后强制展示当前句：即使命中结局分支也要先消费标记，避免标记泄漏到下一句
	const forceShowRestored = skipRestoredLine;
	skipRestoredLine = false;
	// 到达结局节点且条件成立：弹结局页，不再继续打字
	if (checkEndingForCurrent()) return;
	clearTyping();
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}

	// 跳过已读：连续跳过已读节点，直到未读或遇到选择
	if (!forceShowRestored && shouldSkipCurrent()) {
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

	// 活叙事：在选择节点开始计时（未启用行为变量时仅计时、不写入）
	if (currentDialogue.value?.content_type === '选择') {
		markHesitationStart(currentDialogue.value.content_id);
	}

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

// 文字速度变化时，当前句按新速度重新显示
watch(() => playerSettings.value.textSpeed, () => startTyping());
// 切换语言后，当前句立即换成对应译文（正在打字时直接显示整句）
watch(() => playerSettings.value.language, () => {
	if (!isPlaying.value || !currentDialogue.value) return;
	finishTyping();
});
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
			const layerId = layerIdOf(p);
			if (p.action === 'hide') {
				delete next[layerId];
			} else {
				const assetSources = p.image_url ? [BASE_URL + p.image_url] : [];
				const avatarSources = avatarLayersOf(p.avatar_id);
				const fallbackSources = assetSources.length
					? assetSources
					: (avatarSources.length ? avatarSources : defaultAvatarLayersOf(p.character_id));
				const src = fallbackSources[0];
				if (src) {
					// 旧指令用 position + sprite 坐标；统一折算成舞台坐标
					const legacy = p.coord !== 'stage';
					const x = legacy ? stageDefaultX(layerId) : (Number(p.x) || 0);
					const y = legacy ? 100 : (Number(p.y) || 0);
					const scale = Number(p.scale) || 1;
					const opacity = p.opacity === undefined || p.opacity === null ? 1 : Number(p.opacity);
					const rotate = Number(p.rotate) || 0;
					const order = layerOrderOf(p);
					const visible = p.visible !== false;
					const boxStyle = {
						left: `${x}%`,
						top: `${y}%`,
						bottom: 'auto',
						right: 'auto',
						transform: 'translate(-50%, -100%)',
						zIndex: 10 + order
					};
					if (!visible) boxStyle.display = 'none';
					const style = {
						transform: `scale(${scale}) rotate(${rotate}deg)`,
						opacity
					};
					next[layerId] = {
						layer_id: layerId,
						layer_name: layerNameOf(p),
						order,
						visible,
						src,
						sources: fallbackSources,
						style,
						boxStyle
					};
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

	// 推进前记录当前位置，供「上一句」回退
	pushLineSnapshot();

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
				ElMessage.warning(t('toast.targetSceneLocked'));
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
		ElMessage.warning(t('choice.conditionNotMet', { cond: conditionText(branch.conditions) }));
		return;
	}
	// 活叙事：记录玩家在这个选择节点上犹豫的秒数
	commitHesitation();
	clearWait();
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}
	// 先取回退点，等确认分支可跳转后再入栈
	const lineSnapshot = captureLineSnapshot();

	if (currentDialogue.value) {
		historyDialogues.value.push({
			...currentDialogue.value,
			scene_id: currentScene.value.scene_id,
			scene_title: currentScene.value.title || '',
			chosen: branch.choice_text || '',
			chosen_path_id: branch.path_id || null,
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
				ElMessage.warning(t('toast.sceneLocked'));
				return;
			}
			if (!nodePlayable(list[di])) {
				ElMessage.warning(t('toast.targetDialogueLocked', { cond: conditionText(list[di].branch_condition) }));
				return;
			}
			pushLineSnapshot(lineSnapshot);
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

	ElMessage.warning(t('toast.branchMissing'));
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
		ElMessageBox.alert(t('ending.gameOverText'), t('ending.gameOverTitle'), {
			confirmButtonText: t('common.confirm'),
			callback: () => {
				proxy.$router.push('/home');
			}
		});
	}
};

// 快进至下一场景
const skipToNextScene = () => {
	pushLineSnapshot();
	nextScene();
};

// 重新开始游戏
const restartGame = () => {
	ElMessageBox.confirm(
		t('toast.restartConfirm'),
		t('toast.restartTitle'),
		{
			confirmButtonText: t('common.confirm'),
			cancelButtonText: t('common.cancel'),
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
		clearLineSnapshots();
		// 新一轮从头开始，重新允许记录本轮埋点
		resetTelemetryTracking();
		
		// 重新开始
		nextTick(() => {
			startPreview();
		});
		
		ElMessage.success(t('toast.restarted'));
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
		if (!silent) ElMessage.success(t('save.saved'));
	} catch (error) {
		console.error('保存进度失败:', error);
		if (!silent) ElMessage.error(t('save.saveFailed'));
	}
};

// ==================== 云端存档 ====================
const currentSaveSummary = () => {
	const title = localizedSceneTitle(currentScene.value) || t('save.unnamedScene');
	const text = localizedText(currentDialogue.value).replace(/\s+/g, ' ').slice(0, 24);
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
	scene_id: currentScene.value.scene_id || null,
	scene_title: currentScene.value.title || '',
	thumbnail_url: currentScene.value.background_url || projectCoverUrl.value || '',
	savedAt: new Date().toISOString(),
});

const {
	saves,
	saveDialogVisible,
	isRestoring,
	openSaveDialog,
	saveToSlot,
	loadFromSlot,
	deleteSlot,
} = useSaveSlots({
	projectId: () => Number(props.projectId),
	capture: () => ({ state: buildSaveState(), summary: currentSaveSummary() }),
	apply: async (state) => {
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
		clearLineSnapshots();
		// 读档后把跨周目变量同步为存档里的值
		syncProjectMeta(true);
		await nextTick();
		startTyping();
		applyVolumes();
	},
	onCloudSaveFailed: () => saveProgress(true),
	onCloudLoadFailed: () => loadProgress(),
	t,
});

// ==================== 演出模式（作者预览热更新） ====================
const syncPerformForm = () => {
	const dlg = currentDialogue.value
	if (!dlg) return
	performText.value = dlg.content_text || ''
	performAvatarId.value = dlg.avatar_id ? String(dlg.avatar_id) : ''
	performBackground.value = currentScene.value?.background_url || ''
	performMusic.value = currentScene.value?.music_url || ''
	performStatus.value = ''
}

const togglePerformMode = () => {
	if (!canPerform.value) return
	performMode.value = !performMode.value
	if (performMode.value) syncPerformForm()
}

// 场景 BGM 改动后立即重载：若当前节点有 music 演出指令，以指令为准不覆盖
const reloadSceneMusic = () => {
	const audio = backgroundMusic.value
	if (!audio) return
	if (!currentScene.value?.music_url) {
		audio.pause()
		audio.currentTime = 0
		return
	}
	if (!isPlaying.value) return
	nextTick(() => {
		audio.volume = 0
		audio.play().then(() => fadeBgmTo(bgmTargetVolume(), 600)).catch(() => {})
	})
}

const savePerformEdit = async () => {
	const dlg = currentDialogue.value
	const scene = currentScene.value
	if (!dlg || !scene || performSaving.value) return
	const text = performText.value.trim()
	if (!text) {
		ElMessage.warning('台词不能为空')
		return
	}

	performSaving.value = true
	try {
		const updated = await saveDialogues({
			...dlg,
			project_id: Number(props.projectId),
			scene_id: Number(scene.scene_id),
			content_text: text,
			avatar_id: dlg.content_type === '对话'
				? (Number(performAvatarId.value) || null)
				: (dlg.avatar_id || null),
		})

		// 热更新当前场景的台词列表，不刷新页面
		const list = allDialogues.value[scene.scene_id] || []
		const idx = list.findIndex(d => Number(d.content_id) === Number(dlg.content_id))
		if (idx >= 0) {
			const next = [...list]
			next[idx] = { ...next[idx], ...(updated || {}), content_text: text }
			allDialogues.value = { ...allDialogues.value, [scene.scene_id]: next }
		}
		historyDialogues.value = historyDialogues.value.map(h =>
			Number(h.content_id) === Number(dlg.content_id) ? { ...h, content_text: text } : h
		)

		// 场景背景 / BGM 按需写入
		const scenePatch = {}
		const bg = performBackground.value.trim()
		const music = performMusic.value.trim()
		if (bg !== (scene.background_url || '')) scenePatch.background_url = bg
		if (music !== (scene.music_url || '')) scenePatch.music_url = music
		if (Object.keys(scenePatch).length) {
			const savedScene = await updateScene(Number(scene.scene_id), scenePatch)
			const si = scenes.value.findIndex(s => Number(s.scene_id) === Number(scene.scene_id))
			if (si >= 0) {
				const next = [...scenes.value]
				next[si] = { ...next[si], ...scenePatch, ...(savedScene || {}) }
				scenes.value = next
			}
			if ('music_url' in scenePatch) {
				const hasMusicDirective = (directivesByContent.value[dlg.content_id] || [])
					.some(d => d.directive_type === 'music')
				if (!hasMusicDirective) reloadSceneMusic()
			}
		}

		performStatus.value = '已保存 · ' + new Date().toLocaleTimeString()
		// 编辑器里改完台词后立刻按新文本重新演出；不触发「跳过已读」
		skipRestoredLine = true
		startTyping()
		ElMessage.success('已保存并热更新当前画面')
	} catch (e) {
		console.error('演出模式保存失败:', e)
		ElMessage.error('保存失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
	} finally {
		performSaving.value = false
	}
}

// 面板打开时跟随场景/节点切换同步表单
watch(
	() => [currentDialogue.value?.content_id, currentScene.value?.scene_id],
	() => {
		if (performMode.value && canPerform.value) syncPerformForm()
	}
)

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
				clearLineSnapshots();
				syncProjectMeta(true);
			lastEffectKey.value = savedEffectKey || '';
			if (Array.isArray(savedEndings)) {
				triggeredEndings.value = new Set(savedEndings);
			}
			ElMessage.success(t('toast.progressLoaded'));
		}
	} catch (error) {
		console.error('加载进度失败:', error);
		// 加载失败不提示，使用默认进度
	}
};

// 退出游戏
const exitGame = () => {
	ElMessageBox.confirm(
		t('toast.exitConfirm'),
		t('toast.exitTitle'),
		{
			confirmButtonText: t('toast.exitBtn'),
			cancelButtonText: t('common.cancel'),
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
		ElMessage.info(t('toast.exitCancelled'));
	});
};

// 处理鼠标滚轮事件
const handleWheel = (e) => {
	// 向上滚动且不在自动播放状态时显示历史对话
	if (e.deltaY < 0 && !autoPlay.value) {
		toggleHistoryDialogue();
	}
};

// 获取角色名称（按当前阅读语言显示译名）
const getCharacterName = (characterId) => {
	const char = characters.value.find(c => c.character_id === characterId);
	return char ? localizedCharacterName(char) : '';
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

	// ← 回到上一句
	if (e.key === 'ArrowLeft') {
		if (isPanelOpen()) return;
		e.preventDefault();
		rollbackOneLine();
		return;
	}

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
		ElMessage.info(playerSettings.value.skipRead ? t('toast.skipOn') : t('toast.skipOff'));
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
	clearStageTransitions();
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
});

const backToHome = () => {
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}
	proxy?.$router?.push('/home');
};
</script>

<style scoped src="./player/playerShell.css"></style>
<style scoped src="./player/playerPerform.css"></style>
<style scoped src="./player/playerDebug.css"></style>
<style scoped src="./player/playerStage.css"></style>
<style scoped src="./player/playerDialogue.css"></style>
<style scoped src="./player/playerResponsive.css"></style>