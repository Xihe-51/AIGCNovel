import request from '@/utils/request'

export interface ProjectTerm {
  term_id: number
  standard: string
  variants: string
  note: string
  created_at?: string | null
  updated_at?: string | null
}

export interface GlossaryScanHit {
  kind: string
  scene_id: number
  scene_title: string
  content_id: number | null
  text: string
}

export interface GlossaryScanItem {
  term_id: number
  standard: string
  variant: string
  count: number
  hits: GlossaryScanHit[]
  standard_hits: GlossaryScanHit[]
}

export interface GlossaryScanResult {
  items: GlossaryScanItem[]
  total: number
}

/** 项目术语表 */
export const listProjectTerms = async (projectId: number): Promise<ProjectTerm[]> => {
  const response = await request.get(`/project/glossary/${projectId}`)
  return response.data.data.terms || []
}

export const createProjectTerm = async (
  projectId: number,
  data: { standard: string; variants?: string; note?: string }
): Promise<ProjectTerm> => {
  const response = await request.post(`/project/glossary/${projectId}`, data)
  return response.data.data
}

export const updateProjectTerm = async (
  projectId: number,
  termId: number,
  data: { standard: string; variants?: string; note?: string }
): Promise<ProjectTerm> => {
  const response = await request.put(`/project/glossary/${projectId}/${termId}`, data)
  return response.data.data
}

export const deleteProjectTerm = async (projectId: number, termId: number) => {
  const response = await request.delete(`/project/glossary/${projectId}/${termId}`)
  return response.data
}

/** 扫描所有台词/旁白/选项/场景名中的别名误用 */
export const scanProjectTerms = async (projectId: number): Promise<GlossaryScanResult> => {
  const response = await request.get(`/project/glossary/${projectId}/scan`)
  return response.data.data
}
