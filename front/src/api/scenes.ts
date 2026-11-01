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
 * 深拷贝场景（含对话、分支、数值变化、演出指令）
 */
export const duplicateScene = async (sceneId: number): Promise<Scene> => {
  try {
    const response = await request.post(`/project/scenes/${sceneId}/duplicate`);
    return response.data.data;
  } catch (error) {
    console.error('复制场景失败:', error);
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

export interface ProjectSearchItem {
  result_type: 'content' | 'scene' | 'choice'
  scene_id: number
  scene_title: string
  scene_order: number
  content_id: number | null
  content_type: string
  order_num: number | null
  character_name: string
  text: string
}

export interface ProjectSearchResult {
  query: string
  total: number
  items: ProjectSearchItem[]
}

export interface ProjectReplaceResult {
  query: string
  replacement: string
  contents: number
  choices: number
  scenes: number
  occurrences: number
}

/** 全项目搜索：对话/旁白、场景名、选项文案 */
export const searchProject = async (projectId: number, q: string): Promise<ProjectSearchResult> => {
  const response = await request.get(`/project/search/${projectId}`, { params: { q } });
  return response.data.data;
};

/** 全项目批量替换；dryRun=true 只统计数量，不写库 */
export const replaceProjectText = async (
  projectId: number,
  query: string,
  replacement: string,
  dryRun = false
): Promise<ProjectReplaceResult> => {
  const response = await request.post(`/project/search/${projectId}/replace`, {
    query,
    replacement,
    dry_run: dryRun,
  });
  return response.data.data;
};

export type SceneCondition = { variable: string; op: string; value: number }
export type SceneConditionGroup = { mode: 'and' | 'or'; items: SceneCondition[] }

/** 场景播放条件（剧情锁）：scene_id → 条件组 */
export const listSceneLocks = async (
  projectId: number
): Promise<Record<string, SceneConditionGroup | null>> => {
  const response = await request.get(`/project/scene_locks/${projectId}`);
  return response.data.data;
}

/** 设置/清除场景播放条件；conditions 传 null 表示清除 */
export const setSceneLock = async (
  projectId: number,
  sceneId: number,
  conditions: SceneConditionGroup | null
): Promise<{ scene_id: number; conditions: SceneConditionGroup | null }> => {
  const response = await request.put(`/project/scene_locks/${projectId}/${sceneId}`, { conditions });
  return response.data.data;
}
