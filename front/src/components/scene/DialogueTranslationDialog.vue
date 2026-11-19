<template>
	<el-dialog
		v-model="visibleModel"
		title="逐句译文"
		width="520px"
		append-to-body
	>
		<div v-if="target" class="dlg-translation-dialog">
			<div class="dlg-translation-original">
				<span class="dlg-translation-label">简体中文（原文）</span>
				<p>{{ target.content_text || '（空）' }}</p>
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
				<button type="button" class="dlg-translation-copy" @click="text = target.content_text || ''">
					复制原文
				</button>
			</div>
			<el-input
				v-model="text"
				type="textarea"
				:rows="5"
				placeholder="留空保存会删除该语言译文；缺失时播放器自动回退原文"
			/>
			<p class="dlg-translation-tip">
				保存后，播放器切到 {{ translationLabel(lang) }} 时优先显示这条译文。
			</p>
		</div>
		<template #footer>
			<el-button @click="visibleModel = false">取消</el-button>
			<el-button type="primary" :loading="saving" @click="emit('save', { lang, text })">保存译文</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { TRANSLATION_LANGUAGES, translationLabel } from '@/api/translation'

const props = defineProps<{
	visible: boolean
	target: any | null
	saving: boolean
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'save', payload: { lang: string; text: string }): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const lang = ref(TRANSLATION_LANGUAGES[0]?.code || 'zh-TW')
const text = ref('')

const onLangChange = () => {
	text.value = props.target?.translations?.[lang.value] || ''
}

watch(
	() => props.visible,
	(open: boolean) => {
		if (!open) return
		// 优先切到还没有译文的语言，方便继续补全
		const missing = TRANSLATION_LANGUAGES.find(item => !props.target?.translations?.[item.code])
		lang.value = (missing || TRANSLATION_LANGUAGES[0]).code
		onLangChange()
	}
)
</script>

<style src="./translationDialog.css"></style>
