import request from '@/utils/request';

export interface Project {
  project_id: number;
  user_id: number;
  title: string;
  cover_url?: string;
  genre: string;
  template_type: string;
  word_count: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface ProjectCreateParams {
  title: string;
  genre: string;
  template_type: string;
  is_public?: boolean;
}

interface ProjectUpdateParams extends Partial<ProjectCreateParams> {}

/**
 * 获取用户所有项目
 */
export const getProjects = async (): Promise<Project[]> => {
  try {
    const response = await request.get('/project/projects');
    return response.data.data;
  } catch (error) {
    console.error('获取项目列表失败:', error);
    throw error;
  }
};

/**
 * 获取单个项目详情
 * @param projectId 项目ID
 */
export const getProject = async (projectId: number): Promise<Project> => {
  try {
    const response = await request.get(`/project/project/${projectId}`);
    return response.data.data;
  } catch (error) {
    console.error('获取项目详情失败:', error);
    throw error;
  }
};
/**
 * 获取所有公开的项目
 */
export const getPublicProjects = async (): Promise<Project[]> => {
  try {
    const response = await request.get('/project/projectAll');
    return response.data.data;
  } catch (error) {
    console.error('获取公开项目列表失败:', error);
    throw error;
  }
};
/**
 * 创建新项目
 * @param params 项目参数
 */
export const createProject = async (params: ProjectCreateParams): Promise<Project> => {
  try {
    const response = await request.post('/project/project', params);
    return response.data.data;
  } catch (error) {
    console.error('创建项目失败:', error);
    throw error;
  }
};

/**
 * 更新项目信息
 * @param projectId 项目ID
 * @param params 更新参数
 */
export const updateProject = async (
  projectId: number,
  params: ProjectUpdateParams
): Promise<Project> => {
  try {
    const response = await request.put(`/project/project/${projectId}`, params);
    return response.data.data;
  } catch (error) {
    console.error('更新项目失败:', error);
    throw error;
  }
};

/**
 * 公开导出项目
 * @param projectId 项目ID
 */
export const publicExportProject = async (projectId: number): Promise<{ success: boolean; message?: string }> => {
  try {
    const response = await request.put(`/project/project/public/${projectId}`);
    return response.data;
  } catch (error) {
    console.error('公开项目失败:', error);
    throw error;
  }
};

/**
 * 删除项目
 * @param projectId 项目ID
 */
export const deleteProject = async (projectId: number): Promise<void> => {
  try {
    await request.delete(`/project/project/${projectId}`);
  } catch (error) {
    console.error('删除项目失败:', error);
    throw error;
  }
};

/**
 * 上传项目封面图片
 * @param projectId 项目ID
 * @param file 文件对象
 */
export const uploadProjectCover = async (
  projectId: number,
  file: File
): Promise<{ cover_url: string }> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await request.post(`/project/project/${projectId}/cover`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.data;
  } catch (error) {
    console.error('上传封面图片失败:', error);
    throw error;
  }
};

/**
 * 获取项目对话数量
 * @param projectId 项目ID
 * @returns 对话数量
 */
export const getDialogueCount = (projectId: number) => {
  return request.get<{ length: number }>(`/project/dialogue_count/${projectId}`)
    .then(response => response.data)
    .catch(error => {
      console.error('获取对话数量失败:', error);
      throw error;
    });
};

/**
 * 模板中心：叙事模板元数据
 */
export interface TemplateMeta {
  template_type: string;
  name: string;
  description: string;
  features: string[];
  starter_scenes: { title: string; order_num: number; description?: string }[];
  recommended_variables: { name: string; label: string; initial_value: number }[];
}

/**
 * 获取全部叙事模板元数据
 */
export const getTemplates = async (): Promise<TemplateMeta[]> => {
  const response = await request.get('/project/templates');
  return response.data.data;
};

/**
 * 导出项目为完整 JSON 包（供备份 / 迁移 / 再导入）
 */
export const exportProjectBundle = async (projectId: number): Promise<Record<string, unknown>> => {
  const response = await request.get(`/project/project/${projectId}/export`, {
    params: { format: 'json' },
  });
  return response.data;
};

/**
 * 导出项目剧本为纯文本
 */
export const exportProjectText = async (projectId: number): Promise<string> => {
  const response = await request.get(`/project/project/${projectId}/export`, {
    params: { format: 'txt' },
    responseType: 'text',
    transformResponse: [(data: string) => data],
  });
  return response.data;
};

/**
 * 由 JSON 包导入项目（新建，归属当前用户）
 */
export const importProject = async (bundle: Record<string, unknown>): Promise<Project> => {
  const response = await request.post('/project/project/import', bundle);
  return response.data.data;
};
