<template>
	<div class="cv-root">
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
				<button type="button" class="cv-publish-btn" title="发布前体检并生成分享链接" @click="publishVisible = true">
					发布
				</button>
				<button
					type="button"
					:class="['cv-debug', { 'is-active': debugPlay }]"
					title="试玩时打开调试面板"
					@click="debugPlay = !debugPlay"
				>调试</button>
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
	</div>
</template>

<script setup lang="ts">
	import { ref, onMounted } from 'vue'
	import { useRoute, useRouter } from 'vue-router'
	import { Tools, Files } from '@element-plus/icons-vue'
	import { getProject } from '@/api/project'
	import type { Project } from '@/api/project'
	import SceneListPanel from '@/components/SceneListPanel.vue'
	import SceneEdit from '@/components/SceneEdit.vue'
	import StoryGraphEditor from '@/components/StoryGraphEditor.vue'
	import OutlineView from '@/components/OutlineView.vue'
	import PublishWizard from '@/components/PublishWizard.vue'
	import CreateToolPanel from '@/components/CreateToolPanel.vue'

	const route = useRoute()
	const router = useRouter()

	const projectId = String(route.params.projectId || '')

	const project = ref<Project | null>(null)
	const activeSceneId = ref<string>('')
	const view = ref<'script' | 'graph' | 'outline'>('script')
	// 试玩时是否带调试面板
	const debugPlay = ref(false)
	// 发布向导
	const publishVisible = ref(false)
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
			query: debugPlay.value ? { debug: '1' } : {},
		}).href
		window.open(url, '_blank')
	}

	onMounted(async () => {
		if (!projectId) return
		try {
			project.value = await getProject(Number(projectId))
		} catch (e) {
			console.error('获取项目信息失败:', e)
		}
	})
</script>

<style scoped>
	.cv-root {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
		background: #fff;
	}

	/* ---------- 顶栏 ---------- */
	.cv-topbar {
		flex-shrink: 0;
		height: 52px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 14px;
		background: linear-gradient(90deg, #fff6f9 0%, #ffffff 55%);
		border-bottom: 1px solid #f5dbe4;
	}

	.cv-side {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
	}

	.cv-side-right {
		justify-content: flex-end;
	}

	.cv-debug {
		border: 1px solid #d9d9e3;
		background: #fff;
		color: #6b7280;
		font-size: 12px;
		padding: 5px 10px;
		border-radius: 8px;
		cursor: pointer;
		white-space: nowrap;
	}

	.cv-debug.is-active {
		border-color: #7c6cf0;
		background: #f2f0ff;
		color: #5b4bd6;
		font-weight: 600;
	}

	.cv-publish-btn {
		border: 1px solid #f0c8d6;
		background: #fff2f6;
		color: #c81f4a;
		font-size: 12px;
		padding: 5px 10px;
		border-radius: 8px;
		cursor: pointer;
		white-space: nowrap;
	}

	.cv-publish-btn:hover {
		border-color: #e8467c;
		background: #fdeef3;
	}

	.cv-back,
	.cv-play {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 6px 11px;
		border-radius: 8px;
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.cv-back {
		border: 1px solid #f0cfdc;
		background: #fff;
		color: #a84463;
	}

	.cv-back:hover {
		background: #fdeef3;
		border-color: #e8467c;
		color: #c81f4a;
	}

	.cv-play {
		border: 1px solid #e8467c;
		background: #e8467c;
		color: #fff;
	}

	.cv-play:hover {
		background: #d33a6c;
		border-color: #d33a6c;
	}

	.cv-divider {
		width: 1px;
		height: 16px;
		background: #f0d4df;
	}

	.cv-project {
		font-size: 13px;
		font-weight: 600;
		color: #3d2b32;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cv-mode-pill {
		flex-shrink: 0;
		font-size: 10px;
		color: #c81f4a;
		background: #fdeef3;
		border: 1px solid #f6d6e2;
		padding: 1px 7px;
		border-radius: 8px;
		line-height: 1.5;
	}

	/* ---------- 中段切换 ---------- */
	.cv-switch {
		display: flex;
		gap: 4px;
		background: #fdeef3;
		padding: 3px;
		border-radius: 9px;
		flex-shrink: 0;
	}

	.cv-tab {
		padding: 5px 18px;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: #a84463;
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.cv-tab.is-active {
		background: #fff;
		color: #c81f4a;
		font-weight: 600;
		box-shadow: 0 1px 3px rgba(200, 31, 74, 0.12);
	}

	/* ---------- 三栏 ---------- */
	.cv-body {
		flex: 1;
		display: flex;
		min-height: 0;
	}

	.cv-left {
		width: 240px;
		flex-shrink: 0;
		min-height: 0;
	}

	.cv-center {
		flex: 1;
		min-width: 0;
		position: relative;
		overflow: hidden;
		background: #fdf2f8;
	}

	.cv-pane {
		position: absolute;
		inset: 0;
	}

	.cv-empty {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		color: #b37d8f;
	}

	.cv-right {
		width: 300px;
		flex-shrink: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: #ffffff;
		border-left: 1px solid #f2e3e9;
	}

	/* 剧情图组件自带 520px 最小高度，嵌进中栏时去掉，避免上下溢出 */
	.cv-pane :deep(.sge-root) {
		min-height: 0;
	}

	.cv-tool-fab {
		display: none;
		position: fixed;
		right: 14px;
		bottom: 18px;
		z-index: 20;
		align-items: center;
		gap: 5px;
		padding: 9px 14px;
		border: none;
		border-radius: 22px;
		background: #e8467c;
		color: #fff;
		font-size: 13px;
		cursor: pointer;
		box-shadow: 0 6px 18px rgba(232, 70, 124, 0.35);
	}

	.cv-tool-fab:active {
		transform: translateY(1px);
	}

	.cv-scene-fab {
		display: none;
		position: fixed;
		left: 14px;
		bottom: 18px;
		z-index: 20;
		align-items: center;
		gap: 5px;
		padding: 9px 14px;
		border: 1px solid #f3c3d2;
		border-radius: 22px;
		background: #fff;
		color: #c81f4a;
		font-size: 13px;
		cursor: pointer;
		box-shadow: 0 6px 18px rgba(232, 70, 124, 0.22);
	}

	.cv-scene-fab:active {
		transform: translateY(1px);
	}

	:global(.cv-scene-drawer .el-drawer__body) {
		padding: 0;
		overflow: hidden;
	}

	:global(.cv-scene-drawer .slp-root) {
		height: 100%;
		border-right: none;
	}

	:global(.cv-tool-drawer .el-drawer__body) {
		padding: 0 12px 12px;
		overflow: hidden;
	}

	:global(.cv-tool-drawer .tp-root) {
		height: 100%;
	}

	/* ---------- 窄屏降级 ----------
	   右侧工具面板在窄屏收进右下角抽屉，把宽度让给中栏。 */
	@media (max-width: 1100px) {
		.cv-right {
			display: none;
		}

		.cv-tool-fab {
			display: inline-flex;
		}

		.cv-left {
			width: 200px;
		}
	}

	@media (max-width: 760px) {
		.cv-left {
			display: none;
		}

		.cv-scene-fab {
			display: inline-flex;
		}

		.cv-project {
			max-width: 110px;
		}
	}
</style>
