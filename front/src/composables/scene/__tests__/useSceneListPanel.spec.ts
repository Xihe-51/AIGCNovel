import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  LAST_SCENE_PREFIX,
  chooseInitialScene,
  isDropAfter,
  nextSceneOrder,
  useSceneListPanel,
} from '@/composables/scene/useSceneListPanel'
import {
  createScene,
  deleteScene,
  duplicateScene,
  getScenes,
  updateScene,
} from '@/api/scenes'
import { getProjectOutline } from '@/api/outline'
import type { Scene } from '@/api/scenes'
import { ElMessage, ElMessageBox } from 'element-plus'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

vi.mock('@/api/scenes', () => ({
  getScenes: vi.fn(),
  createScene: vi.fn(),
  updateScene: vi.fn(),
  deleteScene: vi.fn(),
  duplicateScene: vi.fn(),
}))

vi.mock('@/api/outline', () => ({
  getProjectOutline: vi.fn(),
}))

const getScenesMock = vi.mocked(getScenes)
const createSceneMock = vi.mocked(createScene)
const updateSceneMock = vi.mocked(updateScene)
const deleteSceneMock = vi.mocked(deleteScene)
const duplicateSceneMock = vi.mocked(duplicateScene)
const outlineMock = vi.mocked(getProjectOutline)
const successMock = vi.mocked(ElMessage.success)
const errorMock = vi.mocked(ElMessage.error)
const confirmMock = vi.mocked(ElMessageBox.confirm)

function scene(id: number, order: number, extra: Partial<Scene> = {}): Scene {
  return {
    project_id: 7,
    scene_id: id,
    title: `场景${id}`,
    background_url: '',
    music_url: '',
    description: '',
    order_num: order,
    created_at: '2026-01-01',
    ...extra,
  }
}

interface SetupOptions {
  scenes?: Scene[]
  activeSceneId?: string | number
  batchMode?: boolean
  projectId?: string | number
}

function setup(options: SetupOptions = {}) {
  const projectId = ref<string | number>(options.projectId ?? 7)
  const activeSceneId = ref<string | number | undefined>(options.activeSceneId)
  const batchMode = ref(!!options.batchMode)
  const onSelect = vi.fn()
  const onCreated = vi.fn()
  const onDeleted = vi.fn()
  const reloadChapters = vi.fn().mockResolvedValue(undefined)

  const panel = useSceneListPanel({
    projectId,
    activeSceneId: () => activeSceneId.value,
    batchMode: () => batchMode.value,
    reloadChapters,
    onSelect,
    onCreated,
    onDeleted,
  })
  if (options.scenes) panel.scenes.value = options.scenes

  return { panel, projectId, activeSceneId, batchMode, onSelect, onCreated, onDeleted, reloadChapters }
}

interface DragInit {
  clientY?: number
  currentTarget?: Element | null
}

function dragEvent(init: DragInit = {}) {
  const dataTransfer = {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: vi.fn(),
    getData: vi.fn(),
    clearData: vi.fn(),
  }
  const event = {
    clientY: init.clientY ?? 0,
    currentTarget: init.currentTarget ?? null,
    dataTransfer,
    preventDefault: vi.fn(),
  }
  return { event: event as unknown as DragEvent, dataTransfer, preventDefault: event.preventDefault }
}

function node(rect: { top: number; height: number }) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () =>
    ({ top: rect.top, height: rect.height } as DOMRect)
  return el
}

describe('nextSceneOrder', () => {
  it('空列表从 0 开始', () => {
    expect(nextSceneOrder([])).toBe(0)
  })

  it('取当前最大序号', () => {
    expect(nextSceneOrder([{ order_num: 1 }, { order_num: 5 }, { order_num: 3 }])).toBe(5)
  })

  it('序号非法时按 0 处理', () => {
    expect(nextSceneOrder([{ order_num: Number.NaN }, { order_num: 4 }])).toBe(4)
  })
})

describe('isDropAfter', () => {
  it('拿不到 rect 时默认插到前面', () => {
    expect(isDropAfter(999, null)).toBe(false)
    expect(isDropAfter(999, undefined)).toBe(false)
  })

  it('落在条目上半区插到前面', () => {
    expect(isDropAfter(120, { top: 100, height: 80 })).toBe(false)
  })

  it('落在条目下半区插到后面', () => {
    expect(isDropAfter(160, { top: 100, height: 80 })).toBe(true)
  })

  it('正好压在中线上算后面', () => {
    expect(isDropAfter(140, { top: 100, height: 80 })).toBe(false)
    expect(isDropAfter(141, { top: 100, height: 80 })).toBe(true)
  })
})

