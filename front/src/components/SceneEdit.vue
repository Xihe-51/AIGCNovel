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
						<div class="field-label">播放条件（剧情锁）</div>
						<div class="scene-lock">
							<div v-if="sceneLockItems.length > 1" class="scene-lock-mode">
								<span class="scene-lock-mode-label">条件关系</span>
								<el-radio-group v-model="sceneLockMode" size="small">
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
									@click="removeSceneLockCondition(ci)"
								/>
							</div>
							<div class="scene-lock-actions">
								<el-button size="small" icon="Plus" @click="addSceneLockCondition">添加条件</el-button>
								<span class="condition-tip">条件不满足时，顺序播放会跳过该场景</span>
							</div>
						</div>
					</div>
					
					<div class="field-block">
						<div class="field-label">
							背景图片
							<button type="button" class="field-asset-btn" @click="openAssetPicker('image')">素材库</button>
						</div>
						<div
							class="scene-drop-zone"
							:class="{ 'is-drop-over': dragOverBg }"
							@dragover.prevent="dragOverBg = true"
							@dragleave="dragOverBg = false"
							@drop.prevent="onBackgroundDrop"
						>
						<div v-if="scene.background_url" class="bg-card">
							<img v-if="!settingsBgFailed" :src="BASE_URL + scene.background_url" alt="背景预览" @error="settingsBgFailed = true" />
							<div v-else class="bg-card-missing">图片文件已丢失</div>
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
						</div>
						
						<div class="field-block">
							<div class="field-label">
								背景音乐
								<button type="button" class="field-asset-btn" @click="openAssetPicker('audio')">素材库</button>
							</div>
							<div
								class="scene-drop-zone"
								:class="{ 'is-drop-over': dragOverMusic }"
								@dragover.prevent="dragOverMusic = true"
								@dragleave="dragOverMusic = false"
								@drop.prevent="onMusicDrop"
							>
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
					</div>
					
					<button type="button" class="save-scene-btn" :disabled="sceneSaving || !sceneReady" @click="saveSceneSettings">
						{{ sceneSaving ? '保存中…' : '保存场景设置' }}
					</button>
					<div :class="['scene-save-state', { 'is-dirty': sceneDirty }]">
						{{ !sceneReady ? '场景设置加载中…' : (sceneSaving ? '正在保存场景设置…' : (sceneDirty ? '场景设置有未保存改动，离开会自动保存' : '场景设置已保存')) }}
					</div>
				</el-form>
			</div>
			
			<!-- 对话编辑部分 -->
			<div v-show="panelTab === 'script'" class="panel-section">
				<h3 class="section-title">对话编辑</h3>
				
				<div class="dialogue-controls">
					<el-button size="small" type="success" @click="addNewDialogue">
						<el-icon :size="16"><Plus /></el-icon> 添加对话
					</el-button>
					<el-button size="small" @click="openScriptImport">导入剧本</el-button>
					<el-button size="small" :disabled="!canUndo" @click="undo">撤销</el-button>
					<el-button size="small" :disabled="!canRedo" @click="redo">重做</el-button>
					<el-button size="small" type="warning" @click="reorderDialogues">
						<el-icon :size="16"><RefreshLeft /></el-icon> 按当前顺序保存排序
					</el-button>
					<el-button size="small" type="primary" @click="saveAllDialogues">保存全部</el-button>
					<el-button size="small" @click="openGraph">剧情图</el-button>
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
						<div v-for="(dialogue, index) in dialogues" :key="dialogue.content_id || index" :class="['dialogue-editor-item', { 'is-focused': isDialogueFocused(dialogue.content_id) }]" :data-content-id="dialogue.content_id || ''" @click="selectDialogue(index)">
							<div class="dialogue-header">
								<div class="dialogue-header-left">
									<el-checkbox
										class="dlg-select"
										:model-value="isSelected(index)"
										@change="toggleSelect(index)"
										@click.stop
									/>
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
									size="small"
									@click="openDirectiveDialog(index)"
									class="directive-btn"
									title="演出指令：立绘位置、背景切换、音效"
								>演出</el-button>
								<el-button
									size="small"
									:class="['condition-btn', { 'has-condition': hasNodeCondition(dialogue) }]"
									title="台词显示条件：条件不满足时顺序播放会跳过这条"
									@click="openNodeConditionDialog(index)"
								>条件</el-button>
								<el-button
									size="small"
									class="play-btn"
									:disabled="!dialogue.content_id"
									title="从这条台词开始调试播放"
									@click="playFromDialogue(dialogue)"
								>试玩</el-button>
								<el-button 
									size="small" 
									icon="Delete" 
									@click="deleteDialogue(index)"
									class="delete-btn"
									title="删除这条台词（会级联删除分支/数值/演出，不可撤销）"
								></el-button>
								<el-button 
									size="small" 
									icon="Top" 
									@click="moveDialogueUp(index)"
									:disabled="index === 0"
									class="move-btn"
								></el-button>
								<el-button 
									size="small" 
									icon="Bottom" 
									@click="moveDialogueDown(index)"
									:disabled="index === dialogues.length - 1"
									class="move-btn"
								></el-button>
								<el-button size="small" type="success" @click="addNewDialogue">
									<el-icon><Plus /></el-icon>
								</el-button>
							</div>
						</div>
						
						<el-form :model="dialogue" label-width="70px" size="small" class="dialogue-form">
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
							
							<el-form-item label="角色" class="dlg-inline" v-if="dialogue.content_type==='对话'">
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
							
							<el-form-item label="立绘" class="dlg-inline" v-if="dialogue.content_type==='对话'">
								<el-select 
									v-model="dialogue.avatar_id" 
									style="width: 100%"
									clearable
									placeholder="默认立绘"
									:disabled="!dialogue.character_id"
								>
									<el-option 
										v-for="avatar in getCharacterAvatars(dialogue.character_id)" 
										:key="avatar.avatar_id" 
										:label="avatarOptionLabel(avatar)" 
										:value="avatar.avatar_id"
									></el-option>
								</el-select>
							</el-form-item>
							
							<el-form-item label="内容">
								<el-input 
									type="textarea" 
									v-model="dialogue.content_text" 
									placeholder="输入对话内容" 
									:rows="2"
								/>
								<div class="rich-markup-tip">
									支持 **加粗**、[color=#e8467c]彩色[/color]、[ruby=zhùyīn]注音[/ruby]
								</div>
							</el-form-item>

							<!-- 非「选择」节点：播完本节点后自动跳转 -->
							<el-form-item
								label="自动跳转"
								v-if="dialogue.content_id && dialogue.content_type !== '选择'"
							>
								<div class="jump-editor">
									<el-select
										:model-value="jumpTargetOf(dialogue)"
										size="small"
										clearable
										placeholder="不跳转，按顺序播放"
										class="jump-select"
										@change="(val) => setJumpTarget(dialogue, val)"
									>
										<el-option
											v-for="t in choiceTargets(index)"
											:key="t.content_id"
											:label="choiceTargetLabel(t)"
											:value="t.content_id"
										></el-option>
									</el-select>
									<span class="condition-tip">播放完本节点后自动跳到目标节点，不需要玩家选择</span>
								</div>
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
												size="small"
												placeholder="选项文案"
												class="choice-text-input"
											/>
											<el-select
												v-model="opt.target_content_id"
												size="small"
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
												size="small"
												type="danger"
												icon="Delete"
												@click="removeChoice(dialogue, oi)"
											/>
										</div>

										<!-- 图片选项：可选配图，播放器会渲染成图文卡片 -->
										<div class="choice-image-row">
											<img
												v-if="opt.image_url"
												:src="BASE_URL + opt.image_url"
												class="choice-image-thumb"
												alt="选项配图"
											/>
											<el-upload
												action="#"
												accept="image/*"
												:show-file-list="false"
												:http-request="(o) => handleChoiceImageUpload(o, opt)"
											>
												<el-button size="small">{{ opt.image_url ? '更换配图' : '选项配图' }}</el-button>
											</el-upload>
											<el-button
												v-if="opt.image_url"
												size="small"
												plain
												@click="clearChoiceImage(opt)"
											>清除配图</el-button>
										</div>

										<!-- 显示条件：多条件 AND/OR；全部留空则无条件 -->
										<div class="choice-conditions">
											<div class="choice-cond-head" v-if="(opt.cond_items || []).length > 1">
												<span class="choice-cond-label">条件关系</span>
												<el-radio-group v-model="opt.cond_mode" size="small">
													<el-radio-button value="and">全部满足</el-radio-button>
													<el-radio-button value="or">任一满足</el-radio-button>
												</el-radio-group>
											</div>
											<div
												v-for="(c, ci) in (opt.cond_items || [])"
												:key="ci"
												class="choice-condition"
											>
												<el-select
													v-model="c.variable"
													size="small"
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
													v-if="(opt.cond_items || []).length > 1"
													size="small"
													type="danger"
													plain
													icon="Delete"
													@click="removeChoiceCondition(dialogue, oi, ci)"
												/>
											</div>
											<div class="choice-cond-actions">
												<el-button size="small" icon="Plus" @click="addChoiceCondition(dialogue, oi)">添加条件</el-button>
												<span class="condition-tip" v-if="hasChoiceCondition(opt)">
													{{ opt.cond_mode === 'or' && (opt.cond_items || []).length > 1 ? '任一条件成立时显示' : '条件全部成立时显示' }}
												</span>
											</div>
										</div>
									</div>

									<div class="choice-actions">
										<el-button size="small" icon="Plus" @click="addChoice(dialogue)">添加选项</el-button>
										<el-button
											size="small"
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
											size="small"
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
											size="small"
											:step="1"
											class="effect-delta"
										/>
										<el-button
											size="small"
											type="danger"
											icon="Delete"
											@click="removeEffect(dialogue, ei)"
										/>
									</div>

									<div class="effect-actions">
										<el-button size="small" icon="Plus" @click="addEffect(dialogue)"
												   :disabled="!variables.length">添加数值</el-button>
										<el-button size="small" type="primary"
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
							        size="small" 
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
							        <el-button size="small" type="primary">上传语音</el-button>
							    </el-upload>
							</el-form-item>
							
							<el-form-item>
								<el-button size="small" type="primary" @click="saveDialogue(index)">保存</el-button>
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
				v-if="scene.music_url"
				class="bgm-toggle-btn"
				:class="{ 'is-muted': bgmMuted }"
				:title="bgmMuted ? '打开背景音乐试听' : '关闭背景音乐试听'"
				@click="toggleBgm"
			>{{ bgmMuted ? '试听 BGM' : '停止 BGM' }}</button>
			
			<button 
				@click="togglePanel" 
				class="panel-toggle-btn"
				:class="isPanelOpen ? 'toggle-hidden' : 'toggle-visible'"
			>
				<el-icon :size="24" v-if="isPanelOpen"><ArrowLeft /></el-icon>
				<el-icon :size="24" v-else><ArrowRight /></el-icon>
			</button>
			
			<div
					class="preview-container"
					:class="{ 'fx-shake': activeEffect && activeEffect.effect === 'shake' }"
					:style="{ '--fx-amp': (activeEffect && activeEffect.intensity ? activeEffect.intensity : 5) + 'px' }"
				>
					<div class="scene-background">
						<img 
							v-if="previewBgSrc && !previewBgFailed"
							:src="previewBgSrc" 
							alt="场景背景" 
							class="background-image"
							@error="previewBgFailed = true"
						/>
						<div v-else-if="previewBgSrc" class="bg-missing-tip">背景图文件已丢失，请在左侧场景设置里重新上传</div>
					</div>
					
					<!-- 演出指令控制的立绘（左 / 中 / 右） -->
					<div v-if="!loading && !error && hasPreviewSlots" class="preview-stage">
						<div
							v-for="pos in ['left', 'center', 'right']"
							:key="pos"
							v-show="previewSlots[pos]"
							:class="['preview-stage-avatar', 'pos-' + pos]"
						>
							<img :src="previewSlots[pos]?.src" :style="previewSlots[pos]?.style" alt="" @error="hideBrokenImage" />
						</div>
					</div>

					<!-- 回退：没有演出指令时，显示当前（或最近一位）说话角色的立绘 -->
					<div v-else-if="!loading && !error && previewAvatarSrc" class="character-stand">
						<img 
							:src="previewAvatarSrc" 
							alt="角色立绘" 
							class="character-image"
							@error="hideBrokenImage"
						/>
					</div>

					<!-- 前景图层（演出指令） -->
					<div v-if="!loading && !error && previewFgSrc" class="preview-foreground">
						<img :src="previewFgSrc" alt="" @error="hideBrokenImage" />
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
				
					<div v-if="loading" class="loading-indicator">
					<span class="ui-spinner ui-spinner-lg"></span>
					<p>加载场景中...</p>
				</div>
				
				<div v-if="error" class="error-message">
					<el-icon color="#F56C6C" size="24"><WarningFilled /></el-icon>
					<p>错误: {{ error }}</p>
				</div>
				
				<div v-if="!loading && !error" class="dialogue-display">
					<div 
						v-if="currentDialogueIndex < dialogues.length"
						:class="['dialogue-box', `box-${currentDialogue?.content_type}`]"
						@click="nextDialogue"
					>
						<span class="character-name">{{ getCharacterName(currentDialogue.character_id) }}</span>
						<div class="dialogue-text" v-html="richPreviewHtml(currentDialogue?.content_text || '')"></div>
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
				<span class="ui-spinner ui-spinner-sm"></span>
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
					<el-option label="画面效果" value="effect" />
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
					<div class="dir-avatar-fine">
						<el-input-number v-model="dirForm.x" :min="-100" :max="100" :controls="false" size="small" placeholder="X%" title="水平偏移（%）" />
						<el-input-number v-model="dirForm.y" :min="-100" :max="100" :controls="false" size="small" placeholder="Y%" title="垂直偏移（%）" />
						<el-input-number v-model="dirForm.scale" :min="0.2" :max="3" :step="0.1" :controls="false" size="small" placeholder="缩放" title="缩放倍数" />
						<el-input-number v-model="dirForm.opacity" :min="0" :max="1" :step="0.1" :controls="false" size="small" placeholder="透明 0-1" title="不透明度" />
						<el-input-number v-model="dirForm.rotate" :min="-45" :max="45" :controls="false" size="small" placeholder="旋转°" title="旋转角度" />
					</div>
				</template>

				<template v-else-if="newDirectiveType === 'background'">
					<img v-if="dirForm.url" :src="BASE_URL + dirForm.url" class="dir-preview" alt="背景预览" />
					<el-input v-model="dirForm.url" size="small" placeholder="上传背景图，或直接填 /static/... 地址" class="dir-field-wide" />
					<el-upload
						class="dir-upload"
						:show-file-list="false"
						:http-request="handleDirUpload"
						accept="image/*"
					>
						<el-button size="small" :loading="dirUploading">上传图片</el-button>
					</el-upload>
					<el-select v-model="dirForm.layer" size="small" class="dir-field-sm">
						<el-option label="背景" value="background" />
						<el-option label="前景" value="foreground" />
					</el-select>
					<el-select v-model="dirForm.transition" size="small" class="dir-field-sm">
						<el-option label="淡入淡出" value="fade" />
						<el-option label="硬切" value="cut" />
						<el-option label="黑场" value="black" />
					</el-select>
					<el-input-number v-model="dirForm.bg_duration" :min="100" :step="100" size="small" class="dir-field-sm" />
				</template>

				<template v-else-if="newDirectiveType === 'music'">
					<el-input v-model="dirForm.url" size="small" placeholder="上传 BGM，或直接填地址" class="dir-field-wide" />
					<el-upload
						class="dir-upload"
						:show-file-list="false"
						:http-request="handleDirUpload"
						accept="audio/*"
					>
						<el-button size="small" :loading="dirUploading">上传音频</el-button>
					</el-upload>
					<el-select v-model="dirForm.action" size="small" class="dir-field-sm">
						<el-option label="播放" value="play" />
						<el-option label="停止" value="stop" />
					</el-select>
				</template>

				<template v-else-if="newDirectiveType === 'sound'">
					<el-input v-model="dirForm.url" size="small" placeholder="上传音效，或直接填地址" class="dir-field-wide" />
					<el-upload
						class="dir-upload"
						:show-file-list="false"
						:http-request="handleDirUpload"
						accept="audio/*"
					>
						<el-button size="small" :loading="dirUploading">上传音频</el-button>
					</el-upload>
				</template>

				<template v-else-if="newDirectiveType === 'effect'">
					<el-select v-model="dirForm.effect" size="small" class="dir-field-sm">
						<el-option label="闪光" value="flash" />
						<el-option label="震动" value="shake" />
						<el-option label="天气" value="weather" />
					</el-select>
					<template v-if="dirForm.effect === 'flash'">
						<el-input v-model="dirForm.color" size="small" placeholder="#ffffff" class="dir-field-sm" />
						<el-input-number v-model="dirForm.duration" :min="100" :step="100" size="small" class="dir-field-sm" />
					</template>
					<template v-else-if="dirForm.effect === 'shake'">
						<el-input-number v-model="dirForm.intensity" :min="1" :max="9" size="small" class="dir-field-sm" />
						<el-input-number v-model="dirForm.duration" :min="100" :step="100" size="small" class="dir-field-sm" />
					</template>
					<template v-else>
						<el-select v-model="dirForm.weather" size="small" class="dir-field-sm">
							<el-option label="下雨" value="rain" />
							<el-option label="下雪" value="snow" />
							<el-option label="刮风" value="wind" />
						</el-select>
						<el-input-number v-model="dirForm.duration" :min="500" :step="500" size="small" class="dir-field-sm" />
					</template>
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

		<!-- 台词显示条件 -->
		<el-dialog v-model="nodeConditionVisible" title="台词显示条件" width="470px" append-to-body>
			<div class="node-cond-target">当前台词：{{ nodeConditionTarget || '（空）' }}</div>
			<div class="node-cond-hint">条件不满足时，顺序播放会跳过这条台词；不填变量表示无条件。</div>
			<div v-if="nodeConditionItems.length > 1" class="scene-lock-mode">
				<span class="scene-lock-mode-label">条件关系</span>
				<el-radio-group v-model="nodeConditionMode" size="small">
					<el-radio-button value="and">全部满足</el-radio-button>
					<el-radio-button value="or">任一满足</el-radio-button>
				</el-radio-group>
			</div>
			<div v-for="(c, ci) in nodeConditionItems" :key="ci" class="scene-lock-row">
				<el-select v-model="c.variable" size="small" clearable placeholder="变量" class="condition-var">
					<el-option
						v-for="v in variables"
						:key="v.variable_id"
						:label="v.label"
						:value="v.name"
					></el-option>
				</el-select>
				<el-select v-model="c.op" size="small" class="condition-op" :disabled="!c.variable">
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
				<el-button size="small" type="danger" plain icon="Delete" @click="removeNodeCondition(ci)" />
			</div>
			<div class="scene-lock-actions">
				<el-button size="small" icon="Plus" @click="addNodeCondition">添加条件</el-button>
			</div>
			<template #footer>
				<el-button size="small" @click="nodeConditionVisible = false">取消</el-button>
				<el-button size="small" @click="clearNodeCondition">清除条件</el-button>
				<el-button size="small" type="primary" @click="applyNodeCondition">确定</el-button>
			</template>
		</el-dialog>

		<!-- 批量导入剧本 -->
		<el-dialog v-model="scriptImportVisible" title="批量导入剧本" width="560px" append-to-body>
			<div class="import-hint">
				每行一条，支持下面两种写法；角色名要和项目里已有角色一致，其他行按旁白处理。
				<div class="import-example">【林瑶】暮尘，我也要。</div>
				<div class="import-example">林瑶：暮尘，我也要。</div>
			</div>
			<el-input
				v-model="scriptImportText"
				type="textarea"
				:rows="10"
				resize="none"
				placeholder="在这里粘贴剧本…"
			/>
			<div class="import-mode">
				<span class="import-mode-label">导入方式</span>
				<label class="import-radio"><input type="radio" value="append" v-model="scriptImportMode" /> 追加到末尾</label>
				<label class="import-radio"><input type="radio" value="replace" v-model="scriptImportMode" /> 替换全部</label>
			</div>
			<template #footer>
				<el-button @click="scriptImportVisible = false">取消</el-button>
				<el-button type="primary" @click="applyScriptImport">导入</el-button>
			</template>
		</el-dialog>

		<!-- 批量配音：选中台词逐条 TTS 并回填 voice_url -->
		<el-dialog
			v-model="voiceBatchVisible"
			title="批量配音"
			width="460px"
			append-to-body
			:close-on-click-modal="!voiceBatchRunning"
			:close-on-press-escape="!voiceBatchRunning"
			:show-close="!voiceBatchRunning"
		>
			<div class="voice-batch-hint">
				将对选中的 {{ selectedIndexes.length }} 条台词调用火山 TTS，生成后写入对应台词的配音。
			</div>
			<div class="voice-batch-row">
				<span class="voice-batch-label">音色</span>
				<el-select v-model="voiceBatchVoice" size="small" class="voice-batch-select" :disabled="voiceBatchRunning">
					<el-option
						v-for="v in voiceOptions"
						:key="v.value"
						:label="v.label"
						:value="v.value"
					/>
				</el-select>
			</div>
			<label class="voice-batch-check">
				<input v-model="voiceBatchOverwrite" type="checkbox" :disabled="voiceBatchRunning" />
				<span>覆盖已有配音</span>
			</label>
			<label class="voice-batch-check">
				<input v-model="voiceBatchUseCharacter" type="checkbox" :disabled="voiceBatchRunning" />
				<span>优先使用角色默认音色（角色未设置时用上面的音色）</span>
			</label>
			<div v-if="voiceBatchRunning" class="voice-batch-progress">
				正在生成 {{ voiceBatchDone }} / {{ voiceBatchTotal }}
				<div class="voice-batch-bar">
					<div
						class="voice-batch-bar-fill"
						:style="{ width: voiceBatchPercent + '%' }"
					></div>
				</div>
				<div class="voice-batch-current">{{ voiceBatchCurrent }}</div>
			</div>
			<div v-if="voiceBatchErrors.length" class="voice-batch-errors">
				失败 {{ voiceBatchErrors.length }} 条：{{ voiceBatchErrors.join('；') }}
			</div>
			<template #footer>
				<el-button :disabled="voiceBatchRunning" @click="voiceBatchVisible = false">关闭</el-button>
				<el-button type="primary" :loading="voiceBatchRunning" @click="runVoiceBatch">
					{{ voiceBatchRunning ? '生成中…' : '开始生成' }}
				</el-button>
			</template>
		</el-dialog>

		<!-- 从项目素材库选择，复用已有背景/音乐 -->
		<el-dialog
			v-model="assetPickerVisible"
			:title="assetPickerKind === 'image' ? '从素材库选择背景' : '从素材库选择音乐'"
			width="620px"
			append-to-body
		>
			<div v-if="assetPickerLoading" class="asset-pick-state">正在读取素材…</div>
			<div v-else-if="!assetPickerItems.length" class="asset-pick-state">
				素材库里还没有可用的{{ assetPickerKind === 'image' ? '图片' : '音频' }}。
			</div>
			<div v-else class="asset-pick-grid">
				<button
					v-for="a in assetPickerItems"
					:key="a.url"
					type="button"
					:class="['asset-pick-item', {
						'is-selected': assetPickerKind === 'image'
							? scene.background_url === a.url
							: scene.music_url === a.url
					}]"
					@click="useAssetFromLibrary(a)"
				>
					<img v-if="assetPickerKind === 'image'" :src="BASE_URL + a.url" alt="" loading="lazy" />
					<span v-else class="asset-pick-audio">♪</span>
					<span class="asset-pick-url" :title="a.url">{{ a.url.split('/').pop() }}</span>
					<span class="asset-pick-meta">
						{{ a.usage_count ? '引用 ' + a.usage_count + ' 处' : '未引用' }}
					</span>
				</button>
			</div>
			<template #footer>
				<el-button @click="assetPickerVisible = false">取消</el-button>
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
	onBeforeUnmount,
	computed,
	nextTick,
	watch
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
import { generateText, continueStory, generateVoice, submitAndWait } from '@/api/ai'  
import { importAiAsset, checkProjectAssets } from '@/api/asset'
import { listBranches, createBranch, deleteBranch, getStoryGraph } from '@/api/branch'
import { listVariables, listEffects, saveContentEffects } from '@/api/variable'
import { listNodeDirectives, createDirective, deleteDirective } from '@/api/directive'
import { createProjectVersion } from '@/api/version'
import { parseRichText, renderRichHtml } from '@/utils/richText'
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { updateScene, uploadSceneFile, listSceneLocks, setSceneLock } from '@/api/scenes';

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
// 场景播放条件（剧情锁）
const sceneLockMode = ref('and');
const sceneLockItems = ref([]);
// 搜索定位时高亮的节点（响应式，避免被后续渲染冲掉）
const focusedContentId = ref(null);
// 搜索/剧情图定位的高亮：短时高亮优先，其次保留外层传入的定位目标
const activeFocusId = computed(() => focusedContentId.value ?? props.focusContentId ?? null);
const isDialogueFocused = (contentId) => {
	if (activeFocusId.value === null || activeFocusId.value === undefined) return false;
	return String(contentId) === String(activeFocusId.value);
};
let focusPulseTimer = null;

