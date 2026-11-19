/**
 * 播放器试玩埋点：开始、进入场景、选择分支、结局、通关。
 *
 * 调试模式或作者本人试玩不记录，避免污染玩家数据。
 * 用 getter 注入上下文，避免和播放器其它状态产生初始化顺序问题。
 */
import { recordPlayEvent } from '@/api/analytics'
import type { PlayEventType } from '@/api/analytics'

export interface PlayerTelemetryContext {
  getProjectId: () => number
  getDebugMode: () => boolean
  getIsOwner: () => boolean
  getLoading: () => boolean
  getError: () => string
  getCurrentSceneId: () => number
}

export function usePlayerTelemetry(ctx: PlayerTelemetryContext) {
  const telemetrySessionId = (() => {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    } catch (_) { /* ignore */ }
    return 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
  })()

  let telemetryStartLogged = false
  let telemetryFinishLogged = false
  let lastSceneLogId = 0
  let lastSceneLogAt = 0
  // 回退后重走已看过的内容时，避免重复计入试玩埋点（列表/选项/结局按会话去重）
  const loggedScenes = new Set<number>()
  const loggedChoices = new Set<string>()
  const loggedEndings = new Set<number>()

  // 新一轮从头开始：允许重新记录场景/选项/结局/通关埋点
  const resetTelemetryTracking = () => {
    loggedScenes.clear()
    loggedChoices.clear()
    loggedEndings.clear()
    telemetryFinishLogged = false
  }

  const logPlayEvent = (type: PlayEventType, extra: Record<string, any> = {}) => {
    // 作者本人的预览/试玩不计入玩家数据，避免污染流失率与选择分布
    if (ctx.getDebugMode() || ctx.getIsOwner() || ctx.getLoading() || ctx.getError()) return

    if (type === 'scene_enter') {
      const sid = Number(extra.scene_id) || 0
      if (!sid || loggedScenes.has(sid)) return
      loggedScenes.add(sid)
    } else if (type === 'choice') {
      const key = `${Number(extra.content_id) || 0}:${Number(extra.path_id) || 0}`
      if (loggedChoices.has(key)) return
      loggedChoices.add(key)
    } else if (type === 'ending') {
      const eid = Number(extra.ending_id) || 0
      if (eid && loggedEndings.has(eid)) return
      if (eid) loggedEndings.add(eid)
    } else if (type === 'finish') {
      if (telemetryFinishLogged) return
      telemetryFinishLogged = true
    }

    recordPlayEvent(ctx.getProjectId(), {
      session_id: telemetrySessionId,
      event_type: type,
      ...extra,
    }).catch(() => { /* 埋点失败不影响试玩 */ })
  }

  // 开局只记录一次（加载完成时调用）
  const logStartOnce = () => {
    if (telemetryStartLogged) return
    telemetryStartLogged = true
    logPlayEvent('start')
  }

  const logCurrentScene = () => {
    const sid = ctx.getCurrentSceneId()
    if (!sid) return
    const now = Date.now()
    if (sid === lastSceneLogId && now - lastSceneLogAt < 500) return
    lastSceneLogId = sid
    lastSceneLogAt = now
    logPlayEvent('scene_enter', { scene_id: sid })
  }

  return { resetTelemetryTracking, logPlayEvent, logStartOnce, logCurrentScene }
}
