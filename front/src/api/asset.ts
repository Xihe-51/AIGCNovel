import request from '@/utils/request'

/** 素材体检：一条素材记录 */
export interface AssetItem {
  kind: string
  kind_label: string
  where: string
  url: string
  status: 'ok' | 'missing' | 'external'
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
