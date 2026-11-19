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
	import { computed, onMounted, watch } from 'vue'
	import type { Scene } from '@/api/scenes'
	import { BASE_URL } from '@/utils/request'
	import { buildSceneGroups, searchResultTypeLabel, splitHighlightParts } from '@/utils/sceneList'
	import { useSceneProjectSearch } from '@/composables/scene/useSceneProjectSearch'
	import { useSceneChapters } from '@/composables/scene/useSceneChapters'
	import { useSceneBatchOps } from '@/composables/scene/useSceneBatchOps'
	import { useSceneListPanel } from '@/composables/scene/useSceneListPanel'

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

	// ---- 场景列表主体（加载 / 增删改 / 拖拽排序 / 初始场景）----
	const {
		scenes,
		loading,
		creating,
		duplicating,
		error,
		sortedScenes,
		savingOrder,
		isActive,
		brokenThumbs,
		markThumbBroken,
		dragId,
		dragOverId,
		dropAfter,
		clearDragState,
		onDragStart,
		onDragOver,
		onDragLeave,
		onDrop,
		fetchScenes,
		handleAdd,
		handleDuplicate,
		handleDelete,
	} = useSceneListPanel({
		projectId: computed(() => props.projectId),
		activeSceneId: () => props.activeSceneId,
		batchMode: () => batchMode.value,
		reloadChapters: () => fetchChapters(),
		onSelect: id => emit('select', id),
		onCreated: id => emit('created', id),
		onDeleted: id => emit('deleted', id),
	})

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
		else emit('select', String(s.scene_id))
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
