import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { usePlayerNarrative } from '@/composables/player/usePlayerNarrative'

const SCENES = [
  { scene_id: 1, music_url: '/music/a.mp3' },
  { scene_id: 2, music_url: '' },
  { scene_id: 3, music_url: '/music/c.mp3' },
]

const DIALOGUES: Record<string, any[]> = {
  1: [
    { content_id: 'c1', text: '第一句', character_id: 1 },
    { content_id: 'c2', text: '第二句', character_id: 2 },
  ],
  2: [{ content_id: 'c3', text: '第二场', character_id: 1 }],
  3: [],
}

function createNarrative(options: {
  sceneIndex?: number
  dialogueIndex?: number
  debugMode?: boolean
  loading?: boolean
  error?: any
  displayedLength?: number
  history?: any[]
} = {}) {
  const scenes = ref<any[]>(SCENES)
  const dialogues = ref<Record<string, any[]>>(DIALOGUES)
  const history = ref<any[]>(options.history ?? [])
  const loading = ref(!!options.loading)
  const error = ref(options.error ?? null)
  const debugMode = ref(!!options.debugMode)
  const displayedLength = ref(options.displayedLength ?? 999)

  const unlockMusic = vi.fn(() => Promise.resolve())
  const logCurrentScene = vi.fn()
  const markVisitedContent = vi.fn()
  const buildHistoryDialogues = vi.fn((...args: any[]) => [`built:${args[2]}:${args[3]}`])
  const setHistorySpy = vi.fn((value: any[]) => { history.value = value })

  const api = usePlayerNarrative({
    projectId: () => 7,
    getScenes: () => scenes.value,
    getAllDialogues: () => dialogues.value,
    getHistory: () => history.value,
    setHistory: setHistorySpy,
    getLoading: () => loading.value,
    getError: () => error.value,
    getDebugMode: () => debugMode.value,
    getDisplayedLength: () => displayedLength.value,
    localizedText: (dialogue: any) => dialogue?.text || '',
    getCharacterName: (characterId: number) => `角色${characterId}`,
    historySceneTitle: (dialogue: any) => `场景${dialogue?.scene_id ?? 0}`,
    historyChoiceText: (dialogue: any) => `选：${dialogue?.choice ?? ''}`,
    buildHistoryDialogues,
    logCurrentScene,
    markVisitedContent,
    sceneHasDialogues: (sceneId: any) => (dialogues.value[sceneId] || []).length > 0,
    unlockMusic,
  })

  api.currentSceneIndex.value = options.sceneIndex ?? 0
  api.currentDialogueIndex.value = options.dialogueIndex ?? 0
  return {
    ...api,
    scenes,
    dialogues,
    history,
    loading,
    error,
    debugMode,
    displayedLength,
    unlockMusic,
    logCurrentScene,
    markVisitedContent,
    buildHistoryDialogues,
    setHistorySpy,
  }
}

describe('usePlayerNarrative / 位置派生', () => {
  it('台词随场景下标与台词下标取值', () => {
    const n = createNarrative({ sceneIndex: 0, dialogueIndex: 0 })
    expect(n.currentScene.value.scene_id).toBe(1)
    expect(n.currentDialogue.value.content_id).toBe('c1')
    n.currentDialogueIndex.value = 1
    expect(n.currentDialogue.value.content_id).toBe('c2')
    n.currentSceneIndex.value = 1
    n.currentDialogueIndex.value = 0
    expect(n.currentDialogue.value.content_id).toBe('c3')
  })

  it('场景下标越界时场景为空对象，台词为空', () => {
    const n = createNarrative({ sceneIndex: 9 })
    expect(n.currentScene.value).toEqual({})
    expect(n.currentSceneDialogues.value).toEqual([])
    expect(n.currentDialogue.value).toBeUndefined()
  })

  it('富文本按已显示长度截断', () => {
    const n = createNarrative({ displayedLength: 0 })
    expect(n.displayedHtml.value).toBe('')
    n.displayedLength.value = 999
    expect(n.displayedHtml.value).toContain('第一句')
  })
})

describe('usePlayerNarrative / 跟随播放位置的副作用', () => {
  it('场景切换后补记到达埋点', async () => {
    const n = createNarrative({ sceneIndex: 0, loading: false })
    await nextTick()
    n.logCurrentScene.mockClear()
    n.currentSceneIndex.value = 1
    await nextTick()
    await nextTick()
    expect(n.logCurrentScene).toHaveBeenCalledTimes(1)
  })

  it('加载中或出错时不记埋点', async () => {
    const n = createNarrative({ sceneIndex: 0, loading: true })
    await nextTick()
    n.currentSceneIndex.value = 1
    await nextTick()
    expect(n.logCurrentScene).not.toHaveBeenCalled()
  })

  it('进入带 BGM 且有台词的场景解锁曲目，同一首只上报一次', async () => {
    const n = createNarrative({ sceneIndex: 0 })
    expect(n.unlockMusic).toHaveBeenCalledWith(7, '/music/a.mp3')
    n.currentSceneIndex.value = 1
    await nextTick()
    n.currentSceneIndex.value = 0
    await nextTick()
    expect(n.unlockMusic).toHaveBeenCalledTimes(1)
  })

  it('没有台词或没有 BGM 的场景不解锁曲目', async () => {
    const n = createNarrative({ sceneIndex: 0 })
    n.unlockMusic.mockClear()
    n.currentSceneIndex.value = 1
    await nextTick()
    expect(n.unlockMusic).not.toHaveBeenCalled()
    n.currentSceneIndex.value = 2
    await nextTick()
    expect(n.unlockMusic).not.toHaveBeenCalled()
  })

  it('调试模式下当前节点记为已走，非调试不记', async () => {
    const off = createNarrative({ debugMode: false })
    expect(off.markVisitedContent).not.toHaveBeenCalled()

    const on = createNarrative({ debugMode: true })
    expect(on.markVisitedContent).toHaveBeenCalledWith('c1')
    on.currentDialogueIndex.value = 1
    await nextTick()
    expect(on.markVisitedContent).toHaveBeenLastCalledWith('c2')
  })
})

describe('usePlayerNarrative / 回想展示模型', () => {
  it('把回想内容映射成展示模型', () => {
    const n = createNarrative({
      history: [
        { scene_id: 1, character_id: 1, text: '你好', chosen: true, choice: '答应' },
        { scene_id: 2, character_id: 2, text: '再见' },
      ],
    })
    expect(n.historyItemViews.value).toEqual([
      { key: 0, sceneTitle: '场景1', character: '角色1', text: '你好', chosen: true, choiceText: '选：答应' },
      { key: 1, sceneTitle: '场景2', character: '角色2', text: '再见', chosen: false, choiceText: '' },
    ])
  })

  it('按当前播放位置重建历史', () => {
    const n = createNarrative({ sceneIndex: 1, dialogueIndex: 0 })
    n.initHistoryDialogues()
    expect(n.buildHistoryDialogues).toHaveBeenCalledTimes(1)
    expect(n.buildHistoryDialogues.mock.calls[0].slice(2)).toEqual([1, 0])
    expect(n.setHistorySpy).toHaveBeenCalledWith(['built:1:0'])
    expect(n.history.value).toEqual(['built:1:0'])
  })
})
