<template>
	<div
		class="dialogue-editor-item"
		:class="{ 'is-focused': focused }"
		:data-content-id="dialogue.content_id || ''"
		@click="emit('select', index)"
	>
		<div class="dialogue-header">
			<div class="dialogue-header-left">
				<el-checkbox
					class="dlg-select"
					:model-value="selected"
					@change="emit('toggle-select', index)"
					@click.stop
				/>
				<span class="dialogue-index">{{ index + 1 }}</span>
				<el-dropdown trigger="click" @command="(cmd: string) => emit('set-fsm', { dialogue, state: cmd })">
					<span class="fsm-badge" :class="fsmState">
						{{ fsmStateLabels[fsmState] }}
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
					@click="emit('open-directive', index)"
					class="directive-btn"
					title="演出指令：立绘位置、背景切换、音效"
				>演出</el-button>
				<el-button
					size="small"
					:class="['condition-btn', { 'has-condition': nodeConditionActive }]"
					title="台词显示条件：条件不满足时顺序播放会跳过这条"
					@click="emit('open-node-condition', index)"
				>条件</el-button>
				<el-button
					size="small"
					class="play-btn"
					:disabled="!dialogue.content_id"
					title="从这条台词开始调试播放"
					@click="emit('play', dialogue)"
				>试玩</el-button>
				<el-button
					size="small"
					icon="Delete"
					@click="emit('delete', index)"
					class="delete-btn"
					title="删除这条台词（会级联删除分支/数值/演出，不可撤销）"
				></el-button>
				<el-button
					size="small"
					icon="Top"
					@click="emit('move-up', index)"
					:disabled="index === 0"
					class="move-btn"
				></el-button>
				<el-button
					size="small"
					icon="Bottom"
					@click="emit('move-down', index)"
					:disabled="index === dialogues.length - 1"
					class="move-btn"
				></el-button>
				<el-button size="small" type="success" @click="emit('add')">
					<el-icon><Plus /></el-icon>
				</el-button>
			</div>
		</div>

		<el-form :model="dialogue" label-width="70px" size="small" class="dialogue-form">
			<el-form-item label="类型">
				<el-select
					v-model="dialogue.content_type"
					style="width: 100%"
					@change="emit('content-type-change', dialogue)"
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
					@change="emit('character-change', index)"
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
						v-for="avatar in characterAvatars"
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
						@click="emit('open-translation', dialogue)"
					>
						译文
						<span v-if="translationCountValue" class="dlg-translation-count">{{ translationCountValue }}</span>
					</el-button>
					<span
						v-for="lang in translatedLanguagesList"
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
						:model-value="jumpTarget"
						size="small"
						clearable
						placeholder="不跳转，按顺序播放"
						class="jump-select"
						@change="(val: any) => emit('set-jump', { dialogue, target: val })"
					>
						<el-option
							v-for="t in choiceTargets"
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
									v-for="t in choiceTargets"
									:key="t.content_id"
									:label="choiceTargetLabel(t)"
									:value="t.content_id"
								></el-option>
							</el-select>
							<el-button
								size="small"
								:disabled="!opt.path_id"
								:title="opt.path_id ? '编辑这个选项的译文' : '先保存选择项，再添加译文'"
								@click="emit('open-choice-translation', opt)"
							>
								译
								<span v-if="countTranslations(opt)" class="dlg-translation-count">{{ countTranslations(opt) }}</span>
							</el-button>
							<el-button
								size="small"
								type="danger"
								icon="Delete"
								@click="emit('remove-choice', { dialogue, optionIndex: oi })"
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
								:http-request="(o: any) => uploadChoiceImageRequest(o, opt)"
							>
								<el-button size="small">{{ opt.image_url ? '更换配图' : '选项配图' }}</el-button>
							</el-upload>
							<el-button
								v-if="opt.image_url"
								size="small"
								plain
								@click="emit('clear-choice-image', opt)"
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
									@click="emit('remove-choice-condition', { dialogue, optionIndex: oi, conditionIndex: ci })"
								/>
							</div>
							<div class="choice-cond-actions">
								<el-button size="small" icon="Plus" @click="emit('add-choice-condition', { dialogue, optionIndex: oi })">添加条件</el-button>
								<span class="condition-tip" v-if="hasChoiceCondition(opt)">
									{{ opt.cond_mode === 'or' && (opt.cond_items || []).length > 1 ? '任一条件成立时显示' : '条件全部成立时显示' }}
								</span>
							</div>
						</div>
					</div>

					<div class="choice-actions">
						<el-button size="small" icon="Plus" @click="emit('add-choice', dialogue)">添加选项</el-button>
						<el-button
							size="small"
							type="primary"
							:disabled="!dialogue.content_id"
							@click="emit('save-choices', { dialogue, index })"
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
						v-for="(eff, ei) in dialogueEffects()"
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
							@click="emit('remove-effect', { dialogue, effectIndex: ei })"
						/>
					</div>

					<div class="effect-actions">
						<el-button size="small" icon="Plus" @click="emit('add-effect', dialogue)"
								   :disabled="!variables.length">添加数值</el-button>
						<el-button size="small" type="primary"
								   :disabled="!dialogue.content_id"
								   @click="emit('save-effects', dialogue)">保存数值</el-button>
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
			        @click="emit('open-ai', index)"
			        class="ai-button"
			    >
			        <el-icon><MagicStick /></el-icon> AI生成
			    </el-button>
			</el-form-item>

			<el-form-item label="语音">
			    <el-upload
			        class="upload-demo"
			        action="#"
			        :http-request="uploadVoiceRequest"
			        accept="audio/*"
			        list-type="text">
			        <el-button size="small" type="primary">上传语音</el-button>
			    </el-upload>
			</el-form-item>

			<el-form-item>
				<el-button size="small" type="primary" @click="emit('save', index)">保存</el-button>
			</el-form-item>
		</el-form>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BASE_URL } from '@/utils/request'
