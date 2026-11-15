/**
 * 开发期调试探针：把播放器关键状态一次性挂到 window.__aigcPlayerDebug()。
 *
 * 无头浏览器排查脚本依赖这个函数名与返回结构（已读、跳过、当前台词、结局、
 * 变量、覆盖率、演出权限），改动需要同步脚本与单测。仅在开发构建安装。
 */

declare global {
  interface Window {
    __aigcPlayerDebug?: () => Record<string, any>
  }
}

export interface PlayerDevProbeContext {
  getReadSet: () => Iterable<number>
  getSkipRead: () => unknown
  getCurrentContentId: () => unknown
  shouldSkipCurrent: () => unknown
  getIsTyping: () => boolean
  getEndingsCount: () => number
  getEndingVisible: () => boolean
  getTriggeredEndings: () => Iterable<number>
  getVariableValues: () => Record<string, any>
  getCoverageStats: () => Record<string, any>
  getVisitedNodes: () => Iterable<number>
  getVisitedEdges: () => Iterable<string>
  getCurrentUserId: () => string
  getProjectOwnerId: () => number
  getCanPerform: () => boolean
  getPerformMode: () => boolean
  getQueryEdit: () => unknown
  /** 覆盖「是否开发构建」的判定，默认取 import.meta.env.DEV，单测用 */
  isDevBuild?: () => boolean
}

/** 快照按调用时的状态即时求值，不做缓存 */
export function createPlayerDebugSnapshot(ctx: PlayerDevProbeContext) {
  const readIds = [...ctx.getReadSet()]
  return {
    readCount: readIds.length,
    readIds,
    skipRead: ctx.getSkipRead(),
    currentId: ctx.getCurrentContentId(),
    shouldSkip: ctx.shouldSkipCurrent(),
    isTyping: ctx.getIsTyping(),
    endingsCount: ctx.getEndingsCount(),
    endingVisible: ctx.getEndingVisible(),
    triggered: [...ctx.getTriggeredEndings()],
    variables: ctx.getVariableValues(),
    coverage: {
      ...ctx.getCoverageStats(),
      visitedNodes: [...ctx.getVisitedNodes()],
      visitedEdges: [...ctx.getVisitedEdges()],
    },
    perform: {
      currentUserId: ctx.getCurrentUserId(),
      projectOwnerId: ctx.getProjectOwnerId(),
      canPerform: ctx.getCanPerform(),
      performMode: ctx.getPerformMode(),
      queryEdit: ctx.getQueryEdit(),
    },
  }
}

export function usePlayerDevProbe(ctx: PlayerDevProbeContext) {
  const isDevBuild = ctx.isDevBuild ?? (() => Boolean(import.meta.env?.DEV))
  const canInstall = () => isDevBuild() && typeof window !== 'undefined'

  const installed = (() => {
    if (!canInstall()) return false
    window.__aigcPlayerDebug = () => createPlayerDebugSnapshot(ctx)
    return true
  })()

  return { installed }
}
