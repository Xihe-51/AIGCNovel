<template>
	<div class="tp-term-note">
		统一人名、地名与专有名词的标准写法；扫描会找出误用的别名。
	</div>

	<div class="tp-term-form">
		<input v-model="termForm.standard" class="tp-term-input" placeholder="标准写法，如：林瑶" />
		<input v-model="termForm.variants" class="tp-term-input" placeholder="别名/错写，用逗号分隔" />
		<input v-model="termForm.note" class="tp-term-input" placeholder="备注（可选）" />
		<div class="tp-term-form-actions">
			<button class="tp-term-add" :disabled="savingTerm" @click="submitTerm">
				{{ savingTerm ? '保存中…' : (editingTermId ? '保存修改' : '添加术语') }}
			</button>
			<button v-if="editingTermId" class="tp-term-cancel" :disabled="savingTerm" @click="cancelEditTerm">
				取消
			</button>
		</div>
	</div>

	<div class="tp-term-actions">
		<button class="tp-term-scan-btn" @click="openScan">一致性扫描</button>
		<button class="tp-term-refresh" :disabled="loadingTerms" @click="loadTerms">刷新</button>
	</div>

	<div v-if="loadingTerms" class="tp-state">加载中…</div>
	<div v-else-if="!terms.length" class="tp-state">还没有术语，先添加一条。</div>
	<div v-else class="tp-term-list">
		<div v-for="t in terms" :key="t.term_id" class="tp-term-item">
			<div class="tp-term-main">
				<span class="tp-term-standard">{{ t.standard }}</span>
				<span v-if="t.variants" class="tp-term-variants">别名：{{ t.variants }}</span>
				<span v-if="t.note" class="tp-term-remark">{{ t.note }}</span>
			</div>
			<div class="tp-term-acts">
				<button @click="startEditTerm(t)">编辑</button>
				<button class="danger" @click="removeTerm(t)">删除</button>
			</div>
		</div>
	</div>

	<el-dialog
		v-model="scanVisible"
		title="术语一致性扫描"
		width="560px"
		append-to-body
	>
		<div v-if="scanning" class="tp-state">扫描中…</div>
		<div v-else-if="!scanItems.length" class="tp-state">没有发现别名误用。</div>
		<div v-else class="tp-scan">
			<div class="tp-scan-summary">
				共发现 {{ scanTotal }} 处别名，涉及 {{ scanItems.length }} 个词条。
			</div>
			<div v-for="it in scanItems" :key="it.term_id + '-' + it.variant" class="tp-scan-item">
				<div class="tp-scan-title">
					「{{ it.variant }}」→ 建议改为「{{ it.standard }}」
					<span class="tp-scan-count">{{ it.count }} 处</span>
				</div>
				<div
					v-for="(h, hi) in it.hits"
					:key="hi"
					class="tp-scan-hit"
					@click="onScanHit(h)"
				>
					<span class="tp-scan-where">{{ h.scene_title || '场景' }}{{ h.kind ? ' · ' + h.kind : '' }}</span>
					<span class="tp-scan-text">{{ h.text }}</span>
				</div>
			</div>
		</div>
		<template #footer>
			<el-button @click="scanVisible = false">关闭</el-button>
			<el-button type="primary" :loading="scanning" @click="runScan">重新扫描</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { confirmDanger } from '@/utils/confirm'
import {
	listProjectTerms,
	createProjectTerm,
	updateProjectTerm,
	deleteProjectTerm,
	scanProjectTerms,
} from '@/api/glossary'
import type { ProjectTerm, GlossaryScanItem, GlossaryScanHit } from '@/api/glossary'
import { formatErrorMessage } from '@/utils/errorMessage'

const props = defineProps<{ projectId: string | number }>()
const emit = defineEmits<{
	(e: 'locate', sceneId: number, contentId?: number | null): void
}>()

const terms = ref<ProjectTerm[]>([])
const loadingTerms = ref(false)
const savingTerm = ref(false)
const editingTermId = ref<number | null>(null)
const termForm = ref({ standard: '', variants: '', note: '' })
const scanVisible = ref(false)
const scanning = ref(false)
const scanItems = ref<GlossaryScanItem[]>([])
const scanTotal = ref(0)

const loadTerms = async () => {
	if (!props.projectId) return
	loadingTerms.value = true
	try {
		terms.value = await listProjectTerms(Number(props.projectId))
	} catch (e) {
		console.warn('读取术语表失败:', e)
		terms.value = []
	} finally {
		loadingTerms.value = false
	}
}

const resetTermForm = () => {
	editingTermId.value = null
	termForm.value = { standard: '', variants: '', note: '' }
}

const submitTerm = async () => {
	const standard = termForm.value.standard.trim()
	if (!standard) {
		ElMessage.warning('请填写标准写法')
		return
	}
	savingTerm.value = true
	try {
		if (editingTermId.value) {
			await updateProjectTerm(Number(props.projectId), editingTermId.value, termForm.value)
			ElMessage.success('术语已更新')
		} else {
			await createProjectTerm(Number(props.projectId), termForm.value)
			ElMessage.success('术语已添加')
		}
		resetTermForm()
		await loadTerms()
	} catch (e: any) {
		ElMessage.error(formatErrorMessage('保存失败', e))
	} finally {
		savingTerm.value = false
	}
}

const startEditTerm = (t: ProjectTerm) => {
	editingTermId.value = t.term_id
	termForm.value = { standard: t.standard, variants: t.variants || '', note: t.note || '' }
}

const cancelEditTerm = () => resetTermForm()

const removeTerm = async (t: ProjectTerm) => {
	const confirmed = await confirmDanger(`删除术语「${t.standard}」？`, { title: '删除术语' })
	if (!confirmed) return
	try {
		await deleteProjectTerm(Number(props.projectId), t.term_id)
		if (editingTermId.value === t.term_id) resetTermForm()
		await loadTerms()
		ElMessage.success('术语已删除')
	} catch (e: any) {
		ElMessage.error(formatErrorMessage('删除失败', e))
	}
}

const runScan = async () => {
	if (!props.projectId || scanning.value) return
	scanning.value = true
	try {
		const res = await scanProjectTerms(Number(props.projectId))
		scanItems.value = res.items || []
		scanTotal.value = res.total || 0
	} catch (e: any) {
		ElMessage.error(formatErrorMessage('扫描失败', e))
		scanItems.value = []
		scanTotal.value = 0
	} finally {
		scanning.value = false
	}
}

const openScan = () => {
	scanVisible.value = true
	runScan()
}

const onScanHit = (h: GlossaryScanHit) => {
	if (!h.scene_id) return
	emit('locate', h.scene_id, h.content_id)
	scanVisible.value = false
}

onMounted(loadTerms)
watch(() => props.projectId, () => {
	resetTermForm()
	scanVisible.value = false
	scanItems.value = []
	scanTotal.value = 0
	loadTerms()
})
</script>
