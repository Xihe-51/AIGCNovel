import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  usePlayerGamepad,
  GAMEPAD_POLL_INTERVAL,
} from '@/composables/player/usePlayerGamepad'

function createGamepad(overrides: Partial<Parameters<typeof usePlayerGamepad>[0]> = {}) {
  const state = {
    panelsOpen: false,
    nextDialogue: vi.fn(),
    toggleHistoryDialogue: vi.fn(),
    toggleAutoPlay: vi.fn(),
  }

  const api = usePlayerGamepad({
    isPanelOpen: () => state.panelsOpen,
    nextDialogue: () => state.nextDialogue(),
    toggleHistoryDialogue: () => state.toggleHistoryDialogue(),
    toggleAutoPlay: () => state.toggleAutoPlay(),
    ...overrides,
  })

  return { ...api, state }
}

const pad = (buttons: boolean[]) => ({
  connected: true,
  buttons: buttons.map((pressed) => ({ pressed })),
})

const setGamepads = (pads: any[]) => {
  ;(navigator as any).getGamepads = vi.fn(() => pads)
}

describe('usePlayerGamepad', () => {
  beforeEach(() => {
    ;(navigator as any).getGamepads = vi.fn(() => [])
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (navigator as any).getGamepads
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('无手柄 API 时安全返回', () => {
    delete (navigator as any).getGamepads
    const { pollGamepad, state } = createGamepad()
    expect(() => pollGamepad()).not.toThrow()
    expect(state.nextDialogue).not.toHaveBeenCalled()
  })

  it('页面不可见时不响应', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    setGamepads([pad([true, false, false])])
    const { pollGamepad, state } = createGamepad()
    pollGamepad()
    expect(state.nextDialogue).not.toHaveBeenCalled()
  })

  it('无已连接手柄时不响应', () => {
    setGamepads([{ connected: false, buttons: [{ pressed: true }] }, null])
    const { pollGamepad, state } = createGamepad()
    pollGamepad()
    expect(state.nextDialogue).not.toHaveBeenCalled()
  })

  it('A 键按下的边沿触发一次翻页，长按不重复', () => {
    setGamepads([pad([true, false, false])])
    const { pollGamepad, state } = createGamepad()
    pollGamepad()
    expect(state.nextDialogue).toHaveBeenCalledTimes(1)
    pollGamepad()
    expect(state.nextDialogue).toHaveBeenCalledTimes(1)
  })

  it('B 键切回想、X 键切自动播放', () => {
    setGamepads([pad([false, true, false])])
    const { pollGamepad, state } = createGamepad()
    pollGamepad()
    expect(state.toggleHistoryDialogue).toHaveBeenCalledTimes(1)

    setGamepads([pad([false, false, true])])
    pollGamepad()
    expect(state.toggleAutoPlay).toHaveBeenCalledTimes(1)
  })

  it('面板展开时忽略按键但仍更新边沿状态', () => {
    setGamepads([pad([true, false, false])])
    const { pollGamepad, state } = createGamepad()

    state.panelsOpen = true
    pollGamepad()
    expect(state.nextDialogue).not.toHaveBeenCalled()

    // 面板关闭但按键仍按住，不补触发
    state.panelsOpen = false
    pollGamepad()
    expect(state.nextDialogue).not.toHaveBeenCalled()

    // 松开再按才触发
    setGamepads([pad([false, false, false])])
    pollGamepad()
    setGamepads([pad([true, false, false])])
    pollGamepad()
    expect(state.nextDialogue).toHaveBeenCalledTimes(1)
  })

  it('startGamepad 按间隔轮询，stopGamepad 停止轮询', () => {
    vi.useFakeTimers()
    const getSpy = vi.fn(() => [])
    ;(navigator as any).getGamepads = getSpy
    const { startGamepad, stopGamepad } = createGamepad()

    startGamepad()
    vi.advanceTimersByTime(GAMEPAD_POLL_INTERVAL)
    expect(getSpy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(GAMEPAD_POLL_INTERVAL)
    expect(getSpy).toHaveBeenCalledTimes(2)

    stopGamepad()
    vi.advanceTimersByTime(GAMEPAD_POLL_INTERVAL * 3)
    expect(getSpy).toHaveBeenCalledTimes(2)
  })
})
