import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerTelemetry } from '@/composables/player/usePlayerTelemetry'

const recordPlayEvent = vi.fn().mockResolvedValue(undefined)

vi.mock('@/api/analytics', () => ({
  recordPlayEvent: (...args: any[]) => recordPlayEvent(...args),
}))

const createTelemetry = (overrides: Partial<Parameters<typeof usePlayerTelemetry>[0]> = {}) => usePlayerTelemetry({
  getProjectId: () => 7,
  getDebugMode: () => false,
  getIsOwner: () => false,
  getLoading: () => false,
  getError: () => '',
  getCurrentSceneId: () => 101,
  ...overrides,
})

describe('usePlayerTelemetry', () => {
  beforeEach(() => {
    recordPlayEvent.mockReset()
    recordPlayEvent.mockResolvedValue(undefined)
  })

  it('调试模式或作者本人试玩不记录埋点', () => {
    createTelemetry({ getDebugMode: () => true }).logPlayEvent('start')
    createTelemetry({ getIsOwner: () => true }).logPlayEvent('start')
    createTelemetry({ getLoading: () => true }).logPlayEvent('start')
    createTelemetry({ getError: () => 'boom' }).logPlayEvent('start')
    expect(recordPlayEvent).not.toHaveBeenCalled()
  })

  it('同一会话内场景进入、选项、结局按各自维度去重', () => {
    const telemetry = createTelemetry()

    telemetry.logPlayEvent('scene_enter', { scene_id: 101 })
    telemetry.logPlayEvent('scene_enter', { scene_id: 101 })
    telemetry.logPlayEvent('scene_enter', { scene_id: 102 })

    telemetry.logPlayEvent('choice', { content_id: 5, path_id: 9 })
    telemetry.logPlayEvent('choice', { content_id: 5, path_id: 9 })
    telemetry.logPlayEvent('choice', { content_id: 5, path_id: 10 })

    telemetry.logPlayEvent('ending', { ending_id: 3 })
    telemetry.logPlayEvent('ending', { ending_id: 3 })

    // 场景 101/102、选项 5:9 与 5:10、结局 3 各一次，重复调用不再记录
    expect(recordPlayEvent).toHaveBeenCalledTimes(5)
  })

  it('start 与 finish 各只记录一次', () => {
    const telemetry = createTelemetry()
    telemetry.logStartOnce()
    telemetry.logStartOnce()
    telemetry.logPlayEvent('finish')
    telemetry.logPlayEvent('finish')
    expect(recordPlayEvent).toHaveBeenCalledTimes(2)
  })

  it('resetTelemetryTracking 后可以重新记录同一场景与通关', () => {
    const telemetry = createTelemetry()
    telemetry.logPlayEvent('scene_enter', { scene_id: 101 })
    telemetry.logPlayEvent('finish')
    telemetry.resetTelemetryTracking()
    telemetry.logPlayEvent('scene_enter', { scene_id: 101 })
    telemetry.logPlayEvent('finish')
    expect(recordPlayEvent).toHaveBeenCalledTimes(4)
  })

  it('logCurrentScene 在 500ms 内重复进入同一场景只记一次', () => {
    const telemetry = createTelemetry()
    telemetry.logCurrentScene()
    telemetry.logCurrentScene()
    expect(recordPlayEvent).toHaveBeenCalledTimes(1)
  })

  it('没有当前场景时不记录', () => {
    const telemetry = createTelemetry({ getCurrentSceneId: () => 0 })
    telemetry.logCurrentScene()
    expect(recordPlayEvent).not.toHaveBeenCalled()
  })
})
