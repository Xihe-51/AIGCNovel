import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePlayerInput } from '@/composables/player/usePlayerInput'
import { withSetup } from '@/__tests__/helpers'

vi.mock('element-plus', () => ({
  ElMessage: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const keyEvent = (key: string, target: any = document.body) => {
  const event: any = { key, target, defaultPrevented: false }
  event.preventDefault = vi.fn(() => {
    event.defaultPrevented = true
  })
  return event as KeyboardEvent
}

const createInput = () => {
  const settings = ref(false)
  const history = ref(false)
  const ending = ref(false)

  const state = {
    skipRead: false,
    rollbackOneLine: vi.fn(),
    nextDialogue: vi.fn(),
    toggleHistoryDialogue: vi.fn(),
    toggleAutoPlay: vi.fn(),
    playBackgroundMusic: vi.fn(),
  }

  const ctx = {
    getEscPanels: () => [settings, history],
    getActivePanels: () => [settings, history, ending],
    getSkipRead: () => state.skipRead,
    setSkipRead: (value: boolean) => {
      state.skipRead = value
    },
    rollbackOneLine: () => state.rollbackOneLine(),
    nextDialogue: () => state.nextDialogue(),
    toggleHistoryDialogue: () => state.toggleHistoryDialogue(),
    toggleAutoPlay: () => state.toggleAutoPlay(),
    playBackgroundMusic: () => state.playBackgroundMusic(),
    t: (key: string) => `t:${key}`,
  }

  return { ctx, state, panels: { settings, history, ending } }
}

describe('usePlayerInput', () => {
  beforeEach(() => {
    ;(navigator as any).getGamepads = vi.fn(() => [])
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete (navigator as any).getGamepads
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('挂载时注册键盘与音频解锁监听，卸载时全部注销', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { ctx } = createInput()

    const { wrapper } = withSetup(() => usePlayerInput(ctx))

    const addedTypes = addSpy.mock.calls.map((call) => call[0])
    expect(addedTypes.filter((type) => type === 'keydown')).toHaveLength(2)
    expect(addedTypes).toContain('click')
    expect(addedTypes).toContain('touchstart')

    const onceCalls = addSpy.mock.calls.filter((call) => (call[2] as any)?.once)
    expect(onceCalls).toHaveLength(3)

    wrapper.unmount()

    const removed = removeSpy.mock.calls.map((call) => call[0])
    expect(removed.filter((type) => type === 'keydown')).toHaveLength(2)
    expect(removed).toContain('click')
    expect(removed).toContain('touchstart')
  })

  it('空格 / 回车 / → 转发为继续', () => {
    const { ctx, state } = createInput()
    const { result } = withSetup(() => usePlayerInput(ctx))

    ;[' ', 'Enter', 'ArrowRight'].forEach((key) => {
      result.handleKeydown(keyEvent(key))
    })

    expect(state.nextDialogue).toHaveBeenCalledTimes(3)
  })

  it('← 转发为回退，H / A 分别转发为回想与自动播放', () => {
    const { ctx, state } = createInput()
    const { result } = withSetup(() => usePlayerInput(ctx))

    result.handleKeydown(keyEvent('ArrowLeft'))
    result.handleKeydown(keyEvent('h'))
    result.handleKeydown(keyEvent('a'))

    expect(state.rollbackOneLine).toHaveBeenCalledTimes(1)
    expect(state.toggleHistoryDialogue).toHaveBeenCalledTimes(1)
    expect(state.toggleAutoPlay).toHaveBeenCalledTimes(1)
  })

  it('S 读取当前值、取反写回并返回，同时提示切换结果', () => {
    const { ctx, state } = createInput()
    const { result } = withSetup(() => usePlayerInput(ctx))

    result.handleKeydown(keyEvent('s'))
    expect(state.skipRead).toBe(true)
    expect(ElMessage.info).toHaveBeenLastCalledWith('t:toast.skipOn')

    result.handleKeydown(keyEvent('s'))
    expect(state.skipRead).toBe(false)
    expect(ElMessage.info).toHaveBeenLastCalledWith('t:toast.skipOff')
  })

  it('首次点击解锁背景音乐，之后不再触发', () => {
    const { ctx, state } = createInput()
    withSetup(() => usePlayerInput(ctx))

    document.dispatchEvent(new Event('click'))
    document.dispatchEvent(new Event('click'))

    expect(state.playBackgroundMusic).toHaveBeenCalledTimes(1)
  })

  it('手柄 A 键按下边沿触发一次翻页', () => {
    vi.useFakeTimers()
    ;(navigator as any).getGamepads = vi.fn(() => [
      { connected: true, buttons: [{ pressed: true }] },
    ])
    const { ctx, state } = createInput()
    const { wrapper } = withSetup(() => usePlayerInput(ctx))

    vi.advanceTimersByTime(200)
    expect(state.nextDialogue).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(200)
    expect(state.nextDialogue).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})
