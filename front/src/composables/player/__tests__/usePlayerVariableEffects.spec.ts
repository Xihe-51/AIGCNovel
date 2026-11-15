import { describe, it, expect, vi } from 'vitest'
import {
  planVariableEffectChanges,
  planVariableReset,
  usePlayerVariableEffects,
  type PlayerVariableEffectsContext,
} from '../usePlayerVariableEffects'

const clampByBounds = (v: any, value: any) => {
  let n = Number(value) || 0
  if (v.min_value !== null && v.min_value !== undefined) n = Math.max(Number(v.min_value), n)
  if (v.max_value !== null && v.max_value !== undefined) n = Math.min(Number(v.max_value), n)
  return n
}

const projectVariables = () => [
  { variable_id: 1, name: 'love', label: '好感', initial_value: 0, min_value: 0, max_value: 10 },
  { variable_id: 2, name: 'clue', label: '线索', initial_value: 0, persist: true },
]

const makeCtx = (overrides: Partial<PlayerVariableEffectsContext> = {}) => {
  const state: any = {
    dialogue: { content_id: 101 },
    sceneIndex: 0,
    dialogueIndex: 2,
    lastEffectKey: '',
    projectVariables: projectVariables(),
    variableEffects: [
      { content_id: 101, variable_id: 1, delta: 3 },
      { content_id: 101, variable_id: 2, delta: 1 },
    ],
    variableValues: { love: 0, clue: 0 } as Record<string, any>,
  }

  const ctx: PlayerVariableEffectsContext = {
    getCurrentDialogue: () => state.dialogue,
    getSceneIndex: () => state.sceneIndex,
    getDialogueIndex: () => state.dialogueIndex,
    getLastEffectKey: () => state.lastEffectKey,
    setLastEffectKey: vi.fn((value: string) => {
      state.lastEffectKey = value
    }),
    getProjectVariables: () => state.projectVariables,
    getVariableEffects: () => state.variableEffects,
    getVariableValues: () => state.variableValues,
    setVariableValues: vi.fn((value: Record<string, any>) => {
      state.variableValues = value
    }),
    clampVariable: clampByBounds,
    initialValueOf: (v: any) => v.initial_value,
    syncProjectMeta: vi.fn(),
    pushVariableNotices: vi.fn(),
    pushVariableHistory: vi.fn(),
    checkDebugBreakpoint: vi.fn(),
    scheduleAchievementCheck: vi.fn(),
    ...overrides,
  }

  return { ctx, state }
}

describe('planVariableEffectChanges', () => {
  it('按效果顺序累加，产出浮层提示与调试历史', () => {
    const plan = planVariableEffectChanges({
      effects: [
        { variable_id: 1, delta: 3 },
        { variable_id: 2, delta: 1 },
      ],
      projectVariables: projectVariables(),
      currentValues: { love: 0, clue: 0 },
      clamp: clampByBounds,
      reason: '节点 #101',
    })

    expect(plan.next).toEqual({ love: 3, clue: 1 })
    expect(plan.notices).toEqual([
      { label: '好感', delta: 3 },
      { label: '线索', delta: 1 },
    ])
    expect(plan.history).toEqual([
      { label: '好感', before: 0, after: 3 },
      { label: '线索', before: 0, after: 1 },
    ])
    expect(plan.touchedPersist).toBe(true)
  })

  it('夹取到上限后位移为 0 时不记录浮层与历史，但仍写入目标值', () => {
    const plan = planVariableEffectChanges({
      effects: [{ variable_id: 1, delta: 5 }],
      projectVariables: projectVariables(),
      currentValues: { love: 10 },
      clamp: clampByBounds,
      reason: '节点 #101',
    })

    expect(plan.next.love).toBe(10)
    expect(plan.notices).toEqual([])
    expect(plan.history).toEqual([])
  })

  it('部分被夹取时按实际位移记录', () => {
    const plan = planVariableEffectChanges({
      effects: [{ variable_id: 1, delta: 5 }],
      projectVariables: projectVariables(),
      currentValues: { love: 8 },
      clamp: clampByBounds,
      reason: '节点 #101',
    })

    expect(plan.next.love).toBe(10)
    expect(plan.notices).toEqual([{ label: '好感', delta: 2 }])
  })

  it('未知变量 ID 被跳过且不影响其他效果', () => {
    const plan = planVariableEffectChanges({
      effects: [
        { variable_id: 999, delta: 7 },
        { variable_id: 1, delta: 2 },
      ],
      projectVariables: projectVariables(),
      currentValues: { love: 0 },
      clamp: clampByBounds,
      reason: '节点 #101',
    })

    expect(plan.next).toEqual({ love: 2 })
    expect(plan.notices).toEqual([{ label: '好感', delta: 2 }])
    expect(plan.touchedPersist).toBe(false)
  })

  it('缺失当前值的变量以初始值起算', () => {
    const plan = planVariableEffectChanges({
      effects: [{ variable_id: 2, delta: 4 }],
      projectVariables: projectVariables(),
      currentValues: {},
      clamp: clampByBounds,
      reason: '节点 #101',
    })

    expect(plan.next).toEqual({ clue: 4 })
    expect(plan.touchedPersist).toBe(true)
  })
})

