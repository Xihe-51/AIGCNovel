import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import {
  LEGACY_POSITION_ORDER,
  layerIdOf,
  layerNameOf,
  layerOrderOf,
  stageDefaultX,
  usePlayerStage,
} from '@/composables/player/usePlayerStage'
import { BASE_URL } from '@/utils/request'
import { withSetup } from '@/__tests__/helpers'

describe('舞台图层工具函数', () => {
  it('layerIdOf 优先 layer_id，其次 position，最后回退 center', () => {
    expect(layerIdOf({ layer_id: 'l1', position: 'left' })).toBe('l1')
    expect(layerIdOf({ position: 'right' })).toBe('right')
    expect(layerIdOf({})).toBe('center')
    expect(layerIdOf()).toBe('center')
  })

  it('layerNameOf 优先自定义名，其次旧 position 中文名', () => {
    expect(layerNameOf({ layer_name: '主角', position: 'left' })).toBe('主角')
    expect(layerNameOf({ position: 'left' })).toBe('左侧')
    expect(layerNameOf({ position: 'center' })).toBe('中间')
    expect(layerNameOf({})).toBe('立绘')
  })

  it('layerOrderOf 依次读 order、z，最后按旧 position 折算', () => {
    expect(layerOrderOf({ order: 3 })).toBe(3)
    expect(layerOrderOf({ order: '2' })).toBe(2)
    expect(layerOrderOf({ z: 5 })).toBe(5)
    expect(layerOrderOf({ position: 'right' })).toBe(LEGACY_POSITION_ORDER.right)
    expect(layerOrderOf({})).toBe(LEGACY_POSITION_ORDER.center)
  })

  it('stageDefaultX 按旧槽位给出默认站位', () => {
    expect(stageDefaultX('left')).toBe(20)
    expect(stageDefaultX('right')).toBe(80)
    expect(stageDefaultX('anything')).toBe(50)
  })
})