// ===== 撤销 / 重做 / 未保存草稿 =====
const undoStack = ref([]);
const redoStack = ref([]);
const dirty = ref(false);
const MAX_HISTORY = 50;
let draftTimer = null;
let historyTimer = null;
let pendingBaseSnapshot = null;
const draftKey = computed(() => `scene-draft:${props.sceneId}`);

const cloneDialogues = () => JSON.parse(JSON.stringify(dialogues.value || []));

const pushHistory = (snapshot) => {
	const snap = snapshot || cloneDialogues();
	const str = JSON.stringify(snap);
	const top = undoStack.value[undoStack.value.length - 1];
	if (top && JSON.stringify(top) === str) return;
	undoStack.value.push(snap);
	if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift();
	redoStack.value = [];
};

const applySnapshot = (snap) => {
	dialogues.value = JSON.parse(JSON.stringify(snap));
	clearSelection();
	if (currentDialogueIndex.value >= dialogues.value.length) {
		currentDialogueIndex.value = Math.max(0, dialogues.value.length - 1);
	}
	markDirty();
	nextTick(() => {
		const cur = currentDialogue.value;
		loadPreviewDirectives(cur ? cur.content_id : null);
	});
};

const undo = () => {
	if (!undoStack.value.length) return;
	redoStack.value.push(cloneDialogues());
	applySnapshot(undoStack.value.pop());
};

