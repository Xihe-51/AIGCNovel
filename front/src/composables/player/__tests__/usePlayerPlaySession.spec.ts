import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'

const elMock = vi.hoisted(() => ({
  success: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: elMock.success },
  ElMessageBox: { confirm: elMock.confirm },
}))

import {
  resolveStartPosition,
  usePlayerPlaySession,
  type PlayerPlaySessionContext,
} from '../usePlayerPlaySession'

const scenes = () => [
  { scene_id: 11 },
  { scene_id: 22 },
  { scene_id: 33 },
]

const basePosition = () => ({
  scenes: scenes(),
  dialogues: {
    11: [{ content_id: 1 }, { content_id: 2 }],
    22: [{ content_id: 3 }, { content_id: 4 }],
    33: [{ content_id: 5 }],
  } as Record<string | number, any[]>,
  sceneIndex: 0,
  dialogueIndex: 0,
  scenePlayable: () => true,
  sceneHasPlayableDialogues: () => true,
  nodePlayable: () => true,
  firstPlayableNodeIndex: () => 0,
})

describe('resolveStartPosition', () => {
  it('起点可用时原样返回', () => {
    const params = basePosition()
    params.sceneIndex = 1
    params.dialogueIndex = 1
    expect(resolveStartPosition(params)).toEqual({ sceneIndex: 1, dialogueIndex: 1 })
  })

  it('起始场景被剧情锁挡住时跳到下一个可播放场景并从第一句开始', () => {
    const params = basePosition()
    params.scenePlayable = (id) => id !== 11
    expect(resolveStartPosition(params)).toEqual({ sceneIndex: 1, dialogueIndex: 0 })
  })

  it('场景没有可播放台词时同样跳过', () => {
    const params = basePosition()
    params.sceneHasPlayableDialogues = (id) => id !== 11
    expect(resolveStartPosition(params)).toEqual({ sceneIndex: 1, dialogueIndex: 0 })
  })

  it('全部场景都不可播放时保持原索引', () => {
    const params = basePosition()
    params.sceneIndex = 1
    params.scenePlayable = () => false
    expect(resolveStartPosition(params)).toEqual({ sceneIndex: 1, dialogueIndex: 0 })
  })

  it('当前台词条件不满足时向后找第一条可播放台词', () => {
    const params = basePosition()
    params.sceneIndex = 1
    params.dialogueIndex = 0
    params.nodePlayable = (node) => node.content_id !== 3
    params.firstPlayableNodeIndex = () => 1
    expect(resolveStartPosition(params)).toEqual({ sceneIndex: 1, dialogueIndex: 1 })
  })

  it('向后找不到时从场景开头再找一次', () => {
    const params = basePosition()
    params.sceneIndex = 1
    params.dialogueIndex = 1
    params.nodePlayable = (node) => node.content_id !== 4
    params.firstPlayableNodeIndex = vi.fn((_sceneId: any, from: number) => (from === 1 ? 2 : 0))
    expect(resolveStartPosition(params)).toEqual({ sceneIndex: 1, dialogueIndex: 0 })
  })

  it('台词全部不可播放时保持原索引', () => {
    const params = basePosition()
    params.sceneIndex = 1
    params.dialogueIndex = 1
    params.nodePlayable = () => false
    params.firstPlayableNodeIndex = () => 2
    expect(resolveStartPosition(params)).toEqual({ sceneIndex: 1, dialogueIndex: 1 })
  })

  it('场景列表为空时不做任何修正', () => {
    const params = basePosition()
    params.scenes = []
    expect(resolveStartPosition(params)).toEqual({ sceneIndex: 0, dialogueIndex: 0 })
  })
})

interface Harness {
  ctx: PlayerPlaySessionContext
  calls: string[]
  sceneIndex: ReturnType<typeof ref<number>>
  dialogueIndex: ReturnType<typeof ref<number>>
  history: ReturnType<typeof ref<any[]>>
  isPlaying: ReturnType<typeof ref<boolean>>
  playthrough: ReturnType<typeof ref<number>>
}

const makeHarness = (overrides: Partial<PlayerPlaySessionContext> = {}): Harness => {
  const calls: string[] = []
  const sceneIndex = ref(0)
  const dialogueIndex = ref(0)
  const history = ref<any[]>([{ id: 'old' }])
  const isPlaying = ref(false)
  const playthrough = ref(2)

  const spy = (name: string, impl?: (...args: any[]) => any) =>
    vi.fn((...args: any[]) => {
      calls.push(name)
      return impl ? impl(...args) : undefined
    })

  const ctx: PlayerPlaySessionContext = {
    scenes: ref(scenes()),
    allDialogues: ref({
      11: [{ content_id: 1 }, { content_id: 2 }],
      22: [{ content_id: 3 }],
      33: [{ content_id: 5 }],
    } as Record<string | number, any[]>),
    sceneIndex,
    dialogueIndex,
    history,
    isPlaying,
    playthrough,
    playthroughKey: () => 'aigc:playthrough:7',
    scenePlayable: spy('scenePlayable', () => true),
    sceneHasPlayableDialogues: spy('sceneHasPlayableDialogues', () => true),
    nodePlayable: spy('nodePlayable', () => true),
    firstPlayableNodeIndex: spy('firstPlayableNodeIndex', () => 0),
    playBackgroundMusic: spy('playBackgroundMusic'),
    stopBackgroundMusic: spy('stopBackgroundMusic'),
    clearAutoTimer: spy('clearAutoTimer'),
    startTyping: spy('startTyping'),
    resetEndings: spy('resetEndings'),
    resetAchievementState: spy('resetAchievementState'),
    resetVariables: spy('resetVariables'),
    resetTelemetryTracking: spy('resetTelemetryTracking'),
    clearLineSnapshots: spy('clearLineSnapshots'),
    clearVariableNotices: spy('clearVariableNotices'),
    syncProjectMeta: spy('syncProjectMeta'),
    setLastEffectKey: spy('setLastEffectKey'),
    t: (key) => key,
    ...overrides,
  }

  return { ctx, calls, sceneIndex, dialogueIndex, history, isPlaying, playthrough }
}

