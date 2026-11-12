import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import {
  pickUndoAction,
  shouldResetStageUndo,
  topOf,
  useSceneStageSync,
} from '@/composables/scene/useSceneStageSync'
import { ElMessage } from 'element-plus'
import { withSetup } from '@/__tests__/helpers'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const successMock = vi.mocked(ElMessage.success)

const createSync = (options: {
  current?: any
  undoStack?: any[]
  stageUndoStack?: any[]
} = {}) => {
  const currentDialogue = ref<any>(options.current === undefined ? { content_id: 1 } : options.current)
  const undoStack = ref<any[]>(options.undoStack ?? [])
  const stageUndoStack = ref<any[]>(options.stageUndoStack ?? [])
  const undoDialogue = vi.fn()
  const undoStage = vi.fn()
  const reloadPreviewDirectives = vi.fn().mockResolvedValue(undefined)
  const restorePersistedStageUndo = vi.fn()
  const bumpAssetNonce = vi.fn()

  const { result, wrapper } = withSetup(() => useSceneStageSync({
    currentDialogue,
    undoStack,
    stageUndoStack,
    undoDialogue,
    undoStage,
    reloadPreviewDirectives,
    restorePersistedStageUndo,
    bumpAssetNonce,
  }))

  return {
    result,
    wrapper,
    currentDialogue,
    undoStack,
    stageUndoStack,
    undoDialogue,
    undoStage,
    reloadPreviewDirectives,
    restorePersistedStageUndo,
    bumpAssetNonce,
  }
}

describe('topOf', () => {
  it('空栈返回 null，否则返回最后一个元素', () => {
    expect(topOf([])).toBeNull()
    expect(topOf([{ at: 1 }, { at: 2 }])).toEqual({ at: 2 })
  })
})

describe('pickUndoAction', () => {
  it('两个栈都为空时无可撤销操作', () => {
    expect(pickUndoAction(null, null)).toBe('none')
  })

  it('舞台操作时间更晚时撤销舞台', () => {
    expect(pickUndoAction({ at: 100 }, { at: 200 })).toBe('stage')
  })

  it('台词操作时间更晚时撤销台词', () => {
    expect(pickUndoAction({ at: 200 }, { at: 100 })).toBe('dialogue')
  })

  it('时间相同时优先舞台，避免被同刻台词快照吞掉', () => {
    expect(pickUndoAction({ at: 150 }, { at: 150 })).toBe('stage')
  })

  it('一方缺少 at 时按 0 参与比较', () => {
    expect(pickUndoAction({ at: 5 }, {})).toBe('dialogue')
    expect(pickUndoAction({}, { at: 5 })).toBe('stage')
  })

  it('只有一侧有快照时直接走该侧', () => {
    expect(pickUndoAction(null, { at: 1 })).toBe('stage')
    expect(pickUndoAction({ at: 1 }, null)).toBe('dialogue')
  })
})

describe('shouldResetStageUndo', () => {
  it('首次装载（prev 为 undefined）不清空', () => {
    expect(shouldResetStageUndo(undefined, 1)).toBe(false)
  })

  it('content_id 数字与字符串等价时不清空', () => {
    expect(shouldResetStageUndo(1, '1')).toBe(false)
  })

  it('切到另一条台词时清空', () => {
    expect(shouldResetStageUndo(1, 2)).toBe(true)
  })
})

