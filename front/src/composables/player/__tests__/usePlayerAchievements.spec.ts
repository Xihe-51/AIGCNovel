import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerAchievements } from '@/composables/player/usePlayerAchievements'
import { ElMessage } from 'element-plus'
import { withSetup } from '@/__tests__/helpers'

const listAchievements = vi.fn()
const checkAchievements = vi.fn()

vi.mock('@/api/achievement', () => ({
  listAchievements: (...args: any[]) => listAchievements(...args),
  checkAchievements: (...args: any[]) => checkAchievements(...args),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const t = (key: string, params?: Record<string, any>) =>
  params?.title ? `${key}:${params.title}` : key

function createAchievements(options: { debug?: boolean } = {}) {
  const debug = options.debug ?? false
  const { result, wrapper } = withSetup(() => usePlayerAchievements({
    projectId: () => 7,
    getDebugMode: () => debug,
    getVariables: () => ({ love: 3 }),
    getEndings: () => [1, 2],
    t,
  }))
  return { ...result, wrapper }
}

describe('usePlayerAchievements', () => {
  beforeEach(() => {
    listAchievements.mockReset()
    checkAchievements.mockReset()
  })

  it('加载成就列表，读取失败时清空', async () => {
    const achievements = createAchievements()
    listAchievements.mockResolvedValueOnce([
      { achievement_id: 1, title: '通关', unlocked: true },
      { achievement_id: 2, title: '未解锁' },
    ])

    await achievements.loadPlayerAchievements()
    expect(achievements.achievements.value).toHaveLength(2)
    expect(achievements.unlockedAchievementCount.value).toBe(1)

    listAchievements.mockRejectedValueOnce(new Error('boom'))
    await achievements.loadPlayerAchievements()
    expect(achievements.achievements.value).toEqual([])
    achievements.wrapper.unmount()
  })

  it('调试模式下不做成就检查', async () => {
    const achievements = createAchievements({ debug: true })
    achievements.achievements.value = [{ achievement_id: 1, title: '通关' }]

    await achievements.runAchievementCheck()

    expect(checkAchievements).not.toHaveBeenCalled()
    achievements.wrapper.unmount()
  })

  it('没有成就定义时跳过检查', async () => {
    const achievements = createAchievements()
    await achievements.runAchievementCheck()
    expect(checkAchievements).not.toHaveBeenCalled()
    achievements.wrapper.unmount()
  })

  it('检查结果会刷新列表并提示新解锁的成就', async () => {
    const achievements = createAchievements()
    achievements.achievements.value = [{ achievement_id: 1, title: '通关' }]
    checkAchievements.mockResolvedValueOnce({
      achievements: [{ achievement_id: 1, title: '通关', unlocked: true }],
      newly_unlocked: [{ achievement_id: 1, title: '逃出病房' }],
    })

    await achievements.runAchievementCheck()

    expect(checkAchievements).toHaveBeenCalledWith(7, {
      variables: { love: 3 },
      endings: [1, 2],
      finished: false,
    })
    expect(achievements.unlockedAchievementCount.value).toBe(1)
    expect(ElMessage.success).toHaveBeenCalledWith('toast.achievementUnlocked:逃出病房')
    achievements.wrapper.unmount()
  })

  it('检查接口失败不影响试玩', async () => {
    const achievements = createAchievements()
    achievements.achievements.value = [{ achievement_id: 1, title: '通关' }]
    checkAchievements.mockRejectedValueOnce(new Error('boom'))

    await expect(achievements.runAchievementCheck()).resolves.toBeUndefined()
    achievements.wrapper.unmount()
  })

  it('scheduleAchievementCheck 防抖，只发一次检查', async () => {
    vi.useFakeTimers()
    const achievements = createAchievements()
    achievements.achievements.value = [{ achievement_id: 1, title: '通关' }]
    checkAchievements.mockResolvedValue({ achievements: [], newly_unlocked: [] })

    achievements.scheduleAchievementCheck()
    achievements.scheduleAchievementCheck()

    await vi.advanceTimersByTimeAsync(899)
    expect(checkAchievements).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(checkAchievements).toHaveBeenCalledTimes(1)
    expect(checkAchievements.mock.calls[0][1].finished).toBe(false)

    achievements.wrapper.unmount()
    vi.useRealTimers()
  })

  it('通关标记会传给检查接口，重置后回到未通关', async () => {
    vi.useFakeTimers()
    const achievements = createAchievements()
    achievements.achievements.value = [{ achievement_id: 1, title: '通关' }]
    // 检查结果会替换列表，保持非空才能继续触发下一次检查
    checkAchievements.mockResolvedValue({
      achievements: [{ achievement_id: 1, title: '通关' }],
      newly_unlocked: [],
    })

    achievements.scheduleAchievementCheck(true)
    await vi.advanceTimersByTimeAsync(900)
    expect(checkAchievements.mock.calls[0][1].finished).toBe(true)

    achievements.resetAchievementState()
    achievements.scheduleAchievementCheck()
    await vi.advanceTimersByTimeAsync(900)
    expect(checkAchievements.mock.calls[1][1].finished).toBe(false)

    achievements.wrapper.unmount()
    vi.useRealTimers()
  })
})
