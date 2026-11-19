<template>
	<div v-if="guardState !== 'ok'" class="cv-guard">
		<span class="ui-spinner ui-spinner-lg"></span>
		<p>正在校验项目权限…</p>
	</div>
	<div v-else class="cv-root">
		<!-- 顶栏 -->
		<div class="cv-topbar">
			<div class="cv-side cv-side-left">
				<button class="cv-back" @click="goInfo">
					<el-icon :size="14"><ArrowLeft /></el-icon>
					<span>返回</span>
				</button>
				<span class="cv-divider"></span>
				<span class="cv-project" :title="project?.title">{{ project?.title || '加载中…' }}</span>
				<span class="cv-mode-pill">创作中</span>
			</div>

			<div class="cv-switch">
				<button
					:class="['cv-tab', { 'is-active': view === 'script' }]"
					@click="view = 'script'"
				>剧情</button>
				<button
						:class="['cv-tab', { 'is-active': view === 'graph' }]"
						@click="openGraphTab"
					>剧情图</button>
				<button
						:class="['cv-tab', { 'is-active': view === 'outline' }]"
						@click="view = 'outline'"
					>大纲</button>
			</div>

			<div class="cv-side cv-side-right">
				<button type="button" class="cv-debug" title="把小说或文本剧本编译成可玩草稿" @click="compilerVisible = true">
					导入小说
				</button>
				<button type="button" class="cv-publish-btn" title="发布前体检并生成分享链接" @click="publishVisible = true">
					发布
				</button>
				<button
					type="button"
					:class="['cv-debug', { 'is-active': debugPlay }]"
					title="试玩时打开调试面板"
					@click="debugPlay = !debugPlay"
				>调试</button>
				<button type="button" class="cv-debug" title="以玩家视角预览发布版（关闭调试与演出工具）" @click="openReleasePreview">
					发布预览
				</button>
				<button class="cv-play" @click="openPlayer">
					<el-icon :size="13"><VideoPlay /></el-icon>
					<span>试玩</span>
				</button>
			</div>
		</div>

		<!-- 三栏主体 -->
		<div class="cv-body">
			<aside class="cv-left">
				<SceneListPanel
						ref="scenePanel"
						:project-id="projectId"
						:active-scene-id="activeSceneId"
						@select="onSelectScene"
						@created="onSceneCreated"
						@deleted="onSceneDeleted"
						@locate="onLocateSearchResult"
						@data-changed="onDataChanged"
					/>
			</aside>

			<main class="cv-center">
				<div v-show="view === 'script'" class="cv-pane">
					<SceneEdit
						v-if="activeSceneId"
						:key="activeSceneId + '-' + scriptReloadKey"
						:scene-id="activeSceneId"
						:focus-content-id="focusContentId ?? undefined"
						:paused="view !== 'script'"
						@scene-updated="onSceneUpdated"
						@open-graph="onOpenGraph"
					/>
					<div v-else class="cv-empty">
						左侧选一个场景开始创作，或点「新建场景」
					</div>
				</div>

				<div v-show="view === 'graph'" class="cv-pane">
					<StoryGraphEditor
						v-if="projectId"
						:key="'graph-' + graphKey"
						:project-id="Number(projectId)"
						:focus-content-id="graphFocusContentId"
						@locate="onGraphLocate"
					/>
				</div>

				<div v-show="view === 'outline'" class="cv-pane">
					<OutlineView
						v-if="projectId"
						:project-id="projectId"
						:refresh-key="graphKey + scriptReloadKey"
						@select="onOutlineSelect"
					/>
				</div>
			</main>

			<aside class="cv-right">
				<CreateToolPanel :project-id="projectId" @locate="onLocateAsset" @restored="onProjectRestored" />
			</aside>
		</div>

		<!-- 窄屏：场景列表收进左侧抽屉 -->
		<button type="button" class="cv-scene-fab" @click="sceneDrawerVisible = true">
			<el-icon :size="16"><Files /></el-icon>
			<span>场景</span>
		</button>
		<el-drawer
			v-model="sceneDrawerVisible"
			title="场景列表"
			direction="ltr"
			size="260px"
			class="cv-scene-drawer"
			append-to-body
		>
			<SceneListPanel
				ref="mobileScenePanel"
				:project-id="projectId"
				:active-scene-id="activeSceneId"
				@select="onSelectScene"
				@created="onSceneCreated"
				@deleted="onSceneDeleted"
				@locate="onLocateSearchResult"
				@data-changed="onDataChanged"
			/>
		</el-drawer>

		<!-- 窄屏：工具面板收进抽屉 -->
		<button type="button" class="cv-tool-fab" @click="toolDrawerVisible = true">
			<el-icon :size="16"><Tools /></el-icon>
			<span>工具</span>
		</button>
		<el-drawer
			v-model="toolDrawerVisible"
			title="创作工具"
			direction="rtl"
			size="320px"
			class="cv-tool-drawer"
			append-to-body
			destroy-on-close
		>
			<CreateToolPanel :project-id="projectId" @locate="onLocateFromDrawer" @restored="onProjectRestored" />
		</el-drawer>

		<PublishWizard
				v-model="publishVisible"
				:project-id="projectId"
				@published="onPublished"
				@rolledback="onProjectRestored"
			/>

			<StoryCompilerDialog
				v-model="compilerVisible"
				:project-id="projectId"
				@applied="onCompilerApplied"
				@locate="onCompilerLocate"
			/>
	</div>
