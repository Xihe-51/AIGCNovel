/**
 * 播放器界面文案字典。
 *
 * 只翻译「界面」，不翻译作者内容（台词、场景名、结局/成就/CG 标题等）。
 * 主语言是简体中文；其余语言缺失的键自动回退中文。
 * 每种语言一份字典文件，新增语言只需补一个文件并登记到 TABLES。
 */
import type { Dict } from './types'
import { ZH_CN } from './zh-CN'
import { ZH_TW } from './zh-TW'
import { EN } from './en'
import { JA } from './ja'

export type { Dict }

const TABLES: Record<string, Dict> = {
  'zh-CN': ZH_CN,
  'zh-TW': ZH_TW,
  en: EN,
  ja: JA,
};

/** 取播放器界面文案；未知语言或缺失键回退简体中文。 */
export function playerText(
  language: string,
  key: string,
  params?: Record<string, string | number>
): string {
  const table = TABLES[language] || ZH_CN;
  let text = table[key] ?? ZH_CN[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
