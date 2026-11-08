import request from '@/utils/request';

export interface TranslationLanguage {
  code: string;
  label: string;
}

/** 主语言：直接使用 content_text，不落翻译表 */
export const PRIMARY_LANGUAGE: TranslationLanguage = { code: 'zh-CN', label: '简体中文' };

/** 可翻译语言（与后端 TRANSLATION_LANGUAGES 保持一致） */
export const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];

export const PLAYER_LANGUAGES: TranslationLanguage[] = [PRIMARY_LANGUAGE, ...TRANSLATION_LANGUAGES];

export interface ContentTranslationItem {
  content_id: number;
  language: string;
  text: string;
}

export interface ProjectTranslations {
  languages: string[];
  items: ContentTranslationItem[];
}

export function translationLabel(code: string): string {
  return PLAYER_LANGUAGES.find(l => l.code === code)?.label || code;
}

/** 作者端读取项目全部逐句译文 */
export async function listProjectTranslations(projectId: number): Promise<ProjectTranslations> {
  const response = await request.get(`/project/translations/${projectId}`);
  return response.data.data;
}

/** 新增/更新一条译文；text 为空时后端会删除该语言译文 */
export async function saveContentTranslation(
  contentId: number,
  language: string,
  text: string
): Promise<ContentTranslationItem> {
  const response = await request.put(`/project/translations/${contentId}/${language}`, { text });
  return response.data.data;
}

/** 删除一条译文 */
export async function deleteContentTranslation(
  contentId: number,
  language: string
): Promise<ContentTranslationItem> {
  const response = await request.delete(`/project/translations/${contentId}/${language}`);
  return response.data.data;
}

export interface SceneTranslationItem {
  scene_id: number;
  language: string;
  title: string;
  description: string;
}

/** 保存场景标题/描述译文；两项都为空时后端删除该语言译文 */
export async function saveSceneTranslation(
  sceneId: number,
  language: string,
  title: string,
  description: string
): Promise<SceneTranslationItem> {
  const response = await request.put(`/project/translations/scene/${sceneId}/${language}`, {
    title,
    description,
  });
  return response.data.data;
}

export interface BranchTranslationItem {
  path_id: number;
  language: string;
  text: string;
}

/** 保存选项译文；text 为空时后端删除该语言译文 */
export async function saveBranchTranslation(
  pathId: number,
  language: string,
  text: string
): Promise<BranchTranslationItem> {
  const response = await request.put(`/project/translations/branch/${pathId}/${language}`, {
    text,
  });
  return response.data.data;
}
