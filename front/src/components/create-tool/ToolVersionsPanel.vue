<template>
	<div class="tp-ver-note">
		保存全部对话、场景设置或剧情图时会自动生成版本；也可以手动存一份快照。
	</div>
	<div class="tp-ver-actions">
		<button class="tp-ver-save" :disabled="savingVersion" @click="saveVersionNow">
			{{ savingVersion ? '保存中…' : '立即存快照' }}
		</button>
		<button class="tp-ver-refresh" :disabled="loadingVersions" @click="loadVersions">刷新</button>
	</div>

	<div v-if="loadingVersions" class="tp-state">加载中…</div>
	<div v-else-if="!versions.length" class="tp-state">
		还没有版本，点「立即存快照」，或先保存一次剧本。
	</div>
	<div v-else class="tp-ver-list">
		<div v-for="v in versions" :key="v.version_id" class="tp-ver-item">
			<div class="tp-ver-top">
				<span class="tp-ver-label">{{ v.label || '版本' }}</span>
				<span class="tp-ver-time">{{ formatVersionTime(v.created_at) }}</span>
			</div>
			<div class="tp-ver-meta">
				<span>#{{ v.version_id }}</span>
				<span>{{ v.scene_count }} 场景</span>
				<span>{{ v.content_count }} 节点</span>
				<span>{{ v.branch_count }} 分支</span>
			</div>
			<div class="tp-ver-acts">
				<button
					class="tp-ver-act"
					:disabled="diffLoadingId === v.version_id"
					@click="showDiff(v)"
				>{{ diffLoadingId === v.version_id ? '对比中…' : '查看差异' }}</button>
				<button
					class="tp-ver-act danger"
					:disabled="restoringId !== null"
					@click="restoreVersion(v)"
				>{{ restoringId === v.version_id ? '恢复中…' : '恢复此版' }}</button>
			</div>
		</div>
	</div>

	<el-dialog
		v-model="diffVisible"
		title="版本差异"
		width="760px"
		append-to-body
		class="tp-ver-dialog"
	>
		<div v-if="diffLoading" class="tp-state">正在对比…</div>
		<div v-else-if="diffData" class="tp-diff">
			<div class="tp-diff-summary">
				<span>场景 {{ diffData.summary.scene_changed }}</span>
				<span>剧情节点 {{ diffData.summary.content_changed }}</span>
				<span>分支 {{ diffData.summary.branch_changed }}</span>
				<span>结局 {{ diffData.endings.total }}</span>
			</div>
			<div class="tp-diff-note">下面是「该版本 → 当前内容」的变化。</div>
			<div
				v-if="!diffData.contents.total && !diffData.summary.scene_changed && !diffData.branches.total"
				class="tp-state tp-ov-empty"
			>剧本内容与当前一致。</div>

			<template v-if="diffData.summary.scene_changed">
				<div class="tp-diff-title">场景</div>
				<div v-for="s in diffData.scenes.added" :key="'sa' + s.scene_id" class="tp-diff-row add">
					+ 新增场景「{{ s.title }}」<span class="tp-diff-sub">#{{ s.scene_id }}</span>
				</div>
				<div v-for="s in diffData.scenes.removed" :key="'sr' + s.scene_id" class="tp-diff-row remove">
					- 删除场景「{{ s.title }}」<span class="tp-diff-sub">#{{ s.scene_id }}</span>
				</div>
				<div v-for="s in diffData.scenes.modified" :key="'sm' + s.scene_id" class="tp-diff-row mod">
					~ 场景「{{ s.title }}」<span class="tp-diff-sub">{{ s.changes?.map(c => c.field).join('、') }}</span>
				</div>
			</template>

			<template v-if="diffData.contents.total">
				<div class="tp-diff-title">剧情节点</div>
				<div v-for="c in diffData.contents.added" :key="'ca' + c.content_id" class="tp-diff-row add">
					+ [{{ c.scene_title }}] {{ c.content_type }}：{{ c.text }}
				</div>
				<div v-for="c in diffData.contents.removed" :key="'cr' + c.content_id" class="tp-diff-row remove">
					- [{{ c.scene_title }}] {{ c.content_type }}：{{ c.text }}
				</div>
				<div v-for="c in diffData.contents.modified" :key="'cm' + c.content_id" class="tp-diff-row mod">
					~ [{{ c.scene_title }}] {{ c.content_type }}：{{ c.text }}
					<span class="tp-diff-sub">{{ c.changes?.map(ch => ch.field).join('、') }}</span>
				</div>
			</template>
		</div>
		<template #footer>
			<el-button @click="diffVisible = false">关闭</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
	createProjectVersion,
	getVersionDiff,
	listProjectVersions,
	restoreProjectVersion,
} from '@/api/version'
import type { ProjectVersionMeta, VersionDiff } from '@/api/version'