describe('chooseInitialScene', () => {
  const list = [scene(1, 1), scene(2, 2), scene(3, 3)]

  it('空列表返回 null', () => {
    expect(chooseInitialScene([], '', null)).toBeNull()
  })

  it('优先返回上次编辑的场景', () => {
    const counts = new Map([[1, 5]])
    expect(chooseInitialScene(list, '2', counts)?.scene_id).toBe(2)
  })

  it('没有历史时挑第一个有内容的场景', () => {
    const counts = new Map([
      [1, 0],
      [2, 3],
      [3, 4],
    ])
    expect(chooseInitialScene(list, '', counts)?.scene_id).toBe(2)
  })

  it('全部为空场景时回落到第一个', () => {
    const counts = new Map([
      [1, 0],
      [2, 0],
    ])
    expect(chooseInitialScene(list, '', counts)?.scene_id).toBe(1)
  })

  it('还没拿到大纲时回落到第一个', () => {
    expect(chooseInitialScene(list, '404', null)?.scene_id).toBe(1)
  })
})

describe('useSceneListPanel 基础状态', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    updateSceneMock.mockResolvedValue(scene(1, 1))
  })

  it('按 order_num 升序派生 sortedScenes', () => {
    const { panel } = setup({ scenes: [scene(3, 3), scene(1, 1), scene(2, 2)] })
    expect(panel.sortedScenes.value.map(s => s.scene_id)).toEqual([1, 2, 3])
  })

  it('isActive 兼容字符串与数字', () => {
    const { panel } = setup({ activeSceneId: '3' })
    expect(panel.isActive(3)).toBe(true)
    expect(panel.isActive(4)).toBe(false)
  })

  it('没有选中场景时 isActive 恒为 false', () => {
    const { panel } = setup()
    expect(panel.isActive(1)).toBe(false)
  })

  it('缺图标记按 scene_id 去重', () => {
    const { panel } = setup()
    panel.markThumbBroken(5)
    panel.markThumbBroken(5)
    panel.markThumbBroken(6)
    expect(panel.brokenThumbs.value).toEqual([5, 6])
  })
})

