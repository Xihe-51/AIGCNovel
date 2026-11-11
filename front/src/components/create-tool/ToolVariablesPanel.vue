<template>
	<div v-if="loading" class="tp-state">加载中…</div>
	<div v-else-if="!variables.length" class="tp-state">
		还没有变量，去项目信息页的「变量」里添加
	</div>
	<div v-else class="tp-list">
		<div v-for="v in variables" :key="v.variable_id" class="tp-var">
			<div class="tp-var-top">
				<span class="tp-var-label">{{ v.label }}</span>
				<span class="tp-var-init">初值 {{ v.initial_value }}</span>
			</div>
			<div class="tp-var-key">{{ v.name }}</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listVariables } from '@/api/variable'
import type { ProjectVariable } from '@/api/variable'

const props = defineProps<{ projectId: string | number }>()

const variables = ref<ProjectVariable[]>([])
const loading = ref(false)

const load = async () => {
	if (!props.projectId) return
	loading.value = true
	try {
		variables.value = (await listVariables(Number(props.projectId))) || []
	} catch (e) {
		console.error('加载变量失败:', e)
		variables.value = []
	} finally {
		loading.value = false
	}
}

onMounted(load)
</script>
