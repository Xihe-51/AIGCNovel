<template>
	<div v-if="isEnter">
		<!-- 操作区 -->
		<div class="header">
			<el-button type="danger" @click="backBtn" :disabled="loading">
				返回
			</el-button>
		</div>
		<div>
			<SceneEdit :sceneId="sceneId" :projectId="projectId"/>
		</div>
	</div>
	<div v-if="!isEnter" class="scene-management">
		<!-- 操作区 -->
		<div class="header" v-if="scenes.length > 0">
			<button class="add-btn" @click="handleAddScene" :disabled="loading">
				<el-icon>
					<Plus />
				</el-icon>
				添加场景
			</button>
			<button class="preview-btn" @click="previewProject(projectId)" :disabled="loading">
				<el-icon><View /></el-icon>
				预览场景
			</button>
			<button class="export-btn" @click="exportProject(projectId)" :disabled="loading">
				<el-icon><UploadFilled /></el-icon>
				公开项目
			</button>
		</div>

		<!-- 加载状态 -->
		<div v-if="loading" class="loading">
			<div class="spinner"></div>
			<p>加载中...</p>
		</div>

		<!-- 错误提示 -->
		<div v-if="error" class="error-message">
			<i class="icon-error"></i> {{ error }}
		</div>

		<!-- 场景列表 - 支持拖拽排序 -->
		<div v-else-if="scenes.length > 0" class="scene-list">
			<div class="scene-item header-row">
				<div class="scene-field scene-order">序号</div>
				<div class="scene-field scene-title">标题</div>
				<div class="scene-field scene-description">描述</div>
				<div class="scene-field scene-background">背景图片</div>
				<div class="scene-field scene-music">背景音乐</div>
				<div class="scene-field scene-created">创建时间</div>
				<div class="scene-field scene-actions">操作</div>
			</div>

			<!-- 可拖拽的场景项 -->
			<div v-for="scene in sortedScenes" :key="scene.scene_id" class="scene-item" draggable="true"
				@dragstart="handleDragStart(scene)" @dragover.prevent="handleDragOver($event, scene)"
				@drop.prevent="handleDrop(scene)"
				:class="{ 'dragging': draggingScene?.scene_id === scene.scene_id, 'drag-over': isDraggingOverSceneId === scene.scene_id }">
				<div class="scene-field scene-order">{{ scene.order_num }}</div>
				<div class="scene-field scene-title">{{ scene.title }}</div>
				<div class="scene-field scene-description">{{ scene.description || '-' }}</div>
				<div class="scene-field scene-background">
					<span v-if="scene.background_url">✔</span>
					<span v-else>❌</span>
				</div>
				<div class="scene-field scene-music">
					<span v-if="scene.music_url">✔</span>
					<span v-else>❌</span>
				</div>
				<div class="scene-field scene-created">
					{{ formatTime(scene.created_at) }}
				</div>
				<div class="scene-field scene-actions">
					<el-button type="primary" @click="enterEditScene(scene)">
						编辑
					</el-button>
					<el-button type="danger" class="action-btn delete-btn" @click="handleDeleteScene(scene.scene_id)">
						删除
					</el-button>
				</div>
			</div>
		</div>

		<!-- 空状态 -->
		<div v-else class="empty-state">
			<i class="icon-empty"></i>
			<p>暂无场景数据</p>
			<button class="add-first-btn" @click="handleAddScene" :disabled="loading">
				添加第一个场景
			</button>
		</div>

		<!-- 场景表单弹窗 - 仅保留创建场景功能 -->
		<div v-if="showSceneForm" class="modal-backdrop">
			<div class="modal">
				<div class="modal-header">
					<h3>添加场景</h3>
					<button class="close-btn" @click="showSceneForm = false">
						<i class="icon-close"></i>
					</button>
				</div>

				<form class="scene-form" @submit.prevent="handleFormSubmit">
					<div class="form-group">
						<label for="title">场景标题 <span class="required">*</span></label>
						<input type="text" id="title" v-model="formData.title" required placeholder="请输入场景标题">
					</div>

					<div class="form-group">
						<label for="description">场景描述</label>
						<textarea id="description" v-model="formData.description" placeholder="请输入场景描述"
							rows="3"></textarea>
					</div>

					<div class="form-group">
						<label for="order_num">排序号 <span class="required">*</span></label>
						<input type="number" id="order_num" v-model="formData.order_num" required min="1"
							placeholder="请输入排序号">
					</div>

					<!-- 背景图片上传区域 -->
					<div class="form-group">
						<label for="background_url">背景图片</label>
						<div class="file-upload-container">
							<label for="background_url" class="custom-file-upload image-upload">
								<i class="icon-image"></i>
								<span v-if="!formData.background_url">点击上传图片</span>
								<span v-else class="file-selected">已选择:
									{{ getFileName(formData.background_url) }}</span>
							</label>
							<input type="file" id="background_url" accept="image/*" @change="handleBackgroundUpload"
								class="hidden-input">
						</div>
						<div v-if="formData.background_url" class="preview-container">
							<img :src="formData.background_url" :alt="`${formData.title || '场景'}的背景图`"
								class="preview-image">
							<button type="button" class="remove-image" @click="handleRemoveBackground">
								X
							</button>
						</div>
						<p class="file-format-hint">支持的格式: jpg, jpeg, png, gif, webp</p>
					</div>

					<!-- 音乐上传区域 -->
					<div class="form-group">
						<label for="music_url">背景音乐</label>
						<div class="file-upload-container">
							<label for="music_url" class="custom-file-upload audio-upload">
								<i class="icon-music"></i>
								<span v-if="!formData.music_url">点击上传音乐</span>
								<span v-else class="file-selected">已选择: {{ getFileName(formData.music_url) }}</span>
							</label>
							<input type="file" id="music_url" accept="audio/*" @change="handleMusicUpload"
								class="hidden-input">
						</div>
						<div v-if="formData.music_url" class="audio-info">
							<i class="icon-music"></i>
							<span>{{ getFileName(formData.music_url) }}</span>
							<button type="button" class="remove-image" @click="handleRemoveMusic">
								X
							</button>
						</div>
						<p class="file-format-hint">支持的格式: mp3, wav, ogg</p>
					</div>

					<div class="form-actions">
						<button type="button" class="cancel-btn" @click="showSceneForm = false">
							取消
						</button>
						<button type="submit" class="submit-btn" :disabled="formLoading">
							{{ formLoading ? '处理中...' : '创建' }}
						</button>
					</div>
				</form>
			</div>
		</div>

		<!-- 确认删除弹窗 -->
		<div v-if="showDeleteConfirm" class="modal-backdrop">
			<div class="modal confirm-modal">
				<div class="modal-header">
					<h3>场景删除</h3>
					<button class="close-btn" @click="showDeleteConfirm = false">
						<i class="icon-close"></i>
					</button>
				</div>

				<div class="confirm-content">
					<p>您确定要删除这个场景吗？此操作不可撤销。</p>
				</div>

				<div class="form-actions">
					<button type="button" class="cancel-btn" @click="showDeleteConfirm = false">
						取消
					</button>
					<button type="button" class="delete-confirm-btn" @click="confirmDelete" :disabled="deleteLoading">
						{{ deleteLoading ? '删除中...' : '确认删除' }}
					</button>
				</div>
			</div>
		</div>

		<!-- 拖拽提示 -->
		<div v-if="isDragging" class="drag-hint">
			拖拽调整场景顺序
		</div>
	</div>
