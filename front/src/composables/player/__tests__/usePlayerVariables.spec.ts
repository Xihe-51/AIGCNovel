import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { withSetup } from '@/__tests__/helpers'
import {
  usePlayerVariables,
  BEHAVIOR_HESITATION,
  BEHAVIOR_REVIEW,
} from '@/composables/player/usePlayerVariables'

const listVariables = vi.fn()
const listEffects = vi.fn()
const getProjectMeta = vi.fn()
const saveProjectMeta = vi.fn()
const listSceneLocks = vi.fn()

vi.mock('@/api/variable', () => ({
  listVariables: (...args: any[]) => listVariables(...args),
  listEffects: (...args: any[]) => listEffects(...args),
  getProjectMeta: (...args: any[]) => getProjectMeta(...args),
  saveProjectMeta: (...args: any[]) => saveProjectMeta(...args),
}))

vi.mock('@/api/scenes', () => ({
  listSceneLocks: (...args: any[]) => listSceneLocks(...args),
}))

function createVariables(showNotices = true) {
  const { result, wrapper } = withSetup(() => usePlayerVariables({
    projectId: () => 7,
    showNotices: () => showNotices,
  }))
  return { result, wrapper }
}

beforeEach(() => {
  listVariables.mockReset()
  listEffects.mockReset()
  getProjectMeta.mockReset()
  saveProjectMeta.mockReset()
  listSceneLocks.mockReset()
  listVariables.mockResolvedValue([])
  listEffects.mockResolvedValue([])
  getProjectMeta.mockResolvedValue({ variables: {} })
  saveProjectMeta.mockResolvedValue(undefined)
  listSceneLocks.mockResolvedValue({})
})

describe('usePlayerVariables / 取值与夹取', () => {
  it('clampVariable 按 min/max 夹取并转成数字', () => {
    const { result } = createVariables()
    expect(result.clampVariable({ min_value: 0, max_value: 10 }, 15)).toBe(10)
    expect(result.clampVariable({ min_value: 0, max_value: 10 }, -3)).toBe(0)
    expect(result.clampVariable({ min_value: null, max_value: null }, '4')).toBe(4)
    expect(result.clampVariable({}, 'abc')).toBe(0)
  })

  it('persist 变量优先沿用跨周目值', () => {
    const { result } = createVariables()
    result.metaVariables.value = { favor: 8 }
    expect(result.initialValueOf({ name: 'favor', persist: true, initial_value: 0, min_value: 0, max_value: 10 })).toBe(8)
  })

  it('非 persist 变量忽略跨周目值', () => {
    const { result } = createVariables()
    result.metaVariables.value = { favor: 8 }
    expect(result.initialValueOf({ name: 'favor', initial_value: 2 })).toBe(2)
  })

  it('persist 变量没有跨周目值时用 initial_value', () => {
    const { result } = createVariables()
    expect(result.initialValueOf({ name: 'favor', persist: true, initial_value: 3 })).toBe(3)
  })

  it('initVariableValues 只补缺失的键，不覆盖已有值', () => {
    const { result } = createVariables()
    result.projectVariables.value = [
      { name: 'a', initial_value: 1 },
      { name: 'b', initial_value: 2 },
    ]
    result.variableValues.value = { a: 99 }
    result.initVariableValues()
    expect(result.variableValues.value).toEqual({ a: 99, b: 2 })
  })

  it('snapshotPersistVariables 只收集 persist 变量', () => {
    const { result } = createVariables()
    result.projectVariables.value = [
      { name: 'keep', persist: true, initial_value: 1 },
      { name: 'temp', initial_value: 2 },
    ]
    result.variableValues.value = { keep: 5, temp: 6 }
    expect(result.snapshotPersistVariables()).toEqual({ keep: 5 })
  })
})

