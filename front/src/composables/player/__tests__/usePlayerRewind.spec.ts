import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LINE_SNAPSHOT_LIMIT, usePlayerRewind } from '@/composables/player/usePlayerRewind'

function createRewind() {
  const state = {
    sceneIndex: ref(1),
    dialogueIndex: ref(2),
    variables: ref<Record<string, any>>({ hp: 5 }),
    lastEffectKey: ref('fx_1'),
    endings: ref<Set<any>>(new Set(['end_a'])),
    history: ref<any[]>([{ content_id: 1 }, { content_id: 2 }]),
    scene: ref<any>({ content_id: 2 }),
    isWaiting: ref(true),
    isPlaying: ref(false),
    showDialogueBox: ref(false),
    bumpBehaviorReview: vi.fn(),
    clearWait: vi.fn(),
    clearTyping: vi.fn(),
    resetAutoTimer: vi.fn(),
    markSkipRestoredLine: vi.fn(),
    startTyping: vi.fn(),
    applyVolumes: vi.fn(),
  }

  const api = usePlayerRewind({
    getDialogue: () => state.scene.value,
    getSceneIndex: () => state.sceneIndex.value,
    setSceneIndex: (value) => { state.sceneIndex.value = value },
    getDialogueIndex: () => state.dialogueIndex.value,
    setDialogueIndex: (value) => { state.dialogueIndex.value = value },
    getVariables: () => state.variables.value,
    setVariables: (value) => { state.variables.value = value },
    getLastEffectKey: () => state.lastEffectKey.value,
    setLastEffectKey: (value) => { state.lastEffectKey.value = value },
    getEndings: () => state.endings.value,
    setEndings: (value) => { state.endings.value = value },
    getHistory: () => state.history.value,
    setHistory: (value) => { state.history.value = value },
    setIsWaiting: (value) => { state.isWaiting.value = value },
    setIsPlaying: (value) => { state.isPlaying.value = value },
    setShowDialogueBox: (value) => { state.showDialogueBox.value = value },
    bumpBehaviorReview: () => state.bumpBehaviorReview(),
    clearWait: () => state.clearWait(),
    clearTyping: () => state.clearTyping(),
    resetAutoTimer: () => state.resetAutoTimer(),
    markSkipRestoredLine: () => state.markSkipRestoredLine(),
    startTyping: () => state.startTyping(),
    applyVolumes: () => state.applyVolumes(),
  })

  return { api, state }
}

