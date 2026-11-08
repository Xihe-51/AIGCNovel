<template>
	<div class="ov-root">
		<div class="ov-head">
			<div class="ov-title">大纲 / 时间线</div>
			<button class="ov-refresh" :disabled="loading" @click="load">
				{{ loading ? '读取中…' : '刷新' }}
			</button>
		</div>

		<div v-if="loading && !outline" class="ov-state">加载中…</div>
		<div v-else-if="!outline" class="ov-state">读取大纲失败</div>
		<div v-else class="ov-body">
			<div class="ov-summary">
				<span>{{ outline.totals.scene_count }} 场景</span>
				<span>{{ outline.totals.node_count }} 节点</span>
				<span>{{ outline.totals.word_count }} 字</span>
				<span>{{ outline.totals.branch_count }} 分支</span>
				<span>{{ outline.totals.ending_count }} 结局</span>
			</div>

			<div v-for="ch in outline.chapters" :key="ch.chapter_id" class="ov-chapter">
				<div class="ov-chapter-head">
					<div class="ov-chapter-title">
						<span class="ov-chapter-name">{{ ch.title }}</span>
						<span class="ov-chapter-count">{{ ch.scenes.length }} 场景</span>
					</div>
					<div v-if="ch.target_words" class="ov-chapter-goal">
						<el-progress
							:percentage="chapterPercent(ch)"
							:stroke-width="6"
							:show-text="false"
							color="#e8467c"
						/>
						<span>{{ chapterWords(ch) }} / {{ ch.target_words }} 字</span>
					</div>
				</div>

				<div v-if="!ch.scenes.length" class="ov-empty">该章节下还没有场景</div>
				<div v-for="s in ch.scenes" :key="s.scene_id" class="ov-scene" @click="emit('select', s.scene_id)">
					<div class="ov-scene-main">
						<div class="ov-scene-title">
							<span class="ov-scene-order">{{ s.order_num }}</span>
							<span class="ov-scene-name">{{ s.title }}</span>
							<span v-if="s.has_background" class="ov-tag">背景</span>
							<span v-if="s.has_music" class="ov-tag music">音乐</span>
						</div>
						<div v-if="s.description" class="ov-scene-desc">{{ s.description }}</div>
					</div>
					<div class="ov-scene-stats">
						<span>{{ s.node_count }} 节点</span>
						<span>{{ s.word_count }} 字</span>
						<span v-if="s.branch_count">{{ s.branch_count }} 分支</span>
						<span v-if="s.ending_count">{{ s.ending_count }} 结局</span>
					</div>
				</div>
			</div>

			<div v-if="outline.ungrouped.length" class="ov-chapter">
				<div class="ov-chapter-head">
					<div class="ov-chapter-title">
						<span class="ov-chapter-name">未分组</span>
						<span class="ov-chapter-count">{{ outline.ungrouped.length }} 场景</span>
					</div>
				</div>
				<div v-for="s in outline.ungrouped" :key="s.scene_id" class="ov-scene" @click="emit('select', s.scene_id)">
					<div class="ov-scene-main">
						<div class="ov-scene-title">
							<span class="ov-scene-order">{{ s.order_num }}</span>
							<span class="ov-scene-name">{{ s.title }}</span>
							<span v-if="s.has_background" class="ov-tag">背景</span>
							<span v-if="s.has_music" class="ov-tag music">音乐</span>
						</div>
						<div v-if="s.description" class="ov-scene-desc">{{ s.description }}</div>
					</div>
					<div class="ov-scene-stats">
						<span>{{ s.node_count }} 节点</span>
						<span>{{ s.word_count }} 字</span>
						<span v-if="s.branch_count">{{ s.branch_count }} 分支</span>
						<span v-if="s.ending_count">{{ s.ending_count }} 结局</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, onMounted, watch } from 'vue'
	import { getProjectOutline } from '@/api/outline'
	import type { ProjectOutline, OutlineChapter } from '@/api/outline'

	const props = defineProps<{
		projectId: string | number
		refreshKey?: number
	}>()

	const emit = defineEmits<{
		(e: 'select', sceneId: number): void
	}>()

	const outline = ref<ProjectOutline | null>(null)
	const loading = ref(false)

	const load = async () => {
		if (!props.projectId) return
		loading.value = true
		try {
			outline.value = await getProjectOutline(Number(props.projectId))
		} catch (e) {
			console.warn('读取大纲失败:', e)
			outline.value = null
		} finally {
			loading.value = false
		}
	}

	const chapterWords = (ch: OutlineChapter) =>
		ch.scenes.reduce((sum, s) => sum + s.word_count, 0)

	const chapterPercent = (ch: OutlineChapter) => {
		if (!ch.target_words) return 0
		return Math.min(100, Math.round(chapterWords(ch) * 100 / ch.target_words))
	}

	onMounted(load)
	watch(() => props.projectId, load)
	watch(() => props.refreshKey, load)
