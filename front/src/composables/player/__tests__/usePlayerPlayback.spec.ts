import { describe, expect, it, vi } from 'vitest'
import { usePlayerPlayback } from '@/composables/player/usePlayerPlayback'

function createPlayback(overrides: Partial<Parameters<typeof usePlayerPlayback>[0]> = {}) {
  const state = {
    autoPlay: false,
    showDialogueBox: true,
    showHistory: false,
    choices: [
      { path_id: 7, label: '留下' },
      { path_id: 8, label: '离开' },
    ] as any[],
    autoAdvanced: 0,
    snapshotCount: 0,
    sceneAdvanced: 0,
    selected: [] as any[],
    reviewBumps: 0,
  }

  const api = usePlayerPlayback({
    getAutoPlay: () => state.autoPlay,
    setAutoPlay: (value) => { state.autoPlay = value },
    getShowDialogueBox: () => state.showDialogueBox,
    setShowDialogueBox: (value) => { state.showDialogueBox = value },
    getShowHistory: () => state.showHistory,
    setShowHistory: (value) => { state.showHistory = value },
    getChoices: () => state.choices,
    scheduleAutoAdvance: vi.fn(() => { state.autoAdvanced += 1 }),
    pushLineSnapshot: vi.fn(() => { state.snapshotCount += 1 }),
    nextScene: vi.fn(() => { state.sceneAdvanced += 1 }),
    selectBranch: vi.fn((branch) => { state.selected.push(branch) }),
    bumpBehaviorReview: vi.fn(() => { state.reviewBumps += 1 }),
    ...overrides,
  })

  return { ...api, state }
}

describe('usePlayerPlayback', () => {
  it('自动前进交给排期函数', () => {
    const { autoAdvanceDialogue, state } = createPlayback()
    autoAdvanceDialogue()
    expect(state.autoAdvanced).toBe(1)
  })

  it('快进下一场景先留快照再推进', () => {
    const { skipToNextScene, state } = createPlayback()
    skipToNextScene()
    expect(state.snapshotCount).toBe(1)
    expect(state.sceneAdvanced).toBe(1)
  })

  it('切换对话框显隐按当前状态取反', () => {
    const { toggleDialogueBox, state } = createPlayback()
    toggleDialogueBox()
    expect(state.showDialogueBox).toBe(false)
    toggleDialogueBox()
    expect(state.showDialogueBox).toBe(true)
  })

  it('打开回想记一次行为埋点，关闭不记', () => {
    const { toggleHistoryDialogue, state } = createPlayback()
    toggleHistoryDialogue()
    expect(state.showHistory).toBe(true)
    expect(state.reviewBumps).toBe(1)

    toggleHistoryDialogue()
    expect(state.showHistory).toBe(false)
    expect(state.reviewBumps).toBe(1)
  })

  it('打开自动播放立即排期，关闭只改状态', () => {
    const { toggleAutoPlay, state } = createPlayback()
    toggleAutoPlay()
    expect(state.autoPlay).toBe(true)
    expect(state.autoAdvanced).toBe(1)

    toggleAutoPlay()
    expect(state.autoPlay).toBe(false)
    expect(state.autoAdvanced).toBe(1)
  })

  it('自动播放时上滑不打断节奏', () => {
    const { onWheelUp, state } = createPlayback()
    state.autoPlay = true
    onWheelUp()
    expect(state.showHistory).toBe(false)
    expect(state.reviewBumps).toBe(0)
  })

  it('非自动播放时上滑唤出回想', () => {
    const { onWheelUp, state } = createPlayback()
    onWheelUp()
    expect(state.showHistory).toBe(true)
    expect(state.reviewBumps).toBe(1)
  })

  it('选项点击按 path_id 选中分支', () => {
    const { handleChoiceSelect, state } = createPlayback()
    handleChoiceSelect(8)
    expect(state.selected).toHaveLength(1)
    expect(state.selected[0].label).toBe('离开')
  })

  it('未知 path_id 不触发分支选择', () => {
    const { handleChoiceSelect, state } = createPlayback()
    handleChoiceSelect(999)
    expect(state.selected).toHaveLength(0)
  })

  it('没有可用选项时点击不报错', () => {
    const { handleChoiceSelect, state } = createPlayback()
    state.choices = []
    expect(() => handleChoiceSelect(7)).not.toThrow()
    expect(state.selected).toHaveLength(0)
  })
})
