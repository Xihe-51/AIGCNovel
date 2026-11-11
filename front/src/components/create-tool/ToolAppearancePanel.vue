<template>
	<div class="tp-theme-note">选择作品试玩和发布后的播放器皮肤，切换后立即生效。</div>
	<div class="tp-theme-list">
		<button
			v-for="t in UI_THEMES"
			:key="t.key"
			type="button"
			:class="['tp-theme', { 'is-active': themeKey === t.key }]"
			:disabled="saving"
			@click="chooseTheme(t.key)"
		>
			<span class="tp-theme-swatches">
				<i v-for="(c, ci) in t.swatches" :key="ci" :style="{ background: c }"></i>
			</span>
			<span class="tp-theme-meta">
				<span class="tp-theme-name">{{ t.label }}</span>
				<span class="tp-theme-desc">{{ t.desc }}</span>
			</span>
			<span v-if="themeKey === t.key" class="tp-theme-check">✓</span>
		</button>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getProject, updateProject } from '@/api/project'
import { UI_THEMES } from '@/utils/uiThemes'

const props = defineProps<{ projectId: string | number }>()

const themeKey = ref('classic')
const saving = ref(false)

const load = async () => {
	if (!props.projectId) return
	try {
		const p = await getProject(Number(props.projectId))
		themeKey.value = p.ui_theme || 'classic'
	} catch (e) {
		console.warn('读取项目皮肤失败:', e)
	}
}

const chooseTheme = async (key: string) => {
	if (saving.value || key === themeKey.value) return
	saving.value = true
	try {
		await updateProject(Number(props.projectId), { ui_theme: key })
		themeKey.value = key
		ElMessage.success('播放器皮肤已切换，试玩即可看到')
	} catch (e: any) {
		ElMessage.error(e?.response?.data?.message || '切换皮肤失败')
	} finally {
		saving.value = false
	}
}

onMounted(load)
</script>
