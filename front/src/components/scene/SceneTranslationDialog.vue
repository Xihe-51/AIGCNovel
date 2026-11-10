<template>
	<el-dialog
		v-model="visibleModel"
		title="场景译文"
		width="520px"
		append-to-body
	>
		<div class="dlg-translation-dialog">
			<div class="dlg-translation-original">
				<span class="dlg-translation-label">简体中文（原文）</span>
				<p>{{ title || '（无标题）' }}</p>
				<p v-if="description" class="scene-trans-original-desc">{{ description }}</p>
			</div>
			<div class="dlg-translation-row">
				<span class="dlg-translation-label">目标语言</span>
				<el-select v-model="lang" size="small" style="width: 160px" @change="onLangChange">
					<el-option
						v-for="item in TRANSLATION_LANGUAGES"
						:key="item.code"
						:label="item.label"
						:value="item.code"
					/>
				</el-select>
			</div>
			<el-input v-model="transTitle" placeholder="译后标题" />
			<el-input
				v-model="transDescription"
				type="textarea"
				:rows="4"
				placeholder="译后描述（可空）"
			/>
			<p class="dlg-translation-tip">
				播放器切到 {{ translationLabel(lang) }} 时优先显示译文；全部留空保存会清除该语言译文。
			</p>
		</div>
		<template #footer>
			<el-button @click="visibleModel = false">取消</el-button>
			<el-button
				type="primary"
				:loading="saving"
				@click="emit('save', { lang, title: transTitle, description: transDescription })"
			>保存译文</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { TRANSLATION_LANGUAGES, translationLabel } from '@/api/translation'

const props = defineProps<{
	visible: boolean
	title: string
	description: string
	translations: Record<string, { title?: string; description?: string }>
	saving: boolean
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'save', payload: { lang: string; title: string; description: string }): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const lang = ref(TRANSLATION_LANGUAGES[0]?.code || 'zh-TW')
const transTitle = ref('')
const transDescription = ref('')

const onLangChange = () => {
	const payload = props.translations?.[lang.value] || {}
	transTitle.value = payload.title || ''
	transDescription.value = payload.description || ''
}

watch(
	() => props.visible,
	(open: boolean) => {
		if (!open) return
		const missing = TRANSLATION_LANGUAGES.find(item => !props.translations?.[item.code])
		lang.value = (missing || TRANSLATION_LANGUAGES[0]).code
		onLangChange()
	}
)
</script>

<style src="./translationDialog.css"></style>
