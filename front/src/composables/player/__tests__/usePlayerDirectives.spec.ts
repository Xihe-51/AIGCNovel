import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  applyStageVisibility,
  buildAvatarBoxStyle,
  buildAvatarLayer,
  usePlayerDirectives,
} from '@/composables/player/usePlayerDirectives'
import { BASE_URL } from '@/utils/request'

const createAudio = () => ({
  src: '',
  volume: 1,
  currentTime: 0,
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
})

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('buildAvatarBoxStyle', () => {
  it('舞台坐标直接使用百分比', () => {
    const style = buildAvatarBoxStyle('center', { coord: 'stage', x: 30, y: 40, order: 2 })
    expect(style.left).toBe('30%')
    expect(style.top).toBe('40%')
    expect(style.zIndex).toBe(12)
    expect(style.transform).toBe('translate(-50%, -100%)')
    expect(style.bottom).toBe('auto')
    expect(style.right).toBe('auto')
  })

  it('旧指令坐标按槽位折算，纵坐标贴底', () => {
    expect(buildAvatarBoxStyle('left', { position: 'left' }).left).toBe('20%')
    expect(buildAvatarBoxStyle('right', { position: 'right' }).left).toBe('80%')
    expect(buildAvatarBoxStyle('center', { position: 'center' }).left).toBe('50%')
    expect(buildAvatarBoxStyle('left', { position: 'left' }).top).toBe('100%')
  })

  it('visible 为 false 时补充 display: none', () => {
    expect(buildAvatarBoxStyle('center', { coord: 'stage', visible: false }).display).toBe('none')
    expect(buildAvatarBoxStyle('center', { coord: 'stage', visible: true }).display).toBeUndefined()
  })
})

describe('buildAvatarLayer', () => {
  it('没有素材时返回 null', () => {
    expect(buildAvatarLayer({ layer_id: 'a' }, [])).toBeNull()
    expect(buildAvatarLayer({ layer_id: 'a' }, undefined as any)).toBeNull()
  })

  it('默认缩放、旋转、不透明度', () => {
    const layer = buildAvatarLayer({ layer_id: 'a', order: 1 }, ['/a.png'])!
    expect(layer.style.transform).toBe('scale(1) rotate(0deg)')
    expect(layer.style.opacity).toBe(1)
    expect(layer.visible).toBe(true)
    expect(layer.order).toBe(1)
  })

  it('透传素材列表与缩放参数', () => {
    const sources = ['/base.png', '/hair.png']
    const layer = buildAvatarLayer({ layer_id: 'a', scale: 1.2, rotate: -10, opacity: 0.5 }, sources)!
    expect(layer.src).toBe('/base.png')
    expect(layer.sources).toBe(sources)
    expect(layer.style.transform).toBe('scale(1.2) rotate(-10deg)')
    expect(layer.style.opacity).toBe(0.5)
  })
})

describe('applyStageVisibility', () => {
  it('只接受布尔值并返回新对象', () => {
    const current = { background: true, foreground: true, dialogue: true }
    const next = applyStageVisibility(current, { background: false, dialogue: 'x' })
    expect(next).toEqual({ background: false, foreground: true, dialogue: true })
    expect(current).toEqual({ background: true, foreground: true, dialogue: true })
    expect(next).not.toBe(current)
  })

  it('当前状态为空时补齐字段', () => {
    expect(applyStageVisibility(null, { foreground: false })).toEqual({ foreground: false })
    expect(applyStageVisibility(undefined, {})).toEqual({})
  })
})

