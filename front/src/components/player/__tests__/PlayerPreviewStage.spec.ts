import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerPreviewStage from '@/components/player/PlayerPreviewStage.vue'

const BASE_PROPS = {
  language: 'zh-CN',
  bgSrc: '/bg/room.png',
  bgFading: false,
  bgBlackout: false,
  stageLayers: [],
  hasStageAvatars: false,
  previewAvatarLayers: [],
  fgSrc: '',
  fgFading: false,
  showForeground: true,
  activeEffect: null,
  isWaiting: false,
  variableNotices: [],
  audioDrama: false,
  spriteMotion: false,
  loading: false,
  error: '',
}

const mountStage = (props: Record<string, unknown> = {}, slots: Record<string, string> = {}) =>
  mount(PlayerPreviewStage, {
    props: { ...BASE_PROPS, ...props },
    slots,
    global: {
      stubs: {
        'el-icon': { template: '<span class="icon"><slot /></span>' },
        'el-button': { template: '<button class="el-button"><slot /></button>' },
      },
    },
  })

describe('PlayerPreviewStage', () => {
  it('按数据渲染背景图层与淡出/黑场类', () => {
    const wrapper = mountStage({ bgFading: true, bgBlackout: true })
    expect(wrapper.find('.preview-panel').exists()).toBe(true)
    expect(wrapper.find('.background-image').attributes('src')).toBe('/bg/room.png')
    expect(wrapper.find('.background-image').classes()).toContain('bg-fading')
    expect(wrapper.find('.bg-blackout').classes()).toContain('is-on')
  })

  it('点击背景抛出 background-click', async () => {
    const wrapper = mountStage()
    await wrapper.find('.scene-background').trigger('click')
    expect(wrapper.emitted('background-click')).toHaveLength(1)
  })

  it('只有向上滚动才抛出 wheel-up', async () => {
    const wrapper = mountStage()
    await wrapper.find('.preview-container').trigger('wheel', { deltaY: 120 })
    expect(wrapper.emitted('wheel-up')).toBeUndefined()
    await wrapper.find('.preview-container').trigger('wheel', { deltaY: -120 })
    expect(wrapper.emitted('wheel-up')).toHaveLength(1)
  })

  it('有演出立绘时渲染多图层，并按差分层叠加', () => {
    const wrapper = mountStage({
      hasStageAvatars: true,
      stageLayers: [
        { layer_id: 'L1', boxStyle: { left: '10%' }, style: { opacity: '1' }, sources: ['/a.png', '/a_fx.png'] },
        { layer_id: 'L2', visible: false, boxStyle: { left: '60%' }, src: '/b.png' },
      ],
      previewAvatarLayers: ['/fallback.png'],
    })
    const layers = wrapper.findAll('.stage-avatar')
    expect(layers).toHaveLength(2)
    expect(wrapper.findAll('.stage-avatar')[0].findAll('img')).toHaveLength(2)
    expect(wrapper.findAll('.stage-avatar')[0].findAll('img')[1].classes()).toContain('sprite-overlay')
    expect(wrapper.findAll('.stage-avatar')[0].attributes('style')).toContain('left: 10%')
    expect((layers[1].element as HTMLElement).style.display).toBe('none')
    expect(wrapper.find('.character-stand').exists()).toBe(false)
  })

  it('无演出立绘时回退到当前角色立绘，加载/报错时不显示', () => {
    const wrapper = mountStage({ previewAvatarLayers: ['/stand.png', '/stand_fx.png'] })
    expect(wrapper.find('.stage-layer').exists()).toBe(false)
    const stand = wrapper.find('.character-stand')
    expect(stand.exists()).toBe(true)
    expect(stand.findAll('.character-image')).toHaveLength(2)

    expect(mountStage({ previewAvatarLayers: ['/stand.png'], loading: true }).find('.character-stand').exists()).toBe(false)
    expect(mountStage({ previewAvatarLayers: ['/stand.png'], error: '炸了' }).find('.character-stand').exists()).toBe(false)
  })

  it('前景图层受 showForeground 控制且带淡出类', () => {
    const on = mountStage({ fgSrc: '/fg.png', fgFading: true })
    expect(on.find('.stage-foreground img').classes()).toContain('fg-fading')
    expect(mountStage({ fgSrc: '/fg.png', showForeground: false }).find('.stage-foreground').exists()).toBe(false)
    expect(mountStage({ fgSrc: '' }).find('.stage-foreground').exists()).toBe(false)
  })

  it('震动 / 天气 / 闪光三种演出效果', () => {
    const shake = mountStage({ activeEffect: { effect: 'shake', intensity: 12 } })
    expect(shake.find('.preview-container').classes()).toContain('fx-shake')
    expect(shake.find('.preview-container').attributes('style')).toContain('--fx-amp: 12px')

    const weather = mountStage({ activeEffect: { effect: 'weather', weather: 'snow' } })
    expect(weather.find('.fx-weather').classes()).toContain('fx-snow')
    expect(mountStage({ activeEffect: { effect: 'weather' } }).find('.fx-weather').classes()).toContain('fx-rain')

    const flash = mountStage({ activeEffect: { effect: 'flash', key: 3, color: '#ff0000', duration_ms: 800 } })
    const flashEl = flash.find('.fx-flash')
    expect(flashEl.exists()).toBe(true)
    expect(flashEl.attributes('style')).toContain('background: rgb(255, 0, 0)')
    expect(flashEl.attributes('style')).toContain('animation-duration: 800ms')
    expect(mountStage().find('.fx-flash').exists()).toBe(false)
  })

  it('有声剧模式与轻动态立绘只加类不改结构', () => {
    const wrapper = mountStage({
      audioDrama: true,
      spriteMotion: true,
      previewAvatarLayers: ['/stand.png'],
    })
    expect(wrapper.find('.preview-container').classes()).toContain('is-audio-drama')
    expect(wrapper.find('.sprite-stack').classes()).toContain('sprite-motion')
  })

  it('停顿提示在加载/报错时隐藏', () => {
    expect(mountStage({ isWaiting: true }).find('.wait-hint').exists()).toBe(true)
    expect(mountStage({ isWaiting: true, loading: true }).find('.wait-hint').exists()).toBe(false)
    expect(mountStage({ isWaiting: true, error: '炸了' }).find('.wait-hint').exists()).toBe(false)
  })

  it('变量浮层渲染数值方向', () => {
    const wrapper = mountStage({
      variableNotices: [
        { id: 1, label: '好感度', delta: 5 },
        { id: 2, label: '线索', delta: -1 },
      ],
    })
    const notices = wrapper.findAll('.var-notice')
    expect(notices).toHaveLength(2)
    expect(notices[0].text()).toContain('好感度')
    expect(notices[0].text()).toContain('+5')
    expect(notices[1].classes()).toContain('is-down')
    expect(notices[1].text()).toContain('-1')
  })

  it('加载态与错误态互不影响且错误可返回列表', async () => {
    const loading = mountStage({ loading: true })
    expect(loading.find('.loading-indicator').text()).toContain('加载项目中')
    expect(loading.find('.error-message').exists()).toBe(false)

    const errored = mountStage({ error: '网络异常' })
    expect(errored.find('.error-message').text()).toContain('网络异常')
    await errored.find('.error-message button').trigger('click')
    expect(errored.emitted('back-home')).toHaveLength(1)
  })

  it('默认插槽内容叠在舞台之上', () => {
    const wrapper = mountStage({}, { default: '<div class="overlay-probe">浮层</div>' })
    expect(wrapper.find('.preview-container > .overlay-probe').exists()).toBe(true)
  })
})
