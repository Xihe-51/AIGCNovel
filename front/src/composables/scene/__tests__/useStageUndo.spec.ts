import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listNodeDirectives, createDirective, updateDirective, deleteDirective } from '@/api/directive'
import { useStageUndo } from '@/composables/scene/useStageUndo'
import { directivesFingerprint, stageUndoStorageKey } from '@/composables/scene/stageUndoStore'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/api/directive', () => ({
  listNodeDirectives: vi.fn(),
  createDirective: vi.fn(),
  updateDirective: vi.fn(),
  deleteDirective: vi.fn(),
}))

const listMock = vi.mocked(listNodeDirectives)
const createMock = vi.mocked(createDirective)
const updateMock = vi.mocked(updateDirective)
const deleteMock = vi.mocked(deleteDirective)
const successMock = vi.mocked(ElMessage.success)
const errorMock = vi.mocked(ElMessage.error)

const row = (id: number, extra: any = {}) => ({
  directive_id: id,
  directive_type: 'avatar',
  order_num: id,
  payload: { layer_id: 'center' },
  ...extra,
})

const createUndo = (options: { directives?: any[]; contentId?: number | null } = {}) => {
  const projectId = ref<string | number>(7)
  const currentDialogue = ref<any>(
    options.contentId === null ? null : { content_id: options.contentId ?? 101 }
  )
  const previewDirectives = ref<any[]>(options.directives ?? [row(1), row(2)])
  const loadPreviewDirectives = vi.fn().mockResolvedValue(undefined)
  const refreshDirectiveList = vi.fn().mockResolvedValue(undefined)
  const clearRedo = vi.fn()

  const undo = useStageUndo({
    projectId,
    currentDialogue,
    previewDirectives,
    loadPreviewDirectives,
    refreshDirectiveList,
    clearRedo,
  })

  return {
    undo,
    projectId,
    currentDialogue,
    previewDirectives,
    loadPreviewDirectives,
    refreshDirectiveList,
    clearRedo,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('snapshotStageDirectives', () => {
  it('用当前台词 id 入栈并记录 baseline', () => {
    const { undo } = createUndo()
    undo.snapshotStageDirectives()
    expect(undo.stageUndoStack.value).toHaveLength(1)
    expect(undo.stageUndoStack.value[0].contentId).toBe(101)
    expect(undo.stageUndoStack.value[0].baseline).toBe(directivesFingerprint([row(1), row(2)]))
  })

  it('显式传入 contentId 时以它为准', () => {
    const { undo } = createUndo()
    undo.snapshotStageDirectives(202)
    expect(undo.stageUndoStack.value[0].contentId).toBe(202)
  })

  it('入栈会清空台词重做栈，并同步 canUndoAvatar', () => {
    const { undo, clearRedo } = createUndo()
    expect(undo.canUndoAvatar.value).toBe(false)
    undo.snapshotStageDirectives()
    expect(clearRedo).toHaveBeenCalledTimes(1)
    expect(undo.canUndoAvatar.value).toBe(true)
  })

  it('超过 20 步时丢弃最旧的一步', () => {
    const { undo } = createUndo()
    for (let i = 0; i < 25; i += 1) undo.snapshotStageDirectives()
    expect(undo.stageUndoStack.value).toHaveLength(20)
    expect(undo.stageUndoStack.value[19].at).toBeGreaterThanOrEqual(undo.stageUndoStack.value[0].at)
  })
})

describe('markStageUndoApplied / dropStageUndo', () => {
  it('记录操作后指纹并持久化栈顶', () => {
    const { undo } = createUndo()
    undo.snapshotStageDirectives()
    undo.markStageUndoApplied()
    const top = undo.stageUndoStack.value[0]
    expect(top.after).toBe(directivesFingerprint([row(1), row(2)]))
    const saved = JSON.parse(localStorage.getItem(stageUndoStorageKey(7, 101))!)
    expect(saved.after).toBe(top.after)
  })

  it('空栈时调用不报错也不写存储', () => {
    const { undo } = createUndo()
    undo.markStageUndoApplied()
    expect(localStorage.getItem(stageUndoStorageKey(7, 101))).toBeNull()
  })

  it('dropStageUndo 弹掉刚入栈的快照', () => {
    const { undo } = createUndo()
    undo.snapshotStageDirectives()
    undo.dropStageUndo()
    expect(undo.stageUndoStack.value).toHaveLength(0)
  })
})

describe('restorePersistedStageUndo', () => {
  it('服务端仍是操作前状态时可恢复', () => {
    const { undo } = createUndo()
    undo.snapshotStageDirectives()
    undo.restorePersistedStageUndo(101)
    expect(undo.stageUndoStack.value).toHaveLength(1)
    expect(undo.stageUndoStack.value[0].rows).toHaveLength(2)
  })

  it('同一台词只保留一条，不重复入栈', () => {
    const { undo } = createUndo()
    undo.snapshotStageDirectives()
    undo.restorePersistedStageUndo(101)
    undo.restorePersistedStageUndo(101)
    expect(undo.stageUndoStack.value).toHaveLength(1)
  })

  it('服务端已被改动时丢弃快照并清键', () => {
    const { undo, previewDirectives } = createUndo()
    undo.snapshotStageDirectives()
    undo.markStageUndoApplied()
    previewDirectives.value = [row(9)]
    undo.restorePersistedStageUndo(101)
    expect(undo.stageUndoStack.value).toHaveLength(1)
    expect(localStorage.getItem(stageUndoStorageKey(7, 101))).toBeNull()
  })

  it('没有持久化记录时什么也不做', () => {
    const { undo } = createUndo()
    undo.restorePersistedStageUndo(101)
    expect(undo.stageUndoStack.value).toHaveLength(0)
  })

  it('contentId 为空时直接返回', () => {
    const { undo } = createUndo()
    undo.restorePersistedStageUndo(null)
    expect(undo.stageUndoStack.value).toHaveLength(0)
  })
})

describe('undoAvatar', () => {
  it('删除快照之外的多余指令，恢复快照内指令，并清空持久化', async () => {
    const { undo, loadPreviewDirectives, refreshDirectiveList } = createUndo()
    undo.snapshotStageDirectives()
    undo.markStageUndoApplied()
    listMock.mockResolvedValue([row(1), row(2), row(3)] as any)

    await undo.undoAvatar()

    expect(deleteMock).toHaveBeenCalledWith(7, 3)
    expect(updateMock).toHaveBeenCalledWith(7, 1, expect.objectContaining({ order_num: 1 }))
    expect(updateMock).toHaveBeenCalledWith(7, 2, expect.objectContaining({ order_num: 2 }))
    expect(loadPreviewDirectives).toHaveBeenCalledWith(101)
    expect(refreshDirectiveList).toHaveBeenCalledTimes(1)
    expect(successMock).toHaveBeenCalled()
    expect(undo.stageUndoStack.value).toHaveLength(0)
    expect(localStorage.getItem(stageUndoStorageKey(7, 101))).toBeNull()
  })

  it('快照里有而服务端已删的指令重新建回来', async () => {
    const { undo } = createUndo()
    undo.snapshotStageDirectives()
    listMock.mockResolvedValue([row(1)] as any)

    await undo.undoAvatar()

    expect(createMock).toHaveBeenCalledWith(7, expect.objectContaining({
      content_id: 101,
      directive_type: 'avatar',
    }))
  })

  it('空栈时直接返回，不请求接口', async () => {
    const { undo } = createUndo()
    await undo.undoAvatar()
    expect(listMock).not.toHaveBeenCalled()
  })

  it('接口失败时提示并保留栈内状态已弹出的事实', async () => {
    const { undo } = createUndo()
    undo.snapshotStageDirectives()
    listMock.mockRejectedValue(new Error('boom'))

    await undo.undoAvatar()

    expect(errorMock).toHaveBeenCalledWith('撤销失败：boom')
    expect(undo.stageUndoStack.value).toHaveLength(0)
  })
})
