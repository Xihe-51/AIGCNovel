import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import {
  buildChapterRoute,
  computeChapterRouteStats,
  pickChapterSceneIndex,
  usePlayerChapters,
} from '@/composables/player/usePlayerChapters'

const listChapters = vi.fn()

vi.mock('@/api/chapter', () => ({
  listChapters: (...args: any[]) => listChapters(...args),
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

const scenes = [
  { scene_id: 11 },
  { scene_id: 12 },
  { scene_id: 13 },
  { scene_id: 14 },
]

const allDialogues = {
  11: [{ content_id: 101 }, { content_id: 102 }],
  12: [{ content_id: 201 }],
  13: [],
  14: [{ content_id: 401 }],
}

const chapters = [
  { chapter_id: 1, title: '开场', order_num: 1 },
  { chapter_id: 2, title: '第一幕', order_num: 2 },
  { chapter_id: 3, title: '第二幕', order_num: 3 },
]

const sceneMap = { '11': 1, '12': 1, '13': 2, '14': 2 }

function createChapters(options: {
  scenes?: any[]
  allDialogues?: Record<string, any[]>
  endings?: any[]
  readIds?: number[]
  lockedScenes?: number[]
  firstPlayableIndex?: number
} = {}) {
  const sceneList = options.scenes ?? [
    { scene_id: 11 },
    { scene_id: 12 },
    { scene_id: 13 },
  ]
  const dialogues = options.allDialogues ?? {
    11: [{ content_id: 101 }, { content_id: 102 }],
    12: [{ content_id: 201 }],
    13: [],
  }
  const readSet = new Set((options.readIds ?? []).map(Number))
  const locked = new Set((options.lockedScenes ?? []).map(Number))
  const state = { sceneIndex: 0, dialogueIndex: 0 }

  const spies = {
    clearLineSnapshots: vi.fn(),
    startPreview: vi.fn(),
    firstPlayableNodeIndex: vi.fn(() => options.firstPlayableIndex ?? 0),
    setSceneIndex: vi.fn((value: number) => { state.sceneIndex = value }),
    setDialogueIndex: vi.fn((value: number) => { state.dialogueIndex = value }),
  }

  const api = usePlayerChapters({
    projectId: () => 7,
    getScenes: () => sceneList,
    getAllDialogues: () => dialogues,
    getEndings: () => options.endings ?? [],
    hasRead: (contentId) => readSet.has(Number(contentId)),
    scenePlayable: (sceneId) => !locked.has(Number(sceneId)),
    firstPlayableNodeIndex: (sceneId) => spies.firstPlayableNodeIndex(sceneId),
    setSceneIndex: (value) => spies.setSceneIndex(value),
    setDialogueIndex: (value) => spies.setDialogueIndex(value),
    clearLineSnapshots: () => spies.clearLineSnapshots(),
    startPreview: () => spies.startPreview(),
    t,
  })

  return { ...api, state, spies, scenes: sceneList }
}

beforeEach(() => {
  listChapters.mockReset()
  vi.mocked(ElMessage.warning).mockReset()
  vi.mocked(ElMessage.success).mockReset()
})

describe('buildChapterRoute', () => {
  it('按 scene_map 聚合场景下标与节点数', () => {
    const route = buildChapterRoute(chapters, sceneMap, scenes, allDialogues, () => false)
    expect(route.map((c) => c.sceneIndexes)).toEqual([[0, 1], [2, 3], []])
    expect(route.map((c) => c.total)).toEqual([3, 1, 0])
  })

  it('已读节点数按逐节点统计，首章与读过的章节解锁', () => {
    const read = new Set([101, 201])
    const route = buildChapterRoute(chapters, sceneMap, scenes, allDialogues, (id) => read.has(Number(id)))
    expect(route.map((c) => c.read)).toEqual([2, 0, 0])
    expect(route.map((c) => c.unlocked)).toEqual([true, false, false])
  })

  it('读到任意节点的章节即解锁，未读章节保持锁定', () => {
    const route = buildChapterRoute(chapters, sceneMap, scenes, allDialogues, (id) => Number(id) === 401)
    expect(route[1].read).toBe(1)
    expect(route[1].unlocked).toBe(true)
    expect(route[2].read).toBe(0)
    expect(route[2].unlocked).toBe(false)
  })

  it('order_num 缺省时回退为章节序号', () => {
    const route = buildChapterRoute(
      [{ chapter_id: 5, title: '无序号' }],
      {},
      scenes,
      allDialogues,
      () => false,
    )
    expect(route[0].order_num).toBe(1)
    expect(route[0].title).toBe('无序号')
  })

  it('空章节列表返回空数组', () => {
    expect(buildChapterRoute([], {}, scenes, allDialogues, () => false)).toEqual([])
  })
})

describe('computeChapterRouteStats', () => {
  it('汇总全项目节点与已读数，并统计已解锁结局', () => {
    const read = new Set([101, 201])
    const endings = [{ ending_id: 1, unlocked: true }, { ending_id: 2, unlocked: false }]
    expect(computeChapterRouteStats(allDialogues, (id) => read.has(Number(id)), endings)).toEqual({
      total: 4,
      read: 2,
      endingUnlocked: 1,
    })
  })

  it('空数据时统计归零', () => {
    expect(computeChapterRouteStats({}, () => false, [])).toEqual({
      total: 0,
      read: 0,
      endingUnlocked: 0,
    })
  })
})

describe('pickChapterSceneIndex', () => {
  it('跳过锁定场景，取第一个可播放且有台词的场景', () => {
    const chapter = { sceneIndexes: [0, 1] }
    expect(pickChapterSceneIndex(chapter, scenes, allDialogues, (id) => Number(id) !== 11)).toBe(1)
  })

  it('跳过空场景', () => {
    const chapter = { sceneIndexes: [2, 3] }
    expect(pickChapterSceneIndex(chapter, scenes, allDialogues, () => true)).toBe(3)
  })

  it('全部不可播放时返回 undefined', () => {
    const chapter = { sceneIndexes: [0, 2] }
    expect(pickChapterSceneIndex(chapter, scenes, allDialogues, (id) => Number(id) !== 11)).toBeUndefined()
  })
})

describe('usePlayerChapters', () => {
  it('初始状态为未打开弹窗、空章节数据', () => {
    const chaptersApi = createChapters()
    expect(chaptersApi.chaptersVisible.value).toBe(false)
    expect(chaptersApi.chapterData.value).toEqual({ chapters: [], scene_map: {} })
    expect(chaptersApi.chapterRoute.value).toEqual([])
  })

  it('loadChapterData 拉取章节并通过 chapterRoute 聚合', async () => {
    listChapters.mockResolvedValue({
      chapters: [{ chapter_id: 1, title: '开场', order_num: 1 }],
      scene_map: { '11': 1 },
    })
    const chaptersApi = createChapters()
    await chaptersApi.loadChapterData()
    expect(listChapters).toHaveBeenCalledWith(7)
    expect(chaptersApi.chapterRoute.value).toEqual([
      {
        chapter_id: 1,
        title: '开场',
        order_num: 1,
        sceneIndexes: [0],
        total: 2,
        read: 0,
        unlocked: true,
      },
    ])
  })

  it('loadChapterData 失败时回落空数据', async () => {
    listChapters.mockRejectedValue(new Error('boom'))
    const chaptersApi = createChapters()
    await chaptersApi.loadChapterData()
    expect(chaptersApi.chapterData.value).toEqual({ chapters: [], scene_map: {} })
    expect(chaptersApi.chapterRoute.value).toEqual([])
  })

  it('routeStats 汇总全项目进度与结局', async () => {
    listChapters.mockResolvedValue({ chapters: [], scene_map: {} })
    const chaptersApi = createChapters({
      readIds: [101, 201],
      endings: [{ ending_id: 1, unlocked: true }, { ending_id: 2, unlocked: false }],
    })
    expect(chaptersApi.routeStats.value).toEqual({ total: 3, read: 2, endingUnlocked: 1 })
  })

  it('未解锁章节提示后返回 locked', () => {
    const chaptersApi = createChapters()
    expect(chaptersApi.jumpToChapter({ unlocked: false, title: '第二幕' })).toBe('locked')
    expect(ElMessage.warning).toHaveBeenCalledWith('chapters.lockedToast')
    expect(chaptersApi.spies.setSceneIndex).not.toHaveBeenCalled()
    expect(chaptersApi.chaptersVisible.value).toBe(false)
  })

  it('章节内没有可播放场景时提示后返回 empty', () => {
    const chaptersApi = createChapters()
    expect(chaptersApi.jumpToChapter({ unlocked: true, title: '第二幕', sceneIndexes: [2] })).toBe('empty')
    expect(ElMessage.warning).toHaveBeenCalledWith('chapters.emptyToast')
    expect(chaptersApi.spies.setSceneIndex).not.toHaveBeenCalled()
  })

  it('跳转成功时定位到首个可播放节点并关闭弹窗', async () => {
    const chaptersApi = createChapters({ firstPlayableIndex: 1, lockedScenes: [11] })
    chaptersApi.chaptersVisible.value = true
    expect(chaptersApi.jumpToChapter({ unlocked: true, title: '第一幕', sceneIndexes: [0, 1] })).toBe('ok')
    expect(chaptersApi.spies.clearLineSnapshots).toHaveBeenCalledTimes(1)
    expect(chaptersApi.spies.firstPlayableNodeIndex).toHaveBeenCalledWith(12)
    expect(chaptersApi.spies.setSceneIndex).toHaveBeenCalledWith(1)
    expect(chaptersApi.spies.setDialogueIndex).toHaveBeenCalledWith(1)
    expect(chaptersApi.chaptersVisible.value).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith('chapters.jumpedToast|{"title":"第一幕"}')
    expect(chaptersApi.spies.startPreview).not.toHaveBeenCalled()
    await nextTick()
    expect(chaptersApi.spies.startPreview).toHaveBeenCalledTimes(1)
  })
})
