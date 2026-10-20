import request from '@/utils/request';

// ========== 类型定义 ==========

// AI生成记录类型
export interface AIGeneration {
  generation_id: number;
  user_id: number;
  prompt_text: string;
  generated_text: string;
  length: number;
  forbidden_words: string[];
  created_at: string | null;
  type: 'text' | 'image' | 'voice';
}

// AI模型类型
export interface AIModel {
  model_id: number;
  user_id: number;
  model_path: string;
  name: string;
  type: string;
  created_at: string | null;
}

// API响应类型
interface ApiResponse<T = any> {
  data?: T;
  count?: number;
  status?: string;
  message?: string;
  async?: boolean;
  task_id?: string;
}

// 异步任务状态
export interface TaskStatus<T = any> {
  status: string;
  task_id: string;
  state: 'PENDING' | 'PROGRESS' | 'SUCCESS' | 'FAILURE' | string;
  ready: boolean;
  progress?: { stage?: string } & Record<string, any>;
  result?: T;
  error?: string;
}

// ========== 新增：生成参数类型 ==========

// 文本生成参数
export interface GenerateTextParams {
  model: string;
  prompt: string;
  length: number;
  forbidden_words: string[];
}

// 图像生成参数
export interface GenerateImageParams {
  model: string;
  prompt: string;
  width: number;
  height: number;
}

// 音乐生成参数
export interface GenerateMusicParams {
  model: string;
  prompt: string;
  duration: number;
}

export interface GenerateVoiceParams {
  text: string;
  voice_type?: string;
  duration?: number;
}

// ========== API 函数 ==========

// 说明：原有 generateDialogue（/ai/generate-dialogue/）与 aiChat（/user/chat）
// 后端从未实现且无人调用，属于死接口，已移除，避免误导后续开发。

/**
 * 获取特定用户的 AI 生成记录
 */
export async function getAIGenerationsByUser(): Promise<ApiResponse<AIGeneration[]>> {
  try {
    const response = await request.get<ApiResponse<AIGeneration[]>>('/user/ai_history');
    return response.data;
  } catch (error) {
    console.error('Error fetching AI generations:', error);
    throw error;
  }
}

/**
 * 删除指定 generation_id 的 AI 生成记录
 */
