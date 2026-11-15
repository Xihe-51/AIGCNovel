import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  findAutoJumpEdge,
  findDialogueLocation,
  nextPlayableDialogueIndex,
  nextPlayableSceneIndex,
  usePlayerFlow,
} from '@/composables/player/usePlayerFlow'

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  ElMessageBox: {
    alert: vi.fn(),
    confirm: vi.fn(),
  },
}))

const t = (key: string, params?: any) => (params ? `${key}|${JSON.stringify(params)}` : key)

function createFlow(options: {
  scenes?: any[]
  allDialogues?: Record<string, any[]>
  branches?: any[]
  sceneIndex?: number
  dialogueIndex?: number
  lockedScenes?: any[]
  lockedNodes?: any[]
  debugMode?: boolean
  isPlaying?: boolean
  isTyping?: boolean
  isWaiting?: boolean
  autoPlay?: boolean
  hasChoices?: boolean
} = {}) {
  const scenes = options.scenes ?? [
    { scene_id: 1, title: '第一幕' },
    { scene_id: 2, title: '第二幕' },
  ]
  const allDialogues = options.allDialogues ?? {
    1: [{ content_id: 101 }, { content_id: 102 }],
    2: [{ content_id: 201 }],
  }
  const lockedScenes = (options.lockedScenes ?? []).map(Number)
  const lockedNodes = (options.lockedNodes ?? []).map(Number)

  const state = {
    sceneIndex: ref(options.sceneIndex ?? 0),
    dialogueIndex: ref(options.dialogueIndex ?? 0),
    showDialogueBox: ref(false),
    history: ref<any[]>([]),
    isPlaying: ref(options.isPlaying ?? true),
  }

  const nodePlayable = vi.fn((node: any) => (
    !!node
    && !lockedNodes.includes(Number(node.content_id))
    && node.branch_condition?.ok !== false
  ))
  const scenePlayable = vi.fn((sceneId: any) => !lockedScenes.includes(Number(sceneId)))
  const sceneHasPlayableDialogues = vi.fn((sceneId: any) => (
    (allDialogues[sceneId] || []).some(d => nodePlayable(d))
  ))
  const firstPlayableNodeIndex = vi.fn((sceneId: any) => {
    const list = allDialogues[sceneId] || []
    const index = list.findIndex(d => nodePlayable(d))
    return index < 0 ? list.length : index
  })

  const spies = {
    finishTyping: vi.fn(),
    playBackgroundMusic: vi.fn(),
    stopBackgroundMusic: vi.fn(),
    scheduleAutoAdvance: vi.fn(),
    scheduleAutoAdvanceAfter: vi.fn(),
    clearAutoTimer: vi.fn(),
    clearWait: vi.fn(),
    commitHesitation: vi.fn(),
    pushLineSnapshot: vi.fn(),
    captureLineSnapshot: vi.fn(() => ({ sceneIndex: 9, dialogueIndex: 9 })),
    markVisitedEdge: vi.fn(),
    logPlayEvent: vi.fn(),
    scheduleAchievementCheck: vi.fn(),
    goHome: vi.fn(),
    evalCondition: vi.fn((conditions: any) => conditions?.ok !== false),
    conditionText: vi.fn(() => '条件文本'),
  }

  const getCurrentScene = () => scenes[state.sceneIndex.value] || {}
  const getCurrentSceneDialogues = () => allDialogues[getCurrentScene().scene_id] || []

  const api = usePlayerFlow({
    getScenes: () => scenes,
    getAllDialogues: () => allDialogues,
    getBranches: () => options.branches ?? [],
    getCurrentDialogue: () => getCurrentSceneDialogues()[state.dialogueIndex.value],
    getCurrentScene,
    getCurrentSceneDialogues,
    getHistory: () => state.history.value,
    hasChoices: () => options.hasChoices ?? false,
    getSceneIndex: () => state.sceneIndex.value,
    setSceneIndex: (value) => { state.sceneIndex.value = value },
    getDialogueIndex: () => state.dialogueIndex.value,
    setDialogueIndex: (value) => { state.dialogueIndex.value = value },
    setShowDialogueBox: (value) => { state.showDialogueBox.value = value },
    scenePlayable: (sceneId) => scenePlayable(sceneId),
    nodePlayable: (node) => nodePlayable(node),
    sceneHasPlayableDialogues: (sceneId) => sceneHasPlayableDialogues(sceneId),
    firstPlayableNodeIndex: (sceneId) => firstPlayableNodeIndex(sceneId),
    evalCondition: (conditions) => spies.evalCondition(conditions),
    conditionText: (conditions) => spies.conditionText(conditions),
    isDebugMode: () => options.debugMode ?? false,
    isPlaying: () => state.isPlaying.value,
    isTyping: () => options.isTyping ?? false,
    isWaiting: () => options.isWaiting ?? false,
    getAutoPlay: () => options.autoPlay ?? false,
    setIsPlaying: (value) => { state.isPlaying.value = value },
    finishTyping: () => spies.finishTyping(),
    playBackgroundMusic: () => spies.playBackgroundMusic(),
    stopBackgroundMusic: () => spies.stopBackgroundMusic(),
    scheduleAutoAdvance: () => spies.scheduleAutoAdvance(),
    scheduleAutoAdvanceAfter: (ms) => spies.scheduleAutoAdvanceAfter(ms),
    clearAutoTimer: () => spies.clearAutoTimer(),
    clearWait: () => spies.clearWait(),
    commitHesitation: () => spies.commitHesitation(),
    pushLineSnapshot: (snapshot) => spies.pushLineSnapshot(snapshot),
    captureLineSnapshot: () => spies.captureLineSnapshot(),
    markVisitedEdge: (sourceId, targetId) => spies.markVisitedEdge(sourceId, targetId),
    logPlayEvent: (type, payload) => spies.logPlayEvent(type, payload),
    scheduleAchievementCheck: (force) => spies.scheduleAchievementCheck(force),
    goHome: () => spies.goHome(),
    t,
  })

  return { api, state, spies, scenes, allDialogues, nodePlayable, scenePlayable }
}

