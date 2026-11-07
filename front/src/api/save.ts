import request from '@/utils/request';

export interface SaveSlotInfo {
  slot: number;
  summary: string;
  updated_at: string | null;
}

export interface SaveSlotDetail extends SaveSlotInfo {
  state: any;
}

/** 列出当前用户在该项目的存档位（不含 state） */
export async function listSaves(projectId: number): Promise<SaveSlotInfo[]> {
  const response = await request.get(`/project/saves/${projectId}`);
  return (response.data as any).data as SaveSlotInfo[];
}

/** 读取指定存档位的完整快照 */
export async function getSave(projectId: number, slot: number): Promise<SaveSlotDetail> {
  const response = await request.get(`/project/saves/${projectId}/${slot}`);
  return (response.data as any).data as SaveSlotDetail;
}

/** 写入/覆盖存档位（0=自动，1-3=手动） */
export async function putSave(
  projectId: number,
  slot: number,
  state: any,
  summary: string
): Promise<SaveSlotInfo> {
  const response = await request.put(`/project/saves/${projectId}/${slot}`, { state, summary });
  return (response.data as any).data as SaveSlotInfo;
}

/** 删除存档位 */
export async function deleteSave(projectId: number, slot: number) {
  const response = await request.delete(`/project/saves/${projectId}/${slot}`);
  return response.data;
}

// ==================== 存档检查器（作者侧） ====================

export interface ProjectSaveItem extends SaveSlotInfo {
  save_id: number;
  user_id: number;
  username: string;
  slot_label: string;
  thumbnail_url: string | null;
  scene_title: string | null;
  /** 存档位置折算后的场景与节点，可直接定位到创作页 */
  scene_id: number | null;
  content_id: number | null;
  scene_order: number | null;
  resolved_scene_title: string | null;
  content_text: string | null;
  variables_count: number;
  history_count: number;
  playthrough: number;
  triggered_endings: number[];
}

export interface ProjectSaveList {
  total: number;
  players: number;
  items: ProjectSaveItem[];
}

export interface ProjectSaveDetail extends ProjectSaveItem {
  state: any;
}

/** 作者查看项目内所有玩家存档 */
export async function listProjectSaves(projectId: number): Promise<ProjectSaveList> {
  const response = await request.get(`/project/save_inspector/${projectId}`);
  return (response.data as any).data as ProjectSaveList;
}

/** 作者读取任意玩家存档的完整快照 */
export async function getProjectSave(
  projectId: number,
  userId: number,
  slot: number
): Promise<ProjectSaveDetail> {
  const response = await request.get(`/project/save_inspector/${projectId}/${userId}/${slot}`);
  return (response.data as any).data as ProjectSaveDetail;
}

/** 作者删除任意玩家的存档位 */
export async function deleteProjectSave(projectId: number, userId: number, slot: number) {
  const response = await request.delete(`/project/save_inspector/${projectId}/${userId}/${slot}`);
  return response.data;
}
