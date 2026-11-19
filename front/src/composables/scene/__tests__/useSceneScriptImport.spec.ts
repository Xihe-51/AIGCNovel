import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSceneScriptImport } from '@/composables/scene/useSceneScriptImport'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

function createImport(options: { dialogues?: any[]; characters?: any[] } = {}) {
  const dialogues = ref<any[]>(JSON.parse(JSON.stringify(options.dialogues ?? [])))
  const scene = ref({ project_id: 7, scene_id: 15 })
  const characters = ref<any[]>(options.characters ?? [])
  const pushHistory = vi.fn()
  const markDirty = vi.fn()
  const clearSelection = vi.fn()

  const importer = useSceneScriptImport({
    dialogues,
    scene,
    getCharacters: () => characters.value,
    pushHistory,
    markDirty,
    clearSelection,
  })

  return { ...importer, dialogues, characters, scene, pushHistory, markDirty, clearSelection }
}

beforeEach(() => {
  vi.mocked(ElMessage.success).mockReset()
  vi.mocked(ElMessage.warning).mockReset()
  vi.mocked(ElMessageBox.confirm).mockReset()
})

describe('useSceneScriptImport / 打开与空输入', () => {
  it('openScriptImport 打开弹窗', () => {
    const i = createImport()
    i.openScriptImport()
    expect(i.scriptImportVisible.value).toBe(true)
  })

  it('没有内容时提示且不改动台词', async () => {
    const i = createImport({ dialogues: [{ content_text: 'old' }] })
    await i.handleScriptImport({ mode: 'append', entries: [] })
    expect(ElMessage.warning).toHaveBeenCalledWith('没有可导入的内容')
    expect(i.dialogues.value).toHaveLength(1)
    expect(i.pushHistory).not.toHaveBeenCalled()
  })
})

describe('useSceneScriptImport / 追加模式', () => {
  it('按顺序追加并续接 order_num', async () => {
    const i = createImport({
      dialogues: [{ content_id: 1, content_text: 'old', order_num: 1 }],
      characters: [{ character_id: 100, name: '林瑶' }],
    })
    await i.handleScriptImport({
      mode: 'append',
      entries: [
        { name: '林瑶', text: '你好' },
        { text: '旁白一句' },
      ],
    })
    expect(i.dialogues.value).toHaveLength(3)
    expect(i.dialogues.value[1]).toEqual(expect.objectContaining({
      content_type: '对话',
      content_text: '你好',
      character_id: 100,
      avatar_id: '',
      order_num: 2,
      project_id: 7,
      scene_id: 15,
    }))
    expect(i.dialogues.value[2]).toEqual(expect.objectContaining({
      content_type: '描述',
      content_text: '旁白一句',
      character_id: '',
      order_num: 3,
    }))
  })

  it('未知角色按旁白保留并加【】前缀，同时给出提示', async () => {
    const i = createImport({ characters: [] })
    await i.handleScriptImport({
      mode: 'append',
      entries: [{ name: '陌生人', text: '台词' }],
    })
    expect(i.dialogues.value[0]).toEqual(expect.objectContaining({
      content_type: '描述',
      content_text: '【陌生人】台词',
      character_id: '',
    }))
    expect(ElMessage.warning).toHaveBeenCalledWith('未找到角色：陌生人，这些行已按旁白保留')
  })

  it('多个未知角色去重后一起提示', async () => {
    const i = createImport({ characters: [] })
    await i.handleScriptImport({
      mode: 'append',
      entries: [
        { name: '甲', text: 'a' },
        { name: '乙', text: 'b' },
        { name: '甲', text: 'c' },
      ],
    })
    expect(ElMessage.warning).toHaveBeenCalledWith('未找到角色：甲、乙，这些行已按旁白保留')
  })

  it('导入后记历史、标脏、清空选中并关闭弹窗', async () => {
    const i = createImport()
    i.scriptImportVisible.value = true
    await i.handleScriptImport({ mode: 'append', entries: [{ text: 'a' }] })
    expect(i.pushHistory).toHaveBeenCalledTimes(1)
    expect(i.markDirty).toHaveBeenCalledTimes(1)
    expect(i.clearSelection).toHaveBeenCalledTimes(1)
    expect(i.scriptImportVisible.value).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith('已导入 1 条，点「保存全部」落库')
  })
})

describe('useSceneScriptImport / 替换模式', () => {
  it('有现存台词时先确认，取消则完全不动', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const i = createImport({ dialogues: [{ content_text: 'old' }] })
    await i.handleScriptImport({ mode: 'replace', entries: [{ text: 'new' }] })
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)
    expect(i.dialogues.value).toEqual([{ content_text: 'old' }])
    expect(i.pushHistory).not.toHaveBeenCalled()
  })

  it('确认后清空并写入新内容', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    const i = createImport({ dialogues: [{ content_text: 'old' }] })
    await i.handleScriptImport({ mode: 'replace', entries: [{ text: 'new1' }, { text: 'new2' }] })
    expect(i.dialogues.value).toHaveLength(2)
    expect(i.dialogues.value.map((d: any) => d.content_text)).toEqual(['new1', 'new2'])
    expect(i.dialogues.value[0].order_num).toBe(1)
    expect(i.dialogues.value[1].order_num).toBe(2)
  })

  it('没有现存台词时替换模式不弹确认框', async () => {
    const i = createImport({ dialogues: [] })
    await i.handleScriptImport({ mode: 'replace', entries: [{ text: 'a' }] })
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(i.dialogues.value).toHaveLength(1)
  })
})
