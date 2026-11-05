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

		<div v-if="editable && canEdit" class="stage-edit-hint">拖动立绘调整位置 · 松手自动保存</div>

		<div v-if="editable" class="stage-layers">
			<div class="stage-layers-title">图层</div>
			<button
				v-for="layer in layerItems"
				:key="layer.key"
				type="button"
				:class="['stage-layer', { 'is-active': selectedPos === layer.key, 'is-empty': !layer.exists, 'is-hidden': layer.isAvatar && !layer.visible, 'is-dragging': dragLayerKey === layer.key }]"
				:disabled="!layer.selectable"
				:draggable="layer.isAvatar && layer.exists"
				:title="layer.selectable && !layer.exists ? '点击添加立绘' : (layer.isAvatar && layer.exists ? '拖动可调整层级' : '')"
				@click="onLayerClick(layer)"
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
				</span>
			</button>
			<button type="button" class="stage-layer-undo" :disabled="!canUndo" @click="$emit('undo')">↶ 撤销上一步</button>
			<button
				type="button"
				class="stage-layer-undo"
				:class="{ 'is-on': gridSnap > 0 }"
				@click="$emit('toggle-grid')"
			>{{ gridSnap > 0 ? '⊞ 网格吸附：开' : '⊞ 网格吸附：关' }}</button>
		</div>

		<div v-if="editable && canEdit && selectedPos" class="stage-inspector" @pointerdown.stop>
			<div class="stage-inspector-title">{{ positionLabel(selectedPos) }}立绘</div>
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
				<button type="button" class="stage-inspector-btn is-ghost" @click="selectedPos = null">关闭</button>
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
			:class="{ 'fx-shake': activeEffect && activeEffect.effect === 'shake', 'is-editing': editable }"
			:style="{ '--fx-amp': (activeEffect && activeEffect.intensity ? activeEffect.intensity : 5) + 'px' }"
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

			<!-- 演出指令控制的立绘（左 / 中 / 右） -->
			<div v-if="!loading && !error && hasSlots" class="preview-stage" :class="{ 'is-editing': editable }">
				<div
					v-for="pos in ['left', 'center', 'right']"
					:key="pos"
					v-show="slots[pos] && slots[pos]?.visible !== false"
					:class="['preview-stage-avatar', 'pos-' + pos, { 'is-selected': selectedPos === pos }]"
					:style="slotBoxStyle(pos)"
					@pointerdown="startDrag($event, pos)"
				>
					<img :src="slots[pos]?.src" :style="slots[pos]?.style" alt="" @error="hideImage" />
				</div>
			</div>

			<!-- 回退：没有演出指令时，显示当前（或最近一位）说话角色的立绘 -->
			<div
				v-else-if="!loading && !error && avatarSrc"
				class="character-stand"
				:class="['character-stand', { 'is-editing': editable, 'is-selected': selectedPos === 'center' }]"
				@pointerdown="startDrag($event, 'center')"
			>
				<img
					:src="avatarSrc"
					alt="角色立绘"
					class="character-image"
					@error="hideImage"
				/>
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
		z?: number
		x?: number
		y?: number
		scale?: number
		opacity?: number
		rotate?: number
		position?: string
	}

	const props = withDefaults(defineProps<{
		bgSrc?: string
		avatarSrc?: string
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
		avatarLayers?: { position: string; label: string; exists: boolean; visible: boolean; z: number }[]
	}>(), {
		bgSrc: '',
		avatarSrc: '',
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
	})

	const emit = defineEmits<{
		(e: 'toggle-panel'): void
		(e: 'toggle-bgm'): void
		(e: 'toggle-edit'): void
		(e: 'next'): void
		(e: 'restart'): void
		(e: 'avatar-move', payload: { position: string; x: number; y: number; coord?: string }): void
		(e: 'avatar-transform', payload: { position: string; scale?: number; opacity?: number; rotate?: number; x?: number; y?: number; reset?: boolean }): void
		(e: 'avatar-add', position: string): void
		(e: 'avatar-visibility', position: string, visible: boolean): void
		(e: 'avatar-order', position: string, direction: 'up' | 'down'): void
		(e: 'avatar-reorder', from: string, to: string): void
		(e: 'stage-visibility', layerKey: string, visible: boolean): void
		(e: 'undo'): void
		(e: 'toggle-grid'): void
	}>()

	const bgFailed = ref(false)
	watch(() => props.bgSrc, () => { bgFailed.value = false })

	const hideImage = (e: Event) => {
		const img = e.target as HTMLImageElement | null
		if (img) img.style.visibility = 'hidden'
	}

	// 选中图层 + 属性条（画布 v2）
	const selectedPos = ref<string | null>(null)
	const localScale = ref(1)
	const localOpacity = ref(1)
	const localRotate = ref(0)
	const selectedSlot = computed(() => (selectedPos.value ? props.slots[selectedPos.value] : null))
	const positionLabel = (pos: string) => ({ left: '左', center: '中', right: '右' }[pos] || pos)

	const syncLocal = () => {
		const slot = selectedSlot.value
		localScale.value = Number(slot?.scale) || 1
		localOpacity.value = slot?.opacity === undefined || slot?.opacity === null ? 1 : Number(slot.opacity)
		localRotate.value = Number(slot?.rotate) || 0
	}

	const selectSlot = (pos: string) => {
		if (!props.editable || !props.canEdit) return
		selectedPos.value = pos
		syncLocal()
	}

	const applyTransform = () => {
		if (!selectedPos.value) return
		emit('avatar-transform', {
			position: selectedPos.value,
			scale: Number(localScale.value) || 1,
			opacity: localOpacity.value === undefined || localOpacity.value === null ? 1 : Number(localOpacity.value),
			rotate: Number(localRotate.value) || 0,
		})
	}

	const resetTransform = () => {
		if (!selectedPos.value) return
		localScale.value = 1
		localOpacity.value = 1
		localRotate.value = 0
		emit('avatar-transform', {
			position: selectedPos.value,
			scale: 1,
			opacity: 1,
			rotate: 0,
			reset: true,
		})
	}

	watch(selectedSlot, () => { if (selectedPos.value) syncLocal() }, { deep: true })
	watch(() => props.editable, (v) => { if (!v) selectedPos.value = null })
	watch(() => props.dialogueKey, () => { selectedPos.value = null })

	const avatarLayerInfo = (pos: string) => props.avatarLayers.find(l => l.position === pos)
	const slotBoxStyle = (pos: string) => {
		const base = props.slots[pos]?.boxStyle || {}
		// 选中层临时提到最上，方便拖动被遮挡的立绘
		return selectedPos.value === pos ? { ...base, zIndex: 60 } : base
	}
	const layerItems = computed(() => {
		const item = (key: string, label: string, exists: boolean, selectable: boolean) => {
			const info = selectable && ['left', 'center', 'right'].includes(key) ? avatarLayerInfo(key) : null
			const visible = info
				? info.visible
				: (props.stageVisibility[key] !== false)
			return {
				key,
				label,
				exists,
				selectable,
				isAvatar: ['left', 'center', 'right'].includes(key),
				visible,
				z: info ? info.z : 0,
				stateLabel: !exists
					? '空'
					: !visible
						? '已隐藏'
						: (info ? (info.z ? `层级 ${info.z}` : '可选中') : '已设置'),
			}
		}
		return [
			item('background', '背景', props.bgAvailable, true),
			// 立绘按层级从高到低展示，列表顺序即舞台前后顺序
			...['left', 'center', 'right']
				.map((key, idx) => ({
					item: item(key, { left: '左立绘', center: '中立绘', right: '右立绘' }[key] || key, !!props.slots[key], true),
					idx
				}))
				.sort((a, b) => (b.item.z - a.item.z) || (a.idx - b.idx))
				.map(x => x.item),
			item('foreground', '前景', props.fgAvailable, true),
			item('dialogue', '对话框', props.dialogueCount > 0, true),
		]
	})

	const onLayerClick = (layer: any) => {
		if (!layer.selectable) return
		if (!layer.isAvatar) {
			// 背景/前景/对话框：点击切换显隐
			emit('stage-visibility', layer.key, !layer.visible)
			return
		}
		if (layer.exists) {
			selectSlot(layer.key)
			return
		}
		// 空槽位：先选中，再让父组件用当前说话角色补一条 avatar 指令
		selectedPos.value = layer.key
		syncLocal()
		emit('avatar-add', layer.key)
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
	const onLayerDrop = (_e: DragEvent, layer: any) => {
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
		pos: string
		startX: number
		startY: number
		baseX: number
		baseY: number
		dx: number
		dy: number
		unitW: number
		unitH: number
		el: HTMLElement
		moved: boolean
	}

	let drag: DragState | null = null

	const onDragMove = (e: PointerEvent) => {
		if (!drag) return
		drag.dx = e.clientX - drag.startX
		drag.dy = e.clientY - drag.startY
		if (Math.abs(drag.dx) + Math.abs(drag.dy) > 3) drag.moved = true
		// 用独立的 translate 属性做拖拽位移，不覆盖槽位本身的 transform
		drag.el.style.translate = `${drag.dx}px ${drag.dy}px`
	}

	const onDragEnd = () => {
		window.removeEventListener('pointermove', onDragMove)
		window.removeEventListener('pointerup', onDragEnd)
		window.removeEventListener('pointercancel', onDragEnd)
		if (!drag) return
		const d = drag
		drag = null
		d.el.style.translate = ''
		if (!d.moved) return
		const rawX = d.baseX + d.dx / d.unitW * 100
		const rawY = d.baseY + d.dy / d.unitH * 100
		// 网格吸附：开启后对齐到 gridStep 的整数倍，便于对齐左右/居中
		const snap = (v: number) => {
			const step = Number(props.gridSnap) || 0
			if (step <= 0) return v
			return Math.round(v / step) * step
		}
		const x = Math.round(snap(rawX) * 10) / 10
		const y = Math.round(snap(rawY) * 10) / 10
		emit('avatar-move', { position: d.pos, x, y, coord: 'stage' })
	}

	const startDrag = (e: PointerEvent, pos: string) => {
		if (!props.editable || !props.canEdit) return
		selectSlot(pos)
		const host = e.currentTarget as HTMLElement | null
		if (!host) return
		const img = host.querySelector('img') as HTMLImageElement | null
		const rect = (img || host).getBoundingClientRect()
		const stage = host.closest('.preview-container') as HTMLElement | null
		const stageRect = stage ? stage.getBoundingClientRect() : null
		const slot = props.slots[pos]
		let baseX = 50
		let baseY = 100
		if (slot?.coord === 'stage') {
			baseX = Number(slot.x) || 0
			baseY = Number(slot.y) || 0
		} else if (stageRect && rect.width) {
			// 旧 sprite 坐标 / 回退立绘：第一次拖拽时把当前视觉位置换算成舞台坐标
			baseX = ((rect.left + rect.width / 2 - stageRect.left) / stageRect.width) * 100
			baseY = ((rect.bottom - stageRect.top) / stageRect.height) * 100
		}
		drag = {
			pos,
			startX: e.clientX,
			startY: e.clientY,
			baseX,
			baseY,
			dx: 0,
			dy: 0,
			unitW: stageRect?.width || rect.width || 1,
			unitH: stageRect?.height || rect.height || 1,
			el: host,
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

<style scoped>
	.preview-panel { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; }

	.bgm-toggle-btn {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 50;
		padding: 5px 10px;
		border-radius: 14px;
		border: 1px solid #ffc0d0;
		background: rgba(255, 255, 255, 0.92);
		color: #c81f4a;
		font-size: 11px;
		cursor: pointer;
		box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
	}

	.bgm-toggle-btn.is-muted {
		border-color: #d9d9e3;
		color: #8a8a99;
		background: rgba(248, 248, 250, 0.92);
	}

	.stage-edit-btn {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 50;
		padding: 5px 10px;
		border-radius: 14px;
		border: 1px solid #ffc0d0;
		background: rgba(255, 255, 255, 0.92);
		color: #c81f4a;
		font-size: 11px;
		cursor: pointer;
		box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
	}

	.stage-edit-btn.is-active {
		background: #e8467c;
		border-color: #e8467c;
		color: #fff;
	}

	.stage-edit-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.stage-edit-hint {
		position: absolute;
		top: 14px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		padding: 5px 12px;
		border-radius: 14px;
		background: rgba(61, 43, 50, 0.72);
		color: #fff;
		font-size: 11px;
		pointer-events: none;
		white-space: nowrap;
	}

	.stage-layers {
		position: absolute;
		top: 52px;
		left: 12px;
		z-index: 60;
		width: 186px;
		padding: 8px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.96);
		border: 1px solid #ffc0d0;
		box-shadow: 0 8px 24px rgba(61, 43, 50, 0.16);
	}

	.stage-layers-title {
		margin: 0 2px 6px;
		font-size: 11px;
		font-weight: 600;
		color: #c81f4a;
	}

	.stage-layer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 5px 6px;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: #5d4650;
		font-size: 11px;
		cursor: pointer;
		text-align: left;
	}

	.stage-layer:hover:not(:disabled) {
		background: #fdeef3;
	}

	.stage-layer.is-active {
		background: #fdeef3;
		color: #c81f4a;
		font-weight: 600;
	}

	.stage-layer:disabled {
		cursor: default;
		color: #b9a7ae;
	}

	.stage-layer.is-empty {
		opacity: 0.7;
	}

	.stage-layer-state {
		font-size: 9px;
		color: #b99aa5;
		flex-shrink: 0;
	}

	.stage-layer.is-hidden {
		opacity: 0.55;
	}

	.stage-layer.is-dragging {
		opacity: 0.4;
	}

	.stage-layer[draggable='true'] {
		cursor: grab;
	}

	.stage-layer[draggable='true']:active {
		cursor: grabbing;
	}

	.stage-layer.is-hidden .stage-layer-state {
		color: #c81f4a;
	}

	.stage-layer-ops {
		display: inline-flex;
		gap: 2px;
		margin-left: 4px;
	}

	.stage-layer-op {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 4px;
		background: #fff2f6;
		color: #c81f4a;
		font-size: 11px;
		line-height: 1;
		cursor: pointer;
	}

	.stage-layer-op:hover {
		background: #fbd9e4;
	}

	.stage-layer-undo {
		width: 100%;
		margin-top: 6px;
		padding: 5px 0;
		border: 1px solid #f0c8d6;
		border-radius: 7px;
		background: #fff;
		color: #a84463;
		font-size: 11px;
		cursor: pointer;
	}

	.stage-layer-undo:hover:not(:disabled) {
		background: #fdeef3;
	}

	.stage-layer-undo:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.stage-layer-undo.is-on {
		background: #fdeef3;
		border-color: #e8467c;
		color: #c81f4a;
		font-weight: 600;
	}

	.preview-stage-avatar.is-selected,
	.character-stand.is-selected {
		outline: 2px dashed #e8467c;
		outline-offset: 4px;
	}

	.stage-inspector {
		position: absolute;
		top: 52px;
		right: 12px;
		z-index: 60;
		width: 208px;
		padding: 10px 12px 12px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.96);
		border: 1px solid #ffc0d0;
		box-shadow: 0 8px 24px rgba(61, 43, 50, 0.16);
	}

	.stage-inspector-title {
		margin-bottom: 8px;
		font-size: 12px;
		font-weight: 600;
		color: #c81f4a;
	}

	.stage-inspector-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 6px;
		font-size: 11px;
		color: #6b4a56;
	}

	.stage-inspector-row :deep(.el-input-number) {
		width: 104px;
	}

	.stage-inspector-actions {
		display: flex;
		gap: 6px;
		margin-top: 8px;
	}

	.stage-inspector-btn {
		flex: 1;
		padding: 5px 0;
		border: 1px solid #f0c8d6;
		border-radius: 7px;
		background: #fff2f6;
		color: #c81f4a;
		font-size: 11px;
		cursor: pointer;
	}

	.stage-inspector-btn.is-ghost {
		background: #fff;
		border-color: #e5e0e3;
		color: #8a6b76;
	}

	.preview-container.is-editing {
		box-shadow: inset 0 0 0 2px rgba(232, 70, 124, 0.35);
	}

	.preview-stage.is-editing {
		pointer-events: none;
	}

	.preview-stage.is-editing .preview-stage-avatar {
		pointer-events: auto;
		cursor: grab;
		touch-action: none;
	}

	.preview-stage.is-editing .preview-stage-avatar:active {
		cursor: grabbing;
	}

	.character-stand.is-editing {
		pointer-events: auto;
		cursor: grab;
		touch-action: none;
	}

	.character-stand.is-editing:active {
		cursor: grabbing;
	}

	.panel-toggle-btn {
		position: absolute;
		top: 50%;
		left: calc(100% - 68px);
		transform: translateY(-50%);
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid #ffc0d0;
		color: #c81f4a;
		cursor: pointer;
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 50;
		transition: all 0.3s ease;
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.12);
	}

	.panel-toggle-btn:hover {
		background: #ffffff;
		transform: translateY(-50%) scale(1.12);
		box-shadow: 0 6px 20px rgba(255, 123, 156, 0.18);
	}

	.toggle-hidden { left: calc(100% - 68px); }

	.preview-container { width: 100%; height: 100%; position: relative; overflow: hidden; }
	.scene-background { width: 100%; height: 100%; position: relative; z-index: 1; }

	.background-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: filter 0.4s ease;
	}

	.bg-missing-tip {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		color: #b37d8f;
		background: linear-gradient(135deg, #fdf2f8 0%, #f8e6ee 100%);
		text-align: center;
		padding: 20px;
		z-index: 1;
	}

	.character-stand {
		position: absolute;
		bottom: 0;
		left: 200px;
		z-index: 2;
		height: 80%;
		width: auto;
		pointer-events: none;
		filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.2));
	}

	.character-image {
		height: 100%;
		width: auto;
		object-fit: contain;
		transition: opacity 0.3s ease;
		animation: preview-breathe 6s ease-in-out infinite;
	}

	@keyframes preview-breathe {
		0%, 100% { translate: 0 0; }
		50% { translate: 0 -8px; }
	}

	@media (prefers-reduced-motion: reduce) {
		.character-image,
		.preview-stage-avatar img { animation: none; }
	}

	.preview-stage {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
	}

	.preview-stage-avatar {
		position: absolute;
		bottom: 0;
		height: 78%;
		z-index: 1;
	}

	.preview-stage-avatar img {
		height: 100%;
		width: auto;
		object-fit: contain;
		display: block;
		animation: preview-breathe 6s ease-in-out infinite;
	}

	.preview-stage-avatar.pos-left { left: 4%; }
	.preview-stage-avatar.pos-center { left: 50%; transform: translateX(-50%); }
	.preview-stage-avatar.pos-right { right: 4%; }

	.preview-foreground {
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
	}

	.preview-foreground img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.fx-flash {
		position: absolute;
		inset: 0;
		z-index: 9;
		pointer-events: none;
		animation-name: fxFlashFade;
		animation-timing-function: ease-out;
		animation-fill-mode: forwards;
	}

	@keyframes fxFlashFade {
		0% { opacity: 0; }
		12% { opacity: 0.92; }
		100% { opacity: 0; }
	}

	.preview-container.fx-shake {
		animation: fxShake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	}

	@keyframes fxShake {
		10%, 90% { transform: translate3d(calc(var(--fx-amp) * -0.5), 0, 0); }
		20%, 80% { transform: translate3d(var(--fx-amp), 0, 0); }
		30%, 50%, 70% { transform: translate3d(calc(var(--fx-amp) * -1), 0, 0); }
		40%, 60% { transform: translate3d(var(--fx-amp), 0, 0); }
	}

	.fx-weather {
		position: absolute;
		inset: 0;
		z-index: 4;
		pointer-events: none;
		overflow: hidden;
	}

	.fx-weather.fx-rain {
		background-image: repeating-linear-gradient(
			105deg,
			rgba(174, 214, 241, 0) 0 7px,
			rgba(174, 214, 241, 0.5) 7px 9px
		);
		animation: fxRainFall 0.55s linear infinite;
		opacity: 0.75;
	}

	@keyframes fxRainFall {
		from { background-position: 0 0; }
		to { background-position: 0 240px; }
	}

	.fx-weather.fx-snow {
		background-image:
			radial-gradient(circle, rgba(255, 255, 255, 0.95) 1.6px, transparent 2px),
			radial-gradient(circle, rgba(255, 255, 255, 0.7) 1.2px, transparent 1.8px);
		background-size: 120px 160px, 90px 120px;
		animation: fxSnowFall 3s linear infinite;
	}

	@keyframes fxSnowFall {
		from { background-position: 0 0, 40px 60px; }
		to { background-position: 40px 200px, -20px 260px; }
	}

	.fx-weather.fx-wind {
		background-image: repeating-linear-gradient(
			90deg,
			rgba(255, 255, 255, 0) 0 36px,
			rgba(255, 255, 255, 0.35) 36px 72px
		);
		animation: fxWindBlow 0.9s linear infinite;
		opacity: 0.35;
	}

	@keyframes fxWindBlow {
		from { background-position: -20% 0; }
		to { background-position: 120% 0; }
	}

	.loading-indicator {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		background: rgba(255, 255, 255, 0.88);
		padding: 24px 32px;
		border-radius: 16px;
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
		z-index: 10;
		backdrop-filter: blur(4px);
	}

	.error-message {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		background: rgba(247, 91, 91, 0.9);
		color: white;
		padding: 24px 32px;
		border-radius: 16px;
		display: flex;
		align-items: center;
		gap: 12px;
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12);
		z-index: 10;
		backdrop-filter: blur(4px);
	}

	.dialogue-display { position: absolute; bottom: 0; left: 0; right: 0; padding: 20px; z-index: 3; }

	.dialogue-box {
		background: rgba(255, 252, 254, 0.94);
		border-radius: 12px;
		padding: 20px;
		max-width: 800px;
		margin: 0 auto;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
		cursor: pointer;
		transition: transform 0.25s, box-shadow 0.25s;
		position: relative;
		border: 1px solid rgba(255, 192, 208, 0.3);
		backdrop-filter: blur(6px);
	}

	.dialogue-box:hover { transform: translateY(-4px); box-shadow: 0 15px 35px rgba(0, 0, 0, 0.18); }

	.character-name {
		font-weight: 700;
		color: #c81f4a;
		font-size: 16px;
		margin-bottom: 10px;
		display: inline-block;
		padding-bottom: 4px;
		border-bottom: 2px solid #ffc0d0;
	}

	.dialogue-text {
		font-size: 18px;
		line-height: 1.7;
		color: #2c2c2c;
		margin-bottom: 15px;
		min-height: 100px;
		font-weight: 400;
	}

	.dialogue-audio { display: none; }

	.continue-indicator {
		position: absolute;
		bottom: 18px;
		right: 28px;
		color: #ff7b9c;
		animation: bounce 1.6s infinite ease-in-out;
		font-weight: bold;
	}

	@keyframes bounce {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(6px); }
	}

	.dialogue-end, .no-dialogues-preview {
		text-align: center;
		background: rgba(255, 252, 254, 0.94);
		padding: 28px;
		border-radius: 20px;
		max-width: 520px;
		margin: 0 auto;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
		border: 1px solid rgba(255, 192, 208, 0.3);
	}

	@media (max-width: 1200px) {
		.character-stand { left: 24px; height: 72%; }
	}

	@media (max-width: 768px) {
		.dialogue-text { font-size: 17px; }
		.toggle-hidden { left: calc(100% - 68px); }
		.character-stand { left: 12px; height: 62%; }
	}
</style>
