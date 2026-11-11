import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useSceneStagePreview } from '@/composables/scene/useSceneStagePreview'
import { withSetup } from '@/__tests__/helpers'

const listNodeDirectives = vi.fn()

vi.mock('@/api/directive', () => ({
  listNodeDirectives: (...args: any[]) => listNodeDirectives(...args),
}))

const assetSrc = (url: string) => (url ? `ASSET:${url}` : '')

function createPreview(options: {
  scene?: any
  characters?: any[]
  dialogues?: any[]
  dialogueIndex?: number
  avatarLayers?: Record<number, string[]>
  defaultBackground?: string
} = {}) {
  const scene = ref(options.scene ?? {})
  const characters = ref(options.characters ?? [])
  const dialogues = ref(options.dialogues ?? [])
  const currentDialogueIndex = ref(options.dialogueIndex ?? 0)
  const avatarLayersOf = (avatarId: number) => (options.avatarLayers?.[avatarId] || [])

  const { result, wrapper } = withSetup(() => useSceneStagePreview({
    projectId: ref(7),
    characters,
    scene,
    dialogues,
    currentDialogueIndex,
    assetSrc,
    avatarLayersOf,
    defaultBackground: options.defaultBackground ?? '/default.jpg',
  }))

  return { result, wrapper, scene, characters, dialogues, currentDialogueIndex }
}

