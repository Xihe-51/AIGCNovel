import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerCoverage } from '@/composables/player/usePlayerCoverage'

const getStoryGraph = vi.fn()

vi.mock('@/api/branch', () => ({
  getStoryGraph: (...args: any[]) => getStoryGraph(...args),
}))

function createCoverage(overrides: Partial<Parameters<typeof usePlayerCoverage>[0]> = {}) {
  const state = {
    debug: true,
    dialogue: { content_id: 10 } as any,
  }

  const coverage = usePlayerCoverage({
    debugMode: () => state.debug,
    getCurrentDialogue: () => state.dialogue,
    ...overrides,
  })

  return { ...coverage, state }
}

const graph = {
  nodes: [
    { content_id: 10 },
    { content_id: 11 },
    { content_id: 12 },
    { content_id: 13 },
  ],
  edges: [
    { source_content_id: 10, target_content_id: 11 },
    { source_content_id: 11, target_content_id: 12 },
  ],
}

describe('usePlayerCoverage', () => {
  beforeEach(() => {
    getStoryGraph.mockReset().mockResolvedValue(graph)
  })

  it('边键统一为数字字符串', () => {
    const coverage = createCoverage()
    expect(coverage.edgeKey({ source_content_id: '10', target_content_id: 11 })).toBe('10->11')
  })

  it('空剧情图时统计归零', () => {
    const coverage = createCoverage()
    expect(coverage.coverageStats.value).toEqual({
      nodeTotal: 0,
      nodeVisited: 0,
      nodePct: 0,
      edgeTotal: 0,
      edgeVisited: 0,
      edgePct: 0,
    })
    expect(coverage.uncoveredNodes.value).toEqual([])
    expect(coverage.uncoveredEdges.value).toEqual([])
  })

  it('加载剧情图并按已走集合计算覆盖率', async () => {
    const coverage = createCoverage()
    await coverage.loadStoryGraph(7)

    expect(getStoryGraph).toHaveBeenCalledWith(7, false)

    coverage.markVisitedContent(10)
    coverage.markVisitedContent('11')
    coverage.markVisitedEdge(10, 11)

    expect(coverage.coverageStats.value).toMatchObject({
      nodeTotal: 4,
      nodeVisited: 2,
      nodePct: 50,
      edgeTotal: 2,
      edgeVisited: 1,
      edgePct: 50,
    })
    expect(coverage.uncoveredNodes.value.map((n: any) => n.content_id)).toEqual([12, 13])
    expect(coverage.uncoveredEdges.value).toHaveLength(1)
  })

  it('加载失败时清空剧情图并告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const coverage = createCoverage()
    getStoryGraph.mockRejectedValueOnce(new Error('boom'))

    await coverage.loadStoryGraph(7)

    expect(coverage.storyGraph.value).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('非调试模式不记录节点与分支', () => {
    const coverage = createCoverage()
    coverage.state.debug = false

    coverage.markVisitedContent(10)
    coverage.markVisitedEdge(10, 11)

    expect(coverage.visitedContents.value.size).toBe(0)
    expect(coverage.visitedEdges.value.size).toBe(0)
  })

  it('节点去重且忽略空 id', () => {
    const coverage = createCoverage()

    coverage.markVisitedContent(10)
    coverage.markVisitedContent(10)
    coverage.markVisitedContent(null)
    coverage.markVisitedContent(undefined)
    coverage.markVisitedContent(0)

    expect([...coverage.visitedContents.value]).toEqual([10])
  })

  it('分支去重', () => {
    const coverage = createCoverage()

    coverage.markVisitedEdge(10, 11)
    coverage.markVisitedEdge('10', '11')
    coverage.markVisitedEdge(11, 12)

    expect([...coverage.visitedEdges.value]).toEqual(['10->11', '11->12'])
  })

  it('重置后清空集合但保留当前节点', () => {
    const coverage = createCoverage()
    coverage.markVisitedContent(11)
    coverage.markVisitedEdge(10, 11)

    coverage.resetCoverage()

    expect([...coverage.visitedContents.value]).toEqual([10])
    expect(coverage.visitedEdges.value.size).toBe(0)
  })

  it('快照恢复用数字覆盖已走集合', () => {
    const coverage = createCoverage()
    coverage.markVisitedContent(11)

    coverage.restoreVisited(['12', 13] as any)
    expect([...coverage.visitedContents.value].sort((a, b) => a - b)).toEqual([12, 13])

    coverage.restoreVisited(null)
    expect(coverage.visitedContents.value.size).toBe(0)
  })

  it('当前无节点时重置不记录', () => {
    const coverage = createCoverage()
    coverage.state.dialogue = null

    coverage.resetCoverage()

    expect(coverage.visitedContents.value.size).toBe(0)
  })
})
