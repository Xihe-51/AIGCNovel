import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useStoryGraphTopology } from '@/composables/storyGraph/useStoryGraphTopology'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const makeNodes = () =>
  ref<any[]>([
    { content_id: 1, content_type: '选择', content_text: '甲', scene_id: 10, _x: 40, _y: 40 },
    { content_id: 2, content_type: '对话', content_text: '乙', scene_id: 10, _x: 40, _y: 134 },
    { content_id: 3, content_type: '对话', content_text: '丙', scene_id: 20, _x: 340, _y: 40 },
  ])

const makeEdges = () =>
  ref<any[]>([
    { path_id: 11, source_content_id: 1, target_content_id: 2, choice_text: '去乙', conditions: { variable: 'hp', op: '>=', value: 1 } },
    { path_id: 12, source_content_id: 1, target_content_id: 3, choice_text: '去丙', conditions: null },
  ])

function setup() {
  const nodes = makeNodes()
  const edges = makeEdges()
  const persistPositions = vi.fn()
  const clearSelection = vi.fn()
  const markDirty = vi.fn()
  const topology = useStoryGraphTopology({ nodes, edges, persistPositions, clearSelection, markDirty })
  return { nodes, edges, persistPositions, clearSelection, markDirty, topology }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useStoryGraphTopology / 撤销重做', () => {
  it('pushHistory 记录快照，undo 恢复连线与位置', () => {
    const { nodes, edges, topology, persistPositions, clearSelection, markDirty } = setup()
    topology.pushHistory()
    edges.value = []
    nodes.value[0]._x = 999

    topology.undoTopology()

    expect(edges.value.map(e => e.path_id)).toEqual([11, 12])
    expect(nodes.value[0]._x).toBe(40)
    expect(persistPositions).toHaveBeenCalledTimes(1)
    expect(clearSelection).toHaveBeenCalledTimes(1)
    expect(markDirty).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('已撤销上一步')
  })

  it('undo 后 redo 可回到撤销前的状态', () => {
    const { edges, topology } = setup()
    topology.pushHistory()
    edges.value = []
    topology.undoTopology()
    expect(edges.value).toHaveLength(2)

    topology.redoTopology()
    expect(edges.value).toHaveLength(0)
    expect(ElMessage.success).toHaveBeenCalledWith('已重做')
  })

  it('没有历史时 undo / redo 是空操作', () => {
    const { topology, persistPositions } = setup()
    topology.undoTopology()
    topology.redoTopology()
    expect(persistPositions).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('历史栈最多保留 60 条', () => {
    const { topology } = setup()
    for (let i = 0; i < 65; i++) topology.pushHistory()
    expect(topology.history.value).toHaveLength(60)
  })

  it('pushHistory 会清空重做栈', () => {
    const { topology } = setup()
    topology.pushHistory()
    topology.undoTopology()
    expect(topology.future.value).toHaveLength(1)
    topology.pushHistory()
    expect(topology.future.value).toHaveLength(0)
  })

  it('restoreTopology 忽略空快照', () => {
    const { topology, persistPositions } = setup()
    topology.restoreTopology(null)
    expect(persistPositions).not.toHaveBeenCalled()
  })

  it('resetHistory 清空历史 / 重做 / 待提交快照', () => {
    const { topology } = setup()
    topology.pushHistory()
    topology.undoTopology()
    topology.beginPendingHistory()
    topology.resetHistory()
    expect(topology.history.value).toHaveLength(0)
    expect(topology.future.value).toHaveLength(0)
    topology.commitPendingHistory()
    expect(topology.history.value).toHaveLength(0)
  })
})

describe('useStoryGraphTopology / 拖拽待提交快照', () => {
  it('beginPendingHistory 后 commitPendingHistory 提交一条历史', () => {
    const { topology } = setup()
    topology.beginPendingHistory()
    topology.commitPendingHistory()
    expect(topology.history.value).toHaveLength(1)
  })

  it('没有待提交快照时 commitPendingHistory 不产生历史', () => {
    const { topology } = setup()
    topology.commitPendingHistory()
    expect(topology.history.value).toHaveLength(0)
  })

  it('discardPendingHistory 丢弃待提交快照', () => {
    const { topology } = setup()
    topology.beginPendingHistory()
    topology.discardPendingHistory()
    topology.commitPendingHistory()
    expect(topology.history.value).toHaveLength(0)
  })
})

describe('useStoryGraphTopology / 复制粘贴分支', () => {
  it('复制选中连线', () => {
    const { topology, edges } = setup()
    const count = topology.copyBranches(edges.value[0], [])
    expect(count).toBe(1)
    expect(topology.clipboardBranches.value).toHaveLength(1)
    expect(ElMessage.success).toHaveBeenCalledWith('已复制 1 条分支')
  })

  it('复制选中节点的出边，并深拷贝条件', () => {
    const { topology, edges } = setup()
    const count = topology.copyBranches(null, [1])
    expect(count).toBe(2)
    expect(topology.clipboardBranches.value[0].conditions).toEqual(edges.value[0].conditions)
    expect(topology.clipboardBranches.value[0].conditions).not.toBe(edges.value[0].conditions)
  })

  it('没有可复制分支时提示', () => {
    const { topology } = setup()
    const count = topology.copyBranches(null, [])
    expect(count).toBe(0)
    expect(ElMessage.info).toHaveBeenCalledWith('没有可复制的分支')
  })

  it('粘贴到目标节点：跳过自连、缺失节点与重复连线', () => {
    const { topology, edges } = setup()
    topology.clipboardBranches.value = [
      { source_content_id: 1, target_content_id: 2, choice_text: '重复' },
      { source_content_id: 1, target_content_id: 3, choice_text: '重复' },
      { source_content_id: 1, target_content_id: 99, choice_text: '目标已删除' },
      { source_content_id: 1, target_content_id: 1, choice_text: '自连' },
    ]
    expect(topology.pasteBranches(1)).toBe(0)
    expect(edges.value).toHaveLength(2)
    expect(ElMessage.info).toHaveBeenCalledWith('没有新增分支（目标节点已存在相同连线）')
  })

  it('粘贴成功：新增连线、压入历史并标记脏数据', () => {
    const { topology, edges, markDirty } = setup()
    topology.clipboardBranches.value = [
      { source_content_id: 2, target_content_id: 3, choice_text: '新分支', image_url: null, conditions: { variable: 'hp', op: '>=', value: 2 } },
    ]
    expect(topology.pasteBranches(2)).toBe(1)
    expect(edges.value).toHaveLength(3)
    expect(edges.value[2]).toMatchObject({ source_content_id: 2, target_content_id: 3, choice_text: '新分支' })
    expect(topology.history.value).toHaveLength(1)
    expect(markDirty).toHaveBeenCalledTimes(1)
  })

  it('未选中节点或剪贴板为空时不粘贴', () => {
    const { topology, edges } = setup()
    topology.clipboardBranches.value = [{ source_content_id: 2, target_content_id: 3, choice_text: 'x' }]
    expect(topology.pasteBranches(null)).toBe(0)
    expect(edges.value).toHaveLength(2)

    topology.clipboardBranches.value = []
    expect(topology.pasteBranches(2)).toBe(0)
  })
})
