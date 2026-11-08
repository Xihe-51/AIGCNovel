import request from '@/utils/request';

export interface ProjectVariable {
  variable_id: number;
  project_id: number;
  name: string;
  label: string;
  character_id?: number | null;
  initial_value: number;
  min_value: number | null;
  max_value: number | null;
  description?: string | null;
  /** 跨周目保留：重新开始/进入下一周目时不清零 */
  persist?: boolean;
}

export interface ContentEffect {
  content_id: number;
  variable_id: number;
  name: string;
  label: string;
  delta: number;
}

export interface VariablePayload {
  name: string;
  label: string;
  character_id?: number | null;
  initial_value?: number;
  min_value?: number | null;
  max_value?: number | null;
  description?: string;
  persist?: boolean;
}

export interface ProjectMeta {
  variables: Record<string, number>;
  updated_at: string | null;
}

export async function listVariables(projectId: number): Promise<ProjectVariable[]> {
  const response = await request.get(`/project/variables/${projectId}`);
  return ((response.data as any).data || []) as ProjectVariable[];
}

export async function createVariable(projectId: number, data: VariablePayload): Promise<ProjectVariable> {
  const response = await request.post(`/project/variables/${projectId}`, data);
  return (response.data as any).data as ProjectVariable;
}

export async function updateVariable(
  projectId: number,
  variableId: number,
  data: Partial<VariablePayload>
): Promise<ProjectVariable> {
  const response = await request.put(`/project/variables/${projectId}/${variableId}`, data);
  return (response.data as any).data as ProjectVariable;
}

export async function deleteVariable(projectId: number, variableId: number) {
  const response = await request.delete(`/project/variables/${projectId}/${variableId}`);
  return response.data;
}

/** 玩家跨周目元数据（只包含 persist=true 的变量） */
export async function getProjectMeta(projectId: number): Promise<ProjectMeta> {
  const response = await request.get(`/project/meta/${projectId}`);
  return ((response.data as any).data || { variables: {}, updated_at: null }) as ProjectMeta;
}

/** 保存跨周目变量值（后端只接收 persist 变量，其余忽略） */
export async function saveProjectMeta(
  projectId: number,
  variables: Record<string, number>
): Promise<Record<string, number>> {
  const response = await request.put(`/project/meta/${projectId}`, { variables });
  return ((response.data as any).data?.variables || {}) as Record<string, number>;
}

/** 项目内全部节点的数值变化（播放器一次加载） */
export async function listEffects(projectId: number): Promise<ContentEffect[]> {
  const response = await request.get(`/project/effects/${projectId}`);
  return ((response.data as any).data || []) as ContentEffect[];
}


/** 某条节点的数值变化 */
export async function getContentEffects(projectId: number, contentId: number): Promise<ContentEffect[]> {
  const response = await request.get(`/project/effects/${projectId}/${contentId}`);
  return ((response.data as any).data || []) as ContentEffect[];
}

/** 整条替换某节点的数值变化 */
export async function saveContentEffects(
  projectId: number,
  contentId: number,
  effects: { variable_id: number; delta: number }[]
) {
  const response = await request.put(`/project/effects/${projectId}/${contentId}`, { effects });
  return (response.data as any).data;
}
