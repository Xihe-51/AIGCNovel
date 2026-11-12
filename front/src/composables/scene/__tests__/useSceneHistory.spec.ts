import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { withSetup } from '@/__tests__/helpers'
import { useSceneHistory } from '@/composables/scene/useSceneHistory'

vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: vi.fn() },
}))

const DRAFT_KEY = 'scene-draft:12'

function createHistory(initial: any[] = []) {
  const dialogues = ref<any[]>(JSON.parse(JSON.stringify(initial)))
  const currentIndex = ref(0)
  const clearSelection = vi.fn()
  const reloadDirectives = vi.fn()

  const { result, wrapper } = withSetup(() => useSceneHistory({
    sceneId: () => 12,
    getDialogues: () => dialogues.value,
    setDialogues: (list) => { dialogues.value = list },
    getCurrentIndex: () => currentIndex.value,
    setCurrentIndex: (i) => { currentIndex.value = i },
    clearSelection,
    reloadDirectives,
  }))

  return { ...result, dialogues, currentIndex, clearSelection, reloadDirectives, wrapper }
}

beforeEach(() => {
  vi.mocked(ElMessageBox.confirm).mockReset()
})

describe('useSceneHistory / 快照与历史栈', () => {
  it('cloneDialogues 是深拷贝，改副本不影响原数组', () => {
    const h = createHistory([{ content_text: 'a', _choices: [{ id: 1 }] }])
    const clone = h.cloneDialogues()
    clone[0].content_text = 'changed'
    clone[0]._choices[0].id = 9
    expect(h.dialogues.value[0].content_text).toBe('a')
    expect(h.dialogues.value[0]._choices[0].id).toBe(1)
  })

  it('pushHistory 记录当前台词快照', () => {
    const h = createHistory([{ content_text: 'a' }])
    h.pushHistory()
    expect(h.undoStack.value).toHaveLength(1)
    expect(h.undoStack.value[0].snapshot).toEqual([{ content_text: 'a' }])
    expect(h.canUndo.value).toBe(true)
  })

  it('连续相同快照不重复入栈', () => {
    const h = createHistory([{ content_text: 'a' }])
    h.pushHistory()
    h.pushHistory()
    h.pushHistory()
    expect(h.undoStack.value).toHaveLength(1)
  })

  it('推入新快照会清空重做栈', () => {
    const h = createHistory([{ content_text: 'a' }])
    h.pushHistory()
    h.dialogues.value = [{ content_text: 'b' }]
    h.undo()
    expect(h.canRedo.value).toBe(true)
    h.pushHistory()
    expect(h.redoStack.value).toHaveLength(0)
  })

  it('撤销栈上限 50，超出丢弃最早的', () => {
    const h = createHistory()
    for (let i = 0; i < 60; i++) {
      h.pushHistory([{ content_text: `v${i}` }])
    }
    expect(h.undoStack.value).toHaveLength(50)
    expect(h.undoStack.value[0].snapshot[0].content_text).toBe('v10')
    expect(h.undoStack.value[49].snapshot[0].content_text).toBe('v59')
  })
})

describe('useSceneHistory / 撤销与重做', () => {
  it('空栈时撤销是空操作', () => {
    const h = createHistory([{ content_text: 'a' }])
    h.undo()
    expect(h.dialogues.value).toEqual([{ content_text: 'a' }])
  })

  it('撤销回到上一个快照并把当前压入重做栈', async () => {
    const h = createHistory([{ content_text: 'a' }])
    h.pushHistory()
    h.dialogues.value = [{ content_text: 'b' }]
    h.undo()
    expect(h.dialogues.value).toEqual([{ content_text: 'a' }])
    expect(h.redoStack.value).toHaveLength(1)
    expect(h.redoStack.value[0].snapshot).toEqual([{ content_text: 'b' }])
  })

  it('重做把快照推回去', () => {
    const h = createHistory([{ content_text: 'a' }])
    h.pushHistory()
    h.dialogues.value = [{ content_text: 'b' }]
    h.undo()
    h.redo()
    expect(h.dialogues.value).toEqual([{ content_text: 'b' }])
    expect(h.canRedo.value).toBe(false)
  })

  it('撤销时清空多选、标记脏并在下一帧重载预览指令', async () => {
    const h = createHistory([{ content_text: 'a' }])
    h.pushHistory()
    h.dialogues.value = [{ content_text: 'b' }]
    h.undo()
    expect(h.clearSelection).toHaveBeenCalledTimes(1)
    expect(h.dirty.value).toBe(true)
    expect(h.reloadDirectives).not.toHaveBeenCalled()
    await nextTick()
    expect(h.reloadDirectives).toHaveBeenCalledTimes(1)
  })

  it('撤销后当前下标越界时收敛到最后一条', () => {
    const h = createHistory([{ content_text: 'a' }, { content_text: 'b' }])
    h.pushHistory()
    h.dialogues.value = [{ content_text: 'a' }, { content_text: 'b' }, { content_text: 'c' }]
    h.currentIndex.value = 2
    h.undo()
    expect(h.currentIndex.value).toBe(1)
  })
})

