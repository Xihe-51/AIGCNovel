import request from '@/utils/request';

/**
 * 剧情分支（branch_paths）与剧情图 API —— 第 2 批新增。
 *
 * 此前 branch_paths 表只有模型定义、没有任何接口，
 * 前端「可视化剧情树」只能靠场景标题里的关键词猜测节点类型。
 * 现在改为读取真实的 branch_paths 拓扑。
 */

/** 一条剧情分支（状态转移边） */
export interface BranchPath {
  path_id: number;
  project_id: number;
  source_content_id: number;
  target_content_id: number;
  choice_text?: string | null;
  conditions?: any;
}

/** 剧情图节点（对应一条 script_contents） */
export interface StoryNode {
  content_id: number;
  scene_id: number;
  scene_title: string;
  scene_order: number;
  title: string;
  content_type: '对话' | '描述' | '选择';
  content_text: string;
  character_id?: number | null;
  avatar_id?: number | null;
  voice_url?: string | null;
  branch_condition?: any;
  order_num: number;
}

/** FSM 校验问题项 */
export interface StoryIssue {
  code: string;
  message: string;
  detail?: any;
}

/** FSM 校验报告 */
export interface StoryValidation {
  ok: boolean;
  summary: {
    nodes: number;
    edges: number;
    start: number;
    terminal: number;
    endings: number;
    orphans: number;
    cycles: number;
    path_count: number;
    reachable_nodes: number;
    coverage: number;
  };
  errors: StoryIssue[];
  warnings: StoryIssue[];
  info: StoryIssue[];
  start_nodes: number[];
  primary_start?: number | null;
  terminal_nodes: number[];
  cycles: number[][];
  orphans: number[];
  dead_ends: number[];
  graph: { auto_sequence: boolean; explicit_edges: number; synthetic_edges: number };
}

/** 剧情图（拓扑 + 校验） */
export interface StoryGraph {
  project_id: number;
  nodes: StoryNode[];
  edges: BranchPath[];
  stats: { node_count: number; edge_count: number; scene_count: number };
  validation?: StoryValidation;
}

/** 获取剧情图（含 FSM 校验结果） */
export async function getStoryGraph(projectId: number, validate = true): Promise<StoryGraph> {
  const response = await request.get('/project/story_graph/' + projectId, {
    params: { validate: validate ? 1 : 0 },
  });
  const body = response.data as any;
  return body.data as StoryGraph;
}

/** 只做 FSM 校验 */
export async function validateStory(projectId: number): Promise<StoryValidation> {
  const response = await request.post(`/project/story_graph/${projectId}/validate`);
  return (response.data as any).data as StoryValidation;
}

/** 列出项目全部分支 */
export async function listBranches(projectId: number): Promise<BranchPath[]> {
  const response = await request.get(`/project/branches/${projectId}`);
  return (response.data as any).data as BranchPath[];
}

/** 新建一条分支 */
export async function createBranch(
  projectId: number,
  data: { source_content_id: number; target_content_id: number; choice_text?: string; conditions?: any }
): Promise<BranchPath> {
  const response = await request.post(`/project/branches/${projectId}`, data);
  return (response.data as any).data as BranchPath;
}

/** 更新分支 */
export async function updateBranch(
  pathId: number,
  data: { source_content_id?: number; target_content_id?: number; choice_text?: string; conditions?: any }
): Promise<BranchPath> {
  const response = await request.put(`/project/branches/detail/${pathId}`, data);
  return (response.data as any).data as BranchPath;
}

/** 删除分支 */
export async function deleteBranch(pathId: number) {
  const response = await request.delete(`/project/branches/detail/${pathId}`);
  return response.data;
}

/**
 * 批量覆盖写入分支（剧情树整树保存）。
 * replace=true 会先清空该项目已有分支。
 */
export async function batchSaveBranches(
  projectId: number,
  branches: { source_content_id: number; target_content_id: number; choice_text?: string; conditions?: any }[],
  replace = true
) {
  const response = await request.post(`/project/branches/${projectId}/batch`, { branches, replace });
  return (response.data as any).data;
}
