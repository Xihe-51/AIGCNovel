import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useSceneNodeEditors } from '@/composables/scene/useSceneNodeEditors'
import { ElMessage } from 'element-plus'

const saveContentEffects = vi.fn()

vi.mock('@/api/variable', () => ({
  saveContentEffects: (...args: any[]) => saveContentEffects(...args),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

function createEditors() {
  const dialogues = ref<any[]>([
    { content_id: 1, content_text: '第一句' },
    { content_id: 2, content_text: '第二句' },
  ])
  const variables = ref<any[]>([
    { variable_id: 10, name: 'love', label: '好感度' },
    { variable_id: 11, name: 'clue', label: '线索' },
  ])
  const effectsMap = ref<Record<string, any[]>>({})
  const markDirty = vi.fn()
  const pushHistory = vi.fn()

  const editors = useSceneNodeEditors({
    projectId: ref(7),
    dialogues,
    variables,
    effectsMap,
    markDirty,
    pushHistory,
  })

  return { ...editors, dialogues, variables, effectsMap, markDirty, pushHistory }
}

describe('useSceneNodeEditors / 台词显示条件', () => {
  beforeEach(() => {
    saveContentEffects.mockReset()
  })

  it('hasNodeCondition 兼容新 items 与旧单变量结构', () => {
    const { hasNodeCondition } = createEditors()
    expect(hasNodeCondition(null)).toBe(false)
    expect(hasNodeCondition({})).toBe(false)
    expect(hasNodeCondition({ branch_condition: null })).toBe(false)
    expect(hasNodeCondition({ branch_condition: { items: [{ variable: '' }] } })).toBe(false)
    expect(hasNodeCondition({ branch_condition: { items: [{ variable: 'love' }] } })).toBe(true)
    expect(hasNodeCondition({ branch_condition: { variable: 'love', op: '>=', value: 1 } })).toBe(true)
  })

  it('打开弹窗时把旧单变量条件归一成 items 数组', () => {
    const editors = createEditors()
    editors.dialogues.value[0].branch_condition = { variable: 'love', op: '>', value: 3 }
    editors.openNodeConditionDialog(0)

    expect(editors.nodeConditionVisible.value).toBe(true)
    expect(editors.nodeConditionMode.value).toBe('and')
    expect(editors.nodeConditionItems.value).toEqual([{ variable: 'love', op: '>', value: 3 }])
    expect(editors.nodeConditionTarget.value).toBe('第一句')
  })

  it('确定时过滤空变量并取整数值，写入后标记 dirty', () => {
    const editors = createEditors()
    editors.openNodeConditionDialog(1)
    editors.addNodeCondition()
    editors.nodeConditionItems.value = [
      { variable: 'love', op: '>=', value: 2.7 },
      { variable: '', op: '>=', value: 9 },
    ]

    editors.applyNodeCondition()

    expect(editors.dialogues.value[1].branch_condition).toEqual({
      mode: 'and',
      items: [{ variable: 'love', op: '>=', value: 2 }],
    })
    expect(editors.markDirty).toHaveBeenCalled()
    expect(editors.nodeConditionVisible.value).toBe(false)
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('全部条件为空时保存为 null（表示无条件）', () => {
    const editors = createEditors()
    editors.openNodeConditionDialog(0)
    editors.nodeConditionItems.value = [{ variable: '', op: '>=', value: 0 }]

    editors.applyNodeCondition()

    expect(editors.dialogues.value[0].branch_condition).toBeNull()
  })

  it('清除条件直接置空并关闭弹窗', () => {
    const editors = createEditors()
    editors.dialogues.value[0].branch_condition = { variable: 'love', op: '>=', value: 1 }
    editors.openNodeConditionDialog(0)

    editors.clearNodeCondition()

    expect(editors.dialogues.value[0].branch_condition).toBeNull()
    expect(editors.nodeConditionVisible.value).toBe(false)
    expect(editors.markDirty).toHaveBeenCalled()
  })

  it('条件关系可切到 or', () => {
    const editors = createEditors()
    editors.openNodeConditionDialog(0)
    editors.nodeConditionMode.value = 'or'
    editors.nodeConditionItems.value = [
      { variable: 'love', op: '>=', value: 1 },
      { variable: 'clue', op: '>=', value: 2 },
    ]

    editors.applyNodeCondition()

    expect(editors.dialogues.value[0].branch_condition?.mode).toBe('or')
    expect(editors.dialogues.value[0].branch_condition?.items).toHaveLength(2)
  })
})

describe('useSceneNodeEditors / 节点数值变化', () => {
  beforeEach(() => {
    saveContentEffects.mockReset()
    saveContentEffects.mockResolvedValue(undefined)
  })

  it('添加与删除都会入撤销栈并标记 dirty', () => {
    const editors = createEditors()
    const dialogue = editors.dialogues.value[0]

    editors.addEffect(dialogue)
    expect(editors.pushHistory).toHaveBeenCalledTimes(1)
    expect(editors.markDirty).toHaveBeenCalledTimes(1)
    expect(editors.getDialogueEffects(dialogue)).toEqual([{ variable_id: 10, delta: 1 }])

    editors.removeEffect(dialogue, 0)
    expect(editors.pushHistory).toHaveBeenCalledTimes(2)
    expect(editors.getDialogueEffects(dialogue)).toEqual([])
  })

  it('首次读取 effects 时从 effectsMap 深拷贝，避免直接改到缓存', () => {
    const editors = createEditors()
    editors.effectsMap.value = { 1: [{ variable_id: 11, delta: 2 }] }
    const list = editors.getDialogueEffects(editors.dialogues.value[0])

    expect(list).toEqual([{ variable_id: 11, delta: 2 }])
    list[0].delta = 99
    expect(editors.effectsMap.value['1'][0].delta).toBe(2)
  })

  it('保存时过滤未选变量与 0 变化，并回填带 label 的缓存', async () => {
    const editors = createEditors()
    const dialogue = editors.dialogues.value[0]
    dialogue._effects = [
      { variable_id: 10, delta: 2 },
      { variable_id: null, delta: 1 },
      { variable_id: 11, delta: 0 },
    ]

    await editors.saveDialogueEffects(dialogue)

    expect(saveContentEffects).toHaveBeenCalledWith(7, 1, [{ variable_id: 10, delta: 2 }])
    expect(editors.effectsMap.value['1']).toEqual([{ variable_id: 10, delta: 2, label: '好感度' }])
    expect(dialogue._effects).toEqual([{ variable_id: 10, delta: 2, label: '好感度' }])
  })

  it('未保存的台词不允许配置数值变化', async () => {
    const editors = createEditors()
    await editors.saveDialogueEffects({ content_text: '草稿' })

    expect(saveContentEffects).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('接口失败时提示错误且不改缓存', async () => {
    const editors = createEditors()
    const dialogue = editors.dialogues.value[0]
    dialogue._effects = [{ variable_id: 10, delta: 1 }]
    saveContentEffects.mockRejectedValueOnce(new Error('network'))

    await editors.saveDialogueEffects(dialogue)

    expect(ElMessage.error).toHaveBeenCalled()
    expect(editors.effectsMap.value['1']).toBeUndefined()
  })
})
