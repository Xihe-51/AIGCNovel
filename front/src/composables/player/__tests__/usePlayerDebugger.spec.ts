import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import {
  usePlayerDebugger,
  DEBUG_HISTORY_LIMIT,
  DEBUG_SNAPSHOT_LIMIT,
} from '@/composables/player/usePlayerDebugger'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn() },
}))

function createDebugger(overrides: Partial<Parameters<typeof usePlayerDebugger>[0]> = {}) {
  const state = {
    debug: true,
    dialogue: { content_id: 10 } as any,
    variables: [{ name: 'hp', label: '生命', initial_value: 100 }],
    values: { hp: 80 } as Record<string, any>,
    sceneIndex: 1,
    dialogueIndex: 2,
    visited: [10, 11],
    conditionHit: true,
    clearLineSnapshots: vi.fn(),
    startTyping: vi.fn(),
    restoreVisited: vi.fn(),
    autoPlay: true,
    panelVisible: false,
  }

  const dbg = usePlayerDebugger({
    projectId: () => 7,
    debugMode: () => state.debug,
    getCurrentDialogue: () => state.dialogue,
    getProjectVariables: () => state.variables,
    getVariableValues: () => state.values,
    getSceneIndex: () => state.sceneIndex,
    getDialogueIndex: () => state.dialogueIndex,
    getVisited: () => [...state.visited],
    evalSingleCondition: () => state.conditionHit,
    restoreVisited: (ids) => state.restoreVisited(ids),
    clearLineSnapshots: () => state.clearLineSnapshots(),
    startTyping: () => state.startTyping(),
    setAutoPlay: (value) => { state.autoPlay = value },
    setPanelVisible: (value) => { state.panelVisible = value },
    setSceneIndex: (value) => { state.sceneIndex = value },
    setDialogueIndex: (value) => { state.dialogueIndex = value },
    setVariableValues: (value) => { state.values = value },
    ...overrides,
  })

  return { ...dbg, state }
}

