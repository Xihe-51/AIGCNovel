import request from '@/utils/request';

export interface ProjectCG {
  cg_id: number;
  project_id: number;
  title: string;
  description?: string | null;
  image_url: string;
  resource_id?: number | null;
  unlock_ending_id?: number | null;
  unlock_ending_title?: string | null;
  order_num: number;
  unlocked?: boolean;
}

export interface CGPayload {
  title: string;
  description?: string;
  image_url?: string;
  resource_id?: number | null;
  unlock_ending_id?: number | null;
  order_num?: number;
}

export interface GalleryItem {
  cg_id: number;
  title: string;
  description?: string | null;
  image_url: string | null;
  unlock_ending_id?: number | null;
  unlock_ending_title?: string | null;
  order_num: number;
  unlocked: boolean;
}

export interface GalleryData {
  project_id: number;
  title: string;
  total: number;
  unlocked_count: number;
  items: GalleryItem[];
}

/** 作者视角：项目全部 CG（含未解锁标记） */
export async function listCGs(projectId: number): Promise<ProjectCG[]> {
  const response = await request.get(`/project/cgs/${projectId}`);
  return ((response.data as any).data || []) as ProjectCG[];
}

export async function createCG(projectId: number, data: CGPayload): Promise<ProjectCG> {
  const response = await request.post(`/project/cgs/${projectId}`, data);
  return (response.data as any).data as ProjectCG;
}

export async function updateCG(
  projectId: number,
  cgId: number,
  data: Partial<CGPayload>
): Promise<ProjectCG> {
  const response = await request.put(`/project/cgs/${projectId}/${cgId}`, data);
  return (response.data as any).data as ProjectCG;
}

export async function deleteCG(projectId: number, cgId: number) {
  const response = await request.delete(`/project/cgs/${projectId}/${cgId}`);
  return response.data;
}

/** 鉴赏页数据：作者本人或公开项目可读，未解锁条目的 image_url 为 null */
export async function getGallery(projectId: number): Promise<GalleryData> {
  const response = await request.get(`/project/gallery/${projectId}`);
  return (response.data as any).data as GalleryData;
}
