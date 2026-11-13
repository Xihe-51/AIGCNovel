import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { BASE_URL } from '@/utils/request'
import {
  FOCUS_PULSE_MS,
  avatarOptionLabel,
  avatarsOfCharacter,
  buildAssetSrc,
  collectAvatarLayers,
  useSceneDialoguePreview,
} from '@/composables/scene/useSceneDialoguePreview'
import { withSetup } from '@/__tests__/helpers'

describe('buildAssetSrc', () => {
  it('空地址返回空串', () => {
    expect(buildAssetSrc('', 1)).toBe('')
    expect(buildAssetSrc(null, 1)).toBe('')
    expect(buildAssetSrc(undefined, 1)).toBe('')
  })

  it('内联资源不做改写', () => {
    expect(buildAssetSrc('data:image/png;base64,AAA', 1)).toBe('data:image/png;base64,AAA')
    expect(buildAssetSrc('blob:http://localhost/abc', 1)).toBe('blob:http://localhost/abc')
  })

  it('外链原样返回，避免破坏签名参数', () => {
    const url = 'https://cdn.example.com/a.png?sign=xyz'
    expect(buildAssetSrc(url, 1)).toBe(url)
  })

  it('项目内绝对路径只追加时间戳', () => {
    expect(buildAssetSrc('/assets/a.png', 9)).toBe('/assets/a.png?v=9')
    expect(buildAssetSrc('/src/a.png', 9)).toBe('/src/a.png?v=9')
  })

  it('接口资源补 BASE_URL', () => {
    expect(buildAssetSrc('/api/uploads/a.png', 3)).toBe(`${BASE_URL}/api/uploads/a.png?v=3`)
    expect(buildAssetSrc('uploads/a.png', 3)).toBe(`${BASE_URL}/uploads/a.png?v=3`)
  })

  it('已有查询参数时用 & 续接', () => {
    expect(buildAssetSrc('/assets/a.png?raw=1', 5)).toBe('/assets/a.png?raw=1&v=5')
  })
})

describe('collectAvatarLayers', () => {
  const characters = () => [
    {
      character_id: 'c1',
      avatars: [
        {
          avatar_id: 'a1',
          image_url: 'base.png',
          layers: [
            { image_url: 'top.png', order: 2 },
            { image_url: 'bottom.png', order: 1 },
            { image_url: '', order: 0 },
            null,
          ],
        },
        { avatar_id: 'a2', layers: [] },
      ],
    },
  ]
  const resolve = (url: any) => `src:${url}`

  it('没有 avatarId 返回空数组', () => {
    expect(collectAvatarLayers(characters(), null, resolve)).toEqual([])
  })

  it('找不到立绘返回空数组', () => {
    expect(collectAvatarLayers(characters(), 'missing', resolve)).toEqual([])
  })

  it('立绘缺图片地址时返回空数组', () => {
    expect(collectAvatarLayers(characters(), 'a2', resolve)).toEqual([])
  })

  it('基础图在前，叠加层按 order 升序且过滤空层', () => {
    expect(collectAvatarLayers(characters(), 'a1', resolve)).toEqual([
      'src:base.png',
      'src:bottom.png',
      'src:top.png',
    ])
  })
})

describe('avatarOptionLabel', () => {
  it('表情与服装拼接', () => {
    expect(avatarOptionLabel({ avatar_type: '微笑', costume: '校服' })).toBe('微笑 · 校服')
  })

  it('缺字段时只显示存在的部分', () => {
    expect(avatarOptionLabel({ avatar_type: '微笑' })).toBe('微笑')
    expect(avatarOptionLabel({ costume: '校服' })).toBe('校服')
  })

  it('默认立绘加后缀', () => {
    expect(avatarOptionLabel({ avatar_type: '平静', costume: '常服', is_default: true }))
      .toBe('平静 · 常服（默认）')
  })

  it('空对象不报错', () => {
    expect(avatarOptionLabel(null)).toBe('')
  })
})

describe('avatarsOfCharacter', () => {
  const characters = () => [
    { character_id: 'c1', avatars: [{ avatar_id: 'a1' }] },
    { character_id: 'c2' },
  ]

  it('没有角色 id 返回空数组', () => {
    expect(avatarsOfCharacter(characters(), null)).toEqual([])
  })

  it('角色不存在返回空数组', () => {
    expect(avatarsOfCharacter(characters(), 'c9')).toEqual([])
  })

  it('角色没有立绘时返回空数组', () => {
    expect(avatarsOfCharacter(characters(), 'c2')).toEqual([])
  })

  it('命中角色返回其立绘列表', () => {
    expect(avatarsOfCharacter(characters(), 'c1')).toEqual([{ avatar_id: 'a1' }])
  })
})

const createPreview = (options: {
  dialogues?: any[]
  index?: number
  focusContentId?: any
  characters?: any[]
} = {}) => {
  const dialogues = ref<any[]>(options.dialogues ?? [
    { content_id: 11, content_text: '**第一句**', character_id: 'c1' },
    { content_id: 12, content_text: '第二句', character_id: 'c2' },
    { content_id: 13, content_text: '第三句', character_id: 'c1' },
  ])
  const characters = ref<any[]>(options.characters ?? [])
  const currentDialogueIndex = ref(options.index ?? 0)
  const focusedContentId = ref<any>(null)
  const externalFocus = ref<any>(options.focusContentId ?? null)
  const getCharacterName = vi.fn((characterId: any) => (characterId === 'c1' ? '小林' : '旁白'))
  const { result, wrapper } = withSetup(() => useSceneDialoguePreview({
    dialogues,
    characters,
    currentDialogueIndex,
    focusedContentId,
    focusContentId: () => externalFocus.value,
    getCharacterName,
  }))
  return {
    preview: result,
    dialogues,
    characters,
    currentDialogueIndex,
    focusedContentId,
    externalFocus,
    getCharacterName,
    wrapper,
  }
}

