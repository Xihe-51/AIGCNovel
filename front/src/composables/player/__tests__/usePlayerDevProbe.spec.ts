import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPlayerDebugSnapshot,
  usePlayerDevProbe,
} from '@/composables/player/usePlayerDevProbe'
import type { PlayerDevProbeContext } from '@/composables/player/usePlayerDevProbe'

const createState = () => ({
  readSet: new Set<number>([11, 12]),
  skipRead: true,
  currentContentId: 12,
  shouldSkip: false,
  isTyping: true,
  endings: [1],
  endingVisible: false,
  triggered: new Set<number>([1, 2]),
  variables: { hp: 3, flag: true },
  coverageStats: { totalNodes: 40, visitedRatio: 0.5 },
  visitedContents: new Set<number>([11]),
  visitedEdges: new Set<string>(['11->12']),
  currentUserId: '1',
  projectOwnerId: 1,
  canPerform: true,
  performMode: false,
  queryEdit: '1',
})

type State = ReturnType<typeof createState>

const createContext = (
  state: State,
  overrides: Partial<PlayerDevProbeContext> = {},
): PlayerDevProbeContext => ({
  getReadSet: () => state.readSet,
  getSkipRead: () => state.skipRead,
  getCurrentContentId: () => state.currentContentId,
  shouldSkipCurrent: () => state.shouldSkip,
  getIsTyping: () => state.isTyping,
  getEndingsCount: () => state.endings.length,
  getEndingVisible: () => state.endingVisible,
  getTriggeredEndings: () => state.triggered,
  getVariableValues: () => state.variables,
  getCoverageStats: () => state.coverageStats,
  getVisitedNodes: () => state.visitedContents,
  getVisitedEdges: () => state.visitedEdges,
  getCurrentUserId: () => state.currentUserId,
  getProjectOwnerId: () => state.projectOwnerId,
  getCanPerform: () => state.canPerform,
  getPerformMode: () => state.performMode,
  getQueryEdit: () => state.queryEdit,
  ...overrides,
})

describe('createPlayerDebugSnapshot', () => {
  it('返回与无头脚本约定的字段结构', () => {
    const snapshot = createPlayerDebugSnapshot(createContext(createState()))

    expect(snapshot).toEqual({
      readCount: 2,
      readIds: [11, 12],
      skipRead: true,
      currentId: 12,
      shouldSkip: false,
      isTyping: true,
      endingsCount: 1,
      endingVisible: false,
      triggered: [1, 2],
      variables: { hp: 3, flag: true },
      coverage: {
        totalNodes: 40,
        visitedRatio: 0.5,
        visitedNodes: [11],
        visitedEdges: ['11->12'],
      },
      perform: {
        currentUserId: '1',
        projectOwnerId: 1,
        canPerform: true,
        performMode: false,
        queryEdit: '1',
      },
    })
  })

  it('readCount 由已读集合大小派生，集合变化后快照同步跟随', () => {
    const state = createState()
    const ctx = createContext(state)

    expect(createPlayerDebugSnapshot(ctx).readCount).toBe(2)

    state.readSet = new Set<number>([11, 12, 13])
    expect(createPlayerDebugSnapshot(ctx).readCount).toBe(3)
  })

  it('快照每次调用即时求值，不做缓存', () => {
    const state = createState()
    const ctx = createContext(state)

    const first = createPlayerDebugSnapshot(ctx)
    state.currentContentId = 99
    state.isTyping = false
    const second = createPlayerDebugSnapshot(ctx)

    expect(first.currentId).toBe(12)
    expect(second.currentId).toBe(99)
    expect(second.isTyping).toBe(false)
  })

  it('台词未定位时当前 id 为空，已读为空集合时 readCount 为 0', () => {
    const state = createState()
    state.currentContentId = undefined
    state.readSet = new Set<number>()

    const snapshot = createPlayerDebugSnapshot(createContext(state))

    expect(snapshot.currentId).toBeUndefined()
    expect(snapshot.readCount).toBe(0)
    expect(snapshot.readIds).toEqual([])
  })
})

describe('usePlayerDevProbe', () => {
  afterEach(() => {
    delete window.__aigcPlayerDebug
  })

  it('开发构建下挂载探针，返回的快照与纯函数一致', () => {
    const state = createState()
    const ctx = createContext(state, { isDevBuild: () => true })

    const probe = usePlayerDevProbe(ctx)

    expect(probe.installed).toBe(true)
    expect(typeof window.__aigcPlayerDebug).toBe('function')
    expect(window.__aigcPlayerDebug?.()).toEqual(createPlayerDebugSnapshot(ctx))
  })

  it('生产构建下不挂载探针', () => {
    const probe = usePlayerDevProbe(createContext(createState(), { isDevBuild: () => false }))

    expect(probe.installed).toBe(false)
    expect(window.__aigcPlayerDebug).toBeUndefined()
  })

  it('探针跟随状态变化，始终反映最新播放器状态', () => {
    const state = createState()
    const ctx = createContext(state, { isDevBuild: () => true })
    usePlayerDevProbe(ctx)

    state.performMode = true
    state.canPerform = false

    const snapshot = window.__aigcPlayerDebug?.()
    expect(snapshot?.perform.performMode).toBe(true)
    expect(snapshot?.perform.canPerform).toBe(false)
  })
})