describe('usePlayerDirectives', () => {
  let audioCalls: any[] = []

  beforeEach(() => {
    audioCalls = []
    class FakeAudio {
      src: string
      volume = 1
      play = vi.fn(() => Promise.resolve())
      constructor(src?: string) {
        this.src = src || ''
        audioCalls.push(this)
      }
    }
    vi.stubGlobal('Audio', FakeAudio)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  const createDirectives = () => {
    const stageAvatars = ref<any>({ old: { layer_id: 'old', order: 0 } })
    const stageLayerVisible = ref<any>({ background: true, foreground: true, dialogue: true })
    const fgFromDirective = ref('')
    const bgFromDirective = ref('')
    const bgTransition = ref('fade')
    const bgDuration = ref(400)
    const directivesByContent = ref<any>({})
    const music = createAudio()
    const fadeBgmTo = vi.fn()
    const triggerEffect = vi.fn()
    const scheduleWait = vi.fn()
    const avatarLayersOf = vi.fn(() => [])
    const defaultAvatarLayersOf = vi.fn(() => [])
    const { applyDirectives } = usePlayerDirectives({
      getDirectivesByContent: () => directivesByContent.value,
      stageAvatars,
      stageLayerVisible,
      fgFromDirective,
      bgFromDirective,
      bgTransition,
      bgDuration,
      getBackgroundMusic: () => music as any,
      fadeBgmTo,
      getBgmTargetVolume: () => 0.6,
      avatarLayersOf,
      defaultAvatarLayersOf,
      triggerEffect,
      scheduleWait,
    })
    const setDirectives = (list: any[], contentId = 'c1') => {
      directivesByContent.value = { ...directivesByContent.value, [contentId]: list }
    }
    const apply = (contentId = 'c1') => applyDirectives({ content_id: contentId })
    return {
      apply,
      setDirectives,
      stageAvatars,
      stageLayerVisible,
      fgFromDirective,
      bgFromDirective,
      bgTransition,
      bgDuration,
      music,
      fadeBgmTo,
      triggerEffect,
      scheduleWait,
      avatarLayersOf,
      defaultAvatarLayersOf,
    }
  }

  it('没有对话或没有指令时不做任何改动', () => {
    const ctx = createDirectives()
    ctx.apply()
    expect(ctx.stageAvatars.value).toEqual({ old: { layer_id: 'old', order: 0 } })
    expect(ctx.triggerEffect).not.toHaveBeenCalled()
    expect(ctx.scheduleWait).not.toHaveBeenCalled()
  })

  it('avatar hide 删除对应图层', () => {
    const ctx = createDirectives()
    ctx.setDirectives([{ directive_type: 'avatar', payload: { action: 'hide', layer_id: 'old' } }])
    ctx.apply()
    expect(ctx.stageAvatars.value).toEqual({})
  })

  it('avatar 指令优先使用 image_url', () => {
    const ctx = createDirectives()
    ctx.setDirectives([{ directive_type: 'avatar', payload: { layer_id: 'a', image_url: '/a.png' } }])
    ctx.apply()
    expect(ctx.stageAvatars.value.a.src).toBe(BASE_URL + '/a.png')
    expect(ctx.avatarLayersOf).toHaveBeenCalledWith(undefined)
  })

  it('avatar 指令回退到 avatar_id 素材', () => {
    const ctx = createDirectives()
    ctx.avatarLayersOf.mockReturnValue(['/base.png', '/extra.png'])
    ctx.setDirectives([{ directive_type: 'avatar', payload: { layer_id: 'a', avatar_id: 5 } }])
    ctx.apply()
    expect(ctx.avatarLayersOf).toHaveBeenCalledWith(5)
    expect(ctx.stageAvatars.value.a.sources).toEqual(['/base.png', '/extra.png'])
  })

  it('avatar 指令最终回退到角色默认立绘', () => {
    const ctx = createDirectives()
    ctx.defaultAvatarLayersOf.mockReturnValue(['/default.png'])
    ctx.setDirectives([{ directive_type: 'avatar', payload: { layer_id: 'a', character_id: 9 } }])
    ctx.apply()
    expect(ctx.defaultAvatarLayersOf).toHaveBeenCalledWith(9)
    expect(ctx.stageAvatars.value.a.src).toBe('/default.png')
  })

  it('没有可用素材时保留原图层', () => {
    const ctx = createDirectives()
    ctx.setDirectives([{ directive_type: 'avatar', payload: { layer_id: 'old', character_id: 9 } }])
    ctx.apply()
    expect(ctx.stageAvatars.value.old).toEqual({ layer_id: 'old', order: 0 })
  })

  it('background 区分前景与背景', () => {
    const ctx = createDirectives()
    ctx.setDirectives([
      { directive_type: 'background', payload: { layer: 'foreground', url: '/fg.png' } },
    ])
    ctx.apply()
    expect(ctx.fgFromDirective.value).toBe('/fg.png')
    expect(ctx.bgFromDirective.value).toBe('')

    ctx.setDirectives([
      { directive_type: 'background', payload: { url: '/bg.png', transition: 'slide', duration_ms: 800 } },
    ])
    ctx.apply()
    expect(ctx.bgFromDirective.value).toBe('/bg.png')
    expect(ctx.bgTransition.value).toBe('slide')
    expect(ctx.bgDuration.value).toBe(800)

    ctx.setDirectives([{ directive_type: 'background', payload: { url: '/bg2.png' } }])
    ctx.apply()
    expect(ctx.bgFromDirective.value).toBe('/bg2.png')
    expect(ctx.bgTransition.value).toBe('fade')
    expect(ctx.bgDuration.value).toBe(400)
  })

  it('music stop 暂停并回到开头', () => {
    const ctx = createDirectives()
    ctx.music.currentTime = 12
    ctx.setDirectives([{ directive_type: 'music', payload: { action: 'stop' } }])
    ctx.apply()
    expect(ctx.music.pause).toHaveBeenCalled()
    expect(ctx.music.currentTime).toBe(0)
  })

  it('music 播放后按目标音量淡入', async () => {
    const ctx = createDirectives()
    ctx.setDirectives([{ directive_type: 'music', payload: { url: '/bgm.mp3' } }])
    ctx.apply()
    expect(ctx.music.src).toBe(BASE_URL + '/bgm.mp3')
    expect(ctx.music.volume).toBe(0)
    await flush()
    expect(ctx.fadeBgmTo).toHaveBeenCalledWith(0.6, 600)
  })

  it('sound 指令新建音频并播放', () => {
    const ctx = createDirectives()
    ctx.setDirectives([{ directive_type: 'sound', payload: { url: '/blip.mp3' } }])
    ctx.apply()
    expect(audioCalls).toHaveLength(1)
    expect(audioCalls[0].src).toBe(BASE_URL + '/blip.mp3')
    expect(audioCalls[0].volume).toBe(1)
    expect(audioCalls[0].play).toHaveBeenCalled()
  })

  it('wait 指令累加停顿时间', () => {
    const ctx = createDirectives()
    ctx.setDirectives([
      { directive_type: 'wait', payload: { ms: 300 } },
      { directive_type: 'wait', payload: { ms: '250' } },
      { directive_type: 'wait', payload: { ms: -50 } },
    ])
    ctx.apply()
    expect(ctx.scheduleWait).toHaveBeenCalledWith(550)
  })

  it('effect 只应用最后一个', () => {
    const ctx = createDirectives()
    ctx.setDirectives([
      { directive_type: 'effect', payload: { name: 'shake' } },
      { directive_type: 'effect', payload: { name: 'flash' } },
    ])
    ctx.apply()
    expect(ctx.triggerEffect).toHaveBeenCalledTimes(1)
    expect(ctx.triggerEffect).toHaveBeenCalledWith({ name: 'flash' })
  })

  it('stage 指令合并显隐状态', () => {
    const ctx = createDirectives()
    ctx.setDirectives([
      { directive_type: 'stage', payload: { background: false } },
      { directive_type: 'stage', payload: { dialogue: false } },
    ])
    ctx.apply()
    expect(ctx.stageLayerVisible.value).toEqual({
      background: false,
      foreground: true,
      dialogue: false,
    })
  })
})
