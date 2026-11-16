/**
 * 二次确认弹窗的统一出口。
 *
 * 直接用 ElMessageBox.confirm 时，各处的写法不一致：
 * - 有的把 confirm 和业务放进同一个 try，取消也会被当成失败弹错误提示；
 * - 有的在 catch 里靠 `e === 'cancel'` 字符串判断，漏判 close 就静默吞掉真实错误。
 * 这里统一成「返回 boolean」，取消/关闭一律 false，调用方先判断再进业务 try。
 */
import { ElMessageBox } from 'element-plus'
import type { ElMessageBoxOptions } from 'element-plus'

export const DEFAULT_CONFIRM_TITLE = '提示'
export const DEFAULT_CONFIRM_TEXT = '确定'
export const DEFAULT_CANCEL_TEXT = '取消'
export const DEFAULT_DANGER_TEXT = '删除'

export type ConfirmDialogType = NonNullable<ElMessageBoxOptions['type']>

/** 除 type 收窄为具体的四个取值外，其余 ElMessageBox 选项原样透传（customClass / confirmButtonClass 等） */
export interface ConfirmDialogOptions extends Omit<ElMessageBoxOptions, 'type'> {
  /** 弹窗标题，默认「提示」 */
  title?: string
  /** 图标类型，默认 warning */
  type?: ConfirmDialogType
}

/**
 * 弹出确认框，确认返回 true；取消、点右上角关闭、按 ESC 一律返回 false。
 */
export async function confirmAction(
  message: string,
  {
    title = DEFAULT_CONFIRM_TITLE,
    confirmButtonText = DEFAULT_CONFIRM_TEXT,
    cancelButtonText = DEFAULT_CANCEL_TEXT,
    type = 'warning',
    ...rest
  }: ConfirmDialogOptions = {}
): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText,
      cancelButtonText,
      type,
      ...rest,
    })
    return true
  } catch {
    return false
  }
}

/**
 * 删除类操作的确认框：确认按钮默认是「删除」。
 */
export function confirmDanger(
  message: string,
  options: ConfirmDialogOptions = {}
): Promise<boolean> {
  return confirmAction(message, { confirmButtonText: DEFAULT_DANGER_TEXT, ...options })
}