describe('usePlayerPlaySession / startPreview', () => {
  it('修正起点后开始播放音乐与逐字显示', () => {
    const h = makeHarness()
    h.sceneIndex.value = 0
    h.ctx.scenePlayable = (id) => id !== 11
    const { startPreview } = usePlayerPlaySession(h.ctx)
    startPreview()
    expect(h.sceneIndex.value).toBe(1)
    expect(h.dialogueIndex.value).toBe(0)
    expect(h.isPlaying.value).toBe(true)
    expect(h.ctx.playBackgroundMusic).toHaveBeenCalledTimes(1)
    expect(h.ctx.startTyping).toHaveBeenCalledTimes(1)
  })
})

describe('usePlayerPlaySession / resetGame', () => {
  it('完整重置进度、结局、成就、变量与埋点后重新开局', async () => {
    const h = makeHarness()
    h.sceneIndex.value = 2
    h.dialogueIndex.value = 1
    const { resetGame } = usePlayerPlaySession(h.ctx)
    resetGame()

    expect(h.calls[0]).toBe('stopBackgroundMusic')
    expect(h.sceneIndex.value).toBe(0)
    expect(h.dialogueIndex.value).toBe(0)
    expect(h.history.value).toEqual([])
    for (const name of [
      'resetEndings', 'resetAchievementState', 'resetVariables',
      'clearLineSnapshots', 'resetTelemetryTracking',
    ]) {
      expect(h.calls).toContain(name)
    }
    await nextTick()
    expect(h.ctx.startTyping).toHaveBeenCalledTimes(1)
  })
})

describe('usePlayerPlaySession / startNextPlaythrough', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('保留变量、推进周目号并写回跨周目数据', async () => {
    const h = makeHarness()
    h.sceneIndex.value = 1
    const { startNextPlaythrough } = usePlayerPlaySession(h.ctx)
    startNextPlaythrough()

    expect(h.calls).toContain('clearAutoTimer')
    expect(h.calls).toContain('resetEndings')
    expect(h.calls).toContain('clearVariableNotices')
    expect(h.ctx.setLastEffectKey).toHaveBeenCalledWith('')
    expect(h.ctx.syncProjectMeta).toHaveBeenCalledWith(true)
    expect(h.ctx.resetVariables).not.toHaveBeenCalled()
    expect(h.playthrough.value).toBe(3)
    expect(localStorage.getItem('aigc:playthrough:7')).toBe('3')
    await nextTick()
    expect(h.ctx.startTyping).toHaveBeenCalledTimes(1)
  })
})

describe('usePlayerPlaySession / restartGame', () => {
  beforeEach(() => {
    elMock.success.mockClear()
    elMock.confirm.mockReset()
  })

  it('确认后重置变量并从第一章重新开始', async () => {
    elMock.confirm.mockImplementationOnce(() => Promise.resolve())
    const h = makeHarness()
    h.sceneIndex.value = 2
    h.dialogueIndex.value = 1
    const { restartGame } = usePlayerPlaySession(h.ctx)
    await restartGame()
    await nextTick()

    expect(h.calls[0]).toBe('stopBackgroundMusic')
    expect(h.sceneIndex.value).toBe(0)
    expect(h.dialogueIndex.value).toBe(0)
    expect(h.history.value).toEqual([])
    expect(h.ctx.resetVariables).toHaveBeenCalledTimes(1)
    expect(h.ctx.clearLineSnapshots).toHaveBeenCalledTimes(1)
    expect(h.ctx.resetTelemetryTracking).toHaveBeenCalledTimes(1)
    expect(h.ctx.resetEndings).not.toHaveBeenCalled()
    expect(h.ctx.startTyping).toHaveBeenCalledTimes(1)
    expect(elMock.success).toHaveBeenCalledWith('toast.restarted')
  })

  it('玩家取消时不做任何重置', async () => {
    elMock.confirm.mockImplementationOnce(() => Promise.reject(new Error('cancel')))
    const h = makeHarness()
    h.sceneIndex.value = 2
    const { restartGame } = usePlayerPlaySession(h.ctx)
    await restartGame()
    await nextTick()

    expect(h.sceneIndex.value).toBe(2)
    expect(h.ctx.resetVariables).not.toHaveBeenCalled()
    expect(h.ctx.startTyping).not.toHaveBeenCalled()
    expect(elMock.success).not.toHaveBeenCalled()
  })
})
