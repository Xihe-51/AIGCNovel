import request from '@/utils/request';

export interface EndingCondition {
  variable: string;
  op: string;
  value: number;
}

export interface Ending {
  ending_id: number;
  project_id: number;
  title: string;
  description?: string | null;
  content_id: number;
  conditions: EndingCondition[];
  unlocked?: boolean;
}

export interface EndingPayload {
  title: string;
  description?: string;
  content_id: number;
  conditions: EndingCondition[];
}

export async function listEndings(projectId: number): Promise<Ending[]> {
  const response = await request.get(`/project/endings/${projectId}`);
  return ((response.data as any).data || []) as Ending[];
}

export async function createEnding(projectId: number, data: EndingPayload): Promise<Ending> {
  const response = await request.post(`/project/endings/${projectId}`, data);
  return (response.data as any).data as Ending;
}

export async function updateEnding(
  projectId: number,
  endingId: number,
  data: Partial<EndingPayload>
): Promise<Ending> {
  const response = await request.put(`/project/endings/${projectId}/${endingId}`, data);
  return (response.data as any).data as Ending;
}

export async function deleteEnding(projectId: number, endingId: number) {
  const response = await request.delete(`/project/endings/${projectId}/${endingId}`);
  return response.data;
}

export async function unlockEnding(projectId: number, endingId: number) {
  const response = await request.post(`/project/endings/${projectId}/${endingId}/unlock`);
  return (response.data as any).data;
}
