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
	saveDialogues,
	deleteDialogue as apiDeleteDialogue,
	reorderDialoguesApi
} from '@/api/dialogue'
import {
	BASE_URL
} from '@/utils/request'
import { generateText, continueStory } from '@/api/ai'  
import { listBranches, createBranch, deleteBranch } from '@/api/branch'
import { createProjectVersion } from '@/api/version'
import { saveBranchTranslation } from '@/api/translation'
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
import SceneStagePreview from '@/components/SceneStagePreview.vue';
import DialogueTranslationDialog from '@/components/scene/DialogueTranslationDialog.vue';
import SceneTranslationDialog from '@/components/scene/SceneTranslationDialog.vue';
import ChoiceTranslationDialog from '@/components/scene/ChoiceTranslationDialog.vue';
import VoiceBatchDialog from '@/components/scene/VoiceBatchDialog.vue';
import VoiceDirectorDialog from '@/components/scene/VoiceDirectorDialog.vue';
import ScriptImportDialog from '@/components/scene/ScriptImportDialog.vue';
import DirectiveDialog from '@/components/scene/DirectiveDialog.vue';
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
let focusPulseTimer = null;

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

// 场景设置里的背景音乐迷你播放器
const settingsAudio = ref(null);
const backgroundMusic = ref(null);

/* ===== 音频：场景设置试听 + 舞台 BGM（见 useSceneAudio） ===== */
const {
	musicPlaying,
	musicProgress,
	musicDuration,
	bgmMuted,
	formatClock: fmtTime,
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
	fsmStates,
	fsmStateLabels,
	dialogueFsmStates,
	loadFsmStates,
	persistFsmStates,
	getFsmState,
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
	hasNodeCondition,
	openNodeConditionDialog,
	addNodeCondition,
	removeNodeCondition,
	applyNodeCondition,
	clearNodeCondition,
	getDialogueEffects,
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

const currentDialogue = computed(() => dialogues.value[currentDialogueIndex.value]);
// 富文本：把 ** / [color] 等标记渲染成 HTML，避免作者在预览里看到原始标记
const richPreviewHtml = (text) => renderRichHtml(parseRichText(text || ''), Infinity);
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

const handleCharacterChange = (index) => {
	pushHistory();
	markDirty();
	dialogues.value[index].avatar_id = '';
};

// 场景设置保存逻辑见 useSceneSettingsAutosave
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
// ===== 译文：逐句 / 场景 / 选项（见 useSceneTranslations） =====
const {
	translationDialogVisible,
	translationSaving,
	translationTarget,
	translationCount,
	translatedLanguages,
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
	choiceTranslationCount,
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

const getCharacterName = (characterId) => {
  if (!characterId) return '旁白';
  const charList = characters.value || [];
  if (charList.length === 0) return '角色加载中';
  const char = charList.find(c => c.character_id === characterId);
  return char ? char.name : '未知角色';
};

// ==================== 第 2 批：选择项 ↔ branch_paths ====================

/* ===== 分支编排：选择项 / 自动跳转（见 useSceneBranches） ===== */
const {
	choiceTargets,
	choiceTargetLabel,
	loadJumpMap,
	jumpTargetOf,
	setJumpTarget,
	onContentTypeChange,
	ensureChoices,
	addChoice,
	addChoiceCondition,
	removeChoiceCondition,
	hasChoiceCondition,
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
	clearTimeout(focusPulseTimer);
	cancelScheduledSave();
	flushTextHistory();
	saveDraftNow();
	// 切场景时兜底保存场景设置，避免标题/背景/音乐改动被静默丢掉
	if (sceneDirty.value) persistSceneSettings({ silent: true, version: false });
});
</script>

<style scoped src="./scene/sceneShell.css"></style>
<style scoped src="./scene/sceneSettings.css"></style>
<style scoped src="./scene/sceneDialogue.css"></style>
<style scoped src="./scene/sceneResponsive.css"></style>
<style scoped src="./scene/sceneDialogs.css"></style>