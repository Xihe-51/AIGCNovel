import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerChangelog } from '@/composables/player/usePlayerChangelog'
import { listPublicReleases } from '@/api/release'

vi.mock('@/api/release', () => ({
  listPublicReleases: vi.fn(),
}))

const mockedList = vi.mocked(listPublicReleases)

describe('usePlayerChangelog', () => {
  beforeEach(() => {
    mockedList.mockReset()
  })

  it('弹窗默认关闭、清单默认为空，且按作品 id 拉取', async () => {
    mockedList.mockResolvedValue([
      { release_id: 1, release_no: 1, notes: '首发' } as any,
      { release_id: 2, release_no: 2, notes: '修 bug' } as any,
    ])
    const changelog = usePlayerChangelog({ projectId: () => 7 })

    expect(changelog.changelogVisible.value).toBe(false)
    expect(changelog.publicReleases.value).toEqual([])

    await changelog.loadPublicReleases()

    expect(mockedList).toHaveBeenCalledWith(7)
    expect(changelog.publicReleases.value).toHaveLength(2)
    expect(changelog.publicReleases.value[1].notes).toBe('修 bug')
  })

  it('请求失败时清空清单，不影响试玩', async () => {
    mockedList.mockRejectedValue(new Error('network down'))
    const changelog = usePlayerChangelog({ projectId: () => 7 })
    changelog.publicReleases.value = [{ release_id: 1 } as any]

    await changelog.loadPublicReleases()

    expect(changelog.publicReleases.value).toEqual([])
  })

  it('接口返回非数组时按空清单处理', async () => {
    mockedList.mockResolvedValue(undefined as any)
    const changelog = usePlayerChangelog({ projectId: () => 7 })

    await changelog.loadPublicReleases()

    expect(changelog.publicReleases.value).toEqual([])
  })

  it('弹窗可见性可直接切换', () => {
    const changelog = usePlayerChangelog({ projectId: () => 7 })

    changelog.changelogVisible.value = true
    expect(changelog.changelogVisible.value).toBe(true)
  })
})
