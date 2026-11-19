/**
 * 播放器条件求值：单条件比较、条件组、场景剧情锁、台词级显示条件。
 *
 * 纯读逻辑，只依赖变量定义与当前值，不做任何写入，
 * 便于单独测试 —— 条件判断错了会让台词被静默跳过，是最需要测试兜底的一块。
 */
import type { Ref } from 'vue'

export interface PlayerConditionsContext {
  /** 项目变量定义（含 label / initial_value / min_value / max_value） */
  projectVariables: Ref<any[]>
  /** 当前变量值 */
  variableValues: Ref<Record<string, any>>
  /** 场景剧情锁：{ [sceneId]: condition } */
  sceneLocks: Ref<Record<string, any>>
  /** 全部场景的台词：{ [sceneId]: dialogues[] } */
  allDialogues: Ref<Record<string | number, any[]>>
}

export function usePlayerConditions(ctx: PlayerConditionsContext) {
  const evalSingleCondition = (cond: any): boolean => {
    if (!cond || !cond.variable) return true
    const v = ctx.projectVariables.value.find(x => x.name === cond.variable)
    if (!v) return false
    const current = Number(ctx.variableValues.value[cond.variable] ?? v.initial_value)
    const target = Number(cond.value)
    switch (cond.op) {
      case '>': return current > target
      case '>=': return current >= target
      case '<': return current < target
      case '<=': return current <= target
      case '==': return current === target
      case '!=': return current !== target
      default: return false
    }
  }

  // 兼容单条件 {variable,op,value} 与条件组 {mode:'and'|'or', items:[...]}
  const evalCondition = (cond: any): boolean => {
    if (!cond || typeof cond !== 'object') return true
    if (Array.isArray(cond.items)) {
      const items = cond.items.filter((c: any) => c && c.variable)
      if (!items.length) return true
      return cond.mode === 'or'
        ? items.some(evalSingleCondition)
        : items.every(evalSingleCondition)
    }
    return evalSingleCondition(cond)
  }

  // 场景播放条件（剧情锁）
  const scenePlayable = (sceneId: number | string): boolean =>
    evalCondition(ctx.sceneLocks.value[String(sceneId)] || null)

  // 台词级显示条件：未配置或条件满足时才会播放
  const nodePlayable = (node: any): boolean => evalCondition(node?.branch_condition || null)

  // 从 from 开始找下一条可播放台词；返回列表长度表示本场景没有更多可播放内容
  const firstPlayableNodeIndex = (sceneId: number | string, from = 0): number => {
    const list = ctx.allDialogues.value[sceneId] || []
    for (let i = Math.max(0, from); i < list.length; i++) {
      if (nodePlayable(list[i])) return i
    }
    return list.length
  }

  // 场景内至少有一条条件满足的台词
  const sceneHasPlayableDialogues = (sceneId: number | string): boolean => (
    firstPlayableNodeIndex(sceneId) < (ctx.allDialogues.value[sceneId] || []).length
  )

  // 把条件对象描述成「林瑶好感度 ≥ 5 且 线索数 ≥ 1」，用于锁定提示
  const conditionText = (cond: any): string => {
    if (!cond || typeof cond !== 'object') return ''
    const items = Array.isArray(cond.items)
      ? cond.items.filter((c: any) => c && c.variable)
      : (cond.variable ? [cond] : [])
    if (!items.length) return ''
    const opLabels: Record<string, string> = { '>': '>', '>=': '≥', '<': '<', '<=': '≤', '==': '=', '!=': '≠' }
    const parts = items.map((c: any) => {
      const v = ctx.projectVariables.value.find(x => x.name === c.variable)
      return `${v?.label || c.variable} ${opLabels[c.op] || c.op} ${c.value}`
    })
    return parts.join(cond.mode === 'or' ? ' 或 ' : ' 且 ')
  }

  return {
    evalSingleCondition,
    evalCondition,
    scenePlayable,
    nodePlayable,
    firstPlayableNodeIndex,
    sceneHasPlayableDialogues,
    conditionText,
  }
}
