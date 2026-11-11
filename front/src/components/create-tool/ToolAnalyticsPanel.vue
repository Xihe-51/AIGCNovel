<template>
	<div class="tp-an-note">
		统计真实试玩行为（调试模式与作者埋点不会计入）。
	</div>
	<div class="tp-an-actions">
		<select v-model.number="days" class="tp-an-range" @change="load">
			<option :value="7">近 7 天</option>
			<option :value="30">近 30 天</option>
			<option :value="90">近 90 天</option>
		</select>
		<button class="tp-an-refresh" :disabled="loading" @click="load">
			{{ loading ? '加载中…' : '刷新' }}
		</button>
	</div>

	<div v-if="loading" class="tp-state">加载中…</div>
	<div v-else-if="!analytics" class="tp-state">还没有试玩数据</div>
	<template v-else>
		<div class="tp-an-summary">
			<div class="tp-an-stat">
				<span class="tp-an-value">{{ analytics.summary.total_sessions }}</span>
				<span class="tp-an-label">试玩会话</span>
			</div>
			<div class="tp-an-stat">
				<span class="tp-an-value">{{ analytics.summary.completion_rate }}%</span>
				<span class="tp-an-label">完成率</span>
			</div>
			<div class="tp-an-stat wide">
				<span class="tp-an-value">{{ analytics.summary.avg_duration_text }}</span>
				<span class="tp-an-label">平均时长</span>
			</div>
		</div>

		<div v-if="analytics.summary.top_dropoff" class="tp-an-dropoff">
			最大流失点：
			<button class="tp-an-link" @click="locate(analytics.summary.top_dropoff.scene_id)">
				{{ analytics.summary.top_dropoff.title }}
			</button>
			· {{ analytics.summary.top_dropoff.drop_offs }} 人
			（到达后流失 {{ analytics.summary.top_dropoff.rate }}%）
		</div>

		<div class="tp-an-section">场景到达率（卡点）</div>
		<div v-if="!analytics.scenes.length" class="tp-an-empty">还没有场景数据</div>
		<div
			v-for="s in analytics.scenes"
			:key="s.scene_id"
			class="tp-an-scene is-clickable"
			@click="locate(s.scene_id)"
		>
			<div class="tp-an-scene-top">
				<span class="tp-an-scene-name">{{ s.order_num }}. {{ s.title }}</span>
				<span class="tp-an-scene-meta">
					{{ s.reached }} 人 · {{ s.rate }}%
					<template v-if="s.drop_offs"> · 流失 {{ s.drop_offs }}（{{ s.drop_rate }}%）</template>
				</span>
			</div>
			<div class="tp-an-bar">
				<div class="tp-an-bar-fill" :style="{ width: Math.min(100, s.rate) + '%' }"></div>
			</div>
		</div>

		<div class="tp-an-section">章节完成率</div>
		<div v-if="!analytics.chapters?.length" class="tp-an-empty">还没有章节分组</div>
		<div
			v-for="c in analytics.chapters"
			:key="c.chapter_id"
			class="tp-an-scene is-clickable"
			@click="locate(c.first_scene_id)"
		>
			<div class="tp-an-scene-top">
				<span class="tp-an-scene-name">{{ c.order_num }}. {{ c.title }}</span>
				<span class="tp-an-scene-meta">{{ c.reached }} 人 · {{ c.rate }}%</span>
			</div>
			<div class="tp-an-bar">
				<div class="tp-an-bar-fill" :style="{ width: Math.min(100, c.rate) + '%' }"></div>
			</div>
		</div>

		<div class="tp-an-section">选项分布</div>
		<div v-if="!analytics.choices.length" class="tp-an-empty">还没有选项数据</div>
		<div v-for="g in analytics.choices" :key="g.content_id" class="tp-an-choice">
			<div class="tp-an-choice-title is-clickable" @click="locate(g.scene_id, g.content_id)">
				{{ g.scene_title }} · {{ g.node_text }}
			</div>
			<div
				v-for="o in g.options"
				:key="o.path_id || o.choice_text"
				:class="['tp-an-option', { 'is-cold': g.options.length > 1 && o.percent === g.least_percent }]"
			>
				<span class="tp-an-option-text">{{ o.choice_text }}</span>
				<span class="tp-an-option-meta">
					{{ o.count }} 次 · {{ o.percent }}%
					<span v-if="g.options.length > 1 && o.percent === g.least_percent" class="tp-an-cold-tag">最少人选</span>
				</span>
			</div>
		</div>

		<div class="tp-an-section">结局达成</div>
		<div v-if="!analytics.endings.length" class="tp-an-empty">还没有结局定义</div>
		<div
			v-for="e in analytics.endings"
			:key="e.ending_id"
			class="tp-an-ending is-clickable"
			@click="e.scene_id && locate(e.scene_id, e.content_id)"
		>
			<span class="tp-an-ending-name">{{ e.title }}</span>
			<span class="tp-an-ending-meta">{{ e.count }} 人 · {{ e.rate }}%</span>
		</div>
	</template>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getPlayAnalytics } from '@/api/analytics'
import type { PlayAnalytics } from '@/api/analytics'

const props = defineProps<{ projectId: string | number }>()
const emit = defineEmits<{
	(e: 'locate', sceneId: number, contentId?: number | null): void
}>()

const analytics = ref<PlayAnalytics | null>(null)
const days = ref(30)
const loading = ref(false)

const load = async () => {
	if (!props.projectId) return
	loading.value = true
	try {
		analytics.value = await getPlayAnalytics(Number(props.projectId), days.value)
	} catch (e) {
		console.warn('读取试玩数据失败:', e)
		analytics.value = null
	} finally {
		loading.value = false
	}
}

const locate = (sceneId: number, contentId?: number | null) => emit('locate', sceneId, contentId ?? null)

onMounted(load)
</script>
