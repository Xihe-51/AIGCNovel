import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerFunctionButtons from '@/components/player/PlayerFunctionButtons.vue'

const BUTTON_EVENTS = [
  'history',
  'toggle-box',
  'skip',
  'toggle-auto',
  'restart',
  'save',
  'exit',
]

const mountButtons = (props: { language?: string; autoPlay?: boolean } = {}) =>
  mount(PlayerFunctionButtons, {
    props: { language: 'zh-CN', autoPlay: false, ...props },
    global: {
      stubs: {
        'el-tooltip': { template: '<div><slot /></div>' },
        'el-icon': { template: '<button><slot /></button>' },
      },
    },
  })

describe('PlayerFunctionButtons', () => {
  it('按固定顺序渲染 7 个功能按钮', () => {
    const wrapper = mountButtons()
    expect(wrapper.findAll('button.func-btn')).toHaveLength(BUTTON_EVENTS.length)
  })

  it('每个按钮点击只抛出对应的领域事件', async () => {
    const wrapper = mountButtons()
    const buttons = wrapper.findAll('button.func-btn')
    for (let i = 0; i < BUTTON_EVENTS.length; i += 1) {
      const before = Object.keys(wrapper.emitted()).length
      await buttons[i].trigger('click')
      expect(wrapper.emitted(BUTTON_EVENTS[i])).toHaveLength(1)
      expect(Object.keys(wrapper.emitted()).length).toBe(before + 1)
    }
    expect(Object.keys(wrapper.emitted()).sort()).toEqual([...BUTTON_EVENTS].sort())
  })

  it('自动播放按钮文案随 autoPlay 切换', () => {
    const off = mountButtons({ autoPlay: false }).findAll('[content]')
    expect(off[3].attributes('content')).toBe('开启自动播放')

    const on = mountButtons({ autoPlay: true }).findAll('[content]')
    expect(on[3].attributes('content')).toBe('关闭自动播放')
  })

  it('多语言文案跟随 language 切换', () => {
    const zhTw = mountButtons({ language: 'zh-TW' }).findAll('[content]')
    expect(zhTw[0].attributes('content')).toBe('檢視歷史對話')

    const en = mountButtons({ language: 'en' }).findAll('[content]')
    expect(en[0].attributes('content')).toBe('View dialogue history')
  })

  it('未知语言回退到简体中文', () => {
    const wrapper = mountButtons({ language: 'xx-XX' })
    expect(wrapper.findAll('[content]')[0].attributes('content')).toBe('查看历史对话')
  })
})
