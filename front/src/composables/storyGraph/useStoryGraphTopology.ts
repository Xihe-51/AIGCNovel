import { ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { GraphEdgeLike, GraphNodeLike } from '@/utils/storyGraph'

const HISTORY_LIMIT = 60

export interface TopologySnapshot {
  edges: GraphEdgeLike[]
  positions: Record<string, [number, number]>
}

export interface UseStoryGraphTopologyOptions {
  nodes: Ref<GraphNodeLike[]>
  edges: Ref<GraphEdgeLike[]>
  persistPositions?: () => void
  clearSelection?: () => void
  markDirty?: () => void
}

const cloneConditions = (conditions: any) => (conditions ? JSON.parse(JSON.stringify(conditions)) : null)

export function useStoryGraphTopology(options: UseStoryGraphTopologyOptions) {
  const { nodes, edges, persistPositions, clearSelection, markDirty } = options

  const history = ref<TopologySnapshot[]>([])
  const future = ref<TopologySnapshot[]>([])
  const clipboardBranches = ref<GraphEdgeLike[]>([])

  let pendingHistory: TopologySnapshot | null = null

  const snapshotTopology = (): TopologySnapshot => ({
    edges: edges.value.map(e => ({ ...e })),
    positions: Object.fromEntries(nodes.value.map(n => [String(n.content_id), [n._x, n._y] as [number, number]])),
  })

  const pushHistory = (snap?: TopologySnapshot) => {
    history.value.push(snap || snapshotTopology())
    if (history.value.length > HISTORY_LIMIT) history.value.shift()
    future.value = []
  }

  /** 拖拽开始：暂存快照，真的移动了才提交，避免单击也产生撤销记录 */
  const beginPendingHistory = () => {
    pendingHistory = snapshotTopology()
  }

  const commitPendingHistory = () => {
    if (!pendingHistory) return
    pushHistory(pendingHistory)
    pendingHistory = null
  }

  const discardPendingHistory = () => {
    pendingHistory = null
  }

  const restoreTopology = (snap?: TopologySnapshot | null) => {
    if (!snap) return
    edges.value = (snap.edges || []).map(e => ({ ...e }))
    for (const n of nodes.value) {
      const p = snap.positions?.[String(n.content_id)]
      if (Array.isArray(p) && p.length === 2) {
        n._x = Number(p[0])
        n._y = Number(p[1])
      }
    }
    persistPositions?.()
    clearSelection?.()
    markDirty?.()
  }

  const undoTopology = () => {
    if (!history.value.length) return
    future.value.push(snapshotTopology())
    restoreTopology(history.value.pop())
    ElMessage.success('已撤销上一步')
  }

  const redoTopology = () => {
    if (!future.value.length) return
    history.value.push(snapshotTopology())
    restoreTopology(future.value.pop())
    ElMessage.success('已重做')
  }

  const resetHistory = () => {
    history.value = []
    future.value = []
    pendingHistory = null
  }

  const copyBranches = (edge: GraphEdgeLike | null, nodeIds: number[] = []) => {
    let list: GraphEdgeLike[] = []
    if (edge) {
      list = [edge]
    } else if (nodeIds.length) {
      list = edges.value.filter(e => nodeIds.includes(Number(e.source_content_id)))
    }
    if (!list.length) {
      ElMessage.info('没有可复制的分支')
      return 0
    }
    clipboardBranches.value = list.map(e => ({ ...e, conditions: cloneConditions(e.conditions) }))
    ElMessage.success(`已复制 ${list.length} 条分支`)
    return list.length
  }

  const pasteBranches = (targetSourceId: number | null) => {
    const targetSource = targetSourceId == null ? null : Number(targetSourceId)
    if (!targetSource || !clipboardBranches.value.length) return 0
    const additions: GraphEdgeLike[] = []
    for (const e of clipboardBranches.value) {
      const target = Number(e.target_content_id)
      if (!target || target === targetSource) continue
      // 剪贴板可能来自刷新前的旧图：目标节点已被删除时不再粘贴
      if (!nodes.value.some(n => Number(n.content_id) === target)) continue
      const dup = edges.value.some(
        x => Number(x.source_content_id) === targetSource && Number(x.target_content_id) === target
      )
      if (dup) continue
      additions.push({
        path_id: undefined,
        source_content_id: targetSource,
        target_content_id: target,
        choice_text: e.choice_text || '',
        image_url: e.image_url || null,
        conditions: cloneConditions(e.conditions),
      })
    }
    if (!additions.length) {
      ElMessage.info('没有新增分支（目标节点已存在相同连线）')
      return 0
    }
    pushHistory()
    edges.value.push(...additions)
    markDirty?.()
    ElMessage.success(`已粘贴 ${additions.length} 条分支，别忘点「保存拓扑」`)
    return additions.length
  }

  return {
    history,
    future,
    clipboardBranches,
    snapshotTopology,
    pushHistory,
    beginPendingHistory,
    commitPendingHistory,
    discardPendingHistory,
    restoreTopology,
    undoTopology,
    redoTopology,
    resetHistory,
    copyBranches,
    pasteBranches,
  }
}
