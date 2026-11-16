<template>
	<div class="dialogue-controls">
		<el-button size="small" type="success" @click="emit('add')">
			<el-icon :size="16"><Plus /></el-icon> 添加对话
		</el-button>
		<el-button size="small" @click="emit('import-script')">导入剧本</el-button>
		<el-button size="small" :disabled="!canUndo" @click="emit('undo')">撤销</el-button>
		<el-button size="small" :disabled="!canRedo" @click="emit('redo')">重做</el-button>
		<el-button size="small" type="warning" @click="emit('reorder')">
			<el-icon :size="16"><RefreshLeft /></el-icon> 按当前顺序保存排序
		</el-button>
		<el-button size="small" type="primary" @click="emit('save-all')">保存全部</el-button>
		<el-button size="small" @click="emit('open-graph')">剧情图</el-button>
		<el-button size="small" @click="emit('open-voice-director')">配音导演</el-button>
		<span :class="['save-state', { 'is-dirty': dirty }]" :title="dirty ? '台词有改动尚未保存到服务器' : '台词改动已保存到服务器'">
			{{ loading ? '保存中…' : (dirty ? '台词未保存' : '台词已保存') }}
		</span>
	</div>

	<div v-if="selectedIndexes.length" class="batch-bar">
		<span class="batch-count">已选 {{ selectedIndexes.length }} 条</span>
		<el-button size="small" type="danger" plain @click="emit('batch-delete')">批量删除</el-button>
		<el-button size="small" @click="emit('batch-duplicate')">批量复制</el-button>
		<el-button size="small" type="success" plain @click="emit('open-voice-batch')">批量配音</el-button>
		<el-button size="small" text @click="emit('clear-selection')">取消选择</el-button>
	</div>

	<div
		class="dialogues-editor"
		@focusin="emit('text-history-begin')"
		@input="emit('text-history-queue')"
		@focusout="emit('text-history-flush')"
	>
		<DialogueEditorCard
			v-for="(dialogue, index) in dialogues"
			:key="dialogue.content_id || index"
			:dialogue="dialogue"
			:index="index"
			:characters="characters"
			:variables="variables"
			:dialogues="dialogues"
			:project-nodes="projectNodes"
			:jump-map="jumpMap"
			:effects-map="effectsMap"
			:fsm-states-map="fsmStatesMap"
			:selected="isSelected(index)"
			:focused="isFocused(dialogue.content_id)"
			@select="emit('select', $event)"
			@toggle-select="emit('toggle-select', $event)"
			@set-fsm="emit('set-fsm', $event)"
			@open-directive="emit('open-directive', $event)"
			@open-node-condition="emit('open-node-condition', $event)"
			@play="emit('play', $event)"
			@delete="emit('delete', $event)"
			@move-up="emit('move-up', $event)"
			@move-down="emit('move-down', $event)"
			@add="emit('add')"
			@content-type-change="emit('content-type-change', $event)"
			@character-change="emit('character-change', $event)"
			@open-translation="emit('open-translation', $event)"
			@set-jump="emit('set-jump', $event)"
			@open-choice-translation="emit('open-choice-translation', $event)"
			@remove-choice="emit('remove-choice', $event)"
			@upload-choice-image="emit('upload-choice-image', $event)"
			@clear-choice-image="emit('clear-choice-image', $event)"
			@remove-choice-condition="emit('remove-choice-condition', $event)"
			@add-choice-condition="emit('add-choice-condition', $event)"
			@add-choice="emit('add-choice', $event)"
			@save-choices="emit('save-choices', $event)"
			@remove-effect="emit('remove-effect', $event)"
			@add-effect="emit('add-effect', $event)"
			@save-effects="emit('save-effects', $event)"
			@open-ai="emit('open-ai', $event)"
			@upload-voice="emit('upload-voice', $event)"
			@save="emit('save', $event)"
		/>

		<div v-if="dialogues.length === 0 && !loading" class="no-dialogues">
			暂无对话，点击"添加对话"开始创建
		</div>
	</div>
</template>

<script setup>
/**
 * 左栏脚本面板：工具栏 + 批量操作条 + 台词卡片列表。
 *
 * 这里只有列表的「呈现与交互」，不持有任何业务状态：
 * - 数据全部来自 props（台词 / 角色 / 变量 / 节点 / 分支映射 / 状态 / 选中 / 焦点）；
 * - 所有操作都以领域事件上报给父级，由父级决定走哪个 composable；
 * - 文本历史（focusin / input / focusout）属于列表容器的行为，同样只上报事件，
 *   真正的撤销快照仍由父级的 useSceneHistory 维护。
 */
import { Plus, RefreshLeft } from '@element-plus/icons-vue'
import DialogueEditorCard from '@/components/scene/DialogueEditorCard.vue'

const props = defineProps({
	dialogues: { type: Array, required: true },
	characters: { type: Array, default: () => [] },
	variables: { type: Array, default: () => [] },
	projectNodes: { type: Array, default: () => [] },
	jumpMap: { type: Object, default: () => ({}) },
	effectsMap: { type: Object, default: () => ({}) },
	fsmStatesMap: { type: Object, default: () => ({}) },
	selectedIndexes: { type: Array, default: () => [] },
	focusedContentId: { type: [Number, String], default: null },
	loading: { type: Boolean, default: false },
	dirty: { type: Boolean, default: false },
	canUndo: { type: Boolean, default: false },
	canRedo: { type: Boolean, default: false }
})

const emit = defineEmits([
	'add',
	'import-script',
	'undo',
	'redo',
	'reorder',
	'save-all',
	'open-graph',
	'open-voice-director',
	'batch-delete',
	'batch-duplicate',
	'open-voice-batch',
	'clear-selection',
	'select',
	'toggle-select',
	'set-fsm',
	'open-directive',
	'open-node-condition',
	'play',
	'delete',
	'move-up',
	'move-down',
	'content-type-change',
	'character-change',
	'open-translation',
	'set-jump',
	'open-choice-translation',
	'remove-choice',
	'upload-choice-image',
	'clear-choice-image',
	'remove-choice-condition',
	'add-choice-condition',
	'add-choice',
	'save-choices',
	'remove-effect',
	'add-effect',
	'save-effects',
	'open-ai',
	'upload-voice',
	'save',
	'text-history-begin',
	'text-history-queue',
	'text-history-flush'
])

const isSelected = (index) => props.selectedIndexes.includes(index)

const isFocused = (contentId) => {
	if (props.focusedContentId === null || props.focusedContentId === undefined) return false
	return String(contentId) === String(props.focusedContentId)
}
</script>

<style scoped src="./sceneDialogue.css"></style>