describe('useSceneStageSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('canUndoAny 任一栈非空即可撤销', () => {
    expect(createSync().result.canUndoAny.value).toBe(false)
    expect(createSync({ stageUndoStack: [{ at: 1 }] }).result.canUndoAny.value).toBe(true)
    expect(createSync({ undoStack: [{ at: 1 }] }).result.canUndoAny.value).toBe(true)
  })

  it('undoLast 在两个栈都为空时不触发任何撤销', () => {
    const { result, undoDialogue, undoStage } = createSync()

    result.undoLast()

    expect(undoDialogue).not.toHaveBeenCalled()
    expect(undoStage).not.toHaveBeenCalled()
  })

  it('undoLast 撤销更近的舞台操作', () => {
    const { result, undoDialogue, undoStage } = createSync({
      undoStack: [{ at: 10 }],
      stageUndoStack: [{ at: 20 }],
    })

    result.undoLast()

    expect(undoStage).toHaveBeenCalledTimes(1)
    expect(undoDialogue).not.toHaveBeenCalled()
  })

  it('undoLast 撤销更近的台词操作', () => {
    const { result, undoDialogue, undoStage } = createSync({
      undoStack: [{ at: 30 }],
      stageUndoStack: [{ at: 20 }],
    })

    result.undoLast()

    expect(undoDialogue).toHaveBeenCalledTimes(1)
    expect(undoStage).not.toHaveBeenCalled()
  })

  it('hotReloadAssets 刷新素材戳并按当前台词重拉指令', () => {
    const { result, bumpAssetNonce, reloadPreviewDirectives } = createSync({
      current: { content_id: 9 },
    })

    result.hotReloadAssets()

    expect(bumpAssetNonce).toHaveBeenCalledTimes(1)
    expect(reloadPreviewDirectives).toHaveBeenLastCalledWith(9)
    expect(successMock).toHaveBeenCalledWith('已重新加载预览素材')
  })

  it('hotReloadAssets 没有当前台词时只刷新素材戳与提示', () => {
    const { result, bumpAssetNonce, reloadPreviewDirectives } = createSync({ current: null })
    reloadPreviewDirectives.mockClear()

    result.hotReloadAssets()

    expect(bumpAssetNonce).toHaveBeenCalledTimes(1)
    expect(reloadPreviewDirectives).not.toHaveBeenCalled()
    expect(successMock).toHaveBeenCalledWith('已重新加载预览素材')
  })

  it('syncPreviewIfCurrent 只在指令属于当前台词时刷新', () => {
    const { result, reloadPreviewDirectives } = createSync({ current: { content_id: 5 } })
    reloadPreviewDirectives.mockClear()

    result.syncPreviewIfCurrent(6)
    expect(reloadPreviewDirectives).not.toHaveBeenCalled()

    result.syncPreviewIfCurrent('5')
    expect(reloadPreviewDirectives).toHaveBeenCalledWith('5')
  })

  it('首次装载加载当前台词预览并恢复持久化撤销栈，不清空舞台栈', async () => {
    const { stageUndoStack, reloadPreviewDirectives, restorePersistedStageUndo } = createSync({
      current: { content_id: 3 },
      stageUndoStack: [{ at: 1 }],
    })
    await flushPromises()

    expect(reloadPreviewDirectives).toHaveBeenCalledWith(3)
    expect(restorePersistedStageUndo).toHaveBeenCalledWith(3)
    expect(stageUndoStack.value).toHaveLength(1)
  })

  it('切换台词清空舞台撤销栈并加载新台词', async () => {
    const { currentDialogue, stageUndoStack, reloadPreviewDirectives, restorePersistedStageUndo } =
      createSync({
        current: { content_id: 1 },
        stageUndoStack: [{ at: 1 }],
      })
    await flushPromises()
    reloadPreviewDirectives.mockClear()

    currentDialogue.value = { content_id: 2 }
    await nextTick()
    await flushPromises()

    expect(stageUndoStack.value).toHaveLength(0)
    expect(reloadPreviewDirectives).toHaveBeenCalledWith(2)
    expect(restorePersistedStageUndo).toHaveBeenLastCalledWith(2)
  })

  it('同一 content_id 的引用替换不清空舞台撤销栈', async () => {
    const { currentDialogue, stageUndoStack } = createSync({
      current: { content_id: 1 },
      stageUndoStack: [{ at: 1 }],
    })
    await flushPromises()

    currentDialogue.value = { content_id: '1' }
    await nextTick()

    expect(stageUndoStack.value).toHaveLength(1)
  })
})