</template>

<script setup lang="ts">
	import { ref, onMounted } from 'vue'
	import { useRoute, useRouter } from 'vue-router'
	import { ElMessage } from 'element-plus'
	import { jwtDecode } from 'jwt-decode'
	import { Tools, Files } from '@element-plus/icons-vue'
	import { getProject } from '@/api/project'
	import type { Project } from '@/api/project'
	import SceneListPanel from '@/components/SceneListPanel.vue'
	import SceneEdit from '@/components/SceneEdit.vue'
	import StoryGraphEditor from '@/components/StoryGraphEditor.vue'
	import OutlineView from '@/components/OutlineView.vue'
	import PublishWizard from '@/components/PublishWizard.vue'
	import CreateToolPanel from '@/components/CreateToolPanel.vue'
	import StoryCompilerDialog from '@/components/StoryCompilerDialog.vue'

	const route = useRoute()
	const router = useRouter()

	const projectId = String(route.params.projectId || '')

	// 创作页只允许项目作者进入；非作者直接跳播放器/首页，避免半残页面
	const guardState = ref<'loading' | 'ok'>('loading')
	const currentUserId = (() => {
		try {
			const token = localStorage.getItem('token') || ''
			const decoded = token ? jwtDecode<{ identity?: string }>(token) : null
			return decoded?.identity ? String(decoded.identity) : ''
		} catch (e) {
			return ''
		}
	})()

	const project = ref<Project | null>(null)
	const activeSceneId = ref<string>('')
	const view = ref<'script' | 'graph' | 'outline'>('script')
	// 试玩时是否带调试面板
	const debugPlay = ref(false)
	// 发布向导
	const publishVisible = ref(false)
	// 小说导入编译器
	const compilerVisible = ref(false)
	// 全项目搜索命中的节点，传给 SceneEdit 定位并滚动
	const focusContentId = ref<number | null>(null)
	// 从脚本跳剧情图时高亮的节点
	const graphFocusContentId = ref<number | null>(null)
	// 窄屏工具抽屉
	const toolDrawerVisible = ref(false)
	// 窄屏场景抽屉
	const sceneDrawerVisible = ref(false)
	// 新建场景后递增，强制剧情图重新挂载取新拓扑
	const graphKey = ref(0)
	// 按项目替换/版本恢复后递增，强制脚本区重新拉取内容
	const scriptReloadKey = ref(0)

	const goInfo = () => {
		router.push(`/project/${projectId}`)
	}

	// 记住每个项目最后编辑的场景，下次进入直接回到这里
	const rememberScene = (sceneId: string) => {
		if (!projectId || !sceneId) return
		try {
			localStorage.setItem(`aigc:create:lastScene:${projectId}`, String(sceneId))
		} catch (e) {}
	}

	const onSelectScene = (sceneId: string) => {
		activeSceneId.value = sceneId
		rememberScene(sceneId)
		focusContentId.value = null
		view.value = 'script'
		sceneDrawerVisible.value = false
	}

	const onSceneCreated = () => {
		graphKey.value += 1
	}

	// 中栏保存场景标题/封面后，左栏列表跟着刷新（桌面 + 移动抽屉两份实例）
	const scenePanel = ref<InstanceType<typeof SceneListPanel> | null>(null)
	const mobileScenePanel = ref<InstanceType<typeof SceneListPanel> | null>(null)
	const reloadSceneLists = () => {
		scenePanel.value?.reload()
		mobileScenePanel.value?.reload()
	}
	const onSceneUpdated = () => {
		reloadSceneLists()
	}

	const onSceneDeleted = (sceneId: string) => {
		graphKey.value += 1
		if (activeSceneId.value === sceneId) {
			activeSceneId.value = ''
			try {
				const key = `aigc:create:lastScene:${projectId}`
				if (localStorage.getItem(key) === String(sceneId)) localStorage.removeItem(key)
			} catch (e) {}
		}
	}

	// 全项目替换后：刷新场景列表并重新拉取当前场景内容
	const onDataChanged = () => {
		reloadSceneLists()
		scriptReloadKey.value += 1
		graphKey.value += 1
	}

	// 版本恢复后：关闭抽屉、刷新列表并重新载入脚本
	const onProjectRestored = () => {
		toolDrawerVisible.value = false
		reloadSceneLists()
		scriptReloadKey.value += 1
		graphKey.value += 1
	}

	// 小说导入写入后：刷新场景列表，跳到首条导入内容
	const onCompilerApplied = (payload: { sceneId: number; contentId: number | null }) => {
		reloadSceneLists()
		scriptReloadKey.value += 1
		graphKey.value += 1
		if (!payload?.sceneId) return
		activeSceneId.value = String(payload.sceneId)
		rememberScene(String(payload.sceneId))
		focusContentId.value = payload.contentId ?? null
		view.value = 'script'
	}

	// 历史编译定位：只切换场景与高亮，不刷新项目数据
	const onCompilerLocate = (payload: { sceneId: number; contentId: number | null }) => {
		if (!payload?.sceneId) return
		activeSceneId.value = String(payload.sceneId)
		rememberScene(String(payload.sceneId))
		focusContentId.value = payload.contentId ?? null
		view.value = 'script'
	}

	// 右栏「素材 / 自检」点定位：切到对应场景（可带具体节点）
	const onLocateAsset = (sceneId: number, contentId?: number | null) => {
		activeSceneId.value = String(sceneId)
		rememberScene(String(sceneId))
		focusContentId.value = contentId ?? null
		view.value = 'script'
	}

	// 窄屏抽屉里的定位：定位后收起抽屉
	const onLocateFromDrawer = (sceneId: number, contentId?: number | null) => {
		toolDrawerVisible.value = false
		onLocateAsset(sceneId, contentId)
	}

	// 脚本 → 剧情图：切过去并高亮对应节点
	const onOpenGraph = (sceneId: number, contentId: number | null) => {
		graphFocusContentId.value = contentId
		view.value = 'graph'
	}

	const openGraphTab = () => {
		graphFocusContentId.value = null
		view.value = 'graph'
	}

	// 大纲点场景：切回脚本并定位
	const onOutlineSelect = (sceneId: number) => {
		onSelectScene(String(sceneId))
	}

	// 剧情图 → 脚本：切回剧本并定位到台词
	const onGraphLocate = (sceneId: number, contentId: number | null) => {
		graphFocusContentId.value = null
		onLocateSearchResult(sceneId, contentId)
	}

	// 全项目搜索点结果：切场景并定位到具体对话
	const onLocateSearchResult = (sceneId: number, contentId: number | null) => {
		activeSceneId.value = String(sceneId)
		rememberScene(String(sceneId))
		focusContentId.value = contentId
		view.value = 'script'
		sceneDrawerVisible.value = false
	}

	// 发布状态变化：同步顶栏项目的公开标记
	const onPublished = (isPublic: boolean) => {
		if (project.value) project.value.is_public = isPublic
	}

	const openPlayer = () => {
		const url = router.resolve({
			path: `/view/${projectId}`,
			// 作者试玩默认带演出模式入口，可直接在预览里改台词/背景/BGM/差分
			query: { edit: '1', ...(debugPlay.value ? { debug: '1' } : {}) },
		}).href
		window.open(url, '_blank')
	}

	const openReleasePreview = () => {
		const url = router.resolve({
			path: `/view/${projectId}`,
			query: { release: '1' },
		}).href
		window.open(url, '_blank')
	}

	onMounted(async () => {
		if (!projectId) {
			router.replace('/home')
			return
		}
		try {
			const p = await getProject(Number(projectId))
			project.value = p
			if (currentUserId && String(p.user_id) !== String(currentUserId)) {
				ElMessage.warning('只有作者可以进入创作页')
				router.replace(p.is_public ? `/view/${projectId}` : '/home')
				return
			}
			guardState.value = 'ok'
		} catch (e) {
			console.error('获取项目信息失败:', e)
			ElMessage.error('项目不存在或无权访问')
			router.replace('/home')
		}
	})
</script>

<style scoped lang="scss" src="./createView.scss"></style>
