import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkProjectAssets } from '@/api/asset'
import { getStoryGraph } from '@/api/branch'
import { listEndings } from '@/api/ending'
import { useProjectHealthCheck } from '@/composables/project/useProjectHealthCheck'

vi.mock('@/api/asset', () => ({ checkProjectAssets: vi.fn() }))
vi.mock('@/api/branch', () => ({ getStoryGraph: vi.fn() }))
vi.mock('@/api/ending', () => ({ listEndings: vi.fn() }))

const makeGraph = (overrides: Record<string, any> = {}) =>
  ({
    project_id: 7,
    nodes: [
      { content_id: 12, scene_id: 3 },
      { content_id: 13, scene_id: 4 },
    ],
    edges: [],
    stats: { node_count: 2, edge_count: 0, scene_count: 2 },
    validation: {
      errors: [{ code: 'E_DUP', message: '重复节点' }],
      warnings: [{ code: 'W_SLOW', message: '对话偏长' }],
      orphans: [],
    },
    ...overrides,
  }) as any

const makeEndings = () =>
  [
    { ending_id: 1, project_id: 7, title: '好结局', content_id: 12, conditions: [] },
    { ending_id: 2, project_id: 7, title: '坏结局', content_id: 13, conditions: [] },
  ] as any

const createCheck = (onLocate = vi.fn()) =>
  useProjectHealthCheck({ projectId: () => 7, onLocate })

describe('useProjectHealthCheck / runCheck', () => {
  beforeEach(() => {
    vi.mocked(checkProjectAssets).mockResolvedValue({ missing: [] } as any)
    vi.mocked(getStoryGraph).mockResolvedValue(makeGraph())
    vi.mocked(listEndings).mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('一次并发拉齐素材、剧情校验与结局', async () => {
    vi.mocked(checkProjectAssets).mockResolvedValue({
      missing: [{ kind_label: '立绘', where: '场景「雨夜」' }],
    } as any)
    vi.mocked(listEndings).mockResolvedValue(makeEndings())

    const check = createCheck()
    await check.runCheck()

    expect(checkProjectAssets).toHaveBeenCalledWith(7)
    expect(getStoryGraph).toHaveBeenCalledWith(7, true)
    expect(listEndings).toHaveBeenCalledWith(7)
    expect(check.missingAssets.value).toHaveLength(1)
    expect(check.errors.value).toEqual([{ code: 'E_DUP', message: '重复节点' }])
    expect(check.warnings.value).toEqual([{ code: 'W_SLOW', message: '对话偏长' }])
    expect(check.endings.value).toHaveLength(2)
    expect(check.loading.value).toBe(false)
    expect(check.error.value).toBe('')
  })

  it('用节点-场景映射判断结局可达性', async () => {
    vi.mocked(listEndings).mockResolvedValue([
      ...makeEndings(),
      { ending_id: 3, project_id: 7, title: '幽灵结局', content_id: 99, conditions: [] },
    ] as any)
    vi.mocked(getStoryGraph).mockResolvedValue(makeGraph({ validation: { errors: [], warnings: [], orphans: [13] } }))

    const check = createCheck()
    await check.runCheck()

    expect(check.nodeSceneMap.value).toEqual({ 12: 3, 13: 4 })
    expect(check.unreachableEndings.value).toEqual([
      { title: '坏结局', reason: '结局节点从主入口不可达', sceneId: 4 },
      { title: '幽灵结局', reason: '指向的节点 #99 不存在', sceneId: 0 },
    ])
    expect(check.reachableEndingCount.value).toBe(1)
  })

  it('素材、剧情错误、不可达结局三处都干净才算健康', async () => {
    vi.mocked(getStoryGraph).mockResolvedValue(makeGraph({ validation: { errors: [], warnings: [], orphans: [] } }))
    vi.mocked(listEndings).mockResolvedValue(makeEndings())

    const check = createCheck()
    await check.runCheck()
    expect(check.healthy.value).toBe(true)

    vi.mocked(checkProjectAssets).mockResolvedValue({
      missing: [{ kind_label: '背景', where: '场景「走廊」' }],
    } as any)
    await check.runCheck()
    expect(check.healthy.value).toBe(false)
  })

  it('缺少校验结果时按空数组处理，不抛错', async () => {
    vi.mocked(getStoryGraph).mockResolvedValue(makeGraph({ validation: undefined }))
    vi.mocked(checkProjectAssets).mockResolvedValue({} as any)

    const check = createCheck()
    await check.runCheck()
    expect(check.errors.value).toEqual([])
    expect(check.warnings.value).toEqual([])
    expect(check.missingAssets.value).toEqual([])
    expect(check.healthy.value).toBe(true)
  })

  it('项目 id 为空时三处接口都不请求', async () => {
    const check = useProjectHealthCheck({ projectId: () => null, onLocate: vi.fn() })
    await check.runCheck()
    expect(checkProjectAssets).not.toHaveBeenCalled()
    expect(getStoryGraph).not.toHaveBeenCalled()
    expect(listEndings).not.toHaveBeenCalled()
  })

  it('请求失败时给出提示并复位 loading', async () => {
    vi.mocked(checkProjectAssets).mockRejectedValue({ response: { data: { message: '项目不存在' } } })

    const check = createCheck()
    await check.runCheck()
    expect(check.error.value).toBe('自检失败：项目不存在')
    expect(check.loading.value).toBe(false)
  })
})

describe('useProjectHealthCheck / 定位', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('locate 把场景与节点原样抛给外层', () => {
    const onLocate = vi.fn()
    const check = createCheck(onLocate)
    check.locate(3, 12)
    expect(onLocate).toHaveBeenCalledWith(3, 12)
  })

  it('locate 没给节点时补 null', () => {
    const onLocate = vi.fn()
    const check = createCheck(onLocate)
    check.locate(3)
    expect(onLocate).toHaveBeenCalledWith(3, null)
  })

  it('locate 没有场景时什么都不做', () => {
    const onLocate = vi.fn()
    const check = createCheck(onLocate)
    check.locate(undefined, 12)
    check.locate(null)
    expect(onLocate).not.toHaveBeenCalled()
  })

  it('locateIssue 优先用问题自带场景，否则从节点反查', () => {
    const onLocate = vi.fn()
    const check = createCheck(onLocate)
    check.nodeSceneMap.value = { 12: 3 }

    check.locateIssue({ code: 'E1', message: 'x', detail: { scene_id: 5, content_id: 12 } })
    expect(onLocate).toHaveBeenLastCalledWith(5, 12)

    check.locateIssue({ code: 'E2', message: 'y', detail: { content_id: 12 } })
    expect(onLocate).toHaveBeenLastCalledWith(3, 12)
  })

  it('locateIssue 找不到任何目标时不跳转', () => {
    const onLocate = vi.fn()
    const check = createCheck(onLocate)
    check.locateIssue({ code: 'E3', message: 'z' })
    expect(onLocate).not.toHaveBeenCalled()
  })
})
