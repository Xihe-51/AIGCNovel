import request from '@/utils/request'

export interface PatrolNode {
  content_id: number
  scene_id: number
  scene_title: string
  content_type: string
  text: string
}

export interface PatrolTransition {
  from: number
  to: number
  choice_text: string
}

export interface PatrolPath {
  length: number
  end_type: 'ending' | 'dead' | 'loop'
  end_label: string
  nodes: PatrolNode[]
  transitions: PatrolTransition[]
  truncated: boolean
}

export interface PatrolDeadEnd {
  content_id: number
  scene_id: number
  scene_title: string
  content_type: string
  text: string
  path_count: number
}

export interface PatrolCycle {
  nodes: PatrolNode[]
}

export interface PatrolSummary {
  node_count: number
  edge_count: number
  dangling_edges: number
  start_count: number
  path_count: number
  complete_paths: number
  dead_end_paths: number
  loop_paths: number
  unreachable_nodes: number
  cycle_count: number
  capped: boolean
}

export interface StoryPatrol {
  summary: PatrolSummary
  paths: PatrolPath[]
  dead_ends: PatrolDeadEnd[]
  cycles: PatrolCycle[]
}

/** 自动遍历所有分支，生成路径/死路/环报告 */
export const getStoryPatrol = async (projectId: number): Promise<StoryPatrol> => {
  const response = await request.get(`/project/story_patrol/${projectId}`)
  return response.data.data
}

// ==================== 自动全分支试玩 / 剧情回归 ====================
export interface RegressionSummary {
  state_count: number
  path_count: number
  node_total: number
  node_visited: number
  node_pct: number
  ending_total: number
  ending_reached: number
  locked_scene_count: number
  gated_choice_count: number
  dead_end_count: number
  skipped_node_count: number
  capped: boolean
}

export interface RegressionEnding {
  ending_id: number
  title: string
  content_id?: number | null
  conditions?: string
}

export interface RegressionNodeRef {
  content_id: number
  scene_id: number
  scene_title: string
  text: string
}

export interface RegressionChoice {
  path_id: number
  from: number
  conditions: string
}

export interface RegressionLockedScene {
  scene_id: number
  title: string
  conditions: string
}

export interface RegressionDeadEnd {
  scene_id: number
  scene_title: string
  content_id: number | null
  text: string
  reason: string
}

export interface StoryRegression {
  summary: RegressionSummary
  endings: { reached: RegressionEnding[]; missed: RegressionEnding[] }
  unvisited_nodes: RegressionNodeRef[]
  gated_choices: RegressionChoice[]
  locked_scenes: RegressionLockedScene[]
  dead_ends: RegressionDeadEnd[]
}

/** 按播放器运行时规则推演所有可行分支，输出回归报告 */
export const getStoryRegression = async (projectId: number): Promise<StoryRegression> => {
  const response = await request.get(`/project/story_regression/${projectId}`)
  return response.data.data
}
