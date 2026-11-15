import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import PlayerEntryBar from '@/components/player/PlayerEntryBar.vue'

const BASE_PROPS = {
  language: 'zh-CN',
  loading: false,
  error: '',
  canRollback: false,
  canPerform: false,
  performMode: false,
  hasVariables: false,
  hasReleases: false,
  hasChapters: false,
  debugMode: false,
  showRotateHint: false,
}

const Harness = defineComponent({
  props: { barProps: { type: Object, required: true } },
  setup: (props) => () => h('div', { class: 'harness' }, [h(PlayerEntryBar, props.barProps as any)]),
})

const mountBar = (props: Record<string, unknown> = {}) =>
  mount(Harness, {
    props: { barProps: { ...BASE_PROPS, ...props } },
    global: {
      stubs: {
        'el-icon': { template: '<span class="icon"><slot /></span>' },
      },
    },
  })

const ALWAYS_ENTRIES = [
  { selector: '.player-settings-btn', event: 'open-settings' },
  { selector: '.player-gallery-btn', event: 'open-gallery' },
]

const CONDITIONAL_ENTRIES = [
  { selector: '.player-back-btn', flag: 'canRollback', event: 'rollback' },
  { selector: '.player-perform-btn', flag: 'canPerform', event: 'toggle-perform' },
  { selector: '.player-status-btn', flag: 'hasVariables', event: 'open-status' },
  { selector: '.player-changelog-btn', flag: 'hasReleases', event: 'open-changelog' },
  { selector: '.player-chapter-btn', flag: 'hasChapters', event: 'open-chapters' },
  { selector: '.player-debug-btn', flag: 'debugMode', event: 'toggle-debug' },
]

const ALL_ENTRIES = [...ALWAYS_ENTRIES, ...CONDITIONAL_ENTRIES]

const ALL_ON = {
  canRollback: true,
  canPerform: true,
  hasVariables: true,
  hasReleases: true,
  hasChapters: true,
  debugMode: true,
}

describe('PlayerEntryBar', () => {
  it('加载中或出错时整条入口栏不渲染', () => {
    expect(mountBar({ loading: true }).find('.player-settings-btn').exists()).toBe(false)
    expect(mountBar({ error: '加载失败' }).find('.player-settings-btn').exists()).toBe(false)
    expect(mountBar({ loading: true, showRotateHint: true }).find('.rotate-hint').exists()).toBe(false)
  })

  it('最简状态只显示阅读设置与鉴赏入口', () => {
    const wrapper = mountBar()
    expect(wrapper.find('.player-settings-btn').exists()).toBe(true)
    expect(wrapper.find('.player-gallery-btn').exists()).toBe(true)
    expect(wrapper.findAll('button')).toHaveLength(ALWAYS_ENTRIES.length)
  })

  it('各功能开关独立控制对应入口显隐', () => {
    for (const { selector, flag } of CONDITIONAL_ENTRIES) {
      expect(mountBar().find(selector).exists()).toBe(false)
      expect(mountBar({ [flag]: true }).find(selector).exists()).toBe(true)
    }
    expect(mountBar(ALL_ON).findAll('button')).toHaveLength(ALL_ENTRIES.length)
  })

  it('演出模式开启时按钮带 is-active 标记', () => {
    expect(mountBar({ canPerform: true }).find('.player-perform-btn').classes()).not.toContain('is-active')
    expect(mountBar({ canPerform: true, performMode: true }).find('.player-perform-btn').classes()).toContain('is-active')
  })

  it('点击入口只抛出对应的领域事件', async () => {
    const wrapper = mountBar(ALL_ON)
    const bar = wrapper.findComponent(PlayerEntryBar)
    for (const { selector, event } of ALL_ENTRIES) {
      await wrapper.find(selector).trigger('click')
      expect(bar.emitted(event)).toHaveLength(1)
    }
    expect(Object.keys(bar.emitted()).sort()).toEqual(ALL_ENTRIES.map((b) => b.event).sort())
  })

  it('竖屏提示按开关显示，「知道了」抛 dismiss-rotate', async () => {
    const wrapper = mountBar({ showRotateHint: true })
    const hint = wrapper.find('.rotate-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('建议横屏体验')
    await hint.find('button').trigger('click')
    expect(wrapper.findComponent(PlayerEntryBar).emitted('dismiss-rotate')).toHaveLength(1)
  })

  it('文案跟随 language 切换', () => {
    const wrapper = mountBar({
      language: 'en',
      hasReleases: true,
      hasChapters: true,
      showRotateHint: true,
    })
    expect(wrapper.find('.player-settings-btn').attributes('title')).toBe('Reading settings')
    expect(wrapper.find('.player-gallery-btn').attributes('title')).toBe('Gallery')
    expect(wrapper.find('.player-changelog-btn').text()).toBe('Updates')
    expect(wrapper.find('.player-chapter-btn').text()).toBe('Chapters')
    expect(wrapper.find('.rotate-hint').text()).toContain('Rotate your device')
  })
})
