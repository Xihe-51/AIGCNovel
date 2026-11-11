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
	import { ref, computed, watch, onBeforeUnmount } from 'vue'
	import { ArrowLeft, ArrowRight, WarningFilled } from '@element-plus/icons-vue'
	import { BASE_URL } from '@/utils/request'

	interface StageSlot {
		src: string
		style?: Record<string, any>
		boxStyle?: Record<string, any>
		coord?: 'stage' | 'sprite'
		visible?: boolean
		order?: number
		x?: number
		y?: number
		scale?: number
		opacity?: number
		rotate?: number
		layer_id: string
		layer_name?: string
		character_id?: number | null
		avatar_id?: number | null
		/** 基础图 + 差分层叠加图（按 order 从小到大） */
		sources?: string[]
	}

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
		avatarLayers?: { layer_id: string; label: string; exists: boolean; visible: boolean; order: number }[]
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
	const assetOver = ref(false)
	// 拖到某个已存在的立绘上时，记录它的 layer_id 用于高亮提示
	const assetOverAvatar = ref<string | null>(null)
	const isImageAssetUrl = (url: string) => /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(String(url || ''))
	const readAssetDropPayload = (ev: DragEvent): { url: string; label: string } | null => {
		try {
			const raw = ev.dataTransfer?.getData('application/x-aigc-asset') || ''
			if (raw) {
				const data = JSON.parse(raw)
				const url = data?.url || data?.image_url || ''
				if (url) return { url, label: data?.label || data?.title || '' }
			}
			const text = ev.dataTransfer?.getData('text/plain') || ''
			if (text && isImageAssetUrl(text)) return { url: text, label: '' }
		} catch (_) {
			/* 忽略非 JSON 拖拽数据 */
		}
		return null
	}
	const onAssetDragOver = (ev: DragEvent) => {
		const types = ev.dataTransfer?.types || []
		if (Array.from(types).includes('application/x-aigc-asset')) assetOver.value = true
	}
	const onAssetDragLeave = () => {
		assetOver.value = false
	}
	const onAssetDrop = (ev: DragEvent) => {
		assetOver.value = false
		assetOverAvatar.value = null
		const payload = readAssetDropPayload(ev)
		if (!payload || !isImageAssetUrl(payload.url)) return
		const host = ev.currentTarget as HTMLElement | null
		const rect = host?.getBoundingClientRect()
		if (!rect || !rect.width || !rect.height) return
		const x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100))
		const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100))
		emit('asset-drop', { ...payload, x, y })
	}

	// 拖到舞台上已存在的立绘上：替换该图层图片，而不是在空白处新建
	const onAvatarAssetDragOver = (ev: DragEvent) => {
		const types = ev.dataTransfer?.types || []
		if (!Array.from(types).includes('application/x-aigc-asset')) return
		const layerId = (ev.currentTarget as HTMLElement | null)?.getAttribute('data-layer-id') || null
		assetOverAvatar.value = layerId
		assetOver.value = true
	}
	const onAvatarAssetDrop = (ev: DragEvent, layerId: string) => {
		assetOver.value = false
		assetOverAvatar.value = null
		const asset = readAssetDropPayload(ev)
		if (!asset || !isImageAssetUrl(asset.url)) return
		emit('avatar-replace-asset', layerId, asset)
	}

	const hideImage = (e: Event) => {
		const img = e.target as HTMLImageElement | null
		if (img) img.style.visibility = 'hidden'
	}

	// 选中图层 + 属性条（画布 v2）
	const selectedLayerIds = ref<string[]>([])
	const primaryLayerId = ref<string | null>(null)
	const localScale = ref(1)
	const localOpacity = ref(1)
	const localRotate = ref(0)
	const selectedSlot = computed(() => (primaryLayerId.value ? props.slots[primaryLayerId.value] : null))
	const isSelected = (layerId: string) => selectedLayerIds.value.includes(layerId)
	const layerLimitReached = computed(() => props.avatarLayers.length >= props.maxLayers)
	const layerLabel = (id: string) => props.slots[id]?.layer_name
		|| props.avatarLayers.find(l => l.layer_id === id)?.label
		|| id

	// 舞台渲染顺序：order 越小越靠后，选中图层临时提到最上
	const renderedLayers = computed<StageSlot[]>(() => (Object.values(props.slots) as (StageSlot | null)[])
		.filter((slot): slot is StageSlot => !!slot)
		.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)))

	const syncLocal = () => {
		const slot = selectedSlot.value
		localScale.value = Number(slot?.scale) || 1
		localOpacity.value = slot?.opacity === undefined || slot?.opacity === null ? 1 : Number(slot.opacity)
		localRotate.value = Number(slot?.rotate) || 0
	}

	const clearSelection = () => {
		selectedLayerIds.value = []
		primaryLayerId.value = null
	}

	const selectLayer = (layerId: string, multi = false) => {
		if (!props.editable || !props.canEdit) return
		if (multi) {
			const next = new Set(selectedLayerIds.value)
			if (next.has(layerId)) next.delete(layerId)
			else next.add(layerId)
			selectedLayerIds.value = [...next]
			primaryLayerId.value = next.has(layerId)
				? layerId
				: (selectedLayerIds.value[selectedLayerIds.value.length - 1] || null)
		} else {
			selectedLayerIds.value = [layerId]
			primaryLayerId.value = layerId
		}
		syncLocal()
	}

	const applyTransform = () => {
		if (!primaryLayerId.value) return
		emit('avatar-transform', {
			layerId: primaryLayerId.value,
			scale: Number(localScale.value) || 1,
			opacity: localOpacity.value === undefined || localOpacity.value === null ? 1 : Number(localOpacity.value),
			rotate: Number(localRotate.value) || 0,
		})
	}

	const resetTransform = () => {
		if (!primaryLayerId.value) return
		localScale.value = 1
		localOpacity.value = 1
		localRotate.value = 0
		emit('avatar-transform', {
			layerId: primaryLayerId.value,
			scale: 1,
			opacity: 1,
			rotate: 0,
			reset: true,
		})
	}

	watch(selectedSlot, () => { if (primaryLayerId.value) syncLocal() }, { deep: true })
	watch(() => props.editable, (v) => { if (!v) clearSelection() })
	watch(() => props.dialogueKey, () => { clearSelection() })

	const slotBoxStyle = (layerId: string) => {
		const base = props.slots[layerId]?.boxStyle || {}
		// 选中层临时提到最上，方便拖动被遮挡的立绘
		return isSelected(layerId) ? { ...base, zIndex: 60 } : base
	}

	const layerItems = computed(() => {
		const item = (
			key: string,
			label: string,
			exists: boolean,
			selectable: boolean,
			isAvatar = false,
			visible = props.stageVisibility[key] !== false,
			order = 0
		) => ({
			key,
			label,
			exists,
			selectable,
			isAvatar,
			visible,
			order,
			stateLabel: !exists
				? '空'
				: !visible
					? '已隐藏'
					: (isAvatar ? `层级 ${order}` : '已设置'),
		})
		const avatarItems = props.avatarLayers
			.slice()
			.sort((a, b) => b.order - a.order)
			.map(l => item(l.layer_id, l.label, l.exists, true, true, l.visible, l.order))
		return [
			item('background', '背景', props.bgAvailable, true),
			...avatarItems,
			item('foreground', '前景', props.fgAvailable, true),
			item('dialogue', '对话框', props.dialogueCount > 0, true),
		]
	})

	const onLayerClick = (e: MouseEvent, layer: any) => {
		if (!layer.selectable) return
		if (!layer.isAvatar) {
			// 背景/前景/对话框：点击切换显隐
			emit('stage-visibility', layer.key, !layer.visible)
			return
		}
		if (layer.exists) selectLayer(layer.key, e.ctrlKey || e.metaKey || e.shiftKey)
	}

	// 图层列表拖拽排序：把源图层拖到目标图层的位置，交换两者层级
	const dragLayerKey = ref<string | null>(null)
	const dragOverKey = ref<string | null>(null)
	const onLayerDragStart = (e: DragEvent, layer: any) => {
		if (!layer.isAvatar || !layer.exists) { e.preventDefault(); return }
		dragLayerKey.value = layer.key
		e.dataTransfer?.setData('text/plain', layer.key)
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
	}
	const onLayerDragOver = (_e: DragEvent, layer: any) => {
		if (!dragLayerKey.value || !layer.isAvatar || !layer.exists) return
		if (layer.key !== dragLayerKey.value) dragOverKey.value = layer.key
	}
	const onLayerDrop = (ev: DragEvent, layer: any) => {
		// 素材图片落到已有立绘层 → 替换该层图片
		const asset = readAssetDropPayload(ev)
		if (asset && isImageAssetUrl(asset.url) && layer.isAvatar && layer.exists) {
			ev.stopPropagation()
			dragLayerKey.value = null
			dragOverKey.value = null
			emit('avatar-replace-asset', layer.key, asset)
			return
		}
		const from = dragLayerKey.value
		const to = layer.key
		dragLayerKey.value = null
		dragOverKey.value = null
		if (!from || !to || from === to || !layer.isAvatar || !layer.exists) return
		emit('avatar-reorder', from, to)
	}
	const onLayerDragEnd = () => {
		dragLayerKey.value = null
		dragOverKey.value = null
	}

	interface DragState {
		layerIds: string[]
		starts: Record<string, { x: number; y: number }>
		startX: number
		startY: number
		dx: number
		dy: number
		unitW: number
		unitH: number
		els: HTMLElement[]
		moved: boolean
	}

	let drag: DragState | null = null

	const onDragMove = (e: PointerEvent) => {
		if (!drag) return
		drag.dx = e.clientX - drag.startX
		drag.dy = e.clientY - drag.startY
		if (Math.abs(drag.dx) + Math.abs(drag.dy) > 3) drag.moved = true
		// 用独立的 translate 属性做拖拽位移，不覆盖槽位本身的 transform
		for (const el of drag.els) {
			el.style.translate = `${drag.dx}px ${drag.dy}px`
		}
	}

	const onDragEnd = () => {
		window.removeEventListener('pointermove', onDragMove)
		window.removeEventListener('pointerup', onDragEnd)
		window.removeEventListener('pointercancel', onDragEnd)
		if (!drag) return
		const d = drag
		drag = null
		for (const el of d.els) el.style.translate = ''
		if (!d.moved) return
		const dxPct = d.dx / d.unitW * 100
		const dyPct = d.dy / d.unitH * 100
		// 网格吸附：开启后对齐到 gridStep 的整数倍，便于对齐左右/居中
		const snap = (v: number) => {
			const step = Number(props.gridSnap) || 0
			if (step <= 0) return v
			return Math.round(v / step) * step
		}
		const clamp = (v: number) => Math.max(0, Math.min(100, v))
		const updates = d.layerIds.map(layerId => {
			const base = d.starts[layerId] || { x: 50, y: 100 }
			return {
				layerId,
				x: Math.round(clamp(snap(base.x + dxPct)) * 10) / 10,
				y: Math.round(clamp(snap(base.y + dyPct)) * 10) / 10,
			}
		})
		emit('avatar-group-move', { updates })
	}

	const startDrag = (e: PointerEvent, layerId: string) => {
		if (!props.editable || !props.canEdit) return
		const multi = e.ctrlKey || e.metaKey || e.shiftKey
		if (multi) {
			selectLayer(layerId, true)
			e.preventDefault()
			e.stopPropagation()
			return
		}
		if (!isSelected(layerId)) {
			selectedLayerIds.value = [layerId]
			primaryLayerId.value = layerId
			syncLocal()
		}
		const ids = selectedLayerIds.value.length ? [...selectedLayerIds.value] : [layerId]
		const host = e.currentTarget as HTMLElement | null
		if (!host) return
		const img = host.querySelector('img') as HTMLImageElement | null
		const rect = (img || host).getBoundingClientRect()
		const stage = host.closest('.preview-container') as HTMLElement | null
		const stageRect = stage ? stage.getBoundingClientRect() : null
		const starts: Record<string, { x: number; y: number }> = {}
		for (const id of ids) {
			const slot = props.slots[id]
			if (slot) {
				starts[id] = { x: Number(slot.x) || 0, y: Number(slot.y) || 0 }
			} else if (id === layerId && stageRect && rect.width) {
				// 回退立绘：第一次拖拽时把当前视觉位置换算成舞台坐标
				starts[id] = {
					x: ((rect.left + rect.width / 2 - stageRect.left) / stageRect.width) * 100,
					y: ((rect.bottom - stageRect.top) / stageRect.height) * 100,
				}
			} else {
				starts[id] = { x: 50, y: 100 }
			}
		}
		const els: HTMLElement[] = []
		if (stage) {
			for (const node of Array.from(stage.querySelectorAll('[data-layer-id]')) as HTMLElement[]) {
				if (ids.includes(String(node.dataset.layerId))) els.push(node)
			}
		}
		if (!els.includes(host)) els.push(host)
		drag = {
			layerIds: ids,
			starts,
			startX: e.clientX,
			startY: e.clientY,
			dx: 0,
			dy: 0,
			unitW: stageRect?.width || rect.width || 1,
			unitH: stageRect?.height || rect.height || 1,
			els,
			moved: false,
		}
		try { host.setPointerCapture?.(e.pointerId) } catch (err) { /* 合成事件没有活动指针，忽略 */ }
		window.addEventListener('pointermove', onDragMove)
		window.addEventListener('pointerup', onDragEnd)
		window.addEventListener('pointercancel', onDragEnd)
		e.preventDefault()
		e.stopPropagation()
	}

	onBeforeUnmount(() => {
		window.removeEventListener('pointermove', onDragMove)
		window.removeEventListener('pointerup', onDragEnd)
		window.removeEventListener('pointercancel', onDragEnd)
		drag = null
	})
</script>

<style scoped src="./scene/stagePreviewPanel.css"></style>
<style scoped src="./scene/stagePreviewScene.css"></style>
<style scoped src="./scene/stagePreviewEffects.css"></style>
<style scoped src="./scene/stagePreviewDialogue.css"></style>
<style scoped src="./scene/stagePreviewResponsive.css"></style>
