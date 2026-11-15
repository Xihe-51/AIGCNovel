/**
 * 播放器文字呈现：逐字打字、补全、自动前进排期。
 *
 * 只负责「文字怎么出现」和「何时自动翻页」，剧情推进本身通过注入回调触发，
 * 因此可以脱离播放流程单独测试计时与守卫行为。
 */
import type { Ref } from 'vue'
import { ref } from 'vue'

export interface PlayerTypewriterContext {
  /** 当前整句文本 */
  getFullText: () => string
  /** 文字速度：0 立即显示 / 1 慢 / 2 中 / 3 快 */
  getSpeed: () => number
  /** 是否允许自动前进（自动播放开启、正在播放、无选项、未在停顿） */
  canAutoAdvance: () => boolean
  /** 自动前进间隔（秒） */
  getAutoDelay: () => number
  /** 自动前进到下一句 */
  onAdvance: () => void
}

export interface PlayerTypewriterState {
  displayedText: Ref<string>
  isTyping: Ref<boolean>
}

// 1 = 15ms / 2 = 30ms / 其余（含 3 与未知值）= 60ms
export const typeIntervalOf = (speed: number): number => {
  const value = Number(speed) || 0
  if (value === 1) return 15
  if (value === 2) return 30
  return 60
}

/** 自动前进的最小间隔，避免设置过小导致疯狂翻页 */
export const MIN_AUTO_DELAY_MS = 500

export function usePlayerTypewriter(ctx: PlayerTypewriterContext, state?: PlayerTypewriterState) {
  const displayedText = state?.displayedText ?? ref('')
  const isTyping = state?.isTyping ?? ref(false)
  let typingTimer: ReturnType<typeof setInterval> | null = null
  let typeIndex = 0
  let autoTimer: ReturnType<typeof setTimeout> | null = null

  const clearTyping = () => {
    if (typingTimer) {
      clearInterval(typingTimer)
      typingTimer = null
    }
  }

  const clearAutoTimer = () => {
    if (autoTimer) {
      clearTimeout(autoTimer)
      autoTimer = null
    }
  }

  const scheduleAutoAdvanceAfter = (ms: number) => {
    clearAutoTimer()
    autoTimer = setTimeout(() => {
      autoTimer = null
      ctx.onAdvance()
    }, Math.max(0, Number(ms) || 0))
  }

  const scheduleAutoAdvance = () => {
    clearAutoTimer()
    if (!ctx.canAutoAdvance()) return
    scheduleAutoAdvanceAfter(Math.max(MIN_AUTO_DELAY_MS, Number(ctx.getAutoDelay()) * 1000))
  }

  const finishTyping = () => {
    clearTyping()
    displayedText.value = ctx.getFullText()
    isTyping.value = false
    scheduleAutoAdvance()
  }

  // 按当前速度逐字显示整句；速度为 0 或文本为空时直接整句呈现
  const typeOut = () => {
    clearTyping()
    const full = ctx.getFullText()
    const speed = Number(ctx.getSpeed()) || 0
    if (!full || speed === 0) {
      displayedText.value = full
      isTyping.value = false
      scheduleAutoAdvance()
      return
    }
    displayedText.value = ''
    isTyping.value = true
    typeIndex = 0
    typingTimer = setInterval(() => {
      typeIndex += 1
      displayedText.value = full.slice(0, typeIndex)
      if (typeIndex >= full.length) finishTyping()
    }, typeIntervalOf(speed))
  }

  // 离开播放器时清掉计时器
  const disposeTypewriter = () => {
    clearTyping()
    clearAutoTimer()
  }

  return {
    displayedText,
    isTyping,
    clearTyping,
    finishTyping,
    typeOut,
    scheduleAutoAdvance,
    scheduleAutoAdvanceAfter,
    clearAutoTimer,
    disposeTypewriter,
  }
}