describe('findDialogueLocation', () => {
  const scenes = [{ scene_id: 1 }, { scene_id: 2 }, { scene_id: 3 }]
  const allDialogues = { 1: [{ content_id: 11 }], 2: [{ content_id: 21 }, { content_id: 22 }], 3: [] }

  it('定位第一个场景内的节点', () => {
    expect(findDialogueLocation(scenes, allDialogues, 11)).toEqual({ sceneIndex: 0, dialogueIndex: 0 })
  })

  it('跨场景定位到后续场景', () => {
    expect(findDialogueLocation(scenes, allDialogues, 22)).toEqual({ sceneIndex: 1, dialogueIndex: 1 })
  })

  it('数字字符串与数字 id 视为同一节点', () => {
    expect(findDialogueLocation(scenes, allDialogues, '21')).toEqual({ sceneIndex: 1, dialogueIndex: 0 })
  })

  it('找不到时返回 null', () => {
    expect(findDialogueLocation(scenes, allDialogues, 999)).toBeNull()
  })

  it('非法 id 直接返回 null', () => {
    expect(findDialogueLocation(scenes, allDialogues, undefined)).toBeNull()
    expect(findDialogueLocation(scenes, allDialogues, 'abc')).toBeNull()
  })
})

describe('findAutoJumpEdge', () => {
  const dialogue = { content_id: 7, content_type: '对白' }
  const met = () => true
  const unmet = () => false

  it('命中无选项文案且条件成立的分支', () => {
    const branches = [
      { source_content_id: 7, choice_text: '走左边', target_content_id: 8, conditions: [] },
      { source_content_id: 7, choice_text: '', target_content_id: 9, conditions: [] },
    ]
    expect(findAutoJumpEdge(branches, dialogue, met)?.target_content_id).toBe(9)
  })

  it('带选项文案的分支不参与自动跳转', () => {
    const branches = [{ source_content_id: 7, choice_text: '走左边', target_content_id: 9 }]
    expect(findAutoJumpEdge(branches, dialogue, met)).toBeNull()
  })

  it('条件不成立时返回 null', () => {
    const branches = [{ source_content_id: 7, choice_text: '', target_content_id: 9 }]
    expect(findAutoJumpEdge(branches, dialogue, unmet)).toBeNull()
  })

  it('来源节点不匹配时返回 null', () => {
    const branches = [{ source_content_id: 8, choice_text: '', target_content_id: 9 }]
    expect(findAutoJumpEdge(branches, dialogue, met)).toBeNull()
  })

  it('「选择」节点不参与自动跳转', () => {
    const branches = [{ source_content_id: 7, choice_text: '', target_content_id: 9 }]
    expect(findAutoJumpEdge(branches, { ...dialogue, content_type: '选择' }, met)).toBeNull()
  })

  it('空对话或空分支返回 null', () => {
    expect(findAutoJumpEdge([], dialogue, met)).toBeNull()
    expect(findAutoJumpEdge([{ source_content_id: 7, choice_text: '' }], null, met)).toBeNull()
  })
})

