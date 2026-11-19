import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getSceneById, getDialoguesBySceneId, getCharactersByProjectId, getCharacterAvatars } from '@/api/dialogue'
import { getStoryGraph } from '@/api/branch'
import { listVariables, listEffects } from '@/api/variable'
import { groupEffectsByContent, sortDialoguesByOrder, useSceneLoader } from '@/composables/scene/useSceneLoader'

vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

vi.mock('@/api/dialogue', () => ({
  getSceneById: vi.fn(),
  getDialoguesBySceneId: vi.fn(),
  getCharactersByProjectId: vi.fn(),
  getCharacterAvatars: vi.fn(),
}))

vi.mock('@/api/branch', () => ({ getStoryGraph: vi.fn() }))

vi.mock('@/api/variable', () => ({
  listVariables: vi.fn(),
  listEffects: vi.fn(),
}))

const createLoader = (overrides: Record<string, any> = {}) => {
  const state = {
    scene: ref<any>(null),
    projectId: ref<string | number>(''),
    dialogues: ref<any[]>([]),
    projectNodes: ref<any[]>([]),
    variables: ref<any[]>([]),
    effectsMap: ref<Record<string, any>>({}),
    characters: ref<any[]>([]),
    loading: ref(false),
    error: ref(''),
    sceneReady: ref(false),
  }
  const calls: string[] = []
  const deps = {
    sceneId: () => 15,
    focusContentId: () => null as number | null,
    loadSceneLock: vi.fn(() => {
      calls.push('lock')
      return Promise.resolve()
    }),
    resetSnapshot: vi.fn(() => {
      calls.push('snapshot')
    }),
    loadJumpMap: vi.fn(() => {
      calls.push('jump')
      return Promise.resolve()
    }),
    loadFsmStates: vi.fn(() => {
      calls.push('fsm')
    }),
    ensureChoices: vi.fn(() => Promise.resolve()),
    resetHistory: vi.fn(() => {
      calls.push('reset')
    }),
    maybeRestoreDraft: vi.fn(() => {
      calls.push('draft')
      return Promise.resolve()
    }),
    focusDialogueByContentId: vi.fn(),
  }
  const loader = useSceneLoader({ ...state, ...deps, ...overrides })
  return { loader, state, calls, deps }
}

const mockHappyPath = () => {
  vi.mocked(getSceneById).mockResolvedValue({ scene_id: 15, project_id: 7, title: '第一幕' } as any)
  vi.mocked(getStoryGraph).mockResolvedValue({ nodes: [{ content_id: 101 }] } as any)
  vi.mocked(listVariables).mockResolvedValue([{ variable_id: 1, name: '好感' }] as any)
  vi.mocked(listEffects).mockResolvedValue([
    { content_id: 11, variable_id: 1, label: '好感', delta: 2 },
    { content_id: 11, variable_id: 2, label: '金币', delta: 1 },
  ] as any)
  vi.mocked(getDialoguesBySceneId).mockResolvedValue([
    { content_id: 12, order_num: 2 },
    { content_id: 11, order_num: 1, content_type: '选择' },
  ] as any)
  vi.mocked(getCharactersByProjectId).mockResolvedValue([{ character_id: 3, name: '林' }] as any)
  vi.mocked(getCharacterAvatars).mockResolvedValue([{ url: 'a.png' }] as any)
}

describe('groupEffectsByContent', () => {
  it('按 content_id 聚合，只保留变量/标签/增量', () => {
    const map = groupEffectsByContent([
      { content_id: 11, variable_id: 1, label: '好感', delta: 2, extra: 'x' },
      { content_id: 11, variable_id: 2, label: '金币', delta: -1 },
      { content_id: 12, variable_id: 1, label: '好感', delta: 5 },
    ])
    expect(Object.keys(map)).toEqual(['11', '12'])
    expect(map[11]).toEqual([
      { variable_id: 1, label: '好感', delta: 2 },
      { variable_id: 2, label: '金币', delta: -1 },
    ])
    expect(map[12]).toHaveLength(1)
  })

  it('空值回落空对象', () => {
    expect(groupEffectsByContent(null)).toEqual({})
    expect(groupEffectsByContent(undefined)).toEqual({})
    expect(groupEffectsByContent([])).toEqual({})
  })
})

describe('sortDialoguesByOrder', () => {
  it('按 order_num 升序且不改入参', () => {
    const input = [{ order_num: 3 }, { order_num: 1 }, { order_num: 2 }]
    const sorted = sortDialoguesByOrder(input)
    expect(sorted.map(d => d.order_num)).toEqual([1, 2, 3])
    expect(input.map(d => d.order_num)).toEqual([3, 1, 2])
  })

  it('空值与缺失序号不抛错', () => {
    expect(sortDialoguesByOrder(null)).toEqual([])
    expect(sortDialoguesByOrder([{ order_num: 2 }, {}]).map(d => d.order_num)).toEqual([undefined, 2])
  })
})