describe('useSceneListPanel 拖拽排序', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    updateSceneMock.mockResolvedValue(scene(1, 1))
  })

  it('批量模式下不开始拖拽', () => {
    const { panel } = setup({ scenes: [scene(1, 1)], batchMode: true })
    const { event, dataTransfer } = dragEvent()

    panel.onDragStart(panel.scenes.value[0], event)

    expect(panel.dragId.value).toBeNull()
    expect(dataTransfer.setData).not.toHaveBeenCalled()
  })

  it('开始拖拽记录 scene_id 并写入 text/plain', () => {
    const { panel } = setup({ scenes: [scene(1, 1)] })
    const { event, dataTransfer } = dragEvent()

    panel.onDragStart(panel.scenes.value[0], event)

    expect(panel.dragId.value).toBe(1)
    expect(dataTransfer.effectAllowed).toBe('move')
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '1')
  })

  it('没有拖拽源时 dragover 不响应', () => {
    const { panel } = setup({ scenes: [scene(1, 1), scene(2, 2)] })
    const { event, preventDefault } = dragEvent({ currentTarget: node({ top: 0, height: 100 }) })

    panel.onDragOver(panel.scenes.value[1], event)

    expect(preventDefault).not.toHaveBeenCalled()
    expect(panel.dragOverId.value).toBeNull()
  })

  it('拖到自己身上不响应', () => {
    const { panel } = setup({ scenes: [scene(1, 1)] })
    const start = dragEvent().event
    panel.onDragStart(panel.scenes.value[0], start)
    const { event, preventDefault } = dragEvent({ currentTarget: node({ top: 0, height: 100 }) })

    panel.onDragOver(panel.scenes.value[0], event)

    expect(preventDefault).not.toHaveBeenCalled()
    expect(panel.dragOverId.value).toBeNull()
  })

  it('落在目标下半区标记为插到后面', () => {
    const { panel } = setup({ scenes: [scene(1, 1), scene(2, 2)] })
    panel.onDragStart(panel.scenes.value[0], dragEvent().event)
    const { event, preventDefault, dataTransfer } = dragEvent({
      clientY: 90,
      currentTarget: node({ top: 0, height: 100 }),
    })

    panel.onDragOver(panel.scenes.value[1], event)

    expect(preventDefault).toHaveBeenCalled()
    expect(dataTransfer.dropEffect).toBe('move')
    expect(panel.dragOverId.value).toBe(2)
    expect(panel.dropAfter.value).toBe(true)
  })

  it('落在目标上半区标记为插到前面', () => {
    const { panel } = setup({ scenes: [scene(1, 1), scene(2, 2)] })
    panel.onDragStart(panel.scenes.value[0], dragEvent().event)
    const { event } = dragEvent({ clientY: 10, currentTarget: node({ top: 0, height: 100 }) })

    panel.onDragOver(panel.scenes.value[1], event)

    expect(panel.dragOverId.value).toBe(2)
    expect(panel.dropAfter.value).toBe(false)
  })

  it('没有 currentTarget 时按插到前面处理', () => {
    const { panel } = setup({ scenes: [scene(1, 1), scene(2, 2)] })
    panel.onDragStart(panel.scenes.value[0], dragEvent().event)
    const { event } = dragEvent({ clientY: 90 })

    panel.onDragOver(panel.scenes.value[1], event)

    expect(panel.dragOverId.value).toBe(2)
    expect(panel.dropAfter.value).toBe(false)
  })

  it('dragleave 只清理命中的目标', () => {
    const { panel } = setup({ scenes: [scene(1, 1), scene(2, 2)] })
    panel.onDragStart(panel.scenes.value[0], dragEvent().event)
    panel.onDragOver(
      panel.scenes.value[1],
      dragEvent({ clientY: 90, currentTarget: node({ top: 0, height: 100 }) }).event
    )

    panel.onDragLeave(panel.scenes.value[0])
    expect(panel.dragOverId.value).toBe(2)

    panel.onDragLeave(panel.scenes.value[1])
    expect(panel.dragOverId.value).toBeNull()
    expect(panel.dropAfter.value).toBe(false)
  })

  it('落点后本地顺序立即生效并逐条持久化', async () => {
    const { panel } = setup({ scenes: [scene(1, 1), scene(2, 2), scene(3, 3)] })
    panel.onDragStart(panel.scenes.value[0], dragEvent().event)
    panel.onDragOver(
      panel.scenes.value[2],
      dragEvent({ clientY: 10, currentTarget: node({ top: 0, height: 100 }) }).event
    )

    await panel.onDrop(panel.scenes.value[2])

    expect(panel.scenes.value.map(s => s.scene_id)).toEqual([2, 1, 3])
    expect(updateSceneMock).toHaveBeenCalledTimes(3)
    expect(updateSceneMock).toHaveBeenCalledWith(1, { order_num: 2 })
    expect(panel.savingOrder.value).toBe(false)
    expect(panel.dragId.value).toBeNull()
    expect(panel.dragOverId.value).toBeNull()
  })

  it('批量模式下忽略落点', async () => {
    const { panel } = setup({ scenes: [scene(1, 1), scene(2, 2)], batchMode: true })

    await panel.onDrop(panel.scenes.value[1])

    expect(updateSceneMock).not.toHaveBeenCalled()
    expect(panel.scenes.value.map(s => s.scene_id)).toEqual([1, 2])
  })

  it('没有拖拽源时落点不做任何事', async () => {
    const { panel } = setup({ scenes: [scene(1, 1), scene(2, 2)] })

    await panel.onDrop(panel.scenes.value[1])

    expect(updateSceneMock).not.toHaveBeenCalled()
  })

  it('持久化失败时提示并重新拉取恢复原顺序', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    updateSceneMock.mockRejectedValueOnce(new Error('boom'))
    getScenesMock.mockResolvedValueOnce([scene(2, 1), scene(1, 2)])
    const { panel } = setup({ scenes: [scene(1, 1), scene(2, 2)], activeSceneId: 1 })
    panel.onDragStart(panel.scenes.value[1], dragEvent().event)

    await panel.onDrop(panel.scenes.value[0])

    expect(errorMock).toHaveBeenCalledWith('保存场景顺序失败，已恢复原顺序')
    expect(getScenesMock).toHaveBeenCalledTimes(1)
    expect(panel.scenes.value.map(s => s.scene_id)).toEqual([2, 1])
    expect(panel.savingOrder.value).toBe(false)
  })
})

