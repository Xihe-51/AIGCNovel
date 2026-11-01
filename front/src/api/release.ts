import request from '@/utils/request'

export interface ReleaseStats {
  scene_count: number
  content_count: number
  branch_count: number
}

export interface ProjectRelease {
  release_id: number
  project_id: number
  release_no: number
  version_id: number
  notes: string
  created_at: string | null
  stats: ReleaseStats
  is_latest: boolean
}

export interface ReleaseRollbackResult {
  backup_version_id: number
  scenes_updated: number
  scenes_created: number
  contents_updated: number
  contents_created: number
  contents_deleted: number
  branches_created: number
  endings_restored: number
}

/** 作品发布记录（含绑定的剧本快照统计） */
export const listProjectReleases = async (projectId: number): Promise<ProjectRelease[]> => {
  const response = await request.get(`/project/releases/${projectId}`)
  return response.data.data.releases || []
}

/** 玩家侧更新日志：公开作品的发布记录（只读） */
export const listPublicReleases = async (projectId: number): Promise<ProjectRelease[]> => {
  const response = await request.get(`/project/public_releases/${projectId}`)
  return response.data.data.releases || []
}

/** 发布新版本：保存当前剧本快照并记录更新说明 */
export const createProjectRelease = async (
  projectId: number,
  notes: string
): Promise<ProjectRelease> => {
  const response = await request.post(`/project/releases/${projectId}`, { notes })
  return response.data.data
}

/** 回滚到某个发布版本（回滚前自动备份当前剧本） */
export const rollbackProjectRelease = async (
  projectId: number,
  releaseId: number
): Promise<ReleaseRollbackResult> => {
  const response = await request.post(`/project/releases/${projectId}/${releaseId}/rollback`)
  return response.data.data
}
