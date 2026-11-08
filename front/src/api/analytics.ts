import request from '@/utils/request'

export type PlayEventType = 'start' | 'scene_enter' | 'choice' | 'ending' | 'finish'

export interface PlayEventPayload {
  session_id: string
  event_type: PlayEventType
  scene_id?: number | null
  content_id?: number | null
  path_id?: number | null
  ending_id?: number | null
  payload?: Record<string, any> | null
}

export interface PlayAnalyticsSummary {
  days: number
  total_sessions: number
  start_sessions: number
  finished_sessions: number
  completion_rate: number
  avg_duration_seconds: number
  avg_duration_text: string
  event_count: number
  top_dropoff?: {
    scene_id: number
    title: string
    drop_offs: number
    rate: number
  } | null
}

export interface PlayAnalyticsScene {
  scene_id: number
  title: string
  order_num: number
  reached: number
  rate: number
  drop_offs: number
  drop_rate: number
}

export interface PlayAnalyticsChapter {
  chapter_id: number
  title: string
  order_num: number
  scene_count: number
  first_scene_id: number
  reached: number
  rate: number
}

export interface PlayChoiceOption {
  path_id: number | null
  choice_text: string
  target_content_id: number | null
  count: number
  percent: number
}

export interface PlayChoiceGroup {
  content_id: number
  scene_id: number
  scene_title: string
  node_text: string
  total: number
  least_percent: number
  options: PlayChoiceOption[]
}

export interface PlayEndingStat {
  ending_id: number
  title: string
  content_id?: number | null
  scene_id?: number | null
  count: number
  rate: number
}

export interface PlayAnalytics {
  summary: PlayAnalyticsSummary
  scenes: PlayAnalyticsScene[]
  chapters: PlayAnalyticsChapter[]
  choices: PlayChoiceGroup[]
  endings: PlayEndingStat[]
}

/** 播放器埋点上报 */
export const recordPlayEvent = async (
  projectId: number,
  data: PlayEventPayload
): Promise<void> => {
  await request.post(`/project/play_event/${projectId}`, data)
}

/** 作者查看试玩统计（最近 days 天） */
export const getPlayAnalytics = async (
  projectId: number,
  days = 30
): Promise<PlayAnalytics> => {
  const response = await request.get(`/project/play_analytics/${projectId}`, {
    params: { days },
  })
  return response.data.data
}
