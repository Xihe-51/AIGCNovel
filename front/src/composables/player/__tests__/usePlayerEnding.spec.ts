import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  usePlayerEnding,
  endingConditionsMet,
  findReachableEnding,
} from '@/composables/player/usePlayerEnding'
import { withSetup } from '@/__tests__/helpers'

const listEndings = vi.fn()
const unlockEnding = vi.fn()

vi.mock('@/api/ending', () => ({
  listEndings: (...args: any[]) => listEndings(...args),
  unlockEnding: (...args: any[]) => unlockEnding(...args),
}))

const endingOf = (id: number, contentId: number, conditions: any[] = []) => ({
  ending_id: id,
  project_id: 7,
  title: `结局${id}`,
  content_id: contentId,
  conditions,
})

function createEnding(options: { dialogue?: any; scene?: any; evalCondition?: any } = {}) {
  const calls: string[] = []
  const evalCondition = options.evalCondition ?? (() => true)
  const { result, wrapper } = withSetup(() => usePlayerEnding({
    projectId: () => 7,
    getCurrentDialogue: () => options.dialogue ?? { content_id: 24 },
    getCurrentScene: () => options.scene ?? { scene_id: 2 },
    evalCondition,
    logPlayEvent: (event, payload) => { calls.push(`log:${event}:${payload.ending_id}:${payload.content_id}:${payload.scene_id}`) },
    scheduleAchievementCheck: () => { calls.push('achievement') },
    clearTyping: () => { calls.push('clearTyping') },
    clearAutoTimer: () => { calls.push('clearAutoTimer') },
  }))
  return { ...result, calls, wrapper }
}

describe('endingConditionsMet', () => {
  it('无条件结局直接命中', () => {
    expect(endingConditionsMet({ conditions: [] }, () => false)).toBe(true)
    expect(endingConditionsMet(null, () => false)).toBe(true)
  })

  it('全部条件成立才算命中', () => {
    const conditions = [{ variable: 'love', op: '>', value: 2 }, { variable: 'clue', op: '>=', value: 1 }]
    expect(endingConditionsMet({ conditions }, () => true)).toBe(true)
    expect(endingConditionsMet({ conditions }, c => c.variable === 'love')).toBe(false)
  })
})

describe('findReachableEnding', () => {
  const endings = [endingOf(1, 24), endingOf(2, 24), endingOf(3, 30)]

  it('节点为空或结局清单为空时返回 null', () => {
    expect(findReachableEnding(undefined, endings, new Set(), () => true)).toBeNull()
    expect(findReachableEnding(0, endings, new Set(), () => true)).toBeNull()
    expect(findReachableEnding(24, [], new Set(), () => true)).toBeNull()
  })

  it('只命中最先满足条件的同节点结局', () => {
    const hit = findReachableEnding(24, endings, new Set(), () => true)
    expect(hit?.ending_id).toBe(1)
    expect(findReachableEnding(30, endings, new Set(), () => true)?.ending_id).toBe(3)
    expect(findReachableEnding(25, endings, new Set(), () => true)).toBeNull()
  })

  it('已触发或条件不成立的结局会跳过', () => {
    expect(findReachableEnding(24, endings, new Set([1]), () => true)?.ending_id).toBe(2)
    const unmatched = findReachableEnding(24, endings, new Set(), () => false)
    expect(unmatched).toBeNull()
  })
})

describe('usePlayerEnding', () => {
  beforeEach(() => {
    listEndings.mockReset()
    unlockEnding.mockReset()
  })

  it('加载结局清单，读取失败时清空', async () => {
    const ending = createEnding()
    listEndings.mockResolvedValueOnce([endingOf(1, 24)])
    await ending.loadEndings()
    expect(ending.endings.value).toHaveLength(1)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    listEndings.mockRejectedValueOnce(new Error('boom'))
    await ending.loadEndings()
    expect(ending.endings.value).toEqual([])
    warn.mockRestore()
    ending.wrapper.unmount()
  })

  it('当前节点命中结局时触发弹窗并写下游副作用', async () => {
    const ending = createEnding()
    ending.endings.value = [endingOf(1, 24)]
    unlockEnding.mockResolvedValueOnce({})

    expect(ending.checkEndingForCurrent()).toBe(true)
    await Promise.resolve()

    expect(ending.triggeredEndings.value.has(1)).toBe(true)
    expect(ending.endings.value[0].unlocked).toBe(true)
    expect(ending.currentEnding.value?.ending_id).toBe(1)
    expect(ending.endingDialogVisible.value).toBe(true)
    expect(ending.calls).toEqual([
      'log:ending:1:24:2',
      'achievement',
      'clearTyping',
      'clearAutoTimer',
    ])
    expect(unlockEnding).toHaveBeenCalledWith(7, 1)
    ending.wrapper.unmount()
  })

  it('未命中结局时不做任何副作用', () => {
    const ending = createEnding({ dialogue: { content_id: 99 } })
    ending.endings.value = [endingOf(1, 24)]

    expect(ending.checkEndingForCurrent()).toBe(false)
    expect(ending.triggeredEndings.value.size).toBe(0)
    expect(ending.endingDialogVisible.value).toBe(false)
    expect(ending.calls).toEqual([])
    ending.wrapper.unmount()
  })

  it('同一结局只触发一次', async () => {
    const ending = createEnding()
    ending.endings.value = [endingOf(1, 24)]
    unlockEnding.mockResolvedValue({})

    expect(ending.checkEndingForCurrent()).toBe(true)
    await Promise.resolve()
    expect(ending.checkEndingForCurrent()).toBe(false)
    expect(unlockEnding).toHaveBeenCalledTimes(1)
    ending.wrapper.unmount()
  })

  it('上报结局失败不影响弹窗', async () => {
    const ending = createEnding()
    ending.endings.value = [endingOf(1, 24)]
    unlockEnding.mockRejectedValueOnce(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(ending.triggerEnding(ending.endings.value[0])).resolves.toBeUndefined()
    expect(ending.endingDialogVisible.value).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    ending.wrapper.unmount()
  })

  it('重置后清空已触发集合并关闭结局页', async () => {
    const ending = createEnding()
    ending.endings.value = [endingOf(1, 24)]
    unlockEnding.mockResolvedValue({})
    ending.checkEndingForCurrent()
    await Promise.resolve()
    expect(ending.endingDialogVisible.value).toBe(true)

    ending.resetEndings()
    expect(ending.triggeredEndings.value.size).toBe(0)
    expect(ending.endingDialogVisible.value).toBe(false)
    ending.wrapper.unmount()
  })
})