const redo = () => {
	if (!redoStack.value.length) return;
	undoStack.value.push(cloneDialogues());
	applySnapshot(redoStack.value.pop());
};

const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);

const saveDraftNow = () => {
	if (!dirty.value) return;
	try {
		localStorage.setItem(draftKey.value, JSON.stringify({
			at: Date.now(),
			dialogues: dialogues.value
		}));
	} catch (e) {
		console.warn('草稿保存失败:', e);
	}
};

const markDirty = () => {
	dirty.value = true;
	clearTimeout(draftTimer);
	draftTimer = setTimeout(saveDraftNow, 1000);
};

const clearDraft = () => {
	dirty.value = false;
	clearTimeout(draftTimer);
	try { localStorage.removeItem(draftKey.value); } catch (e) {}
};

// 文本输入：聚焦时记下基线，停顿 800ms 后落一次历史
const beginTextEdit = () => {
	if (!pendingBaseSnapshot) pendingBaseSnapshot = cloneDialogues();
};

const queueTextHistory = () => {
	markDirty();
	if (historyTimer) clearTimeout(historyTimer);
	historyTimer = setTimeout(() => {
		if (pendingBaseSnapshot) {
			pushHistory(pendingBaseSnapshot);
			pendingBaseSnapshot = cloneDialogues();
		}
	}, 800);
};

const flushTextHistory = () => {
	if (historyTimer) {
		clearTimeout(historyTimer);
		historyTimer = null;
	}
	if (pendingBaseSnapshot) {
		pushHistory(pendingBaseSnapshot);
		pendingBaseSnapshot = null;
	}
};

const maybeRestoreDraft = async () => {
	let raw = null;
	try { raw = localStorage.getItem(draftKey.value); } catch (e) {}
	if (!raw) return;
	try {
		const draft = JSON.parse(raw);
		if (!draft || !Array.isArray(draft.dialogues)) return;
		if (JSON.stringify(draft.dialogues) === JSON.stringify(dialogues.value)) {
			localStorage.removeItem(draftKey.value);
			return;
		}
		await ElMessageBox.confirm(
			`发现 ${new Date(draft.at).toLocaleString()} 的未保存草稿，是否恢复？`,
			'恢复草稿',
			{ confirmButtonText: '恢复', cancelButtonText: '丢弃', type: 'info' }
		);
		dialogues.value = draft.dialogues;
		dirty.value = true;
	} catch (e) {
		if (e === 'cancel' || e === 'close') {
			try { localStorage.removeItem(draftKey.value) } catch (err) {}
		}
	}
};

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
		e.shiftKey ? redo() : undo();
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
const selectedIndexes = ref([]);
const isSelected = (i) => selectedIndexes.value.includes(i);
const toggleSelect = (i) => {
	const pos = selectedIndexes.value.indexOf(i);
	if (pos >= 0) selectedIndexes.value.splice(pos, 1);
	else selectedIndexes.value.push(i);
};
const clearSelection = () => { selectedIndexes.value = []; };

const batchDelete = async () => {
	const indexes = [...selectedIndexes.value].sort((a, b) => b - a);
	if (!indexes.length) return;
	try {
		await ElMessageBox.confirm(
			`删除选中的 ${indexes.length} 条台词会同时删除它们的分支、数值变化、演出指令、结局与已读记录，且无法撤销。确定删除？`,
			'批量删除',
			{
				type: 'warning',
				confirmButtonText: '删除',
				cancelButtonText: '取消',
				confirmButtonClass: 'el-button--danger'
			}
		);
	} catch (e) {
		return;
	}
	const hadUnsaved = dirty.value;
	for (const i of indexes) {
		const d = dialogues.value[i];
		if (!d) continue;
		if (d.content_id) {
			try { await apiDeleteDialogue(d.content_id); } catch (e) {
				console.error('批量删除失败:', e);
				ElMessage.error('删除失败，已中止');
				break;
			}
			projectNodes.value = projectNodes.value.filter(n => n.content_id !== d.content_id);
		}
		dialogues.value.splice(i, 1);
	}
	clearSelection();
	dialogues.value.forEach((d, i) => d.order_num = i + 1);
	// 服务端已删除的节点不能靠本地撤销恢复，清空快照避免“幽灵节点”
	undoStack.value = [];
	redoStack.value = [];
	if (hadUnsaved) markDirty();
	else clearDraft();
	ElMessage.success('已删除选中对话（不可撤销）');
};

const batchDuplicate = () => {
	const indexes = [...selectedIndexes.value].sort((a, b) => a - b);
	if (!indexes.length) return;
	pushHistory();
	const clones = indexes.map(i => {
		const d = dialogues.value[i];
		const copy = JSON.parse(JSON.stringify(d));
		delete copy.content_id;
		copy.voice_url = '';
		copy.order_num = 0;
		return copy;
	});
	const insertAt = indexes[indexes.length - 1] + 1;
	dialogues.value.splice(insertAt, 0, ...clones);
	dialogues.value.forEach((d, i) => d.order_num = i + 1);
	clearSelection();
	markDirty();
	ElMessage.success(`已复制 ${clones.length} 条，记得保存`);
};

// ===== 批量配音：选中台词逐条 TTS，生成后回填 voice_url =====
const voiceOptions = [
	{ value: 'BV001_streaming', label: '通用女声 · 童声偏亮' },
	{ value: 'BV002_streaming', label: '通用男声 · 沉稳' },
	{ value: 'BV700_streaming', label: '通用女声 · 知性' },
	{ value: 'BV705_streaming', label: '通用女声 · 活泼' },
	{ value: 'BV701_streaming', label: '通用男声 · 磁性' },
];
const voiceBatchVisible = ref(false);
const voiceBatchVoice = ref('BV001_streaming');
const voiceBatchOverwrite = ref(false);
const voiceBatchUseCharacter = ref(true);
const voiceBatchRunning = ref(false);
const voiceBatchDone = ref(0);
const voiceBatchTotal = ref(0);
const voiceBatchCurrent = ref('');
const voiceBatchErrors = ref([]);
const voiceBatchPercent = computed(() =>
	voiceBatchTotal.value ? Math.round(voiceBatchDone.value * 100 / voiceBatchTotal.value) : 0
);

const openVoiceBatch = () => {
	if (!selectedIndexes.value.length) return;
	voiceBatchErrors.value = [];
	voiceBatchDone.value = 0;
	voiceBatchTotal.value = 0;
	voiceBatchCurrent.value = '';
	voiceBatchVisible.value = true;
};

// 台词对应角色的默认音色（未设置时返回空串）
const characterVoiceFor = (dialogue) => {
	if (!dialogue || !dialogue.character_id) return '';
	const c = (characters.value || []).find(x => x.character_id === dialogue.character_id);
	return (c && c.voice_type) || '';
};