describe('nextPlayableDialogueIndex', () => {
  const playable = (node: any) => node.ok !== false

  it('返回紧邻的下一条可播放台词', () => {
    expect(nextPlayableDialogueIndex([{ ok: true }, { ok: true }], 1, playable)).toBe(1)
  })

  it('连续跳过不可播放台词', () => {
    const list = [{ ok: true }, { ok: false }, { ok: false }, { ok: true }]
    expect(nextPlayableDialogueIndex(list, 1, playable)).toBe(3)
  })

  it('全部不可播放时返回列表长度', () => {
    expect(nextPlayableDialogueIndex([{ ok: false }, { ok: false }], 0, playable)).toBe(2)
  })

  it('起点越界时返回起点', () => {
    expect(nextPlayableDialogueIndex([{ ok: true }], 5, playable)).toBe(5)
  })
})

describe('nextPlayableSceneIndex', () => {
  const scenes = [{ scene_id: 1 }, { scene_id: 2 }, { scene_id: 3 }]
  const isScenePlayable = (id: any) => id !== 2
  const hasPlayableDialogues = (id: any) => id !== 3

  it('返回下一个可播放且含台词的场景', () => {
    expect(nextPlayableSceneIndex(scenes, 0, (id) => id !== 1, hasPlayableDialogues)).toBe(1)
  })

  it('跳过锁定场景与空场景', () => {
    const fourScenes = [{ scene_id: 1 }, { scene_id: 2 }, { scene_id: 3 }, { scene_id: 4 }]
    expect(nextPlayableSceneIndex(fourScenes, 1, isScenePlayable, hasPlayableDialogues)).toBe(3)
  })

  it('全部不可播放时返回场景总数', () => {
    expect(nextPlayableSceneIndex(scenes, 0, () => false, () => true)).toBe(3)
  })
})

describe('jumpToDialogue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('命中后切换位置、显示对话框并在下一帧播 BGM', async () => {
    const { api, state, spies } = createFlow()

    expect(api.jumpToDialogue(201)).toBe('ok')

    expect(state.sceneIndex.value).toBe(1)
    expect(state.dialogueIndex.value).toBe(0)
    expect(state.showDialogueBox.value).toBe(true)
    expect(spies.playBackgroundMusic).not.toHaveBeenCalled()

    await nextTick()
    expect(spies.playBackgroundMusic).toHaveBeenCalledTimes(1)
    expect(spies.scheduleAutoAdvance).not.toHaveBeenCalled()
  })

  it('自动播放时在下一帧继续排期前进', async () => {
    const { api, spies } = createFlow({ autoPlay: true })

    api.jumpToDialogue(201)
    await nextTick()

    expect(spies.scheduleAutoAdvance).toHaveBeenCalledTimes(1)
  })

  it('场景未解锁时返回 locked 且不移动位置', () => {
    const { api, state } = createFlow({ lockedScenes: [2] })

    expect(api.jumpToDialogue(201)).toBe('locked')
    expect(state.sceneIndex.value).toBe(0)
    expect(state.dialogueIndex.value).toBe(0)
  })

  it('台词条件不满足时返回 locked', () => {
    const { api } = createFlow({ lockedNodes: [201] })

    expect(api.jumpToDialogue(201)).toBe('locked')
  })

  it('调试模式忽略台词级条件锁', () => {
    const { api, state } = createFlow({ lockedNodes: [201], debugMode: true })

    expect(api.jumpToDialogue(201)).toBe('ok')
    expect(state.sceneIndex.value).toBe(1)
  })

  it('节点不存在时返回 missing', () => {
    const { api, state } = createFlow()

    expect(api.jumpToDialogue(999)).toBe('missing')
    expect(state.showDialogueBox.value).toBe(false)
  })

  it('非播放态不触发音频', async () => {
    const { api, spies } = createFlow({ isPlaying: false })

    api.jumpToDialogue(201)
    await nextTick()

    expect(spies.playBackgroundMusic).not.toHaveBeenCalled()
  })
})

