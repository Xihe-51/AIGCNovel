import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { usePlayerConditions } from '@/composables/player/usePlayerConditions'

const VARIABLES = [
  { name: 'favor', label: '林瑶好感度', initial_value: 5, min_value: 0, max_value: 10 },
  { name: 'clues', label: '线索数', initial_value: 0, min_value: 0, max_value: 99 },
]

function createConditions(options: {
  variables?: any[]
  values?: Record<string, any>
  locks?: Record<string, any>
  dialogues?: Record<string | number, any[]>
} = {}) {
  return usePlayerConditions({
    projectVariables: ref(options.variables ?? VARIABLES),
    variableValues: ref(options.values ?? {}),
    sceneLocks: ref(options.locks ?? {}),
    allDialogues: ref(options.dialogues ?? {}),
  })
}

describe('usePlayerConditions / evalSingleCondition', () => {
  it('没有条件对象时视为通过', () => {
    const c = createConditions()
    expect(c.evalSingleCondition(null)).toBe(true)
    expect(c.evalSingleCondition(undefined)).toBe(true)
    expect(c.evalSingleCondition({})).toBe(true)
  })

  it('变量未定义时视为不通过', () => {
    const c = createConditions()
    expect(c.evalSingleCondition({ variable: 'unknown', op: '>=', value: 1 })).toBe(false)
  })

  it('六个比较运算符都按数值比较', () => {
    const c = createConditions({ values: { favor: 5 } })
    expect(c.evalSingleCondition({ variable: 'favor', op: '>', value: 4 })).toBe(true)
    expect(c.evalSingleCondition({ variable: 'favor', op: '>', value: 5 })).toBe(false)
    expect(c.evalSingleCondition({ variable: 'favor', op: '>=', value: 5 })).toBe(true)
    expect(c.evalSingleCondition({ variable: 'favor', op: '<', value: 6 })).toBe(true)
    expect(c.evalSingleCondition({ variable: 'favor', op: '<=', value: 5 })).toBe(true)
    expect(c.evalSingleCondition({ variable: 'favor', op: '==', value: 5 })).toBe(true)
    expect(c.evalSingleCondition({ variable: 'favor', op: '!=', value: 5 })).toBe(false)
  })

  it('未知运算符一律不通过', () => {
    const c = createConditions({ values: { favor: 5 } })
    expect(c.evalSingleCondition({ variable: 'favor', op: '~', value: 5 })).toBe(false)
  })

  it('变量没有当前值时回退到 initial_value', () => {
    const c = createConditions({ values: {} })
    expect(c.evalSingleCondition({ variable: 'favor', op: '==', value: 5 })).toBe(true)
    expect(c.evalSingleCondition({ variable: 'clues', op: '==', value: 5 })).toBe(false)
  })

  it('当前值是字符串时按数值比较', () => {
    const c = createConditions({ values: { favor: '7' } })
    expect(c.evalSingleCondition({ variable: 'favor', op: '>=', value: 7 })).toBe(true)
  })
})

describe('usePlayerConditions / evalCondition', () => {
  it('非对象条件视为通过', () => {
    const c = createConditions()
    expect(c.evalCondition(null)).toBe(true)
    expect(c.evalCondition(undefined)).toBe(true)
    expect(c.evalCondition('x' as any)).toBe(true)
  })

  it('条件组默认按 and 组合', () => {
    const c = createConditions({ values: { favor: 5, clues: 2 } })
    expect(c.evalCondition({
      items: [
        { variable: 'favor', op: '>=', value: 5 },
        { variable: 'clues', op: '>=', value: 2 },
      ],
    })).toBe(true)
    expect(c.evalCondition({
      items: [
        { variable: 'favor', op: '>=', value: 5 },
        { variable: 'clues', op: '>=', value: 3 },
      ],
    })).toBe(false)
  })

  it('条件组 mode=or 时任一满足即通过', () => {
    const c = createConditions({ values: { favor: 5, clues: 0 } })
    expect(c.evalCondition({
      mode: 'or',
      items: [
        { variable: 'favor', op: '>=', value: 9 },
        { variable: 'clues', op: '>=', value: 0 },
      ],
    })).toBe(true)
  })

  it('条件组里没有有效条目时视为通过', () => {
    const c = createConditions()
    expect(c.evalCondition({ items: [] })).toBe(true)
    expect(c.evalCondition({ items: [{ op: '>=' }] })).toBe(true)
  })

  it('单个条件对象直接求值', () => {
    const c = createConditions({ values: { favor: 5 } })
    expect(c.evalCondition({ variable: 'favor', op: '>=', value: 5 })).toBe(true)
  })
})