const runVoiceBatch = async () => {
	if (voiceBatchRunning.value) return;
	const pid = Number(projectId.value || scene.value.project_id);
	if (!pid) {
		ElMessage.warning('项目信息加载中，请稍后再试');
		return;
	}
	// 先按当前文本筛出要处理的台词
	const queue = selectedIndexes.value
		.map(i => ({ index: i, dialogue: dialogues.value[i] }))
		.filter(({ dialogue }) =>
			dialogue &&
			String(dialogue.content_text || '').trim() &&
			(voiceBatchOverwrite.value || !dialogue.voice_url)
		);
	if (!queue.length) {
		ElMessage.info(voiceBatchOverwrite.value ? '选中的台词没有可配音文本' : '选中的台词都已有配音，可勾选「覆盖已有配音」');
		return;
	}

	voiceBatchRunning.value = true;
	voiceBatchErrors.value = [];
	voiceBatchTotal.value = queue.length;
	voiceBatchDone.value = 0;
	let success = 0;

	try {
		for (const item of queue) {
			const index = item.index;
			let dialogue = dialogues.value[index];
			if (!dialogue) continue;
			voiceBatchCurrent.value = `#${index + 1} ${String(dialogue.content_text || '').slice(0, 24)}`;
			try {
				// 未保存的新台词先生成节点，拿到 content_id 才能定位配音文件
				if (!dialogue.content_id) {
					dialogue.order_num = index + 1;
					const saved = await saveDialogues(dialogue);
					dialogue = { ...saved, _choices: dialogue._choices, _effects: dialogue._effects };
					dialogues.value[index] = dialogue;
				}

				const text = String(dialogue.content_text || '').trim();
				const voiceType = (voiceBatchUseCharacter.value && characterVoiceFor(dialogue))
					|| voiceBatchVoice.value;
				const info = await submitAndWait(
					() => generateVoice({ text, voice_type: voiceType }),
					{ onProgress: (s) => { if (s.progress?.stage) voiceBatchCurrent.value = s.progress.stage; } }
				);
				const sourceUrl = info?.file || info?.generated_text;
				if (!sourceUrl) throw new Error('TTS 未返回音频地址');

				const extMatch = String(sourceUrl).match(/\.([a-z0-9]+)(?:\?|$)/i);
				const ext = extMatch ? extMatch[1] : 'mp3';
				const targetUrl = `/static/project/${pid}/voice/voice_${dialogue.content_id}_${Date.now()}.${ext}`;
				await importAiAsset(pid, targetUrl, sourceUrl);

				const saved = await saveDialogues({ ...dialogue, voice_url: targetUrl });
				dialogues.value[index] = { ...saved, _choices: dialogue._choices, _effects: dialogue._effects };
				success += 1;
			} catch (e) {
				console.error('批量配音失败:', e);
				voiceBatchErrors.value.push(`#${index + 1} ${e?.response?.data?.message || e?.message || '未知错误'}`);
			} finally {
				voiceBatchDone.value += 1;
			}
		}
		if (success) {
			createProjectVersion(pid, '批量配音').catch(() => {});
			ElMessage.success(`已为 ${success} 条台词生成配音`);
		}
		if (voiceBatchErrors.value.length) {
			ElMessage.warning(`${voiceBatchErrors.value.length} 条配音失败，详见弹窗`);
		}
	} finally {
		voiceBatchRunning.value = false;
		voiceBatchCurrent.value = '';
	}
};

// ===== 剧本批量导入 =====
const scriptImportVisible = ref(false);
const scriptImportText = ref('');
const scriptImportMode = ref('append');

const openScriptImport = () => {
	scriptImportText.value = '';
	scriptImportMode.value = 'append';
	scriptImportVisible.value = true;
};

const stripQuotes = (s) => {
	let t = String(s || '').trim();
	const pairs = [['“', '”'], ['"', '"'], ['「', '」'], ['‘', '’']];
	for (const [l, r] of pairs) {
		if (t.startsWith(l) && t.endsWith(r)) {
			t = t.slice(1, -1).trim();
			break;
		}
	}
	return t;
};

const parseScriptLine = (line) => {
	const text = String(line || '').trim();
	if (!text) return null;
	let m = text.match(/^【([^】]{1,24})】\s*(.+)$/);
	if (m) return { name: m[1].trim(), text: stripQuotes(m[2]) };
	m = text.match(/^([^：:]{1,12})[：:]\s*(.+)$/);
	if (m) return { name: m[1].trim(), text: stripQuotes(m[2]) };
	return { name: '', text: stripQuotes(text) };
};

const applyScriptImport = async () => {
	const parsed = scriptImportText.value
		.split(/\r?\n/)
		.map(parseScriptLine)
		.filter(Boolean);
	if (!parsed.length) {
		ElMessage.warning('没有可导入的内容');
		return;
	}
	if (scriptImportMode.value === 'replace' && dialogues.value.length) {
		try {
			await ElMessageBox.confirm('会清空当前场景的全部对话（仅本地，保存后生效），确定替换？', '替换全部对话', {
				type: 'warning', confirmButtonText: '替换', cancelButtonText: '取消'
			});
		} catch (e) {
			return;
		}
	}
	pushHistory();
	if (scriptImportMode.value === 'replace') dialogues.value = [];
	const base = dialogues.value.length;
	const unknown = new Set();
	parsed.forEach((item, i) => {
		const char = item.name ? characters.value.find(c => c.name === item.name) : null;
		if (item.name && !char) unknown.add(item.name);
		dialogues.value.push({
			project_id: scene.value.project_id,
			scene_id: scene.value.scene_id,
			content_type: char ? '对话' : '描述',
			content_text: char ? item.text : (item.name ? `【${item.name}】${item.text}` : item.text),
			character_id: char ? char.character_id : '',
			avatar_id: '',
			order_num: base + i + 1
		});
	});
	markDirty();
	clearSelection();
	scriptImportVisible.value = false;
	ElMessage.success(`已导入 ${parsed.length} 条，点「保存全部」落库`);
	if (unknown.size) {
		ElMessage.warning(`未找到角色：${[...unknown].join('、')}，这些行已按旁白保留`);
	}
};
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
// 场景设置（标题/描述/背景/音乐/剧情锁）的独立保存状态：
// 台词有 dirty，场景设置也必须有自己的 dirty，否则切场景会静默丢改动。
const sceneDirty = ref(false);
const sceneSaving = ref(false);
const sceneReady = ref(false);
let sceneSnapshot = '';
let sceneSaveTimer = null;
let sceneSaveQueued = false;
const currentDialogueIndex = ref(0);
const defaultBackground = '';

// 场景设置里的背景音乐迷你播放器
const settingsAudio = ref(null);
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
		// 场景设置里的试听和舞台预览 BGM 同一时间只保留一个
		stopBackgroundMusic();
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
	x: 0,
	y: 0,
	scale: 1,
	opacity: 1,
	rotate: 0,
	url: '',
	ms: 500,
	layer: 'background',
	transition: 'fade',
	bg_duration: 400,
	effect: 'flash',
	color: '#ffffff',
	duration: 400,
	intensity: 5,
	weather: 'rain'
});

const directiveTypeLabel = (t) => ({
	avatar: '立绘',
	background: '背景',
	music: '音乐',
	sound: '音效',
	wait: '停顿',
	effect: '画面效果'
}[t] || t);

const directiveSummary = (d) => {
	const p = d.payload || {};
	if (d.directive_type === 'avatar') {
		const c = characters.value.find(x => x.character_id === p.character_id);
		const posMap = { left: '左侧', center: '中间', right: '右侧' };
		const base = `${c ? c.name : '角色'} · ${posMap[p.position] || '中间'} · ${p.action === 'hide' ? '隐藏' : '显示'}`;
		const extra = [];
		if (Number(p.scale) && Number(p.scale) !== 1) extra.push(`缩放 ${p.scale}`);
		if (p.opacity !== undefined && Number(p.opacity) < 1) extra.push(`透明 ${Math.round(Number(p.opacity) * 100)}%`);
		if (Number(p.rotate)) extra.push(`旋转 ${p.rotate}°`);
		if (Number(p.x) || Number(p.y)) extra.push(`偏移 ${p.x || 0}%,${p.y || 0}%`);
		return base + (extra.length ? ` · ${extra.join(' · ')}` : '');
	}
	if (d.directive_type === 'background') {
		const layer = p.layer === 'foreground' ? '前景' : '背景';
		const trans = ({ fade: '淡入淡出', cut: '硬切', black: '黑场' })[p.transition] || '淡入淡出';
		return `${layer} · ${trans} · ${p.url || '（未填地址）'}`;
	}
	if (d.directive_type === 'music') return `${p.action === 'stop' ? '停止' : '播放'} · ${p.url || '（未填）'}`;
	if (d.directive_type === 'sound') return p.url || '（未填地址）';
	if (d.directive_type === 'wait') return `${p.ms || 0} 毫秒`;
	if (d.directive_type === 'effect') {
		const map = {
			flash: `闪光 · ${p.color || '#ffffff'} · ${p.duration_ms || 400}ms`,
			shake: `震动 · 强度 ${p.intensity || 5} · ${p.duration_ms || 400}ms`,
			weather: `天气 · ${({ rain: '下雨', snow: '下雪', wind: '刮风' })[p.weather] || p.weather || '下雨'} · ${p.duration_ms || 3000}ms`
		};
		return map[p.effect] || '（未设置）';
	}
	return '';
};

const loadDirectives = async (contentId) => {
	directives.value = await listNodeDirectives(Number(projectId.value), Number(contentId));
};

// 演出弹窗内的素材上传：背景图走 image，BGM / 音效走 audio；成功后直接回填地址
const dirUploading = ref(false);
const handleDirUpload = async (options) => {
	const t = newDirectiveType.value;
	const fileType = t === 'background' ? 'image' : 'audio';
	dirUploading.value = true;
	try {
		const formData = new FormData();
		formData.append('file', options.file);
		formData.append('project_id', projectId.value);
		formData.append('file_type', fileType);
		const response = await uploadSceneFile(formData);
		if (response.success && response.data && response.data.url) {
			dirForm.value.url = response.data.url;
			ElMessage.success(t === 'background' ? '背景图上传成功' : '音频上传成功');
			options.onSuccess && options.onSuccess(response);
		} else {
			throw new Error((response && response.message) || '上传失败');
		}
	} catch (err) {
		console.error('演出素材上传失败:', err);
		ElMessage.error('上传失败: ' + (err.message || '未知错误'));
		options.onError && options.onError(err);
	} finally {
		dirUploading.value = false;
	}
};

