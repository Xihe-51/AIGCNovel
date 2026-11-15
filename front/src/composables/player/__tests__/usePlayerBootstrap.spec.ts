import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import {
  attachCharacterAvatars,
  buildHistoryDialogues,
  collectDialogues,
  findStartPosition,
  sortScenes,
  usePlayerBootstrap,
} from '@/composables/player/usePlayerBootstrap'

const getDialoguesBySceneId = vi.fn()
const getCharactersByProjectId = vi.fn()
const getCharacterAvatars = vi.fn()
const getScenes = vi.fn()
const listBranches = vi.fn()
const getProject = vi.fn()

vi.mock('@/api/dialogue', () => ({
  getDialoguesBySceneId: (...args: any[]) => getDialoguesBySceneId(...args),
  getCharactersByProjectId: (...args: any[]) => getCharactersByProjectId(...args),
  getCharacterAvatars: (...args: any[]) => getCharacterAvatars(...args),
}))

vi.mock('@/api/scenes', () => ({
  getScenes: (...args: any[]) => getScenes(...args),
}))

vi.mock('@/api/branch', () => ({
  listBranches: (...args: any[]) => listBranches(...args),
}))

vi.mock('@/api/project', () => ({
  getProject: (...args: any[]) => getProject(...args),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

const t = (key: string, params?: any) => (params ? `${key}|${JSON.stringify(params)}` : key)

describe('sortScenes', () => {
  it('按 order_num 升序且不改动入参', () => {
    const input = [{ scene_id: 3, order_num: 3 }, { scene_id: 1, order_num: 1 }, { scene_id: 2, order_num: 2 }]
    const sorted = sortScenes(input)
    expect(sorted.map((s: any) => s.scene_id)).toEqual([1, 2, 3])
    expect(input.map((s: any) => s.scene_id)).toEqual([3, 1, 2])
  })

  it('缺 order_num 时按 0 处理，空入参返回空数组', () => {
    expect(sortScenes([{ scene_id: 1 }, { scene_id: 2, order_num: -1 }]).map((s: any) => s.scene_id)).toEqual([2, 1])
    expect(sortScenes(null as any)).toEqual([])
  })
})

describe('collectDialogues', () => {
  it('为每条台词注入 scene_id 并按 order_num 升序', async () => {
    const scenes = [{ scene_id: 11 }, { scene_id: 12 }]
    const fetchDialogues = vi.fn(async (sceneId: any) => (
      sceneId === 11
        ? [{ content_id: 102, order_num: 2 }, { content_id: 101, order_num: 1 }]
        : [{ content_id: 201, order_num: 1 }]
    ))
    const result = await collectDialogues(scenes, fetchDialogues)
    expect(fetchDialogues).toHaveBeenCalledTimes(2)
    expect(result[11].map((n: any) => n.content_id)).toEqual([101, 102])
    expect(result[11].every((n: any) => n.scene_id === 11)).toBe(true)
    expect(result[12]).toEqual([{ content_id: 201, order_num: 1, scene_id: 12 }])
  })

  it('接口返回空时落为空数组', async () => {
    const result = await collectDialogues([{ scene_id: 11 }], async () => null as any)
    expect(result[11]).toEqual([])
  })
})

describe('attachCharacterAvatars', () => {
  it('合并头像列表', async () => {
    const merged = await attachCharacterAvatars(
      [{ character_id: 1, name: '甲' }, { character_id: 2, name: '乙' }],
      async (id: any) => (id === 1 ? [{ avatar_id: 9 }] : null),
    )
    expect(merged[0]).toEqual({ character_id: 1, name: '甲', avatars: [{ avatar_id: 9 }] })
    expect(merged[1]).toEqual({ character_id: 2, name: '乙', avatars: [] })
  })

  it('单个角色取头像抛错时降级为空头像，不影响其他角色', async () => {
    const merged = await attachCharacterAvatars(
      [{ character_id: 1 }, { character_id: 2 }],
      async (id: any) => {
        if (id === 1) throw new Error('boom')
        return [{ avatar_id: 2 }]
      },
    )
    expect(merged[0].avatars).toEqual([])
    expect(merged[1].avatars).toEqual([{ avatar_id: 2 }])
  })
})

describe('findStartPosition', () => {
  const scenes = [{ scene_id: 11 }, { scene_id: 12 }]
  const allDialogues = {
    11: [{ content_id: 101 }, { content_id: 102 }],
    12: [{ content_id: 201 }],
  }

  it('命中节点时返回场景与台词下标', () => {
    expect(findStartPosition(scenes, allDialogues, 201)).toEqual({ sceneIndex: 1, dialogueIndex: 0 })
    expect(findStartPosition(scenes, allDialogues, 102)).toEqual({ sceneIndex: 0, dialogueIndex: 1 })
  })

  it('未命中或 contentId 为 0 时返回 null', () => {
    expect(findStartPosition(scenes, allDialogues, 999)).toBeNull()
    expect(findStartPosition(scenes, allDialogues, 0)).toBeNull()
  })

  it('字符串型 content_id 也能匹配', () => {
    expect(findStartPosition([{ scene_id: 11 }], { 11: [{ content_id: '101' }] }, 101))
      .toEqual({ sceneIndex: 0, dialogueIndex: 0 })
  })
})

describe('buildHistoryDialogues', () => {
  const scenes = [
    { scene_id: 11, title: '开场' },
    { scene_id: 12, title: '第一幕' },
    { scene_id: 13, title: '第二幕' },
  ]
  const allDialogues = {
    11: [{ content_id: 101 }, { content_id: 102 }],
    12: [{ content_id: 201 }, { content_id: 202 }],
    13: [{ content_id: 301 }],
  }

  it('包含之前场景全部台词与当前场景已播部分，并附带场景名', () => {
    const history = buildHistoryDialogues(scenes, allDialogues, 1, 1)
    expect(history.map((n: any) => n.content_id)).toEqual([101, 102, 201])
    expect(history.map((n: any) => n.scene_title)).toEqual(['开场', '开场', '第一幕'])
  })

  it('当前场景下标为 0 时只返回当前场景首句之前的内容', () => {
    expect(buildHistoryDialogues(scenes, allDialogues, 0, 0)).toEqual([])
    expect(buildHistoryDialogues(scenes, allDialogues, 0, 2).map((n: any) => n.content_id))
      .toEqual([101, 102])
  })

  it('下标越界时按边界裁剪，不抛错', () => {
    const history = buildHistoryDialogues(scenes, allDialogues, 5, 3)
    expect(history.map((n: any) => n.content_id)).toEqual([101, 102, 201, 202, 301])
    expect(buildHistoryDialogues(scenes, allDialogues, -1, -1)).toEqual([])
  })
})

function createBootstrap(options: {
  projectId?: number
  releaseView?: boolean
  debugRequested?: boolean
  isOwner?: boolean
  canPerform?: boolean
  startQuery?: any
} = {}) {
  const calls: string[] = []
  const state = {
    debugMode: false,
    performMode: false,
    projectOwnerId: 0,
    sceneIndex: 0,
    dialogueIndex: 0,
  }

  const bootstrap = usePlayerBootstrap({
    projectId: () => (options.projectId === undefined ? 7 : options.projectId),
    releaseView: () => !!options.releaseView,
    debugRequested: () => !!options.debugRequested,
    isOwner: () => options.isOwner ?? true,
    canPerform: () => options.canPerform ?? false,
    startQuery: () => options.startQuery,
    setDebugMode: (value) => { state.debugMode = value },
    setPerformMode: (value) => { state.performMode = value },
    setProjectOwnerId: (value) => { state.projectOwnerId = value },
    setSceneIndex: (value) => { state.sceneIndex = value },
    setDialogueIndex: (value) => { state.dialogueIndex = value },
    loadProgress: () => { calls.push('loadProgress') },
    loadStoryGraph: async () => { calls.push('loadStoryGraph') },
    loadReads: async () => { calls.push('loadReads') },
    loadChapterData: async () => { calls.push('loadChapterData') },
    loadDebugSnapshots: () => { calls.push('loadDebugSnapshots') },
    loadVariableSystem: async () => { calls.push('loadVariableSystem') },
    loadEndings: async () => { calls.push('loadEndings') },
    loadPlayerAchievements: async () => { calls.push('loadPlayerAchievements') },
    loadPublicReleases: async () => { calls.push('loadPublicReleases') },
    onLoaded: () => { calls.push('onLoaded') },
    t,
  })

  return { ...bootstrap, state, calls }
}

describe('usePlayerBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProject.mockResolvedValue({ ui_theme: 'ink', cover_url: 'cover.png', user_id: 1 })
    getScenes.mockResolvedValue([
      { scene_id: 12, order_num: 2, title: '第一幕' },
      { scene_id: 11, order_num: 1, title: '开场' },
    ])
    getDialoguesBySceneId.mockImplementation(async (sceneId: any) => (
      sceneId === 11
        ? [{ content_id: 101, order_num: 1 }, { content_id: 102, order_num: 2 }]
        : [{ content_id: 201, order_num: 1 }]
    ))
    getCharactersByProjectId.mockResolvedValue([{ character_id: 1, name: '甲' }])
    getCharacterAvatars.mockResolvedValue([{ avatar_id: 5 }])
    listBranches.mockResolvedValue([{ branch_id: 1 }])
  })

  it('装载成功后写入作品信息、场景、台词、角色与分支', async () => {
    const api = createBootstrap()
    await api.fetchProjectData()

    expect(api.loading.value).toBe(false)
    expect(api.error.value).toBe('')
    expect(api.playTheme.value).toBe('ink')
    expect(api.projectCoverUrl.value).toBe('cover.png')
    expect(api.state.projectOwnerId).toBe(1)
    expect(api.scenes.value.map((s: any) => s.scene_id)).toEqual([11, 12])
    expect(api.allDialogues.value[11].map((n: any) => n.content_id)).toEqual([101, 102])
    expect(api.characters.value[0].avatars).toEqual([{ avatar_id: 5 }])
    expect(api.branches.value).toEqual([{ branch_id: 1 }])
  })

  it('按既定顺序调用下游装载域，最后触发 onLoaded', async () => {
    const api = createBootstrap()
    await api.fetchProjectData()

    expect(api.calls).toEqual([
      'loadProgress',
      'loadReads',
      'loadChapterData',
      'loadVariableSystem',
      'loadEndings',
      'loadPlayerAchievements',
      'loadPublicReleases',
      'onLoaded',
    ])
  })

  it('调试模式：仅作者非发布版开启，并追加拓扑与快照装载', async () => {
    const api = createBootstrap({ debugRequested: true, isOwner: true, releaseView: false })
    await api.fetchProjectData()

    expect(api.state.debugMode).toBe(true)
    expect(api.calls).toContain('loadStoryGraph')
    expect(api.calls).toContain('loadDebugSnapshots')
  })

  it('发布版与非作者即便带 debug 参数也不开调试器', async () => {
    const released = createBootstrap({ debugRequested: true, isOwner: true, releaseView: true })
    await released.fetchProjectData()
    expect(released.state.debugMode).toBe(false)
    expect(released.calls).not.toContain('loadStoryGraph')

    const guest = createBootstrap({ debugRequested: true, isOwner: false })
    await guest.fetchProjectData()
    expect(guest.state.debugMode).toBe(false)
  })

  it('调试模式下 ?start 命中则定位到该节点', async () => {
    const api = createBootstrap({ debugRequested: true, startQuery: '201' })
    await api.fetchProjectData()

    expect(api.state.sceneIndex).toBe(1)
    expect(api.state.dialogueIndex).toBe(0)
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  it('调试模式下 ?start 未命中提示缺失节点', async () => {
    const api = createBootstrap({ debugRequested: true, startQuery: '999' })
    await api.fetchProjectData()

    expect(ElMessage.warning).toHaveBeenCalledWith('toast.startNodeMissing|{"id":999}')
    expect(api.state.sceneIndex).toBe(0)
  })

  it('非调试模式忽略 ?start', async () => {
    const api = createBootstrap({ startQuery: '201' })
    await api.fetchProjectData()

    expect(api.state.sceneIndex).toBe(0)
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  it('作品信息接口失败时降级为默认皮肤与 0 号归属', async () => {
    getProject.mockRejectedValue(new Error('404'))
    const api = createBootstrap()
    await api.fetchProjectData()

    expect(api.playTheme.value).toBe('classic')
    expect(api.projectCoverUrl.value).toBe('')
    expect(api.state.projectOwnerId).toBe(0)
    expect(api.error.value).toBe('')
  })

  it('无场景时进入错误态且不触发 onLoaded', async () => {
    getScenes.mockResolvedValue([])
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const api = createBootstrap()
    await api.fetchProjectData()

    expect(api.error.value).toBe('该项目下没有场景数据')
    expect(api.loading.value).toBe(false)
    expect(api.calls).not.toContain('onLoaded')
    expect(ElMessage.error).toHaveBeenCalledWith('该项目下没有场景数据')
    spy.mockRestore()
  })

  it('项目 ID 非法时直接报错', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const api = createBootstrap({ projectId: NaN })
    await api.fetchProjectData()

    expect(api.error.value).toBe('无效的项目ID')
    expect(getScenes).not.toHaveBeenCalled()
    expect(api.calls).not.toContain('onLoaded')
    spy.mockRestore()
  })

  it('分支接口失败时按线性剧情播放，不阻断装载', async () => {
    listBranches.mockRejectedValue(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = createBootstrap()
    await api.fetchProjectData()

    expect(api.branches.value).toEqual([])
    expect(api.error.value).toBe('')
    expect(api.calls).toContain('onLoaded')
    warn.mockRestore()
  })

  it('装载期间 loading 置为 true，结束后复位', async () => {
    const api = createBootstrap()
    const pending = api.fetchProjectData()
    expect(api.loading.value).toBe(true)
    await pending
    await nextTick()
    expect(api.loading.value).toBe(false)
  })
})