describe('usePlayerConditions / 场景与台词', () => {
  it('没有剧情锁时场景可播放', () => {
    const c = createConditions()
    expect(c.scenePlayable(1)).toBe(true)
  })

  it('剧情锁按 sceneId 字符串取值', () => {
    const c = createConditions({
      values: { favor: 1 },
      locks: { 3: { variable: 'favor', op: '>=', value: 5 } },
    })
    expect(c.scenePlayable(3)).toBe(false)
    expect(c.scenePlayable(4)).toBe(true)
  })

  it('台词没有 branch_condition 时可播放', () => {
    const c = createConditions()
    expect(c.nodePlayable({ content_id: 1 })).toBe(true)
    expect(c.nodePlayable(null)).toBe(true)
  })

  it('firstPlayableNodeIndex 跳过条件不满足的台词', () => {
    const c = createConditions({
      values: { favor: 0 },
      dialogues: {
        2: [
          { content_id: 1, branch_condition: { variable: 'favor', op: '>=', value: 5 } },
          { content_id: 2 },
          { content_id: 3 },
        ],
      },
    })
    expect(c.firstPlayableNodeIndex(2)).toBe(1)
  })

  it('firstPlayableNodeIndex 支持 from 偏移', () => {
    const c = createConditions({
      values: { favor: 0 },
      dialogues: { 2: [{ content_id: 1 }, { content_id: 2, branch_condition: { variable: 'favor', op: '>=', value: 5 } }, { content_id: 3 }] },
    })
    expect(c.firstPlayableNodeIndex(2, 1)).toBe(2)
  })

  it('全部台词都被条件挡住时返回列表长度', () => {
    const c = createConditions({
      values: { favor: 0 },
      dialogues: { 2: [{ content_id: 1, branch_condition: { variable: 'favor', op: '>=', value: 5 } }] },
    })
    expect(c.firstPlayableNodeIndex(2)).toBe(1)
    expect(c.sceneHasPlayableDialogues(2)).toBe(false)
  })

  it('场景不存在台词时视为没有可播放内容', () => {
    const c = createConditions()
    expect(c.firstPlayableNodeIndex(99)).toBe(0)
    expect(c.sceneHasPlayableDialogues(99)).toBe(false)
  })

  it('有可播放台词时 sceneHasPlayableDialogues 为真', () => {
    const c = createConditions({ dialogues: { 1: [{ content_id: 1 }] } })
    expect(c.sceneHasPlayableDialogues(1)).toBe(true)
  })
})

describe('usePlayerConditions / conditionText', () => {
  it('无条件时返回空串', () => {
    const c = createConditions()
    expect(c.conditionText(null)).toBe('')
    expect(c.conditionText({ items: [] })).toBe('')
    expect(c.conditionText({})).toBe('')
  })

  it('单个条件用变量 label 描述，并把 >= 显示成 ≥', () => {
    const c = createConditions()
    expect(c.conditionText({ variable: 'favor', op: '>=', value: 5 })).toBe('林瑶好感度 ≥ 5')
  })

  it('条件组按 and/or 拼接', () => {
    const c = createConditions()
    const andCond = {
      items: [
        { variable: 'favor', op: '>=', value: 5 },
        { variable: 'clues', op: '!=', value: 0 },
      ],
    }
    expect(c.conditionText(andCond)).toBe('林瑶好感度 ≥ 5 且 线索数 ≠ 0')
    expect(c.conditionText({ ...andCond, mode: 'or' })).toBe('林瑶好感度 ≥ 5 或 线索数 ≠ 0')
  })

  it('变量定义缺失时回退到变量名', () => {
    const c = createConditions()
    expect(c.conditionText({ variable: 'ghost', op: '==', value: 1 })).toBe('ghost = 1')
  })
})
