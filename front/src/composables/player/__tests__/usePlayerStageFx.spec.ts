import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { usePlayerStageFx, resolveEffectDuration } from '../usePlayerStageFx'

afterEach(() => {
  vi.useRealTimers()
})

describe('resolveEffectDuration', () => {
  it('显式时长优先，并夹取到至少 100ms', () => {
    expect(resolveEffectDuration({ effect: 'flash', duration_ms: 800 })).toBe(800)
    expect(resolveEffectDuration({ effect: 'flash', duration_ms: 10 })).toBe(100)
    expect(resolveEffectDuration({ effect: 'flash', duration_ms: '1200' as any })).toBe(1200)
  })

  it('缺省时长按类型回落：天气 3s，其余 400ms', () => {
    expect(resolveEffectDuration({ effect: 'weather' })).toBe(3000)
    expect(resolveEffectDuration({ effect: 'shake' })).toBe(400)
    expect(resolveEffectDuration(null)).toBe(400)
  })

  it('非法时长视为缺省', () => {
    expect(resolveEffectDuration({ effect: 'weather', duration_ms: 'abc' as any })).toBe(3000)
    expect(resolveEffectDuration({ duration_ms: 0 })).toBe(400)
  })
})

describe('usePlayerStageFx / triggerEffect', () => {
  it('下一帧挂上效果，并在时长后自动清除', async () => {
    vi.useFakeTimers()
    const api = usePlayerStageFx({ scheduleAutoAdvance: vi.fn() })
    api.triggerEffect({ effect: 'shake', duration_ms: 300, intensity: 8 })
    expect(api.activeEffect.value).toBeNull()
    await nextTick()
    expect(api.activeEffect.value).toMatchObject({ effect: 'shake', duration_ms: 300, intensity: 8 })
    expect(typeof api.activeEffect.value?.key).toBe('number')
    vi.advanceTimersByTime(299)
    expect(api.activeEffect.value).toBeTruthy()
    vi.advanceTimersByTime(1)
    expect(api.activeEffect.value).toBeNull()
  })

  it('空载荷不产生任何效果', async () => {
    vi.useFakeTimers()
    const api = usePlayerStageFx({ scheduleAutoAdvance: vi.fn() })
    api.triggerEffect(null)
    api.triggerEffect(undefined)
    await nextTick()
    expect(api.activeEffect.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('连续触发会清掉上一个效果，只保留最新一次', async () => {
    vi.useFakeTimers()
    const api = usePlayerStageFx({ scheduleAutoAdvance: vi.fn() })
    api.triggerEffect({ effect: 'shake', duration_ms: 300 })
    await nextTick()
    api.triggerEffect({ effect: 'flash', duration_ms: 500 })
    await nextTick()
    expect(api.activeEffect.value).toMatchObject({ effect: 'flash', duration_ms: 500 })
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(500)
    expect(api.activeEffect.value).toBeNull()
  })

  it('clearEffect 立即清场并注销计时器', async () => {
    vi.useFakeTimers()
    const api = usePlayerStageFx({ scheduleAutoAdvance: vi.fn() })
    api.triggerEffect({ effect: 'weather' })
    await nextTick()
    api.clearEffect()
    expect(api.activeEffect.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('usePlayerStageFx / scheduleWait', () => {
  it('停顿期间 isWaiting 为真，结束后回调恢复自动播放', () => {
    vi.useFakeTimers()
    const scheduleAutoAdvance = vi.fn()
    const api = usePlayerStageFx({ scheduleAutoAdvance })
    api.scheduleWait(700)
    expect(api.isWaiting.value).toBe(true)
    vi.advanceTimersByTime(699)
    expect(api.isWaiting.value).toBe(true)
    expect(scheduleAutoAdvance).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(api.isWaiting.value).toBe(false)
    expect(scheduleAutoAdvance).toHaveBeenCalledTimes(1)
  })

  it('零或非法毫秒直接返回，不进入等待', () => {
    vi.useFakeTimers()
    const scheduleAutoAdvance = vi.fn()
    const api = usePlayerStageFx({ scheduleAutoAdvance })
    api.scheduleWait(0)
    expect(api.isWaiting.value).toBe(false)
    api.scheduleWait(-100)
    expect(api.isWaiting.value).toBe(false)
    api.scheduleWait(undefined)
    expect(api.isWaiting.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(scheduleAutoAdvance).not.toHaveBeenCalled()
  })

  it('重复排期以最后一次为准，中途不重复回调', () => {
    vi.useFakeTimers()
    const scheduleAutoAdvance = vi.fn()
    const api = usePlayerStageFx({ scheduleAutoAdvance })
    api.scheduleWait(1000)
    api.scheduleWait(300)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(300)
    expect(scheduleAutoAdvance).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(scheduleAutoAdvance).toHaveBeenCalledTimes(1)
  })

  it('clearWait 取消等待且不触发自动播放', () => {
    vi.useFakeTimers()
    const scheduleAutoAdvance = vi.fn()
    const api = usePlayerStageFx({ scheduleAutoAdvance })
    api.scheduleWait(500)
    api.clearWait()
    expect(api.isWaiting.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(1000)
    expect(scheduleAutoAdvance).not.toHaveBeenCalled()
  })
})

describe('usePlayerStageFx / disposeStageFx', () => {
  it('卸载清理同时注销效果与停顿计时器', async () => {
    vi.useFakeTimers()
    const scheduleAutoAdvance = vi.fn()
    const api = usePlayerStageFx({ scheduleAutoAdvance })
    api.triggerEffect({ effect: 'shake', duration_ms: 300 })
    await nextTick()
    api.scheduleWait(600)
    expect(vi.getTimerCount()).toBe(2)
    api.disposeStageFx()
    expect(vi.getTimerCount()).toBe(0)
    expect(api.activeEffect.value).toBeNull()
    expect(api.isWaiting.value).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(scheduleAutoAdvance).not.toHaveBeenCalled()
  })
})