describe('useSceneStagePreview', () => {
  beforeEach(() => {
    listNodeDirectives.mockReset()
    listNodeDirectives.mockResolvedValue([])
  })

  it('新指令按舞台坐标渲染，隐藏指令会移除同图层', () => {
    const { result, wrapper } = createPreview({
      characters: [{ character_id: 1, avatars: [{ avatar_id: 11, image_url: '/a.png' }] }],
      avatarLayers: { 11: ['/L11'] },
    })
    result.previewDirectives.value = [
      {
        directive_type: 'avatar',
        payload: {
          layer_id: 'l1', layer_name: '主角', coord: 'stage',
          x: 30, y: 90, scale: 1.2, opacity: 0.5, rotate: 10, order: 2,
          avatar_id: 11, character_id: 1,
        },
      },
    ]

    const slot = result.previewSlots.value.l1
    expect(slot.src).toBe('/L11')
    expect(slot.x).toBe(30)
    expect(slot.y).toBe(90)
    expect(slot.scale).toBe(1.2)
    expect(slot.opacity).toBe(0.5)
    expect(slot.boxStyle.left).toBe('30%')
    expect(slot.boxStyle.zIndex).toBe(12)
    expect(slot.style.transform).toBe('scale(1.2) rotate(10deg)')

    result.previewDirectives.value = [
      ...result.previewDirectives.value,
      { directive_type: 'avatar', payload: { layer_id: 'l1', action: 'hide' } },
    ]
    expect(result.previewSlots.value.l1).toBeUndefined()
    expect(result.hasPreviewSlots.value).toBe(false)
    wrapper.unmount()
  })

  it('旧 position 指令折算成舞台坐标（x 由槽位决定，y 贴底）', () => {
    const { result, wrapper } = createPreview({
      characters: [{ character_id: 1, avatars: [{ avatar_id: 11, image_url: '/a.png' }] }],
      avatarLayers: { 11: ['/L11'] },
    })
    result.previewDirectives.value = [
      { directive_type: 'avatar', payload: { position: 'left', avatar_id: 11 } },
    ]

    const slot = result.previewSlots.value.left
    expect(slot.x).toBe(20)
    expect(slot.y).toBe(100)
    expect(slot.coord).toBe('stage')
    wrapper.unmount()
  })

  it('素材直出优先使用 image_url，没有立绘时跳过该图层', () => {
    const { result, wrapper } = createPreview()
    result.previewDirectives.value = [
      { directive_type: 'avatar', payload: { layer_id: 'l1', image_url: '/raw.png', coord: 'stage', x: 10, y: 100 } },
      { directive_type: 'avatar', payload: { layer_id: 'l2', coord: 'stage' } },
    ]

    expect(result.previewSlots.value.l1.src).toBe('ASSET:/raw.png')
    expect(result.previewSlots.value.l2).toBeUndefined()
    wrapper.unmount()
  })

  it('avatarLayers 按 order 升序输出图层清单', () => {
    const { result, wrapper } = createPreview()
    result.previewDirectives.value = [
      { directive_type: 'avatar', payload: { layer_id: 'b', layer_name: '后', image_url: '/b.png', coord: 'stage', order: 3 } },
      { directive_type: 'avatar', payload: { layer_id: 'a', image_url: '/a.png', coord: 'stage', order: 1 } },
    ]

    // 没有自定义名称的图层回退为「立绘」
    expect(result.avatarLayers.value).toEqual([
      { layer_id: 'a', label: '立绘', exists: true, visible: true, order: 1 },
      { layer_id: 'b', label: '后', exists: true, visible: true, order: 3 },
    ])
    wrapper.unmount()
  })

  it('stage 指令控制背景/前景/对话框显隐，缺省全部可见', () => {
    const { result, wrapper } = createPreview()
    expect(result.stageVisibility.value).toEqual({ background: true, foreground: true, dialogue: true })

    result.previewDirectives.value = [
      { directive_type: 'stage', payload: { background: false, dialogue: false } },
    ]
    expect(result.stageVisibility.value).toEqual({ background: false, foreground: true, dialogue: false })
    wrapper.unmount()
  })

  it('背景优先级：节点指令 > 场景背景 > 默认背景，前景只认 foreground 层', () => {
    const { result, wrapper } = createPreview({ scene: { background_url: '/scene.png' } })
    expect(result.previewBgSrc.value).toBe('ASSET:/scene.png')
    expect(result.bgAvailable.value).toBe(true)
    expect(result.fgAvailable.value).toBe(false)

    result.previewDirectives.value = [
      { directive_type: 'background', payload: { url: '/bg.png', layer: 'background' } },
      { directive_type: 'background', payload: { url: '/fg.png', layer: 'foreground' } },
    ]
    expect(result.previewBgSrc.value).toBe('ASSET:/bg.png')
    expect(result.previewFgSrc.value).toBe('ASSET:/fg.png')
    expect(result.fgAvailable.value).toBe(true)
    wrapper.unmount()
  })

  it('背景被隐藏时返回空串；无场景背景时回退默认背景', () => {
    const { result, wrapper } = createPreview()
    expect(result.previewBgSrc.value).toBe('/default.jpg')

    result.previewDirectives.value = [{ directive_type: 'stage', payload: { background: false } }]
    expect(result.previewBgSrc.value).toBe('')
    wrapper.unmount()
  })

  it('旁白沿用上一位说话角色的立绘', () => {
    const { result, wrapper } = createPreview({
      dialogues: [
        { content_id: 1, character_id: 1, avatar_id: 11 },
        { content_id: 2, character_id: null, content_text: '旁白' },
      ],
      dialogueIndex: 1,
      characters: [{ character_id: 1, avatars: [{ avatar_id: 11, image_url: '/a.png' }] }],
      avatarLayers: { 11: ['/L11'] },
    })

    expect(result.previewAvatarSources.value).toEqual(['/L11'])
    expect(result.previewAvatarSrc.value).toBe('/L11')
    wrapper.unmount()
  })

  it('角色没有差分层时退回角色头像', () => {
    const { result, wrapper } = createPreview({
      dialogues: [{ content_id: 1, character_id: 2, avatar_id: 22 }],
      characters: [{ character_id: 2, avatar_url: '/avatar.png', avatars: [{ avatar_id: 22, image_url: '' }] }],
    })

    expect(result.previewAvatarSources.value).toEqual(['ASSET:/avatar.png'])
    wrapper.unmount()
  })

  it('背景图 404 标记在切换场景背景后自动复位', async () => {
    const { result, wrapper, scene } = createPreview({ scene: { background_url: '/a.png' } })
    result.settingsBgFailed.value = true
    scene.value = { background_url: '/b.png' }
    await nextTick()
    expect(result.settingsBgFailed.value).toBe(false)
    wrapper.unmount()
  })

  it('效果取最后一条 effect 指令，天气默认时长 3000ms', () => {
    const { result, wrapper } = createPreview()
    expect(result.previewEffect.value).toBeNull()

    result.previewDirectives.value = [
      { directive_type: 'effect', payload: { effect: 'flash' } },
      { directive_type: 'effect', payload: { effect: 'weather', weather: 'rain' } },
    ]
    expect(result.previewEffect.value).toEqual({ effect: 'weather', weather: 'rain' })

    result.triggerPreviewEffect({ effect: 'weather' })
    wrapper.unmount()
  })

  it('loadPreviewDirectives 按 contentId 拉取，空 id 清空列表，异常回退空数组', async () => {
    const { result, wrapper } = createPreview()
    listNodeDirectives.mockResolvedValueOnce([{ directive_type: 'avatar', payload: {} }])
    await result.loadPreviewDirectives(55)
    expect(listNodeDirectives).toHaveBeenCalledWith(7, 55)
    expect(result.previewDirectives.value).toHaveLength(1)

    await result.loadPreviewDirectives(null)
    expect(result.previewDirectives.value).toEqual([])

    listNodeDirectives.mockRejectedValueOnce(new Error('boom'))
    await result.loadPreviewDirectives(56)
    expect(result.previewDirectives.value).toEqual([])
    wrapper.unmount()
  })
})