describe('useSceneListPanel 加载与初始场景', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    updateSceneMock.mockResolvedValue(scene(1, 1))
  })

  it('缺少项目 ID 时直接给出错误，不发请求', async () => {
    const { panel } = setup({ projectId: '' })

    await panel.fetchScenes()

    expect(getScenesMock).not.toHaveBeenCalled()
    expect(panel.error.value).toBe('缺少项目ID，无法获取场景')
  })

  it('加载成功后刷新章节并重置缺图标记', async () => {
    getScenesMock.mockResolvedValueOnce([scene(1, 1)])
    const { panel, reloadChapters } = setup({ activeSceneId: 1 })
    panel.brokenThumbs.value = [1]

    await panel.fetchScenes()

    expect(panel.scenes.value.map(s => s.scene_id)).toEqual([1])
    expect(reloadChapters).toHaveBeenCalledTimes(1)
    expect(panel.brokenThumbs.value).toEqual([])
    expect(panel.loading.value).toBe(false)
    expect(panel.error.value).toBeNull()
  })

  it('加载失败时清空列表并给出错误文案', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getScenesMock.mockRejectedValueOnce(new Error('500'))
    const { panel } = setup({ activeSceneId: 1 })

    await panel.fetchScenes()

    expect(panel.error.value).toBe('场景加载失败')
    expect(panel.scenes.value).toEqual([])
    expect(panel.loading.value).toBe(false)
  })

  it('没有选中项时自动打开上次编辑的场景', async () => {
    getScenesMock.mockResolvedValueOnce([scene(1, 1), scene(3, 3)])
    localStorage.setItem(`${LAST_SCENE_PREFIX}7`, '3')
    const { panel, onSelect } = setup()

    await panel.fetchScenes()

    expect(onSelect).toHaveBeenCalledWith('3')
    expect(outlineMock).not.toHaveBeenCalled()
  })

  it('没有历史记录时按大纲挑第一个有内容的场景', async () => {
    getScenesMock.mockResolvedValueOnce([scene(1, 1), scene(3, 3)])
    outlineMock.mockResolvedValueOnce({
      chapters: [{ scenes: [{ scene_id: 1, node_count: 0 }] }],
      ungrouped: [{ scene_id: 3, node_count: 2 }],
    } as any)
    const { panel, onSelect } = setup()

    await panel.fetchScenes()

    expect(onSelect).toHaveBeenCalledWith('3')
  })

  it('大纲读取失败时回落到第一个场景', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getScenesMock.mockResolvedValueOnce([scene(1, 1), scene(3, 3)])
    outlineMock.mockRejectedValueOnce(new Error('no outline'))
    const { panel, onSelect } = setup()

    await panel.fetchScenes()

    expect(onSelect).toHaveBeenCalledWith('1')
  })

  it('已有选中场景时不再自动选择', async () => {
    getScenesMock.mockResolvedValueOnce([scene(1, 1)])
    const { panel, onSelect } = setup({ activeSceneId: 1 })

    await panel.fetchScenes()

    expect(onSelect).not.toHaveBeenCalled()
    expect(outlineMock).not.toHaveBeenCalled()
  })
})

