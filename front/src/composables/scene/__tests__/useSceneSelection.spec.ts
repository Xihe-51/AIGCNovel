import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSceneSelection } from '@/composables/scene/useSceneSelection'

const deleteDialogue = vi.fn()

vi.mock('@/api/dialogue', () => ({
  deleteDialogue: (...args: any[]) => deleteDialogue(...args),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

function createSelection(options: { dialogues?: any[]; dirty?: boolean; selected?: number[] } = {}) {
  const dialogues = ref<any[]>(JSON.parse(JSON.stringify(options.dialogues ?? [])))
  let dirty = options.dirty ?? false
  const pushHistory = vi.fn()
  const clearHistory = vi.fn()
  const markDirty = vi.fn(() => { dirty = true })
  const clearDraft = vi.fn(() => { dirty = false })
  const dropProjectNode = vi.fn()

  const selection = useSceneSelection({
    dialogues,
    getDirty: () => dirty,
    pushHistory,
    clearHistory,
    markDirty,
    clearDraft,
    dropProjectNode,
  })

  selection.selectedIndexes.value = [...(options.selected ?? [])]

  return { ...selection, dialogues, pushHistory, clearHistory, markDirty, clearDraft, dropProjectNode }
}

beforeEach(() => {
  deleteDialogue.mockReset()
  deleteDialogue.mockResolvedValue(undefined)
  vi.mocked(ElMessageBox.confirm).mockReset()
  vi.mocked(ElMessage.success).mockReset()
  vi.mocked(ElMessage.error).mockReset()
})

describe('useSceneSelection / 选中状态', () => {
  it('toggleSelect 选中与取消选中', () => {
    const s = createSelection()
    s.toggleSelect(2)
    expect(s.isSelected(2)).toBe(true)
    s.toggleSelect(2)
    expect(s.isSelected(2)).toBe(false)
  })

  it('clearSelection 清空全部选中', () => {
    const s = createSelection({ selected: [0, 3] })
    s.clearSelection()
    expect(s.selectedIndexes.value).toEqual([])
  })

  it('isSelected 只认已选下标', () => {
    const s = createSelection({ selected: [1] })
    expect(s.isSelected(1)).toBe(true)
    expect(s.isSelected(0)).toBe(false)
  })
})

describe('useSceneSelection / 批量删除', () => {
  it('没有选中时不弹确认框', async () => {
    const s = createSelection({ dialogues: [{ content_text: 'a' }] })
    await s.batchDelete()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
  })

  it('取消确认时不删除任何内容', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const s = createSelection({ dialogues: [{ content_id: 1, content_text: 'a' }], selected: [0] })
    await s.batchDelete()
    expect(deleteDialogue).not.toHaveBeenCalled()
    expect(s.dialogues.value).toHaveLength(1)
  })

  it('按倒序删除、重排序号并清空选中与历史', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    const s = createSelection({
      dialogues: [
        { content_id: 11, content_text: 'a' },
        { content_id: 12, content_text: 'b' },
        { content_id: 13, content_text: 'c' },
      ],
      dirty: true,
      selected: [0, 1],
    })
    await s.batchDelete()
    expect(deleteDialogue).toHaveBeenCalledTimes(2)
    expect(s.dialogues.value).toHaveLength(1)
    expect(s.dialogues.value[0].content_id).toBe(13)
    expect(s.dialogues.value[0].order_num).toBe(1)
    expect(s.selectedIndexes.value).toEqual([])
    expect(s.dropProjectNode).toHaveBeenCalledWith(11)
    expect(s.dropProjectNode).toHaveBeenCalledWith(12)
    expect(s.clearHistory).toHaveBeenCalledTimes(1)
    expect(s.markDirty).toHaveBeenCalledTimes(1)
    expect(s.clearDraft).not.toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('已删除选中对话（不可撤销）')
  })

  it('没有未保存改动时清草稿而不是标脏', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    const s = createSelection({ dialogues: [{ content_id: 1, content_text: 'a' }], dirty: false, selected: [0] })
    await s.batchDelete()
    expect(s.clearDraft).toHaveBeenCalledTimes(1)
    expect(s.markDirty).not.toHaveBeenCalled()
  })

  it('接口失败时中止并提示，已删的下标仍然移除', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    // 第一条（倒序下标 1）删除成功，第二条失败后中止
    deleteDialogue.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'))
    const s = createSelection({
      dialogues: [
        { content_id: 11, content_text: 'a' },
        { content_id: 12, content_text: 'b' },
      ],
      selected: [0, 1],
    })
    await s.batchDelete()
    expect(ElMessage.error).toHaveBeenCalledWith('删除失败，已中止')
    expect(s.dialogues.value).toHaveLength(1)
    expect(s.dialogues.value[0].content_id).toBe(11)
    expect(s.dropProjectNode).toHaveBeenCalledTimes(1)
    expect(s.dropProjectNode).toHaveBeenCalledWith(12)
  })

  it('本地未落库的台词不发请求，直接移除', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    const s = createSelection({ dialogues: [{ content_text: 'local-only' }], selected: [0] })
    await s.batchDelete()
    expect(deleteDialogue).not.toHaveBeenCalled()
    expect(s.dialogues.value).toHaveLength(0)
    expect(s.dropProjectNode).not.toHaveBeenCalled()
  })
})

