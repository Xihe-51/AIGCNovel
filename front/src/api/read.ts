import request from '@/utils/request';

/** 读取当前用户在该项目已读的 content_id 列表 */
export async function listReads(projectId: number): Promise<number[]> {
  const response = await request.get(`/project/reads/${projectId}`);
  return ((response.data as any).data?.content_ids || []) as number[];
}

/** 批量标记已读 */
export async function markReads(projectId: number, contentIds: number[]) {
  const response = await request.post(`/project/reads/${projectId}`, {
    content_ids: contentIds,
  });
  return (response.data as any).data;
}

/** 清空已读记录（重新体验） */
export async function clearReads(projectId: number) {
  const response = await request.delete(`/project/reads/${projectId}`);
  return (response.data as any).data;
}
