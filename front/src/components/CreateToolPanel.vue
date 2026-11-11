<template>
	<div class="tp-root">
		<div class="tp-groups">
			<button
				v-for="g in tabGroups"
				:key="g.key"
				type="button"
				:class="['tp-group', { 'is-active': activeGroup === g.key }]"
				@click="selectGroup(g)"
			>{{ g.label }}</button>
		</div>
		<div class="tp-tabs">
			<button
				v-for="t in visibleTabs"
				:key="t.key"
				:class="['tp-tab', { 'is-active': tab === t.key }]"
				@click="tab = t.key"
			>
				{{ t.label }}
				<span v-if="t.badge" class="tp-badge">{{ t.badge }}</span>
			</button>
		</div>

		<div class="tp-body">
			<ToolCharactersPanel v-if="tab === 'characters'" :project-id="projectId" />
			<ToolVariablesPanel v-else-if="tab === 'variables'" :project-id="projectId" />
			<ToolOverviewPanel v-else-if="tab === 'overview'" :project-id="projectId" />
			<ToolAnalyticsPanel
				v-else-if="tab === 'analytics'"
				:project-id="projectId"
				@locate="onLocate"
			/>
			<SaveInspectorPanel
				v-else-if="tab === 'saves'"
				:project-id="projectId"
				@locate="onLocateSave"
			/>
			<ToolAchievementsPanel v-else-if="tab === 'achievements'" :project-id="projectId" />
			<ToolReportPanel v-else-if="tab === 'report'" :project-id="projectId" />
			<ToolVersionsPanel
				v-else-if="tab === 'versions'"
				:project-id="projectId"
				@restored="emit('restored')"
			/>
			<ToolTermsPanel
				v-else-if="tab === 'terms'"
				:project-id="projectId"
				@locate="onLocate"
			/>
			<ToolAppearancePanel v-else-if="tab === 'appearance'" :project-id="projectId" />
			<AssetLibraryPanel
				v-else-if="tab === 'assets'"
				:project-id="projectId"
				@locate="onLocate"
			/>
			<ProjectHealthPanel
				v-else-if="tab === 'health'"
				:project-id="projectId"
				@locate="onLocateHealth"
			/>
			<ToolAiPanel v-else-if="tab === 'ai'" />
			<ToolEffectsPanel v-else :project-id="projectId" />
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AssetLibraryPanel from '@/components/AssetLibraryPanel.vue'
import ProjectHealthPanel from '@/components/ProjectHealthPanel.vue'
import SaveInspectorPanel from '@/components/SaveInspectorPanel.vue'
import ToolCharactersPanel from '@/components/create-tool/ToolCharactersPanel.vue'
import ToolVariablesPanel from '@/components/create-tool/ToolVariablesPanel.vue'
import ToolOverviewPanel from '@/components/create-tool/ToolOverviewPanel.vue'
import ToolAnalyticsPanel from '@/components/create-tool/ToolAnalyticsPanel.vue'
import ToolAchievementsPanel from '@/components/create-tool/ToolAchievementsPanel.vue'
import ToolReportPanel from '@/components/create-tool/ToolReportPanel.vue'
import ToolVersionsPanel from '@/components/create-tool/ToolVersionsPanel.vue'
import ToolTermsPanel from '@/components/create-tool/ToolTermsPanel.vue'
import ToolAppearancePanel from '@/components/create-tool/ToolAppearancePanel.vue'
import ToolAiPanel from '@/components/create-tool/ToolAiPanel.vue'
import ToolEffectsPanel from '@/components/create-tool/ToolEffectsPanel.vue'

defineProps<{
	projectId: string | number
}>()

const tabs = [
	{ key: 'characters', label: '角色', badge: '' },
	{ key: 'variables', label: '变量', badge: '' },
	{ key: 'overview', label: '概览', badge: '' },
	{ key: 'analytics', label: '数据', badge: '' },
	{ key: 'saves', label: '存档', badge: '' },
	{ key: 'achievements', label: '成就', badge: '' },
	{ key: 'report', label: '报表', badge: '' },
	{ key: 'versions', label: '版本', badge: '' },
	{ key: 'terms', label: '术语', badge: '' },
	{ key: 'appearance', label: '外观', badge: '' },
	{ key: 'assets', label: '素材', badge: '' },
	{ key: 'health', label: '自检', badge: '' },
	{ key: 'ai', label: 'AI', badge: '' },
	{ key: 'effects', label: '演出', badge: '' }
] as const

type TabKey = (typeof tabs)[number]['key']

const tab = ref<TabKey>('characters')

// 14 个工具按「内容 / 数据 / 质量 / 外观」分组，避免 300px 面板里横向滚动找 tab
const tabGroups = [
	{ key: 'content', label: '内容', tabs: ['characters', 'variables', 'effects'] },
	{ key: 'data', label: '数据', tabs: ['overview', 'analytics', 'saves', 'report'] },
	{ key: 'quality', label: '质量', tabs: ['health', 'achievements', 'terms', 'versions'] },
	{ key: 'appearance', label: '外观', tabs: ['appearance', 'assets', 'ai'] }
] as const

const lastTabByGroup = ref<Record<string, string>>({
	content: 'characters',
	data: 'overview',
	quality: 'health',
	appearance: 'appearance'
})

const activeGroup = computed(() => {
	const group = tabGroups.find(g => (g.tabs as readonly string[]).includes(tab.value))
	return group ? group.key : 'content'
})

const visibleTabs = computed(() => {
	const group = tabGroups.find(g => g.key === activeGroup.value)
	if (!group) return []
	return group.tabs
		.map(key => tabs.find(t => t.key === key))
		.filter((t): t is (typeof tabs)[number] => !!t)
})

const selectGroup = (group: (typeof tabGroups)[number]) => {
	const last = lastTabByGroup.value[group.key]
	const next = (group.tabs as readonly string[]).includes(last) ? last : group.tabs[0]
	tab.value = next as TabKey
}

const emit = defineEmits<{
	(e: 'locate', sceneId: number, contentId?: number | null): void
	(e: 'restored'): void
}>()

const onLocate = (sceneId: number, contentId?: number | null) => emit('locate', sceneId, contentId ?? null)
const onLocateHealth = (sceneId: number, contentId: number | null) => emit('locate', sceneId, contentId)
const onLocateSave = (sceneId: number, contentId: number | null) => emit('locate', sceneId, contentId)
</script>

<style src="./create-tool/toolPanel.css"></style>
