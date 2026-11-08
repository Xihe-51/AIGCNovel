import request from '@/utils/request'

export interface OutlineScene {
  scene_id: number
  title: string
  description?: string
  order_num: number
  node_count: number
  word_count: number
  dialogue_count: number
  choice_count: number
  branch_count: number
  ending_count: number
  has_background: boolean
  has_music: boolean
}

export interface OutlineChapter {
  chapter_id: number
  title: string
  order_num: number
  target_words: number
  scenes: OutlineScene[]
}

export interface ProjectOutline {
  project_id: number
  title: string
  chapters: OutlineChapter[]
  ungrouped: OutlineScene[]
  totals: {
    scene_count: number
    word_count: number
    node_count: number
    branch_count: number
    ending_count: number
  }
}

/** 大纲 / 时间线：按章节汇总场景、节点、字数、分支和结局 */
export async function getProjectOutline(projectId: number): Promise<ProjectOutline> {
  const response = await request.get(`/project/outline/${projectId}`)
  return (response.data as any).data as ProjectOutline
}
