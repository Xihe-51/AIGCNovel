import request from '@/utils/request';

// 用户基本信息类型
export interface UserInfo {
  user_id: number;
  username: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  created_at?: string;
  last_login?: string;
}

// AI模型类型
export interface AIModel {
  model_id: number;
  name: string;
  style_description: string;
  type?: string;
  created_at?: string;
}

// 项目类型
export interface Project {
  project_id: number;
  title: string;
  cover_url?: string;
  genre: '悬疑' | '恋爱' | '科幻' | '奇幻' | '历史' | '现代' | '其他';
  template_type: '线性叙事' | '分支叙事' | '开放世界';
  word_count: number;
  created_at?: string;
  updated_at?: string;
}

// 用户统计数据
export interface UserStatistics {
  project_count: number;
  model_count: number;
  total_word_count: number;
  last_active?: string;
}

// 分页响应类型
export interface PaginatedResponse<T> {
  models?: T[];
  projects?: T[];
  total: number;
  pages: number;
  current_page: number;
}

// 更新用户信息参数
export interface UpdateUserParams {
  username?: string;
  email?: string;
  phone?: string;
  password?: string;
}

/**
 * 获取当前用户个人信息
 */
export function getUserInfo() {
  return request.get<{
    code: number;
    message: string;
    data: UserInfo;
  }>('/user/profile');
}

/**
 * 更新用户个人信息
 * @param data 更新数据
 */
export function updateUserInfo(data: UpdateUserParams) {
  return request.put<{
    code: number;
    message: string;
  }>('/user/profile', data);
}

/**
 * 上传用户头像
 * @param file 头像文件
 */
export function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append('avatar', file);
  
  return request.post<{
    code: number;
    message: string;
    data: {
      avatar_url: string;
    };
  }>('/user/avatar', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

/**
 * 获取用户创建的AI模型列表
 * @param page 页码
 * @param perPage 每页数量
 */
export function getUserModels() {
  return request.get<{
    code: number;
    message: string;
    data: PaginatedResponse<AIModel>;
  }>('/user/models');
}

/**
 * 获取用户创建的项目列表
 * @param page 页码
 * @param perPage 每页数量
 */
export function getUserProjects(page = 1, perPage = 10) {
  return request.get<{
    code: number;
    message: string;
    data: PaginatedResponse<Project>;
  }>('/user/projects', {
    params: {
      page,
      per_page: perPage,
    },
  });
}

/**
 * 获取用户统计数据
 */
export function getUserStatistics() {
  return request.get<{
    code: number;
    message: string;
    data: UserStatistics;
  }>('/user/statistics');
}

// 创建AI模型
export function createAIModel(data: {
  name: string;
  style_description: string;
  model_path: string;
  type?: string;
}) {
  return request.post<{
    code: number;
    message: string;
    data: AIModel;
  }>('/user/models', data);
}

// 更新AI模型
export function updateAIModel(modelId: number, data: {
  name?: string;
  style_description?: string;
  model_path?: string;
  type?: string | null;
}) {
  return request.patch<{
    code: number;
    message: string;
    data: AIModel;
  }>(`/user/models/${modelId}`, data);
}

// 删除AI模型
export function deleteAIModel(modelId: number) {
  return request.delete<{
    code: number;
    message: string;
  }>(`/user/models/${modelId}`);
}

// 获取单个模型详情
export function getModelDetail(modelId: number) {
  return request.get<{
    code: number;
    message: string;
    data: AIModel & { model_path: string }; // 包含模型路径
  }>(`/user/models/${modelId}`);
}