describe('usePlayerVariables / 跨周目持久化', () => {
  it('没有 persist 变量时不写回服务端', () => {
    const { result } = createVariables()
    result.projectVariables.value = [{ name: 'temp', initial_value: 1 }]
    result.variableValues.value = { temp: 3 }
    result.syncProjectMeta(true)
    expect(saveProjectMeta).not.toHaveBeenCalled()
  })

  it('immediate=true 时立刻写回并同步本地缓存', () => {
    const { result } = createVariables()
    result.projectVariables.value = [{ name: 'keep', persist: true, initial_value: 0 }]
    result.variableValues.value = { keep: 4 }
    result.syncProjectMeta(true)
    expect(saveProjectMeta).toHaveBeenCalledWith(7, { keep: 4 })
    expect(result.metaVariables.value.keep).toBe(4)
  })

  it('默认防抖 500ms 只写回一次', async () => {
    vi.useFakeTimers()
    try {
      const { result } = createVariables()
      result.projectVariables.value = [{ name: 'keep', persist: true, initial_value: 0 }]
      result.variableValues.value = { keep: 1 }
      result.syncProjectMeta()
      result.variableValues.value = { keep: 2 }
      result.syncProjectMeta()
      expect(saveProjectMeta).not.toHaveBeenCalled()
      vi.advanceTimersByTime(500)
      expect(saveProjectMeta).toHaveBeenCalledTimes(1)
      expect(saveProjectMeta).toHaveBeenCalledWith(7, { keep: 2 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('loadProjectMeta 读取失败时清空跨周目值', async () => {
    getProjectMeta.mockRejectedValue(new Error('boom'))
    const { result } = createVariables()
    result.metaVariables.value = { stale: 1 }
    await result.loadProjectMeta()
    expect(result.metaVariables.value).toEqual({})
  })
})

describe('usePlayerVariables / 加载变量系统', () => {
  it('正常加载变量、效果、剧情锁并初始化取值', async () => {
    listVariables.mockResolvedValue([{ name: 'favor', initial_value: 5 }])
    listEffects.mockResolvedValue([{ content_id: 1, variable_id: 1, delta: 1 }])
    listSceneLocks.mockResolvedValue({ 3: { variable: 'favor', op: '>=', value: 1 } })
    getProjectMeta.mockResolvedValue({ variables: {} })
    const { result } = createVariables()
    await result.loadVariableSystem()
    expect(result.projectVariables.value).toHaveLength(1)
    expect(result.variableEffects.value).toHaveLength(1)
    expect(result.sceneLocks.value[3]).toBeTruthy()
    expect(result.variableValues.value.favor).toBe(5)
  })

  it('接口失败时清空所有变量状态且不抛错', async () => {
    listVariables.mockRejectedValue(new Error('network'))
    const { result } = createVariables()
    result.projectVariables.value = [{ name: 'stale', initial_value: 1 }]
    await result.loadVariableSystem()
    expect(result.projectVariables.value).toEqual([])
    expect(result.variableEffects.value).toEqual([])
    expect(result.sceneLocks.value).toEqual({})
  })

  it('listSceneLocks 返回 null 时回落成空对象', async () => {
    listSceneLocks.mockResolvedValue(null)
    const { result } = createVariables()
    await result.loadVariableSystem()
    expect(result.sceneLocks.value).toEqual({})
  })
})

describe('usePlayerVariables / 行为变量', () => {
  it('变量未启用时写入无效', () => {
    const { result } = createVariables()
    result.projectVariables.value = []
    result.setBehaviorVariable(BEHAVIOR_REVIEW, 1)
    expect(result.variableValues.value).toEqual({})
  })

  it('写入时按定义夹取并取整', () => {
    const { result } = createVariables()
    result.projectVariables.value = [
      { name: BEHAVIOR_HESITATION, initial_value: 0, min_value: 0, max_value: 60 },
    ]
    result.setBehaviorVariable(BEHAVIOR_HESITATION, 12.6)
    expect(result.variableValues.value[BEHAVIOR_HESITATION]).toBe(13)
  })

  it('值没变化时不触发响应式写入', () => {
    const { result } = createVariables()
    result.projectVariables.value = [{ name: BEHAVIOR_REVIEW, initial_value: 2 }]
    result.variableValues.value = { [BEHAVIOR_REVIEW]: 2 }
    const before = result.variableValues.value
    result.setBehaviorVariable(BEHAVIOR_REVIEW, 2)
    expect(result.variableValues.value).toBe(before)
  })

  it('bumpBehaviorReview 累加回看次数', () => {
    const { result } = createVariables()
    result.projectVariables.value = [{ name: BEHAVIOR_REVIEW, initial_value: 0 }]
    result.variableValues.value = {}
    result.bumpBehaviorReview()
    result.bumpBehaviorReview()
    expect(result.variableValues.value[BEHAVIOR_REVIEW]).toBe(2)
  })

  it('commitHesitation 记录从开始到提交的秒数，且只记一次', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const { result } = createVariables()
      result.projectVariables.value = [
        { name: BEHAVIOR_HESITATION, initial_value: 0, min_value: 0, max_value: 60 },
      ]
      result.variableValues.value = {}
      result.markHesitationStart(101)
      vi.advanceTimersByTime(3000)
      result.commitHesitation()
      expect(result.variableValues.value[BEHAVIOR_HESITATION]).toBe(3)
      // 第二次提交没有新的开始时间，不应再写
      result.commitHesitation()
      expect(result.variableValues.value[BEHAVIOR_HESITATION]).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('同一节点重复标记不会重置开始时间', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const { result } = createVariables()
      result.projectVariables.value = [
        { name: BEHAVIOR_HESITATION, initial_value: 0, min_value: 0, max_value: 60 },
      ]
      result.variableValues.value = {}
      result.markHesitationStart(101)
      vi.advanceTimersByTime(2000)
      result.markHesitationStart(101)
      vi.advanceTimersByTime(2000)
      result.commitHesitation()
      expect(result.variableValues.value[BEHAVIOR_HESITATION]).toBe(4)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('usePlayerVariables / 变化浮层', () => {
  it('关闭提示开关时不推入浮层', () => {
    const { result } = createVariables(false)
    result.pushVariableNotices([{ label: '好感度', delta: 1 }])
    expect(result.variableNotices.value).toHaveLength(0)
  })

  it('推入后 2.6 秒自动消失', () => {
    vi.useFakeTimers()
    try {
      const { result } = createVariables(true)
      result.pushVariableNotices([{ label: '好感度', delta: 1 }])
      expect(result.variableNotices.value).toHaveLength(1)
      vi.advanceTimersByTime(2600)
      expect(result.variableNotices.value).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('超过 8 条只保留最近 8 条', () => {
    const { result } = createVariables(true)
    const items = Array.from({ length: 12 }, (_, i) => ({ label: `v${i}`, delta: 1 }))
    result.pushVariableNotices(items)
    expect(result.variableNotices.value).toHaveLength(8)
    expect(result.variableNotices.value[7].label).toBe('v11')
  })

  it('clearVariableNotices 清空列表', () => {
    const { result } = createVariables(true)
    result.pushVariableNotices([{ label: '好感度', delta: 1 }])
    result.clearVariableNotices()
    expect(result.variableNotices.value).toHaveLength(0)
  })
})
