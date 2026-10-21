import request from '@/utils/request'

export type DirectiveType = 'avatar' | 'background' | 'music' | 'sound' | 'wait'

export interface ContentDirective {
  directive_id: number
  project_id: number
  content_id: number
  directive_type: DirectiveType
  payload: Record<string, any>
  order_num: number
}

/**
 * 列出项目下所有演出指令（前端按 content_id 分组）
 */
export const listDirectives = async (projectId: number): Promise<ContentDirective[]> => {
  const response = await request.get(`/project/directives/${projectId}`)
  return response.data.data
}

/**
 * 列出某个剧情节点的演出指令
 */
export const listNodeDirectives = async (
  projectId: number,
  contentId: number
): Promise<ContentDirective[]> => {
  const response = await request.get(`/project/directives/${projectId}/${contentId}`)
  return response.data.data
}

/**
 * 新建演出指令
 */
export const createDirective = async (
  projectId: number,
  data: { content_id: number; directive_type: DirectiveType; payload?: Record<string, any> }
): Promise<ContentDirective> => {
  const response = await request.post(`/project/directives/${projectId}`, data)
  return response.data.data
}

/**
 * 更新演出指令
 */
export const updateDirective = async (
  projectId: number,
  directiveId: number,
  data: { payload?: Record<string, any>; directive_type?: DirectiveType; order_num?: number }
): Promise<ContentDirective> => {
  const response = await request.put(`/project/directives/${projectId}/${directiveId}`, data)
  return response.data.data
}

/**
 * 删除演出指令
 */
export const deleteDirective = async (
  projectId: number,
  directiveId: number
): Promise<{ success: boolean }> => {
  const response = await request.delete(`/project/directives/${projectId}/${directiveId}`)
  return response.data
}
