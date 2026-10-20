import request from '@/utils/request';

export interface Character {
  character_id: number
  project_id: number
  name: string
  avatar_url?: string
  age?: number
  description?: string
  settings?: Record<string, any>
  is_main: boolean
  created_at: string
}

export type AvatarType = '正常' | '高兴' | '生气' | '悲伤' | '惊讶' | '其他';

export interface CharacterAvatar {
  avatar_id: number;
  character_id: number;
  image_url: string;
  avatar_type: AvatarType;
  costume?: string;
  is_default: boolean;
  created_at: string;
}

/**
 * 根据角色id获取角色数据
 * @param charactertId 角色ID
 * @returns 角色列表
 */
export const getCharacterDetail = async (charactertId: number): Promise<Character> => {
  try {
    const response = await request.get(`/project/character/${charactertId}`);
    return response.data.data;
  } catch (error) {
    console.error('获取角色失败:', error);
    throw error;
  }
};

// 角色立绘的上传函数
export const uploadCharacterAvatar = async (
  file: File,
  projectId: number,
  characterId: number,
  avatarType: AvatarType,
  costume?: string,
  isDefault: boolean = false
): Promise<{ message: string; avatar_id: number }> => {
  const formData = new FormData();
  
  // 构建表单数据
  formData.append('file', file);
  formData.append('project_id', projectId.toString());
  formData.append('character_id', characterId.toString());
  formData.append('avatar_type', avatarType);
  if (costume) {
    formData.append('costume', costume);
  }
  formData.append('is_default', String(isDefault));

  try {
    // 发送 POST 请求到后端
    const response = await request.post('/project/upload_avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    return response.data; // 返回成功消息和头像ID
  } catch (error) {
    console.error('上传角色立绘失败:', error);
    throw error; // 向上抛出错误以便在调用处处理
  }
};

/**
 * 获取项目下所有角色
 * @param projectId 项目ID
 * @returns 角色列表
 */
export const getCharacters = async (projectId: number): Promise<Character[]> => {
  try {
    const response = await request.get(`/project/characters/${projectId}`);
    return response.data.data;
  } catch (error) {
    console.error('获取角色失败:', error);
    throw error;
  }
};
/**
 * 获取项目下所有角色
 * @param 立绘Id
 * @returns 角色列表
 */
export const getAvatarsById = async (avatarId: number): Promise<CharacterAvatar[]> => {
	try {
	  const response = await request.get(`/project/character_avatar/${avatarId}`);
	  return response.data.data;
	} catch (error) {
	  console.error('获取角色立绘失败:', error);
	  throw error;
	}
};

/**
 * 批量获取角色立绘
 * @param characterIds 角色ID数组
 * @returns 角色立绘列表
 */
export const getCharacterAvatarsBatch = async (characterIds: number[]): Promise<CharacterAvatar[]> => {
  try {
    const response = await request.get('/project/character/avatars/batch', {
      params: {
        character_ids: characterIds.join(',')  // 将数组转换为逗号分隔的字符串
      },
      paramsSerializer: {
        indexes: null  // 防止数组参数被序列化为array[]格式
      }
    });
    
    return response.data.data;
  } catch (error) {
    console.error('批量获取角色立绘失败:', error);
    throw error;
  }
};


/**
 * 创建角色
 * @param characterData 角色数据
 * @returns 创建的角色
 */
export const createCharacter = async (characterData: Omit<Character, 'character_id' | 'created_at'>): Promise<Character> => {
  try {
    const response = await request.post('/project/create_character', characterData);
    return response.data.data;
  } catch (error) {
    console.error('创建角色失败:', error);
    throw error;
  }
};

/**
 * 编辑角色
 * @param characterData 角色数据
 * @returns 编辑后信息
 */
export const updateCharacter = async (characterData: Omit<Character, 'character_id' | 'created_at'>): Promise<Character> => {
  try {
    const response = await request.post('/project/update_character', characterData);
    return response.data.data;
  } catch (error) {
    console.error('更新角色失败:', error);
    throw error;
  }
};

/**
 * 删除角色
 * @param characterId 角色ID
 * @returns 删除操作的结果
 */
export const deleteCharacter_by_Id = async (characterId: number): Promise<{ success: boolean; message: string; character_id: number }> => {
  try {
    const response = await request.delete(`/project/character/${characterId}`);
    return response.data;
  } catch (error) {
    console.error('删除角色失败:', error);
    throw error;
  }
};

/**
 * 删除角色立绘
 * @param avatarId 要删除的立绘ID
 * @returns 无返回值，失败时会抛出错误
 */
export const deleteCharacterAvatar = async (avatarId: number): Promise<void> => {
  try {
    const response = await request.delete(`/project/delete_avatar/${avatarId}`);
    return response.data;
  } catch (error) {
    console.error('删除立绘失败:', error);
    throw error; // 继续抛出错误以便调用方可以处理
  }
};


/**
 * 编辑角色立绘
 * @param avatarData 角色立绘数据
 * @returns 编辑后信息
 */
export const updateCharacterAvatar = async (avatarData: { avatar_id: number }): Promise<CharacterAvatar> => {
  try {
    const response = await request.post('/project/update_avatar', avatarData);
    return response.data.data;
  } catch (error) {
    console.error('更新角色失败:', error);
    throw error;
  }
};