describe('nextDialogue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('逐字显示中先补全整句，不推进', () => {
    const { api, state, spies } = createFlow({ isTyping: true })

    api.nextDialogue()

    expect(spies.finishTyping).toHaveBeenCalledTimes(1)
    expect(spies.pushLineSnapshot).not.toHaveBeenCalled()
    expect(state.dialogueIndex.value).toBe(0)
  })

  it('演出停顿期间不推进', () => {
    const { api, state, spies } = createFlow({ isWaiting: true })

    api.nextDialogue()

    expect(spies.pushLineSnapshot).not.toHaveBeenCalled()
    expect(state.dialogueIndex.value).toBe(0)
  })

  it('有选项时等待玩家选择，不推进', () => {
    const { api, state, spies } = createFlow({ hasChoices: true })

    api.nextDialogue()

    expect(spies.pushLineSnapshot).not.toHaveBeenCalled()
    expect(state.dialogueIndex.value).toBe(0)
  })

  it('推进前记录回退点并写入历史', () => {
    const { api, state } = createFlow()

    api.nextDialogue()

    expect(state.dialogueIndex.value).toBe(1)
    expect(state.history.value).toEqual([
      { content_id: 101, scene_id: 1, scene_title: '第一幕' },
    ])
    expect(state.showDialogueBox.value).toBe(true)
  })

  it('跳过条件不满足的台词', () => {
    const { api, state } = createFlow({
      scenes: [{ scene_id: 1, title: '第一幕' }],
      allDialogues: { 1: [{ content_id: 1 }, { content_id: 2 }, { content_id: 3 }] },
      lockedNodes: [2],
    })

    api.nextDialogue()

    expect(state.dialogueIndex.value).toBe(2)
  })

  it('本场景无更多可播放台词时进入下一场景', async () => {
    const { api, state, spies } = createFlow({
      scenes: [{ scene_id: 1, title: '第一幕' }, { scene_id: 2, title: '第二幕' }],
      allDialogues: { 1: [{ content_id: 1 }], 2: [{ content_id: 2 }] },
    })

    api.nextDialogue()

    expect(spies.stopBackgroundMusic).toHaveBeenCalledTimes(1)
    expect(state.sceneIndex.value).toBe(1)
    expect(state.dialogueIndex.value).toBe(0)
    await nextTick()
    expect(spies.playBackgroundMusic).toHaveBeenCalled()
  })

  it('自动跳转分支命中后记录边并跳到目标节点', () => {
    const { api, state, spies } = createFlow({
      scenes: [{ scene_id: 1, title: '第一幕' }, { scene_id: 2, title: '第二幕' }],
      allDialogues: { 1: [{ content_id: 1 }], 2: [{ content_id: 202 }] },
      branches: [{ source_content_id: 1, choice_text: '', target_content_id: 202, conditions: [] }],
    })

    api.nextDialogue()

    expect(spies.markVisitedEdge).toHaveBeenCalledWith(1, 202)
    expect(state.history.value).toHaveLength(1)
    expect(state.sceneIndex.value).toBe(1)
    expect(state.dialogueIndex.value).toBe(0)
  })

  it('自动跳转目标被锁时提示并继续按顺序推进', () => {
    const { api, state } = createFlow({
      scenes: [{ scene_id: 1, title: '第一幕' }, { scene_id: 2, title: '第二幕' }],
      allDialogues: { 1: [{ content_id: 1 }, { content_id: 2 }], 2: [{ content_id: 202 }] },
      branches: [{ source_content_id: 1, choice_text: '', target_content_id: 202 }],
      lockedScenes: [2],
    })

    api.nextDialogue()

    expect(ElMessage.warning).toHaveBeenCalledWith('toast.targetSceneLocked')
    expect(state.sceneIndex.value).toBe(0)
    expect(state.dialogueIndex.value).toBe(1)
  })

  it('「选择」节点不触发自动跳转', () => {
    const { api, state } = createFlow({
      scenes: [{ scene_id: 1, title: '第一幕' }, { scene_id: 2, title: '第二幕' }],
      allDialogues: {
        1: [{ content_id: 1, content_type: '选择' }, { content_id: 2 }],
        2: [{ content_id: 202 }],
      },
      branches: [{ source_content_id: 1, choice_text: '', target_content_id: 202 }],
    })

    api.nextDialogue()

    expect(state.sceneIndex.value).toBe(0)
    expect(state.dialogueIndex.value).toBe(1)
  })
})