describe('useSceneSelection / 批量复制', () => {
  it('没有选中时不复制', () => {
    const s = createSelection({ dialogues: [{ content_text: 'a' }] })
    s.batchDuplicate()
    expect(s.dialogues.value).toHaveLength(1)
    expect(s.pushHistory).not.toHaveBeenCalled()
  })

  it('复制出的台词去掉 content_id 与配音，插在最后一条选中之后', () => {
    const s = createSelection({
      dialogues: [
        { content_id: 11, content_text: 'a', voice_url: '/a.mp3', order_num: 1 },
        { content_id: 12, content_text: 'b', voice_url: '/b.mp3', order_num: 2 },
        { content_id: 13, content_text: 'c', order_num: 3 },
      ],
      selected: [0],
    })
    s.batchDuplicate()
    expect(s.pushHistory).toHaveBeenCalledTimes(1)
    expect(s.dialogues.value).toHaveLength(4)
    const copy = s.dialogues.value[1]
    expect(copy.content_text).toBe('a')
    expect(copy.content_id).toBeUndefined()
    expect(copy.voice_url).toBe('')
    expect(copy.order_num).toBe(2)
    expect(s.dialogues.value.map((d: any) => d.order_num)).toEqual([1, 2, 3, 4])
    expect(s.selectedIndexes.value).toEqual([])
    expect(s.markDirty).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('已复制 1 条，记得保存')
  })

  it('多选时按升序依次复制并整体重排序号', () => {
    const s = createSelection({
      dialogues: [
        { content_id: 11, content_text: 'a' },
        { content_id: 12, content_text: 'b' },
        { content_id: 13, content_text: 'c' },
      ],
      selected: [0, 2],
    })
    s.batchDuplicate()
    expect(s.dialogues.value).toHaveLength(5)
    expect(s.dialogues.value.map((d: any) => d.content_text)).toEqual(['a', 'b', 'c', 'a', 'c'])
    expect(ElMessage.success).toHaveBeenCalledWith('已复制 2 条，记得保存')
  })

  it('复制是深拷贝，改副本不影响原台词', () => {
    const s = createSelection({
      dialogues: [{ content_id: 11, content_text: 'a', _choices: [{ id: 1 }] }],
      selected: [0],
    })
    s.batchDuplicate()
    s.dialogues.value[1].content_text = 'changed'
    s.dialogues.value[1]._choices[0].id = 9
    expect(s.dialogues.value[0].content_text).toBe('a')
    expect(s.dialogues.value[0]._choices[0].id).toBe(1)
  })
})
