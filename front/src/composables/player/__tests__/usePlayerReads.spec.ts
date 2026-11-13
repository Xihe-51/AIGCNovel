import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  usePlayerReads,
  READ_FLUSH_DELAY,
  SKIP_GUARD_LIMIT,
} from '@/composables/player/usePlayerReads'

const listReads = vi.fn()
const markReads = vi.fn()

vi.mock('@/api/read', () => ({
  listReads: (...args: any[]) => listReads(...args),
  markReads: (...args: any[]) => markReads(...args),
}))

function createReads(overrides: Partial<Parameters<typeof usePlayerReads>[0]> = {}) {
  const state = {
    dialogue: { content_id: 12 } as any,
    choices: 0,
    skipRead: true,
  }

  const reads = usePlayerReads({
    projectId: () => 7,
    getCurrentDialogue: () => state.dialogue,
    hasChoices: () => state.choices > 0,
    skipReadEnabled: () => state.skipRead,
    ...overrides,
  })

  return { ...reads, state }
}

describe('usePlayerReads', () => {
  beforeEach(() => {
    localStorage.clear()
    listReads.mockReset().mockResolvedValue([])
    markReads.mockReset().mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('存储 key 按项目区分', () => {
    const reads = createReads()
    expect(reads.readStorageKey()).toBe('aigc:reads:7')
  })

  it('加载时合并云端与本地记录并去重', async () => {
    localStorage.setItem('aigc:reads:7', JSON.stringify([2, 3]))
    listReads.mockResolvedValueOnce([1, 2])

    const reads = createReads()
    await reads.loadReads()

    expect(listReads).toHaveBeenCalledWith(7)
    expect([...reads.readSet.value].sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  it('云端失败时回退本地，本地损坏时视为空', async () => {
    localStorage.setItem('aigc:reads:7', JSON.stringify([5]))
    listReads.mockRejectedValueOnce(new Error('cloud down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const reads = createReads()
    await reads.loadReads()

    expect([...reads.readSet.value]).toEqual([5])

    localStorage.setItem('aigc:reads:7', 'not-json')
    listReads.mockRejectedValueOnce(new Error('cloud down'))
    await reads.loadReads()
    expect([...reads.readSet.value]).toEqual([])
    warn.mockRestore()
  })

  it('标记已读去重，并在防抖窗口结束后只提交一次', async () => {
    vi.useFakeTimers()
    const reads = createReads()

    reads.markCurrentRead()
    reads.markCurrentRead()
    expect(markReads).not.toHaveBeenCalled()

    reads.state.dialogue = { content_id: 13 }
    reads.markCurrentRead()

    await vi.advanceTimersByTimeAsync(READ_FLUSH_DELAY)

    expect(markReads).toHaveBeenCalledTimes(1)
    expect(markReads).toHaveBeenCalledWith(7, [12, 13])
  })

  it('同一节点重复标记不进入待提交队列', async () => {
    const reads = createReads()
    reads.readSet.value.add(12)
    reads.markCurrentRead()

    await reads.flushReads()
    expect(markReads).not.toHaveBeenCalled()
  })

  it('云端写入失败时落本地，下次加载可合并', async () => {
    const reads = createReads()
    markReads.mockRejectedValueOnce(new Error('boom'))

    reads.markCurrentRead()
    await reads.flushReads()

    expect(JSON.parse(localStorage.getItem('aigc:reads:7') || '[]')).toEqual([12])
  })

  it('跳读判定：开关关闭 / 有选项 / 无节点 / 强制展示时不跳过', () => {
    const reads = createReads()
    reads.readSet.value.add(12)

    expect(reads.shouldSkipCurrent()).toBe(true)
    expect(reads.shouldSkipCurrent(true)).toBe(false)

    reads.state.skipRead = false
    expect(reads.shouldSkipCurrent()).toBe(false)

    reads.state.skipRead = true
    reads.state.choices = 2
    expect(reads.shouldSkipCurrent()).toBe(false)

    reads.state.choices = 0
    reads.state.dialogue = { content_id: 99 }
    expect(reads.shouldSkipCurrent()).toBe(false)

    reads.state.dialogue = null
    expect(reads.shouldSkipCurrent()).toBe(false)
  })

  it('hasRead 支持字符串与数字混用', () => {
    const reads = createReads()
    reads.readSet.value.add(12)

    expect(reads.hasRead('12')).toBe(true)
    expect(reads.hasRead(12)).toBe(true)
    expect(reads.hasRead(13)).toBe(false)
    expect(reads.hasRead(undefined)).toBe(false)
  })

  it('连续跳过超过上限后强制展示并复位计数', () => {
    const reads = createReads()

    for (let i = 0; i < SKIP_GUARD_LIMIT; i += 1) {
      expect(reads.allowSkip()).toBe(true)
    }
    expect(reads.allowSkip()).toBe(false)
    expect(reads.allowSkip()).toBe(true)

    reads.resetSkipGuard()
    for (let i = 0; i < SKIP_GUARD_LIMIT; i += 1) reads.allowSkip()
    expect(reads.allowSkip()).toBe(false)
  })

  it('回退标记只消费一次', () => {
    const reads = createReads()
    expect(reads.consumeSkipRestoredLine()).toBe(false)

    reads.markSkipRestoredLine()
    expect(reads.consumeSkipRestoredLine()).toBe(true)
    expect(reads.consumeSkipRestoredLine()).toBe(false)
  })

  it('卸载时把待提交记录补发', async () => {
    const reads = createReads()
    reads.markCurrentRead()

    reads.disposeReads()
    expect(markReads).toHaveBeenCalledWith(7, [12])
    await Promise.resolve()
  })

  it('没有待提交记录时卸载不打接口', async () => {
    const reads = createReads()
    reads.disposeReads()
    await Promise.resolve()
    expect(markReads).not.toHaveBeenCalled()
  })
})
