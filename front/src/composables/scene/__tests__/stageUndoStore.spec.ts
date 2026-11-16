import { describe, expect, it } from 'vitest'
import {
  STAGE_UNDO_LIMIT,
  createStageUndoEntry,
  directivesFingerprint,
  isStageUndoRestorable,
  snapshotDirectiveRows,
  stageUndoStorageKey,
} from '@/composables/scene/stageUndoStore'

const rows = (over: any[] = []) => [
  { directive_id: 2, directive_type: 'avatar', order_num: 1, payload: { layer_id: 'left' } },
  { directive_id: 1, directive_type: 'stage', order_num: 0, payload: { bg: true } },
  ...over,
]

describe('stageUndoStorageKey', () => {
  it('按项目与台词拼接，便于按台词清理', () => {
    expect(stageUndoStorageKey(7, 101)).toBe('aigc:stageUndo:7:101')
  })

  it('数字与字符串入参生成同一个键', () => {
    expect(stageUndoStorageKey('7', '101')).toBe(stageUndoStorageKey(7, 101))
  })
})

describe('directivesFingerprint', () => {
  it('与指令顺序无关', () => {
    const a = directivesFingerprint(rows())
    const b = directivesFingerprint([...rows()].reverse())
    expect(a).toBe(b)
  })

  it('只看四个关键字段，其它字段变化不改变指纹', () => {
    const extra = rows().map(r => ({ ...r, localDirty: true }))
    expect(directivesFingerprint(extra)).toBe(directivesFingerprint(rows()))
  })

  it('payload 变化会改变指纹', () => {
    const changed = rows()
    changed[0].payload = { layer_id: 'right' }
    expect(directivesFingerprint(changed)).not.toBe(directivesFingerprint(rows()))
  })

  it('order_num 变化会改变指纹', () => {
    const changed = rows()
    changed[1].order_num = 5
    expect(directivesFingerprint(changed)).not.toBe(directivesFingerprint(rows()))
  })

  it('空数组得到稳定指纹', () => {
    expect(directivesFingerprint([])).toBe('[]')
  })
})

describe('snapshotDirectiveRows', () => {
  it('只保留四个关键字段', () => {
    const [first] = snapshotDirectiveRows([{ ...rows()[0], noise: 1 }])
    expect(Object.keys(first).sort()).toEqual(['directive_id', 'directive_type', 'order_num', 'payload'])
  })

  it('payload 是浅拷贝，改动快照不会污染预览模型', () => {
    const source = [{ directive_id: 1, directive_type: 'avatar', order_num: 0, payload: { x: 10 } }]
    const [snap] = snapshotDirectiveRows(source)
    snap.payload.x = 90
    expect(source[0].payload.x).toBe(10)
  })

  it('payload 缺失时补空对象', () => {
    const [snap] = snapshotDirectiveRows([{ directive_id: 1, directive_type: 'stage', order_num: 0 }])
    expect(snap.payload).toEqual({})
  })

  it('入参为空时返回空数组', () => {
    expect(snapshotDirectiveRows(undefined as any)).toEqual([])
  })
})

describe('createStageUndoEntry', () => {
  it('baseline 为快照时刻的指纹', () => {
    const entry = createStageUndoEntry(101, rows())
    expect(entry.baseline).toBe(directivesFingerprint(rows()))
    expect(entry.contentId).toBe(101)
    expect(typeof entry.at).toBe('number')
  })

  it('传入 afterRows 才记录 after 指纹', () => {
    expect(createStageUndoEntry(101, rows()).after).toBeUndefined()
    expect(createStageUndoEntry(101, rows(), rows()).after).toBe(directivesFingerprint(rows()))
  })
})

describe('isStageUndoRestorable', () => {
  const current = directivesFingerprint(rows())

  it('无 after 且当前仍是操作前状态时可恢复', () => {
    expect(isStageUndoRestorable({ rows: [], baseline: current }, current)).toBe(true)
  })

  it('有 after 且当前处于操作后状态时可恢复', () => {
    expect(isStageUndoRestorable({ rows: [], baseline: 'B', after: current }, current)).toBe(true)
  })

  it('有 after 但当前仍停在操作前，说明没生效，不恢复', () => {
    expect(isStageUndoRestorable({ rows: [], baseline: current, after: 'A' }, current)).toBe(false)
  })

  it('服务端被别的入口改过则失效', () => {
    expect(isStageUndoRestorable({ rows: [], baseline: 'B', after: 'A' }, current)).toBe(false)
  })

  it('rows 不是数组时视为脏数据', () => {
    expect(isStageUndoRestorable({ rows: null, baseline: current }, current)).toBe(false)
    expect(isStageUndoRestorable(null, current)).toBe(false)
  })
})

describe('STAGE_UNDO_LIMIT', () => {
  it('保留 20 步', () => {
    expect(STAGE_UNDO_LIMIT).toBe(20)
  })
})
