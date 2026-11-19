import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { listSceneLocks } from '@/api/scenes'
import {
  buildSceneLockPayload,
  normalizeSceneLock,
  useSceneLock,
} from '@/composables/scene/useSceneLock'

vi.mock('@/api/scenes', () => ({
  listSceneLocks: vi.fn(),
}))

describe('normalizeSceneLock', () => {
  it('没有数据时返回空条件', () => {
    expect(normalizeSceneLock(null)).toEqual({ mode: 'and', items: [] })
  })

  it('items 数组格式原样还原', () => {
    expect(normalizeSceneLock({ mode: 'or', items: [{ variable: 'v1', op: '<', value: 3 }] })).toEqual({
      mode: 'or',
      items: [{ variable: 'v1', op: '<', value: 3 }],
    })
  })

  it('items 里缺字段时给默认值', () => {
    expect(normalizeSceneLock({ items: [{ variable: 'v1' }] })).toEqual({
      mode: 'and',
      items: [{ variable: 'v1', op: '>=', value: 0 }],
    })
  })

  it('兼容单条件旧格式', () => {
    expect(normalizeSceneLock({ variable: 'v2', value: '5' })).toEqual({
      mode: 'and',
      items: [{ variable: 'v2', op: '>=', value: 5 }],
    })
  })

  it('未知 mode 回落为 and', () => {
    expect(normalizeSceneLock({ mode: 'xor', items: [] }).mode).toBe('and')
  })
})

describe('buildSceneLockPayload', () => {
  it('没有有效条件时返回 null', () => {
    expect(buildSceneLockPayload('and', [])).toBeNull()
    expect(buildSceneLockPayload('and', [{ variable: '', op: '>=', value: 1 }])).toBeNull()
  })

  it('过滤空变量并规整数值为整数', () => {
    expect(
      buildSceneLockPayload('or', [
        { variable: 'a', op: '>', value: 2.9 },
        { variable: '', op: '>=', value: 1 },
        { variable: 'b', op: '', value: 'x' },
      ])
    ).toEqual({
      mode: 'or',
      items: [
        { variable: 'a', op: '>', value: 2 },
        { variable: 'b', op: '>=', value: 0 },
      ],
    })
  })

  it('mode 不是 or 时统一写 and', () => {
    expect(buildSceneLockPayload('', [{ variable: 'a', op: '>=', value: 1 }])?.mode).toBe('and')
  })
})

describe('useSceneLock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createLock = (projectId: string | number = 7, sceneId: string | number = '7') =>
    useSceneLock({ projectId: ref(projectId), sceneId: () => sceneId })

  it('新增与删除条件', () => {
    const lock = createLock()
    lock.addSceneLockCondition()
    expect(lock.sceneLockItems.value).toEqual([{ variable: '', op: '>=', value: 0 }])
    lock.sceneLockItems.value.push({ variable: 'v', op: '>=', value: 1 })
    lock.removeSceneLockCondition(0)
    expect(lock.sceneLockItems.value).toEqual([{ variable: 'v', op: '>=', value: 1 }])
  })

  it('读取到条件时覆盖编辑态', async () => {
    vi.mocked(listSceneLocks).mockResolvedValue({ '9': { mode: 'or', items: [{ variable: 'v', op: '>', value: 4 }] } })
    const lock = createLock(7, '9')
    await lock.loadSceneLock()
    expect(listSceneLocks).toHaveBeenCalledWith(7)
    expect(lock.sceneLockMode.value).toBe('or')
    expect(lock.sceneLockItems.value).toEqual([{ variable: 'v', op: '>', value: 4 }])
  })

  it('场景没有条件时保持空态', async () => {
    vi.mocked(listSceneLocks).mockResolvedValue({})
    const lock = createLock(7, '9')
    await lock.loadSceneLock()
    expect(lock.sceneLockMode.value).toBe('and')
    expect(lock.sceneLockItems.value).toEqual([])
  })

  it('projectId 为空时不请求接口', async () => {
    const lock = createLock('')
    await lock.loadSceneLock()
    expect(listSceneLocks).not.toHaveBeenCalled()
  })

  it('接口异常时保持空态且不抛错', async () => {
    vi.mocked(listSceneLocks).mockRejectedValue(new Error('network'))
    const lock = createLock(7, '9')
    await expect(lock.loadSceneLock()).resolves.toBeUndefined()
    expect(lock.sceneLockItems.value).toEqual([])
  })

  it('buildSceneLockPayload 使用当前编辑态', () => {
    const lock = createLock()
    expect(lock.buildSceneLockPayload()).toBeNull()
    lock.sceneLockItems.value = [{ variable: 'v', op: '>=', value: 2 }]
    expect(lock.buildSceneLockPayload()).toEqual({ mode: 'and', items: [{ variable: 'v', op: '>=', value: 2 }] })
  })
})
