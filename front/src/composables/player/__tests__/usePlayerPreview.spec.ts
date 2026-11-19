import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  buildPreviewChoices,
  pickPreviewLayers,
  pickPreviewSpeaker,
  usePlayerPreview,
} from '@/composables/player/usePlayerPreview'

const LINES = [
  { content_id: 'c1', content_type: '对话', character_id: 1, avatar_id: 11 },
  { content_id: 'c2', content_type: '对话', character_id: null, avatar_id: null },
  { content_id: 'c3', content_type: '对话', character_id: 2, avatar_id: null },
]

describe('usePlayerPreview / pickPreviewSpeaker', () => {
  it('当前台词有角色时直接返回当前台词', () => {
    expect(pickPreviewSpeaker(LINES, 0)).toBe(LINES[0])
    expect(pickPreviewSpeaker(LINES, 2)).toBe(LINES[2])
  })

  it('旁白时回溯到最近一位说话的角色', () => {
    expect(pickPreviewSpeaker(LINES, 1)).toBe(LINES[0])
  })

  it('下标越界时夹紧到末位', () => {
    expect(pickPreviewSpeaker(LINES, 99)).toBe(LINES[2])
  })

  it('下标为负或列表为空时返回 null', () => {
    expect(pickPreviewSpeaker(LINES, -3)).toBeNull()
    expect(pickPreviewSpeaker([], 0)).toBeNull()
    expect(pickPreviewSpeaker(null, 0)).toBeNull()
  })

  it('全是旁白时返回 null', () => {
    expect(pickPreviewSpeaker([LINES[1], LINES[1]], 1)).toBeNull()
  })
})

describe('usePlayerPreview / pickPreviewLayers', () => {
  it('没有说话人时返回空数组', () => {
    expect(pickPreviewLayers(null, vi.fn(), vi.fn())).toEqual([])
  })

  it('优先使用 avatar_id 对应的差分层', () => {
    const avatarLayersOf = vi.fn(() => ['base.png', 'layer.png'])
    const defaultAvatarLayersOf = vi.fn(() => ['default.png'])
    expect(pickPreviewLayers({ avatar_id: 11, character_id: 1 }, avatarLayersOf, defaultAvatarLayersOf)).toEqual([
      'base.png',
      'layer.png',
    ])
    expect(avatarLayersOf).toHaveBeenCalledWith(11)
    expect(defaultAvatarLayersOf).not.toHaveBeenCalled()
  })

  it('avatar_id 无分层时回退到角色默认立绘', () => {
    const avatarLayersOf = vi.fn(() => [])
    const defaultAvatarLayersOf = vi.fn(() => ['default.png'])
    expect(pickPreviewLayers({ avatar_id: 11, character_id: 1 }, avatarLayersOf, defaultAvatarLayersOf)).toEqual([
      'default.png',
    ])
    expect(defaultAvatarLayersOf).toHaveBeenCalledWith(1)
  })

  it('两种素材都没有时返回空数组', () => {
    expect(pickPreviewLayers({ avatar_id: 11, character_id: 1 }, () => [], () => [])).toEqual([])
  })
})

describe('usePlayerPreview / buildPreviewChoices', () => {
  const evalCondition = (cond: any) => cond?.pass !== false
  const CHOICE = { content_id: 'c3', content_type: '选择' }
  const BRANCHES = [
    { branch_id: 1, source_content_id: 'c3', conditions: { pass: true } },
    { branch_id: 2, source_content_id: 'c3', conditions: { pass: false } },
    { branch_id: 3, source_content_id: 'c1', conditions: null },
  ]

  it('非「选择」节点返回空数组', () => {
    expect(buildPreviewChoices(LINES[0], BRANCHES, evalCondition)).toEqual([])
    expect(buildPreviewChoices(null, BRANCHES, evalCondition)).toEqual([])
  })

  it('按 source_content_id 过滤出当前节点的分支', () => {
    const result = buildPreviewChoices(CHOICE, BRANCHES, evalCondition)
    expect(result.map(b => b.branch_id)).toEqual([1, 2])
  })

  it('条件不满足的分支标记为 locked', () => {
    const result = buildPreviewChoices(CHOICE, BRANCHES, evalCondition)
    expect(result.map(b => b.locked)).toEqual([false, true])
  })

  it('分支列表为空时返回空数组', () => {
    expect(buildPreviewChoices(CHOICE, null, evalCondition)).toEqual([])
  })

  it('不修改原始分支对象', () => {
    buildPreviewChoices(CHOICE, BRANCHES, evalCondition)
    expect(BRANCHES[0]).toEqual({ branch_id: 1, source_content_id: 'c3', conditions: { pass: true } })
  })
})

