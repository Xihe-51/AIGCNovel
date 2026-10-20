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
