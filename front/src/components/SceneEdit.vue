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
						<div class="field-label">场景标题 / 描述译文</div>
						<div class="dlg-translation-bar">
							<el-button
								size="small"
								plain
								:disabled="!scene.scene_id"
								title="翻译场景标题与描述"
								@click="openSceneTranslationDialog"
							>
								场景译文
								<span v-if="sceneTranslationCount" class="dlg-translation-count">{{ sceneTranslationCount }}</span>
							</el-button>
							<span
								v-for="lang in translatedSceneLanguages"
								:key="lang.code"
								class="dlg-translation-tag"
							>{{ lang.label }}</span>
						</div>
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
					<el-button size="small" :disabled="!canUndoAny" @click="undoLast">撤销</el-button>
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
								<div class="dlg-translation-bar">
									<el-button
										size="small"
										plain
										:disabled="!dialogue.content_id"
										:title="dialogue.content_id ? '编辑这条台词的逐句译文' : '先保存台词，再添加译文'"
										@click="openTranslationDialog(dialogue)"
									>
										译文
										<span v-if="translationCount(dialogue)" class="dlg-translation-count">{{ translationCount(dialogue) }}</span>
									</el-button>
									<span
										v-for="lang in translatedLanguages(dialogue)"
										:key="lang.code"
										class="dlg-translation-tag"
									>{{ lang.label }}</span>
									<span v-if="!dialogue.content_id" class="dlg-translation-hint">保存后可添加译文</span>
								</div>
							</el-form-item>

							<el-form-item
								label="情绪"
								class="dlg-inline"
								v-if="dialogue.content_type !== '选择'"
							>
								<el-select
									v-model="dialogue.emotion"
									clearable
									placeholder="默认（平静）"
									style="width: 100%"
								>
									<el-option
										v-for="e in emotionOptions"
										:key="e"
										:label="e"
										:value="e"
									></el-option>
								</el-select>
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
												:disabled="!opt.path_id"
												:title="opt.path_id ? '编辑这个选项的译文' : '先保存选择项，再添加译文'"
												@click="openChoiceTranslationDialog(opt)"
											>
												译
												<span v-if="choiceTranslationCount(opt)" class="dlg-translation-count">{{ choiceTranslationCount(opt) }}</span>
											</el-button>
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
					<el-select
						v-model="dirForm.character_id"
						size="small"
						placeholder="角色"
						class="dir-field"
						@change="onDirCharacterChange"
					>
						<el-option v-for="c in characters" :key="c.character_id" :label="c.name" :value="c.character_id" />
					</el-select>

					<!-- 表情/姿势轮盘：点缩略图快速切换该角色的立绘 -->
					<div v-if="dirCharacterAvatars.length" class="expr-wheel">
						<button
							v-for="a in dirCharacterAvatars"
							:key="a.avatar_id"
							type="button"
							class="expr-option"
							:class="{ selected: dirForm.avatar_id === a.avatar_id }"
							:title="avatarOptionLabel(a)"
							@click="dirForm.avatar_id = a.avatar_id"
						>
							<img :src="BASE_URL + a.image_url" alt="" />
							<span class="expr-name">{{ a.avatar_type }}</span>
							<span v-if="a.layers && a.layers.length" class="expr-badge">{{ a.layers.length }}差分</span>
						</button>
					</div>
					<p v-else-if="dirForm.character_id" class="expr-empty">该角色还没有立绘，请先去角色管理上传。</p>

					<!-- 素材直出：把素材库图片拖进来，不绑角色也能作为独立立绘层 -->
					<div
						class="dir-asset-drop"
						:class="{ 'is-over': dirAssetOver, 'has-image': !!dirForm.image_url }"
						@dragover.prevent="onDirAssetDragOver"
						@dragleave="dirAssetOver = false"
						@drop.prevent="onDirAssetDrop"
					>
						<img v-if="dirForm.image_url" :src="assetSrc(dirForm.image_url)" alt="" />
						<span class="dir-asset-tip">
							{{ dirForm.image_url ? '已选择素材图片（选择角色会清除）' : '也可把素材库图片拖到这里，作为独立立绘层' }}
						</span>
						<button
							v-if="dirForm.image_url"
							type="button"
							class="dir-asset-clear"
							@click.prevent="dirForm.image_url = ''"
						>清除</button>
					</div>

					<el-select v-model="dirForm.layer_id" size="small" class="dir-field-sm">
						<el-option label="＋ 新建图层" value="__new__" />
						<el-option
							v-for="l in avatarLayerOptions"
							:key="l.layer_id"
							:label="`${l.label}（层级 ${l.order}）`"
							:value="l.layer_id"
						/>
					</el-select>
					<el-input
						v-if="dirForm.layer_id === '__new__'"
						v-model="dirForm.layer_name"
						size="small"
						class="dir-field-sm"
						placeholder="新图层名"
					/>
					<el-select v-model="dirForm.action" size="small" class="dir-field-sm">
						<el-option label="显示" value="show" />
						<el-option label="隐藏" value="hide" />
					</el-select>
					<div class="dir-avatar-fine">
						<el-input-number v-model="dirForm.x" :min="0" :max="100" :controls="false" size="small" placeholder="X%" title="图层中心 X（%）" />
						<el-input-number v-model="dirForm.y" :min="0" :max="100" :controls="false" size="small" placeholder="Y%" title="图层底边 Y（%）" />
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
			<label class="voice-batch-check">
				<input v-model="voiceBatchUseEmotion" type="checkbox" :disabled="voiceBatchRunning" />
				<span>按台词情绪调整语速/音调（生气更快、低声更慢、哭腔更轻）</span>
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

		<!-- 逐句译文：一条台词在多种语言下的文本，缺失时播放器回退原文 -->
		<el-dialog
			v-model="translationDialogVisible"
			title="逐句译文"
			width="520px"
			append-to-body
		>
			<div v-if="translationTarget" class="dlg-translation-dialog">
				<div class="dlg-translation-original">
					<span class="dlg-translation-label">简体中文（原文）</span>
					<p>{{ translationTarget.content_text || '（空）' }}</p>
				</div>
				<div class="dlg-translation-row">
					<span class="dlg-translation-label">目标语言</span>
					<el-select v-model="translationLang" size="small" style="width: 160px" @change="onTranslationLangChange">
						<el-option
							v-for="lang in TRANSLATION_LANGUAGES"
							:key="lang.code"
							:label="lang.label"
							:value="lang.code"
						/>
					</el-select>
					<button type="button" class="dlg-translation-copy" @click="translationText = translationTarget.content_text || ''">
						复制原文
					</button>
				</div>
				<el-input
					v-model="translationText"
					type="textarea"
					:rows="5"
					placeholder="留空保存会删除该语言译文；缺失时播放器自动回退原文"
				/>
				<p class="dlg-translation-tip">
					保存后，播放器切到 {{ translationLabel(translationLang) }} 时优先显示这条译文。
				</p>
			</div>
			<template #footer>
				<el-button @click="translationDialogVisible = false">取消</el-button>
				<el-button type="primary" :loading="translationSaving" @click="saveTranslation">保存译文</el-button>
			</template>
		</el-dialog>

		<!-- 场景标题/描述译文 -->
		<el-dialog
			v-model="sceneTransVisible"
			title="场景译文"
			width="520px"
			append-to-body
		>
			<div class="dlg-translation-dialog">
				<div class="dlg-translation-original">
					<span class="dlg-translation-label">简体中文（原文）</span>
					<p>{{ scene.title || '（无标题）' }}</p>
					<p v-if="scene.description" class="scene-trans-original-desc">{{ scene.description }}</p>
				</div>
				<div class="dlg-translation-row">
					<span class="dlg-translation-label">目标语言</span>
					<el-select v-model="sceneTransLang" size="small" style="width: 160px" @change="onSceneTransLangChange">
						<el-option
							v-for="lang in TRANSLATION_LANGUAGES"
							:key="lang.code"
							:label="lang.label"
							:value="lang.code"
						/>
					</el-select>
				</div>
				<el-input v-model="sceneTransTitle" placeholder="译后标题" />
				<el-input
					v-model="sceneTransDescription"
					type="textarea"
					:rows="4"
					placeholder="译后描述（可空）"
				/>
				<p class="dlg-translation-tip">
					播放器切到 {{ translationLabel(sceneTransLang) }} 时优先显示译文；全部留空保存会清除该语言译文。
				</p>
			</div>
			<template #footer>
				<el-button @click="sceneTransVisible = false">取消</el-button>
				<el-button type="primary" :loading="sceneTransSaving" @click="saveSceneTranslations">保存译文</el-button>
			</template>
		</el-dialog>

		<!-- 选项译文 -->
		<el-dialog
			v-model="choiceTransVisible"
			title="选项译文"
			width="480px"
			append-to-body
		>
			<div class="dlg-translation-dialog">
				<div class="dlg-translation-original">
					<span class="dlg-translation-label">简体中文（原文）</span>
					<p>{{ choiceTransTarget?.choice_text || '（空）' }}</p>
				</div>
				<div class="dlg-translation-row">
					<span class="dlg-translation-label">目标语言</span>
					<el-select v-model="choiceTransLang" size="small" style="width: 160px" @change="onChoiceTransLangChange">
						<el-option
							v-for="lang in TRANSLATION_LANGUAGES"
							:key="lang.code"
							:label="lang.label"
							:value="lang.code"
						/>
					</el-select>
				</div>
				<el-input
					v-model="choiceTransText"
					type="textarea"
					:rows="3"
					placeholder="留空保存会清除该语言译文"
				/>
				<p class="dlg-translation-tip">
					播放器切到 {{ translationLabel(choiceTransLang) }} 时优先显示这条选项译文。
				</p>
			</div>
			<template #footer>
				<el-button @click="choiceTransVisible = false">取消</el-button>
				<el-button type="primary" :loading="choiceTransSaving" @click="saveChoiceTranslation">保存译文</el-button>
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
import { listNodeDirectives, createDirective, updateDirective, deleteDirective } from '@/api/directive'
import { createProjectVersion } from '@/api/version'
import { saveContentTranslation, saveSceneTranslation, saveBranchTranslation, TRANSLATION_LANGUAGES, translationLabel } from '@/api/translation'
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
  MagicStick,
  Promotion  
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { updateScene, uploadSceneFile, listSceneLocks, setSceneLock } from '@/api/scenes';
import SceneStagePreview from '@/components/SceneStagePreview.vue';

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
	if (top && JSON.stringify(top.snapshot) === str) return;
	undoStack.value.push({ at: Date.now(), snapshot: snap });
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
	redoStack.value.push({ at: Date.now(), snapshot: cloneDialogues() });
	applySnapshot(undoStack.value.pop().snapshot);
};

