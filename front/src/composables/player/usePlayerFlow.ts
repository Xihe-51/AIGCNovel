/**
 * 播放器剧情推进：节点寻址、下一句 / 下一场景、选项分支跳转。
 *
 * 播放位置、场景数据、可播判断与演出副作用全部通过适配器注入，
 * composable 只负责「从当前位置走到下一个可播放节点」的编排，
 * 因此寻址与跳过规则可以脱离播放器单独测试。
 */
import { nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

export type JumpResult = 'ok' | 'locked' | 'missing'

export interface DialogueLocation {
  sceneIndex: number
  dialogueIndex: number
}

/** 在所有场景里定位目标节点；找不到返回 null */
export const findDialogueLocation = (
  scenes: any[],
  allDialogues: Record<string, any[]>,
  targetId: any,
): DialogueLocation | null => {
  const target = Number(targetId)
  if (!Number.isFinite(target)) return null
  const list = scenes || []
  for (let sceneIndex = 0; sceneIndex < list.length; sceneIndex++) {
    const dialogues = allDialogues?.[list[sceneIndex]?.scene_id] || []
    const dialogueIndex = dialogues.findIndex((d: any) => Number(d?.content_id) === target)
    if (dialogueIndex >= 0) return { sceneIndex, dialogueIndex }
  }
  return null
}

/** 非「选择」节点上配置的自动跳转分支（不带选项文案且条件成立） */
export const findAutoJumpEdge = (
  branches: any[],
  dialogue: any,
  isConditionMet: (conditions: any) => boolean,
): any | null => {
  if (!dialogue || dialogue.content_type === '选择') return null
  const sourceId = Number(dialogue.content_id)
  const list = branches || []
  return list.find(b => (
    Number(b?.source_content_id) === sourceId
    && !(b?.choice_text || '').trim()
    && isConditionMet(b?.conditions)
  )) || null
}

/** 从 fromIndex 起找第一条可播放台词；全部不可播放时返回列表长度 */
export const nextPlayableDialogueIndex = (
  list: any[],
  fromIndex: number,
  isPlayable: (node: any) => boolean,
): number => {
  const items = list || []
  let index = Math.max(0, Number(fromIndex) || 0)
  while (index < items.length && !isPlayable(items[index])) index++
  return index
}

/** 从 fromIndex 起找第一个可播放且含可播放台词的场景；找不到时返回场景总数 */
export const nextPlayableSceneIndex = (
  scenes: any[],
  fromIndex: number,
  isScenePlayable: (sceneId: any) => boolean,
  hasPlayableDialogues: (sceneId: any) => boolean,
): number => {
  const list = scenes || []
  let index = Math.max(0, Number(fromIndex) || 0)
  while (index < list.length && (
    !isScenePlayable(list[index]?.scene_id) || !hasPlayableDialogues(list[index]?.scene_id)
  )) {
    index++
  }
  return index
}

export interface PlayerFlowContext {
  /** 全部场景 */
  getScenes: () => any[]
  /** scene_id → 该场景的台词列表 */
  getAllDialogues: () => Record<string, any[]>
  /** 剧情分支（branch_paths） */
  getBranches: () => any[]
  getCurrentDialogue: () => any
  getCurrentScene: () => any
  getCurrentSceneDialogues: () => any[]
  /** 历史对话，由调用方直接 push */
  getHistory: () => any[]
  /** 当前节点是否还有待选项（有选项时不允许推进） */
  hasChoices: () => boolean
  getSceneIndex: () => number
  setSceneIndex: (value: number) => void
  getDialogueIndex: () => number
  setDialogueIndex: (value: number) => void
  setShowDialogueBox: (value: boolean) => void
  scenePlayable: (sceneId: any) => boolean
  nodePlayable: (node: any) => boolean
  sceneHasPlayableDialogues: (sceneId: any) => boolean
  firstPlayableNodeIndex: (sceneId: any) => number
  evalCondition: (conditions: any) => boolean
  conditionText: (conditions: any) => string
  isDebugMode: () => boolean
  isPlaying: () => boolean
  isTyping: () => boolean
  isWaiting: () => boolean
  getAutoPlay: () => boolean
  setIsPlaying: (value: boolean) => void
  /** 逐字显示中第一次推进先补全整句 */
  finishTyping: () => void
  playBackgroundMusic: () => void
  stopBackgroundMusic: () => void
  scheduleAutoAdvance: () => void
  scheduleAutoAdvanceAfter: (ms: number) => void
  clearAutoTimer: () => void
  clearWait: () => void
  /** 活叙事：提交选择节点上的犹豫时长 */
  commitHesitation: () => void
  pushLineSnapshot: (snapshot?: any) => void
  captureLineSnapshot: () => any
  markVisitedEdge: (sourceId: any, targetId: any) => void
  logPlayEvent: (type: string, payload?: any) => void
  scheduleAchievementCheck: (force?: boolean) => void
  /** 全部场景播完后的返回首页 */
  goHome: () => void
  t: (key: string, params?: any) => string
}

export function usePlayerFlow(ctx: PlayerFlowContext) {
  /** 跳到指定剧情节点；返回 ok / locked / missing */
  const jumpToDialogue = (targetId: any): JumpResult => {
    const scenes = ctx.getScenes()
    const found = findDialogueLocation(scenes, ctx.getAllDialogues(), targetId)
    if (!found) return 'missing'

    const scene = scenes[found.sceneIndex]
    const dialogues = ctx.getAllDialogues()[scene?.scene_id] || []
    if (!ctx.scenePlayable(scene?.scene_id)) return 'locked'
    if (!ctx.isDebugMode() && !ctx.nodePlayable(dialogues[found.dialogueIndex])) return 'locked'

    ctx.setSceneIndex(found.sceneIndex)
    ctx.setDialogueIndex(found.dialogueIndex)
    ctx.setShowDialogueBox(true)
    nextTick(() => {
      if (!ctx.isPlaying()) return
      ctx.playBackgroundMusic()
      if (ctx.getAutoPlay()) ctx.scheduleAutoAdvance()
    })
    return 'ok'
  }

  /** 下一个场景 */
  const nextScene = () => {
    ctx.stopBackgroundMusic()

    const scenes = ctx.getScenes()
    const nextIndex = nextPlayableSceneIndex(
      scenes,
      ctx.getSceneIndex() + 1,
      (sceneId) => ctx.scenePlayable(sceneId),
      (sceneId) => ctx.sceneHasPlayableDialogues(sceneId),
    )

    if (nextIndex < scenes.length) {
      // 切换到下一个可播放场景，并从第一条条件满足的台词开始
      ctx.setSceneIndex(nextIndex)
      ctx.setDialogueIndex(ctx.firstPlayableNodeIndex(scenes[nextIndex]?.scene_id))
      nextTick(() => {
        if (!ctx.isPlaying()) return
        ctx.playBackgroundMusic()
        // 自动播放时继续自动推进，留一点间隔让场景先切换完
        if (ctx.getAutoPlay()) ctx.scheduleAutoAdvanceAfter(1000)
      })
      return
    }

    // 所有场景预览结束，弹出游戏结束提示
    ctx.logPlayEvent('finish', {
      scene_id: Number(ctx.getCurrentScene()?.scene_id) || null,
    })
    ctx.scheduleAchievementCheck(true)
    ctx.setIsPlaying(false)
    ElMessageBox.alert(ctx.t('ending.gameOverText'), ctx.t('ending.gameOverTitle'), {
      confirmButtonText: ctx.t('common.confirm'),
      callback: () => ctx.goHome(),
    })
  }

  /** 下一个对话 */
  const nextDialogue = () => {
    // 正在逐字显示时，第一次点击先把文字补全
    if (ctx.isTyping()) {
      ctx.finishTyping()
      return
    }
    // 演出「停顿」期间不允许推进
    if (ctx.isWaiting()) return
    // 「选择」节点必须等玩家点选项，不能自动往下走
    if (ctx.hasChoices()) return

    // 推进前记录当前位置，供「上一句」回退
    ctx.pushLineSnapshot()

    // 非「选择」节点若配置了自动跳转，播完本节点后直接跳过去
    const current = ctx.getCurrentDialogue()
    const edge = findAutoJumpEdge(ctx.getBranches(), current, (conditions) => ctx.evalCondition(conditions))
    if (edge) {
      const scene = ctx.getCurrentScene()
      ctx.markVisitedEdge(current.content_id, edge.target_content_id)
      ctx.getHistory().push({
        ...current,
        scene_id: scene.scene_id,
        scene_title: scene.title || '',
      })
      const result = jumpToDialogue(edge.target_content_id)
      if (result === 'ok') {
        ctx.setShowDialogueBox(true)
        return
      }
      if (result === 'locked') ElMessage.warning(ctx.t('toast.targetSceneLocked'))
    }

    const dialogues = ctx.getCurrentSceneDialogues()
    if (ctx.getDialogueIndex() < dialogues.length) {
      if (current) {
        const scene = ctx.getCurrentScene()
        ctx.getHistory().push({
          ...current,
          scene_id: scene.scene_id,
          scene_title: scene.title || '',
        })
      }

      // 跳过条件不满足的台词，直接推进到下一条可播放内容
      const nextIndex = nextPlayableDialogueIndex(
        dialogues,
        ctx.getDialogueIndex() + 1,
        (node) => ctx.nodePlayable(node),
      )
      ctx.setDialogueIndex(nextIndex)

      // 本场景没有更多可播放台词，进入下一场景
      if (nextIndex >= dialogues.length) nextScene()
    }
    ctx.setShowDialogueBox(true)
  }

  /** 选择分支：跳到目标节点所在的场景 / 位置 */
  const selectBranch = (branch: any) => {
    if (!branch) return
    if (branch.locked) {
      ElMessage.warning(ctx.t('choice.conditionNotMet', { cond: ctx.conditionText(branch.conditions) }))
      return
    }
    // 活叙事：记录玩家在这个选择节点上犹豫的秒数
    ctx.commitHesitation()
    ctx.clearWait()
    ctx.clearAutoTimer()
    // 先取回退点，等确认分支可跳转后再入栈
    const lineSnapshot = ctx.captureLineSnapshot()

    const current = ctx.getCurrentDialogue()
    if (current) {
      const scene = ctx.getCurrentScene()
      ctx.getHistory().push({
        ...current,
        scene_id: scene.scene_id,
        scene_title: scene.title || '',
        chosen: branch.choice_text || '',
        chosen_path_id: branch.path_id || null,
      })
      ctx.markVisitedEdge(current.content_id, branch.target_content_id)
      ctx.logPlayEvent('choice', {
        scene_id: Number(scene.scene_id) || null,
        content_id: Number(current.content_id) || null,
        path_id: Number(branch.path_id) || null,
        payload: {
          choice_text: branch.choice_text || '',
          target_content_id: Number(branch.target_content_id) || null,
        },
      })
    }

    const scenes = ctx.getScenes()
    const found = findDialogueLocation(scenes, ctx.getAllDialogues(), branch.target_content_id)
    if (!found) {
      ElMessage.warning(ctx.t('toast.branchMissing'))
      return
    }

    const scene = scenes[found.sceneIndex]
    const dialogues = ctx.getAllDialogues()[scene?.scene_id] || []
    const target = dialogues[found.dialogueIndex]
    if (!ctx.scenePlayable(scene?.scene_id)) {
      ElMessage.warning(ctx.t('toast.sceneLocked'))
      return
    }
    if (!ctx.nodePlayable(target)) {
      ElMessage.warning(ctx.t('toast.targetDialogueLocked', { cond: ctx.conditionText(target?.branch_condition) }))
      return
    }

    ctx.pushLineSnapshot(lineSnapshot)
    ctx.setSceneIndex(found.sceneIndex)
    ctx.setDialogueIndex(found.dialogueIndex)
    ctx.setShowDialogueBox(true)
    nextTick(() => {
      if (!ctx.isPlaying()) return
      ctx.playBackgroundMusic()
      if (ctx.getAutoPlay()) ctx.scheduleAutoAdvance()
    })
  }

  return { jumpToDialogue, nextDialogue, selectBranch, nextScene }
}
