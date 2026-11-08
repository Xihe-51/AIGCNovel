import request from '@/utils/request'

export interface MusicGalleryItem {
  music_url: string
  title: string
  scene_id: number
  unlocked: boolean
}

export interface MusicGalleryResult {
  items: MusicGalleryItem[]
  total: number
  unlocked_count: number
}

/** BGM 鉴赏曲目（由场景背景音乐自动汇总） */
export async function listMusicGallery(projectId: number): Promise<MusicGalleryResult> {
  const response = await request.get(`/project/music_gallery/${projectId}`)
  return (response.data as any).data as MusicGalleryResult
}

/** 解锁一首 BGM（玩家进入使用该音乐的场景时调用） */
export async function unlockMusic(projectId: number, musicUrl: string) {
  const response = await request.post(`/project/music_gallery/${projectId}/unlock`, {
    music_url: musicUrl,
  })
  return (response.data as any).data
}

export interface ProjectOverview {
  project_id: number
  title: string
  word_count: number
  target_words: number
  completion_percent: number | null
  reading_minutes: number
  scene_count: number
  chapter_count: number
  branch_count: number
  ending_count: number
  cg_count: number
  character_count: number
  variable_count: number
  asset_total: number
  asset_missing: number
  chapters: {
    chapter_id: number
    title: string
    order_num: number
    scene_count: number
    word_count: number
    target_words: number
    reading_minutes: number
    completion_percent: number | null
  }[]
  ungrouped: { scene_count: number; word_count: number; reading_minutes: number }
}

/** 工程概览：字数、章节分布、场景/分支/素材统计 */
export async function getProjectOverview(projectId: number): Promise<ProjectOverview> {
  const response = await request.get(`/project/overview/${projectId}`)
  return (response.data as any).data as ProjectOverview
}
