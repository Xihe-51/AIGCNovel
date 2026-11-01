<template>
	<div class="al-root">
		<div class="al-head">
			<span class="al-title">项目素材</span>
			<span class="al-stats">
				<span class="al-ok">{{ okCount }} 正常</span>
				<span v-if="missingCount" class="al-missing">{{ missingCount }} 缺失</span>
			</span>
			<button type="button" class="al-refresh" :disabled="loading" @click="load">刷新</button>
		</div>

		<el-input
			v-model="keyword"
			size="small"
			clearable
			placeholder="搜索素材名称或路径"
			class="al-search"
		/>

		<div class="al-cats">
			<button
				v-for="c in cats"
				:key="c.key"
				type="button"
				:class="['al-cat', { 'is-active': cat === c.key }]"
				@click="cat = c.key"
			>
				{{ c.label }}
				<span v-if="c.count" class="al-cat-count">{{ c.count }}</span>
			</button>
		</div>

		<div v-if="loading" class="al-state">加载中…</div>
		<div v-else-if="!filtered.length" class="al-state">没有匹配的素材</div>
		<div v-else class="al-list">
			<div
				v-for="(it, i) in filtered"
				:key="i"
				class="al-item"
				draggable="true"
				@dragstart="onDragStart(it, $event)"
			>
				<div
					:class="['al-thumb', { 'is-clickable': isImage(it) && !isBroken(it.url) }]"
					@click="openPreview(it)"
				>
					<img
						v-if="isImage(it) && !isBroken(it.url)"
						:src="fullUrl(it.url)"
						alt=""
						loading="lazy"
						@error="markBroken(it.url)"
					/>
					<span v-else class="al-thumb-text">{{ isImage(it) ? '缺图' : kindIcon(it.kind) }}</span>
				</div>

				<div class="al-meta">
					<div class="al-where" :title="it.where">{{ it.where || it.kind_label || it.kind }}</div>
					<div class="al-url" :title="it.url">{{ it.url }}</div>
					<div class="al-tags">
							<span :class="['al-status', it.status]">{{ statusText(it.status) }}</span>
							<span class="al-kind">{{ it.kind_label || labelOf(it.kind) }}</span>
							<span v-if="it.usage_count && it.usage_count > 1" class="al-usage">
								引用 {{ it.usage_count }} 处
							</span>
						</div>
				</div>

				<div class="al-acts">
						<button
							v-if="!isImage(it)"
							type="button"
							class="al-act"
							@click="toggleAudio(it)"
						>{{ playingUrl === it.url ? '停止' : '试听' }}</button>
						<button
							v-if="canReplace(it)"
							type="button"
							class="al-act"
							:disabled="replacing"
							@click="pickReplace(it)"
						>{{ it.status === 'missing' ? '补传' : '替换' }}</button>
						<button
							v-if="canReplace(it)"
							type="button"
							class="al-act"
							@click="openAiDialog(it)"
						>AI</button>
						<button type="button" class="al-act" @click="copyUrl(it.url)">复制</button>
						<button v-if="it.scene_id" type="button" class="al-act is-primary" @click="locate(it)">定位</button>
					</div>
				</div>
			</div>

			<input ref="replaceInput" type="file" class="al-file" @change="onReplaceFile" />

			<el-dialog v-model="aiDialogVisible" title="从 AI 历史导入" width="540px" append-to-body>
				<div class="ai-dialog-hint">
					选择一份 AI 生成素材覆盖当前文件：{{ aiTarget?.where || '' }}
				</div>
				<div v-if="aiLoading" class="al-state">加载中…</div>
				<div v-else-if="!aiItems.length" class="al-state">没有可用的 AI 历史素材</div>
				<div v-else class="ai-grid">
					<button
						v-for="it in aiItems"
						:key="it.generation_id"
						type="button"
						class="ai-card"
						:disabled="it.status !== 'ok'"
						@click="useAiItem(it)"
					>
						<img
							v-if="aiKind === 'image' && it.status === 'ok'"
							:src="BASE_URL + it.url"
							alt=""
							loading="lazy"
						/>
						<span v-else class="ai-card-icon">{{ aiKind === 'image' ? '缺图' : '♪' }}</span>
						<span class="ai-card-prompt">{{ it.prompt || it.url }}</span>
						<span class="ai-card-status">{{ it.status === 'ok' ? '使用' : '文件已丢失' }}</span>
					</button>
				</div>
			</el-dialog>

			<el-dialog
				v-model="previewVisible"
				:title="previewTitle"
				width="720px"
				append-to-body
				class="al-preview-dialog"
			>
				<img v-if="previewUrl" :src="fullUrl(previewUrl)" class="al-preview-img" alt="" />
			</el-dialog>
		</div>
