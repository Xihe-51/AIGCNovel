/**
 * 分支选项展示模型：把分支数据 + 多语言 + 条件文案一次性算成视图结构。
 *
 * 纯函数，不持有状态、不发请求，播放器视图与选项组件只按数组渲染，
 * 因此这里是最适合单测兜底的一块（选项错文案会让玩家误判分支）。
 */
import { BASE_URL } from '@/utils/request'

export interface PlayerChoiceViewDeps {
  /** 当前语言下的选项文案 */
  localizedChoice: (branch: any) => string
  /** 界面文案 */
  t: (key: string, params?: Record<string, string | number>) => string
  /** 条件可读文案，用于锁定选项的提示 */
  conditionText: (conditions: any) => string
}

export interface PlayerChoiceView {
  id: any
  label: string
  imageUrl: string
  locked: boolean
  lockText: string
  title: string
}

export function buildChoiceViews(
  choices: any[],
  deps: PlayerChoiceViewDeps,
): PlayerChoiceView[] {
  return (choices || []).map((choice) => {
    const locked = !!choice?.locked
    const condition = locked ? deps.conditionText(choice?.conditions) : ''
    return {
      id: choice?.path_id,
      label: deps.localizedChoice(choice) || deps.t('choice.continue'),
      imageUrl: choice?.image_url ? BASE_URL + choice.image_url : '',
      locked,
      lockText: locked ? deps.t('choice.locked', { cond: condition }) : '',
      title: locked ? deps.t('choice.conditionNotMet', { cond: condition }) : '',
    }
  })
}
