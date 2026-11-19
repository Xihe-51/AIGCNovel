import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getSave, putSave } from '@/api/save'
import { usePlayerProgress } from '@/composables/player/usePlayerProgress'

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn(),
  },
}))

vi.mock('@/api/save', () => ({
  listSaves: vi.fn(async () => []),
  getSave: vi.fn(),
  putSave: vi.fn(),
  deleteSave: vi.fn(async () => ({})),
}))

function createProgress() {
  const state = {
    sceneIndex: ref(2),
    dialogueIndex: ref(1),
    history: ref<any[]>([{ content_id: 11, content_text: '第一句台词' }]),
    variables: ref<Record<string, any>>({ hp: 5 }),
    lastEffectKey: ref('e1'),
    endings: ref<Set<any>>(new Set(['end_a'])),
    playthrough: ref(3),
    scene: ref<any>({ scene_id: 9, title: '场景一', background_url: 'bg.png' }),
    dialogue: ref<any>({ content_id: 11, content_text: '第一句台词' }),
    cover: ref(''),
    initVariableValues: vi.fn(),
    clearLineSnapshots: vi.fn(),
    syncProjectMeta: vi.fn(),
    startTyping: vi.fn(),
    applyVolumes: vi.fn(),
    stopBackgroundMusic: vi.fn(),
    exitToHome: vi.fn(),
  }

  const api = usePlayerProgress({
    projectId: () => 7,
    getSceneIndex: () => state.sceneIndex.value,
    setSceneIndex: (value) => { state.sceneIndex.value = value },
    getDialogueIndex: () => state.dialogueIndex.value,
    setDialogueIndex: (value) => { state.dialogueIndex.value = value },
    getHistory: () => state.history.value,
    setHistory: (value) => { state.history.value = value },
    getVariables: () => state.variables.value,
    setVariables: (value) => { state.variables.value = value },
    getLastEffectKey: () => state.lastEffectKey.value,
    setLastEffectKey: (value) => { state.lastEffectKey.value = value },
    getEndings: () => state.endings.value,
    setEndings: (value) => { state.endings.value = value },
    getPlaythrough: () => state.playthrough.value,
    setPlaythrough: (value) => { state.playthrough.value = value },
    playthroughKey: () => 'playthrough_7',
    getScene: () => state.scene.value,
    getDialogue: () => state.dialogue.value,
    getCoverUrl: () => state.cover.value,
    sceneTitleOf: (scene) => scene?.title || '',
    textOf: (dialogue) => dialogue?.content_text || '',
    initVariableValues: () => state.initVariableValues(),
    clearLineSnapshots: () => state.clearLineSnapshots(),
    syncProjectMeta: (immediate) => state.syncProjectMeta(immediate),
    startTyping: () => state.startTyping(),
    applyVolumes: () => state.applyVolumes(),
    stopBackgroundMusic: () => state.stopBackgroundMusic(),
    exitToHome: () => state.exitToHome(),
    t: (key) => key,
  })

  return { api, state }
}

