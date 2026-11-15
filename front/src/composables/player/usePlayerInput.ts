/**
 * 输入接入：键盘快捷键、手柄轮询与「首次交互解锁音频」三件全局监听。
 *
 * 按键判定与手柄边沿判定分别由 usePlayerKeyboard、usePlayerGamepad 负责，
 * 这里只做装配：把播放动作和面板状态接进去，并在挂载 / 卸载时统一注册与注销监听，
 * 避免视图里散落 addEventListener 与对应的 removeEventListener。
 */
import { onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { usePlayerKeyboard } from './usePlayerKeyboard'
import { usePlayerGamepad } from './usePlayerGamepad'

export interface PlayerInputContext {
  /** Esc 依次关闭的面板，顺序即优先级 */
  getEscPanels: () => Ref<boolean>[]
  /** 任一展开即拦截翻页类快捷键的面板 */
  getActivePanels: () => Ref<boolean>[]
  /** 跳过已读开关的当前值 */
  getSkipRead: () => boolean
  setSkipRead: (value: boolean) => void
  rollbackOneLine: () => void
  nextDialogue: () => void
  toggleHistoryDialogue: () => void
  toggleAutoPlay: () => void
  /** 首次交互时尝试播放背景音乐（绕过浏览器自动播放限制） */
  playBackgroundMusic: () => void
  /** 界面文案，用于操作提示 */
  t: (key: string) => string
}

export function usePlayerInput(ctx: PlayerInputContext) {
  const { isPanelOpen, handleKeydown } = usePlayerKeyboard({
    getEscPanels: () => ctx.getEscPanels(),
    getActivePanels: () => ctx.getActivePanels(),
    rollbackOneLine: () => ctx.rollbackOneLine(),
    nextDialogue: () => ctx.nextDialogue(),
    toggleHistoryDialogue: () => ctx.toggleHistoryDialogue(),
    toggleAutoPlay: () => ctx.toggleAutoPlay(),
    toggleSkipRead: () => {
      const next = !ctx.getSkipRead()
      ctx.setSkipRead(next)
      return next
    },
    t: (key) => ctx.t(key),
  })

  const { startGamepad, stopGamepad } = usePlayerGamepad({
    isPanelOpen: () => isPanelOpen(),
    nextDialogue: () => ctx.nextDialogue(),
    toggleHistoryDialogue: () => ctx.toggleHistoryDialogue(),
    toggleAutoPlay: () => ctx.toggleAutoPlay(),
  })

  const unlockAudio = () => ctx.playBackgroundMusic()

  onMounted(() => {
    // 首次交互解锁音频：三个入口都只触发一次
    document.addEventListener('click', unlockAudio, { once: true })
    document.addEventListener('keydown', unlockAudio, { once: true })
    document.addEventListener('touchstart', unlockAudio, { once: true, passive: true })
    document.addEventListener('keydown', handleKeydown)
    startGamepad()
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('click', unlockAudio)
    document.removeEventListener('keydown', unlockAudio)
    document.removeEventListener('touchstart', unlockAudio)
    stopGamepad()
  })

  return { isPanelOpen, handleKeydown, startGamepad, stopGamepad }
}
