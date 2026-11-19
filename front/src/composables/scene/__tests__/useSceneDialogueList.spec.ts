import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createDialogueDraft,
  mergeSavedDialogue,
  moveDialogue,
  omitDialogueEffects,
  renumberDialogues,
  savedDialogueIds,
  useSceneDialogueList,
} from '@/composables/scene/useSceneDialogueList'
import { withSetup } from '@/__tests__/helpers'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

const successMock = vi.mocked(ElMessage.success)
const errorMock = vi.mocked(ElMessage.error)
const confirmMock = vi.mocked(ElMessageBox.confirm)

const dialogue = (overrides: Record<string, any> = {}) => ({
  content_id: undefined as any,
  content_text: '台词',
  order_num: 1,
  character_id: 'c1',
  avatar_id: 'a1',
  _choices: [{ text: '选A' }],
  _effects: { c1: { hp: 1 } },
  ...overrides,
})

const createList = (options: {
  dialogues?: any[]
  dirty?: boolean
} = {}) => {
  const dialogues = ref<any[]>(options.dialogues ?? [dialogue({ content_id: 1 }), dialogue({ content_id: 2 })])
  const scene = ref<any>({ project_id: 7, scene_id: 15, title: '第一幕' })
  const projectId = ref<any>(7)
  const loading = ref(false)
  const dirty = ref(options.dirty ?? false)
  const undoStack = ref<any[]>([{ at: 1 }])
  const redoStack = ref<any[]>([{ at: 2 }])
  const projectNodes = ref<any[]>([{ content_id: 1 }])
  const effectsMap = ref<Record<string, any>>({ 1: { hp: 10 }, 2: { hp: 20 } })
  const pushHistory = vi.fn()
  const markDirty = vi.fn(() => { dirty.value = true })
  const clearDraft = vi.fn()
  const clearSelection = vi.fn()
  const saveDialogues = vi.fn(async (d: any) => ({ ...d, content_id: d.content_id ?? 99 }))
  const deleteDialogueApi = vi.fn(async () => ({ success: true }))
  const reorderDialoguesApi = vi.fn(async () => ({ success: true, data: [] }))
  const createProjectVersion = vi.fn(async () => ({ success: true }))

  const { result } = withSetup(() => useSceneDialogueList({
    dialogues,
    scene,
    projectId,
    getSceneId: () => 15,
    loading,
    dirty,
    undoStack,
    redoStack,
    projectNodes,
    effectsMap,
    pushHistory,
    markDirty,
    clearDraft,
    clearSelection,
    saveDialogues,
    deleteDialogueApi,
    reorderDialoguesApi,
    createProjectVersion,
  }))

  return {
    result,
    dialogues,
    scene,
    projectId,
    loading,
    dirty,
    undoStack,
    redoStack,
    projectNodes,
    effectsMap,
    pushHistory,
    markDirty,
    clearDraft,
    clearSelection,
    saveDialogues,
    deleteDialogueApi,
    reorderDialoguesApi,
    createProjectVersion,
  }
}

describe('createDialogueDraft', () => {
  it('透传场景归属并生成空内容的草稿', () => {
    const draft = createDialogueDraft({ project_id: 7, scene_id: 15 }, 3)

    expect(draft).toEqual({
      project_id: 7,
      scene_id: 15,
      content_type: '对话',
      content_text: '',
      order_num: 3,
      character_id: '',
      avatar_id: '',
    })
  })

  it('场景为空时不抛错', () => {
    expect(createDialogueDraft(null, 1)).toMatchObject({ project_id: undefined, order_num: 1 })
  })
})

describe('renumberDialogues', () => {
  it('按数组顺序重排 1..n', () => {
    const list = [{ content_id: 5 }, { content_id: 3 }, { content_id: 9 }]

    expect(renumberDialogues(list)).toBe(list)
    expect(list.map(d => d.order_num)).toEqual([1, 2, 3])
  })
})