</template>

<script setup lang="ts">
	import {
		defineProps,
		ref,
		onMounted,
		computed,
		h
	} from 'vue'
	import { useRouter } from 'vue-router'
	import {
		getScenes,
		createScene,
		updateScene,
		deleteScene,
		uploadSceneFile
	} from '@/api/scenes'
	import type { Scene } from '@/api/scenes'
	import {
		publicExportProject
	} from '@/api/project'
	import {
		formatTime
	} from '@/utils/date'
	import {
		BASE_URL
	} from '@/utils/request'
	import {
		ElMessage, ElMessageBox
	} from 'element-plus'
	import SceneEdit from '@/components/SceneEdit.vue'
	const router = useRouter()
	// 定义接收的属性
	const props = defineProps({
		projectId: {
			type: String,
			required: true
		}
	})
	const isEnter = ref(false)
	const sceneId = ref('')
	// 定义ref存储场景数据
	const scenes = ref<Scene[]>([])
	const loading = ref(false)
	// 拖拽相关状态
	const draggingScene = ref<Scene | null>(null)
	const isDraggingOverSceneId = ref<number | null>(null)
	const isDragging = ref(false)
	const dragTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
	
	// 表单相关状态
	const isEditing = ref(false)

	// 删除相关状态
	const showDeleteConfirm = ref(false)
	const deleteLoading = ref(false)
	const sceneToDelete = ref<number | null>(null)

	// 计算属性：按order_num从小到大排序场景
	const sortedScenes = computed(() => {
		return [...scenes.value].sort((a, b) => a.order_num - b.order_num)
	})

	// 根据projectId获取所有场景数据
	const fetchScenes = async () => {
		// 验证projectId是否存在
		if (!props.projectId) {
			error.value = '缺少项目ID，无法获取场景数据'
			return
		}

		try {
			loading.value = true
			error.value = null
			// 转换projectId类型并请求数据
			const sceneData = await getScenes(Number(props.projectId))
			scenes.value = sceneData
			return sceneData
		} catch (err) {
			console.error('获取场景数据失败:', err)
			error.value = '获取场景数据失败，请稍后重试'
			scenes.value = []
			throw err
		} finally {
			loading.value = false
		}
	}
	
	// 处理添加场景
	const handleAddScene = () => {
		// 预设排序号为当前最大序号+1
		const maxOrder = scenes.value.length > 0 ?
			Math.max(...scenes.value.map(s => s.order_num)) :
			0

		formData.value = {
			project_id: Number(props.projectId),
			title: '',
			description: '',
			background_url: '',
			music_url: '',
			order_num: maxOrder + 1,
			background_file: null,
			music_file: null
		}
		isEditing.value = false
		showSceneForm.value = true
	}
	// 定义 emits
	const emit = defineEmits(['close', 'sceneCreated'])

	// 表单相关状态
	const showSceneForm = ref(false)
	const formLoading = ref(false)
	const error = ref<string | null>(null)
	const formData = ref({
		project_id: 0,
		title: '',
		description: '',
		background_url: '',
		music_url: '',
		order_num: 1,
		// 存储文件对象用于上传
		background_file: null as File | null,
		music_file: null as File | null
	})

	// 初始化表单数据
	const initForm = (projectId: number, defaultOrder?: number) => {
		formData.value = {
			project_id: projectId,
			title: '',
			description: '',
			background_url: '',
			music_url: '',
			order_num: defaultOrder || 1,
			background_file: null,
			music_file: null
		}
		showSceneForm.value = true
		error.value = null
	}
	const backBtn = () => {
		fetchScenes()
		isEnter.value=false
		sceneId.value=''
	}
	// 获取文件名（从URL或文件路径中提取）
	const getFileName = (path?: string) => {
		if (!path) return ''
		// 处理URL情况
		if (path.includes('blob:')) {
			return formData.value.background_file?.name || formData.value.music_file?.name || '未知文件'
		}
		// 处理普通路径
		return path.split('/').pop()
	}

	// 处理背景图片上传
	const handleBackgroundUpload = async (e: any) => {
		const file = e.target.files[0]
		if (file) {
			try {
				// 预览图片
				formData.value.background_url = URL.createObjectURL(file)
				formData.value.background_file = file
			} catch (err) {
				console.error('处理背景图片失败:', err)
				error.value = '处理背景图片失败，请重试'
			}
		}
	}

	// 移除背景图片
	const handleRemoveBackground = () => {
		if (formData.value.background_url.startsWith('blob:')) {
			URL.revokeObjectURL(formData.value.background_url)
		}
		formData.value.background_url = ''
		formData.value.background_file = null
		// 重置文件输入
		const bgInput = document.getElementById('background_url') as HTMLInputElement | null
		if (bgInput) bgInput.value = ''
	}

	// 处理音乐上传
	const handleMusicUpload = async (e: any) => {
		const file = e.target.files[0]
		if (file) {
			try {
				formData.value.music_url = file.name
				formData.value.music_file = file
			} catch (err) {
				console.error('处理音乐文件失败:', err)
				error.value = '处理音乐文件失败，请重试'
			}
		}
	}

	// 移除音乐文件
	const handleRemoveMusic = () => {
		formData.value.music_url = ''
		formData.value.music_file = null
		// 重置文件输入
		const musicInput = document.getElementById('music_url') as HTMLInputElement | null
		if (musicInput) musicInput.value = ''
	}

	// 处理表单提交
	const handleFormSubmit = async () => {
		try {
			formLoading.value = true
			error.value = null

			// 存储上传后的文件路径
			let backgroundUrl = ''
			let musicUrl = ''

			// 上传背景图片
			console.log(formData.value.background_file)
			if (formData.value.background_file) {
				const formData1 = new FormData()
				formData1.append('file', formData.value.background_file)
				formData1.append('project_id', String(formData.value.project_id))
				formData1.append('file_type', 'image')

				const uploadResult = await uploadSceneFile(formData1)
				// console.log(uploadResult)
				backgroundUrl = uploadResult.data.url
			}

			// 上传音乐文件（如果有）
			if (formData.value.music_file) {
				const formData2 = new FormData()
				formData2.append('file', formData.value.music_file)
				formData2.append('project_id', String(formData.value.project_id))
				formData2.append('file_type', 'audio')

				const uploadResult = await uploadSceneFile(formData2)
				// console.log(uploadResult)
				musicUrl = uploadResult.data.url
			}

			// 创建场景数据
			const sceneData = {
				project_id: formData.value.project_id,
				title: formData.value.title,
				description: formData.value.description,
				order_num: formData.value.order_num,
				background_url: backgroundUrl,
				music_url: musicUrl
			}
			console.log(sceneData)
			// 创建新场景
			await createScene(sceneData)
			await fetchScenes()
			// 关闭表单并通知父组件刷新列表
			showSceneForm.value = false
			emit('sceneCreated')

			// 清理对象URL，释放内存
			if (formData.value.background_url.startsWith('blob:')) {
				URL.revokeObjectURL(formData.value.background_url)
			}
		} catch (err) {
			console.error('创建场景失败:', err)
			ElMessage({
				message: '创建失败',
				type: 'error',
			});
		} finally {
			formLoading.value = false
		}
	}

	// 处理删除场景
	const handleDeleteScene = (sceneId: number) => {
		sceneToDelete.value = sceneId
		showDeleteConfirm.value = true
	}

	// 进入单独场景编辑
	const enterEditScene = (scene: Scene) => {
		sceneId.value = String(scene.scene_id)
		isEnter.value = true
	}

	// 确认删除
	const confirmDelete = async () => {
		if (!sceneToDelete.value) return

		try {
			deleteLoading.value = true
			error.value = null

			await deleteScene(sceneToDelete.value)

			// 关闭确认框并刷新列表
			showDeleteConfirm.value = false
			await fetchScenes()
		} catch (err) {
			console.error('删除场景失败:', err)
			error.value = '删除场景失败，请稍后重试'
		} finally {
			deleteLoading.value = false
			sceneToDelete.value = null
		}
	}

	// 拖拽相关方法
	const handleDragStart = (scene: Scene) => {
		draggingScene.value = scene
		isDragging.value = true

		// 添加延迟显示拖拽提示，避免快速划过误触发
		dragTimeout.value = setTimeout(() => {
			if (isDragging.value) {
				document.body.classList.add('dragging-active')
			}
		}, 300)
	}

	const handleDragOver = (event: DragEvent, targetScene: Scene) => {
		// 避免自己拖到自己的位置
		if (draggingScene.value?.scene_id !== targetScene.scene_id) {
			isDraggingOverSceneId.value = targetScene.scene_id
		}
	}

	const handleDrop = async (targetScene: Scene) => {
		// 清除拖拽状态
		if (dragTimeout.value) clearTimeout(dragTimeout.value)
		document.body.classList.remove('dragging-active')
		isDragging.value = false
		isDraggingOverSceneId.value = null

		const dragging = draggingScene.value
		if (!dragging || dragging.scene_id === targetScene.scene_id) {
			draggingScene.value = null
			return
		}

		try {
			// 获取当前排序后的场景列表
			const currentScenes = sortedScenes.value
			// 找到拖动项和目标项的索引
			const dragIndex = currentScenes.findIndex(s => s.scene_id === dragging.scene_id)
			const targetIndex = currentScenes.findIndex(s => s.scene_id === targetScene.scene_id)

			// 创建新的场景列表副本
			const newScenes = [...currentScenes]
			// 移除拖动项
			const [movedScene] = newScenes.splice(dragIndex, 1)
			// 插入到目标位置
			newScenes.splice(targetIndex, 0, movedScene)

			// 更新序号
			const updatedScenes: Scene[] = newScenes.map((scene, index) => ({
				...scene,
				order_num: index + 1
			}))

			// 先更新本地状态，提升用户体验
			scenes.value = updatedScenes

			// 批量更新后端的序号：只提交 order_num，避免把本地可能过期的
			// background_url / music_url 一并回写（后端已改为局部更新，这里再收窄一次）
			const updatePromises = updatedScenes.map(scene =>
				updateScene(scene.scene_id, { order_num: scene.order_num })
			)

			await Promise.all(updatePromises)

			// 重新获取最新数据
			await fetchScenes()
		} catch (err) {
			console.error('调整场景顺序失败:', err)
			error.value = '调整场景顺序失败，请重试'
			// 失败时重新获取数据恢复状态
			await fetchScenes()
		} finally {
			draggingScene.value = null
		}
	}

	// 监听拖拽结束事件（如果元素被拖到容器外）
	document.addEventListener('dragend', () => {
		if (dragTimeout.value) clearTimeout(dragTimeout.value)
		document.body.classList.remove('dragging-active')
		isDragging.value = false
		isDraggingOverSceneId.value = null
		draggingScene.value = null
	})
	// 处理预览场景
	const previewProject = (projectId: number | string) => {
		router.push(`/view/${projectId}`)
	}
	const exportProject = (projectId: number | string) => {
		ElMessageBox({
		    title: '确认公开',
		    message: h('p', null, [
		      h('span', null, '项目公开后所有人可游玩')
		    ]),
		    showCancelButton: true,
		    confirmButtonText: '确定',
		    cancelButtonText: '取消',
		  }).then((action) => {
			publicExportProject(Number(projectId))
		    ElMessage({
		      type: 'success',
		      message: `感谢您的创作`,
		    })
		  })
	}
	// 在组件挂载后获取场景数据
	onMounted(async () => {
		await fetchScenes()
	})