describe('useSceneDialoguePreview', () => {
  let wrappers: any[] = []

  beforeEach(() => {
    wrappers = []
    vi.useRealTimers()
  })

  afterEach(() => {
    wrappers.forEach(w => w.unmount())
    vi.useRealTimers()
  })

  const mountPreview = (options: Parameters<typeof createPreview>[0] = {}) => {
    const created = createPreview(options)
    wrappers.push(created.wrapper)
    return created
  }

  it('当前台词、说话人与富文本随下标变化', async () => {
    const { preview, currentDialogueIndex, getCharacterName } = mountPreview()

    expect(preview.currentDialogue.value.content_id).toBe(11)
    expect(preview.currentSpeakerName.value).toBe('小林')
    expect(preview.currentDialogueHtml.value).toBe('<strong>第一句</strong>')
    expect(getCharacterName).toHaveBeenCalledWith('c1')

    currentDialogueIndex.value = 1
    await nextTick()
    expect(preview.currentDialogue.value.content_id).toBe(12)
    expect(preview.currentSpeakerName.value).toBe('旁白')
    expect(preview.currentDialogueHtml.value).toBe('第二句')
  })

  it('selectDialogue 切换下标', () => {
    const { preview, currentDialogueIndex } = mountPreview()

    preview.selectDialogue(2)
    expect(currentDialogueIndex.value).toBe(2)

    preview.selectDialogue(2)
    expect(currentDialogueIndex.value).toBe(2)
  })

  it('focusDialogueByContentId 命中时选中并高亮，超时自动清空', async () => {
    vi.useFakeTimers()
    const { preview, currentDialogueIndex, focusedContentId } = mountPreview()

    await preview.focusDialogueByContentId('12')
    expect(currentDialogueIndex.value).toBe(1)
    expect(focusedContentId.value).toBe(12)

    vi.advanceTimersByTime(FOCUS_PULSE_MS)
    expect(focusedContentId.value).toBeNull()
  })

  it('focusDialogueByContentId 找不到目标时不做改动', async () => {
    const { preview, currentDialogueIndex, focusedContentId } = mountPreview()

    await preview.focusDialogueByContentId('999')
    expect(currentDialogueIndex.value).toBe(0)
    expect(focusedContentId.value).toBeNull()

    await preview.focusDialogueByContentId(null)
    expect(currentDialogueIndex.value).toBe(0)
  })

  it('cancelFocusPulse 提前清掉高亮定时器', async () => {
    vi.useFakeTimers()
    const { preview, focusedContentId } = mountPreview()

    await preview.focusDialogueByContentId('13')
    expect(focusedContentId.value).toBe(13)

    preview.cancelFocusPulse()
    vi.advanceTimersByTime(FOCUS_PULSE_MS * 2)
    expect(focusedContentId.value).toBe(13)
  })

  it('外部传入的 focusContentId 变化时定位到对应台词', async () => {
    const { externalFocus, currentDialogueIndex, focusedContentId } = mountPreview()

    externalFocus.value = 13
    await nextTick()
    await flushPromises()

    expect(currentDialogueIndex.value).toBe(2)
    expect(focusedContentId.value).toBe(13)
  })

  it('nextDialogue 下标前移，到底后不再变化', () => {
    const { preview, currentDialogueIndex } = mountPreview()

    preview.nextDialogue()
    expect(currentDialogueIndex.value).toBe(1)

    currentDialogueIndex.value = 2
    preview.nextDialogue()
    expect(currentDialogueIndex.value).toBe(3)

    preview.nextDialogue()
    expect(currentDialogueIndex.value).toBe(3)
  })

  it('restartDialogues 回到第一句', () => {
    const { preview, currentDialogueIndex } = mountPreview({ index: 2 })

    preview.restartDialogues()
    expect(currentDialogueIndex.value).toBe(0)
  })

  it('getCharacterAvatars 读取角色立绘', () => {
    const { preview } = mountPreview({
      characters: [{ character_id: 'c1', avatars: [{ avatar_id: 'a1' }] }],
    })

    expect(preview.getCharacterAvatars('c1')).toEqual([{ avatar_id: 'a1' }])
    expect(preview.getCharacterAvatars('c9')).toEqual([])
  })

  it('assetSrc 随 assetNonce 变化，avatarLayersOf 逐层解析地址', () => {
    const { preview } = mountPreview({
      characters: [{
        character_id: 'c1',
        avatars: [{
          avatar_id: 'a1',
          image_url: '/assets/base.png',
          layers: [{ image_url: '/assets/l1.png', order: 1 }],
        }],
      }],
    })

    const first = preview.assetSrc('/assets/base.png')
    expect(first).toBe('/assets/base.png?v=0')

    preview.assetNonce.value = 1700000000000
    expect(preview.assetSrc('/assets/base.png')).toBe('/assets/base.png?v=1700000000000')
    expect(preview.avatarLayersOf('a1')).toEqual([
      '/assets/base.png?v=1700000000000',
      '/assets/l1.png?v=1700000000000',
    ])
    expect(preview.avatarLayersOf('missing')).toEqual([])
  })
})