const openDirectiveDialog = async (index) => {
	const d = dialogues.value[index];
	if (!d || !d.content_id) {
		ElMessage.warning('先保存这条对话，再配置演出');
		return;
	}
	// 让右侧预览跟随当前正在编辑的这条对话，避免显示上一条的角色
	currentDialogueIndex.value = index;
	directiveContentId.value = d.content_id;
	const kind = d.content_type === '描述' ? '旁白' : (d.content_type || '对话');
	directiveTarget.value = `${kind}：${(d.content_text || '').slice(0, 18) || '（空）'}`;
	newDirectiveType.value = 'avatar';
	// 新增立绘指令时默认选中当前说话的角色
	dirForm.value = {
		character_id: d.character_id || null,
		position: 'center',
		action: 'show',
		x: 0,
		y: 0,
		scale: 1,
		opacity: 1,
		rotate: 0,
		url: '',
		ms: 500,
		layer: 'background',
		transition: 'fade',
		bg_duration: 400,
		effect: 'flash',
		color: '#ffffff',
		duration: 400,
		intensity: 5,
		weather: 'rain'
	};
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
			action: dirForm.value.action,
			x: Number(dirForm.value.x) || 0,
			y: Number(dirForm.value.y) || 0,
			scale: Number(dirForm.value.scale) || 1,
			opacity: dirForm.value.opacity === '' || dirForm.value.opacity === null ? 1 : Number(dirForm.value.opacity),
			rotate: Number(dirForm.value.rotate) || 0
		};
	} else if (t === 'background') {
		if (!dirForm.value.url) {
			ElMessage.warning('请上传或填写背景图地址');
			return;
		}
		payload = {
			url: dirForm.value.url,
			layer: dirForm.value.layer || 'background',
			transition: dirForm.value.transition || 'fade',
			duration_ms: Number(dirForm.value.bg_duration) || 400
		};
	} else if (t === 'music') {
		if (!dirForm.value.url) {
			ElMessage.warning('请上传或填写音乐地址');
			return;
		}
		payload = { url: dirForm.value.url, action: dirForm.value.action, loop: true };
	} else if (t === 'sound') {
		if (!dirForm.value.url) {
			ElMessage.warning('请上传或填写音效地址');
			return;
		}
		payload = { url: dirForm.value.url };
	} else if (t === 'effect') {
		const effect = dirForm.value.effect || 'flash';
		let duration = Number(dirForm.value.duration) || 400;
		// 天气默认持续更久，避免从闪光切过来时只有 400ms
		if (effect === 'weather' && duration < 1000) duration = 3000;
		payload = { effect, duration_ms: duration };
		if (effect === 'flash') payload.color = dirForm.value.color || '#ffffff';
		if (effect === 'shake') payload.intensity = Number(dirForm.value.intensity) || 5;
		if (effect === 'weather') payload.weather = dirForm.value.weather || 'rain';
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
		syncPreviewIfCurrent(directiveContentId.value);
		ElMessage.success('已添加');
	} catch (e) {
		ElMessage.error('添加失败');
	}
};

const removeDirective = async (d) => {
	try {
		await deleteDirective(Number(projectId.value), d.directive_id);
		await loadDirectives(directiveContentId.value);
		syncPreviewIfCurrent(directiveContentId.value);
	} catch (e) {
		ElMessage.error('删除失败');
	}
};
const backgroundMusic = ref(null);
// 默认静音：只有手动点「BGM 开」才播放，避免打开场景就自动响
const bgmMuted = ref(true);

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

/* ===== 场景播放条件（剧情锁）===== */
const addSceneLockCondition = () => {
	sceneLockItems.value.push({ variable: '', op: '>=', value: 0 });
};

const removeSceneLockCondition = (index) => {
	sceneLockItems.value.splice(index, 1);
};

const loadSceneLock = async () => {
	sceneLockMode.value = 'and';
	sceneLockItems.value = [];
	if (!projectId.value) return;
	try {
		const map = await listSceneLocks(Number(projectId.value));
		const raw = map[String(props.sceneId)];
		if (!raw) return;
		if (Array.isArray(raw.items)) {
			sceneLockMode.value = raw.mode === 'or' ? 'or' : 'and';
			sceneLockItems.value = raw.items.map(c => ({
				variable: c.variable || '',
				op: c.op || '>=',
				value: Number(c.value) || 0,
			}));
		} else if (raw.variable) {
			sceneLockItems.value = [{
				variable: raw.variable,
				op: raw.op || '>=',
				value: Number(raw.value) || 0,
			}];
		}
	} catch (e) {
		console.warn('读取场景播放条件失败:', e);
	}
};

const buildSceneLockPayload = () => {
	const items = sceneLockItems.value
		.filter(c => c.variable)
		.map(c => ({
			variable: c.variable,
			op: c.op || '>=',
			value: Math.trunc(Number(c.value) || 0),
		}));
	if (!items.length) return null;
	return { mode: sceneLockMode.value === 'or' ? 'or' : 'and', items };
};

/* ===== 台词显示条件 ===== */
const nodeConditionVisible = ref(false);
const nodeConditionIndex = ref(-1);
const nodeConditionMode = ref('and');
const nodeConditionItems = ref([]);
const nodeConditionTarget = computed(() => {
	const d = dialogues.value[nodeConditionIndex.value];
	return d ? (d.content_text || '').slice(0, 30) : '';
});

const hasNodeCondition = (dialogue) => {
	const cond = dialogue?.branch_condition;
	if (!cond || typeof cond !== 'object') return false;
	if (Array.isArray(cond.items)) return cond.items.some(i => i && i.variable);
	return !!cond.variable;
};

const openNodeConditionDialog = (index) => {
	nodeConditionIndex.value = index;
	const cond = dialogues.value[index]?.branch_condition;
	nodeConditionMode.value = cond?.mode === 'or' ? 'or' : 'and';
	const items = Array.isArray(cond?.items)
		? cond.items
		: (cond?.variable ? [cond] : []);
	nodeConditionItems.value = items.map(c => ({
		variable: c.variable || '',
		op: c.op || '>=',
		value: Math.trunc(Number(c.value) || 0),
	}));
	nodeConditionVisible.value = true;
};

const addNodeCondition = () => {
	nodeConditionItems.value.push({ variable: '', op: '>=', value: 0 });
};

const removeNodeCondition = (index) => {
	nodeConditionItems.value.splice(index, 1);
};

const buildNodeConditionPayload = () => {
	const items = nodeConditionItems.value
		.filter(c => c.variable)
		.map(c => ({
			variable: c.variable,
			op: c.op || '>=',
			value: Math.trunc(Number(c.value) || 0),
		}));
	if (!items.length) return null;
	return { mode: nodeConditionMode.value === 'or' ? 'or' : 'and', items };
};

const applyNodeCondition = () => {
	const dialogue = dialogues.value[nodeConditionIndex.value];
	if (!dialogue) return;
	dialogue.branch_condition = buildNodeConditionPayload();
	markDirty();
	nodeConditionVisible.value = false;
	ElMessage.success(
		dialogue.branch_condition
			? '已设置台词显示条件，保存全部后生效'
			: '已清除台词显示条件，保存全部后生效'
	);
};

const clearNodeCondition = () => {
	const dialogue = dialogues.value[nodeConditionIndex.value];
	if (!dialogue) return;
	dialogue.branch_condition = null;
	markDirty();
	nodeConditionVisible.value = false;
	ElMessage.success('已清除台词显示条件，保存全部后生效');
};

const fetchSceneData = async () => {
	try {
		loading.value = true;
		sceneReady.value = false;
		const sceneIdNum = Number(props.sceneId);
		if (isNaN(sceneIdNum)) throw new Error('无效的场景ID');

		const sceneData = await getSceneById(sceneIdNum);
		scene.value = sceneData;

		// 先确定 projectId：ensureChoices 依赖它，否则已有分支选项会加载成空数组
		// （表现为「库里有分支，编辑器里一个选项都不显示」）
		projectId.value = sceneData.project_id || '';
		await loadProjectNodes();
		await loadVariablesAndEffects();
		await loadSceneLock();
		// 场景设置与剧情锁加载完成后才建立基线，避免加载过程被误判成用户改动
		sceneSnapshot = currentSceneSnapshot();
		sceneDirty.value = false;
		sceneReady.value = true;
		await loadJumpMap();

		const dialoguesData = await getDialoguesBySceneId(sceneIdNum);
		dialogues.value = dialoguesData.sort((a, b) => a.order_num - b.order_num);
		loadFsmStates();

		// 为「选择」类型的内容预加载已有分支选项（此时 projectId 已就绪）
		await Promise.all(
			dialogues.value
				.filter(d => d.content_type === '选择')
				.map(d => ensureChoices(d))
		);

		// 重置历史，并检查是否有上次未保存的本地草稿
		undoStack.value = [];
		redoStack.value = [];
		dirty.value = false;
		await maybeRestoreDraft();
		
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

		nextTick(() => {
			if (props.focusContentId) focusDialogueByContentId(props.focusContentId);
		});
	} catch (err) {
		sceneReady.value = false;
		console.error('获取场景数据失败:', err);
		error.value = err.message || '获取数据失败，请稍后重试';
		ElMessage.error(error.value);
	} finally {
		loading.value = false;
	}
}

const playBackgroundMusic = () => {
	if (!bgmMuted.value && backgroundMusic.value && scene.value.music_url) {
		backgroundMusic.value.play().catch(e => {
			console.log('背景音乐自动播放失败:', e);
		});
	}
};

const toggleBgm = () => {
	bgmMuted.value = !bgmMuted.value;
	if (bgmMuted.value) stopBackgroundMusic();
	else playBackgroundMusic();
};

// 切换场景/离开创作页时停止背景音乐，避免旧场景的 BGM 留在后台继续响
const stopBackgroundMusic = () => {
	const audio = backgroundMusic.value;
	if (!audio) return;
	try {
		audio.pause();
		audio.currentTime = 0;
	} catch (e) {
		// 忽略浏览器限制导致的暂停失败
	}
};

const stopSettingsAudio = () => {
	const el = settingsAudio.value;
	if (!el) return;
	try {
		el.pause();
		el.currentTime = 0;
	} catch (e) {
		// 忽略浏览器限制导致的暂停失败
	}
	musicPlaying.value = false;
	musicProgress.value = 0;
};

const currentDialogue = computed(() => dialogues.value[currentDialogueIndex.value]);

// 切到剧情图等视图时暂停 BGM，回到脚本再继续
watch(() => props.paused, (paused) => {
	if (paused) {
		stopBackgroundMusic();
		stopSettingsAudio();
	} else {
		nextTick(() => { playBackgroundMusic(); });
	}
});

// 点编辑区的对话卡时，右侧预览同步切到这一条
const selectDialogue = (index) => {
	if (currentDialogueIndex.value !== index) currentDialogueIndex.value = index;
};

