import request from '@/utils/request';

// 定义类型接口
export interface Scene {
  scene_id: number;
  project_id: number;
  title: string;
  description: string;
  background_url: string;
  music_url: string;
  order_num: number;
  created_at: string;
}

export interface Dialogue {
  content_id?: number;
  project_id: number;
  scene_id: number;
  character_id?: number;
  avatar_id?: number;
  content_type: '对话' | '描述' | '选择';
  content_text: string;
  voice_url?: string;
  avatar_type?: string;
  order_num: number;
}

export interface Character {
  character_id: number;
  project_id: number;
  name: string;
  age?: number;
  description?: string;
  settings?: any;
  is_main: boolean;
  created_at: string;
}

export interface CharacterAvatar {
  avatar_id: number;
  character_id: number;
  image_url: string;
  avatar_type: string;
  costume?: string;
  is_default: boolean;
  created_at: string;
}

/**
 * 根据场景ID获取场景详情
 * @param sceneId 场景ID
 * @returns 场景详情
 */
export async function getSceneById(sceneId: number): Promise<Scene> {
  try {
    const response = await request.get(`/project/scene/${sceneId}`);
    return response.data.data;
  } catch (error) {
    console.error('获取场景详情失败:', error);
    throw error;
  }
}

/**
 * 保存场景设置
 * @param scene 场景数据
 * @returns 保存结果
 */
export async function saveScene(scene: Partial<Scene>): Promise<Scene> {
  try {
    const response = await request.put(`/project/scenes/${scene.scene_id}`, scene);
    return response.data.data;
  } catch (error) {
    console.error('保存场景设置失败:', error);
    throw error;
  }
}

/**
 * 根据场景ID获取该场景的所有对话
 * @param sceneId 场景ID
 * @returns 对话数组
 */
export async function getDialoguesBySceneId(sceneId: number): Promise<Dialogue[]> {
  try {
    const response = await request.get(`/project/dialogues/${sceneId}`);
    return response.data.data;
  } catch (error) {
    console.error('获取对话失败:', error);
    throw error;
  }
}

/**
 * 保存对话（新增或更新）
 * @param dialogue 对话数据
 * @returns 保存后的对话
 */
export async function saveDialogues(dialogue: Dialogue): Promise<Dialogue> {
  try {
    if (dialogue.content_id) {
      // 更新现有对话
      const response = await request.put(`/project/dialogues/${dialogue.content_id}`, dialogue);
      return response.data.data;
    } else {
      // 创建新对话
      const response = await request.post('/project/dialogues', dialogue);
      return response.data.data;
    }
  } catch (error) {
    console.error('保存对话失败:', error);
    throw error;
  }
}

/**
 * 删除对话
 * @param contentId 对话ID
 * @returns 删除结果
 */
export async function deleteDialogue(contentId: number): Promise<boolean> {
  try {
    const response = await request.delete(`/project/dialogues/${contentId}`);
    return response.data.success;
  } catch (error) {
    console.error('删除对话失败:', error);
    throw error;
  }
}

/**
 * 根据项目ID获取所有角色
 * @param projectId 项目ID
 * @returns 角色数组
 */
export async function getCharactersByProjectId(projectId: number): Promise<Character[]> {
  try {
    const response = await request.get(`/project/characters/${projectId}`);
    return response.data.data;
  } catch (error) {
    console.error('获取角色列表失败:', error);
    throw error;
  }
}

/**
 * 根据角色ID获取该角色的所有头像
 * @param characterId 角色ID
 * @returns 头像数组
 */
export async function getCharacterAvatars(characterId: number): Promise<CharacterAvatar[]> {
  try {
    const response = await request.get(`/project/avatars/${characterId}`);
    return response.data.data;
  } catch (error) {
    console.error('获取角色头像失败:', error);
    throw error;
  }
}

/**
 * 重新排序场景下的对话
 * @param {number} sceneId - 场景ID
 * @param {number[]} orderedContentIds - 按新顺序排列的对话ID数组
 * @returns {Promise} - 返回排序结果
 */
export const reorderDialoguesApi = async (sceneId: number, orderedContentIds: number[]) => {
  const response = await request({
    url: `project/dialogues/reorder/${sceneId}`,
    method: 'POST',
    data: {
      ordered_content_ids: orderedContentIds
    }
  });
  return response.data;
};
