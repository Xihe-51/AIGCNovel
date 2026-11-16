<template>
	<!-- AI 续写 / 问答 -->
	<AiAssistDialog
		:visible="ai.visible"
		:question="ai.question"
		:index="ai.index"
		:answer="ai.answer"
		:refs="ai.refs"
		:loading="ai.loading"
		:stage="ai.stage"
		@update:visible="(v) => emit('update:visible', 'ai', v)"
		@update:question="(v) => emit('update:field', 'aiQuestion', v)"
		@send="(payload) => emit('ai-send', payload)"
		@apply="(payload) => emit('ai-apply', payload)"
		@clear-answer="emit('clear-ai-answer')"
	/>

	<!-- 演出指令 -->
	<DirectiveDialog
		ref="directiveDialogRef"
		:visible="directive.visible"
		:project-id="directive.projectId"
		:content-id="directive.contentId"
		:target-label="directive.targetLabel"
		:characters="directive.characters"
		:default-character-id="directive.defaultCharacterId"
		:default-avatar-id="directive.defaultAvatarId"
		:asset-nonce="directive.assetNonce"
		@update:visible="(v) => emit('update:visible', 'directive', v)"
		@changed="(payload) => emit('directives-changed', payload)"
	/>

	<!-- 台词显示条件 -->
	<NodeConditionDialog
		:visible="condition.visible"
		:target-label="condition.targetLabel"
		:mode="condition.mode"
		:items="condition.items"
		:variables="condition.variables"
		@update:visible="(v) => emit('update:visible', 'condition', v)"
		@apply="(payload) => emit('condition-apply', payload)"
		@clear="emit('condition-clear')"
	/>

	<!-- 批量导入剧本 -->
	<ScriptImportDialog
		:visible="scriptImport.visible"
		@update:visible="(v) => emit('update:visible', 'scriptImport', v)"
		@import="(payload) => emit('script-import', payload)"
	/>

	<!-- 批量配音：选中台词逐条 TTS 并回填 voice_url -->
	<VoiceBatchDialog
		:visible="voiceBatch.visible"
		:items="voiceBatch.items"
		:selected-count="voiceBatch.selectedCount"
		:emotion-options="voiceBatch.emotionOptions"
		:running="voiceBatch.running"
		:done="voiceBatch.done"
		:total="voiceBatch.total"
		:current="voiceBatch.current"
		:errors="voiceBatch.errors"
		@update:visible="(v) => emit('update:visible', 'voiceBatch', v)"
		@run="(payload) => emit('voice-batch-run', payload)"
	/>

	<!-- 配音导演：场景情绪分布 + 规则自动标注 -->
	<VoiceDirectorDialog
		:visible="voiceDirector.visible"
		:scope="voiceDirector.scope"
		:only-unlabeled="voiceDirector.onlyUnlabeled"
		:emotion-options="voiceDirector.emotionOptions"
		:stat-rows="voiceDirector.statRows"
		:scene-total="voiceDirector.sceneTotal"
		:scene-voicable-count="voiceDirector.sceneVoicableCount"
		:selected-count="voiceDirector.selectedCount"
		:rows="voiceDirector.rows"
		:running="voiceDirector.running"
		:checked-count="voiceDirector.checkedCount"
		@update:visible="(v) => emit('update:visible', 'voiceDirector', v)"
		@update:scope="(v) => emit('update:field', 'emotionTagScope', v)"
		@update:only-unlabeled="(v) => emit('update:field', 'emotionTagOnlyUnlabeled', v)"
		@tag="(payload) => emit('voice-director-tag', payload)"
		@apply="(payload) => emit('voice-director-apply', payload)"
	/>

	<!-- 逐句译文：一条台词在多种语言下的文本，缺失时播放器回退原文 -->
	<DialogueTranslationDialog
		:visible="translation.visible"
		:target="translation.target"
		:saving="translation.saving"
		@update:visible="(v) => emit('update:visible', 'translation', v)"
		@save="(payload) => emit('translation-save', payload)"
	/>

	<!-- 场景标题/描述译文 -->
	<SceneTranslationDialog
		:visible="sceneTranslation.visible"
		:title="sceneTranslation.title"
		:description="sceneTranslation.description"
		:translations="sceneTranslation.translations"
		:saving="sceneTranslation.saving"
		@update:visible="(v) => emit('update:visible', 'sceneTranslation', v)"
		@save="(payload) => emit('scene-translation-save', payload)"
	/>

	<!-- 选项译文 -->
	<ChoiceTranslationDialog
		:visible="choiceTranslation.visible"
		:target="choiceTranslation.target"
		:saving="choiceTranslation.saving"
		@update:visible="(v) => emit('update:visible', 'choiceTranslation', v)"
		@save="(payload) => emit('choice-translation-save', payload)"
	/>

	<!-- 从项目素材库选择，复用已有背景/音乐 -->
	<AssetPickerDialog
		:visible="assetPicker.visible"
		:kind="assetPicker.kind"
		:loading="assetPicker.loading"
		:items="assetPicker.items"
		:base-url="assetPicker.baseUrl"
		:selected-url="assetPicker.selectedUrl"
		@update:visible="(v) => emit('update:visible', 'assetPicker', v)"
		@select="(payload) => emit('asset-select', payload)"
	/>
