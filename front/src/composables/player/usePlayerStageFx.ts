/**
 * 演出时序：画面效果（震屏 / 天气 / 闪光）与「停顿」的定时编排。
 *
 * 两者都只持有自己的定时器与可见状态；停顿结束后如何续接自动播放
 * 通过注入回调决定，因此可以脱离播放流程单独测试计时行为。
 */
import { nextTick, ref } from 'vue'

export interface StageEffectPayload {
  effect?: string
  duration_ms?: number | string
  intensity?: number
  weather?: string
  color?: string
  [key: string]: any
}

export interface PlayerStageFxContext {
  /** 停顿结束后恢复自动播放节奏 */
  scheduleAutoAdvance: () => void
}

// 效果时长夹取：至少 100ms；天气类默认 3s，其余默认 400ms
export const resolveEffectDuration = (payload: StageEffectPayload | null | undefined): number =>
  Math.max(100, Number(payload?.duration_ms) || (payload?.effect === 'weather' ? 3000 : 400))

export function usePlayerStageFx(ctx: PlayerStageFxContext) {
  const activeEffect = ref<StageEffectPayload | null>(null)
  const isWaiting = ref(false)
  let effectTimer: ReturnType<typeof setTimeout> | null = null
  let waitTimer: ReturnType<typeof setTimeout> | null = null

  const clearEffect = () => {
    if (effectTimer) {
      clearTimeout(effectTimer)
      effectTimer = null
    }
    activeEffect.value = null
  }

  // 立即清场，下一帧再挂上新效果，保证同名效果能重播动画
  const triggerEffect = (payload: StageEffectPayload | null | undefined) => {
    clearEffect()
    if (!payload) return
    const duration = resolveEffectDuration(payload)
    nextTick(() => {
      activeEffect.value = { ...payload, duration_ms: duration, key: Date.now() }
      effectTimer = setTimeout(() => {
        effectTimer = null
        activeEffect.value = null
      }, duration)
    })
  }

  const clearWait = () => {
    if (waitTimer) {
      clearTimeout(waitTimer)
      waitTimer = null
    }
    isWaiting.value = false
  }

  // 按毫秒数阻塞推进：停顿期间点击/自动播放都不生效，结束后恢复自动节奏
  const scheduleWait = (ms: number | string | null | undefined) => {
    clearWait()
    const delay = Math.max(0, Number(ms) || 0)
    if (!delay) return
    isWaiting.value = true
    waitTimer = setTimeout(() => {
      waitTimer = null
      isWaiting.value = false
      ctx.scheduleAutoAdvance()
    }, delay)
  }

  // 离开播放器时清掉效果与停顿计时器
  const disposeStageFx = () => {
    clearEffect()
    clearWait()
  }

  return {
    activeEffect,
    isWaiting,
    clearEffect,
    triggerEffect,
    clearWait,
    scheduleWait,
    disposeStageFx,
  }
}
