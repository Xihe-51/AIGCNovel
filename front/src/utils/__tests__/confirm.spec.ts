import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessageBox } from 'element-plus'
import {
  confirmAction,
  confirmDanger,
  DEFAULT_CANCEL_TEXT,
  DEFAULT_CONFIRM_TEXT,
  DEFAULT_CONFIRM_TITLE,
  DEFAULT_DANGER_TEXT,
} from '@/utils/confirm'

vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: vi.fn() },
}))

describe('confirmAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('确认时返回 true，并使用默认标题与文案', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)

    await expect(confirmAction('继续吗？')).resolves.toBe(true)

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('继续吗？', DEFAULT_CONFIRM_TITLE, {
      confirmButtonText: DEFAULT_CONFIRM_TEXT,
      cancelButtonText: DEFAULT_CANCEL_TEXT,
      type: 'warning',
    })
  })

  it('点取消时返回 false 且不抛错', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')

    await expect(confirmAction('继续吗？')).resolves.toBe(false)
  })

  it('点右上角关闭时同样返回 false', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('close')

    await expect(confirmAction('继续吗？')).resolves.toBe(false)
  })

  it('调用方传入的标题、文案与图标类型覆盖默认值', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)

    await confirmAction('是否写入？', {
      title: '写入项目',
      confirmButtonText: '写入',
      cancelButtonText: '返回',
      type: 'info',
    })

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('是否写入？', '写入项目', {
      confirmButtonText: '写入',
      cancelButtonText: '返回',
      type: 'info',
    })
  })

  it('customClass、confirmButtonClass 等额外选项原样透传', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)

    await confirmAction('删除吗？', {
      title: '删除台词',
      confirmButtonClass: 'el-button--danger',
      customClass: 'delete-confirm',
      dangerouslyUseHTMLString: true,
    })

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('删除吗？', '删除台词', {
      confirmButtonText: DEFAULT_CONFIRM_TEXT,
      cancelButtonText: DEFAULT_CANCEL_TEXT,
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
      customClass: 'delete-confirm',
      dangerouslyUseHTMLString: true,
    })
  })
})

describe('confirmDanger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('确认按钮默认使用「删除」', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)

    await expect(confirmDanger('删除这个场景？', { title: '删除场景' })).resolves.toBe(true)

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('删除这个场景？', '删除场景', {
      confirmButtonText: DEFAULT_DANGER_TEXT,
      cancelButtonText: DEFAULT_CANCEL_TEXT,
      type: 'warning',
    })
  })

  it('调用方显式指定的确认文案优先于「删除」', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)

    await confirmDanger('恢复到这个版本？', {
      title: '恢复版本',
      confirmButtonText: '恢复',
      type: 'info',
    })

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('恢复到这个版本？', '恢复版本', {
      confirmButtonText: '恢复',
      cancelButtonText: DEFAULT_CANCEL_TEXT,
      type: 'info',
    })
  })

  it('取消时返回 false 且不抛错', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')

    await expect(confirmDanger('删除这个场景？')).resolves.toBe(false)
  })
})