describe('usePlayerStage', () => {
  const createStage = (scene: any = {}, characters: any[] = []) => withSetup(() => usePlayerStage({
    getProjectId: () => 7,
    getCurrentScene: () => scene,
    getCharacters: () => characters,
    getDefaultBackground: () => '/default.jpg',
  }))

  it('stageLayers 按 order 升序，空舞台 hasStageAvatars 为 false', () => {
    const { result, wrapper } = createStage()
    expect(result.hasStageAvatars.value).toBe(false)
    result.stageAvatars.value = {
      a: { layer_id: 'a', order: 2 },
      b: { layer_id: 'b', order: 0 },
    }
    expect(result.stageLayers.value.map((l: any) => l.layer_id)).toEqual(['b', 'a'])
    expect(result.hasStageAvatars.value).toBe(true)
    wrapper.unmount()
  })

  it('stageBackground 优先级：指令背景 > 场景背景 > 默认背景', () => {
    const { result, wrapper } = createStage({ background_url: '/scene.png' })
    expect(result.stageBackground.value).toBe(BASE_URL + '/scene.png')

    result.bgFromDirective.value = '/directive.png'
    expect(result.stageBackground.value).toBe(BASE_URL + '/directive.png')

    result.bgFromDirective.value = ''
    result.stageLayerVisible.value = { ...result.stageLayerVisible.value, background: false }
    expect(result.stageBackground.value).toBe('')

    result.stageLayerVisible.value = { ...result.stageLayerVisible.value, background: true }
    wrapper.unmount()

    const fallback = createStage({})
    expect(fallback.result.stageBackground.value).toBe('/default.jpg')
    fallback.wrapper.unmount()
  })

  it('avatarLayersOf 返回基础图 + 按 order 排序的差分层', () => {
    const characters = [{
      character_id: 1,
      avatars: [{
        avatar_id: 11,
        image_url: '/base.png',
        layers: [
          { image_url: '/layer2.png', order: 2 },
          { image_url: '/layer1.png', order: 1 },
          { image_url: '', order: 0 },
        ],
      }],
    }]
    const { result, wrapper } = createStage({}, characters)
    expect(result.avatarLayersOf(11)).toEqual([
      BASE_URL + '/base.png',
      BASE_URL + '/layer1.png',
      BASE_URL + '/layer2.png',
    ])
    expect(result.avatarLayersOf(999)).toEqual([])
    expect(result.avatarLayersOf(null as any)).toEqual([])
    wrapper.unmount()
  })

  it('defaultAvatarLayersOf 优先默认立绘，没有立绘时退回角色头像', () => {
    const characters = [
      {
        character_id: 1,
        avatars: [
          { avatar_id: 11, image_url: '/a.png' },
          { avatar_id: 12, image_url: '/b.png', is_default: true },
        ],
      },
      { character_id: 2, avatars: [], avatar_url: '/avatar.png' },
      { character_id: 3, avatars: [] },
    ]
    const { result, wrapper } = createStage({}, characters)
    expect(result.defaultAvatarLayersOf(1)).toEqual([BASE_URL + '/b.png'])
    expect(result.defaultAvatarLayersOf(2)).toEqual([BASE_URL + '/avatar.png'])
    expect(result.defaultAvatarLayersOf(3)).toEqual([])
    expect(result.defaultAvatarLayersOf(99)).toEqual([])
    wrapper.unmount()
  })

  it('resetStage 清空舞台状态并触发外部清理回调', () => {
    const onReset = vi.fn()
    const { result, wrapper } = withSetup(() => usePlayerStage({
      getProjectId: () => 7,
      getCurrentScene: () => ({}),
      getCharacters: () => [],
      onReset,
    }))
    result.stageAvatars.value = { a: { layer_id: 'a' } }
    result.bgFromDirective.value = '/bg.png'
    result.fgFromDirective.value = '/fg.png'
    result.stageLayerVisible.value = { background: false, foreground: false, dialogue: false }

    result.resetStage()

    expect(result.stageAvatars.value).toEqual({})
    expect(result.bgFromDirective.value).toBe('')
    expect(result.fgFromDirective.value).toBe('')
    expect(result.stageLayerVisible.value).toEqual({ background: true, foreground: true, dialogue: true })
    expect(onReset).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})

describe('usePlayerStage 背景/前景过渡', () => {
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    static instances: FakeImage[] = []
    set src(_value: string) {
      FakeImage.instances.push(this)
    }
  }

  const createStage = () => withSetup(() => usePlayerStage({
    getProjectId: () => 7,
    getCurrentScene: () => ({ background_url: '/a.png' }),
    getCharacters: () => [],
  }))

  beforeEach(() => {
    vi.useFakeTimers()
    FakeImage.instances = []
    vi.stubGlobal('Image', FakeImage)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('首次进入直接显示背景，不做过场', () => {
    const { result, wrapper } = createStage()
    expect(result.bgShown.value).toBe(BASE_URL + '/a.png')
    expect(result.bgFading.value).toBe(false)
    wrapper.unmount()
  })

  it('硬切模式立即换图且不进入淡出', async () => {
    const { result, wrapper } = createStage()
    result.bgTransition.value = 'cut'
    result.bgFromDirective.value = '/b.png'
    await nextTick()

    expect(result.bgShown.value).toBe(BASE_URL + '/b.png')
    expect(result.bgFading.value).toBe(false)
    expect(FakeImage.instances).toHaveLength(0)
    wrapper.unmount()
  })

  it('淡出模式先标记淡出，换图解码完成后再结束过渡', async () => {
    const { result, wrapper } = createStage()
    result.bgTransition.value = 'fade'
    result.bgFromDirective.value = '/c.png'
    await nextTick()

    expect(result.bgFading.value).toBe(true)
    expect(result.bgShown.value).toBe(BASE_URL + '/a.png')

    await vi.advanceTimersByTimeAsync(260)
    expect(result.bgShown.value).toBe(BASE_URL + '/c.png')
    expect(result.bgFading.value).toBe(true)

    FakeImage.instances[0].onload?.()
    expect(result.bgFading.value).toBe(false)
    wrapper.unmount()
  })

  it('黑场模式在换图前压黑，解码完成后一起复位', async () => {
    const { result, wrapper } = createStage()
    result.bgTransition.value = 'black'
    result.bgDuration.value = 600
    result.bgFromDirective.value = '/d.png'
    await nextTick()

    expect(result.bgBlackout.value).toBe(true)

    await vi.advanceTimersByTimeAsync(300)
    expect(result.bgShown.value).toBe(BASE_URL + '/d.png')

    FakeImage.instances[0].onerror?.()
    expect(result.bgBlackout.value).toBe(false)
    expect(result.bgFading.value).toBe(false)
    wrapper.unmount()
  })

  it('背景层被隐藏时清空当前背景并取消未完成的过渡', async () => {
    const { result, wrapper } = createStage()
    result.bgTransition.value = 'fade'
    result.bgFromDirective.value = '/e.png'
    await nextTick()
    expect(result.bgFading.value).toBe(true)

    result.stageLayerVisible.value = { ...result.stageLayerVisible.value, background: false }
    await nextTick()

    expect(result.bgShown.value).toBe('')
    expect(result.bgFading.value).toBe(false)
    expect(result.bgBlackout.value).toBe(false)
    wrapper.unmount()
  })

  it('前景图切换后延迟生效，清空时立即隐藏', async () => {
    const { result, wrapper } = createStage()
    result.fgFromDirective.value = '/fg.png'
    await nextTick()
    expect(result.fgFading.value).toBe(true)

    await vi.advanceTimersByTimeAsync(180)
    expect(result.fgShown.value).toBe(BASE_URL + '/fg.png')

    FakeImage.instances[0].onload?.()
    expect(result.fgFading.value).toBe(false)

    result.fgFromDirective.value = ''
    await nextTick()
    expect(result.fgShown.value).toBe('')
    expect(result.fgFading.value).toBe(false)
    wrapper.unmount()
  })

  it('clearStageTransitions 取消未完成的背景与前景过渡', async () => {
    const { result, wrapper } = createStage()
    result.bgTransition.value = 'fade'
    result.bgFromDirective.value = '/g.png'
    result.fgFromDirective.value = '/fg.png'
    await nextTick()

    result.clearStageTransitions()
    await vi.advanceTimersByTimeAsync(1000)

    expect(result.bgShown.value).toBe(BASE_URL + '/a.png')
    expect(result.fgShown.value).toBe('')
    wrapper.unmount()
  })
})
