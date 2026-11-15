/**
 * 播放器键盘快捷键：Esc 关面板、← 回退、空格/回车/→ 继续、H 回想、A 自动、S 跳过已读。
 *
 * 面板用 ref 列表注入，快捷键动作用适配器注入，composable 只负责按键判定与优先级，
 * 不直接持有播放状态，也不操作 DOM 事件绑定。
 */
import { ElMessage } from 'element-plus'
import type { Ref } from 'vue'

export interface PlayerKeyboardContext {
  /** Esc 依次关闭的面板，顺序即优先级 */
  getEscPanels: () => Ref<boolean>[]
  /** 任一展开即拦截翻页类快捷键的面板 */
  getActivePanels: () => Ref<boolean>[]
  rollbackOneLine: () => void
  nextDialogue: () => void
  toggleHistoryDialogue: () => void
  toggleAutoPlay: () => void
  /** 切换跳过已读，返回切换后的状态 */
  toggleSkipRead: () => boolean
  /** 界面文案，用于操作提示 */
  t: (key: string) => string
}

/** 输入类控件内不拦截快捷键，避免和表单输入冲突 */
export const isEditableTarget = (target: any): boolean => {
  const tag = target && target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    || !!(target && target.isContentEditable)
}

/** 是否仍有面板展开 */
export const anyPanelVisible = (panels: Ref<boolean>[]): boolean =>
  (panels || []).some(panel => panel.value)

/** 关闭第一个展开的面板，返回是否关闭了某个面板 */
export const closeFirstVisiblePanel = (panels: Ref<boolean>[]): boolean => {
  for (const panel of panels || []) {
    if (panel.value) {
      panel.value = false
      return true
    }
  }
  return false
}

export function usePlayerKeyboard(ctx: PlayerKeyboardContext) {
  const isPanelOpen = () => anyPanelVisible(ctx.getActivePanels())
  const closePlayerPanels = () => closeFirstVisiblePanel(ctx.getEscPanels())

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (closePlayerPanels()) e.preventDefault()
      return
    }

    if (isEditableTarget(e.target)) return

    if (e.key === 'ArrowLeft') {
      if (isPanelOpen()) return
      e.preventDefault()
      ctx.rollbackOneLine()
      return
    }

    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      if (isPanelOpen()) return
      e.preventDefault()
      ctx.nextDialogue()
      return
    }

    const key = e.key.toLowerCase()

    if (key === 'h') {
      e.preventDefault()
      ctx.toggleHistoryDialogue()
      return
    }

    // S 属于设置类操作，弹窗打开时也生效
    if (key === 's') {
      e.preventDefault()
      const skipRead = ctx.toggleSkipRead()
      ElMessage.info(ctx.t(skipRead ? 'toast.skipOn' : 'toast.skipOff'))
      return
    }

    if (isPanelOpen()) return

    if (key === 'a') {
      e.preventDefault()
      ctx.toggleAutoPlay()
    }
  }

  return { isPanelOpen, closePlayerPanels, handleKeydown }
}
