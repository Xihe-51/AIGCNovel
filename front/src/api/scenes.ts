import request from '@/utils/request';

export interface Scene {
  project_id: number
  scene_id: number
  title: string
  background_url: string
  music_url?: string
  description?: string
  order_num: number
  created_at: string
}

export interface UploadResult {
  success: boolean
  message?: string
  data: { url: string }
}

/**
 * 获取项目下所有场景
 * @param projectId 项目ID
 * @returns 场景列表
 */
export const getScenes = async (projectId: number): Promise<Scene[]> => {
  try {
    const response = await request.get(`/project/scenes/${projectId}`);
    return response.data.data;
  } catch (error) {
    console.error('获取场景失败:', error);
    throw error;
  }
};

/**
 * 创建新场景
 * @param scene 场景信息
 * @returns 新创建的场景
 */
export const createScene = async (scene: Omit<Scene, 'scene_id' | 'created_at'>): Promise<Scene> => {
  try {
    const response = await request.post('/project/scenes', scene);
    return response.data.data;
  } catch (error) {
    console.error('创建场景失败:', error);
    throw error;
  }
};

/**
 * 更新场景信息
 * @param sceneId 场景ID
 * @param scene 要更新的场景信息
 * @returns 更新后的场景
 */
export const updateScene = async (sceneId: number, scene: Partial<Scene>): Promise<Scene> => {
  try {
    const response = await request.put(`/project/scenes/${sceneId}`, scene);
    return response.data.data;
  } catch (error) {
    console.error('更新场景失败:', error);
    throw error;
  }
};

/**
 * 删除场景
 * @param sceneId 场景ID
 * @returns 操作结果
 */
export const deleteScene = async (sceneId: number): Promise<{ success: boolean }> => {
  try {
    const response = await request.delete(`/project/scenes/${sceneId}`);
    return response.data;
  } catch (error) {
    console.error('删除场景失败:', error);
    throw error;
  }
};

/**
 * 上传场景相关文件（背景图片或音乐）
 * @param formData 包含文件和相关信息的FormData
 * @returns 上传结果，包含文件URL
 */
export const uploadSceneFile = async (formData: FormData): Promise<UploadResult> => {
  try {
    const response = await request.post('/project/scenes/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  } catch (error) {
    console.error('文件上传失败:', error);
    throw error;
  }
};
