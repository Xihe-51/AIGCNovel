/**
 * 播放器鉴赏 / 收藏：CG、BGM、成就、结局四类收藏的加载与页签切换。
 *
 * 项目 id、结局与成就数据通过适配器注入，
 * composable 只负责收藏数据状态与「页签 -> 加载器」的分发。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getGallery } from '@/api/cg'
import { listMusicGallery } from '@/api/gallery'

export type GalleryTabKey = 'cg' | 'bgm' | 'achievement' | 'ending'

export interface GalleryCountStats {
  cgUnlocked: number
  cgTotal: number
  musicUnlocked: number
  musicTotal: number
  achievementUnlocked: number
  achievementTotal: number
  endingUnlocked: number
  endingTotal: number
}

/** 收藏页签顶部的「已解锁 / 总数」文案；结局页签用「已达成」措辞 */
export const galleryCountTextOf = (
  tab: string,
  stats: GalleryCountStats,
  t: (key: string, params?: any) => string,
): string => {
  if (tab === 'cg') {
    return t('gallery.unlockedStats', { n: stats.cgUnlocked, total: stats.cgTotal })
  }
  if (tab === 'bgm') {
    return t('gallery.unlockedStats', { n: stats.musicUnlocked, total: stats.musicTotal })
  }
  if (tab === 'achievement') {
    return t('gallery.unlockedStats', { n: stats.achievementUnlocked, total: stats.achievementTotal })
  }
  return t('gallery.reachedStats', { n: stats.endingUnlocked, total: stats.endingTotal })
}

export interface PlayerCollectionsContext {
  projectId: () => number
  getEndings: () => any[]
  getAchievements: () => any[]
  getUnlockedAchievementCount: () => number
  loadPlayerAchievements: () => any
  loadEndings: () => any
  t: (key: string, params?: any) => string
}

export function usePlayerCollections(ctx: PlayerCollectionsContext) {
  const galleryDialogVisible = ref(false)
  const galleryTab = ref<GalleryTabKey>('cg')
  const galleryItems = ref<any[]>([])
  const galleryTotal = ref(0)
  const galleryUnlocked = ref(0)
  const musicItems = ref<any[]>([])
  const musicTotal = ref(0)
  const musicUnlocked = ref(0)
  const musicLoading = ref(false)

  const galleryCountText = computed(() => galleryCountTextOf(galleryTab.value, {
    cgUnlocked: galleryUnlocked.value,
    cgTotal: galleryTotal.value,
    musicUnlocked: musicUnlocked.value,
    musicTotal: musicTotal.value,
    achievementUnlocked: ctx.getUnlockedAchievementCount(),
    achievementTotal: ctx.getAchievements().length,
    endingUnlocked: ctx.getEndings().filter((ending) => ending?.unlocked).length,
    endingTotal: ctx.getEndings().length,
  }, ctx.t))

  const loadCgGallery = async () => {
    try {
      const data = await getGallery(ctx.projectId())
      galleryItems.value = data?.items || []
      galleryTotal.value = data?.total || 0
      galleryUnlocked.value = data?.unlocked_count || 0
    } catch (e: any) {
      galleryItems.value = []
      galleryTotal.value = 0
      galleryUnlocked.value = 0
      ElMessage.error(e?.response?.data?.message || ctx.t('gallery.loadFailed'))
    }
  }

  const loadMusicGallery = async () => {
    musicLoading.value = true
    try {
      const data = await listMusicGallery(ctx.projectId())
      musicItems.value = data?.items || []
      musicTotal.value = data?.total || 0
      musicUnlocked.value = data?.unlocked_count || 0
    } catch (e) {
      musicItems.value = []
      musicTotal.value = 0
      musicUnlocked.value = 0
    } finally {
      musicLoading.value = false
    }
  }

  /** 页签切换：按页签懒加载对应收藏数据，结局只在首次进入时拉取 */
  const switchGalleryTab = (key: GalleryTabKey) => {
    galleryTab.value = key
    if (key === 'cg') return loadCgGallery()
    if (key === 'bgm') return loadMusicGallery()
    if (key === 'achievement') return ctx.loadPlayerAchievements()
    if (!ctx.getEndings().length) return ctx.loadEndings()
    return undefined
  }

  const openGallery = async () => {
    galleryDialogVisible.value = true
    await switchGalleryTab(galleryTab.value)
  }

  return {
    galleryDialogVisible,
    galleryTab,
    galleryItems,
    galleryTotal,
    galleryUnlocked,
    galleryCountText,
    musicItems,
    musicTotal,
    musicUnlocked,
    musicLoading,
    loadCgGallery,
    loadMusicGallery,
    switchGalleryTab,
    openGallery,
  }
}
