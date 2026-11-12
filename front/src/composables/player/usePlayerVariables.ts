/**
 * 玩家侧变量系统：变量定义与取值、跨周目持久化、活叙事行为变量、变化浮层。
 *
 * 只负责"变量本身的状态与读写"，条件求值在 usePlayerConditions，
 * 剧情推进时如何应用效果由页面编排 —— 这样变量层可以单独测试。
 */
import { onUnmounted, ref } from 'vue'
import { listVariables, listEffects, getProjectMeta, saveProjectMeta } from '@/api/variable'
import { listSceneLocks } from '@/api/scenes'

/** 活叙事：犹豫时长变量名 */
export const BEHAVIOR_HESITATION = 'behavior_hesitation'
/** 活叙事：回看次数变量名 */
export const BEHAVIOR_REVIEW = 'behavior_review'

export interface PlayerVariablesContext {
  projectId: () => number
  /** 是否展示变量变化浮层（由阅读设置控制） */
  showNotices: () => boolean
}

export function usePlayerVariables(ctx: PlayerVariablesContext) {
  const projectVariables = ref<any[]>([])
  const variableEffects = ref<any[]>([])
  const variableValues = ref<Record<string, any>>({})
  /** 变量变化提示（好感度 +5 / 线索 +1 之类，短暂浮层） */
  const variableNotices = ref<any[]>([])
  /** 场景播放条件（剧情锁）：scene_id → 条件组 */
  const sceneLocks = ref<Record<string, any>>({})
  /** 跨周目变量：服务端保存的 persist 变量值 */
  const metaVariables = ref<Record<string, any>>({})

  const variableNoticeTimers = new Set<ReturnType<typeof setTimeout>>()
  let variableNoticeSeq = 0
  let metaSaveTimer: ReturnType<typeof setTimeout> | null = null
  let hesitationStartedAt = 0
  let hesitationContentId: number | string | null = null

  const clampVariable = (v: any, value: any): number => {
    let n = Number(value) || 0
    if (v.min_value !== null && v.min_value !== undefined) n = Math.max(Number(v.min_value), n)
    if (v.max_value !== null && v.max_value !== undefined) n = Math.min(Number(v.max_value), n)
    return n
  }

  const initialValueOf = (v: any): any => {
    if (v.persist && metaVariables.value[v.name] != null) {
      return clampVariable(v, metaVariables.value[v.name])
    }
    return v.initial_value
  }

  const initVariableValues = () => {
    const next = { ...variableValues.value }
    for (const v of projectVariables.value) {
      if (!(v.name in next)) next[v.name] = initialValueOf(v)
    }
    variableValues.value = next
  }

  // 只收集 persist 变量的当前值，交给后端按用户/项目保存
  const snapshotPersistVariables = (): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const v of projectVariables.value) {
      if (!v.persist) continue
      out[v.name] = Number(variableValues.value[v.name] ?? v.initial_value)
    }
    return out
  }

  // 本地同步 + 防抖写回服务端（变量频繁变化时只在停止变化后发一次）
  const syncProjectMeta = (immediate = false) => {
    const snapshot = snapshotPersistVariables()
    if (!Object.keys(snapshot).length) return
    metaVariables.value = { ...metaVariables.value, ...snapshot }
    if (metaSaveTimer) {
      clearTimeout(metaSaveTimer)
      metaSaveTimer = null
    }
    const push = () => {
      saveProjectMeta(ctx.projectId(), snapshot).catch((e: any) => {
        console.warn('保存跨周目变量失败:', e)
      })
    }
    if (immediate) push()
    else metaSaveTimer = setTimeout(() => {
      metaSaveTimer = null
      push()
    }, 500)
  }

  const loadProjectMeta = async () => {
    try {
      const meta: any = await getProjectMeta(ctx.projectId())
      metaVariables.value = meta.variables || {}
    } catch (e) {
      metaVariables.value = {}
    }
  }

  const loadVariableSystem = async () => {
    try {
      projectVariables.value = await listVariables(ctx.projectId())
      variableEffects.value = await listEffects(ctx.projectId())
      sceneLocks.value = (await listSceneLocks(ctx.projectId())) || {}
      await loadProjectMeta()
      initVariableValues()
    } catch (e) {
      console.warn('读取项目变量失败:', e)
      projectVariables.value = []
      variableEffects.value = []
      sceneLocks.value = {}
    }
  }

  const clearVariableNotices = () => {
    variableNoticeTimers.forEach((timer) => clearTimeout(timer))
    variableNoticeTimers.clear()
    variableNotices.value = []
  }

  const pushVariableNotices = (items: { label: string; delta: number }[]) => {
    if (!items.length || !ctx.showNotices()) return
    for (const item of items) {
      const id = ++variableNoticeSeq
      variableNotices.value.push({ id, label: item.label, delta: item.delta })
      const timer = setTimeout(() => {
        variableNotices.value = variableNotices.value.filter((n) => n.id !== id)
        variableNoticeTimers.delete(timer)
      }, 2600)
      variableNoticeTimers.add(timer)
    }
    // 单节点变量太多时只保留最近几条，避免浮层堆满画面
    if (variableNotices.value.length > 8) {
      variableNotices.value = variableNotices.value.slice(-8)
    }
  }

  // ==================== 活叙事：行为变量 ====================
  // 仅当作者显式启用了 behavior_hesitation / behavior_review 时才记录，不默认采集。
  const behaviorDefOf = (name: string) => projectVariables.value.find(v => v.name === name)

  const setBehaviorVariable = (name: string, value: number) => {
    const def = behaviorDefOf(name)
    if (!def) return
    const next = clampVariable(def, Math.max(0, Math.round(Number(value) || 0)))
    if (Number(variableValues.value[name] ?? def.initial_value) === next) return
    variableValues.value = { ...variableValues.value, [name]: next }
  }

  // 同一选择节点只记一次开始时间，避免设置/打字重入把犹豫时间清零
  const markHesitationStart = (contentId: number | string) => {
    if (!contentId || hesitationContentId === contentId) return
    hesitationContentId = contentId
    hesitationStartedAt = Date.now()
  }

  const commitHesitation = () => {
    if (!hesitationStartedAt) return
    const seconds = Math.min(60, Math.floor((Date.now() - hesitationStartedAt) / 1000))
    hesitationStartedAt = 0
    hesitationContentId = null
    setBehaviorVariable(BEHAVIOR_HESITATION, seconds)
  }

  const bumpBehaviorReview = () => {
    const def = behaviorDefOf(BEHAVIOR_REVIEW)
    if (!def) return
    const current = Number(variableValues.value[BEHAVIOR_REVIEW] ?? def.initial_value)
    setBehaviorVariable(BEHAVIOR_REVIEW, current + 1)
  }

  onUnmounted(() => {
    if (metaSaveTimer) clearTimeout(metaSaveTimer)
    clearVariableNotices()
  })

  return {
    projectVariables,
    variableEffects,
    variableValues,
    variableNotices,
    sceneLocks,
    metaVariables,
    clampVariable,
    initialValueOf,
    initVariableValues,
    snapshotPersistVariables,
    syncProjectMeta,
    loadProjectMeta,
    loadVariableSystem,
    clearVariableNotices,
    pushVariableNotices,
    behaviorDefOf,
    setBehaviorVariable,
    markHesitationStart,
    commitHesitation,
    bumpBehaviorReview,
  }
}