describe('usePlayerProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('保存进度写入本地存储并提示', () => {
    const { api } = createProgress()

    api.saveProgress()

    const stored = JSON.parse(localStorage.getItem('gameProgress_7') || '{}')
    expect(stored).toMatchObject({
      projectId: 7,
      currentSceneIndex: 2,
      currentDialogueIndex: 1,
      playthrough: 3,
      variables: { hp: 5 },
      lastEffectKey: 'e1',
      triggeredEndings: ['end_a'],
    })
    expect(typeof stored.saveTime).toBe('string')
    expect(ElMessage.success).toHaveBeenCalledWith('save.saved')
  })

  it('静默保存不弹提示', () => {
    const { api } = createProgress()

    api.saveProgress(true)

    expect(localStorage.getItem('gameProgress_7')).toBeTruthy()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('本地写入失败时报错但不抛出', () => {
    const { api } = createProgress()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      expect(() => api.saveProgress()).not.toThrow()
      expect(ElMessage.error).toHaveBeenCalledWith('save.saveFailed')
    } finally {
      spy.mockRestore()
      errorSpy.mockRestore()
    }
  })

  it('存档摘要包含场景名与台词片段', async () => {
    const { api } = createProgress()
    vi.mocked(putSave).mockResolvedValue({ slot: 1 } as any)

    await api.saveToSlot(1)

    const [, slot, , summary] = vi.mocked(putSave).mock.calls[0]
    expect(slot).toBe(1)
    expect(summary).toBe('场景一 · 第一句台词')
  })

  it('台词为空时摘要只保留场景名', async () => {
    const { api, state } = createProgress()
    state.dialogue.value = null
    state.scene.value = { scene_id: 9, title: '', background_url: '' }
    vi.mocked(putSave).mockResolvedValue({ slot: 2 } as any)

    await api.saveToSlot(2)

    const [, , , summary] = vi.mocked(putSave).mock.calls[0]
    expect(summary).toBe('save.unnamedScene')
  })

  it('采集存档状态包含进度、变量与缩略图', async () => {
    const { api } = createProgress()
    vi.mocked(putSave).mockResolvedValue({ slot: 1 } as any)

    await api.saveToSlot(1)

    const [, , saveState] = vi.mocked(putSave).mock.calls[0]
    expect(saveState).toMatchObject({
      sceneIndex: 2,
      dialogueIndex: 1,
      lastEffectKey: 'e1',
      playthrough: 3,
      scene_id: 9,
      scene_title: '场景一',
      thumbnail_url: 'bg.png',
      triggeredEndings: ['end_a'],
      variables: { hp: 5 },
    })
  })

  it('场景无背景图时缩略图回退到作品封面', async () => {
    const { api, state } = createProgress()
    state.scene.value = { scene_id: 9, title: '场景一', background_url: '' }
    state.cover.value = 'cover.png'
    vi.mocked(putSave).mockResolvedValue({ slot: 1 } as any)

    await api.saveToSlot(1)

    const [, , saveState] = vi.mocked(putSave).mock.calls[0]
    expect(saveState.thumbnail_url).toBe('cover.png')
  })

  it('云端存档失败时回退本地且不提示成功', async () => {
    const { api } = createProgress()
    vi.mocked(putSave).mockRejectedValue(new Error('network'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      await api.saveToSlot(1)
      expect(localStorage.getItem('gameProgress_7')).toBeTruthy()
      expect(ElMessage.warning).toHaveBeenCalledWith('save.cloudSaveFailed')
      expect(ElMessage.success).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('读取云端存档后回写播放状态并恢复演出', async () => {
    const { api, state } = createProgress()
    vi.mocked(getSave).mockResolvedValue({
      state: {
        sceneIndex: 5,
        dialogueIndex: 2,
        historyDialogues: [{ content_id: 21 }],
        variables: { hp: 1 },
        lastEffectKey: 'e9',
        triggeredEndings: ['end_b'],
        playthrough: 4,
      },
    } as any)

    await api.loadFromSlot(1)

    expect(state.sceneIndex.value).toBe(5)
    expect(state.dialogueIndex.value).toBe(2)
    expect(state.history.value).toEqual([{ content_id: 21 }])
    expect(state.variables.value).toEqual({ hp: 1 })
    expect(state.lastEffectKey.value).toBe('e9')
    expect([...state.endings.value]).toEqual(['end_b'])
    expect(state.playthrough.value).toBe(4)
    expect(localStorage.getItem('playthrough_7')).toBe('4')
    expect(state.initVariableValues).toHaveBeenCalled()
    expect(state.clearLineSnapshots).toHaveBeenCalled()
    expect(state.syncProjectMeta).toHaveBeenCalledWith(true)
    expect(ElMessage.success).toHaveBeenCalledWith('save.loaded')
    await vi.waitFor(() => expect(state.startTyping).toHaveBeenCalled())
    expect(state.applyVolumes).toHaveBeenCalled()
  })

  it('读取云端存档失败时回退本地进度', async () => {
    const { api, state } = createProgress()
    vi.mocked(getSave).mockRejectedValue(new Error('network'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem('gameProgress_7', JSON.stringify({
      currentSceneIndex: 8,
      currentDialogueIndex: 0,
      historyDialogues: [],
      playthrough: 2,
      variables: { hp: 9 },
      lastEffectKey: 'e7',
      triggeredEndings: ['end_c'],
    }))

    try {
      await api.loadFromSlot(1)
      expect(state.sceneIndex.value).toBe(8)
      expect(state.variables.value).toEqual({ hp: 9 })
      expect(ElMessage.success).toHaveBeenCalledWith('toast.progressLoaded')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('读取本地进度恢复进度、变量与结局', () => {
    const { api, state } = createProgress()
    localStorage.setItem('gameProgress_7', JSON.stringify({
      currentSceneIndex: 6,
      currentDialogueIndex: 3,
      historyDialogues: [{ content_id: 31 }],
      playthrough: 5,
      variables: { hp: 2 },
      lastEffectKey: 'e5',
      triggeredEndings: ['end_d'],
    }))

    api.loadProgress()

    expect(state.sceneIndex.value).toBe(6)
    expect(state.dialogueIndex.value).toBe(3)
    expect(state.history.value).toEqual([{ content_id: 31 }])
    expect(state.playthrough.value).toBe(5)
    expect(state.variables.value).toEqual({ hp: 2 })
    expect(state.lastEffectKey.value).toBe('e5')
    expect([...state.endings.value]).toEqual(['end_d'])
    expect(state.clearLineSnapshots).toHaveBeenCalled()
    expect(state.syncProjectMeta).toHaveBeenCalledWith(true)
    expect(ElMessage.success).toHaveBeenCalledWith('toast.progressLoaded')
  })

  it('没有本地进度时不做任何恢复', () => {
    const { api, state } = createProgress()

    api.loadProgress()

    expect(state.sceneIndex.value).toBe(2)
    expect(state.syncProjectMeta).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('本地进度损坏时静默失败', () => {
    const { api, state } = createProgress()
    localStorage.setItem('gameProgress_7', '{bad json')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      expect(() => api.loadProgress()).not.toThrow()
      expect(state.sceneIndex.value).toBe(2)
      expect(ElMessage.success).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('确认退出时停止音乐并回到首页', async () => {
    const { api, state } = createProgress()
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)

    api.exitGame()

    await vi.waitFor(() => expect(state.exitToHome).toHaveBeenCalled())
    expect(state.stopBackgroundMusic).toHaveBeenCalled()
  })

  it('取消退出时提示已取消', async () => {
    const { api, state } = createProgress()
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')

    api.exitGame()

    await vi.waitFor(() => expect(ElMessage.info).toHaveBeenCalledWith('toast.exitCancelled'))
    expect(state.stopBackgroundMusic).not.toHaveBeenCalled()
    expect(state.exitToHome).not.toHaveBeenCalled()
  })
})