</template>

<script setup>
/**
 * 场景编辑器的弹窗宿主：把 10 个弹窗集中挂在一处，父级只维护「数据 + 领域事件」。
 *
 * 设计约定：
 * - 每个弹窗一个只读数据对象（ai / directive / condition / …），父级只传数据；
 * - 弹窗的显隐与少数双向输入（AI 提问、情绪标注范围）通过
 *   `update:visible(key, v)` / `update:field(key, v)` 两个领域事件回传，
 *   由父级的注册表决定落到哪个 ref，宿主本身不持有任何业务状态；
 * - 业务动作（发送、应用、保存、导入、选择素材）原样转发，不改写载荷。
 */
import { ref } from 'vue'
import AiAssistDialog from '@/components/scene/AiAssistDialog.vue'
import DirectiveDialog from '@/components/scene/DirectiveDialog.vue'
import NodeConditionDialog from '@/components/scene/NodeConditionDialog.vue'
import ScriptImportDialog from '@/components/scene/ScriptImportDialog.vue'
import VoiceBatchDialog from '@/components/scene/VoiceBatchDialog.vue'
import VoiceDirectorDialog from '@/components/scene/VoiceDirectorDialog.vue'
import DialogueTranslationDialog from '@/components/scene/DialogueTranslationDialog.vue'
import SceneTranslationDialog from '@/components/scene/SceneTranslationDialog.vue'
import ChoiceTranslationDialog from '@/components/scene/ChoiceTranslationDialog.vue'
import AssetPickerDialog from '@/components/scene/AssetPickerDialog.vue'

defineProps({
	ai: { type: Object, required: true },
	directive: { type: Object, required: true },
	condition: { type: Object, required: true },
	scriptImport: { type: Object, required: true },
	voiceBatch: { type: Object, required: true },
	voiceDirector: { type: Object, required: true },
	translation: { type: Object, required: true },
	sceneTranslation: { type: Object, required: true },
	choiceTranslation: { type: Object, required: true },
	assetPicker: { type: Object, required: true }
})

const emit = defineEmits([
	'update:visible',
	'update:field',
	'ai-send',
	'ai-apply',
	'clear-ai-answer',
	'directives-changed',
	'condition-apply',
	'condition-clear',
	'script-import',
	'voice-batch-run',
	'voice-director-tag',
	'voice-director-apply',
	'translation-save',
	'scene-translation-save',
	'choice-translation-save',
	'asset-select'
])

const directiveDialogRef = ref(null)

// 演出指令变更后父级要刷新弹窗里的指令列表：由宿主转发给 DirectiveDialog
defineExpose({ reload: () => directiveDialogRef.value?.reload?.() })
</script>