// 全项目搜索命中后：选中并滚动到对应对话
const focusDialogueByContentId = async (contentId) => {
	if (!contentId) return;
	const index = dialogues.value.findIndex(d => String(d.content_id) === String(contentId));
	if (index < 0) return;
	currentDialogueIndex.value = index;
	focusedContentId.value = Number(contentId);
	clearTimeout(focusPulseTimer);
	focusPulseTimer = setTimeout(() => { focusedContentId.value = null; }, 2000);
	await nextTick();
	const el = document.querySelector(`.dialogue-editor-item[data-content-id="${contentId}"]`);
	if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

watch(
	() => props.focusContentId,
	(id) => {
		if (id && dialogues.value.length) focusDialogueByContentId(id);
	},
	{ immediate: true }
);

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

// 表情差分选项：表情 + 服装，避免同表情多套服装时选项重名
const avatarOptionLabel = (avatar) => {
	const name = [avatar.avatar_type, avatar.costume].filter(Boolean).join(' · ');
	return avatar.is_default ? `${name}（默认）` : name;
};

const getAvatarUrl = (avatarId) => {
	if (!avatarId) return '';
	for (const char of characters.value) {
		const avatar = char.avatars.find(a => a.avatar_id === avatarId);
		if (avatar && avatar.image_url) return BASE_URL + avatar.image_url;
	}
	return '';
};

/* ===== 预览区：按当前对话的演出指令渲染 ===== */
const previewDirectives = ref([]);

const defaultAvatarUrl = (characterId) => {
	if (!characterId) return '';
	const char = characters.value.find(c => c.character_id === characterId);
	if (!char) return '';
	const list = char.avatars || [];
	const def = list.find(a => a.is_default) || list[0];
	if (def && def.image_url) return BASE_URL + def.image_url;
	return char.avatar_url ? BASE_URL + char.avatar_url : '';
};

// 预览立绘：对话绑定角色时显示对应立绘；旁白沿用本场景上一位说话的角色，
// 直到出现新的角色（要清空舞台请用「演出」里的隐藏指令）。
const previewSpeaker = computed(() => {
	for (let i = Math.min(currentDialogueIndex.value, dialogues.value.length - 1); i >= 0; i--) {
		const d = dialogues.value[i];
		if (d && d.character_id) return d;
	}
	return null;
});

const previewAvatarSrc = computed(() => {
	const d = previewSpeaker.value;
	if (!d) return '';
	return getAvatarUrl(d.avatar_id) || defaultAvatarUrl(d.character_id);
});

// 预览区也按富文本标记渲染，避免作者看到 ** / [color] 等原始标记
const richPreviewHtml = (text) => renderRichHtml(parseRichText(text || ''), Infinity);

const previewSlots = computed(() => {
	const slots = { left: null, center: null, right: null };
	for (const d of previewDirectives.value) {
		if (d.directive_type !== 'avatar') continue;
		const p = d.payload || {};
		const pos = p.position || 'center';
		if (p.action === 'hide') {
			slots[pos] = null;
			continue;
		}
		const src = getAvatarUrl(p.avatar_id) || defaultAvatarUrl(p.character_id);
		if (!src) continue;
		const x = Number(p.x) || 0;
		const y = Number(p.y) || 0;
		const scale = Number(p.scale) || 1;
		const opacity = p.opacity === undefined || p.opacity === null ? 1 : Number(p.opacity);
		const rotate = Number(p.rotate) || 0;
		slots[pos] = {
			src,
			style: {
				transform: `translate(${x}%, ${y}%) scale(${scale}) rotate(${rotate}deg)`,
				opacity
			}
		};
	}
	return slots;
});

const hasPreviewSlots = computed(() => Object.values(previewSlots.value).some(Boolean));

const previewBgSrc = computed(() => {
	let bg = '';
	for (const d of previewDirectives.value) {
		if (d.directive_type !== 'background') continue;
		const p = d.payload || {};
		if (p.layer === 'foreground') continue;
		bg = p.url || '';
	}
	if (bg) return BASE_URL + bg;
	return scene.value.background_url ? BASE_URL + scene.value.background_url : defaultBackground;
});

const previewFgSrc = computed(() => {
	let fg = '';
	for (const d of previewDirectives.value) {
		if (d.directive_type !== 'background') continue;
		const p = d.payload || {};
		if (p.layer !== 'foreground') continue;
		fg = p.url || '';
	}
	return fg ? BASE_URL + fg : '';
});

// 素材文件被删/移动时浏览器会给 404，这里统一降级，避免出现裂图
const previewBgFailed = ref(false);
const settingsBgFailed = ref(false);
const hideBrokenImage = (e) => {
	if (e && e.target) e.target.style.visibility = 'hidden';
};

watch(previewBgSrc, () => { previewBgFailed.value = false; });
watch(() => scene.value.background_url, () => { settingsBgFailed.value = false; });

/* 画面效果：当前节点最后一条 effect 指令在预览里触发一次 */
const activeEffect = ref(null);
let effectTimer = null;

const previewEffect = computed(() => {
	const list = previewDirectives.value.filter(d => d.directive_type === 'effect');
	if (!list.length) return null;
	return list[list.length - 1].payload || null;
});

const triggerPreviewEffect = (p) => {
	clearTimeout(effectTimer);
	activeEffect.value = null;
	if (!p) return;
	const duration = Number(p.duration_ms) || (p.effect === 'weather' ? 3000 : 400);
	// 先置空再赋值，保证连续两次相同效果也能重新播放 CSS 动画
	nextTick(() => {
		activeEffect.value = { ...p, duration_ms: duration, key: Date.now() };
		effectTimer = setTimeout(() => { activeEffect.value = null; }, duration);
	});
};

watch(previewEffect, (p) => { triggerPreviewEffect(p); }, { immediate: true, deep: true });

onBeforeUnmount(() => { clearTimeout(effectTimer); });

const loadPreviewDirectives = async (contentId) => {
	if (!contentId) {
		previewDirectives.value = [];
		return;
	}
	try {
		previewDirectives.value = await listNodeDirectives(Number(projectId.value), Number(contentId));
	} catch (e) {
		previewDirectives.value = [];
	}
};

// 演出弹窗增删了指令后，如果改的正是预览中的那条对话，立刻刷新预览
const syncPreviewIfCurrent = (contentId) => {
	const cur = currentDialogue.value ? currentDialogue.value.content_id : null
	if (cur && String(cur) === String(contentId)) loadPreviewDirectives(contentId);
};

watch(
	() => (currentDialogue.value ? currentDialogue.value.content_id : null),
	(id) => { loadPreviewDirectives(id); },
	{ immediate: true }
);

const handleCharacterChange = (index) => {
	pushHistory();
	markDirty();
	dialogues.value[index].avatar_id = '';
};

// ===== 素材库拖拽：图片 → 背景，音频 → 背景音乐 =====
const readAssetPayload = (e) => {
	try {
		const raw = e.dataTransfer?.getData('application/x-aigc-asset') || ''
		return raw ? JSON.parse(raw) : null
	} catch (_) {
		return null
	}
}

const isImageUrl = (url) => /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(String(url || ''))
const isAudioUrl = (url) => /\.(mp3|wav|ogg)(\?|$)/i.test(String(url || ''))

const onBackgroundDrop = (e) => {
	dragOverBg.value = false
	const payload = readAssetPayload(e)
	const url = payload?.url || e.dataTransfer?.getData('text/plain') || ''
	if (!url || (!isImageUrl(url) && payload?.asset_kind !== 'image')) {
		ElMessage.warning('请拖入图片素材')
		return
	}
	pushHistory()
	markDirty()
	scene.value.background_url = url
	settingsBgFailed.value = false
	ElMessage.success('已填入背景图，稍后自动保存')
}

const onMusicDrop = (e) => {
	dragOverMusic.value = false
	const payload = readAssetPayload(e)
	const url = payload?.url || e.dataTransfer?.getData('text/plain') || ''
	if (!url || (!isAudioUrl(url) && payload?.asset_kind !== 'audio')) {
		ElMessage.warning('请拖入音频素材')
		return
	}
	pushHistory()
	markDirty()
	scene.value.music_url = url
	musicPlaying.value = false
	musicProgress.value = 0
	musicDuration.value = 0
	ElMessage.success('已填入背景音乐，稍后自动保存')
}

// 场景设置的快照只包含会被保存的字段，避免 order_num/created_at 之类误触发 dirty
const sceneSnapshotOf = (sceneData = scene.value, lock = buildSceneLockPayload()) => JSON.stringify({
	title: sceneData?.title || '',
	description: sceneData?.description || '',
	background_url: sceneData?.background_url || '',
	music_url: sceneData?.music_url || '',
	lock: lock || null
});
const currentSceneSnapshot = () => sceneSnapshotOf();

const scheduleSceneSave = () => {
	clearTimeout(sceneSaveTimer);
	sceneSaveTimer = setTimeout(() => {
		if (sceneDirty.value) persistSceneSettings({ silent: true, version: false });
	}, 1200);
};

const persistSceneSettings = async ({ silent = false, version = true } = {}) => {
	if (!props.sceneId || !sceneReady.value) return;
	if (sceneSaving.value) {
		// 自动保存期间又有新改动：等这次请求结束再补一次，避免覆盖
		if (silent) sceneSaveQueued = true;
		else ElMessage.info('场景设置正在保存，请稍候');
		return;
	}
	const payload = JSON.parse(JSON.stringify(scene.value || {}));
	const lock = buildSceneLockPayload();
	const payloadSnapshot = sceneSnapshotOf(payload, lock);
	sceneSaving.value = true;
	try {
		await updateScene(Number(props.sceneId), payload);
		if (projectId.value) {
			await setSceneLock(Number(projectId.value), Number(props.sceneId), lock);
		}
		sceneSnapshot = payloadSnapshot;
		// 请求期间用户可能又改了字段：只有当前值和刚保存的一致才算干净
		sceneDirty.value = currentSceneSnapshot() !== payloadSnapshot;
		if (!silent) ElMessage.success('场景设置保存成功');
		if (version && projectId.value) {
			createProjectVersion(Number(projectId.value), '保存场景设置').catch(() => {});
		}
		emit('scene-updated');
		if (sceneDirty.value) scheduleSceneSave();
	} catch (err) {
		console.error('保存场景设置失败:', err);
		if (silent) ElMessage.warning('场景设置自动保存失败，请手动保存');
		else ElMessage.error('保存场景设置失败: ' + (err.message || '未知错误'));
	} finally {
		sceneSaving.value = false;
		if (sceneSaveQueued) {
			sceneSaveQueued = false;
			if (sceneDirty.value) persistSceneSettings({ silent: true, version: false });
		}
	}
};

const saveSceneSettings = () => {
	clearTimeout(sceneSaveTimer);
	persistSceneSettings({ silent: false, version: true });
};

const addNewDialogue = () => {
	pushHistory();
	markDirty();
	clearSelection();
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

// 跳到剧情图并定位当前台词（没有台词时定位场景首个节点）
const openGraph = () => {
	const node = currentDialogue.value && currentDialogue.value.content_id
		? currentDialogue.value
		: dialogues.value.find(d => d.content_id)
	emit('open-graph', Number(props.sceneId), node?.content_id ?? null)
};

// 从指定台词开始调试播放：播放器带 ?debug=1&start=<content_id>
const playFromDialogue = (dialogue) => {
	if (!dialogue || !dialogue.content_id) {
		ElMessage.warning('请先保存这条台词，再从这里试玩');
		return;
	}
	const pid = projectId.value || scene.value.project_id;
	if (!pid) {
		ElMessage.warning('项目信息加载中，请稍后再试');
		return;
	}
	window.open(`/view/${pid}?debug=1&start=${dialogue.content_id}`, '_blank');
};

const saveAllDialogues = async () => {
	if (!dialogues.value.length) return;
	loading.value = true;
	try {
		for (let i = 0; i < dialogues.value.length; i++) {
			const dialogue = dialogues.value[i];
			dialogue.order_num = i + 1;
			const saved = await saveDialogues(dialogue);
			dialogues.value[i] = {
				...saved,
				_choices: dialogue._choices,
				_effects: dialogue._effects
			};
			if (saved?.content_id && !projectNodes.value.some(n => n.content_id === saved.content_id)) {
				projectNodes.value.push({ ...saved, scene_title: scene.value.title });
			}
		}
		const ids = dialogues.value.filter(d => d.content_id).map(d => d.content_id);
		if (ids.length) await reorderDialoguesApi(Number(props.sceneId), ids);
		clearDraft();
		ElMessage.success('已保存全部对话');
		createProjectVersion(Number(projectId.value), '保存全部对话').catch(() => {});
	} catch (err) {
		console.error('保存全部对话失败:', err);
		ElMessage.error('保存失败: ' + (err.message || '未知错误'));
	} finally {
		loading.value = false;
	}
};

const deleteDialogue = async (index) => {
	const dialogue = dialogues.value[index];
	if (!dialogue) return;

	// 已落库的台词：服务端删除会级联清理分支/数值/演出/结局/已读，
	// 前端撤销无法把它们一起恢复，所以必须先确认，并清空本地撤销栈。
	if (dialogue.content_id) {
		try {
			await ElMessageBox.confirm(
				'删除这条台词会同时删除它的分支、数值变化、演出指令、结局与已读记录，且无法撤销。确定删除？',
				'删除台词',
				{
					type: 'warning',
					confirmButtonText: '删除',
					cancelButtonText: '取消',
					confirmButtonClass: 'el-button--danger'
				}
			);
		} catch (e) {
			return;
		}
		const hadUnsaved = dirty.value;
		try {
			await apiDeleteDialogue(dialogue.content_id);
			projectNodes.value = projectNodes.value.filter(n => n.content_id !== dialogue.content_id);
			const rest = { ...effectsMap.value };
			delete rest[dialogue.content_id];
			effectsMap.value = rest;
			dialogues.value.splice(index, 1);
			dialogues.value.forEach((d, i) => d.order_num = i + 1);
			clearSelection();
			// 旧快照里还带着已删除的节点，继续撤销会造出服务端不存在的“幽灵节点”
			undoStack.value = [];
			redoStack.value = [];
			if (hadUnsaved) markDirty();
			else clearDraft();
			ElMessage.success('台词已删除（不可撤销，可用项目版本回滚恢复）');
		} catch (err) {
			console.error('删除对话失败:', err);
			ElMessage.error('删除对话失败: ' + (err.message || '未知错误'));
		}
		return;
	}

	// 尚未保存的新台词：只改本地，保留撤销能力
	pushHistory();
	markDirty();
	dialogues.value.splice(index, 1);
	dialogues.value.forEach((d, i) => d.order_num = i + 1);
	clearSelection();
};

const moveDialogueUp = (index) => {
	if (index > 0) {
		pushHistory();
		markDirty();
		const temp = dialogues.value[index];
		dialogues.value[index] = dialogues.value[index - 1];
		dialogues.value[index - 1] = temp;
		dialogues.value.forEach((d, i) => d.order_num = i + 1);
		clearSelection();
	}
};

const moveDialogueDown = (index) => {
	if (index < dialogues.value.length - 1) {
		pushHistory();
		markDirty();
		const temp = dialogues.value[index];
		dialogues.value[index] = dialogues.value[index + 1];
		dialogues.value[index + 1] = temp;
		dialogues.value.forEach((d, i) => d.order_num = i + 1);
		clearSelection();
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

// ===== 素材库复用：从项目已有素材中选择背景/音乐 =====
const assetPickerVisible = ref(false);
const assetPickerKind = ref('image');
const assetPickerLoading = ref(false);
const assetPickerItems = ref([]);

const openAssetPicker = async (kind) => {
	assetPickerKind.value = kind;
	assetPickerVisible.value = true;
	assetPickerLoading.value = true;
	assetPickerItems.value = [];
	try {
		const pid = Number(projectId.value || scene.value.project_id);
		const res = await checkProjectAssets(pid);
		const imageExt = /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i;
		const audioExt = /\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i;
		const pattern = kind === 'image' ? imageExt : audioExt;
		const map = new Map();
		for (const it of (res.items || [])) {
			if (it.status !== 'ok' || !pattern.test(it.url || '')) continue;
			const prev = map.get(it.url);
			if (!prev || (it.usage_count || 0) > (prev.usage_count || 0)) {
				map.set(it.url, it);
			}
		}
		assetPickerItems.value = Array.from(map.values())
			.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
	} catch (e) {
		ElMessage.error('读取素材库失败：' + (e?.message || '未知错误'));
	} finally {
		assetPickerLoading.value = false;
	}
};

const useAssetFromLibrary = (asset) => {
	if (!asset) return;
	if (assetPickerKind.value === 'image') {
		scene.value.background_url = asset.url;
		settingsBgFailed.value = false;
	} else {
		stopSettingsAudio();
		scene.value.music_url = asset.url;
	}
	assetPickerVisible.value = false;
	ElMessage.success('已填入素材，稍后自动保存');
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

/* ===== 非「选择」节点：自动跳转 ===== */
const loadJumpMap = async () => {
  jumpMap.value = {};
  if (!projectId.value) return;
  try {
    const all = await listBranches(Number(projectId.value));
    const map = {};
    for (const b of (all || [])) {
      if (!map[b.source_content_id]) map[b.source_content_id] = b;
    }
    jumpMap.value = map;
  } catch (e) {
    console.warn('读取自动跳转失败:', e);
    jumpMap.value = {};
  }
};

const jumpTargetOf = (dialogue) => {
  const b = jumpMap.value[dialogue.content_id];
  return b ? b.target_content_id : '';
};

const setJumpTarget = async (dialogue, targetId) => {
  if (!dialogue.content_id || !projectId.value) return;
  try {
    const all = await listBranches(Number(projectId.value));
    const old = (all || []).filter(b => b.source_content_id === dialogue.content_id);
    for (const b of old) {
      await deleteBranch(b.path_id);
    }
    if (targetId) {
      await createBranch(Number(projectId.value), {
        source_content_id: dialogue.content_id,
        target_content_id: Number(targetId),
        choice_text: '',
        conditions: null,
      });
    }
    await loadJumpMap();
    ElMessage.success(targetId ? '已设置自动跳转' : '已取消自动跳转');
  } catch (e) {
    console.error('设置自动跳转失败:', e);
    ElMessage.error('设置跳转失败：' + (e?.response?.data?.message || e?.message || '未知错误'));
  }
};

/** 切换类型时，若是「选择」则按需加载已有分支 */
const onContentTypeChange = (dialogue) => {
  pushHistory();
  markDirty();
  if (dialogue.content_type === '选择') ensureChoices(dialogue);
};

/** 把 branch_paths.conditions（单条件或条件组）转成编辑器结构 */
const parseChoiceConditions = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return { cond_mode: 'and', cond_items: [{ variable: '', op: '>=', value: 0 }] };
  }
  if (Array.isArray(raw.items)) {
    const items = raw.items
      .filter(c => c && typeof c === 'object')
      .map(c => ({ variable: c.variable || '', op: c.op || '>=', value: c.value ?? 0 }));
    return {
      cond_mode: raw.mode === 'or' ? 'or' : 'and',
      cond_items: items.length ? items : [{ variable: '', op: '>=', value: 0 }]
    };
  }
  if (raw.variable) {
    return { cond_mode: 'and', cond_items: [{ variable: raw.variable, op: raw.op || '>=', value: raw.value ?? 0 }] };
  }
  return { cond_mode: 'and', cond_items: [{ variable: '', op: '>=', value: 0 }] };
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
        ...parseChoiceConditions(b.conditions),
      }));
  } catch (e) {
    console.warn('加载分支选项失败:', e);
  }
};