</template>

<script setup lang="ts">
	import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
	import { ElMessage } from 'element-plus'
	import { checkProjectAssets, replaceProjectAsset, listAiAssetHistory, importAiAsset } from '@/api/asset'
	import type { AssetItem, AiAssetItem } from '@/api/asset'
	import { BASE_URL } from '@/utils/request'

	const props = defineProps<{
		projectId: string | number
	}>()

	const emit = defineEmits<{
		(e: 'locate', sceneId: number): void
	}>()

	const loading = ref(false)
	const items = ref<AssetItem[]>([])
	const keyword = ref('')
	const cat = ref('all')
	const brokenUrls = ref<string[]>([])

	const KIND_LABELS: Record<string, string> = {
		background: '背景',
		avatar: '立绘',
		music: '音乐',
		voice: '配音',
		cg: 'CG',
		cover: '封面',
		directive: '演出素材',
		market: '市场素材'
	}

	const labelOf = (kind: string) => KIND_LABELS[kind] || kind
	const statusText = (s: string) => s === 'missing' ? '缺失' : (s === 'external' ? '外链' : '正常')
	const kindIcon = (kind: string) => kind === 'music' || kind === 'voice' ? '♪' : (kind === 'market' ? '市' : '✦')
	const isBroken = (url: string) => brokenUrls.value.includes(url)
	const markBroken = (url: string) => {
		if (!brokenUrls.value.includes(url)) brokenUrls.value.push(url)
	}

	const isImage = (it: AssetItem) => {
		if (['background', 'avatar', 'cg', 'cover'].includes(it.kind)) return true
		return /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(it.url || '')
	}

	const fullUrl = (url: string) => url && url.startsWith('http') ? url : BASE_URL + url

	// ---- 图片大图预览 ----
	const previewVisible = ref(false)
	const previewUrl = ref('')
	const previewTitle = ref('')
	const openPreview = (it: AssetItem) => {
		if (!isImage(it) || isBroken(it.url)) return
		previewUrl.value = it.url
		previewTitle.value = it.where || it.kind_label || '素材预览'
		previewVisible.value = true
	}

	// ---- 音频试听：同一时间只播一条 ----
	const playingUrl = ref('')
	let audioEl: HTMLAudioElement | null = null
	const stopAudio = () => {
		if (audioEl) {
			audioEl.pause()
			audioEl.onended = null
			audioEl.onerror = null
			audioEl = null
		}
		playingUrl.value = ''
	}
	const toggleAudio = (it: AssetItem) => {
		if (playingUrl.value === it.url) {
			stopAudio()
			return
		}
		stopAudio()
		const audio = new Audio(fullUrl(it.url))
		audioEl = audio
		playingUrl.value = it.url
		audio.onended = () => { if (playingUrl.value === it.url) stopAudio() }
		audio.onerror = () => {
			if (playingUrl.value !== it.url) return
			stopAudio()
			ElMessage.error('音频无法播放，文件可能已丢失')
		}
		audio.play().catch(() => {
			if (playingUrl.value !== it.url) return
			stopAudio()
			ElMessage.error('音频无法播放，文件可能已丢失')
		})
	}
	onUnmounted(stopAudio)

	// 就地补传/替换：只允许项目目录内的本地素材（封面走项目信息页）
	const replaceInput = ref<HTMLInputElement | null>(null)
	const pendingReplace = ref<AssetItem | null>(null)
	const replacing = ref(false)

	const canReplace = (it: AssetItem) =>
		it.status !== 'external' &&
		it.kind !== 'cover' &&
		/^\/static\/project\//.test(it.url || '')

	const pickReplace = (it: AssetItem) => {
		pendingReplace.value = it
		if (replaceInput.value) {
			replaceInput.value.value = ''
			replaceInput.value.click()
		}
	}

	const onReplaceFile = async (e: Event) => {
		const input = e.target as HTMLInputElement
		const file = input.files?.[0]
		const item = pendingReplace.value
		pendingReplace.value = null
		if (!file || !item) return
		replacing.value = true
		try {
			await replaceProjectAsset(Number(props.projectId), item.url, file)
			ElMessage.success(item.status === 'missing' ? '素材已补传' : '素材已替换')
			brokenUrls.value = brokenUrls.value.filter(u => u !== item.url)
			await load()
		} catch (err: any) {
			ElMessage.error('替换失败：' + (err?.response?.data?.message || err?.message || '未知错误'))
		} finally {
			replacing.value = false
		}
	}

	// ---- 从 AI 历史导入 ----
	const aiDialogVisible = ref(false)
	const aiLoading = ref(false)
	const aiItems = ref<AiAssetItem[]>([])
	const aiTarget = ref<AssetItem | null>(null)
	const aiKind = ref<'image' | 'music' | 'voice'>('image')

	const aiKindOf = (it: AssetItem): 'image' | 'music' | 'voice' => {
		if (isImage(it)) return 'image'
		if (it.kind === 'voice') return 'voice'
		return 'music'
	}

	const openAiDialog = async (it: AssetItem) => {
		aiTarget.value = it
		aiKind.value = aiKindOf(it)
		aiItems.value = []
		aiDialogVisible.value = true
		aiLoading.value = true
		try {
			aiItems.value = await listAiAssetHistory(Number(props.projectId), aiKind.value)
		} catch (e: any) {
			ElMessage.error('读取 AI 历史失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			aiLoading.value = false
		}
	}

	const useAiItem = async (it: AiAssetItem) => {
		const target = aiTarget.value
		if (!target || it.status !== 'ok') return
		try {
			await importAiAsset(Number(props.projectId), target.url, it.url)
			ElMessage.success('已从 AI 历史导入')
			aiDialogVisible.value = false
			brokenUrls.value = brokenUrls.value.filter(u => u !== target.url)
			await load()
		} catch (e: any) {
			ElMessage.error('导入失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		}
	}

	const allItems = computed(() => items.value.filter(it => !!it.url))
	const okCount = computed(() => allItems.value.filter(it => it.status === 'ok').length)
	const missingCount = computed(() => allItems.value.filter(it => it.status === 'missing').length)

	const cats = computed(() => {
		const order = ['all', 'background', 'avatar', 'music', 'voice', 'cg', 'cover', 'directive', 'market']
		return order.map(key => ({
			key,
			label: key === 'all' ? '全部' : labelOf(key),
			count: key === 'all'
				? allItems.value.length
				: allItems.value.filter(it => it.kind === key).length
		})).filter(c => c.key === 'all' || c.count > 0)
	})

	const filtered = computed(() => {
		const kw = keyword.value.trim().toLowerCase()
		return allItems.value.filter(it => {
			if (cat.value !== 'all' && it.kind !== cat.value) return false
			if (!kw) return true
			return String(it.where || '').toLowerCase().includes(kw)
				|| String(it.url || '').toLowerCase().includes(kw)
		})
	})

	const load = async () => {
		if (!props.projectId) return
		loading.value = true
		try {
			const res = await checkProjectAssets(Number(props.projectId))
			const list: AssetItem[] = [...(res.items || [])]
			for (const m of res.market_references || []) {
				list.push({
					kind: 'market',
					kind_label: '市场素材',
					where: m.title,
					url: m.file_url,
					status: m.status
				})
			}
			items.value = list
			brokenUrls.value = []
		} catch (e) {
			console.error('加载素材库失败:', e)
			items.value = []
		} finally {
			loading.value = false
		}
	}

	// 拖到场景设置里的背景/音乐槽位即可直接使用
	const onDragStart = (it: AssetItem, e: DragEvent) => {
		if (!e.dataTransfer) return
		const assetKind = it.asset_kind || (isImage(it) ? 'image' : 'audio')
		e.dataTransfer.setData('application/x-aigc-asset', JSON.stringify({
			url: it.url,
			kind: it.kind,
			asset_kind: assetKind,
			label: it.kind_label
		}))
		e.dataTransfer.setData('text/plain', it.url)
		e.dataTransfer.effectAllowed = 'copy'
	}

	const copyUrl = async (url: string) => {
		const full = url.startsWith('http') ? url : BASE_URL + url
		try {
			await navigator.clipboard.writeText(full)
			ElMessage.success('地址已复制')
		} catch (e) {
			ElMessage.warning('复制失败，请手动选择地址')
		}
	}

	const locate = (it: AssetItem) => {
		if (it.scene_id) emit('locate', Number(it.scene_id))
	}

	onMounted(load)
	watch(() => props.projectId, load)
</script>

<style scoped>
	.al-file { display: none; }

	.al-root {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.al-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 2px 8px;
	}

	.al-title {
		font-size: 12px;
		font-weight: 600;
		color: #c81f4a;
	}

	.al-stats {
		flex: 1;
		display: flex;
		gap: 6px;
		font-size: 10px;
	}

	.al-ok { color: #1f9d76; }
	.al-missing { color: #d9534f; }

	.al-refresh {
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
		font-size: 11px;
		padding: 2px 7px;
		border-radius: 6px;
		cursor: pointer;
	}

	.al-refresh:hover { background: #fdeef3; }

	.al-search {
		margin-bottom: 8px;
	}

	.al-cats {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 8px;
	}

	.al-cat {
		border: 1px solid #f2dce5;
		background: #fff;
		color: #a6828f;
		font-size: 11px;
		padding: 3px 7px;
		border-radius: 6px;
		cursor: pointer;
	}

	.al-cat.is-active {
		background: #fdeef3;
		border-color: #e8467c;
		color: #c81f4a;
	}

	.al-cat-count {
		margin-left: 3px;
		color: #c98aa0;
		font-size: 9px;
	}

	.al-state {
		padding: 20px 8px;
		text-align: center;
		font-size: 12px;
		color: #b99aa5;
	}

	.al-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.al-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px;
		border: 1px solid #f5e4ea;
		border-radius: 9px;
		background: #fff;
	}

	.al-thumb {
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		border-radius: 6px;
		background: #f7edf1;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.al-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.al-thumb-text {
		font-size: 10px;
		color: #c98aa0;
	}

	.al-thumb.is-clickable {
		cursor: zoom-in;
	}

	.al-preview-img {
		display: block;
		width: 100%;
		max-height: 70vh;
		object-fit: contain;
		background: #faf5f7;
		border-radius: 8px;
	}

	.al-meta {
		flex: 1;
		min-width: 0;
	}

	.al-where {
		font-size: 12px;
		color: #3d2b32;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.al-url {
		font-size: 10px;
		color: #b99aa5;
		font-family: Consolas, Monaco, monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 1px;
	}

	.al-tags {
		display: flex;
		gap: 5px;
		margin-top: 3px;
	}

	.al-status {
		font-size: 9px;
		padding: 0 5px;
		border-radius: 5px;
		background: #eafaf3;
		color: #1f9d76;
		border: 1px solid #c6f0e0;
	}

	.al-status.missing {
		background: #fdeaea;
		color: #d9534f;
		border-color: #f5c6c6;
	}

	.al-status.external {
		background: #f7edf1;
		color: #a6828f;
		border-color: #ead6de;
	}

	.al-kind {
		font-size: 9px;
		color: #b99aa5;
	}

	.al-usage {
		font-size: 9px;
		color: #1f9d76;
		background: #eefaf4;
		border: 1px solid #cdeeda;
		border-radius: 5px;
		padding: 0 4px;
	}

	.al-acts {
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex-shrink: 0;
	}

	.al-act {
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 5px;
		cursor: pointer;
	}

	.al-act:hover { background: #fdeef3; }

	.al-act.is-primary {
		border-color: #e8467c;
		color: #c81f4a;
	}

	/* AI 历史导入弹窗 */
	.ai-dialog-hint {
		font-size: 12px;
		color: #8a6a76;
		margin-bottom: 10px;
	}

	.ai-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		max-height: 50vh;
		overflow-y: auto;
	}

	.ai-card {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 4px;
		border: 1px solid #f2dde5;
		border-radius: 8px;
		background: #fff;
		padding: 6px;
		cursor: pointer;
		text-align: left;
	}

	.ai-card:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.ai-card img {
		width: 100%;
		height: 90px;
		object-fit: cover;
		border-radius: 5px;
		background: #fdf1f5;
	}

	.ai-card-icon {
		height: 90px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fdf1f5;
		color: #b07a8c;
		border-radius: 5px;
		font-size: 12px;
	}

	.ai-card-prompt {
		font-size: 10px;
		color: #64748b;
		line-height: 1.35;
		max-height: 28px;
		overflow: hidden;
	}

	.ai-card-status {
		font-size: 10px;
		color: #c81f4a;
	}
</style>