describe('moveDialogue', () => {
  it('上移与相邻项交换并重排序号', () => {
    const list = [{ content_id: 1 }, { content_id: 2 }, { content_id: 3 }]

    expect(moveDialogue(list, 1, 'up')).toBe(true)
    expect(list.map(d => d.content_id)).toEqual([2, 1, 3])
    expect(list.map(d => d.order_num)).toEqual([1, 2, 3])
  })

  it('下移与相邻项交换并重排序号', () => {
    const list = [{ content_id: 1 }, { content_id: 2 }, { content_id: 3 }]

    expect(moveDialogue(list, 1, 'down')).toBe(true)
    expect(list.map(d => d.content_id)).toEqual([1, 3, 2])
  })

  it('首项上移 / 末项下移返回 false 且不改动列表', () => {
    const list = [{ content_id: 1 }, { content_id: 2 }]

    expect(moveDialogue(list, 0, 'up')).toBe(false)
    expect(moveDialogue(list, 1, 'down')).toBe(false)
    expect(list.map(d => d.content_id)).toEqual([1, 2])
  })

  it('下标非法时返回 false 且不改动列表', () => {
    const list = [{ content_id: 1 }, { content_id: 2 }]

    expect(moveDialogue(list, -1, 'up')).toBe(false)
    expect(moveDialogue(list, 0.5, 'down')).toBe(false)
    expect(moveDialogue(list, 5, 'up')).toBe(false)
    expect(list.map(d => d.content_id)).toEqual([1, 2])
  })
})

describe('mergeSavedDialogue', () => {
  it('服务端字段优先，本地分支与数值变化保留', () => {
    const previous = dialogue({ content_id: 1, _choices: [{ text: 'A' }], _effects: { c1: 1 } })
    const saved = { content_id: 1, content_text: '服务端文案', order_num: 2 }

    expect(mergeSavedDialogue(previous, saved)).toEqual({
      content_id: 1,
      content_text: '服务端文案',
      order_num: 2,
      _choices: [{ text: 'A' }],
      _effects: { c1: 1 },
    })
  })
})

describe('savedDialogueIds', () => {
  it('跳过新增未保存的台词', () => {
    const list = [{ content_id: 1 }, { content_id: undefined }, { content_id: 2 }]

    expect(savedDialogueIds(list)).toEqual([1, 2])
  })
})

describe('omitDialogueEffects', () => {
  it('返回去掉指定台词的新对象且不修改入参', () => {
    const effects = { 1: { hp: 1 }, 2: { hp: 2 } }
    const rest = omitDialogueEffects(effects, 1)

    expect(rest).toEqual({ 2: { hp: 2 } })
    expect(effects).toEqual({ 1: { hp: 1 }, 2: { hp: 2 } })
  })
})