export async function deleteAIGenerationById(generationId: number): Promise<ApiResponse> {
  try {
    const response = await request.delete<ApiResponse>(`/user/ai_history/${generationId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting AI generation:', error);
    throw error;
  }
}

/**
 * 获取用户的所有AI模型
 */
export async function getModels(): Promise<AIModel[]> {
  try {
    const response = await request.get<AIModel[]>('/user/ai_model');
    return response.data;
  } catch (error) {
    console.error('获取AI模型失败:', error);
    throw error;
  }
}

/**
 * 调用后端AI文本生成接口
 */
export async function generateText(
  params: GenerateTextParams
): Promise<ApiResponse<AIGeneration>> {
  try {
    const response = await request.post<ApiResponse<AIGeneration>>(
      '/ai/generate/text',
      params,
    );
    return response.data;
  } catch (error) {
    console.error('generateText error:', error);
    throw error;
  }
}

/**
 * 调用后端AI图像生成接口
 */
export async function generateImage(
  params: GenerateImageParams
): Promise<ApiResponse<AIGeneration>> {
  try {
    const response = await request.post<ApiResponse<AIGeneration>>(
      '/ai/generate/image',
      params,
    );
    return response.data;
  } catch (error) {
    console.error('generateImage error:', error);
    throw error;
  }
}

/**
 * 调用后端AI音乐生成接口
 */
export async function generateMusic(
  params: GenerateMusicParams
): Promise<ApiResponse<AIGeneration>> {
  try {
    const response = await request.post<ApiResponse<AIGeneration>>(
      '/ai/generate/music',
      params,
    );
    return response.data;
  } catch (error) {
    console.error('generateMusic error:', error);
    throw error;
  }
}

/**
 * 调用后端AI配音接口（火山 TTS：把文字念出来）
 * 注意与 generateMusic 语义不同：前者是 text-to-music，后者是 text-to-speech
 */
export async function generateVoice(
  params: GenerateVoiceParams
): Promise<ApiResponse<AIGeneration>> {
  try {
    const response = await request.post<ApiResponse<AIGeneration>>(
      '/ai/generate/voice',
      params,
    );
    return response.data;
  } catch (error) {
    console.error('generateVoice error:', error);
    throw error;
  }
}

/**
 * 查询异步任务状态
 */
export async function getTaskStatus<T = any>(taskId: string): Promise<TaskStatus<T>> {
  const response = await request.get<TaskStatus<T>>(`/ai/task/${taskId}`);
  return response.data;
}

/**
 * 轮询任务直到完成（或超时/失败）。
 * onProgress 会在每次拿到 PROGRESS 阶段时回调，便于显示进度文案。
 */
export async function pollTask<T = any>(
  taskId: string,
  opts: { intervalMs?: number; timeoutMs?: number; onProgress?: (s: TaskStatus<T>) => void } = {}
): Promise<T> {
  const intervalMs = opts.intervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const start = Date.now();

  // 首次稍等，避免立刻打到 PENDING
  await new Promise((r) => setTimeout(r, intervalMs));

  while (Date.now() - start < timeoutMs) {
    const s = await getTaskStatus<T>(taskId);
    if (s.state === 'SUCCESS') return s.result as T;
    if (s.state === 'FAILURE') throw new Error(s.error || '任务执行失败');
    opts.onProgress?.(s);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('任务超时');
}

/**
 * 统一入口：提交生成请求；若后端返回异步 task_id 则自动轮询，
 * 否则直接返回同步结果（兼容 ASYNC_ENABLED=false 的部署）。
 */
export async function submitAndWait<T = any>(
  submit: () => Promise<ApiResponse<any>>,
  opts: { onProgress?: (s: TaskStatus<T>) => void; timeoutMs?: number } = {}
): Promise<T> {
  const res = await submit();
  if (res?.async && res.task_id) {
    return pollTask<T>(res.task_id, {
      onProgress: opts.onProgress,
      timeoutMs: opts.timeoutMs,
    });
  }
  // 同步模式：后端返回 { status, async:false, data:{...} }，需要拆出 data
  const anyRes = res as any;
  return (anyRes?.data ?? anyRes) as T;
}

// ==================== 第 2 批：剧情续写 / RAG 人设库 / 会话记忆 ====================

/** 续写剧情的请求参数 */
export interface ContinueStoryParams {
  project_id: number;
  scene_id?: number | null;
  user_input: string;
  /** 无状态模式：前端把历史剧情一次性传过来，由后端做上下文压缩 */
  history?: any[];
  /** 有状态模式：多轮记忆由后端落 Redis，跨请求累积 */
  session_id?: string;
  stateful?: boolean;
  use_rag?: boolean;
  length?: number;
  temperature?: number;
  forbidden_words?: string | string[];
  model?: string;
}

/** 续写结果 */
export interface ContinueStoryResult {
  generation_id: number;
  generated_text: string;
  model: string;
  backend: string;
  length: number;
  project_id: number;
  scene_id?: number;
  session_id?: string;
  stateful: boolean;
  memory: {
    summary?: string;
    recent_count?: number;
    message_count?: number;
  };
  /** RAG 命中的角色人设（用于前端展示「本次参考了哪些角色」） */
  persona_hits: { character_id: number; name: string; score: number }[];
  prompt_chars?: number;
  cached?: boolean;
  created_at: string;
}

/**
 * 续写剧情（LangChain 上下文 + RAG 人设注入）。
 * 前端不再需要自己拼 prompt —— 只传历史与本次要求。
 */
export async function continueStory(
  params: ContinueStoryParams,
  opts: { onProgress?: (s: TaskStatus<ContinueStoryResult>) => void } = {}
): Promise<ContinueStoryResult> {
  return submitAndWait<ContinueStoryResult>(
    async () => {
      const response = await request.post<ApiResponse<ContinueStoryResult>>(
        '/ai/continue_story',
        params
      );
      return response.data;
    },
    opts
  );
}

/** 查看项目人设索引状态 */
export async function getRagStatus(projectId: number) {
  const response = await request.get(`/ai/rag/status/${projectId}`);
  return response.data;
}

/** 重建项目人设向量索引（角色增删改后调用） */
export async function rebuildRagIndex(
  projectId: number,
  opts: { onProgress?: (s: TaskStatus<any>) => void } = {}
): Promise<any> {
  return submitAndWait<any>(
    async () => {
      const response = await request.post(`/ai/rag/rebuild/${projectId}`, { force: true });
      return response.data;
    },
    opts
  );
}

/** 按关键词检索角色人设 */
export async function searchPersona(projectId: number, q: string, k = 3) {
  const response = await request.get('/ai/rag/search', {
    params: { project_id: projectId, q, k },
  });
  return response.data;
}

/** 查看会话记忆状态（消息条数 / 滚动摘要） */
export async function getMemoryState(sessionId: string) {
  const response = await request.get(`/ai/memory/${sessionId}`);
  return response.data;
}

/** 清空会话记忆 */
export async function resetMemory(sessionId: string) {
  const response = await request.delete(`/ai/memory/${sessionId}`);
  return response.data;
}
/** 本地 SD 状态（是否可用 / 内存是否够） */
export interface LocalSdStatus {
  ok: boolean;
  model_exists: boolean;
  lora_exists: boolean;
  config_exists: boolean;
  free_ram_gb: number;
  need_ram_gb: number;
  ram_ok: boolean;
  ready: boolean;
  loaded: boolean;
  dtype: string;
  reasons: string[];
}

/**
 * 探测各 AI 后端可用性。
 * 用于出图前判断本地 SD 是否就绪（尤其内存是否够），避免用户白等一次失败。
 */
export async function getAiHealth(): Promise<any> {
  const response = await request.get('/ai/health');
  const anyRes = response as any;
  return anyRes?.data ?? anyRes;
}
