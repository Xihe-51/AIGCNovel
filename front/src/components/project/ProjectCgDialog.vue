<template>
	<el-dialog
		v-model="visibleModel"
		:title="editingId ? '编辑 CG' : '添加 CG'"
		width="520px"
		class="custom-dialog"
	>
		<el-form label-position="top">
			<el-form-item label="标题" required>
				<el-input v-model="form.title" placeholder="如：雨中告白" />
			</el-form-item>
			<el-form-item label="CG 图片" required>
				<div class="cg-image-picker">
					<img v-if="form.image_url" :src="BASE_URL + form.image_url" class="cg-thumb-lg" alt="CG 预览" />
					<div v-else class="cg-thumb-lg cg-thumb-empty">未选择图片</div>
					<div class="cg-image-actions">
						<label class="action-btn cg-upload-btn" :class="{ 'is-busy': uploading }">
							{{ uploading ? '上传中…' : '上传本地图片' }}
							<input
								type="file"
								accept="image/*"
								class="cg-file-input"
								:disabled="uploading"
								@change="onFileChange"
							/>
						</label>
						<button type="button" class="action-btn" @click="openMarket">从市场选 CG</button>
					</div>
				</div>
			</el-form-item>
			<el-form-item label="说明">
				<el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选，鉴赏页展示的文字" />
			</el-form-item>
			<el-form-item label="解锁条件">
				<el-select v-model="form.unlock_ending_id" clearable style="width: 100%" placeholder="初始可见（无需解锁）">
					<el-option v-for="e in endings" :key="e.ending_id" :label="e.title" :value="e.ending_id" />
				</el-select>
			</el-form-item>
		</el-form>
		<template #footer>
			<button class="dialog-btn cancel" @click="visibleModel = false">取消</button>
			<button class="dialog-btn confirm" @click="submit" :disabled="saving">保存</button>
		</template>

		<!-- 从市场选 CG 素材 -->
		<el-dialog v-model="marketVisible" title="选择市场 CG 素材" width="480px" class="custom-dialog" append-to-body>
			<el-select v-model="marketSelected" filterable placeholder="搜索「CG」类型素材" style="width: 100%" :loading="marketLoading">
				<el-option
					v-for="r in marketOptions"
					:key="r.resource_id"
					:label="`${r.title}（${r.username || '匿名'}）`"
					:value="r.resource_id"
				/>
			</el-select>
			<p class="variables-tip" style="margin-top: 10px">
				选择后会引用该素材（计入素材引用数），并自动带出图片地址。
			</p>
			<div v-if="!marketLoading && !marketOptions.length" class="variables-empty">
				市场上还没有「CG」类型素材。
			</div>
			<template #footer>
				<button class="dialog-btn cancel" @click="marketVisible = false">取消</button>
				<button class="dialog-btn confirm" @click="applyMarket" :disabled="!marketSelected">确定</button>
			</template>
		</el-dialog>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { uploadSceneFile } from '@/api/scenes'
import { searchResources, getResourceDetail } from '@/api/market'
import { BASE_URL } from '@/utils/request'
import { extractErrorMessage } from '@/utils/errorMessage'
import type { CGPayload, ProjectCG } from '@/api/cg'
import type { Ending } from '@/api/ending'

const props = defineProps<{
	visible: boolean
	saving: boolean
	editingId: number | null
	initial: ProjectCG | null
	projectId: number
	endings: Ending[]
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'save', payload: { cgId: number | null; payload: CGPayload }): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

interface CgForm {
	title: string
	description: string
	image_url: string
	resource_id: number | null
	unlock_ending_id: number | null
}

const emptyForm = (): CgForm => ({
	title: '',
	description: '',
	image_url: '',
	resource_id: null,
	unlock_ending_id: null,
})

const form = ref<CgForm>(emptyForm())
const uploading = ref(false)

// 市场素材选择
const marketVisible = ref(false)
const marketLoading = ref(false)
const marketOptions = ref<any[]>([])
const marketSelected = ref<number | null>(null)

watch(
	() => props.visible,
	(open: boolean) => {
		if (!open) return
		const row = props.initial
		form.value = row
			? {
				title: row.title || '',
				description: row.description || '',
				image_url: row.image_url || '',
				resource_id: row.resource_id ?? null,
				unlock_ending_id: row.unlock_ending_id ?? null
			}
			: emptyForm()
	}
)

const onFileChange = async (event: Event) => {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (!file) return
	uploading.value = true
	try {
		const formData = new FormData()
		formData.append('file', file)
		formData.append('project_id', String(props.projectId))
		formData.append('file_type', 'image')
		const res: any = await uploadSceneFile(formData)
		const url = res?.data?.url
		if (!res?.success || !url) throw new Error(res?.error || '上传失败')
		form.value.image_url = url
		form.value.resource_id = null
		ElMessage.success('图片已上传')
	} catch (e: any) {
		ElMessage.error(e?.message || '图片上传失败')
	} finally {
		uploading.value = false
	}
}

const openMarket = async () => {
	marketSelected.value = null
	marketVisible.value = true
	marketLoading.value = true
	try {
		const res: any = await searchResources({ type: 'CG', page: 1, per_page: 50 } as any)
		marketOptions.value = res?.data?.data?.resources || []
	} catch (e) {
		marketOptions.value = []
	} finally {
		marketLoading.value = false
	}
}

const applyMarket = async () => {
	if (!marketSelected.value) return
	try {
		const res: any = await getResourceDetail(marketSelected.value)
		const resource = res?.data?.data
		if (!resource?.file_url) throw new Error('素材缺少图片地址')
		form.value.image_url = resource.file_url
		form.value.resource_id = resource.resource_id
		if (!form.value.title) form.value.title = resource.title || ''
		marketVisible.value = false
		ElMessage.success(`已选择素材「${resource.title}」`)
	} catch (e: any) {
		ElMessage.error(extractErrorMessage(e, '读取素材失败'))
	}
}

const submit = () => {
	const title = String(form.value.title || '').trim()
	if (!title) {
		ElMessage.warning('请填写 CG 标题')
		return
	}
	if (!form.value.image_url && !form.value.resource_id) {
		ElMessage.warning('请上传 CG 图片或选择市场素材')
		return
	}
	emit('save', {
		cgId: props.editingId,
		payload: {
			title,
			description: String(form.value.description || '').trim(),
			image_url: form.value.image_url,
			resource_id: form.value.resource_id,
			unlock_ending_id: form.value.unlock_ending_id
		}
	})
}
</script>

<style src="./projectDialog.css"></style>
