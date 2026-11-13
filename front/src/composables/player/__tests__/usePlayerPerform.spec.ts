import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import { usePlayerPerform } from '@/composables/player/usePlayerPerform'

vi.mock('element-plus', () => ({
  ElMessage: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function createPerform() {
  const dialogue = ref<any>({
    content_id: 11,
    content_text: '旧台词',
    avatar_id: 3,
    content_type: '对话',
  })
  const scene = ref<any>({ scene_id: 5, background_url: 'bg-a.png', music_url: 'bgm-a.mp3' })

  const state = {
    canPerform: true,
    dialogue,
    scene,
    dialogues: { 5: [{ content_id: 11, content_text: '旧台词' }, { content_id: 12 }] } as Record<string, any[]>,
    history: [{ content_id: 11, content_text: '旧台词' }] as any[],
    directives: {} as Record<string | number, any[]>,
    scenes: [{ scene_id: 5, background_url: 'bg-a.png', music_url: 'bgm-a.mp3' }] as any[],
    audio: null as any,
    playing: true,
    saveDialogues: vi.fn(async (payload: any) => ({ ...payload })),
    updateScene: vi.fn(async (sceneId: number, patch: any) => ({ scene_id: sceneId, ...patch })),
    markSkipRestoredLine: vi.fn(),
    startTyping: vi.fn(),
    fadeBgmTo: vi.fn(),
    bgmTargetVolume: vi.fn(() => 0.8),
  }

  const api = usePlayerPerform({
    canPerform: () => state.canPerform,
    getDialogue: () => dialogue.value,
    getScene: () => scene.value,
    getDialogues: () => state.dialogues,
    setDialogues: (value) => { state.dialogues = value },
    getHistory: () => state.history,
    setHistory: (value) => { state.history = value },
    getDirectives: () => state.directives,
    getScenes: () => state.scenes,
    setScenes: (value) => { state.scenes = value },
    getBackgroundMusic: () => state.audio,
    isPlaying: () => state.playing,
    fadeBgmTo: (volume, duration) => state.fadeBgmTo(volume, duration),
    bgmTargetVolume: () => state.bgmTargetVolume(),
    markSkipRestoredLine: () => state.markSkipRestoredLine(),
    startTyping: () => state.startTyping(),
    saveDialogues: (payload) => state.saveDialogues(payload),
    updateScene: (sceneId, patch) => state.updateScene(sceneId, patch),
    projectId: () => 7,
  })

  return { ...api, state }
}

const fakeAudio = () => ({
  pause: vi.fn(),
  play: vi.fn(() => Promise.resolve()),
  currentTime: 12,
  volume: 1,
})

describe('usePlayerPerform', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('初始为关闭态且表单为空', () => {
    const { performMode, performText, performStatus } = createPerform()
    expect(performMode.value).toBe(false)
    expect(performText.value).toBe('')
    expect(performStatus.value).toBe('')
  })

  it('无权限时无法打开面板', () => {
    const { togglePerformMode, performMode, state } = createPerform()
    state.canPerform = false
    togglePerformMode()
    expect(performMode.value).toBe(false)
  })

  it('打开面板时按当前台词与场景回填表单', () => {
    const { togglePerformMode, performMode, performText, performAvatarId, performBackground, performMusic } = createPerform()
    togglePerformMode()
    expect(performMode.value).toBe(true)
    expect(performText.value).toBe('旧台词')
    expect(performAvatarId.value).toBe('3')
    expect(performBackground.value).toBe('bg-a.png')
    expect(performMusic.value).toBe('bgm-a.mp3')
  })

  it('无当前台词时不回填表单', () => {
    const { syncPerformForm, performText, state } = createPerform()
    state.dialogue.value = null
    syncPerformForm()
    expect(performText.value).toBe('')
  })

  it('面板打开时跟随节点切换同步表单，关闭时不同步', async () => {
    const { togglePerformMode, performMode, performText, performBackground, state } = createPerform()
    togglePerformMode()

    state.dialogue.value = { content_id: 12, content_text: '新台词', avatar_id: null, content_type: '旁白' }
    state.scene.value = { scene_id: 6, background_url: 'bg-b.png', music_url: '' }
    await nextTick()
    expect(performText.value).toBe('新台词')
    expect(performBackground.value).toBe('bg-b.png')

    togglePerformMode()
    expect(performMode.value).toBe(false)
    state.dialogue.value = { content_id: 13, content_text: '不该同步' }
    await nextTick()
    expect(performText.value).toBe('新台词')
  })

  it('台词为空时提示且不发起保存', async () => {
    const { togglePerformMode, savePerformEdit, performText, state } = createPerform()
    togglePerformMode()
    performText.value = '   '
    await savePerformEdit()
    expect(state.saveDialogues).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('台词不能为空')
  })

  it('保存成功后热更新台词表、回想与状态', async () => {
    const { togglePerformMode, savePerformEdit, performText, performAvatarId, performStatus, state } = createPerform()
    togglePerformMode()
    performText.value = '新台词'
    performAvatarId.value = '9'

    await savePerformEdit()

    expect(state.saveDialogues).toHaveBeenCalledTimes(1)
    expect(state.saveDialogues.mock.calls[0][0]).toMatchObject({
      project_id: 7,
      scene_id: 5,
      content_text: '新台词',
      avatar_id: 9,
    })
    expect(state.dialogues[5][0].content_text).toBe('新台词')
    expect(state.history[0].content_text).toBe('新台词')
    expect(performStatus.value.startsWith('已保存 · ')).toBe(true)
    expect(state.markSkipRestoredLine).toHaveBeenCalledTimes(1)
    expect(state.startTyping).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('已保存并热更新当前画面')
  })

  it('非对话台词保留原有立绘 ID', async () => {
    const { togglePerformMode, savePerformEdit, performAvatarId, state } = createPerform()
    togglePerformMode()
    state.dialogue.value = { content_id: 11, content_text: '旁白', avatar_id: 4, content_type: '旁白' }
    performAvatarId.value = '9'

    await savePerformEdit()

    expect(state.saveDialogues.mock.calls[0][0].avatar_id).toBe(4)
  })

  it('场景未变更时不写入场景接口', async () => {
    const { togglePerformMode, savePerformEdit, state } = createPerform()
    togglePerformMode()
    await savePerformEdit()
    expect(state.updateScene).not.toHaveBeenCalled()
  })

  it('场景背景与 BGM 变更时只提交差异字段', async () => {
    const { togglePerformMode, savePerformEdit, performBackground, performMusic, state } = createPerform()
    togglePerformMode()
    performBackground.value = 'bg-b.png'
    performMusic.value = 'bgm-b.mp3'

    await savePerformEdit()

    expect(state.updateScene).toHaveBeenCalledWith(5, {
      background_url: 'bg-b.png',
      music_url: 'bgm-b.mp3',
    })
    expect(state.scenes[0]).toMatchObject({ background_url: 'bg-b.png', music_url: 'bgm-b.mp3' })
  })

  it('当前节点有 music 指令时不重载场景 BGM', async () => {
    const { togglePerformMode, savePerformEdit, performMusic, state } = createPerform()
    togglePerformMode()
    state.audio = fakeAudio()
    state.directives = { 11: [{ directive_type: 'music' }] }
    performMusic.value = 'bgm-b.mp3'

    await savePerformEdit()

    expect(state.updateScene).toHaveBeenCalledTimes(1)
    expect(state.audio.play).not.toHaveBeenCalled()
  })

  it('无 music 指令时按新 BGM 重载并淡入', async () => {
    const { togglePerformMode, savePerformEdit, performMusic, state } = createPerform()
    togglePerformMode()
    state.audio = fakeAudio()
    performMusic.value = 'bgm-b.mp3'

    await savePerformEdit()
    await nextTick()
    await vi.waitFor(() => expect(state.fadeBgmTo).toHaveBeenCalledWith(0.8, 600))

    expect(state.audio.volume).toBe(0)
    expect(state.audio.play).toHaveBeenCalledTimes(1)
  })

  it('场景 BGM 被清空时暂停播放并归零进度', () => {
    const { reloadSceneMusic, state } = createPerform()
    state.audio = fakeAudio()
    state.scene.value = { scene_id: 5, background_url: '', music_url: '' }

    reloadSceneMusic()

    expect(state.audio.pause).toHaveBeenCalledTimes(1)
    expect(state.audio.currentTime).toBe(0)
    expect(state.audio.play).not.toHaveBeenCalled()
  })

  it('暂停播放时不重载场景 BGM', () => {
    const { reloadSceneMusic, state } = createPerform()
    state.audio = fakeAudio()
    state.playing = false

    reloadSceneMusic()

    expect(state.audio.play).not.toHaveBeenCalled()
  })

  it('保存进行中重复触发不会重复提交', async () => {
    const { togglePerformMode, savePerformEdit, state } = createPerform()
    togglePerformMode()

    const first = savePerformEdit()
    const second = savePerformEdit()
    await Promise.all([first, second])

    expect(state.saveDialogues).toHaveBeenCalledTimes(1)
  })

  it('保存失败时报错并复位保存态', async () => {
    const { togglePerformMode, savePerformEdit, performSaving, state } = createPerform()
    togglePerformMode()
    state.saveDialogues.mockRejectedValue({ message: '网络中断' })

    await savePerformEdit()

    expect(performSaving.value).toBe(false)
    expect(ElMessage.error).toHaveBeenCalledWith('保存失败：网络中断')
  })
})
