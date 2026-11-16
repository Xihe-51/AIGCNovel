import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { usePlayerPositionEffects } from '@/composables/player/usePlayerPositionEffects'
import { withSetup } from '@/__tests__/helpers'

const createEffects = () => {
  const loading = ref(false)
  const error = ref<unknown>(null)
  const restoring = ref(false)
  const sceneIndex = ref(0)
  const dialogueIndex = ref(0)
  const playing = ref(true)
  const scene = ref<any>({ scene_id: 1 })
  const dialogue = ref<any>({ content_id: 'c1' })
  const directives = ref<any>({})

  const spies = {
    saveToSlot: vi.fn(),
    saveProgress: vi.fn(),
    resetStage: vi.fn(),
    applyDirectives: vi.fn(),
    playBackgroundMusic: vi.fn(),
  }

  const ctx = {
    isLoading: () => loading.value,
    getError: () => error.value,
    isRestoring: () => restoring.value,
    getSceneIndex: () => sceneIndex.value,
    getDialogueIndex: () => dialogueIndex.value,
    saveToSlot: (slot: number, silent?: boolean) => spies.saveToSlot(slot, silent),
    saveProgress: (silent?: boolean) => spies.saveProgress(silent),
    getCurrentDialogue: () => dialogue.value,
    getCurrentScene: () => scene.value,
    getDirectivesByContent: () => directives.value,
    getIsPlaying: () => playing.value,
    resetStage: () => spies.resetStage(),
    applyDirectives: (value: any) => spies.applyDirectives(value),
    playBackgroundMusic: () => spies.playBackgroundMusic(),
  }

  return {
    ctx,
    spies,
    state: { loading, error, restoring, sceneIndex, dialogueIndex, playing, scene, dialogue, directives },
  }
}

describe('usePlayerPositionEffects', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('挂载即应用一次演出指令，指令回填后重新应用', async () => {
    const { ctx, spies, state } = createEffects()

    withSetup(() => usePlayerPositionEffects(ctx))

    expect(spies.resetStage).toHaveBeenCalledTimes(1)
    expect(spies.applyDirectives).toHaveBeenLastCalledWith(state.dialogue.value)

    state.directives.value = { c1: [{ type: 'bg' }] }
    await nextTick()

    expect(spies.resetStage).toHaveBeenCalledTimes(2)
    expect(spies.applyDirectives).toHaveBeenCalledTimes(2)
  })

  it('加载中或出错时不应用指令，数据就绪后补上一次', async () => {
    const { ctx, spies, state } = createEffects()
    state.loading.value = true

    withSetup(() => usePlayerPositionEffects(ctx))

    expect(spies.resetStage).not.toHaveBeenCalled()

    state.loading.value = false
    await nextTick()
    expect(spies.resetStage).toHaveBeenCalledTimes(1)
    expect(spies.applyDirectives).toHaveBeenCalledTimes(1)

    state.error.value = 'boom'
    await nextTick()
    expect(spies.applyDirectives).toHaveBeenCalledTimes(1)
  })

  it('位置变化延迟 1500ms 静默写入自动存档槽 0，期间连续变化只写一次', async () => {
    vi.useFakeTimers()
    const { ctx, spies, state } = createEffects()

    withSetup(() => usePlayerPositionEffects(ctx))

    state.sceneIndex.value = 1
    await nextTick()
    vi.advanceTimersByTime(1000)
    expect(spies.saveToSlot).not.toHaveBeenCalled()
    expect(spies.saveProgress).not.toHaveBeenCalled()

    state.dialogueIndex.value = 1
    await nextTick()
    vi.advanceTimersByTime(1499)
    expect(spies.saveToSlot).not.toHaveBeenCalled()
    expect(spies.saveProgress).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(spies.saveToSlot).toHaveBeenCalledTimes(1)
    expect(spies.saveToSlot).toHaveBeenCalledWith(0, true)
    expect(spies.saveProgress).toHaveBeenCalledTimes(1)
    expect(spies.saveProgress).toHaveBeenCalledWith(true)

    vi.advanceTimersByTime(5000)
    expect(spies.saveToSlot).toHaveBeenCalledTimes(1)
    expect(spies.saveProgress).toHaveBeenCalledTimes(1)
  })

  it('读档还原中 / 加载中 / 出错时跳过自动存档', async () => {
    vi.useFakeTimers()
    const { ctx, spies, state } = createEffects()

    withSetup(() => usePlayerPositionEffects(ctx))

    state.restoring.value = true
    state.sceneIndex.value = 1
    await nextTick()
    vi.advanceTimersByTime(2000)
    expect(spies.saveToSlot).not.toHaveBeenCalled()

    state.restoring.value = false
    state.loading.value = true
    state.sceneIndex.value = 2
    await nextTick()
    vi.advanceTimersByTime(2000)
    expect(spies.saveToSlot).not.toHaveBeenCalled()

    state.loading.value = false
    state.error.value = 'boom'
    state.sceneIndex.value = 3
    await nextTick()
    vi.advanceTimersByTime(2000)
    expect(spies.saveToSlot).not.toHaveBeenCalled()

    state.error.value = null
    state.sceneIndex.value = 4
    await nextTick()
    vi.advanceTimersByTime(1500)
    expect(spies.saveToSlot).toHaveBeenCalledTimes(1)
    expect(spies.saveProgress).toHaveBeenCalledTimes(1)
  })

  it('换场景后重播背景音乐，同场景推进与暂停时不重播', async () => {
    const { ctx, spies, state } = createEffects()

    withSetup(() => usePlayerPositionEffects(ctx))

    state.dialogueIndex.value = 1
    await nextTick()
    await nextTick()
    expect(spies.playBackgroundMusic).not.toHaveBeenCalled()

    state.playing.value = false
    state.scene.value = { scene_id: 2 }
    await nextTick()
    await nextTick()
    expect(spies.playBackgroundMusic).not.toHaveBeenCalled()

    state.playing.value = true
    state.scene.value = { scene_id: 3 }
    await nextTick()
    await nextTick()
    expect(spies.playBackgroundMusic).toHaveBeenCalledTimes(1)
  })

  it('卸载时清掉尚未触发的自动存档定时器', async () => {
    vi.useFakeTimers()
    const { ctx, spies, state } = createEffects()

    const { wrapper } = withSetup(() => usePlayerPositionEffects(ctx))

    state.sceneIndex.value = 1
    await nextTick()

    wrapper.unmount()
    vi.advanceTimersByTime(5000)

    expect(spies.saveToSlot).not.toHaveBeenCalled()
  })
})
