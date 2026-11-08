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
	import { getScenes, createScene, updateScene, deleteScene, duplicateScene, uploadSceneFile, searchProject, replaceProjectText } from '@/api/scenes'
	import type { Scene, ProjectSearchItem } from '@/api/scenes'
	import {
		listChapters,
		createChapter,
		updateChapter,
		deleteChapter,
		assignSceneChapter,
	} from '@/api/chapter'
	import type { StoryChapter } from '@/api/chapter'
	import { getProjectOutline } from '@/api/outline'
	import { BASE_URL } from '@/utils/request'

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

	// ---- 全项目搜索 ----
	const searchQuery = ref('')
	const searchResults = ref<ProjectSearchItem[]>([])
	const searching = ref(false)
	let searchTimer: ReturnType<typeof setTimeout> | null = null
	let searchSeq = 0

	const runSearch = async () => {
		const q = searchQuery.value.trim()
		if (!q) {
			searchResults.value = []
			searching.value = false
			return
		}
		const seq = ++searchSeq
		searching.value = true
		try {
			const res = await searchProject(Number(props.projectId), q)
			if (seq === searchSeq) searchResults.value = res.items || []
		} catch (e) {
			console.warn('搜索失败:', e)
			if (seq === searchSeq) searchResults.value = []
		} finally {
			if (seq === searchSeq) searching.value = false
		}
	}

	watch(searchQuery, () => {
		if (searchTimer) clearTimeout(searchTimer)
		searchTimer = setTimeout(runSearch, 300)
	})

	// ---- 全项目替换 ----
	const replaceQuery = ref('')
	const replacing = ref(false)
	const applyReplace = async () => {
		const q = searchQuery.value.trim()
		if (!q || replacing.value) return
		replacing.value = true
		try {
			const dry = await replaceProjectText(Number(props.projectId), q, replaceQuery.value, true)
			if (!dry.occurrences) {
				ElMessage.info('没有可替换的内容')
				return
			}
			const parts = [`${dry.occurrences} 处`]
			if (dry.contents) parts.push(`台词/旁白 ${dry.contents} 条`)
			if (dry.choices) parts.push(`选项 ${dry.choices} 条`)
			if (dry.scenes) parts.push(`场景 ${dry.scenes} 个`)
			const extra = replaceQuery.value ? '' : '替换内容为空，这些文字将被删除。'
			try {
				await ElMessageBox.confirm(
					`将替换 ${parts.join('，')}。${extra}是否继续？`,
					'批量替换',
					{ type: 'warning', confirmButtonText: '全部替换', cancelButtonText: '取消' }
				)
			} catch {
				return
			}
			const res = await replaceProjectText(Number(props.projectId), q, replaceQuery.value, false)
			ElMessage.success(`已替换 ${res.occurrences} 处`)
			await runSearch()
			emit('data-changed')
		} catch (e: any) {
			ElMessage.error('替换失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			replacing.value = false
		}
	}

	const resultTypeLabel = (r: ProjectSearchItem) => {
		if (r.result_type === 'choice') return '选项'
		if (r.result_type === 'scene') return '场景'
		return r.content_type || '剧情'
	}

	// 把命中词拆成普通片段/高亮片段，避免使用 v-html
	const highlightParts = (text: string) => {
		const q = searchQuery.value.trim()
		const src = String(text || '')
		if (!q) return [{ text: src, hit: false }]
		const lower = src.toLowerCase()
		const needle = q.toLowerCase()
		const parts: { text: string; hit: boolean }[] = []
		let i = 0
		while (i < src.length) {
			const pos = lower.indexOf(needle, i)
			if (pos < 0) {
				parts.push({ text: src.slice(i), hit: false })
				break
			}
			if (pos > i) parts.push({ text: src.slice(i, pos), hit: false })
			parts.push({ text: src.slice(pos, pos + q.length), hit: true })
			i = pos + q.length
		}
		return parts.filter(p => p.text)
	}

	const onOpenResult = (r: ProjectSearchItem) => {
		emit('locate', r.scene_id, r.content_id)
		// 打开结果后收起搜索面板，恢复场景列表并显示当前场景
		searchQuery.value = ''
		searchResults.value = []
	}

	// ---- 章节 / 幕分组 ----
	const chapters = ref<StoryChapter[]>([])
	const chapterMap = ref<Record<number, number>>({})
	const chapterDialogVisible = ref(false)
	const newChapterTitle = ref('')
	// 大项目折叠分组，减少一次性渲染的场景条目
	const collapsedGroups = ref<string[]>([])
	const isCollapsed = (key: string) => collapsedGroups.value.includes(key)
	const toggleGroup = (key: string) => {
		const i = collapsedGroups.value.indexOf(key)
		if (i >= 0) collapsedGroups.value.splice(i, 1)
		else collapsedGroups.value.push(key)
	}

	const fetchChapters = async () => {
		if (!props.projectId) return
		try {
			const res = await listChapters(Number(props.projectId))
			chapters.value = (res.chapters || []).sort((a, b) => a.order_num - b.order_num)
			chapterMap.value = res.scene_map || {}
		} catch (e) {
			console.warn('读取章节失败:', e)
			chapters.value = []
			chapterMap.value = {}
		}
	}

	const sceneGroups = computed(() => {
		const groups: { key: string; title: string; chapterId: number | null; scenes: Scene[] }[] = []
		for (const c of chapters.value) {
			groups.push({
				key: 'chapter-' + c.chapter_id,
				title: c.title,
				chapterId: c.chapter_id,
				scenes: [],
			})
		}
		const byChapter = new Map<number, (typeof groups)[number]>()
		for (const g of groups) {
			if (g.chapterId !== null) byChapter.set(g.chapterId, g)
		}
		const ungrouped: (typeof groups)[number] = {
			key: 'ungrouped',
			title: chapters.value.length ? '未分组' : '',
			chapterId: null,
			scenes: [],
		};
		for (const s of sortedScenes.value) {
			const cid = chapterMap.value[s.scene_id]
			const group = cid ? byChapter.get(cid) : null
			if (group) group.scenes.push(s)
			else ungrouped.scenes.push(s)
		}
		const result = groups.filter(g => g.scenes.length)
		if (ungrouped.scenes.length) result.push(ungrouped)
		return result
	})

	const openChapterDialog = async () => {
		chapterDialogVisible.value = true
		await fetchChapters()
	}

	const addChapter = async () => {
		const title = newChapterTitle.value.trim()
		if (!title) {
			ElMessage.warning('请填写章节名')
			return
		}
		try {
			await createChapter(Number(props.projectId), title)
			newChapterTitle.value = ''
			await fetchChapters()
			ElMessage.success('章节已创建')
		} catch (e: any) {
			ElMessage.error('创建章节失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		}
	}

	const renameChapter = async (c: StoryChapter) => {
		const title = String(c.title || '').trim()
		if (!title) {
			ElMessage.warning('章节名不能为空')
			await fetchChapters()
			return
		}
		try {
			await updateChapter(Number(props.projectId), c.chapter_id, { title })
			ElMessage.success('章节已重命名')
		} catch (e: any) {
			ElMessage.error('重命名失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
			await fetchChapters()
		}
	}

	// 目标字数：0 表示不设目标；输入非法时回退为 0
	const saveChapterTarget = async (c: StoryChapter) => {
		const target = Math.max(0, Number(c.target_words) || 0)
		c.target_words = target
		try {
			await updateChapter(Number(props.projectId), c.chapter_id, { target_words: target })
			ElMessage.success(target ? `目标已设为 ${target} 字` : '已取消目标字数')
		} catch (e: any) {
			ElMessage.error('保存目标失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
			await fetchChapters()
		}
	}

	const removeChapter = async (c: StoryChapter) => {
		try {
			await ElMessageBox.confirm(
				`删除章节「${c.title}」？该章节下的场景会回到「未分组」，场景本身不会删除。`,
				'删除章节',
				{ confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
			)
		} catch {
			return
		}
		try {
			await deleteChapter(Number(props.projectId), c.chapter_id)
			await fetchChapters()
			ElMessage.success('章节已删除')
		} catch (e: any) {
			ElMessage.error('删除失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		}
	}

	const onAssignChange = async (s: Scene, e: Event) => {
		const raw = (e.target as HTMLSelectElement).value
		const cid = raw ? Number(raw) : null
		try {
			await assignSceneChapter(Number(props.projectId), s.scene_id, cid)
			if (cid) {
				chapterMap.value = { ...chapterMap.value, [s.scene_id]: cid }
			} else {
				const next: Record<number, number> = { ...chapterMap.value }
				delete (next as any)[s.scene_id]
				chapterMap.value = next
			}
			ElMessage.success('场景归属已更新')
		} catch (err: any) {
			ElMessage.error('更新失败：' + (err?.response?.data?.message || err?.message || '未知错误'))
			await fetchChapters()
		}
	}
	// ---- 批量操作 ----
	const batchMode = ref(false)
	const selectedIds = ref<number[]>([])
	const batchBusy = ref(false)
	const batchAssetDialog = ref(false)
	const batchAssetKind = ref<'image' | 'audio'>('image')
	const batchAssetFile = ref<File | null>(null)
	const batchMoveDialog = ref(false)
	const batchMoveChapter = ref('')

	const isChecked = (id: number) => selectedIds.value.includes(id)

	const toggleSelect = (id: number) => {
		const i = selectedIds.value.indexOf(id)
		if (i >= 0) selectedIds.value.splice(i, 1)
		else selectedIds.value.push(id)
	}

	const onItemClick = (s: Scene) => {
		if (batchMode.value) toggleSelect(s.scene_id)
		else onSelect(s.scene_id)
	}

	const toggleBatch = () => {
		batchMode.value = !batchMode.value
		selectedIds.value = []
		clearDragState()
	}

	const toggleSelectAll = () => {
		selectedIds.value = selectedIds.value.length === scenes.value.length
			? []
			: scenes.value.map(s => s.scene_id)
	}

	const openBatchAsset = (kind: 'image' | 'audio') => {
		if (!selectedIds.value.length) return
		batchAssetKind.value = kind
		batchAssetFile.value = null
		batchAssetDialog.value = true
	}

	const onBatchFileChange = (e: Event) => {
		const input = e.target as HTMLInputElement
		batchAssetFile.value = input.files?.[0] || null
	}

	const applyBatchAsset = async () => {
		const file = batchAssetFile.value
		if (!file || !selectedIds.value.length || batchBusy.value) return
		batchBusy.value = true
		const ids = selectedIds.value.slice()
		const isImage = batchAssetKind.value === 'image'
		try {
			const form = new FormData()
			form.append('file', file)
			form.append('project_id', String(props.projectId))
			form.append('file_type', batchAssetKind.value)
			const up = await uploadSceneFile(form)
			const url = up?.data?.url
			if (!url) throw new Error('上传未返回文件地址')
			await Promise.all(ids.map(id => updateScene(
				id,
				isImage ? { background_url: url } : { music_url: url }
			)))
			batchAssetDialog.value = false
			selectedIds.value = []
			await fetchScenes()
			emit('data-changed')
			ElMessage.success(`已更新 ${ids.length} 个场景的${isImage ? '背景' : '音乐'}`)
		} catch (e: any) {
			ElMessage.error('批量更新失败：' + (e?.response?.data?.error || e?.message || '未知错误'))
		} finally {
			batchBusy.value = false
		}
	}

	const clearBatchMusic = async () => {
		if (!selectedIds.value.length || batchBusy.value) return
		batchBusy.value = true
		const ids = selectedIds.value.slice()
		try {
			await Promise.all(ids.map(id => updateScene(id, { music_url: '' })))
			batchAssetDialog.value = false
			selectedIds.value = []
			await fetchScenes()
			emit('data-changed')
			ElMessage.success(`已清空 ${ids.length} 个场景的音乐`)
		} catch (e: any) {
			ElMessage.error('清空音乐失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			batchBusy.value = false
		}
	}

	const openBatchMove = async () => {
		if (!selectedIds.value.length) return
		await fetchChapters()
		batchMoveChapter.value = ''
		batchMoveDialog.value = true
	}

	const applyBatchMove = async () => {
		if (!selectedIds.value.length || batchBusy.value) return
		batchBusy.value = true
		const ids = selectedIds.value.slice()
		const cid = batchMoveChapter.value ? Number(batchMoveChapter.value) : null
		try {
			await Promise.all(ids.map(id => assignSceneChapter(Number(props.projectId), id, cid)))
			batchMoveDialog.value = false
			selectedIds.value = []
			await fetchChapters()
			emit('data-changed')
			ElMessage.success(`已移动 ${ids.length} 个场景`)
		} catch (e: any) {
			ElMessage.error('移动失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			batchBusy.value = false
		}
	}

	const batchDuplicate = async () => {
		if (!selectedIds.value.length || batchBusy.value) return
		batchBusy.value = true
		const ids = selectedIds.value.slice()
		try {
			for (const id of ids) await duplicateScene(id)
			selectedIds.value = []
			await fetchScenes()
			emit('data-changed')
			ElMessage.success(`已复制 ${ids.length} 个场景`)
		} catch (e: any) {
			ElMessage.error('批量复制失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			batchBusy.value = false
		}
	}

	const batchDelete = async () => {
		if (!selectedIds.value.length || batchBusy.value) return
		const ids = selectedIds.value.slice()
		try {
			await ElMessageBox.confirm(
				`删除选中的 ${ids.length} 个场景？场景里的对话和分支会一起删除，无法撤销。`,
				'批量删除场景',
				{ type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
			)
		} catch {
			return
		}
		batchBusy.value = true
		const wasActive = ids.some(id => isActive(id))
		try {
			for (const id of ids) await deleteScene(id)
			selectedIds.value = []
			await fetchScenes()
			ids.forEach(id => emit('deleted', String(id)))

			// 剩余场景重新连续编号
			const rest = sortedScenes.value.slice()
			const changed = rest.filter((x, i) => x.order_num !== i + 1)
			rest.forEach((x, i) => { x.order_num = i + 1 })
			if (changed.length) {
				savingOrder.value = true
				Promise.all(changed.map(x => updateScene(x.scene_id, { order_num: x.order_num })))
					.catch(e => console.error('重排场景序号失败:', e))
					.finally(() => { savingOrder.value = false })
			}
			if (wasActive) emit('select', rest.length ? String(rest[0].scene_id) : '')
			emit('data-changed')
			ElMessage.success(`已删除 ${ids.length} 个场景`)
		} catch (e: any) {
			ElMessage.error('批量删除失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
			await fetchScenes()
		} finally {
			batchBusy.value = false
		}
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
	const savingOrder = ref(false)

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
		if (fromId === null || fromId === target.scene_id) return

		const list = sortedScenes.value.slice()
		const fromIdx = list.findIndex(x => x.scene_id === fromId)
		if (fromIdx < 0) return
		const [moved] = list.splice(fromIdx, 1)

		let insertAt = list.findIndex(x => x.scene_id === target.scene_id)
		if (insertAt < 0) insertAt = list.length
		if (after) insertAt += 1
		list.splice(insertAt, 0, moved)
		// 先把新顺序落到本地，界面立即生效；再逐条持久化
		list.forEach((s, i) => { s.order_num = i + 1 })
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

	const sortedScenes = computed(() =>
		[...scenes.value].sort((a, b) => a.order_num - b.order_num)
	)

	const isActive = (id: number) => String(id) === String(props.activeSceneId ?? '')

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
		const rest = sortedScenes.value.slice()
		const changed = rest.filter((x, i) => x.order_num !== i + 1)
		rest.forEach((x, i) => { x.order_num = i + 1 })
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

	.slp-head-right {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.slp-saving {
		font-size: 10px;
		color: #c98aa0;
	}

	.slp-head-count {
		font-size: 11px;
		color: #b37d8f;
		background: #fdeef3;
		padding: 1px 7px;
		border-radius: 9px;
	}

	.slp-chapter-btn {
		height: 22px;
		padding: 0 8px;
		border-radius: 7px;
		border: 1px solid #f0d0dc;
		background: #fff;
		color: #c81f4a;
		font-size: 11px;
		cursor: pointer;
	}

	.slp-chapter-btn:hover {
		background: #fff5f8;
	}

	/* 批量操作 */
	.slp-batch-bar {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 7px 12px;
		border-bottom: 1px solid #f7e3ea;
		background: #fff5f8;
	}

	.slp-batch-count {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		color: #8a6a76;
	}

	.slp-batch-count strong {
		color: #c81f4a;
	}

	.slp-batch-all {
		margin-left: auto;
		border: none;
		background: transparent;
		color: #a84463;
		font-size: 11px;
		cursor: pointer;
		text-decoration: underline;
	}

	.slp-batch-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.slp-batch-actions button {
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
		border-radius: 6px;
		padding: 3px 7px;
		font-size: 11px;
		cursor: pointer;
	}

	.slp-batch-actions button:hover:not(:disabled) {
		border-color: #ffafc3;
		color: #c81f4a;
	}

	.slp-batch-actions button.is-danger {
		color: #c0392b;
		border-color: #f3c9d3;
		background: #fff5f7;
	}

	.slp-batch-actions button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.slp-check {
		flex-shrink: 0;
		width: 16px;
		height: 16px;
		border-radius: 5px;
		border: 1px solid #e6b9c8;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		color: #fff;
		background: #fff;
	}

	.slp-check.on {
		background: #e8467c;
		border-color: #e8467c;
	}

	.slp-item.is-batch {
		padding-left: 8px;
	}

	.slp-item.is-checked {
		background: #fde3eb;
	}

	.slp-batch-tip {
		font-size: 12px;
		color: #64748b;
		margin-bottom: 10px;
	}

	.slp-batch-file {
		width: 100%;
		font-size: 12px;
	}

	.slp-batch-extra {
		margin-top: 10px;
	}

	.slp-batch-extra button {
		border: 1px solid #f3c9d3;
		background: #fff5f7;
		color: #c0392b;
		border-radius: 7px;
		padding: 5px 10px;
		font-size: 12px;
		cursor: pointer;
	}

	.slp-batch-select {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #f0d6df;
		border-radius: 7px;
		padding: 7px 9px;
		font-size: 12px;
		color: #475569;
		background: #fff;
		outline: none;
	}

	/* 章节分组标题 */
	.slp-chapter-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 6px 4px;
		border-bottom: 1px dashed #f3d6df;
		margin-bottom: 4px;
		cursor: pointer;
	}

	.slp-chapter-caret {
		display: inline-block;
		width: 10px;
		color: #c98aa0;
		font-size: 10px;
	}

	.slp-chapter-title {
		font-size: 11px;
		font-weight: 600;
		color: #a3546e;
		letter-spacing: 0.3px;
	}

	.slp-chapter-count {
		font-size: 10px;
		color: #b78b9a;
	}

	/* 章节管理弹窗 */
	.slp-chapter-new {
		display: flex;
		gap: 6px;
		margin-bottom: 10px;
	}

	.slp-chapter-new input {
		flex: 1;
		min-width: 0;
		border: 1px solid #f0d6df;
		border-radius: 7px;
		padding: 6px 8px;
		font-size: 12px;
		outline: none;
	}

	.slp-chapter-new button {
		border: 1px solid #f0c8d6;
		background: #fff2f6;
		color: #c81f4a;
		border-radius: 7px;
		padding: 0 12px;
		font-size: 12px;
		cursor: pointer;
	}

	.slp-chapter-empty {
		font-size: 12px;
		color: #94a3b8;
		padding: 6px 2px 10px;
	}

	.slp-chapter-list {
		max-height: 160px;
		overflow-y: auto;
		margin-bottom: 8px;
	}

	.slp-chapter-row {
		display: flex;
		gap: 6px;
		align-items: center;
		margin-bottom: 5px;
	}

	.slp-chapter-row input {
		flex: 1;
		min-width: 0;
		border: 1px solid #f0d6df;
		border-radius: 6px;
		padding: 5px 7px;
		font-size: 12px;
		outline: none;
	}

	.slp-chapter-row input.slp-chapter-target {
		flex: 0 0 84px;
		width: 84px;
	}

	.slp-chapter-del {
		border: 1px solid #f3c9d3;
		background: #fff5f7;
		color: #c0392b;
		border-radius: 6px;
		padding: 4px 8px;
		font-size: 11px;
		cursor: pointer;
	}

	.slp-assign-title {
		font-size: 12px;
		font-weight: 600;
		color: #64748b;
		margin: 8px 0 6px;
	}

	.slp-assign-list {
		max-height: 240px;
		overflow-y: auto;
	}

	.slp-assign-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 0;
		border-bottom: 1px solid #faf0f4;
	}

	.slp-assign-name {
		flex: 1;
		font-size: 12px;
		color: #475569;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.slp-assign-select {
		width: 150px;
		border: 1px solid #f0d6df;
		border-radius: 6px;
		padding: 4px 6px;
		font-size: 12px;
		color: #475569;
		background: #fff;
		outline: none;
	}

	/* 全项目搜索 */
	.slp-search {
		padding: 8px 12px 6px;
		flex-shrink: 0;
	}

	.slp-search-input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #f0d6df;
		border-radius: 8px;
		background: #fff;
		padding: 7px 10px;
		font-size: 12px;
		color: #333;
		outline: none;
		transition: border-color 0.2s, box-shadow 0.2s;
	}

	.slp-search-input:focus {
		border-color: #ff9db5;
		box-shadow: 0 0 0 2px rgba(255, 123, 156, 0.12);
	}

	.slp-replace-row {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-top: 6px;
	}

	.slp-replace-input {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		border: 1px solid #f0d6df;
		border-radius: 7px;
		background: #fff;
		padding: 5px 8px;
		font-size: 11px;
		color: #333;
		outline: none;
	}

	.slp-replace-input:focus {
		border-color: #ff9db5;
	}

	.slp-replace-btn {
		flex-shrink: 0;
		border: 1px solid #e8467c;
		background: #e8467c;
		color: #fff;
		border-radius: 7px;
		padding: 5px 9px;
		font-size: 11px;
		cursor: pointer;
	}

	.slp-replace-btn:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.slp-search-results {
		flex: 1;
		overflow-y: auto;
		padding: 2px 10px 10px;
	}

	.slp-result {
		padding: 8px 10px;
		margin-bottom: 6px;
		border-radius: 8px;
		background: #fff;
		border: 1px solid #f5e2e9;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}

	.slp-result:hover {
		border-color: #ffafc3;
		background: #fff7fa;
	}

	.slp-result-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		margin-bottom: 4px;
	}

	.slp-result-scene {
		font-size: 11px;
		color: #c81f4a;
	}

	.slp-result-type {
		font-size: 10px;
		color: #b07a8c;
		background: #fdeef3;
		padding: 1px 6px;
		border-radius: 7px;
		flex-shrink: 0;
	}

	.slp-result-text {
		font-size: 12px;
		line-height: 1.6;
		color: #475569;
		word-break: break-word;
	}

	.slp-result-text mark {
		background: #ffe1ea;
		color: #b4164a;
		padding: 0 1px;
		border-radius: 3px;
	}

	.slp-result-char {
		margin-top: 3px;
		font-size: 11px;
		color: #94a3b8;
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
		gap: 7px;
		padding: 7px 8px 7px 2px;
		margin-bottom: 4px;
		border-radius: 9px;
		cursor: pointer;
		border-left: 3px solid transparent;
		transition: background 0.15s, border-color 0.15s, opacity 0.15s;
		user-select: none;
	}

	.slp-item:hover {
		background: #fdf1f5;
	}

	.slp-item.is-active {
		background: #fde3eb;
		border-left-color: #e8467c;
	}

	.slp-item.is-dragging {
		opacity: 0.35;
	}

	.slp-item.is-drag-over {
		background: #fdeef3;
		box-shadow: inset 0 2px 0 #e8467c;
	}

	.slp-item.is-drag-over.is-drag-over-after {
		box-shadow: inset 0 -2px 0 #e8467c;
	}

	.slp-grip {
		flex-shrink: 0;
		width: 12px;
		font-size: 11px;
		line-height: 1;
		color: #d9b6c2;
		cursor: grab;
		text-align: center;
	}

	.slp-grip:active {
		cursor: grabbing;
	}

	.slp-item:hover .slp-grip {
		color: #c81f4a;
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

	.slp-dup,
	.slp-del {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		padding: 0;
		border: none;
		border-radius: 5px;
		background: transparent;
		color: #c9a2ae;
		font-size: 12px;
		line-height: 1;
		cursor: pointer;
		opacity: 0;
		transition: all 0.15s;
	}

	.slp-item:hover .slp-dup,
	.slp-item:hover .slp-del {
		opacity: 1;
	}

	.slp-dup:hover {
		background: #fdeef3;
		color: #c81f4a;
	}

	.slp-del {
		font-size: 14px;
	}

	.slp-del:hover {
		background: #fbe3e6;
		color: #d9534f;
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