</script>

<style scoped>
	.ov-root {
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: #fffafc;
	}

	.ov-head {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 18px;
		border-bottom: 1px solid #f5dbe4;
		background: #fff;
	}

	.ov-title {
		font-size: 14px;
		font-weight: 600;
		color: #c81f4a;
	}

	.ov-refresh {
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
		border-radius: 7px;
		padding: 4px 10px;
		font-size: 11px;
		cursor: pointer;
	}

	.ov-refresh:disabled {
		opacity: 0.55;
		cursor: wait;
	}

	.ov-state {
		padding: 40px;
		text-align: center;
		font-size: 13px;
		color: #b37d8f;
	}

	.ov-body {
		flex: 1;
		overflow-y: auto;
		padding: 14px 18px 40px;
	}

	.ov-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 14px;
		font-size: 11px;
		color: #8a6a76;
	}

	.ov-summary span {
		background: #fdf3f7;
		border: 1px solid #f6d6e2;
		border-radius: 8px;
		padding: 3px 9px;
	}

	.ov-chapter {
		margin-bottom: 18px;
	}

	.ov-chapter-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
		padding: 0 2px;
	}

	.ov-chapter-title {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.ov-chapter-name {
		font-size: 14px;
		font-weight: 600;
		color: #3d2b32;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ov-chapter-count {
		flex-shrink: 0;
		font-size: 10px;
		color: #b99aa5;
	}

	.ov-chapter-goal {
		width: 240px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 10px;
		color: #b99aa5;
	}

	.ov-empty {
		font-size: 12px;
		color: #b99aa5;
		padding: 8px 4px;
	}

	.ov-scene {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 10px 12px;
		margin-bottom: 6px;
		border: 1px solid #f5e4ea;
		border-radius: 10px;
		background: #fff;
		cursor: pointer;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.ov-scene:hover {
		border-color: #ffafc3;
		box-shadow: 0 3px 12px rgba(200, 31, 74, 0.08);
	}

	.ov-scene-main {
		min-width: 0;
	}

	.ov-scene-title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: #3d2b32;
	}

	.ov-scene-order {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 18px;
		border-radius: 5px;
		background: #fdeef3;
		color: #c81f4a;
		font-size: 10px;
	}

	.ov-scene-name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ov-tag {
		flex-shrink: 0;
		font-size: 9px;
		color: #5b8def;
		background: #eef3ff;
		border: 1px solid #d6e2ff;
		border-radius: 5px;
		padding: 0 5px;
		line-height: 1.6;
	}

	.ov-tag.music {
		color: #1f9d76;
		background: #eefaf4;
		border-color: #cdeeda;
	}

	.ov-scene-desc {
		margin-top: 3px;
		font-size: 11px;
		color: #b99aa5;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ov-scene-stats {
		flex-shrink: 0;
		display: flex;
		gap: 8px;
		font-size: 10px;
		color: #8a6a76;
	}
</style>
