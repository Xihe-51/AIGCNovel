/**
 * 台词生命周期：决定「一句台词开始播放时发生什么」。
 *
 * 顺序是固定的——结算变量效果 → 消费回退标记 → 结局判定 → 清空上一句的打字与
 * 自动前进定时器 → 已读跳过 → 记录已读 → 选择节点计时 → 开始逐字显示。
 * 每一步的具体实现都由注入回调提供，所以这里只负责顺序与分支，便于单独测试。
 *
 * 同时把「设置变更后如何重播当前句」的四个 watch 与「切句后重播」的 watch 一并收口，
 * 避免视图里散落一串互不相关的监听器。
 */
import { nextTick, watch, type Ref } from 'vue'

export interface PlayerLineLifecycleContext {
  currentDialogue: Ref<any>
  sceneIndex: Ref<number>
  dialogueIndex: Ref<number>
  settings: Ref<any>
  isPlaying: Ref<boolean>

  /** 变量效果结算 */
  applyEffectsForCurrent: () => void
  /** 命中结局则返回 true（此时不再打字） */
  checkEndingForCurrent: () => boolean
  /** 消费「回退后强制展示」标记 */
  consumeSkipRestoredLine: () => boolean
  shouldSkipCurrent: () => boolean
  allowSkip: () => boolean
  resetSkipGuard: () => void
  markCurrentRead: () => void
  markHesitationStart: (contentId: any) => void

  clearTyping: () => void
  clearAutoTimer: () => void
  typeOut: () => void
  finishTyping: () => void
  scheduleAutoAdvance: () => void

  nextDialogue: () => void
  setBgmDucking: (on: boolean) => void
  applyVolumes: () => void
}

export function usePlayerLineLifecycle(ctx: PlayerLineLifecycleContext) {
  const startTyping = () => {
    if (!ctx.currentDialogue.value) return

    ctx.applyEffectsForCurrent()

    // 回退/演出编辑后强制展示当前句：即使命中结局分支也要先消费标记，避免标记泄漏到下一句
    const forceShowRestored = ctx.consumeSkipRestoredLine()

    // 到达结局节点且条件成立：弹结局页，不再继续打字
    if (ctx.checkEndingForCurrent()) return

    ctx.clearTyping()
    ctx.clearAutoTimer()

    // 跳过已读：连续跳过已读节点，直到未读或遇到选择
    if (!forceShowRestored && ctx.shouldSkipCurrent()) {
      if (ctx.allowSkip()) {
        ctx.nextDialogue()
        return
      }
    } else {
      ctx.resetSkipGuard()
    }

    ctx.markCurrentRead()

    // 活叙事：在选择节点开始计时（未启用行为变量时仅计时、不写入）
    if (ctx.currentDialogue.value?.content_type === '选择') {
      ctx.markHesitationStart(ctx.currentDialogue.value.content_id)
    }

    ctx.typeOut()
  }

  // 文字速度变化时，当前句按新速度重新显示
  watch(() => ctx.settings.value.textSpeed, () => startTyping())

  // 切换语言后，当前句立即换成对应译文（正在打字时直接显示整句）
  watch(() => ctx.settings.value.language, () => {
    if (!ctx.isPlaying.value || !ctx.currentDialogue.value) return
    ctx.finishTyping()
  })

  watch(() => ctx.settings.value.autoDelay, () => ctx.scheduleAutoAdvance())

  // 关闭语音时立刻恢复 BGM 音量
  watch(() => ctx.settings.value.voiceEnabled, (on) => {
    if (!on) ctx.setBgmDucking(false)
  })

  // 切换对话/场景时重新逐字显示
  watch([ctx.sceneIndex, ctx.dialogueIndex], () => {
    nextTick(() => {
      startTyping()
      ctx.applyVolumes()
    })
  })

  return { startTyping }
}
