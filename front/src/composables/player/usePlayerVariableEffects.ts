/**
 * 项目变量效果：按当前台词应用变量增减，以及周目重置。
 *
 * 这里只管「什么时候应用、应用后通知谁」，变量的定义、取值、夹取与持久化
 * 全部通过注入回调来自 usePlayerVariables；调试历史与断点来自 usePlayerDebugger。
 * 数值推演与变更收集被抽成纯函数，便于脱离视图直接验证。
 */

export interface VariableChangeNotice {
  label: string
  delta: number
}

export interface VariableChangeRecord {
  label: string
  before: number
  after: number
}

export interface VariableEffectPlan {
  next: Record<string, any>
  notices: VariableChangeNotice[]
  history: VariableChangeRecord[]
  touchedPersist: boolean
}

export interface VariableResetPlan {
  next: Record<string, any>
  history: VariableChangeRecord[]
}

export interface PlayerVariableEffectsContext {
  /** 当前停留的台词节点 */
  getCurrentDialogue: () => any
  getSceneIndex: () => number
  getDialogueIndex: () => number
  /** 台词去重标记：同一个节点只结算一次效果 */
  getLastEffectKey: () => string
  setLastEffectKey: (value: string) => void
  getProjectVariables: () => any[]
  getVariableEffects: () => any[]
  getVariableValues: () => Record<string, any>
  setVariableValues: (value: Record<string, any>) => void
  clampVariable: (v: any, value: any) => number
  initialValueOf: (v: any) => any
  syncProjectMeta: () => void
  pushVariableNotices: (items: VariableChangeNotice[]) => void
  pushVariableHistory: (label: string, before: number, after: number, reason: string) => void
  checkDebugBreakpoint: () => void
  scheduleAchievementCheck: () => void
}

// 逐条累加变量效果；只有真正发生位移的变量才产生浮层提示与调试历史
export const planVariableEffectChanges = (params: {
  effects: any[]
  projectVariables: any[]
  currentValues: Record<string, any>
  clamp: (v: any, value: any) => number
  reason: string
}): VariableEffectPlan => {
  const { effects, projectVariables, currentValues, clamp, reason } = params
  const next = { ...currentValues }
  const notices: VariableChangeNotice[] = []
  const history: VariableChangeRecord[] = []
  let touchedPersist = false

  for (const effect of effects) {
    const variable = projectVariables.find((x) => x.variable_id === effect.variable_id)
    if (!variable) continue
    const before = Number(next[variable.name] ?? variable.initial_value)
    const after = clamp(variable, before + Number(effect.delta))
    const delta = after - before
    if (delta !== 0) {
      const label = variable.label || variable.name
      notices.push({ label, delta })
      history.push({ label, before, after })
    }
    next[variable.name] = after
    if (variable.persist) touchedPersist = true
  }

  return { next, notices, history, touchedPersist }
}

// 周目重置：全部变量回到初始值，只把真正变了的记进调试历史
export const planVariableReset = (params: {
  projectVariables: any[]
  currentValues: Record<string, any>
  initialValueOf: (v: any) => any
}): VariableResetPlan => {
  const { projectVariables, currentValues, initialValueOf } = params
  const next: Record<string, any> = {}
  const history: VariableChangeRecord[] = []

  for (const variable of projectVariables) {
    next[variable.name] = initialValueOf(variable)
    const before = Number(currentValues[variable.name] ?? variable.initial_value)
    if (before !== next[variable.name]) {
      history.push({ label: variable.label || variable.name, before, after: next[variable.name] })
    }
  }

  return { next, history }
}

export function usePlayerVariableEffects(ctx: PlayerVariableEffectsContext) {
  const applyEffectsForCurrent = () => {
    const dialogue = ctx.getCurrentDialogue()
    if (!dialogue?.content_id) return

    const key = `${ctx.getSceneIndex()}:${ctx.getDialogueIndex()}:${dialogue.content_id}`
    if (key === ctx.getLastEffectKey()) return
    ctx.setLastEffectKey(key)

    const effects = (ctx.getVariableEffects() || []).filter((e) => e.content_id === dialogue.content_id)
    if (!effects.length) return

    const plan = planVariableEffectChanges({
      effects,
      projectVariables: ctx.getProjectVariables(),
      currentValues: ctx.getVariableValues(),
      clamp: (v, value) => ctx.clampVariable(v, value),
      reason: `节点 #${dialogue.content_id}`,
    })

    ctx.setVariableValues(plan.next)
    if (plan.touchedPersist) ctx.syncProjectMeta()
    for (const record of plan.history) {
      ctx.pushVariableHistory(record.label, record.before, record.after, `节点 #${dialogue.content_id}`)
    }
    if (plan.notices.length) ctx.pushVariableNotices(plan.notices)
    ctx.checkDebugBreakpoint()
    ctx.scheduleAchievementCheck()
  }

  const resetVariables = () => {
    const plan = planVariableReset({
      projectVariables: ctx.getProjectVariables(),
      currentValues: ctx.getVariableValues(),
      initialValueOf: (v) => ctx.initialValueOf(v),
    })

    ctx.setVariableValues(plan.next)
    ctx.setLastEffectKey('')
    for (const record of plan.history) {
      ctx.pushVariableHistory(record.label, record.before, record.after, '重置')
    }
    ctx.checkDebugBreakpoint()
  }

  return { applyEffectsForCurrent, resetVariables }
}