const addChoice = (dialogue) => {
	pushHistory();
	markDirty();
	if (!dialogue._choices) dialogue._choices = [];
  dialogue._choices.push({
    choice_text: '',
    target_content_id: null,
    cond_mode: 'and',
    cond_items: [{ variable: '', op: '>=', value: 0 }],
  });
};

const addChoiceCondition = (dialogue, oi) => {
  pushHistory();
  markDirty();
  const opt = dialogue._choices?.[oi];
  if (!opt) return;
  if (!Array.isArray(opt.cond_items)) opt.cond_items = [];
  opt.cond_items.push({ variable: '', op: '>=', value: 0 });
};

const removeChoiceCondition = (dialogue, oi, ci) => {
  pushHistory();
  markDirty();
  const opt = dialogue._choices?.[oi];
  if (!opt || !Array.isArray(opt.cond_items)) return;
  opt.cond_items.splice(ci, 1);
  if (!opt.cond_items.length) {
    opt.cond_items.push({ variable: '', op: '>=', value: 0 });
  }
};

const hasChoiceCondition = (opt) =>
  (opt.cond_items || []).some(c => c && c.variable);

const removeChoice = (dialogue, i) => {
	pushHistory();
	markDirty();
	dialogue._choices.splice(i, 1);
};

// 图片选项配图：上传到当前项目素材目录，保存分支时写入 branch_paths.image_url
const handleChoiceImageUpload = async (options, opt) => {
	if (!projectId.value) {
		ElMessage.warning('项目信息加载中，请稍后再试');
		return;
	}
	try {
		const formData = new FormData();
		formData.append('file', options.file);
		formData.append('project_id', projectId.value);
		formData.append('file_type', 'image');
		const response = await uploadSceneFile(formData);
		if (response?.success && response?.data?.url) {
			pushHistory();
			markDirty();
			opt.image_url = response.data.url;
			options.onSuccess?.(response);
			ElMessage.success('选项配图已上传');
		} else {
			throw new Error(response?.message || '上传失败');
		}
	} catch (err) {
		console.error('选项配图上传失败:', err);
		ElMessage.error('上传失败：' + (err.message || '未知错误'));
		options.onError?.(err);
	}
};

const clearChoiceImage = (opt) => {
	pushHistory();
	markDirty();
	opt.image_url = '';
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
    for (const c of (it.cond_items || [])) {
      if (c.variable && !Number.isFinite(Number(c.value))) {
        ElMessage.error('显示条件的比较值必须是数字');
        return;
      }
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
      const condItems = (it.cond_items || [])
        .filter(c => c && c.variable)
        .map(c => ({
          variable: c.variable,
          op: c.op || '>=',
          value: Math.trunc(Number(c.value)),
        }));
      const conditions = condItems.length
        ? { mode: it.cond_mode === 'or' ? 'or' : 'and', items: condItems }
        : null;
      await createBranch(projectId.value, {
        source_content_id: dialogue.content_id,
        target_content_id: it.target_content_id,
        choice_text: it.choice_text.trim(),
        image_url: it.image_url || '',
        conditions: conditions,
      });
    }
    await ensureChoices(dialogue, true);
    ElMessage.success(`已保存 ${items.length} 个分支选项`);
    createProjectVersion(Number(projectId.value), '保存选项分支').catch(() => {});
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
	pushHistory();
	markDirty();
	const list = getDialogueEffects(dialogue);
	list.push({
		variable_id: variables.value[0]?.variable_id || null,
		delta: 1,
	});
};

