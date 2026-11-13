/**
 * 播放器分支覆盖率：本轮试玩走过的节点 / 分支统计（仅调试模式记录）。
 *
 * 是否记录由 debugMode 适配器注入，当前节点通过 getCurrentDialogue 读取，
 * composable 只维护已访问集合与基于剧情图的统计，不参与播放推进。
 */
import { computed, ref } from 'vue'
import { getStoryGraph } from '@/api/branch'

export interface PlayerCoverageContext {
  /** 仅调试模式记录覆盖率 */
  debugMode: () => boolean
  /** 当前停留的节点 */
  getCurrentDialogue: () => any
}

export function usePlayerCoverage(ctx: PlayerCoverageContext) {
  const storyGraph = ref<any>(null)
  const visitedContents = ref<Set<number>>(new Set())
  const visitedEdges = ref<Set<string>>(new Set())

  const edgeKey = (e: any) => `${Number(e.source_content_id)}->${Number(e.target_content_id)}`

  const coverageStats = computed(() => {
    const nodes = storyGraph.value?.nodes || []
    const edges = storyGraph.value?.edges || []
    const nodeVisited = nodes.filter((n: any) => visitedContents.value.has(Number(n.content_id))).length
    const edgeVisited = edges.filter((e: any) => visitedEdges.value.has(edgeKey(e))).length
    return {
      nodeTotal: nodes.length,
      nodeVisited,
      nodePct: nodes.length ? Math.round(nodeVisited * 100 / nodes.length) : 0,
      edgeTotal: edges.length,
      edgeVisited,
      edgePct: edges.length ? Math.round(edgeVisited * 100 / edges.length) : 0,
    }
  })

  const uncoveredNodes = computed(() =>
    (storyGraph.value?.nodes || []).filter((n: any) => !visitedContents.value.has(Number(n.content_id)))
  )

  const uncoveredEdges = computed(() =>
    (storyGraph.value?.edges || []).filter((e: any) => !visitedEdges.value.has(edgeKey(e)))
  )

  const markVisitedContent = (id: any) => {
    if (!ctx.debugMode() || !id) return
    const num = Number(id)
    if (visitedContents.value.has(num)) return
    const next = new Set(visitedContents.value)
    next.add(num)
    visitedContents.value = next
  }

  const markVisitedEdge = (sourceId: any, targetId: any) => {
    if (!ctx.debugMode()) return
    const key = `${Number(sourceId)}->${Number(targetId)}`
    if (visitedEdges.value.has(key)) return
    const next = new Set(visitedEdges.value)
    next.add(key)
    visitedEdges.value = next
  }

  /** 重置后把当前停留的节点也记为已走，避免一打开就显示未走 */
  const maskCoverageCurrent = () => {
    const id = ctx.getCurrentDialogue()?.content_id
    if (id) markVisitedContent(id)
  }

  const resetCoverage = () => {
    visitedContents.value = new Set()
    visitedEdges.value = new Set()
    maskCoverageCurrent()
  }

  /** 调试快照恢复：用快照里的节点覆盖当前已走集合 */
  const restoreVisited = (ids: any[] | null | undefined) => {
    visitedContents.value = new Set((ids || []).map(Number))
  }

  /** 拉取剧情图，失败时清空（覆盖率不可用） */
  const loadStoryGraph = async (projectId: number) => {
    try {
      storyGraph.value = await getStoryGraph(projectId, false)
    } catch (e) {
      console.warn('读取剧情图失败，覆盖率不可用:', e)
      storyGraph.value = null
    }
  }

  return {
    storyGraph,
    visitedContents,
    visitedEdges,
    edgeKey,
    coverageStats,
    uncoveredNodes,
    uncoveredEdges,
    markVisitedContent,
    markVisitedEdge,
    resetCoverage,
    maskCoverageCurrent,
    restoreVisited,
    loadStoryGraph,
  }
}
