import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSaveSlots } from '@/composables/player/useSaveSlots'
import { ElMessage, ElMessageBox } from 'element-plus'

const listSaves = vi.fn()
const getSave = vi.fn()
const putSave = vi.fn()
const deleteSave = vi.fn()

vi.mock('@/api/save', () => ({
  listSaves: (...args: any[]) => listSaves(...args),
  getSave: (...args: any[]) => getSave(...args),
  putSave: (...args: any[]) => putSave(...args),
  deleteSave: (...args: any[]) => deleteSave(...args),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

const t = (key: string) => key

function createSlots(overrides: Partial<Parameters<typeof useSaveSlots>[0]> = {}) {
  const capture = vi.fn(() => ({ state: { sceneIndex: 1 }, summary: '第一幕 · 开场' }))
  const apply = vi.fn()
  const onCloudSaveFailed = vi.fn()
  const onCloudLoadFailed = vi.fn()

  const slots = useSaveSlots({
    projectId: () => 7,
    capture,
    apply,
    onCloudSaveFailed,
    onCloudLoadFailed,
    t,
    ...overrides,
  })

  return { ...slots, capture, apply, onCloudSaveFailed, onCloudLoadFailed }
}

describe('useSaveSlots', () => {
  beforeEach(() => {
    listSaves.mockReset().mockResolvedValue([])
    getSave.mockReset()
    putSave.mockReset()
    deleteSave.mockReset().mockResolvedValue({ success: true })
    ;(ElMessageBox.confirm as any).mockReset()
  })

  it('打开存档面板时刷新槽位列表', async () => {
    listSaves.mockResolvedValue([{ slot: 0, summary: '自动存档' }])
    const slots = createSlots()

    slots.openSaveDialog()
    expect(slots.saveDialogVisible.value).toBe(true)
    await vi.waitFor(() => expect(slots.saves.value).toHaveLength(1))
    expect(listSaves).toHaveBeenCalledWith(7)
  })

  it('读取列表失败时保留原列表且不抛错', async () => {
    const slots = createSlots()
    slots.saves.value = [{ slot: 1 }]
    listSaves.mockRejectedValueOnce(new Error('network'))

    await slots.refreshSaves()

    expect(slots.saves.value).toEqual([{ slot: 1 }])
  })

  it('保存到槽位后按 slot 排序并提示', async () => {
    const slots = createSlots()
    slots.saves.value = [{ slot: 2 }]
    putSave.mockResolvedValue({ slot: 1, summary: '第一幕' })

    await slots.saveToSlot(1)

    expect(slots.capture).toHaveBeenCalled()
    expect(putSave).toHaveBeenCalledWith(7, 1, { sceneIndex: 1 }, '第一幕 · 开场')
    expect(slots.saves.value.map(s => s.slot)).toEqual([1, 2])
    expect(ElMessage.success).toHaveBeenCalledWith('save.saved')
  })

  it('自动存档使用自动存档文案，静默保存不提示', async () => {
    const slots = createSlots()
    putSave.mockResolvedValue({ slot: 0 })

    await slots.saveToSlot(0)
    expect(ElMessage.success).toHaveBeenLastCalledWith('save.autoSaved')

    await slots.saveToSlot(0, true)
    expect(ElMessage.success).toHaveBeenCalledTimes(1)
  })

  it('云端保存失败时回退本地并提示', async () => {
    const slots = createSlots()
    putSave.mockRejectedValueOnce(new Error('cloud down'))

    await slots.saveToSlot(3)

    expect(slots.onCloudSaveFailed).toHaveBeenCalledTimes(1)
    expect(ElMessage.warning).toHaveBeenCalledWith('save.cloudSaveFailed')
  })

  it('读档时把状态交给 apply，成功后关闭弹窗', async () => {
    const slots = createSlots()
    slots.saveDialogVisible.value = true
    getSave.mockResolvedValue({ state: { sceneIndex: 4, dialogueIndex: 2 } })

    await slots.loadFromSlot(1)

    expect(getSave).toHaveBeenCalledWith(7, 1)
    expect(slots.apply).toHaveBeenCalledWith({ sceneIndex: 4, dialogueIndex: 2 })
    expect(slots.saveDialogVisible.value).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith('save.loaded')
  })

  it('云端读档失败时回退本地并关闭弹窗', async () => {
    const slots = createSlots()
    slots.saveDialogVisible.value = true
    getSave.mockRejectedValueOnce(new Error('cloud down'))

    await slots.loadFromSlot(2)

    expect(slots.onCloudLoadFailed).toHaveBeenCalledTimes(1)
    expect(slots.saveDialogVisible.value).toBe(false)
    expect(slots.isRestoring.value).toBe(true)
  })

  it('删除确认后移除槽位，取消时不调用接口', async () => {
    const slots = createSlots()
    slots.saves.value = [{ slot: 1 }, { slot: 2 }]

    ;(ElMessageBox.confirm as any).mockResolvedValueOnce('confirm')
    await slots.deleteSlot(1)
    expect(deleteSave).toHaveBeenCalledWith(7, 1)
    expect(slots.saves.value).toEqual([{ slot: 2 }])

    ;(ElMessageBox.confirm as any).mockRejectedValueOnce('cancel')
    await slots.deleteSlot(2)
    expect(deleteSave).toHaveBeenCalledTimes(1)
    expect(slots.saves.value).toEqual([{ slot: 2 }])
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('删除接口失败时提示错误', async () => {
    const slots = createSlots()
    ;(ElMessageBox.confirm as any).mockResolvedValueOnce('confirm')
    deleteSave.mockRejectedValueOnce(new Error('boom'))

    await slots.deleteSlot(1)

    expect(ElMessage.error).toHaveBeenCalledWith('save.deleteFailed')
  })
})