const redo = () => {
	if (!redoStack.value.length) return;
	undoStack.value.push({ at: Date.now(), snapshot: cloneDialogues() });
	applySnapshot(redoStack.value.pop().snapshot);
};

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
// 配音导演：台词情绪标签（与后端 EMOTION_OPTIONS 一致）
const emotionOptions = ['平静', '犹豫', '生气', '哭腔', '低声'];
const voiceBatchVisible = ref(false);
const voiceBatchVoice = ref('BV001_streaming');
const voiceBatchOverwrite = ref(false);
const voiceBatchUseCharacter = ref(true);
const voiceBatchUseEmotion = ref(true);
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
				const emotion = voiceBatchUseEmotion.value ? (dialogue.emotion || '') : '';
				const info = await submitAndWait(
					() => generateVoice({ text, voice_type: voiceType, emotion }),
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
// 舞台直接拖拽立绘（画布第一版）：拖动后写回 avatar 演出指令
const stageEditing = ref(false);
// 拖拽网格吸附：0 = 关闭，5 = 吸附到 5% 网格
const stageGridSnap = ref(0);
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
const dirAssetOver = ref(false);
const dirForm = ref({
	character_id: null,
	avatar_id: null,
	image_url: '',
	layer_id: '__new__',
	layer_name: '',
	action: 'show',
	x: 50,
	y: 100,
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
		const layerName = p.layer_name || layerNameOf(p);
		const base = `${c ? c.name : '角色'} · ${layerName} · ${p.action === 'hide' ? '隐藏' : '显示'}`;
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
	// 新增立绘指令时默认选中当前说话的角色；优先复用该角色已有图层
	const matchedLayer = avatarLayerOptions.value.find(l => l.character_id === d.character_id);
	const defaultAvatarId = d.avatar_id || defaultAvatarIdOf(d.character_id);
	dirForm.value = {
		character_id: d.character_id || null,
		avatar_id: defaultAvatarId,
		image_url: '',
		layer_id: matchedLayer ? matchedLayer.layer_id : '__new__',
		layer_name: matchedLayer ? matchedLayer.label : nextLayerName(),
		action: 'show',
		x: nextFreeStageX(),
		y: 100,
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
		if (!dirForm.value.character_id && !dirForm.value.image_url) {
			ElMessage.warning('请选择角色，或拖入一张素材图片');
			return;
		}
		const isNewLayer = !dirForm.value.layer_id || dirForm.value.layer_id === '__new__';
		if (isNewLayer && avatarLayers.value.length >= MAX_AVATAR_LAYERS) {
			ElMessage.warning(`最多 ${MAX_AVATAR_LAYERS} 个立绘图层`);
			return;
		}
		const layerId = isNewLayer
			? `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
			: dirForm.value.layer_id;
		const layerMeta = avatarLayerOptions.value.find(l => l.layer_id === layerId);
		const layerName = layerMeta?.label || dirForm.value.layer_name?.trim() || nextLayerName();
		const order = layerMeta ? layerMeta.order : nextLayerOrder();
		const rawX = dirForm.value.x === '' || dirForm.value.x === null ? 50 : Number(dirForm.value.x);
		const rawY = dirForm.value.y === '' || dirForm.value.y === null ? 100 : Number(dirForm.value.y);
		payload = {
			layer_id: layerId,
			layer_name: layerName,
			order,
			character_id: dirForm.value.character_id || null,
			avatar_id: dirForm.value.image_url ? null : (dirForm.value.avatar_id || null),
			image_url: dirForm.value.image_url || null,
			action: dirForm.value.action,
			coord: 'stage',
			x: Number.isFinite(rawX) ? Math.max(0, Math.min(100, rawX)) : 50,
			y: Number.isFinite(rawY) ? Math.max(0, Math.min(100, rawY)) : 100,
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

	snapshotStageDirectives(directiveContentId.value);
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
		stageUndoStack.value.pop();
		ElMessage.error('添加失败');
	}
};

const removeDirective = async (d) => {
	snapshotStageDirectives(directiveContentId.value);
	try {
		await deleteDirective(Number(projectId.value), d.directive_id);
		await loadDirectives(directiveContentId.value);
		syncPreviewIfCurrent(directiveContentId.value);
	} catch (e) {
		stageUndoStack.value.pop();
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
// 传给 StagePreview 的纯展示数据，避免子组件依赖角色/富文本逻辑
const currentSpeakerName = computed(() => getCharacterName(currentDialogue.value?.character_id));
const currentDialogueHtml = computed(() => richPreviewHtml(currentDialogue.value?.content_text || ''));

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
		// 等新台词渲染后再取 audio，否则 play 的是上一条语音
		nextTick(() => {
			const audioElement = document.querySelector('.dialogue-box audio');
			if (audioElement) audioElement.play().catch(e => console.log('自动播放失败:', e));
		});
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

// 资源热重载：预览图统一走 assetSrc，给项目内静态资源加时间戳绕过浏览器缓存
const assetNonce = ref(0)
const assetSrc = (url) => {
	if (!url) return ''
	const raw = String(url)
	// data:/blob: 是内联内容，追加查询参数会直接破坏地址
	if (/^(data:|blob:)/i.test(raw)) return raw
	// 外链可能带签名或自身查询参数，不做热重载改写
	if (/^https?:/i.test(raw)) return raw
	const base = raw.startsWith('/assets/') || raw.startsWith('/src/')
		? raw
		: (raw.startsWith('/') ? BASE_URL + raw : `${BASE_URL}/${raw}`)
	const sep = base.includes('?') ? '&' : '?'
	return `${base}${sep}v=${assetNonce.value}`
}

// 立绘差分层：返回 [基础图, ...叠加层]；按 order 从小到大
const avatarLayersOf = (avatarId) => {
	if (!avatarId) return [];
	for (const char of characters.value) {
		const avatar = (char.avatars || []).find(a => a.avatar_id === avatarId);
		if (!avatar || !avatar.image_url) continue;
		const layers = (avatar.layers || [])
			.filter(l => l && l.image_url)
			.slice()
			.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
			.map(l => assetSrc(l.image_url));
		return [assetSrc(avatar.image_url), ...layers];
	}
	return [];
};

/* ===== 预览区：按当前对话的演出指令渲染 ===== */
const previewDirectives = ref([]);

const defaultAvatarSources = (characterId) => {
	if (!characterId) return [];
	const char = characters.value.find(c => c.character_id === characterId);
	if (!char) return [];
	const list = char.avatars || [];
	const def = list.find(a => a.is_default) || list[0];
	if (def && def.avatar_id) {
		const layers = avatarLayersOf(def.avatar_id);
		if (layers.length) return layers;
	}
	return char.avatar_url ? [assetSrc(char.avatar_url)] : [];
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

const previewAvatarSources = computed(() => {
	const d = previewSpeaker.value;
	if (!d) return [];
	const byAvatar = avatarLayersOf(d.avatar_id);
	if (byAvatar.length) return byAvatar;
	return defaultAvatarSources(d.character_id);
});

const previewAvatarSrc = computed(() => previewAvatarSources.value[0] || '');

// 预览区也按富文本标记渲染，避免作者看到 ** / [color] 等原始标记
const richPreviewHtml = (text) => renderRichHtml(parseRichText(text || ''), Infinity);

// ===== 舞台图层模型：任意数量图层，layer_id 稳定标识，order 为显式层级 =====
const MAX_AVATAR_LAYERS = 8;
const LEGACY_POSITION_ORDER = { left: 0, center: 1, right: 2 };
const layerIdOf = (p = {}) => p.layer_id || p.position || 'center';
const layerNameOf = (p = {}) => p.layer_name || ({ left: '左侧', center: '中间', right: '右侧' }[p.position] || '立绘');
const layerOrderOf = (p = {}) => {
	if (p.order !== undefined && p.order !== null && Number.isFinite(Number(p.order))) return Number(p.order);
	if (p.z !== undefined && p.z !== null && Number.isFinite(Number(p.z))) return Number(p.z);
	return LEGACY_POSITION_ORDER[p.position || 'center'] ?? 0;
};
const stageDefaultX = (layerId) => {
	if (layerId === 'left') return 20;
	if (layerId === 'right') return 80;
	return 50;
};

const previewSlots = computed(() => {
	const slots = {};
	for (const d of previewDirectives.value) {
		if (d.directive_type !== 'avatar') continue;
		const p = d.payload || {};
		const layerId = layerIdOf(p);
		if (p.action === 'hide') {
			delete slots[layerId];
			continue;
		}
		const assetImage = p.image_url ? [assetSrc(p.image_url)] : [];
		const sources = assetImage.length
			? assetImage
			: (avatarLayersOf(p.avatar_id).length ? avatarLayersOf(p.avatar_id) : defaultAvatarSources(p.character_id));
		const src = sources[0];
		if (!src) continue;
		// 旧指令用 position + sprite 坐标；统一折算成舞台坐标，任意图层都走同一套渲染
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
		const style = {
			transform: `scale(${scale}) rotate(${rotate}deg)`,
			opacity
		};
		slots[layerId] = {
			src,
			sources,
			style,
			boxStyle,
			coord: 'stage',
			visible,
			order,
			layer_id: layerId,
			layer_name: layerNameOf(p),
			x,
			y,
			scale,
			opacity,
			rotate,
			character_id: p.character_id,
			avatar_id: p.avatar_id
		};
	}
	return slots;
});

const hasPreviewSlots = computed(() => Object.keys(previewSlots.value).length > 0);

// 图层列表：order 越高越靠前（列表展示时再倒序）
const avatarLayers = computed(() => Object.values(previewSlots.value)
	.map(slot => ({
		layer_id: slot.layer_id,
		label: slot.layer_name || slot.layer_id,
		exists: true,
		visible: slot.visible !== false,
		order: slot.order
	}))
	.sort((a, b) => a.order - b.order));

// 舞台层可见性（背景/前景/对话框）：由节点级 stage 指令控制，缺省全部可见
const stageVisibility = computed(() => {
	const base = { background: true, foreground: true, dialogue: true };
	for (const d of previewDirectives.value) {
		if (d.directive_type !== 'stage') continue;
		const p = d.payload || {};
		if (typeof p.background === 'boolean') base.background = p.background;
		if (typeof p.foreground === 'boolean') base.foreground = p.foreground;
		if (typeof p.dialogue === 'boolean') base.dialogue = p.dialogue;
	}
	return base;
});

const previewBgSrc = computed(() => {
	if (!stageVisibility.value.background) return '';
	let bg = '';
	for (const d of previewDirectives.value) {
		if (d.directive_type !== 'background') continue;
		const p = d.payload || {};
		if (p.layer === 'foreground') continue;
		bg = p.url || '';
	}
	if (bg) return assetSrc(bg);
	return scene.value.background_url ? assetSrc(scene.value.background_url) : defaultBackground;
});

// 背景/前景是否存在真实资源（与是否被隐藏无关，供图层列表判断"空/已设置"）
const bgAvailable = computed(() => {
	for (const d of previewDirectives.value) {
		if (d.directive_type !== 'background') continue;
		const p = d.payload || {};
		if (p.layer === 'foreground') continue;
		if (p.url) return true;
	}
	return !!scene.value.background_url;
});

const fgAvailable = computed(() => {
	for (const d of previewDirectives.value) {
		if (d.directive_type !== 'background') continue;
		const p = d.payload || {};
		if (p.layer === 'foreground' && p.url) return true;
	}
	return false;
});

const previewFgSrc = computed(() => {
	if (!stageVisibility.value.foreground) return '';
	let fg = '';
	for (const d of previewDirectives.value) {
		if (d.directive_type !== 'background') continue;
		const p = d.payload || {};
		if (p.layer !== 'foreground') continue;
		fg = p.url || '';
	}
	return fg ? assetSrc(fg) : '';
});

// 场景设置里的背景图 404 降级；舞台预览的裂图由 SceneStagePreview 自己处理
const settingsBgFailed = ref(false);
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

/* ===== 舞台撤销栈：覆盖当前台词全部演出指令（立绘/背景/音乐/音效/效果/停顿） ===== */
// 每次写操作前对「当前台词的全部指令」做快照入栈；演出弹窗的增删改也走同一栈。
// 栈顶一步持久化到 localStorage，刷新后若服务端指令未变，仍可撤销。
const stageUndoStack = ref([]);
const canUndoAvatar = computed(() => stageUndoStack.value.length > 0);

const stageUndoStorageKey = (contentId) => `aigc:stageUndo:${projectId.value}:${contentId}`;
const directivesFingerprint = (rows) => JSON.stringify(
	rows.map(r => [r.directive_id, r.directive_type, r.order_num, r.payload]).sort()
);

const persistStageUndo = () => {
	const top = stageUndoStack.value[stageUndoStack.value.length - 1];
	if (!top || !top.contentId) return;
	try {
		// 只持久化栈顶：刷新后恢复一步，避免旧快照覆盖服务端新改动
		localStorage.setItem(stageUndoStorageKey(top.contentId), JSON.stringify(top));
	} catch (e) {
		console.warn('持久化撤销栈失败:', e);
	}
};

// 写操作成功后调用：记录"操作后"指纹，刷新后据此判断快照是否仍然有效
const markStageUndoApplied = () => {
	const top = stageUndoStack.value[stageUndoStack.value.length - 1];
	if (!top) return;
	top.after = directivesFingerprint(previewDirectives.value.map(d => ({
		directive_id: d.directive_id,
		directive_type: d.directive_type,
		order_num: d.order_num,
		payload: d.payload || {}
	})));
	persistStageUndo();
};

const clearPersistedStageUndo = (contentId) => {
	if (!contentId) return;
	try { localStorage.removeItem(stageUndoStorageKey(contentId)); } catch (e) {}
};

// 刷新/切台词后：校验服务端指令指纹与快照基线一致才恢复，否则丢弃
const restorePersistedStageUndo = (contentId) => {
	if (!contentId) return;
	try {
		const raw = localStorage.getItem(stageUndoStorageKey(contentId));
		if (!raw) return;
		const saved = JSON.parse(raw);
		if (!saved || !Array.isArray(saved.rows)) { clearPersistedStageUndo(contentId); return; }
		const baseline = saved.baseline;
		const after = saved.after;
		const current = directivesFingerprint(previewDirectives.value.map(d => ({
			directive_id: d.directive_id,
			directive_type: d.directive_type,
			order_num: d.order_num,
			payload: d.payload || {}
		})));
		// 当前服务端应处于"操作后"状态；若仍处于"操作前"说明没生效，也无需撤销
		const valid = (after && current === after) || (!after && current === baseline);
		if (!valid) {
			// 服务端已被其它修改，快照失效
			clearPersistedStageUndo(contentId);
			return;
		}
		// 同一 contentId 只保留一条持久化快照，避免重复
		stageUndoStack.value = stageUndoStack.value.filter(e => String(e.contentId) !== String(contentId));
		stageUndoStack.value.push({ contentId: Number(contentId), rows: saved.rows, at: saved.at || Date.now() });
	} catch (e) {
		console.warn('恢复撤销栈失败:', e);
	}
};

const snapshotStageDirectives = (contentId) => {
	const cid = Number(contentId || currentDialogue.value?.content_id || 0);
	const source = cid && String(cid) === String(currentDialogue.value?.content_id || '')
		? previewDirectives.value
		: directives.value;
	const rows = source.map(d => ({
		directive_id: d.directive_id,
		directive_type: d.directive_type,
		order_num: d.order_num,
		payload: { ...(d.payload || {}) }
	}));
	// baseline = 快照时刻服务端状态指纹；刷新后据此校验快照是否还有效
	const entry = { contentId: cid, rows, baseline: directivesFingerprint(rows), at: Date.now() };
	stageUndoStack.value.push(entry);
	if (stageUndoStack.value.length > 20) stageUndoStack.value.shift();
	// 新的舞台操作让台词重做失效，保持统一撤销的线性语义
	redoStack.value = [];
	persistStageUndo();
};

const undoAvatar = async () => {
	const entry = stageUndoStack.value.pop();
	if (!entry) return;
	const pid = Number(projectId.value);
	const contentId = Number(entry.contentId || currentDialogue.value?.content_id || 0);
	if (!pid || !contentId) return;
	const snapshot = entry.rows;
	try {
		const current = await listNodeDirectives(pid, contentId);
		// 删除当前多出来的，再按快照逐条恢复 payload/order_num/type
		const snapshotIds = new Set(snapshot.map(r => r.directive_id));
		for (const d of current) {
			if (!snapshotIds.has(d.directive_id)) await deleteDirective(pid, d.directive_id);
		}
		for (const row of snapshot) {
			const live = current.find(d => d.directive_id === row.directive_id);
			if (live) {
				await updateDirective(pid, row.directive_id, {
					payload: row.payload,
					order_num: row.order_num,
					directive_type: row.directive_type
				});
			} else {
				await createDirective(pid, {
					content_id: contentId,
					directive_type: row.directive_type,
					payload: row.payload
				});
			}
		}
		await loadPreviewDirectives(contentId);
		await loadDirectives(contentId);
		// 撤销后栈顶变化：同步持久化（空栈则清除）
		const top = stageUndoStack.value[stageUndoStack.value.length - 1];
		if (top) persistStageUndo();
		else clearPersistedStageUndo(contentId);
		ElMessage.success('已撤销上一步');
	} catch (e) {
		console.error('撤销失败:', e);
		ElMessage.error('撤销失败: ' + (e.message || '未知错误'));
	}
};

// 统一撤销：台词栈与舞台栈按操作时间比较，撤销更近的一步
const canUndoAny = computed(() => undoStack.value.length > 0 || stageUndoStack.value.length > 0);
const undoLast = () => {
	const dTop = undoStack.value[undoStack.value.length - 1];
	const sTop = stageUndoStack.value[stageUndoStack.value.length - 1];
	if (!dTop && !sTop) return;
	const dAt = dTop ? (dTop.at || 0) : -1;
	const sAt = sTop ? (sTop.at || 0) : -1;
	if (sAt >= dAt) undoAvatar();
	else undo();
};

// 角色立绘缩略图：表情/姿势轮盘的数据源
const avatarsOfCharacter = (characterId) => {
	if (!characterId) return [];
	const c = characters.value.find(x => x.character_id === characterId);
	return (c?.avatars || []).slice();
};

const dirCharacterAvatars = computed(() => avatarsOfCharacter(dirForm.value.character_id));

const defaultAvatarIdOf = (characterId) => {
	const list = avatarsOfCharacter(characterId);
	const def = list.find(a => a.is_default) || list[0];
	return def ? def.avatar_id : null;
};

const onDirCharacterChange = (characterId) => {
	dirForm.value.avatar_id = defaultAvatarIdOf(characterId);
	// 选了角色就清掉素材直出图片，避免「角色立绘」和「素材图」同时挂在一层
	dirForm.value.image_url = '';
	// 选中的既有图层若属于其他角色，自动切回「新建图层」，避免把两个人叠进同一层
	const layer = avatarLayerOptions.value.find(l => l.layer_id === dirForm.value.layer_id);
	if (layer && layer.character_id && layer.character_id !== characterId) {
		dirForm.value.layer_id = '__new__';
		dirForm.value.layer_name = nextLayerName();
	}
};

// 多角色入场自动站位：挑一个没被占用的 X 坐标
const STAGE_ENTRY_XS = [50, 25, 75, 18, 82, 35, 65];
const nextFreeStageX = () => {
	const used = Object.values(previewSlots.value)
		.filter(Boolean)
		.filter(s => s.visible !== false)
		.map(s => Number(s.x))
		.filter(v => Number.isFinite(v));
	for (const x of STAGE_ENTRY_XS) {
		if (!used.some(u => Math.abs(u - x) < 9)) return x;
	}
	return 50;
};

// 演出指令弹窗用：按前台→后台展示已有图层
const avatarLayerOptions = computed(() => avatarLayers.value
	.slice()
	.sort((a, b) => b.order - a.order)
	.map(l => {
		const slot = previewSlots.value[l.layer_id];
		return {
			layer_id: l.layer_id,
			label: l.label,
			order: l.order,
			character_id: slot?.character_id ?? null
		};
	}));

const nextLayerOrder = () => (avatarLayers.value.length
	? Math.max(...avatarLayers.value.map(l => Number(l.order) || 0)) + 1
	: 0);

const nextLayerName = () => `立绘 ${avatarLayers.value.length + 1}`;

const layerMetaFor = (layerId) => {
	const hit = avatarLayers.value.find(l => l.layer_id === layerId);
	return {
		layer_id: layerId,
		layer_name: hit?.label || ({ left: '左侧', center: '中间', right: '右侧' }[layerId] || '立绘'),
		order: hit ? Number(hit.order) || 0 : nextLayerOrder()
	};
};

// 找当前台词某个图层最后一条可显示 avatar 指令
const findAvatarDirective = (layerId) => previewDirectives.value
	.filter(d => d.directive_type === 'avatar')
	.filter(d => layerIdOf(d.payload || {}) === layerId)
	.filter(d => d.payload?.action !== 'hide')
	.pop();

const handleAvatarVisibility = async (layerId, visible) => {
	const dialogue = currentDialogue.value;
	if (!dialogue?.content_id) { ElMessage.warning('请先保存当前台词'); return; }
	const pid = Number(projectId.value);
	const contentId = Number(dialogue.content_id);
	const existing = findAvatarDirective(layerId);
	if (!existing) { ElMessage.warning('该图层还没有立绘'); return; }
	snapshotStageDirectives();
	try {
		await updateDirective(pid, existing.directive_id, {
			payload: { ...(existing.payload || {}), visible }
		});
		await loadPreviewDirectives(contentId);
		await loadDirectives(contentId);
		markStageUndoApplied();
		ElMessage.success(visible ? '立绘已显示' : '立绘已隐藏');
	} catch (e) {
		stageUndoStack.value.pop();
		console.error('切换立绘显隐失败:', e);
		ElMessage.error('切换显隐失败: ' + (e.message || '未知错误'));
	}
};

// 把图层顺序写回所有 avatar 指令：layerIds 按从后到前排列
const applyAvatarLayerOrders = async (layerIds) => {
	const pid = Number(projectId.value);
	const contentId = Number(currentDialogue.value?.content_id || 0);
	if (!pid || !contentId) return false;
	const wanted = new Map(layerIds.map((id, idx) => [id, idx]));
	snapshotStageDirectives();
	try {
		for (const d of previewDirectives.value.filter(x => x.directive_type === 'avatar')) {
			const id = layerIdOf(d.payload || {});
			const order = wanted.get(id);
			if (order === undefined) continue;
			await updateDirective(pid, d.directive_id, {
				payload: { ...(d.payload || {}), layer_id: id, order }
			});
		}
		await loadPreviewDirectives(contentId);
		await loadDirectives(contentId);
		markStageUndoApplied();
		return true;
	} catch (e) {
		stageUndoStack.value.pop();
		throw e;
	}
};

const orderedAvatarLayerIds = () => avatarLayers.value
	.slice()
	.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
	.map(l => l.layer_id);

const handleAvatarOrder = async (layerId, direction) => {
	const ids = orderedAvatarLayerIds();
	const index = ids.indexOf(layerId);
	const target = index + (direction === 'up' ? 1 : -1);
	if (index < 0 || target < 0 || target >= ids.length) return;
	[ids[index], ids[target]] = [ids[target], ids[index]];
	try {
		await applyAvatarLayerOrders(ids);
		ElMessage.success(`图层已${direction === 'up' ? '上移' : '下移'}`);
	} catch (e) {
		console.error('调整层级失败:', e);
		ElMessage.error('调整层级失败: ' + (e.message || '未知错误'));
	}
};

// 图层列表拖拽排序：把 from 放到 to 的位置，重排所有图层的 order
const handleAvatarReorder = async (from, to) => {
	const ids = orderedAvatarLayerIds();
	const fromIdx = ids.indexOf(from);
	const toIdx = ids.indexOf(to);
	if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
	ids.splice(fromIdx, 1);
	ids.splice(toIdx, 0, from);
	try {
		await applyAvatarLayerOrders(ids);
		ElMessage.success('图层层级已调整');
	} catch (e) {
		console.error('图层排序失败:', e);
		ElMessage.error('图层排序失败: ' + (e.message || '未知错误'));
	}
};

// 删除图层：清掉该图层在当前节点的全部 avatar 指令
const handleAvatarRemove = async (layerId) => {
	const dialogue = currentDialogue.value;
	if (!dialogue?.content_id) { ElMessage.warning('请先保存当前台词'); return; }
	const pid = Number(projectId.value);
	const contentId = Number(dialogue.content_id);
	const rows = previewDirectives.value.filter(d =>
		d.directive_type === 'avatar' && layerIdOf(d.payload || {}) === layerId
	);
	if (!rows.length) return;
	snapshotStageDirectives();
	try {
		for (const d of rows) await deleteDirective(pid, d.directive_id);
		await loadPreviewDirectives(contentId);
		await loadDirectives(contentId);
		markStageUndoApplied();
		ElMessage.success('图层已删除');
	} catch (e) {
		stageUndoStack.value.pop();
		console.error('删除图层失败:', e);
		ElMessage.error('删除图层失败: ' + (e.message || '未知错误'));
	}
};

// 重命名图层：更新该图层在当前节点的全部 avatar 指令
const handleAvatarRename = async (layerId) => {
	const dialogue = currentDialogue.value;
	if (!dialogue?.content_id) { ElMessage.warning('请先保存当前台词'); return; }
	const layer = avatarLayers.value.find(l => l.layer_id === layerId);
	if (!layer) return;
	let nextName = '';
	try {
		const result = await ElMessageBox.prompt('图层名称', '重命名图层', {
			inputValue: layer.label,
			confirmButtonText: '保存',
			cancelButtonText: '取消',
			inputValidator: (v) => (String(v || '').trim() ? true : '请输入图层名称')
		});
		nextName = String(result.value || '').trim().slice(0, 30);
	} catch (e) {
		return;
	}
	if (!nextName || nextName === layer.label) return;
	const pid = Number(projectId.value);
	const contentId = Number(dialogue.content_id);
	const rows = previewDirectives.value.filter(d =>
		d.directive_type === 'avatar' && layerIdOf(d.payload || {}) === layerId
	);
	if (!rows.length) return;
	snapshotStageDirectives();
	try {
		for (const d of rows) {
			await updateDirective(pid, d.directive_id, {
				payload: { ...(d.payload || {}), layer_id: layerId, layer_name: nextName }
			});
		}
		await loadPreviewDirectives(contentId);
		await loadDirectives(contentId);
		markStageUndoApplied();
		ElMessage.success('图层已重命名');
	} catch (e) {
		stageUndoStack.value.pop();
		console.error('重命名图层失败:', e);
		ElMessage.error('重命名图层失败: ' + (e.message || '未知错误'));
	}
};

// 背景/前景/对话框显隐：写入节点级 stage 指令
const handleStageVisibility = async (layerKey, visible) => {
	const dialogue = currentDialogue.value;
	if (!dialogue?.content_id) { ElMessage.warning('请先保存当前台词'); return; }
	const pid = Number(projectId.value);
	const contentId = Number(dialogue.content_id);
	const existing = previewDirectives.value.filter(d => d.directive_type === 'stage').pop();
	const next = { ...(existing?.payload || {}), [layerKey]: visible };
	snapshotStageDirectives();
	try {
		if (existing) {
			await updateDirective(pid, existing.directive_id, { payload: next });
		} else {
			await createDirective(pid, { content_id: contentId, directive_type: 'stage', payload: next });
		}
		await loadPreviewDirectives(contentId);
		await loadDirectives(contentId);
		markStageUndoApplied();
		ElMessage.success(visible ? '已显示' : '已隐藏');
	} catch (e) {
		stageUndoStack.value.pop();
		console.error('切换舞台层显隐失败:', e);
		ElMessage.error('切换显隐失败: ' + (e.message || '未知错误'));
	}
};

// 舞台拖拽：支持多选成组移动，把像素位移折算成每个图层的 x/y 百分比
const handleAvatarGroupMove = async ({ updates }) => {
	const dialogue = currentDialogue.value;
	if (!dialogue?.content_id) {
		ElMessage.warning('请先保存当前台词，再调整立绘位置');
		return;
	}
	const pid = Number(projectId.value);
	if (!pid) return;
	const list = Array.isArray(updates) ? updates : [];
	if (!list.length) return;
	const contentId = Number(dialogue.content_id);
	const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
	const missing = list.filter(u => !findAvatarDirective(u.layerId || 'center'));
	const speaker = previewSpeaker.value || dialogue;
	if (missing.length && !speaker?.character_id) {
		ElMessage.warning('当前台词没有角色，无法添加立绘');
		return;
	}
	if (missing.length && avatarLayers.value.length >= MAX_AVATAR_LAYERS) {
		ElMessage.warning(`最多 ${MAX_AVATAR_LAYERS} 个立绘图层`);
		return;
	}
	snapshotStageDirectives();
	try {
		for (const u of list) {
			const lid = u.layerId || 'center';
			const nx = clamp(u.x);
			const ny = clamp(u.y);
			const existing = findAvatarDirective(lid);
			if (existing) {
				await updateDirective(pid, existing.directive_id, {
					payload: {
						...(existing.payload || {}),
						layer_id: lid,
						coord: 'stage',
						x: nx,
						y: ny
					}
				});
			} else {
				const meta = layerMetaFor(lid);
				await createDirective(pid, {
					content_id: contentId,
					directive_type: 'avatar',
					payload: {
						layer_id: lid,
						layer_name: meta.layer_name,
						order: meta.order,
						character_id: speaker.character_id,
						avatar_id: speaker.avatar_id || null,
						action: 'show',
						coord: 'stage',
						x: nx,
						y: ny,
						scale: 1,
						opacity: 1,
						rotate: 0
					}
				});
			}
		}
		await loadPreviewDirectives(contentId);
		await loadDirectives(contentId);
		markStageUndoApplied();
		ElMessage.success(list.length > 1 ? `已移动 ${list.length} 个图层` : '立绘位置已保存');
	} catch (e) {
		stageUndoStack.value.pop();
		console.error('保存立绘位置失败:', e);
		ElMessage.error('保存立绘位置失败: ' + (e.message || '未知错误'));
	}
};

// 属性条改缩放/透明度/旋转，写回同一条 avatar 指令
const handleAvatarTransform = async ({ layerId, layerName, scale, opacity, rotate, x, y, reset }) => {
	const dialogue = currentDialogue.value;
	if (!dialogue?.content_id) {
		ElMessage.warning('请先保存当前台词，再调整立绘属性');
		return;
	}
	const pid = Number(projectId.value);
	if (!pid) return;
	const lid = layerId || 'center';
	const contentId = Number(dialogue.content_id);
	const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v)));
	const opRaw = opacity === undefined || opacity === null ? 1 : Number(opacity);
	const patch = {
		scale: clamp(Number.isFinite(Number(scale)) ? Number(scale) : 1, 0.2, 3),
		opacity: clamp(Number.isFinite(opRaw) ? opRaw : 1, 0, 1),
		rotate: clamp(Number.isFinite(Number(rotate)) ? Number(rotate) : 0, -45, 45)
	};
	const hideExists = previewDirectives.value.some(d =>
		d.directive_type === 'avatar' &&
		layerIdOf(d.payload || {}) === lid &&
		d.payload?.action === 'hide'
	);
	const existing = hideExists ? null : findAvatarDirective(lid);
	const clampXY = (v) => Math.max(0, Math.min(100, Number(v) || 0));
	if (reset) {
		// 多角色入场：自动挑一个没被占用的站位，避免新角色和已有立绘重叠
		patch.x = nextFreeStageX();
		patch.y = 100;
	} else {
		if (x !== undefined && x !== null) patch.x = clampXY(x);
		if (y !== undefined && y !== null) patch.y = clampXY(y);
	}
	const speaker = existing ? null : (previewSpeaker.value || dialogue);
	if (!existing && !speaker?.character_id) {
		ElMessage.warning('当前台词没有角色，无法添加立绘');
		return;
	}
	if (!existing && avatarLayers.value.length >= MAX_AVATAR_LAYERS) {
		ElMessage.warning(`最多 ${MAX_AVATAR_LAYERS} 个立绘图层`);
		return;
	}
	const meta = layerMetaFor(lid);
	snapshotStageDirectives();
	try {
		if (existing) {
			await updateDirective(pid, existing.directive_id, {
				payload: {
					...(existing.payload || {}),
					layer_id: lid,
					coord: 'stage',
					...patch
				}
			});
		} else {
			await createDirective(pid, {
				content_id: contentId,
				directive_type: 'avatar',
				payload: {
					layer_id: lid,
					layer_name: layerName || meta.layer_name,
					order: meta.order,
					character_id: speaker.character_id,
					avatar_id: speaker.avatar_id || null,
					action: 'show',
					coord: 'stage',
					x: patch.x ?? stageDefaultX(lid),
					y: patch.y ?? 100,
					scale: patch.scale,
					opacity: patch.opacity,
					rotate: patch.rotate
				}
			});
		}
		await loadPreviewDirectives(contentId);
		await loadDirectives(contentId);
		markStageUndoApplied();
		ElMessage.success('立绘属性已保存');
	} catch (e) {
		stageUndoStack.value.pop();
		console.error('保存立绘属性失败:', e);
		ElMessage.error('保存立绘属性失败: ' + (e.message || '未知错误'));
	}
};

// 新建一个立绘层：用当前说话角色创建一条 show 指令
const handleAvatarAddNew = () => {
	if (avatarLayers.value.length >= MAX_AVATAR_LAYERS) {
		ElMessage.warning(`最多 ${MAX_AVATAR_LAYERS} 个立绘图层`);
		return;
	}
	const layerId = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
	handleAvatarTransform({
		layerId,
		layerName: nextLayerName(),
		scale: 1,
		opacity: 1,
		rotate: 0,
		reset: true
	});
};

// ===== 素材直出：拖到舞台空白处新建立绘层 / 拖到已有图层替换图片 =====

const stageAssetPayload = (ev) => {
	try {
		const raw = ev.dataTransfer?.getData('application/x-aigc-asset') || ''
		if (raw) {
			const data = JSON.parse(raw)
			const url = data?.url || data?.image_url || ''
			if (url) return { url, label: data?.label || data?.title || '' }
		}
		const text = ev.dataTransfer?.getData('text/plain') || ''
		if (text && isImageUrl(text)) return { url: text, label: '' }
	} catch (_) {
		/* 非素材拖拽数据 */
	}
	return null;
};

const onStageAssetDrop = async ({ url, label, x, y }) => {
	const dialogue = currentDialogue.value;
	if (!dialogue?.content_id) {
		ElMessage.warning('请先保存当前台词，再把素材拖到舞台');
		return;
	}
	if (avatarLayers.value.length >= MAX_AVATAR_LAYERS) {
		ElMessage.warning(`最多 ${MAX_AVATAR_LAYERS} 个立绘图层`);
		return;
	}
	const pid = Number(projectId.value);
	const contentId = Number(dialogue.content_id);
	const layerId = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
	const layerName = String(label || '素材立绘').slice(0, 30) || '素材立绘';
	snapshotStageDirectives();
	try {
		await createDirective(pid, {
			content_id: contentId,
			directive_type: 'avatar',
			payload: {
				layer_id: layerId,
				layer_name: layerName,
				order: nextLayerOrder(),
				image_url: url,
				action: 'show',
				coord: 'stage',
				x: Math.max(0, Math.min(100, Number(x) || 50)),
				y: Math.max(0, Math.min(100, Number(y) || 100)),
				scale: 1,
				opacity: 1,
				rotate: 0
			}
		});
		await loadPreviewDirectives(contentId);
		await loadDirectives(contentId);
		markStageUndoApplied();
		ElMessage.success(`已用素材创建立绘层「${layerName}」`);
	} catch (e) {
		stageUndoStack.value.pop();
		console.error('素材立绘层创建失败:', e);
		ElMessage.error('素材立绘层创建失败，请重试');
	}
};

const onAvatarReplaceAsset = async (layerId, asset) => {
	const dialogue = currentDialogue.value;
	if (!dialogue?.content_id) {
		ElMessage.warning('请先保存当前台词，再替换图层素材');
		return;
	}
	const existing = findAvatarDirective(layerId);
	if (!existing) {
		ElMessage.warning('该图层还没有立绘指令，无法替换素材');
		return;
	}
	const pid = Number(projectId.value);
	const contentId = Number(dialogue.content_id);
	snapshotStageDirectives();
	try {
		await updateDirective(pid, existing.directive_id, {
			payload: {
				...(existing.payload || {}),
				layer_id: layerId,
				image_url: asset.url,
				layer_name: (existing.payload && existing.payload.layer_name) || asset.label || layerId,
				action: 'show'
			}
		});
		await loadPreviewDirectives(contentId);
		await loadDirectives(contentId);
		markStageUndoApplied();
		ElMessage.success('图层素材已替换');
	} catch (e) {
		stageUndoStack.value.pop();
		console.error('替换图层素材失败:', e);
		ElMessage.error('替换图层素材失败，请重试');
	}
};

// 资源热重载：不改剧本，只给预览 URL 换时间戳并重新拉取指令
const hotReloadAssets = () => {
	assetNonce.value = Date.now();
	const id = currentDialogue.value?.content_id;
	if (id) loadPreviewDirectives(id);
	ElMessage.success('已重新加载预览素材');
};

const onDirAssetDragOver = (ev) => {
	const types = ev.dataTransfer?.types || [];
	if (Array.from(types).includes('application/x-aigc-asset')) dirAssetOver.value = true;
};

const onDirAssetDrop = (ev) => {
	dirAssetOver.value = false;
	const asset = stageAssetPayload(ev);
	if (!asset || !isImageUrl(asset.url)) {
		ElMessage.warning('请拖入图片素材');
		return;
	}
	dirForm.value.image_url = asset.url;
	// 素材直出层不绑角色，避免被角色默认立绘覆盖
	dirForm.value.character_id = null;
	dirForm.value.avatar_id = null;
	if (!dirForm.value.layer_name) dirForm.value.layer_name = (asset.label || '素材立绘').slice(0, 30);
	ElMessage.success('已填入素材图片，可继续调整位置');
};

// 演出弹窗增删了指令后，如果改的正是预览中的那条对话，立刻刷新预览
const syncPreviewIfCurrent = (contentId) => {
	const cur = currentDialogue.value ? currentDialogue.value.content_id : null
	if (cur && String(cur) === String(contentId)) loadPreviewDirectives(contentId);
};

watch(
	() => (currentDialogue.value ? currentDialogue.value.content_id : null),
	(id, prev) => {
		// 切换台词时清空舞台撤销栈，避免把上一条台词的快照撤销到当前台词
		if (prev !== undefined && String(prev) !== String(id)) stageUndoStack.value = [];
		loadPreviewDirectives(id).then(() => {
			if (id) restorePersistedStageUndo(id);
		});
	},
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

// ===== 逐句译文 =====
const translationDialogVisible = ref(false)
const translationSaving = ref(false)
const translationTarget = ref(null)
const translationLang = ref(TRANSLATION_LANGUAGES[0]?.code || 'zh-TW')
const translationText = ref('')

const translationCount = (dialogue) => {
	return dialogue && dialogue.translations ? Object.keys(dialogue.translations).length : 0
}

const translatedLanguages = (dialogue) => {
	const map = dialogue && dialogue.translations ? dialogue.translations : {}
	return TRANSLATION_LANGUAGES.filter(lang => !!map[lang.code])
}

const onTranslationLangChange = () => {
	translationText.value = translationTarget.value?.translations?.[translationLang.value] || ''
}

const openTranslationDialog = (dialogue) => {
	if (!dialogue || !dialogue.content_id) {
		ElMessage.warning('请先保存这条台词，再添加译文')
		return
	}
	translationTarget.value = dialogue
	// 优先切到还没有译文的语言，方便继续补全
	const missing = TRANSLATION_LANGUAGES.find(lang => !dialogue.translations?.[lang.code])
	translationLang.value = (missing || TRANSLATION_LANGUAGES[0]).code
	translationText.value = dialogue.translations?.[translationLang.value] || ''
	translationDialogVisible.value = true
}

const saveTranslation = async () => {
	if (!translationTarget.value?.content_id) return
	translationSaving.value = true
	try {
		const saved = await saveContentTranslation(
			Number(translationTarget.value.content_id),
			translationLang.value,
			translationText.value
		)
		const next = { ...(translationTarget.value.translations || {}) }
		if (saved?.text) next[saved.language] = saved.text
		else delete next[translationLang.value]
		translationTarget.value.translations = next
		translationDialogVisible.value = false
		ElMessage.success(saved?.text ? '译文已保存' : '译文已清除')
	} catch (error) {
		console.error('保存译文失败:', error)
		ElMessage.error('保存译文失败：' + (error?.response?.data?.message || error?.message || '未知错误'))
	} finally {
		translationSaving.value = false
	}
}

// ===== 场景标题/描述译文 =====
const sceneTransVisible = ref(false)
const sceneTransSaving = ref(false)
const sceneTransLang = ref(TRANSLATION_LANGUAGES[0]?.code || 'zh-TW')
const sceneTransTitle = ref('')
const sceneTransDescription = ref('')

const sceneTranslationCount = computed(() => {
	return Object.keys(scene.value.translations || {}).length
})

const translatedSceneLanguages = computed(() => {
	const map = scene.value.translations || {}
	return TRANSLATION_LANGUAGES.filter(lang => !!map[lang.code])
})

const onSceneTransLangChange = () => {
	const payload = scene.value.translations?.[sceneTransLang.value] || {}
	sceneTransTitle.value = payload.title || ''
	sceneTransDescription.value = payload.description || ''
}

const openSceneTranslationDialog = () => {
	if (!scene.value.scene_id) {
		ElMessage.warning('场景尚未加载完成')
		return
	}
	const missing = TRANSLATION_LANGUAGES.find(lang => !scene.value.translations?.[lang.code])
	sceneTransLang.value = (missing || TRANSLATION_LANGUAGES[0]).code
	onSceneTransLangChange()
	sceneTransVisible.value = true
}

const saveSceneTranslations = async () => {
	if (!scene.value.scene_id) return
	sceneTransSaving.value = true
	try {
		const saved = await saveSceneTranslation(
			Number(scene.value.scene_id),
			sceneTransLang.value,
			sceneTransTitle.value,
			sceneTransDescription.value
		)
		const next = { ...(scene.value.translations || {}) }
		if (saved?.title || saved?.description) {
			next[saved.language] = { title: saved.title || '', description: saved.description || '' }
		} else {
			delete next[sceneTransLang.value]
		}
		scene.value.translations = next
		sceneTransVisible.value = false
		ElMessage.success(saved?.title || saved?.description ? '场景译文已保存' : '场景译文已清除')
	} catch (error) {
		console.error('保存场景译文失败:', error)
		ElMessage.error('保存场景译文失败：' + (error?.response?.data?.message || error?.message || '未知错误'))
	} finally {
		sceneTransSaving.value = false
	}
}

// ===== 选项译文 =====
const choiceTransVisible = ref(false)
const choiceTransSaving = ref(false)
const choiceTransTarget = ref(null)
const choiceTransLang = ref(TRANSLATION_LANGUAGES[0]?.code || 'zh-TW')
const choiceTransText = ref('')

const choiceTranslationCount = (opt) => {
	return opt && opt.translations ? Object.keys(opt.translations).length : 0
}

const onChoiceTransLangChange = () => {
	choiceTransText.value = choiceTransTarget.value?.translations?.[choiceTransLang.value] || ''
}

const openChoiceTranslationDialog = (opt) => {
	if (!opt?.path_id) {
		ElMessage.warning('请先保存这条选择节点的选项，再添加译文')
		return
	}
	choiceTransTarget.value = opt
	const missing = TRANSLATION_LANGUAGES.find(lang => !opt.translations?.[lang.code])
	choiceTransLang.value = (missing || TRANSLATION_LANGUAGES[0]).code
	onChoiceTransLangChange()
	choiceTransVisible.value = true
}

const saveChoiceTranslation = async () => {
	if (!choiceTransTarget.value?.path_id) return
	choiceTransSaving.value = true
	try {
		const saved = await saveBranchTranslation(
			Number(choiceTransTarget.value.path_id),
			choiceTransLang.value,
			choiceTransText.value
		)
		const next = { ...(choiceTransTarget.value.translations || {}) }
		if (saved?.text) next[saved.language] = saved.text
		else delete next[choiceTransLang.value]
		choiceTransTarget.value.translations = next
		choiceTransVisible.value = false
		ElMessage.success(saved?.text ? '选项译文已保存' : '选项译文已清除')
	} catch (error) {
		console.error('保存选项译文失败:', error)
		ElMessage.error('保存选项译文失败：' + (error?.response?.data?.message || error?.message || '未知错误'))
	} finally {
		choiceTransSaving.value = false
	}
}

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
        translations: b.translations || {},
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
      const created = await createBranch(projectId.value, {
        source_content_id: dialogue.content_id,
        target_content_id: it.target_content_id,
        choice_text: it.choice_text.trim(),
        image_url: it.image_url || '',
        conditions: conditions,
      });
      // 选项是先删后建，branch_paths 主键会变；把已有译文迁移到新分支上
      if (created?.path_id) {
        it.path_id = created.path_id;
        for (const [lang, text] of Object.entries(it.translations || {})) {
          if (text && String(text).trim()) {
            try {
              await saveBranchTranslation(Number(created.path_id), lang, String(text));
            } catch (e) {
              console.warn('恢复选项译文失败:', e);
            }
          }
        }
      }
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
}

@media (max-width: 768px) {
  .editor-panel { width: 100%; }
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

/* 逐句译文 */
.dlg-translation-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.dlg-translation-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 8px;
  background: #ff8fab;
  color: #fff;
  font-size: 10px;
  line-height: 1;
}

.dlg-translation-tag {
  padding: 2px 7px;
  border-radius: 9px;
  background: #fff0f5;
  border: 1px solid #ffd3e0;
  color: #c2185b;
  font-size: 11px;
  line-height: 1.4;
}

.dlg-translation-hint {
  font-size: 11px;
  color: #b99aa5;
}

.dlg-translation-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dlg-translation-label {
  font-size: 12px;
  color: #8a6a76;
}

.dlg-translation-original {
  padding: 10px 12px;
  border-radius: 8px;
  background: #fffafc;
  border: 1px solid #f5e4ea;
}

.dlg-translation-original p {
  margin: 6px 0 0;
  color: #4a3a40;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.dlg-translation-original p.scene-trans-original-desc {
  color: #8a6a76;
  font-size: 12px;
}

.dlg-translation-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dlg-translation-copy {
  border: 1px solid #f0d6df;
  background: #fff;
  color: #b25a76;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.dlg-translation-copy:hover {
  background: #fff5f8;
}

.dlg-translation-tip {
  margin: 0;
  font-size: 11px;
  color: #b99aa5;
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

/* 表情/姿势轮盘：横向缩略图，点选即切换立绘 */
.expr-wheel {
  display: flex;
  gap: 8px;
  width: 100%;
  overflow-x: auto;
  padding: 4px 2px 6px;
}

.expr-option {
  position: relative;
  flex: 0 0 auto;
  width: 66px;
  padding: 4px;
  border: 1px solid #f0dfe6;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.expr-option:hover {
  border-color: #f6b3cb;
  transform: translateY(-1px);
}

.expr-option.selected {
  border-color: #ff8fab;
  box-shadow: 0 0 0 2px rgba(255, 143, 171, 0.18);
}

.expr-option img {
  width: 54px;
  height: 64px;
  object-fit: contain;
  background: #faf6f8;
  border-radius: 6px;
}

.expr-name {
  font-size: 11px;
  color: #6b4a55;
}

.expr-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: 9px;
  line-height: 1;
  color: #fff;
  background: #ff8fab;
  padding: 2px 4px;
  border-radius: 6px;
}

.expr-empty {
  width: 100%;
  margin: 0;
  font-size: 11px;
  color: #b99aa5;
}

/* 素材直出：拖入图片作为独立立绘层 */
.dir-asset-drop {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px dashed #e8d3dd;
  border-radius: 8px;
  background: #fffdfe;
  font-size: 11px;
  color: #8a6a76;
}

.dir-asset-drop.is-over {
  border-color: #ff8fab;
  background: #fff6f8;
}

.dir-asset-drop img {
  width: 34px;
  height: 44px;
  object-fit: contain;
  background: #faf6f8;
  border-radius: 4px;
  flex: none;
}

.dir-asset-tip {
  flex: 1;
  line-height: 1.5;
}

.dir-asset-clear {
  flex: none;
  border: 1px solid #f6d6e2;
  background: #fff;
  color: #c81f4a;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
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