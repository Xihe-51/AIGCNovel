<template>
	<div class="preview-panel">
		<button
			v-if="showBgm"
			class="bgm-toggle-btn"
			:class="{ 'is-muted': bgmMuted }"
			:title="bgmMuted ? '打开背景音乐试听' : '关闭背景音乐试听'"
			@click="$emit('toggle-bgm')"
		>{{ bgmMuted ? '试听 BGM' : '停止 BGM' }}</button>

		<button
			class="stage-edit-btn"
			:class="{ 'is-active': editable }"
			:disabled="!editable && !canEdit"
			:title="editable ? '退出舞台编辑' : (canEdit ? '拖动立绘调整位置' : '先保存当前台词再编辑舞台')"
			@click="$emit('toggle-edit')"
		>{{ editable ? '退出舞台编辑' : '舞台编辑' }}</button>

		<div v-if="editable && canEdit" class="stage-edit-hint">拖动立绘调整位置 · Ctrl/Shift 点击多选 · 松手自动保存</div>

		<div v-if="editable" class="stage-layers">
			<div class="stage-layers-title">图层</div>
			<button
				v-for="layer in layerItems"
				:key="layer.key"
				type="button"
				:class="['stage-layer', { 'is-active': isSelected(layer.key), 'is-hidden': layer.isAvatar && !layer.visible, 'is-dragging': dragLayerKey === layer.key }]"
				:disabled="!layer.selectable"
				:draggable="layer.isAvatar && layer.exists"
				:title="layer.isAvatar ? '拖动可调整层级；Ctrl/Shift 点击多选' : ''"
				@click="onLayerClick($event, layer)"
				@dragstart="onLayerDragStart($event, layer)"
				@dragover.prevent="onLayerDragOver($event, layer)"
				@dragleave="dragOverKey = null"
				@drop.prevent="onLayerDrop($event, layer)"
				@dragend="onLayerDragEnd"
			>
				<span>{{ layer.label }}</span>
				<span class="stage-layer-state">{{ layer.stateLabel }}</span>
				<span v-if="layer.isAvatar && layer.exists" class="stage-layer-ops">
					<span
						class="stage-layer-op"
						:title="layer.visible ? '隐藏' : '显示'"
						@click.stop="$emit('avatar-visibility', layer.key, !layer.visible)"
					>{{ layer.visible ? '◉' : '○' }}</span>
					<span class="stage-layer-op" title="上移一层" @click.stop="$emit('avatar-order', layer.key, 'up')">↑</span>
					<span class="stage-layer-op" title="下移一层" @click.stop="$emit('avatar-order', layer.key, 'down')">↓</span>
					<span class="stage-layer-op" title="重命名图层" @click.stop="$emit('avatar-rename', layer.key)">✎</span>
					<span class="stage-layer-op is-danger" title="删除图层" @click.stop="$emit('avatar-remove', layer.key)">×</span>
				</span>
			</button>
			<button
				type="button"
				class="stage-layer-add"
				:disabled="layerLimitReached"
				:title="layerLimitReached ? `最多 ${maxLayers} 个立绘图层` : '新建立绘层'"
				@click="$emit('avatar-add-new')"
			>＋ 新建立绘层</button>
			<button type="button" class="stage-layer-undo" :disabled="!canUndo" @click="$emit('undo')">↶ 撤销上一步</button>
			<button
					type="button"
					class="stage-layer-undo"
					:class="{ 'is-on': gridSnap > 0 }"
					@click="$emit('toggle-grid')"
				>{{ gridSnap > 0 ? '⊞ 网格吸附：开' : '⊞ 网格吸附：关' }}</button>
				<button
					type="button"
					class="stage-layer-undo"
					title="强制重新拉取预览里的图片/背景，不改动剧本数据"
					@click="$emit('reload-assets')"
				>⟳ 热重载素材</button>
		</div>

		<div v-if="editable && canEdit && primaryLayerId && selectedLayerIds.length === 1 && slots[primaryLayerId]" class="stage-inspector" @pointerdown.stop>
			<div class="stage-inspector-title">{{ layerLabel(primaryLayerId) }}</div>
			<div class="stage-inspector-row">
				<span>缩放</span>
				<el-input-number v-model="localScale" :min="0.2" :max="3" :step="0.1" :precision="1" size="small" @change="applyTransform" />
			</div>
			<div class="stage-inspector-row">
				<span>透明度</span>
				<el-input-number v-model="localOpacity" :min="0" :max="1" :step="0.1" :precision="1" size="small" @change="applyTransform" />
			</div>
			<div class="stage-inspector-row">
				<span>旋转</span>
				<el-input-number v-model="localRotate" :min="-45" :max="45" :step="1" :precision="0" size="small" @change="applyTransform" />
			</div>
			<div class="stage-inspector-actions">
				<button type="button" class="stage-inspector-btn" @click="resetTransform">重置</button>
				<button type="button" class="stage-inspector-btn is-ghost" @click="$emit('avatar-remove', primaryLayerId)">删除图层</button>
				<button type="button" class="stage-inspector-btn is-ghost" @click="clearSelection">关闭</button>
			</div>
		</div>

		<button
			class="panel-toggle-btn"
			:class="isPanelOpen ? 'toggle-hidden' : 'toggle-visible'"
			:title="isPanelOpen ? '收起面板，预览舞台' : '展开编辑面板'"
			@click="$emit('toggle-panel')"
		>
			<el-icon :size="24" v-if="isPanelOpen"><ArrowLeft /></el-icon>
			<el-icon :size="24" v-else><ArrowRight /></el-icon>
		</button>

		<div
			class="preview-container"
			:class="{ 'fx-shake': activeEffect && activeEffect.effect === 'shake', 'is-editing': editable, 'is-asset-over': assetOver }"
			:style="{ '--fx-amp': (activeEffect && activeEffect.intensity ? activeEffect.intensity : 5) + 'px' }"
			@dragover.prevent="onAssetDragOver"
			@dragleave="onAssetDragLeave"
			@drop.prevent="onAssetDrop"
		>
			<div class="scene-background">
				<img
					v-if="bgSrc && !bgFailed"
					:src="bgSrc"
					alt="场景背景"
					class="background-image"
					@error="bgFailed = true"
				/>
				<div v-else-if="bgSrc" class="bg-missing-tip">背景图文件已丢失，请在左侧场景设置里重新上传</div>
			</div>

			<!-- 演出指令控制的立绘：任意数量图层，按 order 叠放 -->
			<div v-if="!loading && !error && hasSlots" class="preview-stage" :class="{ 'is-editing': editable }">
					<div
						v-for="layer in renderedLayers"
						:key="layer.layer_id"
						v-show="layer.visible !== false"
						:data-layer-id="layer.layer_id"
						:class="['preview-stage-avatar', { 'is-selected': isSelected(layer.layer_id), 'is-asset-target': assetOverAvatar === layer.layer_id }]"
						:style="slotBoxStyle(layer.layer_id)"
						@pointerdown="startDrag($event, layer.layer_id)"
						@dragover.prevent.stop="onAvatarAssetDragOver"
						@dragleave.stop="assetOverAvatar = null"
						@drop.prevent.stop="onAvatarAssetDrop($event, layer.layer_id)"
					>
						<div class="layer-stack" :style="layer.style">
							<img
								v-for="(src, si) in (layer.sources && layer.sources.length ? layer.sources : [layer.src])"
								:key="si"
								:src="src"
								:class="{ 'is-layer': si > 0 }"
								alt=""
								@error="hideImage"
							/>
						</div>
					</div>
				</div>

				<!-- 回退：没有演出指令时，显示当前（或最近一位）说话角色的立绘 -->
				<div
					v-else-if="!loading && !error && (avatarSources.length || avatarSrc)"
					class="character-stand"
					:class="['character-stand', { 'is-editing': editable, 'is-selected': isSelected('center') }]"
					@pointerdown="startDrag($event, 'center')"
				>
					<div class="character-stack">
						<img
							v-for="(src, si) in (avatarSources.length ? avatarSources : [avatarSrc])"
							:key="si"
							:src="src"
							alt="角色立绘"
							class="character-image"
							:class="{ 'is-layer': si > 0 }"
							@error="hideImage"
						/>
					</div>
				</div>

			<!-- 前景图层（演出指令） -->
			<div v-if="!loading && !error && foregroundSrc" class="preview-foreground">
				<img :src="foregroundSrc" alt="" @error="hideImage" />
			</div>

			<!-- 演出效果：天气覆盖层 / 闪光 -->
			<div
				v-if="activeEffect && activeEffect.effect === 'weather'"
				class="fx-weather"
				:class="'fx-' + (activeEffect.weather || 'rain')"
			></div>
			<div
				v-if="activeEffect && activeEffect.effect === 'flash'"
				:key="activeEffect.key"
				class="fx-flash"
				:style="{ background: activeEffect.color || '#ffffff', animationDuration: activeEffect.duration_ms + 'ms' }"
			></div>

			<div v-if="loading" class="loading-indicator">
				<span class="ui-spinner ui-spinner-lg"></span>
				<p>加载场景中...</p>
			</div>

			<div v-if="error" class="error-message">
				<el-icon color="#F56C6C" size="24"><WarningFilled /></el-icon>
				<p>错误: {{ error }}</p>
			</div>

			<div v-if="!loading && !error" class="dialogue-display">
				<div
					v-if="dialogueIndex < dialogueCount"
					:class="['dialogue-box', `box-${currentDialogue?.content_type}`]"
					@click="$emit('next')"
				>
					<span class="character-name">{{ speakerName }}</span>
					<div class="dialogue-text" v-html="dialogueHtml"></div>
					<div v-if="currentDialogue?.voice_url" class="dialogue-audio">
						<audio :src="BASE_URL + currentDialogue.voice_url" controls autoplay>你的浏览器不支持音频播放</audio>
					</div>
					<div class="continue-indicator">
						<el-icon size="20">></el-icon>
					</div>
				</div>

				<div v-if="dialogueIndex >= dialogueCount && dialogueCount > 0" class="dialogue-end">
					<p>场景对话结束</p>
					<el-button @click="$emit('restart')">重新开始</el-button>
				</div>

				<div v-if="dialogueCount === 0" class="no-dialogues-preview">
					<p>该场景暂无对话内容</p>
					<el-button @click="$emit('toggle-panel')">去添加对话</el-button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { onBeforeUnmount, ref, watch } from 'vue'
	import { ArrowLeft, ArrowRight, WarningFilled } from '@element-plus/icons-vue'
	import { BASE_URL } from '@/utils/request'
	import { useStageAssetDrop } from '@/composables/scene/useStageAssetDrop'
	import { useStageLayers } from '@/composables/scene/useStageLayers'
	import { useStageLayerDrag } from '@/composables/scene/useStageLayerDrag'
	import type { StageLayerInfo, StageSlot } from '@/composables/scene/useStageLayers'

	const props = withDefaults(defineProps<{
		bgSrc?: string
		avatarSrc?: string
		avatarSources?: string[]
		foregroundSrc?: string
		slots?: Record<string, StageSlot | null>
		hasSlots?: boolean
		activeEffect?: any
		loading?: boolean
		error?: string
		dialogueCount?: number
		dialogueIndex?: number
		currentDialogue?: any
		speakerName?: string
		dialogueHtml?: string
		showBgm?: boolean
		bgmMuted?: boolean
		isPanelOpen?: boolean
		editable?: boolean
		canEdit?: boolean
		dialogueKey?: string | number | null
		canUndo?: boolean
		gridSnap?: number
		stageVisibility?: Record<string, boolean>
		bgAvailable?: boolean
		fgAvailable?: boolean
		avatarLayers?: StageLayerInfo[]
		maxLayers?: number
	}>(), {
		bgSrc: '',
		avatarSrc: '',
		avatarSources: () => [],
		foregroundSrc: '',
		slots: () => ({}),
		hasSlots: false,
		activeEffect: null,
		loading: false,
		error: '',
		dialogueCount: 0,
		dialogueIndex: 0,
		currentDialogue: null,
		speakerName: '',
		dialogueHtml: '',
		showBgm: false,
		bgmMuted: true,
		isPanelOpen: true,
		editable: false,
		canEdit: false,
		dialogueKey: '',
		canUndo: false,
		gridSnap: 0,
		stageVisibility: () => ({ background: true, foreground: true, dialogue: true }),
		bgAvailable: false,
		fgAvailable: false,
		avatarLayers: () => [],
		maxLayers: 8,
	})

	const emit = defineEmits<{
		(e: 'toggle-panel'): void
		(e: 'toggle-bgm'): void
		(e: 'toggle-edit'): void
		(e: 'next'): void
		(e: 'restart'): void
		(e: 'avatar-group-move', payload: { updates: { layerId: string; x: number; y: number }[] }): void
		(e: 'avatar-transform', payload: { layerId: string; scale?: number; opacity?: number; rotate?: number; x?: number; y?: number; reset?: boolean }): void
		(e: 'avatar-add-new'): void
		(e: 'avatar-remove', layerId: string): void
		(e: 'avatar-rename', layerId: string): void
		(e: 'avatar-visibility', layerId: string, visible: boolean): void
		(e: 'avatar-order', layerId: string, direction: 'up' | 'down'): void
		(e: 'avatar-reorder', from: string, to: string): void
		(e: 'stage-visibility', layerKey: string, visible: boolean): void
		(e: 'undo'): void
		(e: 'toggle-grid'): void
		(e: 'asset-drop', payload: { url: string; label: string; x: number; y: number }): void
		(e: 'avatar-replace-asset', layerId: string, payload: { url: string; label: string }): void
		(e: 'reload-assets'): void
	}>()

	const bgFailed = ref(false)
	watch(() => props.bgSrc, () => { bgFailed.value = false })

	// ===== 素材库拖拽：图片可落到舞台空白处新建图层，或落到已有立绘层替换图片 =====
	const {
		assetOver,
		assetOverAvatar,
		onAssetDragOver,
		onAssetDragLeave,
		onAssetDrop,
		onAvatarAssetDragOver,
		onAvatarAssetDrop,
	} = useStageAssetDrop({
		onAssetDrop: (payload) => emit('asset-drop', payload),
		onReplaceAsset: (layerId, payload) => emit('avatar-replace-asset', layerId, payload),
	})

	const hideImage = (e: Event) => {
		const img = e.target as HTMLImageElement | null
		if (img) img.style.visibility = 'hidden'
	}

	// ===== 图层选中 / 属性条 / 图层列表（含列表拖拽换序） =====
	const {
		selectedLayerIds,
		primaryLayerId,
		localScale,
		localOpacity,
		localRotate,
		isSelected,
		layerLimitReached,
		layerLabel,
		renderedLayers,
		syncLocal,
		clearSelection,
		selectLayer,
		applyTransform,
		resetTransform,
		slotBoxStyle,
		layerItems,
		onLayerClick,
		dragLayerKey,
		dragOverKey,
		onLayerDragStart,
		onLayerDragOver,
		onLayerDrop,
		onLayerDragEnd,
	} = useStageLayers({
		slots: () => props.slots,
		avatarLayers: () => props.avatarLayers,
		maxLayers: () => props.maxLayers,
		editable: () => props.editable,
		canEdit: () => props.canEdit,
		stageVisibility: () => props.stageVisibility,
		bgAvailable: () => props.bgAvailable,
		fgAvailable: () => props.fgAvailable,
		dialogueCount: () => props.dialogueCount,
		dialogueKey: () => props.dialogueKey,
		onStageVisibility: (layerKey, visible) => emit('stage-visibility', layerKey, visible),
		onTransform: (payload) => emit('avatar-transform', payload),
		onReplaceAsset: (layerId, payload) => emit('avatar-replace-asset', layerId, payload),
		onReorder: (from, to) => emit('avatar-reorder', from, to),
	})

	// ===== 舞台立绘拖拽：整组位移 + 网格吸附 =====
	const { startDrag, stopDrag } = useStageLayerDrag({
		editable: () => props.editable,
		canEdit: () => props.canEdit,
		gridSnap: () => props.gridSnap,
		slots: () => props.slots,
		selectedLayerIds,
		primaryLayerId,
		isSelected,
		selectLayer,
		syncLocal,
		onGroupMove: (updates) => emit('avatar-group-move', { updates }),
	})

	onBeforeUnmount(stopDrag)
</script>

<style scoped src="./scene/stagePreviewPanel.css"></style>
<style scoped src="./scene/stagePreviewScene.css"></style>
<style scoped src="./scene/stagePreviewEffects.css"></style>
<style scoped src="./scene/stagePreviewDialogue.css"></style>
<style scoped src="./scene/stagePreviewResponsive.css"></style>
