<template>
	<div class="tp-rep-note">
		按场景、章节与角色统计剧本规模，可导出 CSV 在 Excel 中查看。
	</div>
	<div class="tp-rep-actions">
		<button class="tp-rep-refresh" :disabled="loading" @click="load">
			{{ loading ? '统计中…' : '刷新统计' }}
		</button>
		<button class="tp-rep-export" :disabled="!report" @click="exportCsv">导出 CSV</button>
	</div>

	<div v-if="loading" class="tp-state">统计中…</div>
	<div v-else-if="!report" class="tp-state">读取统计失败</div>
	<template v-else>
		<div class="tp-rep-summary">
			<span>{{ report.summary.scene_count }} 场景</span>
			<span>{{ report.summary.node_count }} 节点</span>
			<span>{{ report.summary.word_count }} 字</span>
			<span>{{ report.summary.character_count }} 角色</span>
			<span>{{ report.summary.branch_count }} 分支</span>
			<span>{{ report.summary.ending_count }} 结局</span>
		</div>

		<div v-if="report.chapters.length" class="tp-rep-section">章节</div>
		<div v-for="ch in report.chapters" :key="ch.chapter_id" class="tp-rep-chapter">
			<span class="tp-rep-title">{{ ch.order_num }}. {{ ch.title }}</span>
			<span class="tp-rep-meta">
				{{ ch.scene_count }} 场 · {{ ch.word_count }} 字
				<span v-if="ch.target_words">/ 目标 {{ ch.target_words }}</span>
			</span>
		</div>

		<div class="tp-rep-section">场景统计</div>
		<div class="tp-rep-scene-row tp-rep-head">
			<span>场景</span><span>节点</span><span>台词</span><span>字数</span>
		</div>
		<div v-for="s in report.scenes" :key="s.scene_id" class="tp-rep-scene-row">
			<span class="tp-rep-scene-name" :title="s.title">{{ s.order_num }}. {{ s.title }}</span>
			<span>{{ s.node_count }}</span>
			<span>{{ s.dialogue_count }}</span>
			<span>{{ s.word_count }}</span>
		</div>

		<div class="tp-rep-section">角色统计</div>
		<div class="tp-rep-char-row tp-rep-head">
			<span>角色</span><span>台词</span><span>字数</span>
		</div>
		<div v-for="c in report.characters" :key="c.character_id" class="tp-rep-char-row">
			<span class="tp-rep-char-name">
				{{ c.name }}<span v-if="c.is_main" class="tp-rep-main">主角</span>
			</span>
			<span>{{ c.line_count }}</span>
			<span>{{ c.word_count }}</span>
		</div>
		<div v-if="!report.characters.length" class="tp-an-empty">还没有角色数据</div>
	</template>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getScriptStats } from '@/api/report'
import type { ScriptStats } from '@/api/report'

const props = defineProps<{ projectId: string | number }>()

const report = ref<ScriptStats | null>(null)
const loading = ref(false)

const load = async () => {
	if (!props.projectId) return
	loading.value = true
	try {
		report.value = await getScriptStats(Number(props.projectId))
	} catch (e) {
		console.warn('读取剧本统计失败:', e)
		report.value = null
	} finally {
		loading.value = false
	}
}

const csvCell = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`
const csvLine = (cells: any[]) => cells.map(csvCell).join(',')

const exportCsv = () => {
	const r = report.value
	if (!r) return
	const s = r.summary
	const lines = [
		csvLine(['项目', s.project_title]),
		csvLine(['生成时间', s.generated_at]),
		csvLine(['章节', s.chapter_count, '场景', s.scene_count, '节点', s.node_count]),
		csvLine(['台词', s.dialogue_count, '旁白', s.narration_count, '选择', s.choice_count]),
		csvLine(['分支', s.branch_count, '结局', s.ending_count, '角色', s.character_count]),
		csvLine(['CG', s.cg_count, '总字数', s.word_count, '每场景平均字数', s.avg_words_per_scene]),
		'',
		csvLine(['章节统计']),
		csvLine(['序号', '章节', '场景数', '字数', '目标字数']),
		...r.chapters.map(ch => csvLine([ch.order_num, ch.title, ch.scene_count, ch.word_count, ch.target_words])),
		'',
		csvLine(['场景统计']),
		csvLine(['序号', '场景', '节点', '台词', '旁白', '选择', '分支', '结局', '字数']),
		...r.scenes.map(sc => csvLine([
			sc.order_num, sc.title, sc.node_count, sc.dialogue_count,
			sc.narration_count, sc.choice_count, sc.branch_count,
			sc.ending_count, sc.word_count,
		])),
		'',
		csvLine(['角色统计']),
		csvLine(['角色', '主角', '台词数', '字数', '出场场景']),
		...r.characters.map(c => csvLine([
			c.name, c.is_main ? '是' : '否', c.line_count, c.word_count, c.scene_count,
		])),
	]
	const blob = new Blob(['\ufeff' + lines.join('\r\n')], {
		type: 'text/csv;charset=utf-8',
	})
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `项目${props.projectId}-剧本统计.csv`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
	ElMessage.success('CSV 已导出')
}

onMounted(load)
watch(() => props.projectId, load)
</script>
