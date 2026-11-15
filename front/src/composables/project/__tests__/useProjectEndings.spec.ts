import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  describeEndingConditions,
  describeStoryNode,
  useProjectEndings,
} from '@/composables/project/useProjectEndings'
import { getStoryGraph } from '@/api/branch'
import { createEnding, deleteEnding, listEndings, updateEnding } from '@/api/ending'
import type { Ending, EndingPayload } from '@/api/ending'
import type { StoryGraph } from '@/api/branch'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

vi.mock('@/api/ending', () => ({
  listEndings: vi.fn(),
  createEnding: vi.fn(),
  updateEnding: vi.fn(),
  deleteEnding: vi.fn(),
}))

vi.mock('@/api/branch', () => ({
  getStoryGraph: vi.fn(),
}))

const makeEnding = (overrides: Partial<Ending> = {}): Ending => ({
  ending_id: 1,
  project_id: 7,
  title: '林瑶的告白',
  description: '雨停了',
  content_id: 12,
  conditions: [{ variable: 'love', op: '>=', value: 60 }],
  ...overrides,
})

const makeGraph = (nodes: StoryGraph['nodes']): StoryGraph => ({
  project_id: 7,
  nodes,
  edges: [],
  stats: { node_count: nodes.length, edge_count: 0, scene_count: 1 },
})

const createComposable = () => useProjectEndings({ projectId: () => 7 })

describe('describeStoryNode', () => {
  it('把场景、序号与正文摘要拼成一行可读文案', () => {
    expect(
      describeStoryNode({ scene_title: '雨夜', order_num: 3, content_text: '第一句\n  第二句' }, 12),
    ).toBe('雨夜 · #3 第一句 第二句')
  })

  it('正文超过 16 字时截断，避免下拉过长', () => {
    expect(describeStoryNode({ scene_title: '雨夜', order_num: 1, content_text: 'A'.repeat(30) }, 5)).toBe(
      `雨夜 · #1 ${'A'.repeat(16)}`,
    )
  })

  it('节点还没加载出来时退回 #id', () => {
    expect(describeStoryNode(null, 42)).toBe('#42')
    expect(describeStoryNode(undefined, 43)).toBe('#43')
  })
})

describe('describeEndingConditions', () => {
  it('没有条件时显示「无条件」', () => {
    expect(describeEndingConditions([])).toBe('无条件')
    expect(describeEndingConditions(null)).toBe('无条件')
    expect(describeEndingConditions(undefined)).toBe('无条件')
  })

  it('多个条件用「且」连接', () => {
    expect(
      describeEndingConditions([
        { variable: 'love', op: '>=', value: 60 },
        { variable: 'route_flag', op: '==', value: 1 },
      ]),
    ).toBe('love >= 60 且 route_flag == 1')
  })
})

