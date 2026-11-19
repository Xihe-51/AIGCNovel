<template>
	<div class="preview-panel">
		<div
			class="preview-container"
			:class="{ 'fx-shake': isShake, 'is-audio-drama': audioDrama }"
			:style="{ '--fx-amp': fxAmp }"
			@wheel.prevent="onWheel"
		>
			<!-- 背景图（切图时先淡出、换图后再淡入） -->
			<div class="scene-background" @click="emit('background-click')">
				<img
					:src="bgSrc"
					alt="场景背景"
					class="background-image"
					:class="{ 'bg-fading': bgFading }"
					decoding="async"
				/>
			</div>

			<!-- 黑场转场遮罩 -->
			<div class="bg-blackout" :class="{ 'is-on': bgBlackout }"></div>

			<!-- 演出指令控制的立绘：任意数量图层，按 order 叠放；每层可带差分叠加图 -->
			<div v-if="hasStageAvatars" class="stage-layer">
				<div
					v-for="layer in stageLayers"
					:key="layer.layer_id"
					v-show="layer.visible !== false"
					class="stage-avatar"
					:style="layer.boxStyle"
				>
					<div
						class="sprite-stack"
						:style="layer.style"
						:class="{ 'sprite-motion': spriteMotion }"
					>
						<template v-if="layer.placeholder">
							<div class="stage-avatar-placeholder">
								<span class="placeholder-silhouette"></span>
								<span v-if="layer.name" class="placeholder-name">{{ layer.name }}</span>
							</div>
						</template>
						<template v-else>
							<img
								v-for="(src, si) in (layer.sources && layer.sources.length ? layer.sources : [layer.src])"
								:key="si"
								:src="src"
								:class="{ 'sprite-overlay': si > 0 }"
								alt=""
								decoding="async"
							/>
						</template>
					</div>
				</div>
			</div>

			<!-- 回退：没有演出指令时，显示当前（或最近一位）说话角色的立绘 -->
			<div v-else-if="!loading && !error && previewAvatarLayers.length" class="character-stand">
				<div class="sprite-stack" :class="{ 'sprite-motion': spriteMotion }">
					<img
						v-for="(src, si) in previewAvatarLayers"
						:key="si"
						:src="src"
						alt="角色立绘"
						class="character-image"
						:class="{ 'sprite-overlay': si > 0 }"
						loading="lazy"
						decoding="async"
						@error="hideBrokenImage"
					/>
				</div>
			</div>

			<!-- 演出指令：前景图层（覆盖在立绘之上、对话框之下） -->
			<div v-if="fgSrc && showForeground" class="stage-foreground">
				<img :src="fgSrc" alt="" :class="{ 'fg-fading': fgFading }" decoding="async" />
			</div>

			<!-- 演出效果：天气覆盖层 / 闪光 -->
			<div v-if="weatherClass" class="fx-weather" :class="weatherClass"></div>
			<div v-if="isFlash" :key="flashKey" class="fx-flash" :style="flashStyle"></div>

			<!-- 演出「停顿」指令生效时的提示 -->
			<div v-if="isWaiting && !loading && !error" class="wait-hint">
				<span></span><span></span><span></span>
			</div>

			<!-- 变量变化提示：好感度 +5 / 线索 +1 -->
			<div v-if="variableNotices.length" class="var-notice-layer">
				<div
					v-for="n in variableNotices"
					:key="n.id"
					:class="['var-notice', { 'is-down': n.delta < 0 }]"
				>
					<span class="var-notice-icon">{{ n.delta > 0 ? '♥' : '−' }}</span>
					<span class="var-notice-label">{{ n.label }}</span>
					<span class="var-notice-delta">{{ n.delta > 0 ? '+' + n.delta : n.delta }}</span>
				</div>
			</div>

			<!-- 加载状态 -->
			<div v-if="loading" class="loading-indicator">
				<span class="ui-spinner ui-spinner-lg"></span>
				<p>{{ t('common.loading') }}</p>
			</div>

			<!-- 错误信息 -->
			<div v-if="error" class="error-message">
				<el-icon color="#F56C6C" size="24"><WarningFilled /></el-icon>
				<p>{{ t('common.error') }}: {{ error }}</p>
				<el-button type="primary" size="small" @click="emit('back-home')">{{ t('common.backToList') }}</el-button>
			</div>

			<!-- 叠在舞台之上的浮层：历史回想、对话框等由父级投放 -->
			<slot />
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import { hideBrokenImage } from '@/utils/dom'
import { playerText } from '@/utils/playerI18n'

export interface StageLayerView {
	layer_id: string | number
	visible?: boolean
	boxStyle?: Record<string, string>
	style?: Record<string, string>
	src?: string
	sources?: string[]
	placeholder?: boolean
	name?: string
}

export interface StageEffectView {
	key?: string | number
	effect: string
	intensity?: number
	weather?: string
	color?: string
	duration_ms?: number
}

export interface VariableNoticeView {
	id: string | number
	label: string
	delta: number
}

// 舞台只负责「画面」：背景、立绘、前景、天气/闪光/震动、变量浮层、加载与错误。
// 播放流程、定时器、素材归属全部留在父级，这里只按数据渲染并抛出交互事件。
const props = withDefaults(defineProps<{
	language: string
	bgSrc: string
	bgFading?: boolean
	bgBlackout?: boolean
	stageLayers?: StageLayerView[]
	hasStageAvatars?: boolean
	previewAvatarLayers?: string[]
	fgSrc?: string
	fgFading?: boolean
	showForeground?: boolean
	activeEffect?: StageEffectView | null
	isWaiting?: boolean
	variableNotices?: VariableNoticeView[]
	audioDrama?: boolean
	spriteMotion?: boolean
	loading?: boolean
	error?: string
}>(), {
	bgSrc: '',
	bgFading: false,
	bgBlackout: false,
	stageLayers: () => [],
	hasStageAvatars: false,
	previewAvatarLayers: () => [],
	fgSrc: '',
	fgFading: false,
	showForeground: true,
	activeEffect: null,
	isWaiting: false,
	variableNotices: () => [],
	audioDrama: false,
	spriteMotion: false,
	loading: false,
	error: '',
})

const emit = defineEmits<{
	(e: 'background-click'): void
	(e: 'wheel-up'): void
	(e: 'back-home'): void
}>()

const t = (key: string) => playerText(props.language, key)

const isShake = computed(() => !!props.activeEffect && props.activeEffect.effect === 'shake')

const fxAmp = computed(() => {
	const fx = props.activeEffect
	return ((fx && fx.intensity ? fx.intensity : 5) + 'px')
})

const weatherClass = computed(() => {
	const fx = props.activeEffect
	if (!fx || fx.effect !== 'weather') return ''
	return 'fx-' + (fx.weather || 'rain')
})

const isFlash = computed(() => !!props.activeEffect && props.activeEffect.effect === 'flash')

const flashKey = computed(() => (props.activeEffect ? props.activeEffect.key : ''))

const flashStyle = computed(() => {
	const fx = props.activeEffect
	return {
		background: (fx && fx.color) || '#ffffff',
		animationDuration: ((fx && fx.duration_ms) || 0) + 'ms',
	}
})

const onWheel = (e: WheelEvent) => {
	if (e.deltaY < 0) emit('wheel-up')
}
</script>

<style scoped lang="scss" src="./playerPreviewStage.scss"></style>