describe('useSceneLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('装载场景 / 节点 / 变量 / 角色 / 台词', async () => {
    mockHappyPath()
    const { loader, state } = createLoader()

    await loader.fetchSceneData()

    expect(state.scene.value).toMatchObject({ scene_id: 15, project_id: 7 })
    expect(state.projectId.value).toBe(7)
    expect(state.projectNodes.value).toEqual([{ content_id: 101 }])
    expect(state.variables.value).toHaveLength(1)
    expect(state.effectsMap.value[11]).toHaveLength(2)
    expect(state.dialogues.value.map(d => d.content_id)).toEqual([11, 12])
    expect(state.characters.value[0]).toMatchObject({ character_id: 3, avatars: [{ url: 'a.png' }] })
    expect(state.loading.value).toBe(false)
    expect(state.sceneReady.value).toBe(true)
    expect(state.error.value).toBe('')
  })

  it('只为「选择」类型预加载分支选项', async () => {
    mockHappyPath()
    const { loader, deps } = createLoader()

    await loader.fetchSceneData()

    expect(deps.ensureChoices).toHaveBeenCalledTimes(1)
    expect(deps.ensureChoices.mock.calls[0][0]).toMatchObject({ content_id: 11, content_type: '选择' })
  })

  it('加载顺序：剧情锁 → 建基线 → 就绪 → 跳转边，最后重置历史并恢复草稿', async () => {
    mockHappyPath()
    const { loader, calls } = createLoader()

    await loader.fetchSceneData()

    expect(calls).toEqual(['lock', 'snapshot', 'jump', 'fsm', 'reset', 'draft'])
  })

  it('传入定位目标时在渲染后聚焦对应台词', async () => {
    mockHappyPath()
    const { loader, deps } = createLoader({ focusContentId: () => 11 })

    await loader.fetchSceneData()
    await nextTick()

    expect(deps.focusDialogueByContentId).toHaveBeenCalledWith(11)
  })

  it('无定位目标时不聚焦', async () => {
    mockHappyPath()
    const { loader, deps } = createLoader()

    await loader.fetchSceneData()
    await nextTick()

    expect(deps.focusDialogueByContentId).not.toHaveBeenCalled()
  })

  it('场景 ID 非法时直接报错且不请求接口', async () => {
    const { loader, state } = createLoader({ sceneId: () => 'abc' })

    await loader.fetchSceneData()

    expect(state.error.value).toBe('无效的场景ID')
    expect(state.loading.value).toBe(false)
    expect(state.sceneReady.value).toBe(false)
    expect(ElMessage.error).toHaveBeenCalledWith('无效的场景ID')
    expect(getSceneById).not.toHaveBeenCalled()
  })

  it('接口失败时给出错误文案，缺省回落到通用提示', async () => {
    vi.mocked(getSceneById).mockRejectedValue(new Error('场景不存在'))
    const first = createLoader()
    await first.loader.fetchSceneData()
    expect(first.state.error.value).toBe('场景不存在')

    vi.mocked(getSceneById).mockRejectedValue({})
    const second = createLoader()
    await second.loader.fetchSceneData()
    expect(second.state.error.value).toBe('获取数据失败，请稍后重试')
    expect(ElMessage.error).toHaveBeenCalledWith('获取数据失败，请稍后重试')
  })

  it('节点/变量接口失败时降级为空并继续装台词', async () => {
    mockHappyPath()
    vi.mocked(getStoryGraph).mockRejectedValue(new Error('boom'))
    vi.mocked(listVariables).mockRejectedValue(new Error('boom'))
    const { loader, state } = createLoader()

    await loader.fetchSceneData()

    expect(state.projectNodes.value).toEqual([])
    expect(state.variables.value).toEqual([])
    expect(state.effectsMap.value).toEqual({})
    expect(state.dialogues.value).toHaveLength(2)
    expect(state.error.value).toBe('')
  })

  it('无 projectId 时跳过节点与变量加载', async () => {
    const { loader } = createLoader()

    await loader.loadProjectNodes()
    await loader.loadVariablesAndEffects()

    expect(getStoryGraph).not.toHaveBeenCalled()
    expect(listVariables).not.toHaveBeenCalled()
    expect(listEffects).not.toHaveBeenCalled()
  })

  it('项目未绑定角色时不请求角色列表', async () => {
    mockHappyPath()
    vi.mocked(getSceneById).mockResolvedValue({ scene_id: 15, project_id: null } as any)
    const { loader, state } = createLoader()

    await loader.fetchSceneData()

    expect(getCharactersByProjectId).not.toHaveBeenCalled()
    expect(state.characters.value).toEqual([])
  })
})
