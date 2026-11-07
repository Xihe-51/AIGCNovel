import request from '@/utils/request'

export interface ReaderRouteNode {
  content_id: number
  scene_id: number
  scene_title: string
  content_type: string
  character_name: string
  text: string
}

export interface ReaderChoiceOption {
  path_id: number
  choice_text: string
  target_content_id: number
  target_scene_id?: number | null
  conditions?: string
}

export interface ReaderChoice {
  content_id: number
  scene_id: number
  scene_title: string
  text: string
  options: ReaderChoiceOption[]
  chosen_path_id: number
}

export interface ReaderStats {
  node_count: number
  dialogue_count: number
  narration_count: number
  choice_count: number
  char_count: number
  est_minutes: number
}

export interface ReaderResult {
  key: 'speedrun' | 'completionist' | 'romance' | 'low_patience'
  name: string
  description: string
  route: ReaderRouteNode[]
  route_truncated: boolean
  choices: ReaderChoice[]
  ignored_options: (ReaderChoiceOption & { from_content_id: number; from_scene_title: string })[]
  ending: { ending_id: number; title: string; content_id: number } | null
  stop_reason: string
  dropoff: {
    content_id: number
    scene_id: number
    scene_title: string
    text: string
  } | null
  stats: ReaderStats
}

export interface SyntheticReaders {
  readers: ReaderResult[]
  aggregate: {
    reader_count: number
    choice_total: number
    ignored_option_count: number
    ignored_options: {
      path_id: number
      content_id: number
      scene_id?: number | null
      scene_title: string
      choice_text: string
      conditions?: string
      source_text: string
    }[]
    impossible_choice_count: number
    impossible_choices: {
      path_id: number
      content_id: number
      scene_id?: number | null
      scene_title: string
      choice_text: string
      conditions: string
    }[]
    endings_seen: string[]
    patience: number
  }
}

export const getSyntheticReaders = async (
  projectId: number,
  patience = 10
): Promise<SyntheticReaders> => {
  const response = await request.get(`/project/synthetic_readers/${projectId}`, {
    params: { patience },
  })
  return response.data.data as SyntheticReaders
}
