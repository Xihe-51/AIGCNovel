/**
 * 播放器界面文案与多语言回退：阅读语言来自设置，译文缺失时回退原文。
 *
 * 语言、角色、场景、分支等数据通过 getter 注入，composable 只负责挑选文案，
 * 不直接持有播放器状态，也不发请求。
 */
import { computed } from 'vue'
import { playerText } from '@/utils/playerI18n'

export interface PlayerLocaleContext {
  /** 当前阅读语言，取自阅读设置 */
  getLanguage: () => string
  getCharacters: () => any[]
  getScenes: () => any[]
  getBranches: () => any[]
}

/** 需要译文时返回语言码；zh-CN 与空值表示沿用原文 */
export const translationLanguage = (language: string): string =>
  language && language !== 'zh-CN' ? language : ''

/** 有译文用译文，缺失或全空白时回退原文 */
export const pickTranslated = (translated: any, original: any): string => {
  const value = translated && String(translated).trim() ? translated : original
  return value || ''
}

export function usePlayerLocale(ctx: PlayerLocaleContext) {
  const translationLang = () => translationLanguage(ctx.getLanguage())

  /** 界面文案：随阅读语言切换，缺失时回退简体中文 */
  const t = (key: string, params?: Record<string, string | number>) =>
    playerText(ctx.getLanguage(), key, params)

  /** 当前语言下的角色名：优先译名，缺失时回退原名 */
  const localizedCharacterName = (character: any): string => {
    if (!character) return ''
    const lang = translationLang()
    const translated = lang ? character.name_translations?.[lang] : ''
    return pickTranslated(translated, character.name)
  }

  /** 状态弹窗用：character_id → 当前语言角色名 */
  const characterNames = computed(() => {
    const map: Record<string, string> = {}
    for (const c of ctx.getCharacters()) map[c.character_id] = localizedCharacterName(c)
    return map
  })

  /** 当前语言下的台词文本：优先译文，缺失时回退原文 */
  const localizedText = (dialogue: any): string => {
    if (!dialogue) return ''
    const lang = translationLang()
    const translated = lang ? dialogue.translations?.[lang] : ''
    return pickTranslated(translated, dialogue.content_text)
  }

  /** 当前语言下的场景标题：优先译文，缺失时回退原文 */
  const localizedSceneTitle = (scene: any): string => {
    if (!scene) return ''
    const lang = translationLang()
    const payload = lang ? scene.translations?.[lang] : null
    const title = payload && payload.title ? String(payload.title).trim() : ''
    return title || scene.title || ''
  }

  const sceneTitleById = (sceneId: any): string => {
    const scene = (ctx.getScenes() || []).find(s => Number(s.scene_id) === Number(sceneId))
    return scene ? localizedSceneTitle(scene) : ''
  }

  /** 当前语言下的选项文案：优先译文，缺失时回退原文 */
  const localizedChoice = (branch: any): string => {
    if (!branch) return ''
    const lang = translationLang()
    const translated = lang ? branch.translations?.[lang] : ''
    return pickTranslated(translated, branch.choice_text)
  }

  const choiceTextById = (pathId: any): string => {
    const branch = (ctx.getBranches() || []).find(b => Number(b.path_id) === Number(pathId))
    return branch ? localizedChoice(branch) : ''
  }

  /** 回想里的场景名：老存档只有 scene_title 字符串，新数据可用 scene_id 实时本地化 */
  const historySceneTitle = (dialogue: any): string => {
    const title = dialogue?.scene_id ? sceneTitleById(dialogue.scene_id) : ''
    return title || dialogue?.scene_title || ''
  }

  /** 回想里的选项：优先按 path_id 实时本地化，老存档回退已存文案 */
  const historyChoiceText = (dialogue: any): string => {
    const text = dialogue?.chosen_path_id ? choiceTextById(dialogue.chosen_path_id) : ''
    return text || dialogue?.chosen || ''
  }

  return {
    t,
    localizedCharacterName,
    characterNames,
    localizedText,
    localizedSceneTitle,
    sceneTitleById,
    localizedChoice,
    choiceTextById,
    historySceneTitle,
    historyChoiceText,
  }
}
