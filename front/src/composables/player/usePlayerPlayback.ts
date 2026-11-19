/**
 * 播放控制：自动前进 / 快进下一场景 / 对话框与回想的显隐切换 / 上滑唤出回想 /
 * 选项点击按 path_id 找回分支对象。
 *
 * 对话状态、流程推进与分支选择都通过适配器注入，composable 只负责玩家操作到
 * 播放动作的编排，不直接持有播放位置或场景数据。
 */

export interface PlayerPlaybackContext {
  /** 自动播放开关状态 */
  getAutoPlay: () => boolean
  setAutoPlay: (value: boolean) => void
  /** 对话框是否可见 */
  getShowDialogueBox: () => boolean
  setShowDialogueBox: (value: boolean) => void
  /** 历史回想是否展开 */
  getShowHistory: () => boolean
  setShowHistory: (value: boolean) => void
  /** 当前节点可用的分支选项（含 path_id） */
  getChoices: () => any[]
  /** 按设置里的间隔安排下一次自动前进 */
  scheduleAutoAdvance: () => void
  /** 快进前记录当前行快照，保证可回退 */
  pushLineSnapshot: () => void
  nextScene: () => void
  selectBranch: (branch: any) => void
  /** 玩家打开回想时记一次行为埋点 */
  bumpBehaviorReview: () => void
}

export function usePlayerPlayback(ctx: PlayerPlaybackContext) {
  // 自动前进统一交给 scheduleAutoAdvance，由它读取用户设置的间隔
  const autoAdvanceDialogue = () => {
    ctx.scheduleAutoAdvance()
  }

  // 快进至下一场景：先留快照再推进，避免绕过回退
  const skipToNextScene = () => {
    ctx.pushLineSnapshot()
    ctx.nextScene()
  }

  const toggleDialogueBox = () => {
    ctx.setShowDialogueBox(!ctx.getShowDialogueBox())
  }

  // 打开回想时记一次行为埋点，关闭时不记
  const toggleHistoryDialogue = () => {
    if (!ctx.getShowHistory()) ctx.bumpBehaviorReview()
    ctx.setShowHistory(!ctx.getShowHistory())
  }

  // 打开自动播放立刻排期下一句；关闭只改状态，未触发的定时器交给调用方清理
  const toggleAutoPlay = () => {
    const next = !ctx.getAutoPlay()
    ctx.setAutoPlay(next)
    if (next) autoAdvanceDialogue()
  }

  // 舞台上滑：自动播放时不打断节奏，其余情况唤出回想
  const onWheelUp = () => {
    if (!ctx.getAutoPlay()) toggleHistoryDialogue()
  }

  // 选项点击：按 path_id 找回原始分支对象，锁定/跳转交给流程层
  const handleChoiceSelect = (pathId: any) => {
    const branch = ctx.getChoices().find((choice: any) => choice.path_id === pathId)
    if (branch) ctx.selectBranch(branch)
  }

  return {
    autoAdvanceDialogue,
    skipToNextScene,
    toggleDialogueBox,
    toggleHistoryDialogue,
    toggleAutoPlay,
    onWheelUp,
    handleChoiceSelect,
  }
}
