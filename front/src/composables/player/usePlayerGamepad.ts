/**
 * 手柄操作：标准按键映射轮询（A 继续 / B 回想 / X 自动播放）。
 *
 * 面板开合与翻页动作通过适配器注入，composable 只负责边沿触发判定与轮询生命周期，
 * 不直接操作播放状态。
 */
export interface PlayerGamepadContext {
  /** 任一面板展开时不响应手柄，避免误推进 */
  isPanelOpen: () => boolean
  nextDialogue: () => void
  toggleHistoryDialogue: () => void
  toggleAutoPlay: () => void
}

/** 手柄轮询间隔（ms） */
export const GAMEPAD_POLL_INTERVAL = 200

export function usePlayerGamepad(ctx: PlayerGamepadContext) {
  const gamepadPrev: Record<string, boolean> = { '0': false, '1': false, '2': false }
  let gamepadTimer: ReturnType<typeof setInterval> | null = null

  const pollGamepad = () => {
    if (!navigator.getGamepads) return
    // 只在页面可见时响应手柄，避免后台标签误推进剧情
    if (document.visibilityState !== 'visible') return
    const pads = Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!(p && p.connected))
    if (!pads.length) return
    const pad = pads[0]!
    const panelsOpen = ctx.isPanelOpen()

    Object.keys(gamepadPrev).forEach((idx) => {
      const btn = pad.buttons[Number(idx)]
      const pressed = !!(btn && btn.pressed)
      if (pressed && !gamepadPrev[idx] && !panelsOpen) {
        if (idx === '0') ctx.nextDialogue()
        else if (idx === '1') ctx.toggleHistoryDialogue()
        else if (idx === '2') ctx.toggleAutoPlay()
      }
      gamepadPrev[idx] = pressed
    })
  }

  const startGamepad = () => {
    stopGamepad()
    gamepadTimer = setInterval(pollGamepad, GAMEPAD_POLL_INTERVAL)
  }

  const stopGamepad = () => {
    if (gamepadTimer) {
      clearInterval(gamepadTimer)
      gamepadTimer = null
    }
  }

  return { pollGamepad, startGamepad, stopGamepad }
}
