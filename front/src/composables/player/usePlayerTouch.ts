/**
 * 移动端触控：竖屏旋转提示、上下滑动切换回想/隐藏对话、滑动后吞掉补发的 click。
 *
 * 对话显隐状态与翻页动作通过适配器注入，composable 只负责手势判定与提示持久化，
 * 不直接持有播放位置或对话状态。
 */
import { ref, type Ref } from 'vue'

/** 触发纵向滑动的最小位移（px） */
export const TOUCH_SWIPE_THRESHOLD = 60
/** 滑动后抑制合成 click 的时长（ms） */
export const CLICK_SUPPRESS_DELAY = 350
/** 旋转提示「已知道」的会话级标记 */
export const ROTATE_HINT_KEY = 'aigc:rotateHintDismissed'
/** 低于该宽度才视为需要旋转提示的窄屏 */
export const ROTATE_HINT_MAX_WIDTH = 900

export interface PlayerTouchContext {
  /** 历史回想面板是否展开 */
  getShowHistory: () => boolean
  setShowHistory: (value: boolean) => void
  /** 对话框是否可见 */
  getShowDialogueBox: () => boolean
  setShowDialogueBox: (value: boolean) => void
  /** 正常点击对话区的翻页动作 */
  nextDialogue: () => void
}

export function usePlayerTouch(ctx: PlayerTouchContext) {
  const showRotateHint: Ref<boolean> = ref(false)
  const touchStart = { x: 0, y: 0, t: 0 }
  let suppressClick = false

  const onTouchStart = (e: any) => {
    const t = e.touches && e.touches[0]
    if (!t) return
    touchStart.x = t.clientX
    touchStart.y = t.clientY
    touchStart.t = Date.now()
  }

  const onTouchEnd = (e: any) => {
    const t = e.changedTouches && e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - touchStart.x
    const dy = t.clientY - touchStart.y

    // 只处理明显的纵向滑动，避免和横向误触冲突
    if (Math.abs(dy) > TOUCH_SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
      suppressClick = true
      setTimeout(() => { suppressClick = false }, CLICK_SUPPRESS_DELAY)
      if (dy < 0) {
        // 上滑：打开完整回想
        ctx.setShowHistory(true)
      } else if (ctx.getShowHistory()) {
        // 下滑：先关回想
        ctx.setShowHistory(false)
      } else {
        // 下滑：隐藏 UI，沉浸阅读
        ctx.setShowDialogueBox(false)
      }
    }
  }

  // 触控滑动后，浏览器还会补一个 click，这里吃掉它
  const onDialogueClick = () => {
    if (suppressClick) {
      suppressClick = false
      return
    }
    ctx.nextDialogue()
  }

  const updateOrientation = () => {
    const portrait = window.matchMedia('(orientation: portrait)').matches
      && window.innerWidth < ROTATE_HINT_MAX_WIDTH
    let dismissed = false
    try {
      dismissed = sessionStorage.getItem(ROTATE_HINT_KEY) === '1'
    } catch (e) { /* ignore */ }
    showRotateHint.value = portrait && !dismissed
  }

  const dismissRotateHint = () => {
    showRotateHint.value = false
    try {
      sessionStorage.setItem(ROTATE_HINT_KEY, '1')
    } catch (e) { /* ignore */ }
  }

  /** 绑定尺寸/方向变化监听，并立即计算一次初始状态 */
  const bindOrientation = () => {
    updateOrientation()
    window.addEventListener('resize', updateOrientation)
    window.addEventListener('orientationchange', updateOrientation)
  }

  const unbindOrientation = () => {
    window.removeEventListener('resize', updateOrientation)
    window.removeEventListener('orientationchange', updateOrientation)
  }

  return {
    showRotateHint,
    onTouchStart,
    onTouchEnd,
    onDialogueClick,
    updateOrientation,
    dismissRotateHint,
    bindOrientation,
    unbindOrientation,
  }
}
