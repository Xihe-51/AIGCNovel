<template>
	<div class="sv-root">
		<div class="sv-head">
			<div>
				<div class="sv-title">存档检查器</div>
				<div v-if="!loading && !error" class="sv-sub">
					{{ total }} 份存档 · {{ players }} 位玩家
				</div>
			</div>
			<button class="sv-refresh" type="button" :disabled="loading" @click="load">
				{{ loading ? '读取中…' : '刷新' }}
			</button>
		</div>

		<div v-if="error" class="sv-error">{{ error }}</div>

		<template v-else>
			<el-input
				v-model="keyword"
				size="small"
				clearable
				placeholder="搜索玩家 / 场景 / 摘要"
				class="sv-search"
			/>

			<div v-if="loading && !items.length" class="sv-state">加载中…</div>
			<div v-else-if="!filtered.length" class="sv-state">
				{{ items.length ? '没有匹配的存档' : '还没有玩家存档' }}
			</div>
			<div v-else class="sv-list">
				<div v-for="it in filtered" :key="it.user_id + '-' + it.slot" class="sv-item">
					<div class="sv-item-head">
						<span class="sv-user">{{ it.username }}</span>
						<span :class="['sv-slot', { 'is-auto': it.slot === 0 }]">{{ it.slot_label }}</span>
						<span class="sv-time">{{ formatTime(it.updated_at) }}</span>
					</div>
					<div class="sv-item-scene">
						{{ it.resolved_scene_title || it.scene_title || '未知场景' }}
						<span v-if="it.scene_order" class="sv-scene-order">第 {{ it.scene_order }} 幕</span>
					</div>
					<div v-if="it.content_text" class="sv-item-text">{{ it.content_text }}</div>
					<div v-else-if="it.summary" class="sv-item-text">{{ it.summary }}</div>
					<div class="sv-item-meta">
						<span>第 {{ it.playthrough }} 周目</span>
						<span>{{ it.variables_count }} 变量</span>
						<span>{{ it.history_count }} 句回顾</span>
					</div>
					<div class="sv-item-acts">
						<button type="button" class="sv-act" @click="openDetail(it)">详情</button>
						<button
							type="button"
							class="sv-act"
							:disabled="!it.scene_id"
							title="在创作页定位到该存档所在节点"
							@click="locate(it)"
						>定位</button>
						<button type="button" class="sv-act is-danger" @click="remove(it)">删除</button>
					</div>
				</div>
			</div>
		</template>

		<el-dialog v-model="detailVisible" :title="detailTitle" width="560px" append-to-body>
			<div v-if="detailLoading" class="sv-state">读取存档中…</div>
			<template v-else-if="detail">
				<div class="sv-detail-grid">
					<div class="sv-detail-row">
						<span class="sv-detail-label">玩家</span>
						<span>{{ detail.username }}</span>
					</div>
					<div class="sv-detail-row">
						<span class="sv-detail-label">存档位</span>
						<span>{{ detail.slot_label }}</span>
					</div>
					<div class="sv-detail-row">
						<span class="sv-detail-label">位置</span>
						<span>
							{{ detail.resolved_scene_title || detail.scene_title || '未知场景' }}
							<span v-if="detail.scene_order" class="sv-scene-order">第 {{ detail.scene_order }} 幕</span>
						</span>
					</div>
					<div class="sv-detail-row">
						<span class="sv-detail-label">节点</span>
						<span>{{ detail.content_text || (detail.content_id ? '#' + detail.content_id : '场景末尾') }}</span>
					</div>
					<div class="sv-detail-row">
						<span class="sv-detail-label">进度</span>
						<span>
							第 {{ detail.playthrough }} 周目 ·
							{{ detail.variables_count }} 变量 ·
							{{ detail.history_count }} 句回顾 ·
							{{ detail.triggered_endings.length }} 个结局
						</span>
					</div>
					<div class="sv-detail-row">
						<span class="sv-detail-label">更新时间</span>
						<span>{{ formatTime(detail.updated_at) }}</span>
					</div>
				</div>

				<div v-if="variableRows.length" class="sv-detail-section">
					<div class="sv-detail-title">变量</div>
					<div class="sv-vars">
						<span v-for="v in variableRows" :key="v.name" class="sv-var">
							{{ v.name }} = {{ v.value }}
						</span>
					</div>
				</div>

				<div v-if="recentHistory.length" class="sv-detail-section">
					<div class="sv-detail-title">最近回顾</div>
					<div v-for="(h, i) in recentHistory" :key="i" class="sv-history">
						<span class="sv-history-where">{{ h.scene_title || '场景' }}</span>
						<span class="sv-history-text">{{ h.content_text || '' }}</span>
					</div>
				</div>

				<div class="sv-detail-note">存档检查器仅供作者排查玩家进度，不会修改玩家存档。</div>
			</template>

			<template #footer>
				<el-button @click="detailVisible = false">关闭</el-button>
				<el-button v-if="detail && detail.scene_id" @click="locate(detail)">定位到该节点</el-button>
				<el-button v-if="detail" type="danger" plain @click="remove(detail)">删除存档</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
	import { computed, onMounted, ref } from 'vue'
	import { ElMessage, ElMessageBox } from 'element-plus'
	import {
		deleteProjectSave,
		getProjectSave,
		listProjectSaves,
	} from '@/api/save'
	import type { ProjectSaveDetail, ProjectSaveItem } from '@/api/save'

	const props = defineProps<{
		projectId: string | number
	}>()

	const emit = defineEmits<{
		(e: 'locate', sceneId: number, contentId: number | null): void
	}>()

	const loading = ref(false)
	const error = ref('')
	const items = ref<ProjectSaveItem[]>([])
	const total = ref(0)
	const players = ref(0)
	const keyword = ref('')

	const detailVisible = ref(false)
	const detailLoading = ref(false)
	const detail = ref<ProjectSaveDetail | null>(null)

	const filtered = computed(() => {
		const kw = keyword.value.trim().toLowerCase()
		if (!kw) return items.value
		return items.value.filter(it =>
			[it.username, it.summary, it.scene_title, it.resolved_scene_title, it.content_text]
				.filter(Boolean)
				.some(text => String(text).toLowerCase().includes(kw))
		)
	})

	const detailTitle = computed(() => {
		if (!detail.value) return '存档详情'
		return `${detail.value.username} · ${detail.value.slot_label}`
	})

	const variableRows = computed(() => {
		const vars = detail.value?.state?.variables
		if (!vars || typeof vars !== 'object') return []
		return Object.entries(vars).map(([name, value]) => ({ name, value: String(value) }))
	})

	const recentHistory = computed(() => {
		const history = detail.value?.state?.historyDialogues
		if (!Array.isArray(history)) return []
		return history.slice(-5)
	})

	const formatTime = (iso: string | null) => {
		if (!iso) return '未记录'
		const date = new Date(iso)
		if (Number.isNaN(date.getTime())) return iso
		return date.toLocaleString()
	}

	const load = async () => {
		if (!props.projectId) return
		loading.value = true
		error.value = ''
		try {
			const data = await listProjectSaves(Number(props.projectId))
			items.value = data.items || []
			total.value = data.total || 0
			players.value = data.players || 0
		} catch (e: any) {
			console.error('读取存档检查器失败:', e)
			error.value = '读取失败：' + (e?.response?.data?.message || e?.message || '未知错误')
		} finally {
			loading.value = false
		}
	}

	const openDetail = async (item: ProjectSaveItem) => {
		detailVisible.value = true
		detailLoading.value = true
		detail.value = null
		try {
			detail.value = await getProjectSave(Number(props.projectId), item.user_id, item.slot)
		} catch (e: any) {
			console.error('读取存档详情失败:', e)
			ElMessage.error('读取存档详情失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
			detailVisible.value = false
		} finally {
			detailLoading.value = false
		}
	}

	const locate = (item: ProjectSaveItem) => {
		if (!item.scene_id) return
		emit('locate', Number(item.scene_id), item.content_id ?? null)
		detailVisible.value = false
	}

	const remove = async (item: ProjectSaveItem) => {
		try {
			await ElMessageBox.confirm(
				`确定删除「${item.username} · ${item.slot_label}」的存档吗？删除后玩家无法恢复。`,
				'删除玩家存档',
				{ confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
			)
			await deleteProjectSave(Number(props.projectId), item.user_id, item.slot)
			items.value = items.value.filter(it => !(it.user_id === item.user_id && it.slot === item.slot))
			total.value = Math.max(0, total.value - 1)
			players.value = new Set(items.value.map(it => it.user_id)).size
			detailVisible.value = false
			ElMessage.success('存档已删除')
		} catch (e: any) {
			if (e === 'cancel' || e === 'close') return
			console.warn('删除玩家存档失败:', e)
			ElMessage.error('删除失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		}
	}

	onMounted(load)
</script>

<style scoped>
	.sv-root {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.sv-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}

	.sv-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--el-text-color-primary, #303133);
	}

	.sv-sub {
		margin-top: 2px;
		font-size: 11px;
		color: var(--el-text-color-secondary, #909399);
	}

	.sv-refresh {
		padding: 4px 10px;
		font-size: 12px;
		color: var(--el-color-primary, #409eff);
		background: transparent;
		border: 1px solid var(--el-color-primary-light-7, #a0cfff);
		border-radius: 6px;
		cursor: pointer;
	}

	.sv-refresh:disabled {
		opacity: .5;
		cursor: not-allowed;
	}

	.sv-search :deep(.el-input__wrapper) {
		border-radius: 6px;
	}

	.sv-error,
	.sv-state {
		padding: 10px;
		font-size: 12px;
		color: var(--el-text-color-secondary, #909399);
		text-align: center;
	}

	.sv-error {
		color: var(--el-color-danger, #f56c6c);
	}

	.sv-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 48vh;
		overflow-y: auto;
		overflow-x: hidden;
		padding-right: 2px;
	}

	.sv-item {
		padding: 8px 10px;
		background: var(--el-fill-color-blank, #fff);
		border: 1px solid var(--el-border-color-lighter, #ebeef5);
		border-radius: 8px;
	}

	.sv-item-head {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
	}

	.sv-user {
		font-size: 12px;
		font-weight: 600;
		color: var(--el-text-color-primary, #303133);
		max-width: 110px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sv-slot {
		padding: 1px 6px;
		border-radius: 999px;
		color: var(--el-color-primary, #409eff);
		background: var(--el-color-primary-light-9, #ecf5ff);
		white-space: nowrap;
	}

	.sv-slot.is-auto {
		color: var(--el-color-warning-dark-2, #b88230);
		background: var(--el-color-warning-light-9, #fdf6ec);
	}

	.sv-time {
		margin-left: auto;
		color: var(--el-text-color-secondary, #909399);
		white-space: nowrap;
	}

	.sv-item-scene {
		margin-top: 4px;
		font-size: 12px;
		color: var(--el-text-color-primary, #303133);
	}

	.sv-scene-order {
		margin-left: 6px;
		font-size: 11px;
		color: var(--el-text-color-secondary, #909399);
	}

	.sv-item-text {
		margin-top: 3px;
		font-size: 11px;
		color: var(--el-text-color-regular, #606266);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.sv-item-meta {
		display: flex;
		gap: 10px;
		margin-top: 5px;
		font-size: 11px;
		color: var(--el-text-color-secondary, #909399);
	}

	.sv-item-acts {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
		margin-top: 6px;
	}

	.sv-act {
		padding: 2px 9px;
		font-size: 11px;
		color: var(--el-text-color-regular, #606266);
		background: var(--el-fill-color-light, #f5f7fa);
		border: 1px solid var(--el-border-color-lighter, #ebeef5);
		border-radius: 5px;
		cursor: pointer;
	}

	.sv-act:hover {
		color: var(--el-color-primary, #409eff);
		border-color: var(--el-color-primary-light-7, #a0cfff);
	}

	.sv-act:disabled {
		opacity: .45;
		cursor: not-allowed;
	}

	.sv-act.is-danger {
		color: var(--el-color-danger, #f56c6c);
	}

	.sv-detail-grid {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.sv-detail-row {
		display: flex;
		gap: 10px;
		font-size: 12px;
		color: var(--el-text-color-regular, #606266);
	}

	.sv-detail-label {
		width: 64px;
		flex: none;
		color: var(--el-text-color-secondary, #909399);
	}

	.sv-detail-section {
		margin-top: 14px;
	}

	.sv-detail-title {
		margin-bottom: 6px;
		font-size: 12px;
		font-weight: 600;
		color: var(--el-text-color-primary, #303133);
	}

	.sv-vars {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.sv-var {
		padding: 2px 8px;
		font-size: 11px;
		color: var(--el-text-color-regular, #606266);
		background: var(--el-fill-color-light, #f5f7fa);
		border-radius: 4px;
	}

	.sv-history {
		display: flex;
		gap: 6px;
		padding: 4px 0;
		font-size: 11px;
		border-bottom: 1px dashed var(--el-border-color-lighter, #ebeef5);
	}

	.sv-history-where {
		flex: none;
		max-width: 110px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--el-text-color-secondary, #909399);
	}

	.sv-history-text {
		color: var(--el-text-color-regular, #606266);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.sv-detail-note {
		margin-top: 14px;
		font-size: 11px;
		color: var(--el-text-color-secondary, #909399);
	}
</style>
