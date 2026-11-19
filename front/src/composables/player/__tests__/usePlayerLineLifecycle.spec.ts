import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { usePlayerLineLifecycle, type PlayerLineLifecycleContext } from '../usePlayerLineLifecycle'

const flush = async () => {
  await nextTick()
  await nextTick()
}

interface Harness {
  ctx: PlayerLineLifecycleContext
  calls: string[]
  currentDialogue: ReturnType<typeof ref<any>>
  sceneIndex: ReturnType<typeof ref<number>>
  dialogueIndex: ReturnType<typeof ref<number>>
  settings: ReturnType<typeof ref<any>>
  isPlaying: ReturnType<typeof ref<boolean>>
}

const makeHarness = (overrides: Partial<PlayerLineLifecycleContext> = {}): Harness => {
  const calls: string[] = []
  const currentDialogue = ref<any>({ content_id: 201, content_type: '对话' })
  const sceneIndex = ref(0)
  const dialogueIndex = ref(0)
  const settings = ref<any>({ textSpeed: 30, language: 'zh', autoDelay: 1500, voiceEnabled: true })
  const isPlaying = ref(true)

  const spy = (name: string, impl?: (...args: any[]) => any) =>
    vi.fn((...args: any[]) => {
      calls.push(name)
      return impl ? impl(...args) : undefined
    })

  const ctx: PlayerLineLifecycleContext = {
    currentDialogue,
    sceneIndex,
    dialogueIndex,
    settings,
    isPlaying,
    applyEffectsForCurrent: spy('applyEffectsForCurrent'),
    checkEndingForCurrent: spy('checkEndingForCurrent', () => false),
    consumeSkipRestoredLine: spy('consumeSkipRestoredLine', () => false),
    shouldSkipCurrent: spy('shouldSkipCurrent', () => false),
    allowSkip: spy('allowSkip', () => true),
    resetSkipGuard: spy('resetSkipGuard'),
    markCurrentRead: spy('markCurrentRead'),
    markHesitationStart: spy('markHesitationStart'),
    clearTyping: spy('clearTyping'),
    clearAutoTimer: spy('clearAutoTimer'),
    typeOut: spy('typeOut'),
    finishTyping: spy('finishTyping'),
    scheduleAutoAdvance: spy('scheduleAutoAdvance'),
    nextDialogue: spy('nextDialogue'),
    setBgmDucking: spy('setBgmDucking'),
    applyVolumes: spy('applyVolumes'),
    ...overrides,
  }

  return { ctx, calls, currentDialogue, sceneIndex, dialogueIndex, settings, isPlaying }
}

describe('usePlayerLineLifecycle / startTyping', () => {
  let h: Harness
  let startTyping: () => void

  beforeEach(() => {
    h = makeHarness()
    startTyping = usePlayerLineLifecycle(h.ctx).startTyping
  })

  it('无当前台词时直接返回，不触发任何注入', () => {
    h.currentDialogue.value = null
    startTyping()
    expect(h.calls).toEqual([])
  })

  it('正常播放按固定顺序执行到逐字显示', () => {
    startTyping()
    expect(h.calls).toEqual([
      'applyEffectsForCurrent',
      'consumeSkipRestoredLine',
      'checkEndingForCurrent',
      'clearTyping',
      'clearAutoTimer',
      'shouldSkipCurrent',
      'resetSkipGuard',
      'markCurrentRead',
      'typeOut',
    ])
  })

  it('消费回退标记先于结局判定，命中结局后不再打字', () => {
    h = makeHarness({ checkEndingForCurrent: vi.fn(() => true) })
    startTyping = usePlayerLineLifecycle(h.ctx).startTyping
    startTyping()
    expect((h.ctx.consumeSkipRestoredLine as any).mock.invocationCallOrder[0]).toBeLessThan(
      (h.ctx.checkEndingForCurrent as any).mock.invocationCallOrder[0],
    )
    expect(h.calls).toEqual(['applyEffectsForCurrent', 'consumeSkipRestoredLine'])
    expect(h.ctx.clearTyping).not.toHaveBeenCalled()
    expect(h.ctx.typeOut).not.toHaveBeenCalled()
  })

  it('跳过已读成功时推进下一句并提前返回', () => {
    h = makeHarness({
      shouldSkipCurrent: vi.fn(() => true),
      allowSkip: vi.fn(() => true),
    })
    startTyping = usePlayerLineLifecycle(h.ctx).startTyping
    startTyping()
    expect(h.ctx.nextDialogue).toHaveBeenCalledTimes(1)
    expect(h.ctx.markCurrentRead).not.toHaveBeenCalled()
    expect(h.ctx.typeOut).not.toHaveBeenCalled()
    expect(h.ctx.resetSkipGuard).not.toHaveBeenCalled()
  })

  it('跳过被闸门拦下时继续正常播放且不重置跳过守卫', () => {
    h = makeHarness({
      shouldSkipCurrent: vi.fn(() => true),
      allowSkip: vi.fn(() => false),
    })
    startTyping = usePlayerLineLifecycle(h.ctx).startTyping
    startTyping()
    expect(h.ctx.nextDialogue).not.toHaveBeenCalled()
    expect(h.ctx.resetSkipGuard).not.toHaveBeenCalled()
    expect(h.ctx.markCurrentRead).toHaveBeenCalledTimes(1)
    expect(h.ctx.typeOut).toHaveBeenCalledTimes(1)
  })

  it('回退后强制展示时即使可跳过也走正常打字分支', () => {
    h = makeHarness({
      consumeSkipRestoredLine: vi.fn(() => true),
      shouldSkipCurrent: vi.fn(() => true),
      allowSkip: vi.fn(() => true),
    })
    startTyping = usePlayerLineLifecycle(h.ctx).startTyping
    startTyping()
    expect(h.ctx.nextDialogue).not.toHaveBeenCalled()
    expect(h.ctx.resetSkipGuard).toHaveBeenCalledTimes(1)
    expect(h.ctx.typeOut).toHaveBeenCalledTimes(1)
  })

  it('选择节点开始犹豫计时并带上 content_id', () => {
    h.currentDialogue.value = { content_id: 305, content_type: '选择' }
    startTyping()
    expect(h.ctx.markHesitationStart).toHaveBeenCalledWith(305)
    expect(h.ctx.typeOut).toHaveBeenCalledTimes(1)
  })

  it('非选择节点不触发犹豫计时', () => {
    startTyping()
    expect(h.ctx.markHesitationStart).not.toHaveBeenCalled()
  })
})

