import request from '@/utils/request'

export interface ScriptStatsSummary {
  project_title: string
  generated_at: string
  chapter_count: number
  scene_count: number
  node_count: number
  dialogue_count: number
  narration_count: number
  choice_count: number
  branch_count: number
  ending_count: number
  character_count: number
  cg_count: number
  word_count: number
  avg_words_per_scene: number
}

export interface ScriptChapterRow {
  chapter_id: number
  title: string
  order_num: number
  scene_count: number
  word_count: number
  target_words: number
}

export interface ScriptSceneRow {
  scene_id: number
  title: string
  order_num: number
  node_count: number
  dialogue_count: number
  narration_count: number
  choice_count: number
  word_count: number
  branch_count: number
  ending_count: number
  chapter_id: number | null
}

export interface ScriptCharacterRow {
  character_id: number
  name: string
  is_main: boolean
  line_count: number
  word_count: number
  scene_count: number
}

export interface ScriptStats {
  summary: ScriptStatsSummary
  chapters: ScriptChapterRow[]
  scenes: ScriptSceneRow[]
  characters: ScriptCharacterRow[]
}

export const getScriptStats = async (projectId: number): Promise<ScriptStats> => {
  const response = await request.get(`/project/script_stats/${projectId}`)
  return response.data.data
}
