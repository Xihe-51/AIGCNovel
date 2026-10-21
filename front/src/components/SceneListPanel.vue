<template>
	<div class="slp-root">
		<div class="slp-head">
			<span class="slp-head-title">场景</span>
			<span class="slp-head-count">{{ scenes.length }}</span>
		</div>

		<div v-if="loading && !scenes.length" class="slp-state">加载中…</div>
		<div v-else-if="error" class="slp-state slp-error">{{ error }}</div>
		<div v-else-if="!scenes.length" class="slp-state">还没有场景，点下面新建</div>

		<div v-else class="slp-list">
			<div
				v-for="s in sortedScenes"
				:key="s.scene_id"
				:class="['slp-item', { 'is-active': isActive(s.scene_id) }]"
				:title="s.title"
				@click="onSelect(s.scene_id)"
			>
				<div class="slp-thumb">
					<img v-if="s.background_url" :src="BASE_URL + s.background_url" alt="" loading="lazy" />
					<span v-else class="slp-thumb-idx">{{ s.order_num }}</span>
				</div>
				<div class="slp-meta">
					<div class="slp-name">{{ s.title || '未命名场景' }}</div>
					<div class="slp-sub">#{{ s.order_num }}</div>
				</div>
			</div>
		</div>

		<button class="slp-add" :disabled="creating" @click="handleAdd">
			<el-icon :size="14"><Plus /></el-icon>
			<span>{{ creating ? '创建中…' : '新建场景' }}</span>
		</button>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed, onMounted, watch } from 'vue'
	import { ElMessage } from 'element-plus'
	import { getScenes, createScene } from '@/api/scenes'
	import type { Scene } from '@/api/scenes'
	import { BASE_URL } from '@/utils/request'

	const props = defineProps<{
		projectId: string | number
		activeSceneId?: string | number
	}>()

	const emit = defineEmits<{
		(e: 'select', sceneId: string): void
		(e: 'created', sceneId: string): void
	}>()

	const scenes = ref<Scene[]>([])
	const loading = ref(false)
	const creating = ref(false)
	const error = ref<string | null>(null)

	const sortedScenes = computed(() =>
		[...scenes.value].sort((a, b) => a.order_num - b.order_num)
	)

	const isActive = (id: number) => String(id) === String(props.activeSceneId ?? '')

	const fetchScenes = async () => {
		if (!props.projectId) {
			error.value = '缺少项目ID，无法获取场景'
			return
		}
		loading.value = true
		error.value = null
		try {
			scenes.value = await getScenes(Number(props.projectId))
			// 没有任何选中项时，默认落到第一个场景，避免中栏空白
			if (!props.activeSceneId && sortedScenes.value.length) {
				emit('select', String(sortedScenes.value[0].scene_id))
			}
		} catch (e) {
			console.error('获取场景失败:', e)
			error.value = '场景加载失败'
			scenes.value = []
		} finally {
			loading.value = false
		}
	}

	const onSelect = (sceneId: number) => emit('select', String(sceneId))

	const handleAdd = async () => {
		if (creating.value) return
		creating.value = true
		try {
			const maxOrder = scenes.value.length
				? Math.max(...scenes.value.map(s => s.order_num))
				: 0
			const created = await createScene({
				project_id: Number(props.projectId),
				title: `新场景 ${maxOrder + 1}`,
				description: '',
				background_url: '',
				music_url: '',
				order_num: maxOrder + 1
			})
			scenes.value.push(created)
			emit('created', String(created.scene_id))
			emit('select', String(created.scene_id))
		} catch (e) {
			console.error('新建场景失败:', e)
			ElMessage.error('新建场景失败')
		} finally {
			creating.value = false
		}
	}

	onMounted(fetchScenes)
	watch(() => props.projectId, fetchScenes)

	defineExpose({ reload: fetchScenes })
</script>

<style scoped>
	.slp-root {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #fffafc;
		border-right: 1px solid #f5dbe4;
	}

	.slp-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 14px 10px;
		border-bottom: 1px solid #f7e3ea;
		flex-shrink: 0;
	}

	.slp-head-title {
		font-size: 13px;
		font-weight: 600;
		color: #c81f4a;
		letter-spacing: 0.5px;
	}

	.slp-head-count {
		font-size: 11px;
		color: #b37d8f;
		background: #fdeef3;
		padding: 1px 7px;
		border-radius: 9px;
	}

	.slp-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: #b37d8f;
		padding: 16px;
		text-align: center;
	}

	.slp-error {
		color: #d9534f;
	}

	.slp-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.slp-item {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 7px 8px;
		margin-bottom: 4px;
		border-radius: 9px;
		cursor: pointer;
		border-left: 3px solid transparent;
		transition: background 0.15s, border-color 0.15s;
	}

	.slp-item:hover {
		background: #fdf1f5;
	}

	.slp-item.is-active {
		background: #fde3eb;
		border-left-color: #e8467c;
	}

	.slp-thumb {
		width: 38px;
		height: 34px;
		border-radius: 6px;
		overflow: hidden;
		flex-shrink: 0;
		background: #f4e3e9;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.slp-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.slp-thumb-idx {
		font-size: 12px;
		font-weight: 600;
		color: #c98aa0;
	}

	.slp-meta {
		min-width: 0;
		flex: 1;
	}

	.slp-name {
		font-size: 13px;
		color: #3d2b32;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.slp-item.is-active .slp-name {
		color: #a3163c;
		font-weight: 600;
	}

	.slp-sub {
		font-size: 11px;
		color: #b99aa5;
		margin-top: 1px;
	}

	.slp-add {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		margin: 8px;
		padding: 9px;
		border: 1px dashed #f0b8ca;
		border-radius: 9px;
		background: #fff;
		color: #c81f4a;
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.slp-add:hover:not(:disabled) {
		background: #fdeef3;
		border-color: #e8467c;
	}

	.slp-add:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
</style>