describe('usePlayerDebugger', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(ElMessage.success).mockReset()
    vi.mocked(ElMessage.warning).mockReset()
  })

  it('非调试模式不记录变量历史', () => {
    const dbg = createDebugger()
    dbg.state.debug = false

    dbg.pushVariableHistory('生命', 100, 90, '手动调试')

    expect(dbg.variableHistory.value).toEqual([])
  })

  it('变量历史按最新在前并截断到上限', () => {
    const dbg = createDebugger()

    for (let i = 0; i < DEBUG_HISTORY_LIMIT + 5; i += 1) {
      dbg.pushVariableHistory('生命', i, i + 1, '节点')
    }

    expect(dbg.variableHistory.value).toHaveLength(DEBUG_HISTORY_LIMIT)
    expect(dbg.variableHistory.value[0]).toMatchObject({
      label: '生命',
      from: DEBUG_HISTORY_LIMIT + 4,
      to: DEBUG_HISTORY_LIMIT + 5,
      reason: '节点',
    })
  })

  it('条件断点命中后记录文本、关闭断点并暂停自动播放', () => {
    const dbg = createDebugger()
    dbg.debugBreakpoint.value = { enabled: true, variable: 'hp', op: '<=', value: 80 }

    dbg.checkDebugBreakpoint()

    expect(dbg.debugBreakpointHit.value).toBe('#10 生命 <= 80（当前 80）')
    expect(dbg.debugBreakpoint.value.enabled).toBe(false)
    expect(dbg.state.autoPlay).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalledWith('条件断点命中：#10 生命 <= 80（当前 80）')
  })

  it('条件断点未启用 / 变量不存在 / 条件不成立时命中不触发', () => {
    const dbg = createDebugger()

    dbg.debugBreakpoint.value = { enabled: false, variable: 'hp', op: '>=', value: 0 }
    dbg.checkDebugBreakpoint()
    expect(dbg.debugBreakpointHit.value).toBe('')

    dbg.debugBreakpoint.value = { enabled: true, variable: ' mp ', op: '>=', value: 0 }
    dbg.checkDebugBreakpoint()
    expect(dbg.debugBreakpointHit.value).toBe('')

    dbg.debugBreakpoint.value = { enabled: true, variable: 'hp', op: '>=', value: 0 }
    dbg.state.conditionHit = false
    dbg.checkDebugBreakpoint()
    expect(dbg.debugBreakpointHit.value).toBe('')
    expect(ElMessage.warning).not.toHaveBeenCalled()

    dbg.state.debug = false
    dbg.state.conditionHit = true
    dbg.checkDebugBreakpoint()
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  it('非调试模式不读取快照', () => {
    localStorage.setItem('aigc:debugSnapshots:7', JSON.stringify([{ id: 1 }]))
    const dbg = createDebugger()
    dbg.state.debug = false

    dbg.loadDebugSnapshots()

    expect(dbg.debugSnapshots.value).toEqual([])
  })

  it('读取快照并截断到上限，损坏数据视为空', () => {
    localStorage.setItem(
      'aigc:debugSnapshots:7',
      JSON.stringify(Array.from({ length: DEBUG_SNAPSHOT_LIMIT + 3 }, (_, i) => ({ id: i })))
    )
    const dbg = createDebugger()

    dbg.loadDebugSnapshots()
    expect(dbg.debugSnapshots.value).toHaveLength(DEBUG_SNAPSHOT_LIMIT)

    localStorage.setItem('aigc:debugSnapshots:7', 'not-json')
    dbg.loadDebugSnapshots()
    expect(dbg.debugSnapshots.value).toEqual([])
  })

  it('保存快照会采集当前位置与变量并落盘', () => {
    const dbg = createDebugger()

    dbg.saveDebugSnapshot()

    expect(dbg.debugSnapshots.value).toHaveLength(1)
    expect(dbg.debugSnapshots.value[0]).toMatchObject({
      node: 10,
      sceneIndex: 1,
      dialogueIndex: 2,
      variables: { hp: 80 },
      visited: [10, 11],
    })
    const stored = JSON.parse(localStorage.getItem('aigc:debugSnapshots:7') || '[]')
    expect(stored).toHaveLength(1)
    expect(ElMessage.success).toHaveBeenCalledWith('已保存状态快照')
  })

  it('非调试模式不保存快照', () => {
    const dbg = createDebugger()
    dbg.state.debug = false

    dbg.saveDebugSnapshot()

    expect(dbg.debugSnapshots.value).toEqual([])
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('保存快照最多保留上限条', () => {
    const dbg = createDebugger()

    for (let i = 0; i < DEBUG_SNAPSHOT_LIMIT + 2; i += 1) dbg.saveDebugSnapshot()

    expect(dbg.debugSnapshots.value).toHaveLength(DEBUG_SNAPSHOT_LIMIT)
  })

  it('恢复快照会回写位置、变量、已走节点并重新打字', async () => {
    const dbg = createDebugger()
    const snap = {
      sceneIndex: 3,
      dialogueIndex: 4,
      variables: { hp: 50 },
      visited: ['10', 12],
    }

    dbg.restoreDebugSnapshot(snap)
    await nextTick()

    expect(dbg.state.clearLineSnapshots).toHaveBeenCalled()
    expect(dbg.state.sceneIndex).toBe(3)
    expect(dbg.state.dialogueIndex).toBe(4)
    expect(dbg.state.values).toEqual({ hp: 50 })
    expect(dbg.state.restoreVisited).toHaveBeenCalledWith(['10', 12])
    expect(dbg.state.panelVisible).toBe(true)
    expect(dbg.state.startTyping).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('已恢复快照')
  })

  it('删除快照会同步落盘', () => {
    const dbg = createDebugger()
    dbg.saveDebugSnapshot()
    const id = dbg.debugSnapshots.value[0].id

    dbg.deleteDebugSnapshot(id)

    expect(dbg.debugSnapshots.value).toEqual([])
    expect(JSON.parse(localStorage.getItem('aigc:debugSnapshots:7') || '[]')).toEqual([])
  })
})
