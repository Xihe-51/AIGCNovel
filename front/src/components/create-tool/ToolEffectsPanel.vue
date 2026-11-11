<template>
	<div class="tp-ai-note">
		演出指令挂在每条对话上：点对话卡右上角的「演出」按钮，就能给这条对话加立绘、背景、音乐、音效或停顿。
	</div>
	<div class="tp-dir-stats">
		<div v-for="s in directiveStats" :key="s.key" class="tp-dir-row">
			<span class="tp-dir-name">{{ s.label }}</span>
			<span :class="['tp-dir-count', { 'is-zero': !s.count }]">{{ s.count }}</span>
		</div>
	</div>
	<div class="tp-soon">
		<div class="tp-soon-item">
			<span class="tp-soon-name">立绘左 / 中 / 右三槽位</span>
			<span class="tp-soon-tag is-ok">已支持</span>
		</div>
		<div class="tp-soon-item">
			<span class="tp-soon-name">背景切换（淡入淡出）</span>
			<span class="tp-soon-tag is-ok">已支持</span>
		</div>
		<div class="tp-soon-item">
			<span class="tp-soon-name">BGM 播放 / 停止</span>
			<span class="tp-soon-tag is-ok">已支持</span>
		</div>
		<div class="tp-soon-item">
			<span class="tp-soon-name">音效插入</span>
			<span class="tp-soon-tag is-ok">已支持</span>
		</div>
		<div class="tp-soon-item">
			<span class="tp-soon-name">停顿（阻塞推进）</span>
			<span class="tp-soon-tag is-ok">已支持</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listDirectives } from '@/api/directive'

const props = defineProps<{ projectId: string | number }>()

// 演出指令统计（按类型汇总）
const directiveStats = ref([
	{ key: 'avatar', label: '立绘', count: 0 },
	{ key: 'background', label: '背景', count: 0 },
	{ key: 'music', label: '音乐', count: 0 },
	{ key: 'sound', label: '音效', count: 0 },
	{ key: 'wait', label: '停顿', count: 0 }
])

const load = async () => {
	if (!props.projectId) return
	try {
		const rows = await listDirectives(Number(props.projectId))
		const cnt: Record<string, number> = { avatar: 0, background: 0, music: 0, sound: 0, wait: 0 }
		for (const r of rows) {
			if (cnt[r.directive_type] !== undefined) cnt[r.directive_type] += 1
		}
		directiveStats.value = directiveStats.value.map(s => ({ ...s, count: cnt[s.key] || 0 }))
	} catch (e) {
		console.error('加载演出指令统计失败:', e)
	}
}

onMounted(load)
</script>
