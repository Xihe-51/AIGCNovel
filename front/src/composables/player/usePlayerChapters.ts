/**
 * 播放器章节快捷跳转 / 路线图鉴：章节数据加载、按章节聚合阅读进度、章节瞬移。
 *
 * 场景、台词、已读记录、可播判断与跳转副作用全部通过适配器注入，
 * composable 只负责「章节 -> 场景 -> 可播放台词」的聚合与跳转编排。
 */
import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listChapters } from '@/api/chapter'

export type JumpChapterResult = 'ok' | 'locked' | 'empty'

export interface ChapterRouteItem {
  chapter_id: any
  title: string
  order_num: number
  sceneIndexes: number[]
  total: number
  read: number
  unlocked: boolean
}

export interface ChapterRouteStats {
  total: number
  read: number
  endingUnlocked: number
}

export interface ChapterRouteData {
  chapters: any[]
  scene_map: Record<string, any>
}

export const emptyChapterData = (): ChapterRouteData => ({ chapters: [], scene_map: {} })

/** 按章节聚合场景下标、节点总数与已读数；首章或读过任意节点的章节可跳转 */
export const buildChapterRoute = (
  chapters: any[],
  sceneMap: Record<string, any>,
  scenes: any[],
  allDialogues: Record<string, any[]>,
  isRead: (contentId: any) => boolean,
): ChapterRouteItem[] => {
  const list = chapters || []
  const map = sceneMap || {}
  const sceneList = scenes || []
  return list.map((chapter, index) => {
    const sceneIndexes = sceneList
      .map((scene, idx) => ({ scene, idx }))
      .filter(({ scene }) => map[String(scene?.scene_id)] === chapter?.chapter_id)
      .map(({ idx }) => idx)
    let total = 0
    let read = 0
    for (const idx of sceneIndexes) {
      const nodes = allDialogues?.[sceneList[idx]?.scene_id] || []
      total += nodes.length
      for (const node of nodes) {
        if (isRead(node?.content_id)) read += 1
      }
    }
    return {
      chapter_id: chapter?.chapter_id,
      title: chapter?.title,
      order_num: chapter?.order_num ?? index + 1,
      sceneIndexes,
      total,
      read,
      unlocked: index === 0 || read > 0,
    }
  })
}

/** 全项目阅读进度与已解锁结局数 */
export const computeChapterRouteStats = (
  allDialogues: Record<string, any[]>,
  isRead: (contentId: any) => boolean,
  endings: any[],
): ChapterRouteStats => {
  let total = 0
  let read = 0
  for (const nodes of Object.values(allDialogues || {})) {
    for (const node of nodes || []) {
      total += 1
      if (isRead(node?.content_id)) read += 1
    }
  }
  return {
    total,
    read,
    endingUnlocked: (endings || []).filter((ending) => ending?.unlocked).length,
  }
}

/** 章节内第一个「场景可播放且有台词」的场景下标，找不到返回 undefined */
export const pickChapterSceneIndex = (
  chapter: any,
  scenes: any[],
  allDialogues: Record<string, any[]>,
  isScenePlayable: (sceneId: any) => boolean,
): number | undefined => {
  const sceneList = scenes || []
  const indexes: number[] = chapter?.sceneIndexes || []
  return indexes.find((idx) => (
    isScenePlayable(sceneList[idx]?.scene_id)
    && (allDialogues?.[sceneList[idx]?.scene_id] || []).length > 0
  ))
}

export interface PlayerChaptersContext {
  projectId: () => number
  getScenes: () => any[]
  getAllDialogues: () => Record<string, any[]>
  getEndings: () => any[]
  hasRead: (contentId: any) => boolean
  scenePlayable: (sceneId: any) => boolean
  firstPlayableNodeIndex: (sceneId: any) => number
  setSceneIndex: (index: number) => void
  setDialogueIndex: (index: number) => void
  /** 章节跳转是瞬移，需要清空回退快照 */
  clearLineSnapshots: () => void
  startPreview: () => void
  t: (key: string, params?: any) => string
}

export function usePlayerChapters(ctx: PlayerChaptersContext) {
  const chaptersVisible = ref(false)
  const chapterData = ref<ChapterRouteData>(emptyChapterData())

  const loadChapterData = async () => {
    try {
      const data = await listChapters(ctx.projectId())
      chapterData.value = {
        chapters: (data && data.chapters) || [],
        scene_map: ((data && data.scene_map) || {}) as Record<string, any>,
      }
    } catch (e) {
      chapterData.value = emptyChapterData()
    }
  }

  const chapterRoute = computed(() => buildChapterRoute(
    chapterData.value.chapters,
    chapterData.value.scene_map,
    ctx.getScenes(),
    ctx.getAllDialogues(),
    (contentId) => ctx.hasRead(contentId),
  ))

  const routeStats = computed(() => computeChapterRouteStats(
    ctx.getAllDialogues(),
    (contentId) => ctx.hasRead(contentId),
    ctx.getEndings(),
  ))

  /** 跳到章节内第一个可播放场景的第一条可播放台词 */
  const jumpToChapter = (chapter: any): JumpChapterResult => {
    if (!chapter?.unlocked) {
      ElMessage.warning(ctx.t('chapters.lockedToast'))
      return 'locked'
    }
    const scenes = ctx.getScenes()
    const sceneIdx = pickChapterSceneIndex(
      chapter, scenes, ctx.getAllDialogues(), (sceneId) => ctx.scenePlayable(sceneId),
    )
    if (sceneIdx === undefined) {
      ElMessage.warning(ctx.t('chapters.emptyToast'))
      return 'empty'
    }
    const dialogueIdx = ctx.firstPlayableNodeIndex(scenes[sceneIdx]?.scene_id)
    ctx.clearLineSnapshots()
    ctx.setSceneIndex(sceneIdx)
    ctx.setDialogueIndex(dialogueIdx)
    chaptersVisible.value = false
    nextTick(() => ctx.startPreview())
    ElMessage.success(ctx.t('chapters.jumpedToast', { title: chapter.title }))
    return 'ok'
  }

  return {
    chaptersVisible,
    chapterData,
    chapterRoute,
    routeStats,
    loadChapterData,
    jumpToChapter,
  }
}