describe('planVariableReset', () => {
  it('全部回到初始值，只记录真正发生变化的变量', () => {
    const plan = planVariableReset({
      projectVariables: projectVariables(),
      currentValues: { love: 4, clue: 0 },
      initialValueOf: (v: any) => v.initial_value,
    })

    expect(plan.next).toEqual({ love: 0, clue: 0 })
    expect(plan.history).toEqual([{ label: '好感', before: 4, after: 0 }])
  })

  it('数值未变化时不产生历史', () => {
    const plan = planVariableReset({
      projectVariables: projectVariables(),
      currentValues: { love: 0, clue: 0 },
      initialValueOf: (v: any) => v.initial_value,
    })

    expect(plan.history).toEqual([])
  })
})

describe('usePlayerVariableEffects / applyEffectsForCurrent', () => {
  it('同一节点只结算一次', () => {
    const { ctx } = makeCtx()
    const api = usePlayerVariableEffects(ctx)

    api.applyEffectsForCurrent()
    api.applyEffectsForCurrent()

    expect(ctx.setVariableValues).toHaveBeenCalledTimes(1)
    expect(ctx.setLastEffectKey).toHaveBeenCalledTimes(1)
    expect(ctx.setLastEffectKey).toHaveBeenCalledWith('0:2:101')
  })

  it('没有台词 ID 时直接返回，不写去重标记', () => {
    const { ctx, state } = makeCtx()
    state.dialogue = {}
    const api = usePlayerVariableEffects(ctx)

    api.applyEffectsForCurrent()

    expect(ctx.setLastEffectKey).not.toHaveBeenCalled()
    expect(ctx.setVariableValues).not.toHaveBeenCalled()
  })

  it('当前节点没有变量效果时只标记，不改值', () => {
    const { ctx } = makeCtx({ getVariableEffects: () => [] })
    const api = usePlayerVariableEffects(ctx)

    api.applyEffectsForCurrent()

    expect(ctx.setLastEffectKey).toHaveBeenCalledWith('0:2:101')
    expect(ctx.setVariableValues).not.toHaveBeenCalled()
    expect(ctx.syncProjectMeta).not.toHaveBeenCalled()
  })

  it('完整链路：写值、持久化同步、历史、浮层、断点与成就检查', () => {
    const { ctx } = makeCtx()
    const api = usePlayerVariableEffects(ctx)

    api.applyEffectsForCurrent()

    expect(ctx.setVariableValues).toHaveBeenCalledWith({ love: 3, clue: 1 })
    expect(ctx.syncProjectMeta).toHaveBeenCalledTimes(1)
    expect(ctx.pushVariableHistory).toHaveBeenCalledTimes(2)
    expect(ctx.pushVariableHistory).toHaveBeenNthCalledWith(1, '好感', 0, 3, '节点 #101')
    expect(ctx.pushVariableHistory).toHaveBeenNthCalledWith(2, '线索', 0, 1, '节点 #101')
    expect(ctx.pushVariableNotices).toHaveBeenCalledWith([
      { label: '好感', delta: 3 },
      { label: '线索', delta: 1 },
    ])
    expect(ctx.checkDebugBreakpoint).toHaveBeenCalledTimes(1)
    expect(ctx.scheduleAchievementCheck).toHaveBeenCalledTimes(1)
  })

  it('没有持久化变量时不触发元数据同步', () => {
    const { ctx, state } = makeCtx()
    state.projectVariables = [projectVariables()[0]]
    state.variableEffects = [{ content_id: 101, variable_id: 1, delta: 3 }]
    const api = usePlayerVariableEffects(ctx)

    api.applyEffectsForCurrent()

    expect(ctx.syncProjectMeta).not.toHaveBeenCalled()
  })

  it('全部被夹取而无数值位移时不下发浮层', () => {
    const { ctx, state } = makeCtx({
      getVariableEffects: () => [{ content_id: 101, variable_id: 1, delta: 3 }],
    })
    state.variableValues = { love: 10 }
    const api = usePlayerVariableEffects(ctx)

    api.applyEffectsForCurrent()

    expect(ctx.pushVariableNotices).not.toHaveBeenCalled()
    expect(ctx.checkDebugBreakpoint).toHaveBeenCalledTimes(1)
  })
})

describe('usePlayerVariableEffects / resetVariables', () => {
  it('重置数值、清空去重标记并写重置历史', () => {
    const { ctx, state } = makeCtx()
    state.variableValues = { love: 6, clue: 2 }
    state.lastEffectKey = '0:2:101'
    const api = usePlayerVariableEffects(ctx)

    api.resetVariables()

    expect(ctx.setVariableValues).toHaveBeenCalledWith({ love: 0, clue: 0 })
    expect(ctx.setLastEffectKey).toHaveBeenCalledWith('')
    expect(ctx.pushVariableHistory).toHaveBeenCalledTimes(2)
    expect(ctx.pushVariableHistory).toHaveBeenNthCalledWith(1, '好感', 6, 0, '重置')
  })

  it('即使没有变化也检查断点，且不写历史', () => {
    const { ctx } = makeCtx()
    const api = usePlayerVariableEffects(ctx)

    api.resetVariables()

    expect(ctx.pushVariableHistory).not.toHaveBeenCalled()
    expect(ctx.checkDebugBreakpoint).toHaveBeenCalledTimes(1)
  })
})
