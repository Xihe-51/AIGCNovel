import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  usePlayerTouch,
  TOUCH_SWIPE_THRESHOLD,
  CLICK_SUPPRESS_DELAY,
  ROTATE_HINT_KEY,
  ROTATE_HINT_MAX_WIDTH,
} from '@/composables/player/usePlayerTouch'

function createTouch(overrides: Partial<Parameters<typeof usePlayerTouch>[0]> = {}) {
  const state = {
    showHistory: false,
    showDialogueBox: true,
    nextDialogue: vi.fn(),
  }

  const api = usePlayerTouch({
    getShowHistory: () => state.showHistory,
    setShowHistory: (value) => { state.showHistory = value },
    getShowDialogueBox: () => state.showDialogueBox,
    setShowDialogueBox: (value) => { state.showDialogueBox = value },
    nextDialogue: () => state.nextDialogue(),
    ...overrides,
  })

  return { ...api, state }
}

const touchEvt = (x: number, y: number) => ({
  touches: [{ clientX: x, clientY: y }],
  changedTouches: [{ clientX: x, clientY: y }],
})

const setViewport = (width: number, portrait: boolean) => {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true })
  ;(window as any).matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('portrait') ? portrait : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('usePlayerTouch', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    setViewport(1024, false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('缺少触点时忽略触摸事件', () => {
    const { onTouchStart, onTouchEnd, state } = createTouch()
    onTouchStart({} as any)
    onTouchEnd({} as any)
    expect(state.showHistory).toBe(false)
    expect(state.showDialogueBox).toBe(true)
  })

  it('上滑超过阈值时打开回想', () => {
    const { onTouchStart, onTouchEnd, state } = createTouch()
    onTouchStart(touchEvt(100, 400) as any)
    onTouchEnd(touchEvt(100, 400 - (TOUCH_SWIPE_THRESHOLD + 20)) as any)
    expect(state.showHistory).toBe(true)
  })

  it('回想已打开时下滑先关闭回想', () => {
    const { onTouchStart, onTouchEnd, state } = createTouch()
    state.showHistory = true
    onTouchStart(touchEvt(100, 100) as any)
    onTouchEnd(touchEvt(100, 100 + (TOUCH_SWIPE_THRESHOLD + 20)) as any)
    expect(state.showHistory).toBe(false)
    expect(state.showDialogueBox).toBe(true)
  })

  it('回想关闭时下滑隐藏对话框', () => {
    const { onTouchStart, onTouchEnd, state } = createTouch()
    onTouchStart(touchEvt(100, 100) as any)
    onTouchEnd(touchEvt(100, 100 + (TOUCH_SWIPE_THRESHOLD + 20)) as any)
    expect(state.showHistory).toBe(false)
    expect(state.showDialogueBox).toBe(false)
  })

  it('位移不足阈值时忽略', () => {
    const { onTouchStart, onTouchEnd, state } = createTouch()
    onTouchStart(touchEvt(100, 400) as any)
    onTouchEnd(touchEvt(100, 400 - (TOUCH_SWIPE_THRESHOLD - 5)) as any)
    expect(state.showHistory).toBe(false)
    expect(state.showDialogueBox).toBe(true)
  })

  it('横向位移更大时忽略纵向判定', () => {
    const { onTouchStart, onTouchEnd, state } = createTouch()
    onTouchStart(touchEvt(100, 400) as any)
    onTouchEnd(touchEvt(100 + TOUCH_SWIPE_THRESHOLD + 40, 400 - (TOUCH_SWIPE_THRESHOLD + 10)) as any)
    expect(state.showHistory).toBe(false)
    expect(state.showDialogueBox).toBe(true)
  })

  it('正常点击触发翻页', () => {
    const { onDialogueClick, state } = createTouch()
    onDialogueClick()
    expect(state.nextDialogue).toHaveBeenCalledTimes(1)
  })

  it('滑动后吞掉首个合成点击', () => {
    const { onTouchStart, onTouchEnd, onDialogueClick, state } = createTouch()
    onTouchStart(touchEvt(100, 400) as any)
    onTouchEnd(touchEvt(100, 400 - (TOUCH_SWIPE_THRESHOLD + 20)) as any)
    onDialogueClick()
    expect(state.nextDialogue).not.toHaveBeenCalled()
    onDialogueClick()
    expect(state.nextDialogue).toHaveBeenCalledTimes(1)
  })

  it('抑制窗口过期后点击恢复翻页', () => {
    vi.useFakeTimers()
    const { onTouchStart, onTouchEnd, onDialogueClick, state } = createTouch()
    onTouchStart(touchEvt(100, 400) as any)
    onTouchEnd(touchEvt(100, 400 - (TOUCH_SWIPE_THRESHOLD + 20)) as any)
    vi.advanceTimersByTime(CLICK_SUPPRESS_DELAY + 1)
    onDialogueClick()
    expect(state.nextDialogue).toHaveBeenCalledTimes(1)
  })

  it('竖屏窄屏且未标记时显示旋转提示', () => {
    setViewport(600, true)
    const { updateOrientation, showRotateHint } = createTouch()
    updateOrientation()
    expect(showRotateHint.value).toBe(true)
  })

  it('横屏时不显示旋转提示', () => {
    setViewport(600, false)
    const { updateOrientation, showRotateHint } = createTouch()
    updateOrientation()
    expect(showRotateHint.value).toBe(false)
  })

  it('宽屏即使竖屏也不显示旋转提示', () => {
    setViewport(ROTATE_HINT_MAX_WIDTH + 100, true)
    const { updateOrientation, showRotateHint } = createTouch()
    updateOrientation()
    expect(showRotateHint.value).toBe(false)
  })

  it('已标记不再显示旋转提示', () => {
    window.sessionStorage.setItem(ROTATE_HINT_KEY, '1')
    setViewport(600, true)
    const { updateOrientation, showRotateHint } = createTouch()
    updateOrientation()
    expect(showRotateHint.value).toBe(false)
  })

  it('dismissRotateHint 隐藏提示并写入会话标记', () => {
    setViewport(600, true)
    const { updateOrientation, dismissRotateHint, showRotateHint } = createTouch()
    updateOrientation()
    expect(showRotateHint.value).toBe(true)
    dismissRotateHint()
    expect(showRotateHint.value).toBe(false)
    expect(window.sessionStorage.getItem(ROTATE_HINT_KEY)).toBe('1')
  })

  it('bindOrientation 注册监听，unbindOrientation 移除监听', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { bindOrientation, unbindOrientation } = createTouch()

    bindOrientation()
    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('orientationchange', expect.any(Function))

    unbindOrientation()
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('orientationchange', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
