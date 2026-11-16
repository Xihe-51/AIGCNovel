<template>
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
					@click="emit('remove-choice', oi)"
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
						@click="emit('remove-choice-condition', { optionIndex: oi, conditionIndex: ci })"
					/>
				</div>
				<div class="choice-cond-actions">
					<el-button size="small" icon="Plus" @click="emit('add-choice-condition', oi)">添加条件</el-button>
					<span class="condition-tip" v-if="hasChoiceCondition(opt)">
						{{ opt.cond_mode === 'or' && (opt.cond_items || []).length > 1 ? '任一条件成立时显示' : '条件全部成立时显示' }}
					</span>
				</div>
			</div>
		</div>

		<div class="choice-actions">
			<el-button size="small" icon="Plus" @click="emit('add-choice')">添加选项</el-button>
			<el-button
				size="small"
				type="primary"
				:disabled="!dialogue.content_id"
				@click="emit('save-choices')"
			>保存分支</el-button>
		</div>
		<div class="choice-hint" v-if="!dialogue.content_id">
			请先点「保存」保存本条内容，之后才能配置分支选项
		</div>
		<div class="choice-hint" v-else>
			保存后即写入 branch_paths，可在「可视化剧情树」中看到分支连线
		</div>
	</div>
</template>

<script setup lang="ts">
import { BASE_URL } from '@/utils/request'
import {
	countTranslations,
	formatChoiceTargetLabel,
	getCharacterName,
	hasChoiceCondition,
} from '@/utils/scene'

const props = defineProps<{
	dialogue: any
	characters: any[]
	variables: any[]
	choiceTargets: any[]
}>()

const emit = defineEmits<{
	(e: 'open-choice-translation', option: any): void
	(e: 'remove-choice', optionIndex: number): void
	(e: 'upload-choice-image', payload: { options: any; option: any }): void
	(e: 'clear-choice-image', option: any): void
	(e: 'add-choice-condition', optionIndex: number): void
	(e: 'remove-choice-condition', payload: { optionIndex: number; conditionIndex: number }): void
	(e: 'add-choice'): void
	(e: 'save-choices'): void
}>()

const choiceTargetLabel = (node: any) =>
	formatChoiceTargetLabel(node, getCharacterName(props.characters, node?.character_id))

/** 上传请求经 emit 转交父级，用 Promise 桥接 el-upload 的 onSuccess/onError */
const uploadChoiceImageRequest = (options: any, option: any) =>
	new Promise<any>((resolve, reject) => {
		emit('upload-choice-image', {
			options: { ...options, onSuccess: resolve, onError: reject },
			option,
		})
	})
</script>

<style scoped src="./dialogueChoiceEditor.css"></style>