const props = defineProps<{ projectId: string | number }>()
const emit = defineEmits<{
	(e: 'restored'): void
}>()

const versions = ref<ProjectVersionMeta[]>([])
const loadingVersions = ref(false)
const savingVersion = ref(false)
const restoringId = ref<number | null>(null)
const diffVisible = ref(false)
const diffLoading = ref(false)
const diffLoadingId = ref<number | null>(null)
const diffData = ref<VersionDiff | null>(null)

const formatVersionTime = (iso: string) => {
	if (!iso) return ''
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return iso
	return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const loadVersions = async () => {
	if (!props.projectId) return
	loadingVersions.value = true
	try {
		versions.value = await listProjectVersions(Number(props.projectId))
	} catch (e) {
		console.warn('读取版本列表失败:', e)
		versions.value = []
	} finally {
		loadingVersions.value = false
	}
}

const saveVersionNow = async () => {
	if (!props.projectId || savingVersion.value) return
	savingVersion.value = true
	try {
		const res = await createProjectVersion(Number(props.projectId), '手动快照')
		ElMessage.success(res.created ? '快照已保存' : '内容与上一版一致，已复用上一版')
		await loadVersions()
	} catch (e: any) {
		ElMessage.error('保存快照失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
	} finally {
		savingVersion.value = false
	}
}

const showDiff = async (v: ProjectVersionMeta) => {
	if (diffLoadingId.value !== null) return
	diffLoadingId.value = v.version_id
	diffVisible.value = true
	diffLoading.value = true
	diffData.value = null
	try {
		const res = await getVersionDiff(Number(props.projectId), v.version_id)
		diffData.value = res.diff
	} catch (e: any) {
		ElMessage.error('读取差异失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
	} finally {
		diffLoading.value = false
		diffLoadingId.value = null
	}
}

const restoreVersion = async (v: ProjectVersionMeta) => {
	if (restoringId.value !== null) return
	try {
		await ElMessageBox.confirm(
			`恢复到版本 #${v.version_id}（${formatVersionTime(v.created_at)}）？\n当前剧本会先自动备份，恢复后当前页面会自动刷新。`,
			'恢复版本',
			{ type: 'warning', confirmButtonText: '恢复', cancelButtonText: '取消' }
		)
	} catch {
		return
	}
	restoringId.value = v.version_id
	try {
		const res = await restoreProjectVersion(Number(props.projectId), v.version_id)
		ElMessage.success(
			`已恢复：更新 ${res.contents_updated || 0} 条、补回 ${res.contents_created || 0} 条、删除 ${res.contents_deleted || 0} 条`
		)
		diffVisible.value = false
		await loadVersions()
		emit('restored')
	} catch (e: any) {
		ElMessage.error('恢复失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
	} finally {
		restoringId.value = null
	}
}

onMounted(loadVersions)
watch(() => props.projectId, () => {
	diffVisible.value = false
	diffData.value = null
	loadVersions()
})
</script>
