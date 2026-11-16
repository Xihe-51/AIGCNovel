<template>
	<el-dialog
		v-model="visible"
		title="发布向导"
		width="620px"
		append-to-body
		class="publish-wizard"
		@open="loadCheck"
	>
		<div v-if="loading" class="pw-state">正在检查作品…</div>
		<div v-else-if="!check" class="pw-state">读取发布检查失败</div>
		<template v-else>
			<div class="pw-head">
				<div class="pw-title">{{ check.title }}</div>
				<div :class="['pw-badge', check.is_public ? 'is-public' : 'is-private']">
					{{ check.is_public ? '已公开' : '未公开' }}
				</div>
			</div>

			<div class="pw-stats">
				<span>{{ check.stats.scene_count }} 场景</span>
				<span>{{ check.stats.node_count }} 节点</span>
				<span>{{ check.stats.branch_count }} 分支</span>
				<span>{{ check.stats.ending_count }} 结局</span>
				<span :class="{ 'is-danger': check.stats.missing_assets > 0 }">
					缺失素材 {{ check.stats.missing_assets }}
				</span>
				<span>可达率 {{ Math.round((check.stats.coverage || 0) * 100) }}%</span>
			</div>

			<div :class="['pw-verdict', check.ready ? 'is-ok' : 'is-blocked']">
				<template v-if="check.ready">结构检查通过，可以发布。</template>
				<template v-else>还有 {{ check.error_count }} 个错误，修复后再发布更稳妥。</template>
			</div>

			<div v-if="check.issues.length" class="pw-issues">
				<div
					v-for="(it, idx) in check.issues"
					:key="idx"
					:class="['pw-issue', it.level]"
				>
					<span class="pw-issue-tag">{{ it.level === 'error' ? '错误' : '提醒' }}</span>
					<span class="pw-issue-text">{{ it.message }}</span>
				</div>
			</div>
			<div v-else class="pw-issues-empty">没有发现问题。</div>

			<div v-if="check.is_public" class="pw-share">
				<div class="pw-share-label">分享链接</div>
				<div class="pw-share-row">
					<input class="pw-share-input" :value="shareLink" readonly @focus="selectLink" />
					<button type="button" class="pw-share-btn" @click="copyLink">复制</button>
					<button type="button" class="pw-share-btn ghost" @click="openLink">打开</button>
				</div>
				<div class="pw-share-tip">玩家登录后可访问该链接试玩；取消公开后链接失效。</div>
			</div>

			<!-- 发布记录 / 版本更新 -->
			<div class="pw-release">
				<div class="pw-release-head">
					<span class="pw-release-title">发布记录</span>
					<span class="pw-release-count">{{ releases.length }} 个版本</span>
				</div>
				<div class="pw-release-form">
					<input
						v-model="releaseNotes"
						class="pw-release-input"
						maxlength="500"
						placeholder="更新说明（可选）：例如「新增结局 · 修正错别字」"
					/>
					<button
						type="button"
						class="pw-btn primary"
						:disabled="saving || !check"
						@click="publishNewVersion"
					>{{ saving ? '处理中…' : '发布新版本' }}</button>
				</div>
				<div v-if="releasesLoading" class="pw-release-empty">加载发布记录…</div>
				<div v-else-if="!releases.length" class="pw-release-empty">
					还没有发布记录。首次发布作品后会记录 v1。
				</div>
				<div v-else class="pw-release-list">
					<div v-for="r in releases" :key="r.release_id" class="pw-release-item">
						<div class="pw-release-row">
							<span class="pw-release-no">v{{ r.release_no }}</span>
							<span v-if="r.is_latest" class="pw-release-latest">最新</span>
							<span class="pw-release-time">{{ formatReleaseTime(r.created_at) }}</span>
							<span class="pw-release-stats">
								{{ r.stats.scene_count }} 场景 · {{ r.stats.content_count }} 节点 · {{ r.stats.branch_count }} 分支
							</span>
							<button
								type="button"
								class="pw-release-rollback"
								:disabled="saving"
								@click="rollbackRelease(r)"
							>回滚</button>
						</div>
						<div class="pw-release-notes">{{ r.notes || '无更新说明' }}</div>
					</div>
				</div>
			</div>
		</template>

		<template #footer>
			<button type="button" class="pw-btn ghost" :disabled="loading" @click="loadCheck">
				{{ loading ? '检查中…' : '重新检查' }}
			</button>
			<span class="pw-footer-spacer"></span>
			<button type="button" class="pw-btn" :disabled="saving" @click="visible = false">关闭</button>
			<button
				v-if="check && check.is_public"
				type="button"
				class="pw-btn danger"
				:disabled="saving"
				@click="unpublish"
			>{{ saving ? '处理中…' : '取消公开' }}</button>
			<button
				v-else
				type="button"
				class="pw-btn primary"
				:disabled="saving || !check"
				@click="publish"
			>{{ saving ? '发布中…' : '发布作品' }}</button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
	import { computed, ref } from 'vue'
	import { ElMessage, ElMessageBox } from 'element-plus'
	import { checkProjectPublish, updateProjectPublish } from '@/api/publish'
	import type { PublishCheck } from '@/api/publish'
	import { createProjectRelease, listProjectReleases, rollbackProjectRelease } from '@/api/release'
	import type { ProjectRelease } from '@/api/release'

	const props = defineProps<{
		projectId: string | number
		modelValue: boolean
	}>()

	const emit = defineEmits<{
		(e: 'update:modelValue', value: boolean): void
		(e: 'published', isPublic: boolean): void
		(e: 'rolledback'): void
	}>()

	const visible = computed({
		get: () => props.modelValue,
		set: (v: boolean) => emit('update:modelValue', v),
	})

	const check = ref<PublishCheck | null>(null)
	const loading = ref(false)
	const saving = ref(false)
	const releases = ref<ProjectRelease[]>([])
	const releasesLoading = ref(false)
	const releaseNotes = ref('')

	const shareLink = computed(() => {
		if (!check.value) return ''
		return window.location.origin + (check.value.share_path || `/view/${props.projectId}`)
	})

	const loadCheck = async () => {
		if (!props.projectId) return
		loading.value = true
		try {
			check.value = await checkProjectPublish(Number(props.projectId))
		} catch (e: any) {
			check.value = null
			ElMessage.error('发布检查失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			loading.value = false
		}
	}

	const loadReleases = async () => {
		if (!props.projectId) return
		releasesLoading.value = true
		try {
			releases.value = await listProjectReleases(Number(props.projectId))
		} catch {
			releases.value = []
		} finally {
			releasesLoading.value = false
		}
	}

	const onOpen = () => {
		loadCheck()
		loadReleases()
	}

	const recordRelease = async (notes: string) => {
		const release = await createProjectRelease(Number(props.projectId), notes)
		releaseNotes.value = ''
		await loadReleases()
		return release
	}

	const formatReleaseTime = (iso: string | null) => {
		if (!iso) return ''
		try {
			return new Date(iso).toLocaleString()
		} catch {
			return iso
		}
	}

	const publishNewVersion = async () => {
		if (!check.value) return
		const warn = check.value.ready
			? ''
			: `当前还有 ${check.value.error_count} 个错误，发布后玩家可能遇到问题。`
		try {
			await ElMessageBox.confirm(
				`${warn}将保存当前剧本快照并作为新版本发布，是否继续？`,
				'发布新版本',
				{ type: 'warning', confirmButtonText: '发布', cancelButtonText: '取消' }
			)
		} catch {
			return
		}
		saving.value = true
		try {
			const release = await recordRelease(releaseNotes.value)
			check.value.is_public = true
			emit('published', true)
			ElMessage.success(`已发布 v${release.release_no}`)
		} catch (e: any) {
			ElMessage.error('发布失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			saving.value = false
		}
	}

	const rollbackRelease = async (release: ProjectRelease) => {
		try {
			await ElMessageBox.confirm(
				`回滚会用 v${release.release_no} 的剧本快照覆盖当前剧本（${release.stats.scene_count} 场景 / ${release.stats.content_count} 节点），回滚前会自动备份当前版本。是否继续？`,
				'回滚版本',
				{ type: 'warning', confirmButtonText: '回滚', cancelButtonText: '取消' }
			)
		} catch {
			return
		}
		saving.value = true
		try {
			await rollbackProjectRelease(Number(props.projectId), release.release_id)
			ElMessage.success(`已回滚到 v${release.release_no}`)
			emit('rolledback')
			await Promise.all([loadCheck(), loadReleases()])
		} catch (e: any) {
			ElMessage.error('回滚失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			saving.value = false
		}
	}

	const publish = async () => {
		if (!check.value) return
		let force = false
		if (!check.value.ready) {
			try {
				await ElMessageBox.confirm(
					`还有 ${check.value.error_count} 个错误（可能是缺失素材或剧情断点）。强制发布后玩家仍可能遇到问题，是否继续？`,
					'强制发布',
					{ type: 'warning', confirmButtonText: '仍然发布', cancelButtonText: '返回修复' }
				)
			} catch {
				return
			}
			force = true
		}
		saving.value = true
		try {
			const res = await updateProjectPublish(Number(props.projectId), true, force)
			if (res.check) check.value = res.check
			else check.value.is_public = true
			emit('published', true)
			ElMessage.success('发布成功，分享链接已生成')
			try {
				await recordRelease(releaseNotes.value)
			} catch {
				ElMessage.warning('作品已发布，但发布记录保存失败')
			}
		} catch (e: any) {
			const data = e?.response?.data
			if (e?.response?.status === 409 && data?.data) {
				check.value = data.data
				ElMessage.warning(data.message || '请先修复发布检查中的错误')
			} else {
				ElMessage.error('发布失败：' + (data?.message || e?.message || '未知错误'))
			}
		} finally {
			saving.value = false
		}
	}

	const unpublish = async () => {
		try {
			await ElMessageBox.confirm('取消公开后，分享链接将无法访问，作品会从广场下架。', '取消公开', {
				type: 'warning',
				confirmButtonText: '取消公开',
				cancelButtonText: '保持发布',
			})
		} catch {
			return
		}
		saving.value = true
		try {
			await updateProjectPublish(Number(props.projectId), false)
			if (check.value) check.value.is_public = false
			emit('published', false)
			ElMessage.success('已取消公开')
		} catch (e: any) {
			ElMessage.error('操作失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
		} finally {
			saving.value = false
		}
	}

	const selectLink = (e: Event) => {
		(e.target as HTMLInputElement).select()
	}

	const copyLink = async () => {
		const link = shareLink.value
		if (!link) return
		try {
			await navigator.clipboard.writeText(link)
			ElMessage.success('链接已复制')
		} catch {
			const input = document.createElement('input')
			input.value = link
			document.body.appendChild(input)
			input.select()
			document.execCommand('copy')
			document.body.removeChild(input)
			ElMessage.success('链接已复制')
		}
	}

	const openLink = () => {
		if (shareLink.value) window.open(shareLink.value, '_blank')
	}
</script>

<style scoped lang="scss" src="./publishWizard.scss"></style>
