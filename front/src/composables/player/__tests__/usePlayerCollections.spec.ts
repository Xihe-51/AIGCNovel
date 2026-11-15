import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import {
  galleryCountTextOf,
  usePlayerCollections,
} from '@/composables/player/usePlayerCollections'

const getGallery = vi.fn()
const listMusicGallery = vi.fn()
const loadPlayerAchievements = vi.fn()
const loadEndings = vi.fn()

vi.mock('@/api/cg', () => ({
  getGallery: (...args: any[]) => getGallery(...args),
}))

vi.mock('@/api/gallery', () => ({
  listMusicGallery: (...args: any[]) => listMusicGallery(...args),
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

const stats = {
  cgUnlocked: 2,
  cgTotal: 5,
  musicUnlocked: 1,
  musicTotal: 3,
  achievementUnlocked: 4,
  achievementTotal: 9,
  endingUnlocked: 1,
  endingTotal: 2,
}

function createCollections(options: {
  endings?: any[]
  achievements?: any[]
  unlockedAchievementCount?: number
} = {}) {
  const state = {
    endings: options.endings ?? [],
    achievements: options.achievements ?? [],
    unlockedAchievementCount: options.unlockedAchievementCount ?? 0,
  }

  const api = usePlayerCollections({
    projectId: () => 7,
    getEndings: () => state.endings,
    getAchievements: () => state.achievements,
    getUnlockedAchievementCount: () => state.unlockedAchievementCount,
    loadPlayerAchievements: () => loadPlayerAchievements(),
    loadEndings: () => loadEndings(),
    t,
  })

  return { ...api, state }
}

beforeEach(() => {
  getGallery.mockReset()
  listMusicGallery.mockReset()
  loadPlayerAchievements.mockReset()
  loadEndings.mockReset()
  vi.mocked(ElMessage.error).mockReset()
})

describe('galleryCountTextOf', () => {
  it('CG 页签用 CG 已解锁数', () => {
    expect(galleryCountTextOf('cg', stats, t)).toBe('gallery.unlockedStats|{"n":2,"total":5}')
  })

  it('BGM 页签用曲目已解锁数', () => {
    expect(galleryCountTextOf('bgm', stats, t)).toBe('gallery.unlockedStats|{"n":1,"total":3}')
  })

  it('成就页签用成就已解锁数', () => {
    expect(galleryCountTextOf('achievement', stats, t)).toBe('gallery.unlockedStats|{"n":4,"total":9}')
  })

  it('结局页签换成「已达成」文案', () => {
    expect(galleryCountTextOf('ending', stats, t)).toBe('gallery.reachedStats|{"n":1,"total":2}')
  })

  it('未知页签按结局处理', () => {
    expect(galleryCountTextOf('unknown', stats, t)).toBe('gallery.reachedStats|{"n":1,"total":2}')
  })
})

describe('usePlayerCollections', () => {
  it('初始状态为 CG 页签、弹窗关闭', () => {
    const collections = createCollections()
    expect(collections.galleryTab.value).toBe('cg')
    expect(collections.galleryDialogVisible.value).toBe(false)
    expect(collections.galleryItems.value).toEqual([])
    expect(collections.musicLoading.value).toBe(false)
  })

  it('galleryCountText 默认按 CG 页签聚合', () => {
    const collections = createCollections()
    expect(collections.galleryCountText.value).toBe('gallery.unlockedStats|{"n":0,"total":0}')
  })

  it('成就页签统计依赖成就总数与已解锁数', () => {
    const collections = createCollections({ achievements: [{}, {}, {}], unlockedAchievementCount: 2 })
    collections.galleryTab.value = 'achievement'
    expect(collections.galleryCountText.value).toBe('gallery.unlockedStats|{"n":2,"total":3}')
  })

  it('结局页签统计依赖已解锁结局数', () => {
    const collections = createCollections({
      endings: [{ ending_id: 1, unlocked: true }, { ending_id: 2, unlocked: false }],
    })
    collections.galleryTab.value = 'ending'
    expect(collections.galleryCountText.value).toBe('gallery.reachedStats|{"n":1,"total":2}')
  })

  it('切到 cg 页签加载 CG 鉴赏数据', async () => {
    getGallery.mockResolvedValue({
      total: 5,
      unlocked_count: 2,
      items: [{ cg_id: 1, unlocked: true }],
    })
    const collections = createCollections()
    await collections.switchGalleryTab('cg')
    expect(getGallery).toHaveBeenCalledWith(7)
    expect(collections.galleryTab.value).toBe('cg')
    expect(collections.galleryItems.value).toHaveLength(1)
    expect(collections.galleryTotal.value).toBe(5)
    expect(collections.galleryUnlocked.value).toBe(2)
    expect(collections.galleryCountText.value).toBe('gallery.unlockedStats|{"n":2,"total":5}')
    expect(listMusicGallery).not.toHaveBeenCalled()
  })

  it('切到 bgm 页签加载曲库并在结束后复位 loading', async () => {
    listMusicGallery.mockResolvedValue({ total: 3, unlocked_count: 1, items: [{ title: '主题曲' }] })
    const collections = createCollections()
    const task = collections.switchGalleryTab('bgm')
    expect(collections.musicLoading.value).toBe(true)
    await task
    expect(listMusicGallery).toHaveBeenCalledWith(7)
    expect(collections.musicItems.value).toHaveLength(1)
    expect(collections.musicTotal.value).toBe(3)
    expect(collections.musicUnlocked.value).toBe(1)
    expect(collections.musicLoading.value).toBe(false)
  })

  it('切到成就页签只触发成就加载', async () => {
    loadPlayerAchievements.mockResolvedValue(undefined)
    const collections = createCollections()
    await collections.switchGalleryTab('achievement')
    expect(loadPlayerAchievements).toHaveBeenCalledTimes(1)
    expect(getGallery).not.toHaveBeenCalled()
    expect(listMusicGallery).not.toHaveBeenCalled()
  })

  it('结局页签首次进入才拉取结局', async () => {
    loadEndings.mockResolvedValue(undefined)
    const empty = createCollections()
    await empty.switchGalleryTab('ending')
    expect(loadEndings).toHaveBeenCalledTimes(1)

    loadEndings.mockReset()
    const loaded = createCollections({ endings: [{ ending_id: 1, unlocked: true }] })
    await loaded.switchGalleryTab('ending')
    expect(loadEndings).not.toHaveBeenCalled()
  })

  it('CG 加载失败时清空并优先使用后端错误信息', async () => {
    getGallery.mockRejectedValue({ response: { data: { message: '作品未公开' } } })
    const collections = createCollections()
    await collections.switchGalleryTab('cg')
    expect(collections.galleryItems.value).toEqual([])
    expect(collections.galleryTotal.value).toBe(0)
    expect(collections.galleryUnlocked.value).toBe(0)
    expect(ElMessage.error).toHaveBeenCalledWith('作品未公开')
  })

  it('CG 加载失败且无后端信息时用本地兜底文案', async () => {
    getGallery.mockRejectedValue(new Error('boom'))
    const collections = createCollections()
    await collections.switchGalleryTab('cg')
    expect(ElMessage.error).toHaveBeenCalledWith('gallery.loadFailed')
  })

  it('BGM 加载失败时清空且复位 loading', async () => {
    listMusicGallery.mockRejectedValue(new Error('boom'))
    const collections = createCollections()
    await collections.switchGalleryTab('bgm')
    expect(collections.musicItems.value).toEqual([])
    expect(collections.musicTotal.value).toBe(0)
    expect(collections.musicUnlocked.value).toBe(0)
    expect(collections.musicLoading.value).toBe(false)
  })

  it('openGallery 打开弹窗并加载当前页签', async () => {
    getGallery.mockResolvedValue({ total: 1, unlocked_count: 1, items: [{ cg_id: 1 }] })
    const collections = createCollections()
    await collections.openGallery()
    expect(collections.galleryDialogVisible.value).toBe(true)
    expect(getGallery).toHaveBeenCalledWith(7)
  })
})
