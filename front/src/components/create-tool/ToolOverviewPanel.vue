<template>
	<div v-if="loading" class="tp-state">加载中…</div>
	<div v-else-if="!overview" class="tp-state">读取工程数据失败</div>
	<div v-else class="tp-overview">
		<div class="tp-ov-grid">
			<div class="tp-ov-card">
				<span class="tp-ov-num">{{ overview.word_count }}</span>
				<span class="tp-ov-label">总字数</span>
			</div>
			<div class="tp-ov-card">
				<span class="tp-ov-num">{{ overview.scene_count }}</span>
				<span class="tp-ov-label">场景</span>
			</div>
			<div class="tp-ov-card">
				<span class="tp-ov-num">{{ overview.branch_count }}</span>
				<span class="tp-ov-label">分支</span>
			</div>
			<div class="tp-ov-card">
				<span class="tp-ov-num">{{ overview.ending_count }}</span>
				<span class="tp-ov-label">结局</span>
			</div>
		</div>

		<div class="tp-ov-brief">
			<span>预计阅读 {{ overview.reading_minutes }} 分钟</span>
		</div>

		<div v-if="overview.target_words" class="tp-ov-goal">
			<div class="tp-ov-goal-head">
				<span>全书进度</span>
				<span>{{ overview.word_count }} / {{ overview.target_words }} 字（{{ overview.completion_percent }}%）</span>
			</div>
			<el-progress
				:percentage="overview.completion_percent || 0"
				:stroke-width="8"
				color="#e8467c"
			/>
		</div>

		<div class="tp-ov-section">章节字数</div>
		<div v-if="!overview.chapters.length" class="tp-state tp-ov-empty">
			还没有章节分组，左侧「章节」里可以建第一幕
		</div>
		<div v-else class="tp-ov-list">
			<div v-for="ch in overview.chapters" :key="ch.chapter_id" class="tp-ov-row-wrap">
				<div class="tp-ov-row">
					<span class="tp-ov-chapter">{{ ch.title }}</span>
					<span class="tp-ov-scenes">{{ ch.scene_count }} 场</span>
					<span class="tp-ov-words">{{ ch.word_count }} 字</span>
				</div>
				<div v-if="ch.target_words" class="tp-ov-ch-goal">
					<el-progress
						:percentage="ch.completion_percent || 0"
						:stroke-width="5"
						:show-text="false"
						color="#e8467c"
					/>
					<span>{{ ch.completion_percent }}% · 目标 {{ ch.target_words }} 字 · 约 {{ ch.reading_minutes }} 分钟</span>
				</div>
			</div>
		</div>
		<div v-if="overview.ungrouped.scene_count" class="tp-ov-row tp-ov-ungrouped">
			<span class="tp-ov-chapter">未分组</span>
			<span class="tp-ov-scenes">{{ overview.ungrouped.scene_count }} 场</span>
			<span class="tp-ov-words">{{ overview.ungrouped.word_count }} 字</span>
		</div>

		<div class="tp-ov-section">工程规模</div>
		<div class="tp-ov-meta">
			<span>{{ overview.character_count }} 角色</span>
			<span>{{ overview.variable_count }} 变量</span>
			<span>{{ overview.cg_count }} CG</span>
			<span :class="{ 'is-warn': overview.asset_missing > 0 }">
				{{ overview.asset_total }} 素材 / 缺失 {{ overview.asset_missing }}
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getProjectOverview } from '@/api/gallery'
import type { ProjectOverview } from '@/api/gallery'

const props = defineProps<{ projectId: string | number }>()

const overview = ref<ProjectOverview | null>(null)
const loading = ref(false)

const load = async () => {
	if (!props.projectId) return
	loading.value = true
	try {
		overview.value = await getProjectOverview(Number(props.projectId))
	} catch (e) {
		console.warn('读取工程概览失败:', e)
		overview.value = null
	} finally {
		loading.value = false
	}
}

onMounted(load)
</script>