describe('usePlayerLineLifecycle / 设置与切句监听', () => {
  it('文字速度变化后重播当前句', async () => {
    const h = makeHarness()
    usePlayerLineLifecycle(h.ctx)
    h.calls.length = 0
    h.settings.value.textSpeed = 12
    await flush()
    expect(h.ctx.typeOut).toHaveBeenCalledTimes(1)
    expect(h.calls).toContain('applyEffectsForCurrent')
  })

  it('切换语言且正在播放时直接显示整句', async () => {
    const h = makeHarness()
    usePlayerLineLifecycle(h.ctx)
    h.settings.value.language = 'en'
    await flush()
    expect(h.ctx.finishTyping).toHaveBeenCalledTimes(1)
  })

  it('未播放或没有台词时切换语言不动作', async () => {
    const h = makeHarness({ isPlaying: ref(false) })
    usePlayerLineLifecycle(h.ctx)
    h.settings.value.language = 'en'
    await flush()
    expect(h.ctx.finishTyping).not.toHaveBeenCalled()

    const empty = makeHarness()
    empty.currentDialogue.value = null
    usePlayerLineLifecycle(empty.ctx)
    empty.settings.value.language = 'jp'
    await flush()
    expect(empty.ctx.finishTyping).not.toHaveBeenCalled()
  })

  it('自动前进延迟变化后重新排程', async () => {
    const h = makeHarness()
    usePlayerLineLifecycle(h.ctx)
    h.settings.value.autoDelay = 800
    await flush()
    expect(h.ctx.scheduleAutoAdvance).toHaveBeenCalledTimes(1)
  })

  it('关闭语音时恢复 BGM 音量，开启时不处理', async () => {
    const h = makeHarness()
    usePlayerLineLifecycle(h.ctx)
    h.settings.value.voiceEnabled = true
    await flush()
    expect(h.ctx.setBgmDucking).not.toHaveBeenCalled()

    h.settings.value.voiceEnabled = false
    await flush()
    expect(h.ctx.setBgmDucking).toHaveBeenCalledWith(false)
  })

  it('切换对话或场景后重新逐字显示并刷新音量', async () => {
    const h = makeHarness()
    usePlayerLineLifecycle(h.ctx)
    h.calls.length = 0
    h.dialogueIndex.value = 1
    await flush()
    expect(h.calls).toContain('typeOut')
    expect(h.ctx.applyVolumes).toHaveBeenCalledTimes(1)

    h.calls.length = 0
    h.sceneIndex.value = 1
    await flush()
    expect(h.ctx.typeOut).toHaveBeenCalledTimes(2)
    expect(h.ctx.applyVolumes).toHaveBeenCalledTimes(2)
  })
})
