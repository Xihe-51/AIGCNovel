import request from '@/utils/request'

/** 素材体检：一条素材记录 */
export interface AssetItem {
  kind: string
  kind_label: string
  where: string
  url: string
  status: 'ok' | 'missing' | 'external'
  asset_kind?: 'image' | 'audio'
  usage_count?: number
  scene_id?: number
  character_id?: number
  avatar_id?: number
  content_id?: number
  cg_id?: number
  directive_id?: number
}

/** 素材体检：项目引用的市场素材 */
export interface MarketReferenceItem {
  reference_id: number
  resource_id: number
  title: string
  resource_type: string
  file_url: string
  status: 'ok' | 'missing' | 'external'
  reference_count: number
}

export interface AssetCheckResult {
  project_id: number
  title: string
  total: number
  ok_count: number
  external_count: number
  missing_count: number
  healthy: boolean
  missing: AssetItem[]
  items: AssetItem[]
  unreferenced_count?: number
  market_references: MarketReferenceItem[]
  market_missing: MarketReferenceItem[]
}

/**
 * 素材体检：扫描项目内全部素材字段，报告磁盘上缺失的文件与市场素材引用数
 */
export const checkProjectAssets = async (projectId: number): Promise<AssetCheckResult> => {
  const response = await request.get(`/project/assets/check/${projectId}`)
  return response.data.data
}

/**
 * 就地替换项目素材：新文件覆盖原 URL 指向的磁盘文件（仅限本项目目录）
 */
export const replaceProjectAsset = async (
  projectId: number,
  url: string,
  file: File
): Promise<{ url: string }> => {
  const formData = new FormData()
  formData.append('url', url)
  formData.append('file', file)
  const response = await request.post(`/project/assets/replace/${projectId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data.data
}

export interface AiAssetItem {
  generation_id: number
  url: string
  prompt: string
  status: 'ok' | 'missing' | 'external'
  created_at: string | null
}

/** 当前用户的 AI 生成历史（image / music / voice） */
export const listAiAssetHistory = async (
  projectId: number,
  kind: 'image' | 'music' | 'voice'
): Promise<AiAssetItem[]> => {
  const response = await request.get(`/project/assets/ai_history/${projectId}`, {
    params: { kind },
  })
  return response.data.data.items || []
}

/** 把 AI 历史文件复制到项目素材位置 */
export const importAiAsset = async (
  projectId: number,
  targetUrl: string,
  sourceUrl: string
): Promise<{ url: string; source_url: string }> => {
  const response = await request.post(`/project/assets/ai_import/${projectId}`, {
    target_url: targetUrl,
    source_url: sourceUrl,
  })
  return response.data.data
}

/** 市场素材一键入库到项目素材目录 */
export const importMarketAsset = async (
  projectId: number,
  resourceId: number
): Promise<{ url: string; title: string; sub_folder: string }> => {
  const response = await request.post(`/project/assets/market_import/${projectId}`, {
    resource_id: resourceId,
  })
  return response.data.data
}
