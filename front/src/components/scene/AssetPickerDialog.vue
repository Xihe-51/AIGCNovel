<template>
	<el-dialog v-model="visibleModel" :title="dialogTitle" width="620px" append-to-body>
		<div v-if="loading" class="asset-pick-state">正在读取素材…</div>
		<div v-else-if="!items.length" class="asset-pick-state">
			素材库里还没有可用的{{ kind === 'image' ? '图片' : '音频' }}。
		</div>
		<div v-else class="asset-pick-grid">
			<button
				v-for="a in items"
				:key="a.url"
				type="button"
				:class="['asset-pick-item', { 'is-selected': selectedUrl === a.url }]"
				@click="emit('select', a)"
			>
				<img v-if="kind === 'image'" :src="baseUrl + a.url" alt="" loading="lazy" />
				<span v-else class="asset-pick-audio">♪</span>
				<span class="asset-pick-url" :title="a.url">{{ a.url.split('/').pop() }}</span>
				<span class="asset-pick-meta">
					{{ a.usage_count ? '引用 ' + a.usage_count + ' 处' : '未引用' }}
				</span>
			</button>
		</div>
		<template #footer>
			<el-button @click="visibleModel = false">取消</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssetItem } from '@/api/asset'

const props = withDefaults(defineProps<{
	visible: boolean
	kind: 'image' | 'audio'
	loading: boolean
	items: AssetItem[]
	baseUrl: string
	selectedUrl?: string
}>(), {
	selectedUrl: ''
})

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'select', asset: AssetItem): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const dialogTitle = computed(() =>
	props.kind === 'image' ? '从素材库选择背景' : '从素材库选择音乐'
)
</script>

<style src="./assetPickerDialog.css"></style>