const removeEffect = (dialogue, index) => {
	pushHistory();
	markDirty();
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

// 场景设置（含剧情锁）改动 → 标记 dirty 并防抖自动保存
watch(
	[scene, sceneLockMode, sceneLockItems],
	() => {
		if (!sceneReady.value) return;
		if (currentSceneSnapshot() === sceneSnapshot) {
			sceneDirty.value = false;
			return;
		}
		sceneDirty.value = true;
		scheduleSceneSave();
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
	clearTimeout(focusPulseTimer);
	clearTimeout(sceneSaveTimer);
	flushTextHistory();
	saveDraftNow();
	// 切场景时兜底保存场景设置，避免标题/背景/音乐改动被静默丢掉
	if (sceneDirty.value) persistSceneSettings({ silent: true, version: false });
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

.panel-tabs {
  display: flex;
  gap: 4px;
  background: #fdeef3;
  padding: 3px;
  border-radius: 9px;
}

.panel-tab {
  border: none;
  background: transparent;
  color: #a84463;
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.15s;
}

.panel-tab.is-active {
  background: #fff;
  color: #c81f4a;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(200, 31, 74, 0.12);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #8a6a76;
  margin-bottom: 7px;
}

.field-asset-btn {
  border: 1px solid #f0cfdc;
  background: #fff;
  color: #a84463;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 10px;
  cursor: pointer;
}

.field-asset-btn:hover {
  border-color: #ffafc3;
  color: #c81f4a;
}

/* 素材库选择弹窗 */
.asset-pick-state {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: #b37d8f;
}

.asset-pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  max-height: 60vh;
  overflow-y: auto;
}

.asset-pick-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px;
  border: 1px solid #f5e4ea;
  border-radius: 9px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}

.asset-pick-item:hover {
  border-color: #ffafc3;
}

.asset-pick-item.is-selected {
  border-color: #e8467c;
  box-shadow: 0 0 0 2px rgba(232, 70, 124, 0.12);
}

.asset-pick-item img {
  width: 100%;
  height: 76px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
  background: #fdf3f7;
}

.asset-pick-audio {
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  color: #c81f4a;
  background: #fdf3f7;
  border-radius: 6px;
}

.asset-pick-url {
  font-size: 10px;
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-pick-meta {
  font-size: 9px;
  color: #1f9d76;
}

/* 场景播放条件（剧情锁） */
.scene-lock {
  border: 1px dashed #f0d6df;
  border-radius: 10px;
  padding: 8px;
  background: #fffbfd;
}

.scene-lock-mode {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.scene-lock-mode-label {
  font-size: 11px;
  color: #8a6a76;
}

.scene-lock-row {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.scene-lock-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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

.bg-card-missing {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #b37d8f;
  background: repeating-linear-gradient(45deg, #fdf3f7, #fdf3f7 8px, #f8e6ee 8px, #f8e6ee 16px);
  line-height: 1.4;
}

.bg-missing-tip {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #b37d8f;
  background: linear-gradient(135deg, #fdf2f8 0%, #f8e6ee 100%);
  text-align: center;
  padding: 20px;
  z-index: 1;
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

.save-scene-btn:disabled {
  opacity: 0.7;
  cursor: wait;
  transform: none;
}

.scene-save-state {
  margin-top: 6px;
  text-align: center;
  font-size: 11px;
  color: #1f9d76;
}

.scene-save-state.is-dirty {
  color: #b4446a;
}

.hidden-audio { display: none; }

.dialogue-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.save-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #1f9d76;
  background: #eefaf4;
  border: 1px solid #cdeeda;
  border-radius: 8px;
  padding: 2px 7px;
  line-height: 1.4;
}

.save-state.is-dirty {
  color: #b4446a;
  background: #fdeef3;
  border-color: #f6d6e2;
}

.save-state::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #67c23a;
}

.save-state.is-dirty::before {
  background: #e8467c;
}

/* 多选批量操作 */
.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 8px 10px;
  background: #fdeef3;
  border: 1px solid #f6d6e2;
  border-radius: 9px;
}

.batch-count {
  font-size: 12px;
  color: #a84463;
}

/* 批量配音弹窗 */
.voice-batch-hint {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 10px;
  line-height: 1.6;
}

.voice-batch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.voice-batch-label {
  font-size: 12px;
  color: #8a6a76;
  flex-shrink: 0;
}

.voice-batch-select {
  flex: 1;
}

.voice-batch-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8a6a76;
  cursor: pointer;
}

.voice-batch-check input {
  accent-color: #e8467c;
}

.voice-batch-progress {
  margin-top: 12px;
  font-size: 12px;
  color: #a84463;
}

.voice-batch-bar {
  height: 6px;
  border-radius: 3px;
  background: #f6dce5;
  overflow: hidden;
  margin: 6px 0;
}

.voice-batch-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #e8467c, #ff9db5);
  transition: width 0.2s;
}

.voice-batch-current {
  font-size: 11px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-batch-errors {
  margin-top: 10px;
  max-height: 90px;
  overflow-y: auto;
  font-size: 11px;
  color: #c0392b;
  background: #fff5f7;
  border: 1px solid #f3c9d3;
  border-radius: 7px;
  padding: 6px 8px;
}

.dlg-select {
  margin-right: 2px;
}

.dlg-select :deep(.el-checkbox__inner) {
  border-color: #eab6c9;
}

.dlg-select :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #e8467c;
  border-color: #e8467c;
}

/* 批量导入剧本 */
.import-hint {
  font-size: 12px;
  color: #8a6a76;
  line-height: 1.7;
  margin-bottom: 10px;
}

.import-example {
  margin-top: 4px;
  padding: 4px 8px;
  background: #fdf3f7;
  border: 1px dashed #f0cfdc;
  border-radius: 6px;
  color: #a84463;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
}

.import-mode {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
  font-size: 12px;
  color: #6b4b56;
}

.import-mode-label {
  color: #a84463;
}

.import-radio {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}

.import-radio input {
  accent-color: #e8467c;
}
.dialogues-editor { display: flex; flex-direction: column; gap: 18px; }

.dialogue-editor-item {
  border: 1px solid #f5e4ea;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.25s ease;
  background: #ffffff;
}

/* 全项目搜索定位后的短暂高亮 */
.dialogue-editor-item.is-focused {
  border-color: #ff8fb0;
  box-shadow: 0 0 0 3px rgba(255, 123, 156, 0.18);
}

/* 对话卡内表单：纯 CSS 把标签移到上方，不依赖模板里的 label-position */
.dialogue-form {
  padding: 10px 16px 12px;
}

.dialogue-form :deep(.el-form-item) {
  display: block;
  margin-bottom: 9px;
}

.dialogue-form :deep(.el-form-item__label) {
  display: block !important;
  width: auto !important;
  padding: 0 0 2px !important;
  font-size: 11px;
  line-height: 1.4;
  color: #8a6a76;
  text-align: left !important;
  justify-content: flex-start;
}

.dialogue-form :deep(.el-form-item__content) {
  margin-left: 0 !important;
}

/* 卡片最后一项是「保存」：铺满整行，和场景设置的保存按钮呼应 */
.dialogue-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.dialogue-form :deep(.el-form-item:last-child .el-form-item__content) {
  width: 100%;
}

.dialogue-form :deep(.el-form-item:last-child .el-button) {
  width: 100%;
  border-radius: 8px;
  font-weight: 600;
}

/* 第一个字段（类型）与角色/立绘并排；用 inline-block 让内容换行后仍占满宽 */
.dialogue-form :deep(.el-form-item:first-child) {
  display: inline-block;
  width: 32%;
  margin-right: 1%;
  vertical-align: top;
}

.dialogue-form :deep(.el-form-item.dlg-inline) {
  display: inline-block;
  width: 32%;
  margin-right: 1%;
  vertical-align: top;
}

.dialogue-form :deep(.el-input__wrapper),
.dialogue-form :deep(.el-textarea__inner) {
  border-radius: 8px;
  box-shadow: 0 0 0 1px #f2e3e9 inset;
  background: #fffdfe;
}

.dialogue-form :deep(.el-input__wrapper.is-focus),
.dialogue-form :deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px #e8467c inset;
  background: #ffffff;
}

.dialogue-form :deep(.el-textarea__inner) {
  font-size: 13px;
  line-height: 1.6;
  font-family: inherit;
}

.dialogue-editor-item:hover {
  box-shadow: 0 4px 15px rgba(232, 70, 124, 0.08);
  border-color: #f3b9cc;
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

.bgm-toggle-btn {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 50;
  padding: 5px 10px;
  border-radius: 14px;
  border: 1px solid #ffc0d0;
  background: rgba(255, 255, 255, 0.92);
  color: #c81f4a;
  font-size: 11px;
  cursor: pointer;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
}

.bgm-toggle-btn.is-muted {
  border-color: #d9d9e3;
  color: #8a8a99;
  background: rgba(248, 248, 250, 0.92);
}

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

.character-image {
  height: 100%;
  width: auto;
  object-fit: contain;
  transition: opacity 0.3s ease;
  animation: preview-breathe 6s ease-in-out infinite;
}

@keyframes preview-breathe {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -8px; }
}

@media (prefers-reduced-motion: reduce) {
  .character-image,
  .preview-stage-avatar img { animation: none; }
}

/* 预览区：演出指令的三槽位立绘 */
.preview-stage {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.preview-stage-avatar {
  position: absolute;
  bottom: 0;
  height: 76%;
}

.preview-stage-avatar img {
  height: 100%;
  width: auto;
  object-fit: contain;
  display: block;
  animation: preview-breathe 6s ease-in-out infinite;
}

.preview-stage-avatar.pos-left { left: 5%; }
.preview-stage-avatar.pos-center { left: 50%; transform: translateX(-50%); }
.preview-stage-avatar.pos-right { right: 5%; }

/* 演出指令：前景图层（覆盖在立绘之上、对话框之下） */
.preview-foreground {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.preview-foreground img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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

.dialogue-display { position: absolute; bottom: 0; left: 0; right: 0; padding: 20px; z-index: 3; }

.dialogue-box {
  background: rgba(255, 252, 254, 0.94);
  border-radius: 12px;
  padding: 20px;
  max-width: 800px;
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
  font-size: 16px;
  margin-bottom: 10px;
  display: inline-block;
  padding-bottom: 4px;
  border-bottom: 2px solid #ffc0d0;
}

.dialogue-text {
  font-size: 18px;
  line-height: 1.7;
  color: #2c2c2c;
  margin-bottom: 15px;
  min-height: 100px;
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

/* 多条件组：关系选择 + 条件行 + 添加按钮 */
.choice-conditions {
  margin-top: 4px;
}

.choice-cond-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.choice-cond-label {
  font-size: 12px;
  color: #64748b;
}

.choice-cond-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
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

/* 图片选项：缩略图 + 上传按钮 */
.choice-image-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.choice-image-thumb {
  width: 54px;
  height: 38px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #f2d7e2;
}

/* 非「选择」节点的自动跳转 */
.jump-editor {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.jump-select {
  width: 280px;
}
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

.condition-btn {
  border-color: #e6d6c8 !important;
  color: #8a6a4b !important;
  background: #fffdf8 !important;
  padding: 5px 9px !important;
  font-size: 11px !important;
}

.condition-btn.has-condition {
  border-color: #e6a23c !important;
  color: #b88230 !important;
  background: #fdf6ec !important;
}

.node-cond-target {
  font-size: 12px;
  color: #8a6a76;
  background: #fffafc;
  border: 1px solid #f5e4ea;
  border-radius: 7px;
  padding: 7px 9px;
  margin-bottom: 8px;
  word-break: break-all;
}

.node-cond-hint {
  font-size: 11px;
  color: #b99aa5;
  line-height: 1.6;
  margin-bottom: 10px;
}

.rich-markup-tip {
  margin-top: 4px;
  font-size: 11px;
  color: #b99aa5;
  line-height: 1.5;
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

/* 立绘微调：X/Y 偏移、缩放、透明度、旋转 */
.dir-avatar-fine {
  display: flex;
  gap: 6px;
  width: 100%;
}

.dir-avatar-fine .el-input-number {
  width: 20%;
  min-width: 0;
}

/* 演出弹窗里的素材上传 */
.dir-upload { flex-shrink: 0; }
.dir-upload :deep(.el-upload) { display: inline-flex; }
.dir-preview {
  width: 44px;
  height: 30px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #f5e4ea;
  flex-shrink: 0;
}
</style>