import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { buildDirectiveTarget, useSceneDirectives } from '@/composables/scene/useSceneDirectives'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

function createDirectives(list: any[] = []) {
  const dialogues = ref<any[]>(list)
  const currentDialogueIndex = ref(0)
  const directiveDialogRef = ref<any>(null)
  const recordStageUndo = vi.fn()
  const syncPreviewIfCurrent = vi.fn()
  const directives = useSceneDirectives({
    dialogues,
    currentDialogueIndex,
    directiveDialogRef,
    recordStageUndo,
    syncPreviewIfCurrent,
  })
  return { directives, dialogues, currentDialogueIndex, directiveDialogRef, recordStageUndo, syncPreviewIfCurrent }
}

describe('buildDirectiveTarget', () => {
  it('描述类型显示为旁白', () => {
    expect(buildDirectiveTarget({ content_type: '描述', content_text: '风声渐起' })).toBe('旁白：风声渐起')
  })

  it('没有类型时回落为对话', () => {
    expect(buildDirectiveTarget({ content_text: '你好' })).toBe('对话：你好')
  })

  it('文本超过 18 字时截断', () => {
    const text = '一二三四五六七八九十一二三四五六七八九十'
    expect(buildDirectiveTarget({ content_type: '对话', content_text: text })).toBe('对话：一二三四五六七八九十一二三四五六七八')
  })

  it('空文本显示占位', () => {
    expect(buildDirectiveTarget({ content_type: '独白' })).toBe('独白：（空）')
  })
})

describe('useSceneDirectives', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未保存的对话给出提示且不打开弹窗', () => {
    const { directives } = createDirectives([{ content_text: '草稿' }])
    directives.openDirectiveDialog(0)
    expect(ElMessage.warning).toHaveBeenCalledWith('先保存这条对话，再配置演出')
    expect(directives.directiveDialogVisible.value).toBe(false)
  })

  it('索引越界时同样提示', () => {
    const { directives } = createDirectives([])
    directives.openDirectiveDialog(3)
    expect(ElMessage.warning).toHaveBeenCalledWith('先保存这条对话，再配置演出')
    expect(directives.directiveDialogVisible.value).toBe(false)
  })

  it('正常打开时记录 content_id 并让预览跟随该条', () => {
    const { directives, currentDialogueIndex } = createDirectives([
      { content_id: 11, content_type: '对话', content_text: '第一句' },
      { content_id: 22, content_type: '描述', content_text: '夜色沉沉' },
    ])
    directives.openDirectiveDialog(1)
    expect(currentDialogueIndex.value).toBe(1)
    expect(directives.directiveContentId.value).toBe(22)
    expect(directives.directiveTarget.value).toBe('旁白：夜色沉沉')
    expect(directives.directiveDialogVisible.value).toBe(true)
  })

  it('指令变更后入撤销栈并刷新当前预览', () => {
    const { directives, recordStageUndo, syncPreviewIfCurrent } = createDirectives()
    directives.handleDirectivesChanged({ contentId: 22, before: [{ id: 1 }], after: [{ id: 2 }] })
    expect(recordStageUndo).toHaveBeenCalledWith(22, [{ id: 1 }], [{ id: 2 }])
    expect(syncPreviewIfCurrent).toHaveBeenCalledWith(22)
  })

  it('刷新列表时调用弹窗的 reload', async () => {
    const { directives, directiveDialogRef } = createDirectives()
    const reload = vi.fn().mockResolvedValue(undefined)
    directiveDialogRef.value = { reload }
    await directives.refreshDirectiveList()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('弹窗未挂载时刷新不报错', async () => {
    const { directives, directiveDialogRef } = createDirectives()
    directiveDialogRef.value = null
    await expect(directives.refreshDirectiveList()).resolves.toBeUndefined()
  })
})