import {
	buildChoiceTargets,
	countTranslations,
	ensureDialogueEffects,
	formatChoiceTargetLabel,
	getCharacterName,
	hasChoiceCondition,
	hasNodeCondition,
	jumpTargetOf,
	languagesOfTranslations,
} from '@/utils/scene'
import { FSM_STATES, FSM_STATE_LABELS, pickFsmState } from '@/composables/scene/useSceneFsmStates'
import { avatarOptionLabel, avatarsOfCharacter } from '@/composables/scene/useSceneDialoguePreview'
import { EMOTION_OPTIONS } from '@/composables/scene/useSceneVoiceBatch'
import { TRANSLATION_LANGUAGES } from '@/api/translation'

const props = defineProps<{
	dialogue: any
	index: number
	characters: any[]
	variables: any[]
	dialogues: any[]
	projectNodes: any[]
	jumpMap: Record<string, any>
	effectsMap: Record<string, any[]>
	fsmStatesMap: Record<string, string>
	selected: boolean
	focused: boolean
}>()

const emit = defineEmits<{
	(e: 'select', index: number): void
	(e: 'toggle-select', index: number): void
	(e: 'set-fsm', payload: { dialogue: any; state: string }): void
	(e: 'open-directive', index: number): void
	(e: 'open-node-condition', index: number): void
	(e: 'play', dialogue: any): void
	(e: 'delete', index: number): void
	(e: 'move-up', index: number): void
	(e: 'move-down', index: number): void
	(e: 'add'): void
	(e: 'content-type-change', dialogue: any): void
	(e: 'character-change', index: number): void
	(e: 'open-translation', dialogue: any): void
	(e: 'set-jump', payload: { dialogue: any; target: any }): void
	(e: 'open-choice-translation', option: any): void
	(e: 'remove-choice', payload: { dialogue: any; optionIndex: number }): void
	(e: 'upload-choice-image', payload: { options: any; option: any }): void
	(e: 'clear-choice-image', option: any): void
	(e: 'remove-choice-condition', payload: { dialogue: any; optionIndex: number; conditionIndex: number }): void
	(e: 'add-choice-condition', payload: { dialogue: any; optionIndex: number }): void
	(e: 'add-choice', dialogue: any): void
	(e: 'save-choices', payload: { dialogue: any; index: number }): void
	(e: 'remove-effect', payload: { dialogue: any; effectIndex: number }): void
	(e: 'add-effect', dialogue: any): void
	(e: 'save-effects', dialogue: any): void
	(e: 'open-ai', index: number): void
	(e: 'upload-voice', payload: { options: any; index: number }): void
	(e: 'save', index: number): void
}>()

const fsmStates = FSM_STATES
const fsmStateLabels = FSM_STATE_LABELS
const emotionOptions = EMOTION_OPTIONS

const fsmState = computed(() => pickFsmState(props.fsmStatesMap, props.dialogue))
const nodeConditionActive = computed(() => hasNodeCondition(props.dialogue))
const characterAvatars = computed(() => avatarsOfCharacter(props.characters, props.dialogue.character_id))
const choiceTargets = computed(() =>
	buildChoiceTargets(props.dialogues, props.projectNodes, props.dialogue.content_id)
)
const jumpTarget = computed(() => jumpTargetOf(props.jumpMap, props.dialogue.content_id))
const translationCountValue = computed(() => countTranslations(props.dialogue))
const translatedLanguagesList = computed(() =>
	languagesOfTranslations(props.dialogue, TRANSLATION_LANGUAGES)
)

const choiceTargetLabel = (node: any) =>
	formatChoiceTargetLabel(node, getCharacterName(props.characters, node?.character_id))

const dialogueEffects = () => ensureDialogueEffects(props.dialogue, props.effectsMap)

/** 上传请求经 emit 转交父级，用 Promise 桥接 el-upload 的 onSuccess/onError */
const uploadChoiceImageRequest = (options: any, option: any) =>
	new Promise<any>((resolve, reject) => {
		emit('upload-choice-image', {
			options: { ...options, onSuccess: resolve, onError: reject },
			option,
		})
	})

const uploadVoiceRequest = (options: any) =>
	new Promise<any>((resolve, reject) => {
		emit('upload-voice', {
			options: { ...options, onSuccess: resolve, onError: reject },
			index: props.index,
		})
	})
</script>

<style scoped src="./dialogueEditorCard.css"></style>
