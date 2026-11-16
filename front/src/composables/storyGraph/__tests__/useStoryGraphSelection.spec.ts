import { describe, expect, it } from 'vitest'
import { useStoryGraphSelection } from '@/composables/storyGraph/useStoryGraphSelection'
import type { GraphNodeLike } from '@/utils/storyGraph'

const makeNode = (contentId: number): GraphNodeLike => ({
  content_id: contentId,
  content_type: '台词',
  content_text: `第 ${contentId} 句`,
  scene_id: 1,
})

const ctrlClick = (): MouseEvent => ({ ctrlKey: true }) as MouseEvent

describe('useStoryGraphSelection / 初始状态', () => {
  it('初始无选中、面板关闭', () => {
    const selection = useStoryGraphSelection()
    expect(selection.selectedNodeId.value).toBeNull()
    expect(selection.selectedNodeIds.value).toEqual([])
    expect(selection.selectedEdge.value).toBeNull()
    expect(selection.panelMode.value).toBe('none')
  })
})

describe('useStoryGraphSelection / selectByEvent', () => {
  it('普通点击单选并打开节点面板', () => {
    const selection = useStoryGraphSelection()
    selection.selectByEvent(makeNode(7))
    expect(selection.selectedNodeIds.value).toEqual([7])
    expect(selection.selectedNodeId.value).toBe(7)
    expect(selection.panelMode.value).toBe('node')
    expect(selection.isNodeSelected(7)).toBe(true)
  })

  it('点击节点会清掉已选中的连线', () => {
    const selection = useStoryGraphSelection()
    selection.selectedEdge.value = { source_content_id: 1, target_content_id: 2 }
    selection.openPanel()
    selection.selectByEvent(makeNode(7))
    expect(selection.selectedEdge.value).toBeNull()
    expect(selection.panelMode.value).toBe('node')
  })

  it('Ctrl 点击累加多选', () => {
    const selection = useStoryGraphSelection()
    selection.selectByEvent(makeNode(1))
    selection.selectByEvent(makeNode(2), ctrlClick())
    expect(selection.selectedNodeIds.value).toEqual([1, 2])
    expect(selection.selectedNodeId.value).toBe(2)
    expect(selection.panelMode.value).toBe('node')
  })

  it('Ctrl 再次点击取消该节点，全取消后关闭面板', () => {
    const selection = useStoryGraphSelection()
    selection.selectByEvent(makeNode(1))
    selection.selectByEvent(makeNode(1), ctrlClick())
    expect(selection.selectedNodeIds.value).toEqual([])
    expect(selection.selectedNodeId.value).toBeNull()
    expect(selection.panelMode.value).toBe('none')
  })

  it('取消其中一个后主选中回落到剩余节点', () => {
    const selection = useStoryGraphSelection()
    selection.selectByEvent(makeNode(1))
    selection.selectByEvent(makeNode(2), ctrlClick())
    selection.selectByEvent(makeNode(2), ctrlClick())
    expect(selection.selectedNodeIds.value).toEqual([1])
    expect(selection.selectedNodeId.value).toBe(1)
    expect(selection.panelMode.value).toBe('node')
  })

  it('拖拽后的第一次 click 被吞掉，之后恢复正常', () => {
    const selection = useStoryGraphSelection()
    selection.selectByEvent(makeNode(1))
    selection.suppressNextClickOnce()
    selection.selectByEvent(makeNode(2))
    expect(selection.selectedNodeIds.value).toEqual([1])
    selection.selectByEvent(makeNode(2))
    expect(selection.selectedNodeIds.value).toEqual([2])
  })
})

describe('useStoryGraphSelection / 面板与选中状态', () => {
  it('selectPrimaryNode 清掉连线选中并切到节点面板', () => {
    const selection = useStoryGraphSelection()
    selection.selectedEdge.value = { source_content_id: 1, target_content_id: 2 }
    selection.selectPrimaryNode(3)
    expect(selection.selectedEdge.value).toBeNull()
    expect(selection.selectedNodeId.value).toBe(3)
    expect(selection.panelMode.value).toBe('node')
  })

  it('openPanel 打开连线面板，closePanel 关闭', () => {
    const selection = useStoryGraphSelection()
    selection.openPanel()
    expect(selection.panelMode.value).toBe('edge')
    selection.closePanel()
    expect(selection.panelMode.value).toBe('none')
  })

  it('clearSelection 清空节点、连线与面板', () => {
    const selection = useStoryGraphSelection()
    selection.selectByEvent(makeNode(1))
    selection.selectedEdge.value = { source_content_id: 1, target_content_id: 2 }
    selection.clearSelection()
    expect(selection.selectedNodeId.value).toBeNull()
    expect(selection.selectedNodeIds.value).toEqual([])
    expect(selection.selectedEdge.value).toBeNull()
    expect(selection.panelMode.value).toBe('none')
  })

  it('setNodeSelectedIds / clearNodeSelection 只动多选集合', () => {
    const selection = useStoryGraphSelection()
    selection.setNodeSelectedIds([4, 5])
    expect(selection.selectedNodeIds.value).toEqual([4, 5])
    selection.clearNodeSelection()
    expect(selection.selectedNodeIds.value).toEqual([])
  })
})
