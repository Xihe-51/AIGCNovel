import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  BEHAVIOR_VARIABLES,
  findMissingBehaviorVariables,
  isBehaviorVariable,
  useProjectVariables,
} from '@/composables/project/useProjectVariables'
import { createVariable, deleteVariable, listVariables, updateVariable } from '@/api/variable'
import type { ProjectVariable, VariablePayload } from '@/api/variable'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

vi.mock('@/api/variable', () => ({
  listVariables: vi.fn(),
  createVariable: vi.fn(),
  updateVariable: vi.fn(),
  deleteVariable: vi.fn(),
}))

const makeVariable = (overrides: Partial<ProjectVariable> = {}): ProjectVariable => ({
  variable_id: 1,
  project_id: 7,
  name: 'hp',
  label: '生命值',
  character_id: null,
  initial_value: 10,
  min_value: 0,
  max_value: 100,
  description: '',
  persist: false,
  ...overrides,
})

const createComposable = () => useProjectVariables({ projectId: () => 7 })

describe('isBehaviorVariable', () => {
  it('behavior_ 前缀的变量打上行为标记', () => {
    expect(isBehaviorVariable({ name: 'behavior_hesitation' })).toBe(true)
    expect(isBehaviorVariable({ name: 'behavior_review' })).toBe(true)
  })

  it('普通变量与空值都不算行为变量', () => {
    expect(isBehaviorVariable({ name: 'hp' })).toBe(false)
    expect(isBehaviorVariable({})).toBe(false)
    expect(isBehaviorVariable(null)).toBe(false)
    expect(isBehaviorVariable(undefined)).toBe(false)
  })
})

describe('findMissingBehaviorVariables', () => {
  it('变量库为空时返回全部内置定义', () => {
    expect(findMissingBehaviorVariables(BEHAVIOR_VARIABLES, []).map((d) => d.name)).toEqual([
      'behavior_hesitation',
      'behavior_review',
    ])
  })

  it('只返回尚未创建的定义，已存在的不重复创建', () => {
    const existing = [{ name: 'hp' }, { name: 'behavior_review' }]
    expect(findMissingBehaviorVariables(BEHAVIOR_VARIABLES, existing).map((d) => d.name)).toEqual([
      'behavior_hesitation',
    ])
  })

  it('定义全部存在时返回空数组', () => {
    const existing = [{ name: 'behavior_hesitation' }, { name: 'behavior_review' }]
    expect(findMissingBehaviorVariables(BEHAVIOR_VARIABLES, existing)).toEqual([])
  })
})

describe('useProjectVariables', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('读取变量成功后填入列表', async () => {
    const rows = [makeVariable(), makeVariable({ variable_id: 2, name: 'flag' })]
    vi.mocked(listVariables).mockResolvedValue(rows)

    const { variables, fetchVariables } = createComposable()
    await fetchVariables()

    expect(listVariables).toHaveBeenCalledWith(7)
    expect(variables.value).toEqual(rows)
  })

  it('读取失败时降级为空列表并保留告警', async () => {
    vi.mocked(listVariables).mockRejectedValue(new Error('boom'))

    const { variables, fetchVariables } = createComposable()
    await fetchVariables()

    expect(variables.value).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('启用行为变量只创建缺失定义，创建后刷新列表', async () => {
    vi.mocked(listVariables)
      .mockResolvedValueOnce([makeVariable({ name: 'behavior_review' })])
      .mockResolvedValueOnce([makeVariable({ name: 'behavior_review' }), makeVariable({ name: 'behavior_hesitation' })])
    vi.mocked(createVariable).mockResolvedValue(makeVariable())

    const { behaviorSaving, fetchVariables, enableBehaviorVariables } = createComposable()
    await fetchVariables()
    await enableBehaviorVariables()

    expect(createVariable).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createVariable).mock.calls[0][0]).toBe(7)
    expect(vi.mocked(createVariable).mock.calls[0][1].name).toBe('behavior_hesitation')
    expect(listVariables).toHaveBeenCalledTimes(2)
    expect(ElMessage.success).toHaveBeenCalledWith('行为变量已启用，可在剧情条件与后续旁白中使用')
    expect(behaviorSaving.value).toBe(false)
  })

  it('定义已齐时启用行为变量不发请求', async () => {
    vi.mocked(listVariables).mockResolvedValue([
      makeVariable({ name: 'behavior_hesitation' }),
      makeVariable({ name: 'behavior_review' }),
    ])

    const { fetchVariables, enableBehaviorVariables } = createComposable()
    await fetchVariables()
    await enableBehaviorVariables()

    expect(createVariable).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('保存变量走编辑分支：更新后关闭弹窗并刷新', async () => {
    vi.mocked(updateVariable).mockResolvedValue(makeVariable())
    vi.mocked(listVariables).mockResolvedValue([makeVariable()])

    const { variableDialogVisible, variableSaving, fetchVariables, handleSaveVariable } = createComposable()
    variableDialogVisible.value = true
    const payload = { name: 'hp', label: '生命值', initial_value: 20 } as VariablePayload

    await handleSaveVariable({ variableId: 3, payload })

    expect(updateVariable).toHaveBeenCalledWith(7, 3, payload)
    expect(createVariable).not.toHaveBeenCalled()
    expect(variableDialogVisible.value).toBe(false)
    expect(listVariables).toHaveBeenCalledTimes(1)
    expect(variableSaving.value).toBe(false)
  })

  it('保存变量走新建分支：创建后关闭弹窗并刷新', async () => {
    vi.mocked(createVariable).mockResolvedValue(makeVariable())
    vi.mocked(listVariables).mockResolvedValue([makeVariable()])

    const { variableDialogVisible, handleSaveVariable } = createComposable()
    variableDialogVisible.value = true
    const payload = { name: 'flag', label: '开关', initial_value: 0 } as VariablePayload

    await handleSaveVariable({ variableId: null, payload })

    expect(createVariable).toHaveBeenCalledWith(7, payload)
    expect(updateVariable).not.toHaveBeenCalled()
    expect(variableDialogVisible.value).toBe(false)
    expect(listVariables).toHaveBeenCalledTimes(1)
  })

  it('删除变量确认后落库并刷新', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    vi.mocked(deleteVariable).mockResolvedValue(undefined as any)
    vi.mocked(listVariables).mockResolvedValue([])

    const { fetchVariables, removeVariable } = createComposable()
    const row = makeVariable({ variable_id: 9, label: '生命值' })

    await removeVariable(row)

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      '删除变量「生命值」？引用它的节点数值变化也会被清除。',
      '删除变量',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    expect(deleteVariable).toHaveBeenCalledWith(7, 9)
    expect(listVariables).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('变量已删除')
  })

  it('删除变量取消时静默退出，不落库也不报错', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    vi.mocked(listVariables).mockResolvedValue([])

    const { removeVariable } = createComposable()
    await removeVariable(makeVariable())

    expect(deleteVariable).not.toHaveBeenCalled()
    expect(listVariables).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })
})
