/**
 * 玩家侧结局：结局清单装载、到达结局节点判定与结局弹窗触发。
 *
 * 条件求值、埋点、成就检查与打字机清理全部通过注入获取，
 * composable 只持有结局域自身状态，不参与播放流程编排。
 */
import { ref } from 'vue'
import { listEndings, unlockEnding } from '@/api/ending'
import type { Ending } from '@/api/ending'

export interface PlayerEndingContext {
  projectId: () => number
  getCurrentDialogue: () => any
  getCurrentScene: () => any
  evalCondition: (condition: any) => boolean
  logPlayEvent: (event: string, payload: Record<string, any>) => void
  scheduleAchievementCheck: () => void
  clearTyping: () => void
  clearAutoTimer: () => void
}

// 结局附加条件全部成立才算命中
export function endingConditionsMet(
  ending: Pick<Ending, 'conditions'> | null | undefined,
  evalCondition: (condition: any) => boolean
): boolean {
  const conditions = ending?.conditions || []
  return conditions.every(condition => evalCondition(condition))
}

// 当前节点上是否有可触发（同一节点 / 未触发过 / 条件成立）的结局
export function findReachableEnding(
  contentId: number | string | null | undefined,
  endings: Ending[],
  triggered: Set<number>,
  matches: (ending: Ending) => boolean
): Ending | null {
  const id = Number(contentId)
  if (!id || !endings.length) return null
  for (const ending of endings) {
    if (Number(ending.content_id) !== id) continue
    if (triggered.has(ending.ending_id)) continue
    if (!matches(ending)) continue
    return ending
  }
  return null
}

export function usePlayerEnding(ctx: PlayerEndingContext) {
  const endings = ref<Ending[]>([])
  const triggeredEndings = ref<Set<number>>(new Set())
  const endingDialogVisible = ref(false)
  const currentEnding = ref<Ending | null>(null)

  const loadEndings = async () => {
    try {
      endings.value = await listEndings(ctx.projectId())
    } catch (e) {
      console.warn('读取结局失败:', e)
      endings.value = []
    }
  }

  const endingMatches = (ending: Ending) => endingConditionsMet(ending, ctx.evalCondition)

  const triggerEnding = async (ending: Ending) => {
    triggeredEndings.value.add(ending.ending_id)
    const endingRow = endings.value.find(e => Number(e.ending_id) === Number(ending.ending_id))
    if (endingRow) endingRow.unlocked = true
    const dialogue = ctx.getCurrentDialogue()
    const scene = ctx.getCurrentScene()
    ctx.logPlayEvent('ending', {
      ending_id: Number(ending.ending_id) || null,
      content_id: Number(dialogue?.content_id) || null,
      scene_id: Number(scene?.scene_id) || null,
    })
    ctx.scheduleAchievementCheck()
    currentEnding.value = ending
    endingDialogVisible.value = true
    ctx.clearTyping()
    ctx.clearAutoTimer()
    try {
      await unlockEnding(ctx.projectId(), ending.ending_id)
    } catch (e) {
      console.warn('记录结局失败:', e)
    }
  }

  const checkEndingForCurrent = () => {
    const ending = findReachableEnding(
      ctx.getCurrentDialogue()?.content_id,
      endings.value,
      triggeredEndings.value,
      endingMatches
    )
    if (!ending) return false
    triggerEnding(ending)
    return true
  }

  // 重开 / 下一周目：清空已触发结局并关闭结局页
  const resetEndings = () => {
    triggeredEndings.value = new Set()
    endingDialogVisible.value = false
  }

  return {
    endings,
    triggeredEndings,
    endingDialogVisible,
    currentEnding,
    loadEndings,
    endingMatches,
    checkEndingForCurrent,
    triggerEnding,
    resetEndings,
  }
}