describe('useSceneHistory / 草稿', () => {
  it('markDirty 置脏并防抖写入草稿', () => {
    vi.useFakeTimers()
    try {
      const h = createHistory([{ content_text: 'a' }])
      h.markDirty()
      expect(h.dirty.value).toBe(true)
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
      vi.advanceTimersByTime(1000)
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) as string)
      expect(draft.dialogues).toEqual([{ content_text: 'a' }])
      expect(typeof draft.at).toBe('number')
    } finally {
      vi.useRealTimers()
    }
  })

  it('未置脏时 saveDraftNow 不写草稿', () => {
    const h = createHistory([{ content_text: 'a' }])
    h.saveDraftNow()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('clearDraft 取消脏标记并删除草稿', () => {
    vi.useFakeTimers()
    try {
      const h = createHistory([{ content_text: 'a' }])
      h.markDirty()
      vi.advanceTimersByTime(1000)
      expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
      h.clearDraft()
      expect(h.dirty.value).toBe(false)
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useSceneHistory / 文本输入历史', () => {
  it('聚焦记基线，停顿 800ms 后落一条历史', () => {
    vi.useFakeTimers()
    try {
      const h = createHistory([{ content_text: 'a' }])
      h.beginTextEdit()
      h.dialogues.value = [{ content_text: 'a1' }]
      h.queueTextHistory()
      expect(h.undoStack.value).toHaveLength(0)
      vi.advanceTimersByTime(800)
      expect(h.undoStack.value).toHaveLength(1)
      expect(h.undoStack.value[0].snapshot).toEqual([{ content_text: 'a' }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('多次输入只落一条历史', () => {
    vi.useFakeTimers()
    try {
      const h = createHistory([{ content_text: 'a' }])
      h.beginTextEdit()
      h.queueTextHistory()
      h.dialogues.value = [{ content_text: 'a1' }]
      h.queueTextHistory()
      h.dialogues.value = [{ content_text: 'a2' }]
      h.queueTextHistory()
      vi.advanceTimersByTime(800)
      expect(h.undoStack.value).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushTextHistory 立即落历史并清空基线', () => {
    const h = createHistory([{ content_text: 'a' }])
    h.beginTextEdit()
    h.dialogues.value = [{ content_text: 'a1' }]
    h.queueTextHistory()
    h.flushTextHistory()
    expect(h.undoStack.value).toHaveLength(1)
    // 基线已清空，再次 flush 不应重复入栈
    h.flushTextHistory()
    expect(h.undoStack.value).toHaveLength(1)
  })
})

describe('useSceneHistory / 草稿恢复', () => {
  it('没有草稿时不做任何事', async () => {
    const h = createHistory([{ content_text: 'a' }])
    await h.maybeRestoreDraft()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
  })

  it('草稿与当前内容一致时直接丢弃草稿', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), dialogues: [{ content_text: 'a' }] }))
    const h = createHistory([{ content_text: 'a' }])
    await h.maybeRestoreDraft()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('确认恢复后替换台词并置脏', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), dialogues: [{ content_text: 'draft' }] }))
    const h = createHistory([{ content_text: 'a' }])
    await h.maybeRestoreDraft()
    expect(h.dialogues.value).toEqual([{ content_text: 'draft' }])
    expect(h.dirty.value).toBe(true)
  })

  it('丢弃草稿时删除 localStorage 且不改台词', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), dialogues: [{ content_text: 'draft' }] }))
    const h = createHistory([{ content_text: 'a' }])
    await h.maybeRestoreDraft()
    expect(h.dialogues.value).toEqual([{ content_text: 'a' }])
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('草稿内容不是数组时忽略', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), dialogues: 'oops' }))
    const h = createHistory([{ content_text: 'a' }])
    await h.maybeRestoreDraft()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(h.dialogues.value).toEqual([{ content_text: 'a' }])
  })
})
