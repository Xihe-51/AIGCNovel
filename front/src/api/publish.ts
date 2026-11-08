import request from '@/utils/request'

export interface PublishIssue {
  level: 'error' | 'warning'
  code: string
  message: string
  detail?: Record<string, any>
}

export interface PublishCheck {
  project_id: number
  title: string
  is_public: boolean
  ready: boolean
  error_count: number
  warning_count: number
  stats: {
    scene_count: number
    node_count: number
    ending_count: number
    branch_count: number
    reachable_nodes: number
    coverage: number
    missing_assets: number
  }
  issues: PublishIssue[]
  share_path: string
}

export interface PublishResult {
  is_public: boolean
  share_path?: string
  check?: PublishCheck
  message?: string
}

/** 发布前体检：剧情结构、空场景、结局、素材缺失等 */
export const checkProjectPublish = async (projectId: number): Promise<PublishCheck> => {
  const response = await request.get(`/project/publish_check/${projectId}`)
  return response.data.data
}

/** 公开/取消公开作品；force=true 时忽略错误强制发布 */
export const updateProjectPublish = async (
  projectId: number,
  isPublic: boolean,
  force = false
): Promise<PublishResult> => {
  const response = await request.post(`/project/publish/${projectId}`, {
    is_public: isPublic,
    force,
  })
  return { ...response.data.data, message: response.data.message }
}
