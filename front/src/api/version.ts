import request from '@/utils/request'

export interface ProjectVersionMeta {
  version_id: number
  project_id: number
  label: string
  scene_count: number
  content_count: number
  branch_count: number
  created_at: string
}

export interface VersionSceneChange {
  scene_id: number
  title: string
  changes?: { field: string; before: unknown; after: unknown }[]
}

export interface VersionContentChange {
  content_id: number
  scene_id: number
  scene_title: string
  content_type: string
  character_id: number | null
  text: string
  changes?: { field: string; before: unknown; after: unknown }[]
}

export interface VersionDiff {
  scenes: {
    added: VersionSceneChange[]
    removed: VersionSceneChange[]
    modified: VersionSceneChange[]
  }
  contents: {
    added: VersionContentChange[]
    removed: VersionContentChange[]
    modified: VersionContentChange[]
    total: number
  }
  branches: { added: number; removed: number; modified: number; total: number }
  endings: { added: number; removed: number; modified: number; total: number }
  summary: { scene_changed: number; content_changed: number; branch_changed: number }
}

/** 版本列表（不含快照正文） */
export async function listProjectVersions(projectId: number): Promise<ProjectVersionMeta[]> {
  const response = await request.get(`/project/versions/${projectId}`)
  return (response.data as any).data.versions as ProjectVersionMeta[]
}

/** 手动生成一个版本快照；内容未变时会复用上一版 */
export async function createProjectVersion(
  projectId: number,
  label = '手动快照'
): Promise<{ created: boolean; version: ProjectVersionMeta; message?: string }> {
  const response = await request.post(`/project/versions/${projectId}`, { label })
  const body = response.data as any
  return { created: !!body.created, version: body.data as ProjectVersionMeta, message: body.message }
}

/** 版本与当前内容的差异 */
export async function getVersionDiff(
  projectId: number,
  versionId: number
): Promise<{ version: ProjectVersionMeta; diff: VersionDiff }> {
  const response = await request.get(`/project/versions/${projectId}/${versionId}/diff`)
  return (response.data as any).data
}

/** 恢复到指定版本（后端会先自动备份当前内容） */
export async function restoreProjectVersion(
  projectId: number,
  versionId: number
): Promise<Record<string, number>> {
  const response = await request.post(`/project/versions/${projectId}/${versionId}/restore`)
  return (response.data as any).data
}