describe('useSceneDialogueList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmMock.mockResolvedValue('confirm' as any)
  })

  it('换角色清空立绘并记录撤销与脏标记', () => {
    const ctx = createList()

    ctx.result.handleCharacterChange(1)

    expect(ctx.dialogues.value[1].avatar_id).toBe('')
    expect(ctx.dialogues.value[0].avatar_id).toBe('a1')
    expect(ctx.pushHistory).toHaveBeenCalledTimes(1)
    expect(ctx.markDirty).toHaveBeenCalledTimes(1)
  })

  it('新增台词追加草稿并取消选择', () => {
    const ctx = createList()

    ctx.result.addNewDialogue()

    expect(ctx.dialogues.value).toHaveLength(3)
    expect(ctx.dialogues.value[2]).toMatchObject({
      project_id: 7,
      scene_id: 15,
      content_type: '对话',
      order_num: 3,
      character_id: '',
      avatar_id: '',
    })
    expect(ctx.pushHistory).toHaveBeenCalledTimes(1)
    expect(ctx.clearSelection).toHaveBeenCalledTimes(1)
  })

  it('保存单条后回填服务端字段并补充可选跳转节点', async () => {
    const ctx = createList()
    ctx.saveDialogues.mockResolvedValueOnce({ content_id: 1, content_text: '已保存', order_num: 1 })

    await ctx.result.saveDialogue(0)
    await flushPromises()

    expect(ctx.dialogues.value[0]).toMatchObject({ content_text: '已保存', order_num: 1 })
    expect(ctx.dialogues.value[0]._choices).toEqual([{ text: '选A' }])
    expect(ctx.dialogues.value[0]._effects).toEqual({ c1: { hp: 1 } })
    expect(successMock).toHaveBeenCalledWith('对话保存成功')
    expect(ctx.loading.value).toBe(false)
  })

  it('保存新台词时按场景标题补进项目节点', async () => {
    const ctx = createList({ dialogues: [dialogue()] })
    ctx.saveDialogues.mockResolvedValueOnce({ content_id: 88, content_text: '新的' })

    await ctx.result.saveDialogue(0)

    expect(ctx.projectNodes.value.some(n => n.content_id === 88)).toBe(true)
    expect(ctx.projectNodes.value.find(n => n.content_id === 88).scene_title).toBe('第一幕')
  })

  it('保存失败提示错误并复位 loading', async () => {
    const ctx = createList()
    ctx.saveDialogues.mockRejectedValueOnce(new Error('网络断开'))

    await ctx.result.saveDialogue(0)

    expect(errorMock).toHaveBeenCalledWith('保存对话失败：网络断开')
    expect(ctx.loading.value).toBe(false)
  })

  it('保存下标不存在时静默返回', async () => {
    const ctx = createList()

    await ctx.result.saveDialogue(9)

    expect(ctx.saveDialogues).not.toHaveBeenCalled()
    expect(ctx.loading.value).toBe(false)
  })

  it('保存全部时逐条保存后重排、清草稿并建版本', async () => {
    const ctx = createList({ dialogues: [dialogue({ content_id: 1 }), dialogue({ content_id: 2 })] })

    await ctx.result.saveAllDialogues()

    expect(ctx.saveDialogues).toHaveBeenCalledTimes(2)
    expect(ctx.reorderDialoguesApi).toHaveBeenCalledWith(15, [1, 2])
    expect(ctx.clearDraft).toHaveBeenCalledTimes(1)
    expect(successMock).toHaveBeenCalledWith('已保存全部对话')
    expect(ctx.createProjectVersion).toHaveBeenCalledWith(7, '保存全部对话')
  })

  it('没有台词时保存全部不请求接口', async () => {
    const ctx = createList({ dialogues: [] })

    await ctx.result.saveAllDialogues()

    expect(ctx.saveDialogues).not.toHaveBeenCalled()
    expect(ctx.reorderDialoguesApi).not.toHaveBeenCalled()
  })

  it('删除已落库台词：确认后调接口并清空撤销栈', async () => {
    const ctx = createList()

    await ctx.result.deleteDialogue(0)

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(ctx.deleteDialogueApi).toHaveBeenCalledWith(1)
    expect(ctx.dialogues.value.map(d => d.content_id)).toEqual([2])
    expect(ctx.dialogues.value[0].order_num).toBe(1)
    expect(ctx.projectNodes.value.some(n => n.content_id === 1)).toBe(false)
    expect(ctx.effectsMap.value).toEqual({ 2: { hp: 20 } })
    expect(ctx.clearSelection).toHaveBeenCalledTimes(1)
    expect(ctx.undoStack.value).toEqual([])
    expect(ctx.redoStack.value).toEqual([])
    expect(ctx.clearDraft).toHaveBeenCalledTimes(1)
    expect(ctx.markDirty).not.toHaveBeenCalled()
    expect(successMock).toHaveBeenCalledTimes(1)
  })

  it('删除已落库台词前已有未保存改动时保留脏标记', async () => {
    const ctx = createList({ dirty: true })

    await ctx.result.deleteDialogue(0)

    expect(ctx.clearDraft).not.toHaveBeenCalled()
    expect(ctx.markDirty).toHaveBeenCalledTimes(1)
  })

  it('取消确认时不做任何改动', async () => {
    const ctx = createList()
    confirmMock.mockRejectedValueOnce('cancel')

    await ctx.result.deleteDialogue(0)

    expect(ctx.deleteDialogueApi).not.toHaveBeenCalled()
    expect(ctx.dialogues.value).toHaveLength(2)
    expect(ctx.clearSelection).not.toHaveBeenCalled()
  })

  it('删除接口失败时提示错误且保留列表', async () => {
    const ctx = createList()
    ctx.deleteDialogueApi.mockRejectedValueOnce(new Error('服务器错误'))

    await ctx.result.deleteDialogue(0)

    expect(errorMock).toHaveBeenCalledWith('删除对话失败：服务器错误')
    expect(ctx.dialogues.value).toHaveLength(2)
    expect(ctx.undoStack.value).toHaveLength(1)
  })

  it('删除未落库台词走本地撤销，不请求接口', async () => {
    const ctx = createList({ dialogues: [dialogue({ content_id: 1 }), dialogue()] })

    await ctx.result.deleteDialogue(1)

    expect(confirmMock).not.toHaveBeenCalled()
    expect(ctx.deleteDialogueApi).not.toHaveBeenCalled()
    expect(ctx.pushHistory).toHaveBeenCalledTimes(1)
    expect(ctx.markDirty).toHaveBeenCalledTimes(1)
    expect(ctx.dialogues.value).toHaveLength(1)
    expect(ctx.clearSelection).toHaveBeenCalledTimes(1)
    expect(ctx.undoStack.value).toHaveLength(1)
  })

  it('上移首条不产生改动', () => {
    const ctx = createList()

    ctx.result.moveDialogueUp(0)

    expect(ctx.pushHistory).not.toHaveBeenCalled()
    expect(ctx.dialogues.value.map(d => d.content_id)).toEqual([1, 2])
  })

  it('下移末条不产生改动', () => {
    const ctx = createList()

    ctx.result.moveDialogueDown(1)

    expect(ctx.pushHistory).not.toHaveBeenCalled()
    expect(ctx.dialogues.value.map(d => d.content_id)).toEqual([1, 2])
  })

  it('上移 / 下移交换相邻台词并取消选择', () => {
    const ctx = createList({ dialogues: [dialogue({ content_id: 1 }), dialogue({ content_id: 2 }), dialogue({ content_id: 3 })] })

    ctx.result.moveDialogueUp(2)
    expect(ctx.dialogues.value.map(d => d.content_id)).toEqual([1, 3, 2])
    expect(ctx.clearSelection).toHaveBeenCalledTimes(1)

    ctx.result.moveDialogueDown(0)
    expect(ctx.dialogues.value.map(d => d.content_id)).toEqual([3, 1, 2])
    expect(ctx.dialogues.value.map(d => d.order_num)).toEqual([1, 2, 3])
    expect(ctx.clearSelection).toHaveBeenCalledTimes(2)
    expect(ctx.pushHistory).toHaveBeenCalledTimes(2)
  })

  it('重排成功时用服务端列表覆盖', async () => {
    const ctx = createList()
    const reordered = [dialogue({ content_id: 2 }), dialogue({ content_id: 1 })]
    ctx.reorderDialoguesApi.mockResolvedValueOnce({ success: true, data: reordered })

    await ctx.result.reorderDialogues()

    expect(ctx.reorderDialoguesApi).toHaveBeenCalledWith(15, [1, 2])
    expect(ctx.dialogues.value).toEqual(reordered)
    expect(successMock).toHaveBeenCalledWith('对话已重新排序并保存')
    expect(ctx.loading.value).toBe(false)
  })

  it('重排返回失败时提示后端信息', async () => {
    const ctx = createList()
    ctx.reorderDialoguesApi.mockResolvedValueOnce({ success: false, message: '顺序非法' })

    await ctx.result.reorderDialogues()

    expect(errorMock).toHaveBeenCalledWith('重新排序失败：顺序非法')
  })

  it('重排抛错时提示网络错误', async () => {
    const ctx = createList()
    ctx.reorderDialoguesApi.mockRejectedValueOnce(new Error('超时'))

    await ctx.result.reorderDialogues()

    expect(errorMock).toHaveBeenCalledWith('重新排序失败：超时')
    expect(ctx.loading.value).toBe(false)
  })
})