describe('useSceneListPanel 新建 / 复制 / 删除', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    updateSceneMock.mockResolvedValue(scene(1, 1))
  })

  it('新建场景用最大序号 +1', async () => {
    createSceneMock.mockResolvedValueOnce(scene(9, 3))
    const { panel, onCreated, onSelect } = setup({ scenes: [scene(1, 1), scene(2, 2)] })

    await panel.handleAdd()

    expect(createSceneMock).toHaveBeenCalledWith({
      project_id: 7,
      title: '新场景 3',
      description: '',
      background_url: '',
      music_url: '',
      order_num: 3,
    })
    expect(panel.scenes.value.map(s => s.scene_id)).toEqual([1, 2, 9])
    expect(onCreated).toHaveBeenCalledWith('9')
    expect(onSelect).toHaveBeenCalledWith('9')
    expect(panel.creating.value).toBe(false)
  })

  it('新建进行中重复点击被忽略', async () => {
    createSceneMock.mockResolvedValue(scene(9, 1))
    const { panel } = setup()

    await Promise.all([panel.handleAdd(), panel.handleAdd()])

    expect(createSceneMock).toHaveBeenCalledTimes(1)
  })

  it('新建失败时提示并复位状态', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    createSceneMock.mockRejectedValueOnce(new Error('boom'))
    const { panel } = setup()

    await panel.handleAdd()

    expect(errorMock).toHaveBeenCalledWith('新建场景失败')
    expect(panel.creating.value).toBe(false)
    expect(panel.scenes.value).toEqual([])
  })

  it('复制场景后重新拉取并选中副本', async () => {
    duplicateSceneMock.mockResolvedValueOnce(scene(4, 2))
    getScenesMock.mockResolvedValueOnce([scene(1, 1), scene(4, 2)])
    const { panel, onCreated, onSelect } = setup({ scenes: [scene(1, 1)] })

    await panel.handleDuplicate(panel.scenes.value[0])

    expect(duplicateSceneMock).toHaveBeenCalledWith(1)
    expect(getScenesMock).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenCalledWith('4')
    expect(onSelect).toHaveBeenCalledWith('4')
    expect(successMock).toHaveBeenCalledWith('场景已复制（含对话、分支、演出）')
    expect(panel.duplicating.value).toBe(false)
  })

  it('复制失败时提示', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    duplicateSceneMock.mockRejectedValueOnce(new Error('boom'))
    const { panel } = setup({ scenes: [scene(1, 1)] })

    await panel.handleDuplicate(panel.scenes.value[0])

    expect(errorMock).toHaveBeenCalledWith('复制场景失败')
    expect(panel.duplicating.value).toBe(false)
  })

  it('删除确认框取消时什么都不做', async () => {
    confirmMock.mockRejectedValueOnce('cancel')
    const { panel } = setup({ scenes: [scene(1, 1)] })

    await panel.handleDelete(panel.scenes.value[0])

    expect(deleteSceneMock).not.toHaveBeenCalled()
  })

  it('删除成功后就地移除并重排剩余序号', async () => {
    confirmMock.mockResolvedValueOnce('confirm' as any)
    deleteSceneMock.mockResolvedValueOnce({ success: true })
    const { panel, onDeleted, onSelect } = setup({
      scenes: [scene(1, 1), scene(2, 2), scene(3, 3)],
      activeSceneId: 2,
    })

    await panel.handleDelete(panel.scenes.value[1])

    expect(deleteSceneMock).toHaveBeenCalledWith(2)
    expect(panel.scenes.value.map(s => s.scene_id)).toEqual([1, 3])
    expect(onDeleted).toHaveBeenCalledWith('2')
    expect(updateSceneMock).toHaveBeenCalledWith(3, { order_num: 2 })
    expect(onSelect).toHaveBeenCalledWith('1')
    expect(successMock).toHaveBeenCalledWith('场景已删除')
  })

  it('删除的不是当前场景时不改动选中项', async () => {
    confirmMock.mockResolvedValueOnce('confirm' as any)
    deleteSceneMock.mockResolvedValueOnce({ success: true })
    const { panel, onSelect } = setup({
      scenes: [scene(1, 1), scene(2, 2)],
      activeSceneId: 1,
    })

    await panel.handleDelete(panel.scenes.value[1])

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('删除最后一条后选中项清空', async () => {
    confirmMock.mockResolvedValueOnce('confirm' as any)
    deleteSceneMock.mockResolvedValueOnce({ success: true })
    const { panel, onSelect } = setup({ scenes: [scene(1, 1)], activeSceneId: 1 })

    await panel.handleDelete(panel.scenes.value[0])

    expect(onSelect).toHaveBeenCalledWith('')
  })

  it('删除接口失败时提示且不移除条目', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    confirmMock.mockResolvedValueOnce('confirm' as any)
    deleteSceneMock.mockRejectedValueOnce(new Error('boom'))
    const { panel } = setup({ scenes: [scene(1, 1), scene(2, 2)], activeSceneId: 1 })

    await panel.handleDelete(panel.scenes.value[0])

    expect(errorMock).toHaveBeenCalledWith('删除场景失败')
    expect(panel.scenes.value.map(s => s.scene_id)).toEqual([1, 2])
  })
})
