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
					@click="view = 'graph'"
				>剧情图</button>
			</div>

			<div class="cv-side cv-side-right">
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
					:project-id="projectId"
					:active-scene-id="activeSceneId"
					@select="onSelectScene"
					@created="onSceneCreated"
				/>
			</aside>

			<main class="cv-center">
				<div v-show="view === 'script'" class="cv-pane">
					<SceneEdit
						v-if="activeSceneId"
						:key="activeSceneId"
						:scene-id="activeSceneId"
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
					/>
				</div>
			</main>

			<aside class="cv-right">
				<CreateToolPanel :project-id="projectId" />
			</aside>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, onMounted } from 'vue'
	import { useRoute, useRouter } from 'vue-router'
	import { getProject } from '@/api/project'
	import type { Project } from '@/api/project'
	import SceneListPanel from '@/components/SceneListPanel.vue'
	import SceneEdit from '@/components/SceneEdit.vue'
	import StoryGraphEditor from '@/components/StoryGraphEditor.vue'
	import CreateToolPanel from '@/components/CreateToolPanel.vue'

	const route = useRoute()
	const router = useRouter()

	const projectId = String(route.params.projectId || '')

	const project = ref<Project | null>(null)
	const activeSceneId = ref<string>('')
	const view = ref<'script' | 'graph'>('script')
	// 新建场景后递增，强制剧情图重新挂载取新拓扑
	const graphKey = ref(0)

	const goInfo = () => {
		router.push(`/project/${projectId}`)
	}

	const onSelectScene = (sceneId: string) => {
		activeSceneId.value = sceneId
		view.value = 'script'
	}

	const onSceneCreated = () => {
		graphKey.value += 1
	}

	const openPlayer = () => {
		const url = router.resolve(`/view/${projectId}`).href
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

	/* ---------- 窄屏降级 ----------
	   右侧工具面板在窄屏先整块隐藏，把宽度让给中栏。 */
	@media (max-width: 1100px) {
		.cv-right {
			display: none;
		}

		.cv-left {
			width: 200px;
		}
	}

	@media (max-width: 760px) {
		.cv-left {
			width: 152px;
		}

		.cv-project {
			max-width: 110px;
		}
	}
</style>
