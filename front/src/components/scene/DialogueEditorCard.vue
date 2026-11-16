<template>
	<div
		class="dialogue-editor-item"
		:class="{ 'is-focused': focused }"
		:data-content-id="dialogue.content_id || ''"
		@click="emit('select', index)"
	>
		<DialogueCardHeader
			:index="index"
			:total="dialogues.length"
			:selected="selected"
			:fsm-state="fsmState"
			:can-play="!!dialogue.content_id"
			:has-condition="nodeConditionActive"
			@toggle-select="emit('toggle-select', index)"
			@set-fsm="emit('set-fsm', { dialogue, state: $event })"
			@open-directive="emit('open-directive', index)"
			@open-node-condition="emit('open-node-condition', index)"
			@play="emit('play', dialogue)"
			@delete="emit('delete', index)"
			@move-up="emit('move-up', index)"
			@move-down="emit('move-down', index)"
			@add="emit('add')"
		/>

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
				<DialogueChoiceEditor
					:dialogue="dialogue"
					:characters="characters"
					:variables="variables"
					:choice-targets="choiceTargets"
					@open-choice-translation="emit('open-choice-translation', $event)"
					@remove-choice="emit('remove-choice', { dialogue, optionIndex: $event })"
					@upload-choice-image="emit('upload-choice-image', $event)"
					@clear-choice-image="emit('clear-choice-image', $event)"
					@add-choice-condition="emit('add-choice-condition', { dialogue, optionIndex: $event })"
					@remove-choice-condition="emit('remove-choice-condition', { dialogue, ...$event })"
					@add-choice="emit('add-choice', dialogue)"
					@save-choices="emit('save-choices', { dialogue, index })"
				/>
			</el-form-item>

			<!-- 节点数值变化（好感度/数值/开关） -->
			<el-form-item label="数值变化">
				<DialogueEffectEditor
					:effects="dialogueEffects()"
					:variables="variables"
					:has-content-id="!!dialogue.content_id"
					@add-effect="emit('add-effect', dialogue)"
					@remove-effect="emit('remove-effect', { dialogue, effectIndex: $event })"
					@save-effects="emit('save-effects', dialogue)"
				/>
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
import DialogueCardHeader from '@/components/scene/DialogueCardHeader.vue'
import DialogueChoiceEditor from '@/components/scene/DialogueChoiceEditor.vue'
import DialogueEffectEditor from '@/components/scene/DialogueEffectEditor.vue'
import {
	buildChoiceTargets,
	countTranslations,
	ensureDialogueEffects,
	formatChoiceTargetLabel,
	getCharacterName,
	hasNodeCondition,
	jumpTargetOf,
	languagesOfTranslations,
} from '@/utils/scene'
import { pickFsmState } from '@/composables/scene/useSceneFsmStates'
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

const uploadVoiceRequest = (options: any) =>
	new Promise<any>((resolve, reject) => {
		emit('upload-voice', {
			options: { ...options, onSuccess: resolve, onError: reject },
			index: props.index,
		})
	})
</script>

<style scoped src="./dialogueEditorCard.css"></style>
