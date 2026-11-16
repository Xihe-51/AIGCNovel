import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { isConditionGroupLocked, useStoryGraphEdgeForm } from '@/composables/storyGraph/useStoryGraphEdgeForm'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

function setup() {
  const edges = ref<any[]>([
    { path_id: 11, source_content_id: 1, target_content_id: 2, choice_text: '去乙', conditions: { variable: 'hp', op: '>=', value: 3 } },
    { path_id: 12, source_content_id: 1, target_content_id: 3, choice_text: '去丙', conditions: null },
  ])
  const selectedEdge = ref<any>(null)
  const pushHistory = vi.fn()
  const markDirty = vi.fn()
  const clearNodeSelection = vi.fn()
  const openPanel = vi.fn()
  const closePanel = vi.fn()
  const form = useStoryGraphEdgeForm({
    edges,
    selectedEdge,
    pushHistory,
    markDirty,
    clearNodeSelection,
    openPanel,
    closePanel,
  })
  return { edges, selectedEdge, pushHistory, markDirty, clearNodeSelection, openPanel, closePanel, form }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useStoryGraphEdgeForm / isConditionGroupLocked', () => {
  it('多条件组（items 数组）视为锁定', () => {
    expect(isConditionGroupLocked({ items: [] })).toBe(true)
    expect(isConditionGroupLocked({ variable: 'hp' })).toBe(false)
    expect(isConditionGroupLocked(null)).toBe(false)
  })
})

describe('useStoryGraphEdgeForm / selectEdge', () => {
  it('把连线条件回填到表单并清空节点选择', () => {
    const { edges, selectedEdge, form, clearNodeSelection, openPanel } = setup()
    form.selectEdge(edges.value[0])
    expect(selectedEdge.value).toBe(edges.value[0])
    expect(form.edgeForm.value).toEqual({ choice_text: '去乙', variable: 'hp', op: '>=', value: 3 })
    expect(clearNodeSelection).toHaveBeenCalledTimes(1)
    expect(openPanel).toHaveBeenCalledTimes(1)
    expect(form.edgeGroupLock.value).toBe(false)
  })

  it('无条件的连线回落到默认运算符', () => {
    const { edges, form } = setup()
    form.selectEdge(edges.value[1])
    expect(form.edgeForm.value).toEqual({ choice_text: '去丙', variable: '', op: '>=', value: 0 })
  })

  it('选中空连线是空操作', () => {
    const { selectedEdge, form, openPanel } = setup()
    form.selectEdge(null)
    expect(selectedEdge.value).toBeNull()
    expect(openPanel).not.toHaveBeenCalled()
  })
})

describe('useStoryGraphEdgeForm / 表单同步', () => {
  it('回填表单本身不写回连线也不产生历史', async () => {
    const { edges, form, pushHistory, markDirty } = setup()
    form.selectEdge(edges.value[0])
    await nextTick()
    expect(pushHistory).not.toHaveBeenCalled()
    expect(markDirty).not.toHaveBeenCalled()
  })

  it('改文案写回连线，且整条连线只压一条历史', async () => {
    const { edges, form, pushHistory, markDirty } = setup()
    form.selectEdge(edges.value[0])
    await nextTick()

    form.edgeForm.value.choice_text = '去乙（改）'
    await nextTick()
    form.edgeForm.value.choice_text = '去乙（再改）'
    await nextTick()

    expect(edges.value[0].choice_text).toBe('去乙（再改）')
    expect(pushHistory).toHaveBeenCalledTimes(1)
    expect(markDirty).toHaveBeenCalledTimes(2)
  })

  it('清空变量时条件置空', async () => {
    const { edges, form } = setup()
    form.selectEdge(edges.value[0])
    await nextTick()
    form.edgeForm.value.variable = ''
    await nextTick()
    expect(edges.value[0].conditions).toBeNull()
  })

  it('数字输入非法时条件值回落为 0', async () => {
    const { edges, form } = setup()
    form.selectEdge(edges.value[0])
    await nextTick()
    form.edgeForm.value.value = Number.NaN
    await nextTick()
    expect(edges.value[0].conditions).toEqual({ variable: 'hp', op: '>=', value: 0 })
  })

  it('多条件组只允许改文案，条件对象保持原样', async () => {
    const { edges, selectedEdge, form, markDirty } = setup()
    edges.value[0].conditions = { items: [{ variable: 'hp', op: '>=', value: 1 }], logic: 'and' }
    form.selectEdge(edges.value[0])
    await nextTick()
    expect(form.edgeGroupLock.value).toBe(true)

    const original = selectedEdge.value.conditions
    form.edgeForm.value.choice_text = '改文案'
    form.edgeForm.value.variable = 'mp'
    await nextTick()

    expect(edges.value[0].choice_text).toBe('改文案')
    expect(edges.value[0].conditions).toBe(original)
    expect(markDirty).toHaveBeenCalled()
  })
})

describe('useStoryGraphEdgeForm / 删除', () => {
  it('deleteEdge 删除连线、压历史、关面板', () => {
    const { edges, selectedEdge, form, pushHistory, markDirty, closePanel } = setup()
    form.selectEdge(edges.value[0])
    form.deleteEdge(edges.value[0])
    expect(edges.value.map(e => e.path_id)).toEqual([12])
    expect(selectedEdge.value).toBeNull()
    expect(pushHistory).toHaveBeenCalled()
    expect(markDirty).toHaveBeenCalled()
    expect(closePanel).toHaveBeenCalled()
  })

  it('deleteEdge 对不存在的连线不压历史', () => {
    const { edges, form, pushHistory } = setup()
    form.deleteEdge({ path_id: 99, source_content_id: 9, target_content_id: 9 })
    expect(edges.value).toHaveLength(2)
    expect(pushHistory).not.toHaveBeenCalled()
  })

  it('deleteNodeEdges 移除该节点全部出边', () => {
    const { edges, form, pushHistory } = setup()
    form.deleteNodeEdges({ content_id: 1, scene_id: 10 })
    expect(edges.value).toHaveLength(0)
    expect(pushHistory).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('deleteNodeEdges 无出边时不动数据', () => {
    const { edges, form, pushHistory } = setup()
    form.deleteNodeEdges({ content_id: 3, scene_id: 10 })
    expect(edges.value).toHaveLength(2)
    expect(pushHistory).not.toHaveBeenCalled()
  })
})