describe('usePlayerPreview', () => {
  function createPreview(options: {
    dialogues?: any[]
    index?: number
    branches?: any[]
    byAvatar?: Record<number, string[]>
    byCharacter?: Record<number, string[]>
  } = {}) {
    const dialogues = ref<any[]>(options.dialogues ?? LINES)
    const index = ref(options.index ?? 0)
    const branches = ref<any[]>(options.branches ?? [])
    const avatarLayersOf = vi.fn((id: number) => options.byAvatar?.[id] ?? [])
    const defaultAvatarLayersOf = vi.fn((id: number) => options.byCharacter?.[id] ?? [])
    const evalCondition = vi.fn((cond: any) => cond?.pass !== false)
    const api = usePlayerPreview({
      getDialogues: () => dialogues.value,
      getCurrentIndex: () => index.value,
      getCurrentDialogue: () => dialogues.value[index.value],
      getBranches: () => branches.value,
      avatarLayersOf,
      defaultAvatarLayersOf,
      evalCondition,
    })
    return { ...api, dialogues, index, branches, avatarLayersOf, defaultAvatarLayersOf, evalCondition }
  }

  it('说话人随当前下标变化（旁白沿用上一位角色）', () => {
    const p = createPreview({ index: 0 })
    expect(p.previewSpeaker.value?.content_id).toBe('c1')
    p.index.value = 1
    expect(p.previewSpeaker.value?.content_id).toBe('c1')
    p.index.value = 2
    expect(p.previewSpeaker.value?.content_id).toBe('c3')
  })

  it('立绘分层随说话人切换，并用 avatar_id 查询', () => {
    const p = createPreview({
      index: 0,
      byAvatar: { 11: ['a-base.png', 'a-layer.png'] },
    })
    expect(p.previewAvatarLayers.value).toEqual(['a-base.png', 'a-layer.png'])
    expect(p.avatarLayersOf).toHaveBeenLastCalledWith(11)
    p.index.value = 2
    expect(p.previewAvatarLayers.value).toEqual([])
    expect(p.avatarLayersOf).toHaveBeenLastCalledWith(null)
  })

  it('previewAvatarSrc 取分层首图，无立绘时为空串', () => {
    const p = createPreview({ index: 0, byAvatar: { 11: ['a-base.png', 'a-layer.png'] } })
    expect(p.previewAvatarSrc.value).toBe('a-base.png')
    p.dialogues.value = [LINES[1]]
    p.index.value = 0
    expect(p.previewAvatarSrc.value).toBe('')
  })

  it('currentChoices 透出分支并带上 locked', () => {
    const branches = [
      { branch_id: 1, source_content_id: 'c3', conditions: { pass: true } },
      { branch_id: 2, source_content_id: 'c3', conditions: { pass: false } },
    ]
    const p = createPreview({
      dialogues: [{ content_id: 'c3', content_type: '选择', character_id: 2, avatar_id: null }],
      branches,
    })
    expect(p.currentChoices.value.map(c => [c.branch_id, c.locked])).toEqual([
      [1, false],
      [2, true],
    ])
    expect(p.evalCondition).toHaveBeenCalledTimes(2)
  })

  it('当前节点不是「选择」时没有选项', () => {
    const p = createPreview({ index: 0, branches: [{ branch_id: 1, source_content_id: 'c1' }] })
    expect(p.currentChoices.value).toEqual([])
  })
})