</script>

<style scoped>
	.scene-management {
		padding: 20px;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(255, 230, 238, 1.0);
	}

	.header {
		display: flex;
		align-items: center;
		gap: 20px;
		margin-bottom: 20px;
		padding-bottom: 10px;
		border-bottom: 1px solid #e0e0e0;
	}

	.add-btn,
	.add-first-btn {
		background-color: #409eff;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		transition: background-color 0.3s;
	}

	.add-btn:hover,
	.add-first-btn:hover {
		background-color: #45d2f9;
	}

	.add-btn:disabled {
		background-color: #45d2f9;
		cursor: not-allowed;
	}
	.preview-btn,
	.preview-first-btn {
		background-color: #ffaa00;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		transition: background-color 0.3s;
	}
	
	.preview-btn:hover,
	.preview-first-btn:hover {
		background-color: #ffdd55;
	}
	
	.preview-btn:disabled {
		background-color: #45d2f9;
		cursor: not-allowed;
	}
	
	.export-btn,
	.export-first-btn {
		background-color: #00ca00;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		transition: background-color 0.3s;
	}
	
	.export-btn:hover,
	.export-first-btn:hover {
		background-color: #00ff00;
	}
	
	.export-btn:disabled {
		background-color: #45d2f9;
		cursor: not-allowed;
	}
	
	.loading {
		text-align: center;
		padding: 40px 0;
	}

	.spinner {
		width: 40px;
		height: 40px;
		margin: 0 auto;
		border: 4px solid #f3f3f3;
		border-top: 4px solid #42b983;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}

		100% {
			transform: rotate(360deg);
		}
	}

	.error-message {
		background-color: #ffebee;
		color: #b71c1c;
		padding: 12px 16px;
		border-radius: 4px;
		margin-bottom: 20px;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.scene-list {
		border-radius: 4px;
		overflow: hidden;
		box-shadow: 0 1px 3px rgba(255, 230, 238, 1.0);
	}

	.scene-item {
		display: flex;
		background-color: white;
		border-bottom: 1px solid #e0e0e0;
		transition: all 0.2s ease;
	}

	.scene-item:last-child {
		border-bottom: none;
	}

	.header-row {
		font-weight: bold;
	}
	
	.scene-field {
		padding: 10px;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	
	.scene-title {
		flex: 1;
		text-align: center;
	}
	
	.scene-order {
		flex: 0.5;
		text-align: center;
	}

	.scene-background {
		flex: 1;
		text-align: center;
	}
	
	.scene-description {
		flex: 1;
	}

	.scene-music {
		flex: 1;
		text-align: center;
	}

	.scene-created {
		flex: 1;
		text-align: center;
	}

	.scene-actions {
		flex: 1.5;
		display: flex;
		gap: 8px;
		justify-content: center;
	}

	.bg-thumbnail {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 4px;
	}

	.empty-state {
		text-align: center;
		padding: 60px 20px;
		color: #757575;
	}

	.empty-state i {
		font-size: 48px;
		margin-bottom: 16px;
		color: #bdbdbd;
	}

	.add-first-btn {
		margin-top: 16px;
	}

	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}

	.modal {
		background-color: white;
		border-radius: 8px;
		width: 90%;
		max-width: 600px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
	}

	.confirm-modal {
		max-width: 400px;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 20px;
		border-bottom: 1px solid #e0e0e0;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 18px;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 20px;
		cursor: pointer;
		color: #757575;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: #000;
	}

	.scene-form {
		padding: 20px;
	}

	.form-group {
		margin-bottom: 16px;
	}

	.form-group label {
		display: block;
		margin-bottom: 6px;
		font-weight: 500;
	}

	.required {
		color: #b71c1c;
	}

	.form-group input,
	.form-group textarea {
		width: 100%;
		padding: 8px 12px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 14px;
	}

	.form-group textarea {
		resize: vertical;
	}

	.preview-container {
		margin-top: 8px;
		position: relative;
		display: inline-block;
	}

	.preview-image {
		max-width: 200px;
		max-height: 150px;
		border-radius: 4px;
		border: 1px solid #eee;
	}

	.audio-info {
		margin-top: 8px;
		padding: 8px;
		background-color: #f5f5f5;
		border-radius: 4px;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.remove-image,
	.remove-audio {
		position: absolute;
		top: -8px;
		right: -8px;
		background-color: #b71c1c;
		color: white;
		border: none;
		border-radius: 50%;
		width: 20px;
		height: 20px;
		display: flex;
		justify-content: center;
		align-items: center;
		cursor: pointer;
		font-size: 12px;
	}

	.remove-audio {
		position: static;
		margin-left: auto;
		width: 24px;
		height: 24px;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		margin: 12px;
	}

	.cancel-btn {
		background-color: #f5f5f5;
		color: #757575;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.cancel-btn:hover {
		background-color: #e0e0e0;
	}

	.submit-btn {
		background-color: #42b983;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.submit-btn:hover {
		background-color: #359e75;
	}

	.submit-btn:disabled {
		background-color: #a0d9b9;
		cursor: not-allowed;
	}

	.delete-confirm-btn {
		background-color: #ff0000;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.delete-confirm-btn:hover {
		background-color: #d32f2f;
	}

	.delete-confirm-btn:disabled {
		background-color: #e57373;
		cursor: not-allowed;
	}

	.confirm-content {
		padding: 20px;
	}

	.confirm-content p {
		margin: 0;
		line-height: 1.6;
	}

	/* 拖拽相关样式 */
	.scene-item[draggable="true"] {
		cursor: grab;
		user-select: none;
	}

	.scene-item[draggable="true"]:active {
		cursor: grabbing;
	}

	.scene-item.dragging {
		opacity: 0.6;
		transform: scale(1.02);
		background-color: #f0f7ff;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.scene-item.drag-over {
		border-top: 2px solid #42b983;
		background-color: #f9fdf6;
	}

	.drag-hint {
		position: fixed;
		top: 20px;
		left: 50%;
		transform: translateX(-50%);
		background-color: #42b983;
		color: white;
		padding: 8px 16px;
		border-radius: 4px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		z-index: 1001;
		animation: fadeIn 0.3s;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translate(-50%, -10px);
		}

		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}

	/* 防止拖拽时选中文本 */
	.dragging-active {
		user-select: none;
		-webkit-user-drag: none;
	}

	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}

	.modal {
		background-color: white;
		border-radius: 8px;
		width: 90%;
		max-width: 600px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 20px;
		border-bottom: 1px solid #e0e0e0;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 18px;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 20px;
		cursor: pointer;
		color: #757575;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: #000;
	}

	.scene-form {
		padding: 20px;
	}

	.form-group {
		margin-bottom: 20px;
	}

	.form-group label {
		display: block;
		margin-bottom: 6px;
		font-weight: 500;
	}

	.required {
		color: #b71c1c;
	}

	.form-group input,
	.form-group textarea {
		width: 100%;
		padding: 8px 12px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 14px;
	}

	.form-group textarea {
		resize: vertical;
	}

	/* 美化的文件上传样式 */
	.file-upload-container {
		position: relative;
	}

	.hidden-input {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
		z-index: 2;
	}

	.custom-file-upload {
		display: inline-block;
		width: 100%;
		padding: 12px 16px;
		background-color: #f5f5f5;
		border: 2px dashed #ccc;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}

	.custom-file-upload:hover {
		background-color: #eee;
		border-color: #999;
	}

	.image-upload {
		border-color: #42a5f5;
	}

	.image-upload:hover {
		background-color: #e3f2fd;
	}

	.audio-upload {
		border-color: #66bb6a;
	}

	.audio-upload:hover {
		background-color: #e8f5e9;
	}

	.file-selected {
		color: #2e7d32;
		font-weight: 500;
	}

	.file-format-hint {
		margin: 6px 0 0 0;
		font-size: 12px;
		color: #666;
	}

	.preview-container {
		margin-top: 12px;
		position: relative;
		display: inline-block;
	}

	.preview-image {
		max-width: 200px;
		max-height: 150px;
		border-radius: 4px;
		border: 1px solid #eee;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.audio-info {
		margin-top: 12px;
		padding: 10px;
		background-color: #f5f5f5;
		border-radius: 4px;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}

	.remove-image,
	.remove-audio {
		position: absolute;
		top: -8px;
		right: -8px;
		background-color: #b71c1c;
		color: white;
		border: none;
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: flex;
		justify-content: center;
		align-items: center;
		cursor: pointer;
		font-size: 14px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		transition: background-color 0.2s;
	}

	.remove-image:hover,
	.remove-audio:hover {
		background-color: #d32f2f;
	}

	.remove-audio {
		position: static;
		margin-left: auto;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 24px;
	}

	.cancel-btn {
		background-color: #f5f5f5;
		color: #757575;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.cancel-btn:hover {
		background-color: #e0e0e0;
	}

	.submit-btn {
		background-color: #42b983;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.submit-btn:hover {
		background-color: #359e75;
	}

	.submit-btn:disabled {
		background-color: #a0d9b9;
		cursor: not-allowed;
	}
</style>