describe('useProjectEndings', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('读取结局成功后填入列表', async () => {
    const rows = [makeEnding(), makeEnding({ ending_id: 2, title: '孤独结局' })]
    vi.mocked(listEndings).mockResolvedValue(rows)

    const { endings, fetchEndings } = createComposable()
    await fetchEndings()

    expect(listEndings).toHaveBeenCalledWith(7)
    expect(endings.value).toEqual(rows)
  })

  it('读取结局失败时降级为空列表并保留告警', async () => {
    vi.mocked(listEndings).mockRejectedValue(new Error('boom'))

    const { endings, fetchEndings } = createComposable()
    await fetchEndings()

    expect(endings.value).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('加载剧情节点后生成触发节点下拉与行文案', async () => {
    vi.mocked(getStoryGraph).mockResolvedValue(
      makeGraph([
        { content_id: 12, scene_title: '雨夜', order_num: 3, content_text: '你回来了' } as StoryGraph['nodes'][number],
      ]),
    )

    const { storyNodes, nodeOptions, nodeLabel, loadStoryNodes } = createComposable()
    await loadStoryNodes()

    expect(getStoryGraph).toHaveBeenCalledWith(7, false)
    expect(storyNodes.value).toHaveLength(1)
    expect(nodeOptions.value).toEqual([{ content_id: 12, label: '雨夜 · #3 你回来了' }])
    expect(nodeLabel(12)).toBe('雨夜 · #3 你回来了')
    expect(nodeLabel(99)).toBe('#99')
  })

  it('剧情节点加载失败时降级为空列表', async () => {
    vi.mocked(getStoryGraph).mockRejectedValue(new Error('boom'))

    const { storyNodes, nodeOptions, loadStoryNodes } = createComposable()
    await loadStoryNodes()

    expect(storyNodes.value).toEqual([])
    expect(nodeOptions.value).toEqual([])
  })

  it('新建结局先刷新节点再打开弹窗，并清空编辑态', async () => {
    vi.mocked(getStoryGraph).mockResolvedValue(makeGraph([]))

    const { endingDialogVisible, endingInitial, editingEndingId, openCreateEnding } = createComposable()
    editingEndingId.value = 5
    endingInitial.value = makeEnding()

    await openCreateEnding()

    expect(getStoryGraph).toHaveBeenCalledTimes(1)
    expect(endingDialogVisible.value).toBe(true)
    expect(editingEndingId.value).toBeNull()
    expect(endingInitial.value).toBeNull()
  })

  it('编辑结局带上初始行并刷新节点', async () => {
    vi.mocked(getStoryGraph).mockResolvedValue(makeGraph([]))

    const { endingDialogVisible, endingInitial, editingEndingId, openEditEnding } = createComposable()
    const row = makeEnding({ ending_id: 8 })

    await openEditEnding(row)

    expect(endingDialogVisible.value).toBe(true)
    expect(editingEndingId.value).toBe(8)
    expect(endingInitial.value).toStrictEqual(row)
    expect(getStoryGraph).toHaveBeenCalledTimes(1)
  })

  it('保存结局走编辑分支：更新后关闭弹窗并刷新', async () => {
    vi.mocked(updateEnding).mockResolvedValue(makeEnding())
    vi.mocked(listEndings).mockResolvedValue([makeEnding()])

    const { endingDialogVisible, endingSaving, handleSaveEnding } = createComposable()
    endingDialogVisible.value = true
    const payload: EndingPayload = { title: '林瑶的告白', description: '', content_id: 12, conditions: [] }

    await handleSaveEnding({ endingId: 3, payload })

    expect(updateEnding).toHaveBeenCalledWith(7, 3, payload)
    expect(createEnding).not.toHaveBeenCalled()
    expect(endingDialogVisible.value).toBe(false)
    expect(listEndings).toHaveBeenCalledTimes(1)
    expect(endingSaving.value).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith('结局已更新')
  })

  it('保存结局走新建分支：创建后关闭弹窗并刷新', async () => {
    vi.mocked(createEnding).mockResolvedValue(makeEnding())
    vi.mocked(listEndings).mockResolvedValue([makeEnding()])

    const { endingDialogVisible, handleSaveEnding } = createComposable()
    endingDialogVisible.value = true
    const payload: EndingPayload = { title: '孤独结局', content_id: 9, conditions: [] }

    await handleSaveEnding({ endingId: null, payload })

    expect(createEnding).toHaveBeenCalledWith(7, payload)
    expect(updateEnding).not.toHaveBeenCalled()
    expect(endingDialogVisible.value).toBe(false)
    expect(listEndings).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('结局已创建')
  })

  it('保存结局失败时保留弹窗并提示错误', async () => {
    vi.mocked(createEnding).mockRejectedValue({ response: { data: { message: '节点已被删除' } } })

    const { endingDialogVisible, handleSaveEnding } = createComposable()
    endingDialogVisible.value = true

    await handleSaveEnding({
      endingId: null,
      payload: { title: '孤独结局', content_id: 9, conditions: [] },
    })

    expect(endingDialogVisible.value).toBe(true)
    expect(ElMessage.error).toHaveBeenCalledWith('节点已被删除')
  })

  it('删除结局确认后落库并刷新', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    vi.mocked(deleteEnding).mockResolvedValue(undefined as any)
    vi.mocked(listEndings).mockResolvedValue([])

    const { removeEnding } = createComposable()
    await removeEnding(makeEnding({ ending_id: 9, title: '林瑶的告白' }))

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('删除结局「林瑶的告白」？', '删除结局', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    expect(deleteEnding).toHaveBeenCalledWith(7, 9)
    expect(listEndings).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('结局已删除')
  })

  it('删除结局取消时静默退出，不落库也不报错', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')

    const { removeEnding } = createComposable()
    await removeEnding(makeEnding({ ending_id: 9 }))

    expect(deleteEnding).not.toHaveBeenCalled()
    expect(listEndings).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })
})
