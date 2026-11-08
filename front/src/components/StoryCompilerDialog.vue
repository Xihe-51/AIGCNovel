<template>
	<el-dialog
		v-model="visible"
		title="导入小说 / 文本剧本"
		width="780px"
		append-to-body
		class="compiler-dialog"
		@closed="resetAll"
	>
		<div class="cp-intro">
			支持 TXT / Markdown。编译器会识别章节、场景、对白与旁白，把内容追加到当前项目，并保留源文件行号与诊断信息。
		</div>

		<div class="cp-toolbar">
			<button type="button" class="cp-file-btn" :disabled="applying" @click="pickFile">选择文件</button>
			<input ref="fileInput" type="file" accept=".txt,.md,.markdown,.text" class="cp-file-input" @change="onFileChange" />
			<button type="button" class="cp-file-btn is-ghost" :disabled="applying" @click="toggleHistory">
				历史导入{{ historyList.length ? '（' + historyList.length + '）' : '' }}
			</button>
			<span class="cp-filename">{{ filename || '未选择文件，可直接粘贴文本' }}</span>
			<span class="cp-count">{{ text.length }} 字</span>
		</div>

		<el-input
			v-model="text"
			type="textarea"
			:rows="10"
			:disabled="applying"
			resize="vertical"
			placeholder="粘贴小说或剧本正文，例如：&#10;# 第一章 雨夜&#10;雨下得很大。&#10;【李暮尘】王医生，我真的没病。&#10;王医生：你在精神病院里说自己没病，你看我信吗？"
			@input="onTextChanged"
		/>

		<div class="cp-options">
			<el-checkbox v-model="createChapters">按标题创建章节分组</el-checkbox>
			<el-checkbox v-model="createCharacters">自动创建缺失角色占位</el-checkbox>
			<span class="cp-option-note">不会自动创建分支或变量，只给建议</span>
		</div>

		<div class="cp-actions">
			<el-button :loading="previewing" :disabled="!text.trim() || applying" @click="runPreview">解析预览</el-button>
			<el-button type="primary" :loading="applying" :disabled="!text.trim() || previewing || !preview" @click="runApply">
				写入项目
			</el-button>
			<span v-if="applied" class="cp-applied">已写入 {{ applied.created.scenes }} 个场景 / {{ applied.created.nodes }} 条内容</span>
		</div>

		<div v-if="historyOpen" class="cp-history">
			<div class="cp-history-head">
				最近导入记录
				<span v-if="historyLoading" class="cp-history-loading">加载中…</span>
			</div>
			<div v-if="!historyLoading && !historyList.length" class="cp-note">暂无导入记录。</div>
			<div
				v-for="item in historyList"
				:key="item.source_id"
				:class="['cp-history-item', { 'is-active': historyDetail?.source_id === item.source_id }]"
				@click="loadHistory(item)"
			>
				<span class="cp-history-name">{{ item.filename || '未命名文件' }}</span>
				<span class="cp-history-meta">{{ formatTime(item.created_at) }} · {{ item.diagnostic_count }} 条诊断</span>
			</div>

			<div v-if="historyDetail" class="cp-history-detail">
				<div class="cp-history-detail-head">
					<span class="cp-history-detail-title">{{ historyDetail.filename || '未命名文件' }}</span>
					<span class="cp-history-meta">
						{{ formatTime(historyDetail.created_at) }}
						<template v-if="historyDetail.compile.stats"> · {{ historyDetail.compile.stats.node_count }} 条内容 / {{ historyDetail.compile.stats.scene_count }} 个场景</template>
					</span>
				</div>
				<div class="cp-history-actions">
					<button type="button" class="cp-file-btn" @click="useHistorySource">载入原文</button>
					<button type="button" class="cp-file-btn" :disabled="!historyNodes.length" @click="locateHistoryFirst">定位首条内容</button>
				</div>

				<section v-if="historyDiagnostics.length" class="cp-section">
					<h4 class="cp-section-title">当时的编译诊断（{{ historyDiagnostics.length }}）</h4>
					<div
						v-for="(d, i) in historyDiagnostics"
						:key="i"
						:class="['cp-diagnostic', 'is-' + d.level]"
					>
						<span class="cp-diag-tag">{{ levelLabel(d.level) }}</span>
						<span v-if="d.line" class="cp-diag-line">L{{ d.line }}</span>
						<span class="cp-diag-text">{{ d.message }}</span>
					</div>
				</section>

				<section v-if="historyNodes.length" class="cp-section">
					<h4 class="cp-section-title">导入节点（点击定位）</h4>
					<div
						v-for="node in historyNodes.slice(0, 40)"
						:key="node.content_id"
						class="cp-history-node"
						@click="emitLocate(node.scene_id, node.content_id)"
					>
						<span class="cp-diag-line">L{{ node.line }}</span>
						<span class="cp-node-kind">{{ node.content_type }}</span>
						<span class="cp-node-text">{{ node.speaker ? node.speaker + '：' : '' }}{{ node.text }}</span>
					</div>
					<div v-if="historyNodes.length > 40" class="cp-note">仅展示前 40 条，共 {{ historyNodes.length }} 条。</div>
				</section>
			</div>
		</div>

		<div v-if="preview || applied" class="cp-result">
			<div class="cp-stats">
				<div v-for="card in statCards" :key="card.label" class="cp-stat">
					<span class="cp-stat-num">{{ card.value }}</span>
					<span class="cp-stat-label">{{ card.label }}</span>
				</div>
			</div>

			<div v-if="regressionSummary" class="cp-regression">
				编译后回归：节点覆盖 {{ regressionSummary.node_pct }}%，结局 {{ regressionSummary.ending_reached }}/{{ regressionSummary.ending_total }}，死路 {{ regressionSummary.dead_end_count }}
			</div>

			<section v-if="diagnostics.length" class="cp-section">
				<h4 class="cp-section-title">编译诊断（{{ diagnostics.length }}）</h4>
				<div
					v-for="(d, i) in diagnostics"
					:key="i"
					:class="['cp-diagnostic', 'is-' + d.level]"
				>
					<span class="cp-diag-tag">{{ levelLabel(d.level) }}</span>
					<span v-if="d.line" class="cp-diag-line">L{{ d.line }}</span>
					<span class="cp-diag-text">{{ d.message }}</span>
				</div>
			</section>

			<section v-if="branchSuggestions.length || variableSuggestions.length" class="cp-section">
				<h4 class="cp-section-title">互动化建议（默认不写入）</h4>
				<div v-for="(b, i) in branchSuggestions" :key="'b' + i" class="cp-suggestion">
					<span class="cp-sug-tag">分支</span>
					<span class="cp-diag-line">L{{ b.line }}</span>
					<span>{{ b.scene_title }}：{{ b.preview }}</span>
				</div>
				<div v-for="(v, i) in variableSuggestions" :key="'v' + i" class="cp-suggestion">
					<span class="cp-sug-tag is-var">变量</span>
					<span class="cp-diag-line">L{{ v.line }}</span>
					<span>建议「{{ v.name }}」：{{ v.reason }}</span>
				</div>
			</section>

			<section class="cp-section">
				<h4 class="cp-section-title">
					结构预览
					<template v-if="applied">（已写入，可定位首条内容）</template>
				</h4>
				<div v-for="(chapter, ci) in chapters" :key="ci" class="cp-chapter">
					<div class="cp-chapter-head">
						<span class="cp-chapter-title">{{ chapter.title }}</span>
						<span class="cp-chapter-meta">{{ chapter.scene_count }} 场景 / {{ chapter.node_count }} 条</span>
					</div>
					<div v-for="(scene, si) in chapter.scenes" :key="si" class="cp-scene">
						<div class="cp-scene-head">
							<span class="cp-scene-title">{{ scene.title }}</span>
							<span class="cp-scene-meta">
								<template v-if="scene.line">L{{ scene.line }} · </template>{{ scene.node_count }} 条
							</span>
						</div>
						<div v-for="(node, ni) in scene.preview" :key="ni" class="cp-node">
							<span class="cp-node-kind">{{ node.kind === 'dialogue' ? '对白' : '旁白' }}</span>
							<span v-if="node.speaker" class="cp-node-speaker">{{ node.speaker }}</span>
							<span class="cp-node-text">{{ node.text }}</span>
						</div>
						<div v-if="scene.node_count > scene.preview.length" class="cp-node-more">
							还有 {{ scene.node_count - scene.preview.length }} 条未展示…
						</div>
					</div>
				</div>
				<div v-if="structureTruncated" class="cp-note">结构预览已截断（最多展示 40 章 / 每章 20 个场景）；写入时会处理全部内容。</div>
			</section>
		</div>

		<template #footer>
			<el-button @click="visible = false">关闭</el-button>
			<el-button v-if="applied && applied.first" type="primary" plain @click="locateFirst">定位首条导入内容</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
	import { computed, ref, watch } from 'vue'
	import { ElMessage, ElMessageBox } from 'element-plus'
	import {
		applyStoryCompile,
		getCompileSource,
		listCompileSources,
		previewStoryCompile,
		type CompileApplied,
		type CompilePreview,
		type CompileSourceDetail,
		type CompileSourceSummary,
	} from '@/api/storyCompiler'
	import { getStoryRegression, type RegressionSummary } from '@/api/patrol'

	const props = defineProps<{
		modelValue: boolean
		projectId: string | number
	}>()

	const emit = defineEmits<{
		(e: 'update:modelValue', value: boolean): void
		(e: 'applied', payload: { sceneId: number; contentId: number | null }): void
		(e: 'locate', payload: { sceneId: number; contentId: number | null }): void
	}>()

	const visible = computed({
		get: () => props.modelValue,
		set: (value: boolean) => emit('update:modelValue', value),
	})

	const fileInput = ref<HTMLInputElement | null>(null)
	const filename = ref('')
	const text = ref('')
	const createChapters = ref(true)
	const createCharacters = ref(true)

	const previewing = ref(false)
	const applying = ref(false)
	let previewSeq = 0
	const preview = ref<CompilePreview | null>(null)
	const applied = ref<CompileApplied | null>(null)
	const regressionSummary = ref<RegressionSummary | null>(null)

	// 历史导入：重新打开过去的编译诊断与 source map
	const historyOpen = ref(false)
	const historyLoading = ref(false)
	const historyList = ref<CompileSourceSummary[]>([])
	const historyDetail = ref<CompileSourceDetail | null>(null)
	let historySeq = 0

	const current = computed(() => applied.value || preview.value)
	const diagnostics = computed(() => current.value?.diagnostics || [])
	const branchSuggestions = computed(() => current.value?.branch_suggestions || [])
	const variableSuggestions = computed(() => current.value?.variable_suggestions || [])
	const chapters = computed(() => preview.value?.structure.chapters ?? [])
	const structureTruncated = computed(() => preview.value?.structure.truncated ?? false)

	const statCards = computed(() => {
		const stats = current.value?.stats
		if (!stats) return []
		return [
			{ label: '章节', value: stats.chapter_count },
			{ label: '场景', value: stats.scene_count },
			{ label: '内容', value: stats.node_count },
			{ label: '对白 / 旁白', value: `${stats.dialogue_count} / ${stats.narration_count}` },
			{ label: '未绑定角色', value: stats.character_unknown },
			{ label: '原文保真', value: `${stats.source_preserved_pct}%` },
		]
	})

	const levelLabel = (level: string) => {
		if (level === 'error') return '错误'
		if (level === 'warning') return '警告'
		return '建议'
	}

	const pickFile = () => fileInput.value?.click()

	const onFileChange = async (event: Event) => {
		const input = event.target as HTMLInputElement
		const file = input.files?.[0]
		if (!file) return
		if (file.size > 5 * 1024 * 1024) {
			ElMessage.warning('文件超过 5MB，请拆分后再导入')
			return
		}
		try {
			text.value = await file.text()
			filename.value = file.name
			preview.value = null
			applied.value = null
			regressionSummary.value = null
		} catch (e) {
			ElMessage.error('读取文件失败')
		}
		input.value = ''
	}

	const onTextChanged = () => {
		previewSeq += 1
		previewing.value = false
		preview.value = null
		applied.value = null
		regressionSummary.value = null
	}

	const buildPayload = () => ({
		text: text.value,
		filename: filename.value || undefined,
		format: /\.(md|markdown)$/i.test(filename.value) ? 'markdown' : 'txt',
		create_characters: createCharacters.value,
		create_chapters: createChapters.value,
	})

	const runPreview = async () => {
		if (!text.value.trim() || previewing.value) return
		previewing.value = true
		applied.value = null
		const seq = ++previewSeq
		const snapshot = text.value
		try {
			const result = await previewStoryCompile(Number(props.projectId), buildPayload())
			// 文本在请求期间被修改时丢弃旧结果，避免预览与输入不一致
			if (seq !== previewSeq || snapshot !== text.value) return
			preview.value = result
		} catch (e: any) {
			if (seq !== previewSeq) return
			preview.value = null
			ElMessage.error('解析失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			if (seq === previewSeq) previewing.value = false
		}
	}

	const runApply = async () => {
		if (!text.value.trim() || applying.value) return
		const stats = preview.value?.stats
		if (!stats) {
			ElMessage.warning('请先解析预览，确认结构后再写入')
			return
		}
		applying.value = true
		try {
			await ElMessageBox.confirm(
				`将向项目追加 ${stats.scene_count} 个场景、${stats.node_count} 条内容` +
				(createCharacters.value && stats.character_unknown ? `，并创建 ${stats.character_unknown} 个角色占位` : '') +
				'。写入后可在创作页继续编辑。',
				'写入项目',
				{ type: 'warning', confirmButtonText: '写入', cancelButtonText: '取消' }
			)
			const result = await applyStoryCompile(Number(props.projectId), buildPayload())
			// 即使弹窗在写入期间被关闭，也要通知父级刷新场景列表
			emit('applied', {
				sceneId: result.first?.scene_id || 0,
				contentId: result.first?.content_id ?? null,
			})
			if (props.modelValue) {
				applied.value = result
				ElMessage.success(`已写入 ${result.created.scenes} 个场景、${result.created.nodes} 条内容`)
				runRegression()
			}
		} catch (e: any) {
			if (e === 'cancel' || e === 'close') return
			ElMessage.error('写入失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			applying.value = false
		}
	}

	const runRegression = async () => {
		try {
			const result = await getStoryRegression(Number(props.projectId))
			regressionSummary.value = result.summary
		} catch (e) {
			regressionSummary.value = null
		}
	}

	// ---- 历史导入 ----
	const formatTime = (value?: string | null) => {
		if (!value) return ''
		const date = new Date(value)
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
	}

	const loadHistoryList = async () => {
		if (!props.projectId || historyLoading.value) return
		historyLoading.value = true
		try {
			historyList.value = await listCompileSources(Number(props.projectId))
		} catch (e) {
			historyList.value = []
		} finally {
			historyLoading.value = false
		}
	}

	const toggleHistory = () => {
		historyOpen.value = !historyOpen.value
		if (historyOpen.value) loadHistoryList()
	}

	const loadHistory = async (item: CompileSourceSummary) => {
		const seq = ++historySeq
		try {
			const detail = await getCompileSource(item.source_id)
			if (seq !== historySeq) return
			historyDetail.value = detail
			historyOpen.value = true
		} catch (e: any) {
			if (seq !== historySeq) return
			ElMessage.error('读取历史编译失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		}
	}

	const historyDiagnostics = computed(() => historyDetail.value?.compile.diagnostics || [])
	const historyNodes = computed(() => historyDetail.value?.compile.source_map?.nodes || [])

	const useHistorySource = () => {
		if (!historyDetail.value) return
		text.value = historyDetail.value.content || ''
		filename.value = historyDetail.value.filename || ''
		preview.value = null
		applied.value = null
		regressionSummary.value = null
		ElMessage.success('已载入历史原文，可重新解析预览')
	}

	const emitLocate = (sceneId?: number | null, contentId?: number | null) => {
		if (!sceneId) return
		emit('locate', { sceneId: Number(sceneId), contentId: contentId ?? null })
		visible.value = false
	}

	const locateHistoryFirst = () => {
		const first = historyNodes.value[0]
		if (!first) return
		emitLocate(first.scene_id, first.content_id)
	}

	watch(
		() => props.modelValue,
		(open) => {
			if (open) {
				historyDetail.value = null
				loadHistoryList()
			} else {
				historyOpen.value = false
			}
		}
	)

	const locateFirst = () => {
		if (!applied.value?.first) return
		emit('applied', {
			sceneId: applied.value.first.scene_id,
			contentId: applied.value.first.content_id,
		})
		visible.value = false
	}

	const resetAll = () => {
		previewSeq += 1
		historySeq += 1
		filename.value = ''
		text.value = ''
		preview.value = null
		applied.value = null
		regressionSummary.value = null
		historyOpen.value = false
		historyDetail.value = null
		previewing.value = false
		applying.value = false
	}
</script>

<style scoped>
	:global(.compiler-dialog .el-dialog__body) {
		padding-top: 8px;
	}

	.cp-intro {
		font-size: 12px;
		line-height: 1.7;
		color: #7a6470;
		margin-bottom: 10px;
	}

	.cp-toolbar {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}

	.cp-file-btn {
		border: 1px solid #f0d0dc;
		background: #fff;
		color: #c81f4a;
		font-size: 12px;
		padding: 5px 12px;
		border-radius: 8px;
		cursor: pointer;
	}

	.cp-file-btn.is-ghost {
		border-color: #e5e7eb;
		color: #6b7280;
	}

	.cp-file-btn:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.cp-file-input {
		display: none;
	}

	.cp-filename {
		flex: 1;
		font-size: 12px;
		color: #6b7280;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cp-count {
		font-size: 11px;
		color: #9ca3af;
	}

	.cp-options {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-top: 10px;
		flex-wrap: wrap;
	}

	.cp-option-note {
		font-size: 11px;
		color: #9ca3af;
	}

	.cp-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 10px;
	}

	.cp-applied {
		font-size: 12px;
		color: #15803d;
	}

	.cp-history {
		margin-top: 10px;
		border: 1px solid #eef0f4;
		border-radius: 9px;
		padding: 8px 10px;
		background: #fafbfc;
	}

	.cp-history-head {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		font-weight: 600;
		color: #4b5563;
		margin-bottom: 6px;
	}

	.cp-history-loading {
		font-size: 10px;
		font-weight: 400;
		color: #9ca3af;
	}

	.cp-history-item {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		padding: 4px 6px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 11px;
	}

	.cp-history-item:hover,
	.cp-history-item.is-active {
		background: #fff2f6;
	}

	.cp-history-name {
		color: #374151;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cp-history-meta {
		flex-shrink: 0;
		font-size: 10px;
		color: #9ca3af;
	}

	.cp-history-detail {
		margin-top: 8px;
		border-top: 1px dashed #e5e7eb;
		padding-top: 8px;
	}

	.cp-history-detail-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}

	.cp-history-detail-title {
		font-size: 12px;
		font-weight: 600;
		color: #c81f4a;
	}

	.cp-history-actions {
		display: flex;
		gap: 8px;
		margin-top: 6px;
	}

	.cp-history-node {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 11px;
		color: #4b5563;
		padding: 2px 4px;
		border-radius: 4px;
		cursor: pointer;
	}

	.cp-history-node:hover {
		background: #fff2f6;
	}

	.cp-history-node .cp-node-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cp-result {
		margin-top: 14px;
		border-top: 1px dashed #f0d0dc;
		padding-top: 12px;
		max-height: 46vh;
		overflow-y: auto;
	}

	.cp-stats {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 6px;
	}

	.cp-stat {
		background: #fff7fa;
		border: 1px solid #f6dbe4;
		border-radius: 8px;
		padding: 7px 4px;
		text-align: center;
	}

	.cp-stat-num {
		display: block;
		font-size: 15px;
		font-weight: 700;
		color: #c81f4a;
	}

	.cp-stat-label {
		display: block;
		font-size: 10px;
		color: #8b6b78;
		margin-top: 2px;
	}

	.cp-regression {
		margin-top: 8px;
		font-size: 12px;
		color: #15803d;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 8px;
		padding: 6px 10px;
	}

	.cp-section {
		margin-top: 14px;
	}

	.cp-section-title {
		font-size: 12px;
		font-weight: 600;
		color: #4b5563;
		margin: 0 0 6px;
	}

	.cp-diagnostic {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 12px;
		padding: 4px 8px;
		border-radius: 6px;
		margin-bottom: 4px;
	}

	.cp-diagnostic.is-error {
		background: #fef2f2;
		color: #b91c1c;
	}

	.cp-diagnostic.is-warning {
		background: #fffbeb;
		color: #b45309;
	}

	.cp-diagnostic.is-info {
		background: #f5f7fa;
		color: #6b7280;
	}

	.cp-diag-tag {
		flex-shrink: 0;
		font-size: 10px;
		padding: 0 4px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.7);
	}

	.cp-diag-line {
		flex-shrink: 0;
		font-size: 10px;
		color: #9ca3af;
		font-family: ui-monospace, monospace;
	}

	.cp-suggestion {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 12px;
		color: #475569;
		padding: 3px 0;
	}

	.cp-sug-tag {
		font-size: 10px;
		padding: 1px 5px;
		border-radius: 4px;
		background: #eef2ff;
		color: #4338ca;
	}

	.cp-sug-tag.is-var {
		background: #f0fdf4;
		color: #15803d;
	}

	.cp-chapter {
		margin-bottom: 10px;
	}

	.cp-chapter-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 5px 8px;
		background: #fdf2f7;
		border-radius: 6px;
	}

	.cp-chapter-title {
		font-size: 12px;
		font-weight: 600;
		color: #c81f4a;
	}

	.cp-chapter-meta {
		font-size: 10px;
		color: #9ca3af;
	}

	.cp-scene {
		margin: 6px 0 0 10px;
		border-left: 2px solid #f3d6e1;
		padding-left: 9px;
	}

	.cp-scene-head {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
	}

	.cp-scene-title {
		color: #374151;
		font-weight: 600;
	}

	.cp-scene-meta {
		color: #9ca3af;
	}

	.cp-node {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 11px;
		padding: 2px 0;
		color: #4b5563;
	}

	.cp-node-kind {
		flex-shrink: 0;
		font-size: 10px;
		color: #c81f4a;
		background: #fff0f5;
		padding: 0 4px;
		border-radius: 3px;
	}

	.cp-node-speaker {
		flex-shrink: 0;
		font-weight: 600;
		color: #374151;
	}

	.cp-node-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cp-node-more,
	.cp-note {
		font-size: 10px;
		color: #9ca3af;
		padding: 3px 0 0;
	}

	@media (max-width: 760px) {
		.cp-stats {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