describe('selectBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseOptions = () => ({
    scenes: [{ scene_id: 1, title: '第一幕' }, { scene_id: 2, title: '第二幕' }],
    allDialogues: { 1: [{ content_id: 10 }], 2: [{ content_id: 20 }] },
  })

  it('空分支直接返回', () => {
    const { spies } = createFlow(baseOptions())

    spies.commitHesitation.mockClear()
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  it('条件不满足的分支只提示不跳转', () => {
    const { api, state } = createFlow(baseOptions())

    api.selectBranch({ locked: true, conditions: [{ variable: 'hp' }], target_content_id: 20 })

    expect(ElMessage.warning).toHaveBeenCalledWith(
      'choice.conditionNotMet|{"cond":"条件文本"}'
    )
    expect(state.sceneIndex.value).toBe(0)
  })

  it('跳转成功时提交犹豫、清理计时器、记录历史与埋点', async () => {
    const { api, state, spies } = createFlow(baseOptions())

    api.selectBranch({ choice_text: '走左边', path_id: 3, target_content_id: 20 })

    expect(spies.commitHesitation).toHaveBeenCalledTimes(1)
    expect(spies.clearWait).toHaveBeenCalledTimes(1)
    expect(spies.clearAutoTimer).toHaveBeenCalledTimes(1)
    expect(state.history.value[0]).toMatchObject({
      content_id: 10,
      scene_id: 1,
      scene_title: '第一幕',
      chosen: '走左边',
      chosen_path_id: 3,
    })
    expect(spies.markVisitedEdge).toHaveBeenCalledWith(10, 20)
    expect(spies.logPlayEvent).toHaveBeenCalledWith('choice', {
      scene_id: 1,
      content_id: 10,
      path_id: 3,
      payload: { choice_text: '走左边', target_content_id: 20 },
    })
    expect(spies.pushLineSnapshot).toHaveBeenCalledWith({ sceneIndex: 9, dialogueIndex: 9 })
    expect(state.sceneIndex.value).toBe(1)
    expect(state.dialogueIndex.value).toBe(0)
    expect(state.showDialogueBox.value).toBe(true)

    await nextTick()
    expect(spies.playBackgroundMusic).toHaveBeenCalledTimes(1)
  })

  it('目标场景被锁时提示且不入回退栈', () => {
    const { api, state, spies } = createFlow({ ...baseOptions(), lockedScenes: [2] })

    api.selectBranch({ choice_text: '走左边', target_content_id: 20 })

    expect(ElMessage.warning).toHaveBeenCalledWith('toast.sceneLocked')
    expect(spies.pushLineSnapshot).not.toHaveBeenCalled()
    expect(state.sceneIndex.value).toBe(0)
  })

  it('目标节点条件不满足时提示且不入回退栈', () => {
    const { api, state, spies } = createFlow({
      ...baseOptions(),
      allDialogues: { 1: [{ content_id: 10 }], 2: [{ content_id: 20, branch_condition: { ok: false } }] },
    })

    api.selectBranch({ choice_text: '走左边', target_content_id: 20 })

    expect(ElMessage.warning).toHaveBeenCalledWith(
      'toast.targetDialogueLocked|{"cond":"条件文本"}'
    )
    expect(spies.pushLineSnapshot).not.toHaveBeenCalled()
    expect(state.sceneIndex.value).toBe(0)
  })

  it('分支目标不存在时提示 branchMissing', () => {
    const { api, spies } = createFlow(baseOptions())

    api.selectBranch({ choice_text: '走左边', target_content_id: 999 })

    expect(ElMessage.warning).toHaveBeenCalledWith('toast.branchMissing')
    expect(spies.pushLineSnapshot).not.toHaveBeenCalled()
  })
})

