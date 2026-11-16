<template>
	<div class="slp-root">
		<div class="slp-head">
			<span class="slp-head-title">场景</span>
			<span class="slp-head-right">
				<span v-if="savingOrder" class="slp-saving">保存中…</span>
				<button type="button" class="slp-chapter-btn" @click="toggleBatch">
					{{ batchMode ? '退出批量' : '批量' }}
				</button>
				<button type="button" class="slp-chapter-btn" @click="openChapterDialog">章节</button>
				<span class="slp-head-count">{{ scenes.length }}</span>
			</span>
		</div>

		<div class="slp-search">
			<input
				v-model="searchQuery"
				class="slp-search-input"
				type="text"
				placeholder="搜索全项目：台词 / 角色 / 场景 / 选项"
			/>
			<div v-if="searchQuery.trim()" class="slp-replace-row">
				<input
					v-model="replaceQuery"
					class="slp-replace-input"
					type="text"
					placeholder="替换为（留空则删除）"
					@keyup.enter="applyReplace"
				/>
				<button
					type="button"
					class="slp-replace-btn"
					:disabled="replacing || searching || !searchResults.length"
					@click="applyReplace"
				>{{ replacing ? '替换中…' : '全部替换' }}</button>
			</div>
		</div>

		<!-- 批量操作栏 -->
		<div v-if="batchMode" class="slp-batch-bar">
			<div class="slp-batch-count">
				已选 <strong>{{ selectedIds.length }}</strong> / {{ scenes.length }}
				<button type="button" class="slp-batch-all" @click="toggleSelectAll">
					{{ selectedIds.length === scenes.length ? '全不选' : '全选' }}
				</button>
			</div>
			<div class="slp-batch-actions">
				<button type="button" :disabled="!selectedIds.length || batchBusy" @click="openBatchAsset('image')">换背景</button>
				<button type="button" :disabled="!selectedIds.length || batchBusy" @click="openBatchAsset('audio')">换音乐</button>
				<button type="button" :disabled="!selectedIds.length || batchBusy" @click="openBatchMove">移到章节</button>
				<button type="button" :disabled="!selectedIds.length || batchBusy" @click="batchDuplicate">复制</button>
				<button type="button" class="is-danger" :disabled="!selectedIds.length || batchBusy" @click="batchDelete">删除</button>
			</div>
		</div>

		<!-- 搜索结果 -->
		<div v-if="searchQuery.trim()" class="slp-search-results">
			<div v-if="searching" class="slp-state">搜索中…</div>
			<div v-else-if="!searchResults.length" class="slp-state">没有匹配内容</div>
			<div v-else class="slp-result-list">
				<div
					v-for="(r, ri) in searchResults"
					:key="ri"
					class="slp-result"
					@click="onOpenResult(r)"
				>
					<div class="slp-result-top">
						<span class="slp-result-scene">{{ r.scene_title || '未命名场景' }} · #{{ r.order_num ?? r.scene_order }}</span>
						<span class="slp-result-type">{{ resultTypeLabel(r) }}</span>
					</div>
					<div class="slp-result-text">
						<template v-for="(part, pi) in highlightParts(r.text)" :key="pi">
							<mark v-if="part.hit">{{ part.text }}</mark>
							<template v-else>{{ part.text }}</template>
						</template>
					</div>
					<div v-if="r.character_name" class="slp-result-char">{{ r.character_name }}</div>
				</div>
			</div>
		</div>

		<template v-else>
			<div v-if="loading && !scenes.length" class="slp-state">加载中…</div>
			<div v-else-if="error" class="slp-state slp-error">{{ error }}</div>
			<div v-else-if="!scenes.length" class="slp-state">还没有场景，点下面新建</div>

			<div v-else class="slp-list">
				<template v-for="g in sceneGroups" :key="g.key">
					<div v-if="g.title" class="slp-chapter-head" @click="toggleGroup(g.key)">
						<span class="slp-chapter-title">
							<span class="slp-chapter-caret">{{ isCollapsed(g.key) ? '▸' : '▾' }}</span>
							{{ g.title }}
						</span>
						<span class="slp-chapter-count">{{ g.scenes.length }}</span>
					</div>
					<div
						v-for="s in g.scenes"
						v-if="!isCollapsed(g.key)"
						:key="s.scene_id"
						:draggable="!batchMode"
						:class="[
							'slp-item',
							{
								'is-active': isActive(s.scene_id),
								'is-batch': batchMode,
								'is-checked': isChecked(s.scene_id),
								'is-dragging': dragId === s.scene_id,
								'is-drag-over': dragOverId === s.scene_id,
								'is-drag-over-after': dragOverId === s.scene_id && dropAfter
							}
						]"
						:title="s.title"
						@click="onItemClick(s)"
						@dragstart="onDragStart(s, $event)"
						@dragend="clearDragState"
						@dragover="onDragOver(s, $event)"
						@dragleave="onDragLeave(s)"
						@drop.prevent="onDrop(s)"
					>
						<span v-if="batchMode" class="slp-check" :class="{ on: isChecked(s.scene_id) }">
							{{ isChecked(s.scene_id) ? '✓' : '' }}
						</span>
						<span v-else class="slp-grip" title="拖动排序">⠿</span>
						<div class="slp-thumb">
							<img
								v-if="s.background_url && !brokenThumbs.includes(s.scene_id)"
								:src="BASE_URL + s.background_url"
								alt=""
								loading="lazy"
								@error="markThumbBroken(s.scene_id)"
							/>
							<span v-else class="slp-thumb-idx">{{ s.order_num }}</span>
						</div>
						<div class="slp-meta">
							<div class="slp-name">{{ s.title || '未命名场景' }}</div>
							<div class="slp-sub">#{{ s.order_num }}</div>
						</div>
						<button
							v-if="!batchMode"
							type="button"
							class="slp-dup"
							title="复制场景（含对话、分支、演出）"
							@click.stop="handleDuplicate(s)"
						>复</button>
						<button
							v-if="!batchMode"
							type="button"
							class="slp-del"
							title="删除场景"
							@click.stop="handleDelete(s)"
						>×</button>
					</div>
				</template>
			</div>
		</template>

		<button class="slp-add" :disabled="creating" @click="handleAdd">
			<el-icon :size="14"><Plus /></el-icon>
			<span>{{ creating ? '创建中…' : '新建场景' }}</span>
		</button>

		<el-dialog v-model="chapterDialogVisible" title="章节 / 幕分组" width="460px" append-to-body>
			<div class="slp-chapter-new">
				<input
					v-model="newChapterTitle"
					placeholder="新章节名，如：第一幕"
					@keyup.enter="addChapter"
				/>
				<button type="button" @click="addChapter">添加</button>
			</div>

			<div v-if="!chapters.length" class="slp-chapter-empty">
				还没有章节。章节只影响左侧列表分组，不改变播放顺序。
			</div>
			<div v-else class="slp-chapter-list">
				<div v-for="c in chapters" :key="c.chapter_id" class="slp-chapter-row">
					<input v-model="c.title" @change="renameChapter(c)" />
					<input
						v-model.number="c.target_words"
						class="slp-chapter-target"
						type="number"
						min="0"
						placeholder="目标字数"
						title="章节目标字数，0 表示不设目标"
						@change="saveChapterTarget(c)"
					/>
					<button type="button" class="slp-chapter-del" @click="removeChapter(c)">删除</button>
				</div>
			</div>

			<div class="slp-assign-title">场景归属</div>
			<div class="slp-assign-list">
				<div v-for="s in sortedScenes" :key="s.scene_id" class="slp-assign-row">
					<span class="slp-assign-name">{{ s.title || '未命名场景' }}</span>
					<select
						class="slp-assign-select"
						:value="chapterMap[s.scene_id] ?? ''"
						@change="onAssignChange(s, $event)"
					>
						<option value="">未分组</option>
						<option
							v-for="c in chapters"
							:key="c.chapter_id"
							:value="String(c.chapter_id)"
						>{{ c.title }}</option>
					</select>
				</div>
			</div>

			<template #footer>
				<el-button @click="chapterDialogVisible = false">完成</el-button>
			</template>
		</el-dialog>

		<!-- 批量换背景 / 音乐 -->
		<el-dialog
			v-model="batchAssetDialog"
			:title="batchAssetKind === 'image' ? '批量更换背景' : '批量更换音乐'"
			width="420px"
			append-to-body
		>
			<div class="slp-batch-tip">将应用到已选的 {{ selectedIds.length }} 个场景。</div>
			<input
				class="slp-batch-file"
				type="file"
				:accept="batchAssetKind === 'image' ? 'image/*' : 'audio/*'"
				@change="onBatchFileChange"
			/>
			<div v-if="batchAssetKind === 'audio'" class="slp-batch-extra">
				<button type="button" :disabled="batchBusy" @click="clearBatchMusic">清空所选场景的音乐</button>
			</div>
			<template #footer>
				<el-button @click="batchAssetDialog = false">取消</el-button>
				<el-button
					type="primary"
					:loading="batchBusy"
					:disabled="!batchAssetFile"
					@click="applyBatchAsset"
				>上传并应用</el-button>
			</template>
		</el-dialog>

		<!-- 批量移动章节 -->
		<el-dialog v-model="batchMoveDialog" title="批量移动到章节" width="400px" append-to-body>
			<div class="slp-batch-tip">把已选的 {{ selectedIds.length }} 个场景移动到：</div>
			<select v-model="batchMoveChapter" class="slp-batch-select">
				<option value="">未分组</option>
				<option v-for="c in chapters" :key="c.chapter_id" :value="String(c.chapter_id)">
					{{ c.title }}
				</option>
			</select>
			<template #footer>
				<el-button @click="batchMoveDialog = false">取消</el-button>
				<el-button type="primary" :loading="batchBusy" @click="applyBatchMove">移动</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed, onMounted, watch } from 'vue'
	import { ElMessage, ElMessageBox } from 'element-plus'
	import { getScenes, createScene, updateScene, deleteScene, duplicateScene } from '@/api/scenes'
	import type { Scene } from '@/api/scenes'
	import { getProjectOutline } from '@/api/outline'
	import { BASE_URL } from '@/utils/request'
	import {
		buildSceneGroups,
		moveSceneInList,
		renumberScenes,
		searchResultTypeLabel,
		sortScenesByOrder,
		splitHighlightParts,
	} from '@/utils/sceneList'
	import { useSceneProjectSearch } from '@/composables/scene/useSceneProjectSearch'
	import { useSceneChapters } from '@/composables/scene/useSceneChapters'
	import { useSceneBatchOps } from '@/composables/scene/useSceneBatchOps'

	const props = defineProps<{
		projectId: string | number
		activeSceneId?: string | number
	}>()

	const emit = defineEmits<{
		(e: 'select', sceneId: string): void
		(e: 'created', sceneId: string): void
		(e: 'deleted', sceneId: string): void
		(e: 'locate', sceneId: number, contentId: number | null): void
		(e: 'data-changed'): void
	}>()

	const scenes = ref<Scene[]>([])
	const loading = ref(false)
	const creating = ref(false)
	const error = ref<string | null>(null)

	// ---- 全项目搜索 / 替换 ----
	const {
		query: searchQuery,
		results: searchResults,
		searching,
		replaceQuery,
		replacing,
		applyReplace,
		openResult: onOpenResult,
	} = useSceneProjectSearch({
		projectId: computed(() => props.projectId),
		onLocate: (sceneId, contentId) => emit('locate', sceneId, contentId),
		onDataChanged: () => emit('data-changed'),
	})

	const resultTypeLabel = searchResultTypeLabel

	// 把命中词拆成普通片段/高亮片段，避免使用 v-html
	const highlightParts = (text: string) => splitHighlightParts(text, searchQuery.value)

	// ---- 章节 / 幕分组 ----
	const {
		chapters,
		chapterMap,
		dialogVisible: chapterDialogVisible,
		newTitle: newChapterTitle,
		isCollapsed,
		toggleGroup,
		fetchChapters,
		openDialog: openChapterDialog,
		addChapter,
		renameChapter,
		saveTarget: saveChapterTarget,
		removeChapter,
		onAssignChange: assignSceneChapter,
	} = useSceneChapters({ projectId: computed(() => props.projectId) })

	const sceneGroups = computed(() =>
		buildSceneGroups(chapters.value, chapterMap.value, sortedScenes.value)
	)

	const onAssignChange = (s: Scene, e: Event) => assignSceneChapter(s.scene_id, e)

	// ---- 批量操作 ----
	const sortedScenes = computed(() => sortScenesByOrder(scenes.value))

	const isActive = (id: number) => String(id) === String(props.activeSceneId ?? '')

	// 序号持久化与拖拽态由本组件持有，批量删除后的重排要复用
	const savingOrder = ref(false)

	const {
		batchMode,
		selectedIds,
		batchBusy,
		assetDialog: batchAssetDialog,
		assetKind: batchAssetKind,
		assetFile: batchAssetFile,
		moveDialog: batchMoveDialog,
		moveChapter: batchMoveChapter,
		isChecked,
		toggleSelect,
		toggleBatch,
		toggleSelectAll,
		openAsset: openBatchAsset,
		onFileChange: onBatchFileChange,
		applyAsset: applyBatchAsset,
		clearMusic: clearBatchMusic,
		openMove: openBatchMove,
		applyMove: applyBatchMove,
		duplicate: batchDuplicate,
		remove: batchDelete,
	} = useSceneBatchOps({
		projectId: computed(() => props.projectId),
		scenes,
		sortedScenes,
		savingOrder,
		isActive,
		reloadScenes: () => fetchScenes(),
		reloadChapters: fetchChapters,
		onDataChanged: () => emit('data-changed'),
		emitDeleted: id => emit('deleted', id),
		emitSelect: id => emit('select', id),
		clearDragState: () => clearDragState(),
	})

	const onItemClick = (s: Scene) => {
		if (batchMode.value) toggleSelect(s.scene_id)
		else onSelect(s.scene_id)
	}


	// 背景图文件丢失时记录 scene_id，缩略图退回序号占位，避免裂图
	const brokenThumbs = ref<number[]>([])
	const markThumbBroken = (id: number) => {
		if (!brokenThumbs.value.includes(id)) brokenThumbs.value.push(id)
	}

	// ---- 拖拽排序 ----
	const dragId = ref<number | null>(null)
	const dragOverId = ref<number | null>(null)
	const dropAfter = ref(false)

	const clearDragState = () => {
		dragId.value = null
		dragOverId.value = null
		dropAfter.value = false
	}

	const onDragStart = (s: Scene, e: DragEvent) => {
		if (batchMode.value) return
		dragId.value = s.scene_id
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move'
			// Firefox 必须 setData 才会真正开始拖拽
			e.dataTransfer.setData('text/plain', String(s.scene_id))
		}
	}

	const onDragOver = (s: Scene, e: DragEvent) => {
		if (dragId.value === null || dragId.value === s.scene_id) return
		e.preventDefault()
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
		// 鼠标在目标上半区 → 插到它前面；下半区 → 插到它后面
		const el = e.currentTarget as HTMLElement | null
		const rect = el ? el.getBoundingClientRect() : null
		dropAfter.value = rect ? e.clientY > rect.top + rect.height / 2 : false
		dragOverId.value = s.scene_id
	}

	const onDragLeave = (s: Scene) => {
		if (dragOverId.value === s.scene_id) {
			dragOverId.value = null
			dropAfter.value = false
		}
	}

	const onDrop = async (target: Scene) => {
		if (batchMode.value) return
		const fromId = dragId.value
		const after = dropAfter.value
		clearDragState()
		if (fromId === null) return

		// 先把新顺序落到本地，界面立即生效；再逐条持久化
		const list = moveSceneInList(sortedScenes.value, fromId, target.scene_id, after)
		if (!list) return
		scenes.value = list

		savingOrder.value = true
		try {
			await Promise.all(list.map(s => updateScene(s.scene_id, { order_num: s.order_num })))
		} catch (e) {
			console.error('保存场景顺序失败:', e)
			ElMessage.error('保存场景顺序失败，已恢复原顺序')
			await fetchScenes()
		} finally {
			savingOrder.value = false
		}
	}

	const LAST_SCENE_PREFIX = 'aigc:create:lastScene:'
	const readLastSceneId = () => {
		try {
			return localStorage.getItem(`${LAST_SCENE_PREFIX}${props.projectId}`) || ''
		} catch (e) {
			return ''
		}
	}

	// 初始场景：优先上次编辑的场景；没有历史时跳过空场景，避免一打开就是空白剧本
	const pickInitialScene = async () => {
		const list = sortedScenes.value
		if (!list.length) return null
		const lastId = readLastSceneId()
		const last = lastId ? list.find(s => String(s.scene_id) === lastId) : null
		if (last) return last
		try {
			const outline = await getProjectOutline(Number(props.projectId))
			const rows = [
				...(outline.chapters || []).flatMap(ch => ch.scenes || []),
				...(outline.ungrouped || []),
			]
			const counts = new Map(rows.map(r => [Number(r.scene_id), Number(r.node_count) || 0]))
			const withNodes = list.find(s => (counts.get(Number(s.scene_id)) || 0) > 0)
			if (withNodes) return withNodes
		} catch (e) {
			console.warn('读取大纲选择初始场景失败:', e)
		}
		return list[0]
	}

	const fetchScenes = async () => {
		if (!props.projectId) {
			error.value = '缺少项目ID，无法获取场景'
			return
		}
		loading.value = true
		error.value = null
		try {
			scenes.value = await getScenes(Number(props.projectId))
			// 章节归属随场景一起刷新（新建/复制/删除后分组保持正确）
			await fetchChapters()
			// 重新拉取后重置缺图标记，文件补回来后缩略图能自动恢复
			brokenThumbs.value = []
			// 没有任何选中项时：上次场景 → 第一个有内容的场景 → 第一个场景
			if (!props.activeSceneId && sortedScenes.value.length) {
				const initial = await pickInitialScene()
				if (initial) emit('select', String(initial.scene_id))
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

	const duplicating = ref(false)

	const handleDuplicate = async (s: Scene) => {
		if (duplicating.value) return
		duplicating.value = true
		try {
			const created = await duplicateScene(s.scene_id)
			await fetchScenes()
			emit('created', String(created.scene_id))
			emit('select', String(created.scene_id))
			ElMessage.success('场景已复制（含对话、分支、演出）')
		} catch (e) {
			console.error('复制场景失败:', e)
			ElMessage.error('复制场景失败')
		} finally {
			duplicating.value = false
		}
	}

	const handleDelete = async (s: Scene) => {
		try {
			await ElMessageBox.confirm(
				`删除场景「${s.title || '未命名场景'}」？场景里的对话和分支会一起删除。`,
				'删除场景',
				{ type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
			)
		} catch {
			return
		}

		try {
			await deleteScene(s.scene_id)
		} catch (e) {
			console.error('删除场景失败:', e)
			ElMessage.error('删除场景失败')
			return
		}

		const wasActive = isActive(s.scene_id)
		scenes.value = scenes.value.filter(x => x.scene_id !== s.scene_id)
		emit('deleted', String(s.scene_id))

		// 剩下的场景重新连续编号，避免左栏出现 #2、#4 这种断档
		const { list: rest, changed } = renumberScenes(sortedScenes.value)
		if (changed.length) {
			savingOrder.value = true
			Promise.all(changed.map(x => updateScene(x.scene_id, { order_num: x.order_num })))
				.catch(e => console.error('重排场景序号失败:', e))
				.finally(() => { savingOrder.value = false })
		}

		if (wasActive) {
			emit('select', rest.length ? String(rest[0].scene_id) : '')
		}
		ElMessage.success('场景已删除')
	}

	onMounted(fetchScenes)
	watch(() => props.projectId, fetchScenes)

	defineExpose({ reload: fetchScenes })
</script>

<style scoped src="./scene/sceneListShell.css"></style>
<style scoped src="./scene/sceneListBatch.css"></style>
<style scoped src="./scene/sceneListChapter.css"></style>
<style scoped src="./scene/sceneListSearch.css"></style>
<style scoped src="./scene/sceneListItem.css"></style>
