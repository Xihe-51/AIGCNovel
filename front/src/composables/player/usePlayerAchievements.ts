/**
 * 玩家侧成就：列表加载、状态检查与解锁提示。
 *
 * 调试模式下跳过检查，避免作者自己试玩污染成就进度。
 * 变量与结局通过 getter 注入，composable 不依赖播放器页面状态。
 */
import { computed, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listAchievements, checkAchievements } from '@/api/achievement'
import type { Achievement } from '@/api/achievement'

export interface PlayerAchievementsContext {
  projectId: () => number
  getDebugMode: () => boolean
  getVariables: () => Record<string, number>
  getEndings: () => number[]
  t: (key: string, params?: Record<string, any>) => string
}

export function usePlayerAchievements(ctx: PlayerAchievementsContext) {
  const achievements = ref<Achievement[]>([])
  let achievementTimer: ReturnType<typeof setTimeout> | null = null
  let achievementRunning = false
  let achievementFinished = false

  const unlockedAchievementCount = computed(() =>
    achievements.value.filter(a => a.unlocked).length
  )

  const loadPlayerAchievements = async () => {
    try {
      achievements.value = await listAchievements(ctx.projectId())
    } catch (e) {
      console.warn('读取成就失败:', e)
      achievements.value = []
    }
  }

  const runAchievementCheck = async () => {
    if (ctx.getDebugMode() || achievementRunning || !achievements.value.length) return
    achievementRunning = true
    try {
      const res = await checkAchievements(ctx.projectId(), {
        variables: ctx.getVariables(),
        endings: ctx.getEndings(),
        finished: achievementFinished,
      })
      if (res?.achievements) achievements.value = res.achievements
      const fresh = res?.newly_unlocked || []
      for (const a of fresh) {
        ElMessage.success(ctx.t('toast.achievementUnlocked', { title: a.title }))
      }
    } catch (e) {
      /* 成就检查失败不影响试玩 */
    } finally {
      achievementRunning = false
    }
  }

  const scheduleAchievementCheck = (finished = false) => {
    if (ctx.getDebugMode()) return
    if (finished) achievementFinished = true
    if (achievementTimer) clearTimeout(achievementTimer)
    achievementTimer = setTimeout(() => {
      achievementTimer = null
      runAchievementCheck()
    }, 900)
  }

  // 重开/下一周目：清除通关标记与待检查任务
  const resetAchievementState = () => {
    achievementFinished = false
    if (achievementTimer) {
      clearTimeout(achievementTimer)
      achievementTimer = null
    }
  }

  onUnmounted(() => {
    if (achievementTimer) clearTimeout(achievementTimer)
  })

  return {
    achievements,
    unlockedAchievementCount,
    loadPlayerAchievements,
    runAchievementCheck,
    scheduleAchievementCheck,
    resetAchievementState,
  }
}