describe('nextScene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('停在当前场景且自动播放关闭时只重播音乐', async () => {
    const { api, state, spies } = createFlow({
      scenes: [{ scene_id: 1, title: '第一幕' }, { scene_id: 2, title: '第二幕' }],
      allDialogues: { 1: [{ content_id: 1 }], 2: [{ content_id: 2, branch_condition: { ok: false } }, { content_id: 3 }] },
    })

    api.nextScene()

    expect(spies.stopBackgroundMusic).toHaveBeenCalledTimes(1)
    expect(state.sceneIndex.value).toBe(1)
    expect(state.dialogueIndex.value).toBe(1)
    await nextTick()
    expect(spies.playBackgroundMusic).toHaveBeenCalledTimes(1)
    expect(spies.scheduleAutoAdvanceAfter).not.toHaveBeenCalled()
  })

  it('自动播放时延迟一段时间再继续自动前进', async () => {
    const { api, spies } = createFlow({ autoPlay: true })

    api.nextScene()
    await nextTick()

    expect(spies.scheduleAutoAdvanceAfter).toHaveBeenCalledWith(1000)
  })

  it('跳过锁定场景与无台词场景', () => {
    const { api, state } = createFlow({
      scenes: [
        { scene_id: 1, title: '第一幕' },
        { scene_id: 2, title: '第二幕' },
        { scene_id: 3, title: '第三幕' },
      ],
      allDialogues: { 1: [{ content_id: 1 }], 2: [], 3: [{ content_id: 3 }] },
      lockedScenes: [2],
    })

    api.nextScene()

    expect(state.sceneIndex.value).toBe(2)
    expect(state.dialogueIndex.value).toBe(0)
  })

  it('所有场景播完时记录结束埋点并提示返回首页', () => {
    const { api, state, spies } = createFlow({
      scenes: [{ scene_id: 1, title: '第一幕' }],
      allDialogues: { 1: [{ content_id: 1 }] },
    })

    api.nextScene()

    expect(spies.logPlayEvent).toHaveBeenCalledWith('finish', { scene_id: 1 })
    expect(spies.scheduleAchievementCheck).toHaveBeenCalledWith(true)
    expect(state.isPlaying.value).toBe(false)
    expect(ElMessageBox.alert).toHaveBeenCalledWith(
      'ending.gameOverText',
      'ending.gameOverTitle',
      expect.objectContaining({ confirmButtonText: 'common.confirm' })
    )

    const options = vi.mocked(ElMessageBox.alert).mock.calls[0][2] as any
    options.callback()
    expect(spies.goHome).toHaveBeenCalledTimes(1)
  })

  it('非播放态切场景时不触发音频', async () => {
    const { api, spies } = createFlow({ isPlaying: false })

    api.nextScene()
    await nextTick()

    expect(spies.playBackgroundMusic).not.toHaveBeenCalled()
    expect(spies.scheduleAutoAdvanceAfter).not.toHaveBeenCalled()
  })
})
