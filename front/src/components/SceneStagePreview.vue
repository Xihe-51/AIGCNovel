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
			:disabled="!canEdit"
			:title="canEdit ? (editable ? '退出舞台编辑' : '拖动立绘调整位置') : '先保存当前台词再编辑舞台'"
			@click="$emit('toggle-edit')"
		>{{ editable ? '退出舞台编辑' : '舞台编辑' }}</button>

		<div v-if="editable && canEdit" class="stage-edit-hint">拖动立绘调整位置 · 松手自动保存</div>

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
					v-show="slots[pos]"
					:class="['preview-stage-avatar', 'pos-' + pos]"
					@pointerdown="startDrag($event, pos)"
				>
					<img :src="slots[pos]?.src" :style="slots[pos]?.style" alt="" @error="hideImage" />
				</div>
			</div>

			<!-- 回退：没有演出指令时，显示当前（或最近一位）说话角色的立绘 -->
			<div
				v-else-if="!loading && !error && avatarSrc"
				class="character-stand"
				:class="{ 'is-editing': editable }"
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
	import { ref, watch, onBeforeUnmount } from 'vue'
	import { ArrowLeft, ArrowRight, WarningFilled } from '@element-plus/icons-vue'
	import { BASE_URL } from '@/utils/request'

	interface StageSlot {
		src: string
		style?: Record<string, any>
		x?: number
		y?: number
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
	})

	const emit = defineEmits<{
		(e: 'toggle-panel'): void
		(e: 'toggle-bgm'): void
		(e: 'toggle-edit'): void
		(e: 'next'): void
		(e: 'restart'): void
		(e: 'avatar-move', payload: { position: string; x: number; y: number }): void
	}>()

	const bgFailed = ref(false)
	watch(() => props.bgSrc, () => { bgFailed.value = false })

	const hideImage = (e: Event) => {
		const img = e.target as HTMLImageElement | null
		if (img) img.style.visibility = 'hidden'
	}

	interface DragState {
		pos: string
		startX: number
		startY: number
		baseX: number
		baseY: number
		dx: number
		dy: number
		w: number
		h: number
		el: HTMLElement
		baseTransform: string
		moved: boolean
	}

	let drag: DragState | null = null

	const onDragMove = (e: PointerEvent) => {
		if (!drag) return
		drag.dx = e.clientX - drag.startX
		drag.dy = e.clientY - drag.startY
		if (Math.abs(drag.dx) + Math.abs(drag.dy) > 3) drag.moved = true
		drag.el.style.transform = `translate(${drag.dx}px, ${drag.dy}px) ${drag.baseTransform}`
	}

	const onDragEnd = () => {
		window.removeEventListener('pointermove', onDragMove)
		window.removeEventListener('pointerup', onDragEnd)
		window.removeEventListener('pointercancel', onDragEnd)
		if (!drag) return
		const d = drag
		drag = null
		d.el.style.transform = d.baseTransform
		if (!d.moved) return
		const x = Math.round((d.baseX + d.dx / d.w * 100) * 10) / 10
		const y = Math.round((d.baseY + d.dy / d.h * 100) * 10) / 10
		emit('avatar-move', { position: d.pos, x, y })
	}

	const startDrag = (e: PointerEvent, pos: string) => {
		if (!props.editable || !props.canEdit) return
		const host = e.currentTarget as HTMLElement | null
		if (!host) return
		const img = host.querySelector('img') as HTMLImageElement | null
		const rect = (img || host).getBoundingClientRect()
		const slot = props.slots[pos]
		drag = {
			pos,
			startX: e.clientX,
			startY: e.clientY,
			baseX: Number(slot?.x) || 0,
			baseY: Number(slot?.y) || 0,
			dx: 0,
			dy: 0,
			w: rect.width || 1,
			h: rect.height || 1,
			el: host,
			baseTransform: String(slot?.style?.transform || ''),
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
		height: 76%;
	}

	.preview-stage-avatar img {
		height: 100%;
		width: auto;
		object-fit: contain;
		display: block;
		animation: preview-breathe 6s ease-in-out infinite;
	}

	.preview-stage-avatar.pos-left { left: 5%; }
	.preview-stage-avatar.pos-center { left: 50%; transform: translateX(-50%); }
	.preview-stage-avatar.pos-right { right: 5%; }

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
