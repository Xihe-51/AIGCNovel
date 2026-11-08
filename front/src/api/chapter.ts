import request from '@/utils/request'

export interface StoryChapter {
  chapter_id: number
  project_id: number
  title: string
  order_num: number
  target_words: number
}

export interface ChapterListResult {
  chapters: StoryChapter[]
  scene_map: Record<number, number>
}

/** 章节列表 + 场景归属 */
export const listChapters = async (projectId: number): Promise<ChapterListResult> => {
  const res = await request.get(`/project/chapters/${projectId}`)
  return res.data.data
}

export const createChapter = async (
  projectId: number,
  title: string
): Promise<StoryChapter> => {
  const res = await request.post(`/project/chapters/${projectId}`, { title })
  return res.data.data
}

export const updateChapter = async (
  projectId: number,
  chapterId: number,
  data: Partial<Pick<StoryChapter, 'title' | 'order_num' | 'target_words'>>
): Promise<StoryChapter> => {
  const res = await request.put(`/project/chapters/${projectId}/${chapterId}`, data)
  return res.data.data
}

export const deleteChapter = async (projectId: number, chapterId: number) => {
  const res = await request.delete(`/project/chapters/${projectId}/${chapterId}`)
  return res.data
}

/** 设置场景归属；chapterId 传 null 表示移出章节 */
export const assignSceneChapter = async (
  projectId: number,
  sceneId: number,
  chapterId: number | null
) => {
  const res = await request.put(`/project/chapters/${projectId}/assign`, {
    scene_id: sceneId,
    chapter_id: chapterId,
  })
  return res.data.data
}