describe('usePlayerRewind', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('初始没有回退点', () => {
    const { api } = createRewind()

    expect(api.canRollback.value).toBe(false)
    expect(api.lineSnapshots.value).toEqual([])
  })

  it('采集快照包含位置、变量、结局与历史长度', () => {
    const { api } = createRewind()

    expect(api.captureLineSnapshot()).toEqual({
      sceneIndex: 1,
      dialogueIndex: 2,
      variables: { hp: 5 },
      lastEffectKey: 'fx_1',
      endings: ['end_a'],
      historyLength: 2,
    })
  })

  it('变量与结局为深拷贝，后续改动不影响已有快照', () => {
    const { api, state } = createRewind()

    const snap = api.captureLineSnapshot()!
    state.variables.value.hp = 99
    state.endings.value.add('end_b')

    expect(snap.variables).toEqual({ hp: 5 })
    expect(snap.endings).toEqual(['end_a'])
  })

  it('当前没有台词时不采集', () => {
    const { api, state } = createRewind()
    state.scene.value = null

    expect(api.captureLineSnapshot()).toBeNull()
    api.pushLineSnapshot()
    expect(api.canRollback.value).toBe(false)
  })

  it('入栈后可以回退', () => {
    const { api } = createRewind()

    api.pushLineSnapshot()

    expect(api.canRollback.value).toBe(true)
    expect(api.lineSnapshots.value).toHaveLength(1)
  })

  it('同位置重复入栈只保留一条', () => {
    const { api } = createRewind()

    api.pushLineSnapshot()
    api.pushLineSnapshot()
    api.pushLineSnapshot()

    expect(api.lineSnapshots.value).toHaveLength(1)
  })

  it('换位置后分别入栈', () => {
    const { api, state } = createRewind()

    api.pushLineSnapshot()
    state.dialogueIndex.value = 3
    api.pushLineSnapshot()

    expect(api.lineSnapshots.value.map(s => s.dialogueIndex)).toEqual([2, 3])
  })

  it('传入快照时直接入栈，不再重新采集', () => {
    const { api, state } = createRewind()
    const preset = {
      sceneIndex: 0,
      dialogueIndex: 7,
      variables: { hp: 1 },
      lastEffectKey: 'fx_0',
      endings: [],
      historyLength: 0,
    }

    state.dialogueIndex.value = 9
    api.pushLineSnapshot(preset)

    expect(api.lineSnapshots.value).toEqual([preset])
  })

  it('超过上限时丢弃最早的回退点', () => {
    const { api, state } = createRewind()

    for (let i = 0; i < LINE_SNAPSHOT_LIMIT + 5; i++) {
      state.dialogueIndex.value = i
      api.pushLineSnapshot()
    }

    expect(api.lineSnapshots.value).toHaveLength(LINE_SNAPSHOT_LIMIT)
    expect(api.lineSnapshots.value[0].dialogueIndex).toBe(5)
    expect(api.lineSnapshots.value[LINE_SNAPSHOT_LIMIT - 1].dialogueIndex).toBe(LINE_SNAPSHOT_LIMIT + 4)
  })

  it('清空后不再可回退', () => {
    const { api } = createRewind()
    api.pushLineSnapshot()

    api.clearLineSnapshots()

    expect(api.lineSnapshots.value).toEqual([])
    expect(api.canRollback.value).toBe(false)
  })

  it('空栈回退是空操作', () => {
    const { api, state } = createRewind()

    api.rollbackOneLine()

    expect(state.sceneIndex.value).toBe(1)
    expect(state.dialogueIndex.value).toBe(2)
    expect(state.bumpBehaviorReview).not.toHaveBeenCalled()
    expect(state.clearTyping).not.toHaveBeenCalled()
    expect(state.startTyping).not.toHaveBeenCalled()
  })

  it('回退还原位置、变量、演出指令、结局与历史', () => {
    const { api, state } = createRewind()
    api.pushLineSnapshot()

    state.sceneIndex.value = 4
    state.dialogueIndex.value = 8
    state.variables.value = { hp: 0 }
    state.lastEffectKey.value = 'fx_9'
    state.endings.value = new Set(['end_a', 'end_c'])
    state.history.value = [{ content_id: 1 }, { content_id: 2 }, { content_id: 3 }, { content_id: 4 }]

    api.rollbackOneLine()

    expect(state.sceneIndex.value).toBe(1)
    expect(state.dialogueIndex.value).toBe(2)
    expect(state.variables.value).toEqual({ hp: 5 })
    expect(state.lastEffectKey.value).toBe('fx_1')
    expect([...state.endings.value]).toEqual(['end_a'])
    expect(state.history.value).toEqual([{ content_id: 1 }, { content_id: 2 }])
  })

  it('回退弹出栈顶，连续回退按倒序还原', () => {
    const { api, state } = createRewind()
    state.dialogueIndex.value = 5
    api.pushLineSnapshot()
    state.dialogueIndex.value = 6
    api.pushLineSnapshot()

    api.rollbackOneLine()
    expect(state.dialogueIndex.value).toBe(6)
    expect(api.lineSnapshots.value).toHaveLength(1)

    api.rollbackOneLine()
    expect(state.dialogueIndex.value).toBe(5)
    expect(api.canRollback.value).toBe(false)
  })

  it('回退中断逐字、停顿与自动播放并重开对话框', () => {
    const { api, state } = createRewind()
    api.pushLineSnapshot()

    api.rollbackOneLine()

    expect(state.bumpBehaviorReview).toHaveBeenCalledTimes(1)
    expect(state.clearWait).toHaveBeenCalledTimes(1)
    expect(state.clearTyping).toHaveBeenCalledTimes(1)
    expect(state.resetAutoTimer).toHaveBeenCalledTimes(1)
    expect(state.isWaiting.value).toBe(false)
    expect(state.isPlaying.value).toBe(true)
    expect(state.showDialogueBox.value).toBe(true)
  })

  it('回退后按新位置重演且不触发跳过已读', async () => {
    const { api, state } = createRewind()
    api.pushLineSnapshot()

    api.rollbackOneLine()
    expect(state.startTyping).not.toHaveBeenCalled()

    await nextTick()

    expect(state.markSkipRestoredLine).toHaveBeenCalledTimes(1)
    expect(state.startTyping).toHaveBeenCalledTimes(1)
    expect(state.applyVolumes).toHaveBeenCalledTimes(1)
  })
})
