import request from '@/utils/request'

export type AchievementCondition =
  | { type: 'ending'; ending_id: number }
  | { type: 'variable'; variable: string; op: string; value: number }
  | { type: 'finish' }

export interface Achievement {
  achievement_id: number
  title: string
  description: string
  condition: AchievementCondition
  unlocked?: boolean
}

export interface AchievementPayload {
  title: string
  description?: string
  condition: AchievementCondition
}

export interface AchievementCheckResult {
  newly_unlocked: Achievement[]
  unlocked_ids: number[]
  achievements: Achievement[]
}

/** 成就列表（作者编辑 / 玩家鉴赏） */
export const listAchievements = async (projectId: number): Promise<Achievement[]> => {
  const response = await request.get(`/project/achievements/${projectId}`)
  return response.data.data || []
}

export const createAchievement = async (
  projectId: number,
  data: AchievementPayload
): Promise<Achievement> => {
  const response = await request.post(`/project/achievements/${projectId}`, data)
  return response.data.data
}

export const updateAchievement = async (
  projectId: number,
  achievementId: number,
  data: AchievementPayload
): Promise<Achievement> => {
  const response = await request.put(`/project/achievements/${projectId}/${achievementId}`, data)
  return response.data.data
}

export const deleteAchievement = async (projectId: number, achievementId: number) => {
  const response = await request.delete(`/project/achievements/${projectId}/${achievementId}`)
  return response.data
}

/** 播放器上报状态并检查解锁 */
export const checkAchievements = async (
  projectId: number,
  payload: { variables: Record<string, number>; endings: number[]; finished: boolean }
): Promise<AchievementCheckResult> => {
  const response = await request.post(`/project/achievements/${projectId}/check`, payload)
  return response.data.data
}
