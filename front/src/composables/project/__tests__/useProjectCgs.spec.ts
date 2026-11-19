import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ElMessage, ElMessageBox } from 'element-plus'
import { describeCgUnlock, useProjectCgs } from '@/composables/project/useProjectCgs'
import { createCG, deleteCG, listCGs, updateCG } from '@/api/cg'
import type { CGPayload, ProjectCG } from '@/api/cg'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

vi.mock('@/api/cg', () => ({
  listCGs: vi.fn(),
  createCG: vi.fn(),
  updateCG: vi.fn(),
  deleteCG: vi.fn(),
}))

const makeCg = (overrides: Partial<ProjectCG> = {}): ProjectCG => ({
  cg_id: 1,
  project_id: 7,
  title: '雨中告白',
  description: '雨停了',
  image_url: '/uploads/cg/rain.jpg',
  resource_id: null,
  unlock_ending_id: 3,
  unlock_ending_title: '林瑶的告白',
  order_num: 1,
  ...overrides,
})

const makeCtx = (overrides: Partial<Parameters<typeof useProjectCgs>[0]> = {}) => ({
  projectId: () => 7,
  ensureEndings: vi.fn().mockResolvedValue(undefined),
  ...overrides,
})

describe('describeCgUnlock', () => {
  it('绑定结局时输出结局名', () => {
    expect(describeCgUnlock({ unlock_ending_id: 3, unlock_ending_title: '林瑶的告白' })).toBe(
      '达成结局「林瑶的告白」',
    )
  })

  it('结局标题缺失时退回 #id', () => {
    expect(describeCgUnlock({ unlock_ending_id: 9, unlock_ending_title: null })).toBe('达成结局「#9」')
  })

  it('未绑定结局时初始可见', () => {
    expect(describeCgUnlock({ unlock_ending_id: null })).toBe('初始可见')
    expect(describeCgUnlock(null)).toBe('初始可见')
    expect(describeCgUnlock(undefined)).toBe('初始可见')
  })
})

describe('useProjectCgs', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('读取 CG 成功后填入列表', async () => {
    const rows = [makeCg(), makeCg({ cg_id: 2, title: '月下独白' })]
    vi.mocked(listCGs).mockResolvedValue(rows)

    const { cgs, fetchCGs } = useProjectCgs(makeCtx())
    await fetchCGs()

    expect(listCGs).toHaveBeenCalledWith(7)
    expect(cgs.value).toEqual(rows)
  })

  it('读取 CG 失败时降级为空列表并保留告警', async () => {
    vi.mocked(listCGs).mockRejectedValue(new Error('boom'))

    const { cgs, fetchCGs } = useProjectCgs(makeCtx())
    await fetchCGs()

    expect(cgs.value).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('新建 CG 先刷新结局再打开弹窗，并清空编辑态', async () => {
    const ctx = makeCtx()

    const { cgDialogVisible, cgInitial, editingCGId, openCreateCG } = useProjectCgs(ctx)
    editingCGId.value = 5
    cgInitial.value = makeCg()

    await openCreateCG()

    expect(ctx.ensureEndings).toHaveBeenCalledTimes(1)
    expect(cgDialogVisible.value).toBe(true)
    expect(editingCGId.value).toBeNull()
    expect(cgInitial.value).toBeNull()
  })

  it('编辑 CG 带上初始行并刷新结局', async () => {
    const ctx = makeCtx()

    const { cgDialogVisible, cgInitial, editingCGId, openEditCG } = useProjectCgs(ctx)
    const row = makeCg({ cg_id: 8 })

    await openEditCG(row)

    expect(cgDialogVisible.value).toBe(true)
    expect(editingCGId.value).toBe(8)
    expect(cgInitial.value).toStrictEqual(row)
    expect(ctx.ensureEndings).toHaveBeenCalledTimes(1)
  })

  it('保存 CG 走编辑分支：更新后关闭弹窗并刷新', async () => {
    vi.mocked(updateCG).mockResolvedValue(makeCg())
    vi.mocked(listCGs).mockResolvedValue([makeCg()])

    const { cgDialogVisible, cgSaving, handleSaveCG } = useProjectCgs(makeCtx())
    cgDialogVisible.value = true
    const payload: CGPayload = { title: '雨中告白', image_url: '/uploads/cg/rain.jpg', unlock_ending_id: 3 }

    await handleSaveCG({ cgId: 3, payload })

    expect(updateCG).toHaveBeenCalledWith(7, 3, payload)
    expect(createCG).not.toHaveBeenCalled()
    expect(cgDialogVisible.value).toBe(false)
    expect(listCGs).toHaveBeenCalledTimes(1)
    expect(cgSaving.value).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith('CG 已更新')
  })

  it('保存 CG 走新建分支：创建后关闭弹窗并刷新', async () => {
    vi.mocked(createCG).mockResolvedValue(makeCg())
    vi.mocked(listCGs).mockResolvedValue([makeCg()])

    const { cgDialogVisible, handleSaveCG } = useProjectCgs(makeCtx())
    cgDialogVisible.value = true
    const payload: CGPayload = { title: '月下独白', image_url: '/uploads/cg/moon.jpg' }

    await handleSaveCG({ cgId: null, payload })

    expect(createCG).toHaveBeenCalledWith(7, payload)
    expect(updateCG).not.toHaveBeenCalled()
    expect(cgDialogVisible.value).toBe(false)
    expect(listCGs).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('CG 已添加')
  })

  it('保存 CG 失败时保留弹窗并提示错误', async () => {
    vi.mocked(createCG).mockRejectedValue({ response: { data: { message: '图片地址无效' } } })

    const { cgDialogVisible, handleSaveCG } = useProjectCgs(makeCtx())
    cgDialogVisible.value = true

    await handleSaveCG({ cgId: null, payload: { title: '月下独白' } })

    expect(cgDialogVisible.value).toBe(true)
    expect(ElMessage.error).toHaveBeenCalledWith('图片地址无效')
  })

  it('删除 CG 确认后落库并刷新', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    vi.mocked(deleteCG).mockResolvedValue(undefined as any)
    vi.mocked(listCGs).mockResolvedValue([])

    const { removeCG } = useProjectCgs(makeCtx())
    await removeCG(makeCg({ cg_id: 9, title: '雨中告白' }))

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('删除 CG「雨中告白」？', '删除 CG', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    expect(deleteCG).toHaveBeenCalledWith(7, 9)
    expect(listCGs).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('CG 已删除')
  })

  it('删除 CG 取消时静默退出，不落库也不报错', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')

    const { removeCG } = useProjectCgs(makeCtx())
    await removeCG(makeCg({ cg_id: 9 }))

    expect(deleteCG).not.toHaveBeenCalled()
    expect(listCGs).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })
})
