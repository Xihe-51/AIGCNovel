import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import PlayerDialogueBox from '@/components/player/PlayerDialogueBox.vue'
import PlayerFunctionButtons from '@/components/player/PlayerFunctionButtons.vue'

const BASE_PROPS = {
  language: 'zh-CN',
  visible: true,
  hasLine: true,
  sceneEnded: false,
  noDialogues: false,
  contentType: '对话',
  boxStyle: 'classic',
  fontSize: 18,
  lineHeight: 1.6,
  characterName: '林夕',
  textHtml: '<span>你好</span>',
  avatarSrc: '',
  showVoiceButton: false,
  autoPlay: false,
  showRevealButton: false,
  choices: [],
}

const Harness = defineComponent({
  props: { boxProps: { type: Object, required: true } },
  setup: (props) => () => h('div', { class: 'harness' }, [h(PlayerDialogueBox, props.boxProps as any)]),
})

const mountBox = (props: Record<string, unknown> = {}) =>
  mount(Harness, {
    props: { boxProps: { ...BASE_PROPS, ...props } },
    global: {
      stubs: {
        'el-icon': { template: '<span class="icon"><slot /></span>' },
        'el-tooltip': { template: '<div><slot /></div>' },
        View: { template: '<i class="view-icon" />' },
      },
    },
  })

const FUNCTION_EVENTS = [
  'history',
  'toggle-box',
  'skip',
  'toggle-auto',
  'restart',
  'save',
  'exit',
]

describe('PlayerDialogueBox', () => {
  it('visible 为 false 时整块不渲染', () => {
    const wrapper = mountBox({ visible: false })
    expect(wrapper.find('.dialogue-display').exists()).toBe(false)
    expect(wrapper.find('.show-dialogue-btn').exists()).toBe(false)
  })

  it('对话 / 结束 / 无对话 三态互斥', () => {
    const talking = mountBox()
    expect(talking.find('.dialogue-box').exists()).toBe(true)
    expect(talking.find('.dialogue-end').exists()).toBe(false)
    expect(talking.find('.no-dialogues-preview').exists()).toBe(false)

    const ended = mountBox({ hasLine: false, sceneEnded: true })
    expect(ended.find('.dialogue-box').exists()).toBe(false)
    expect(ended.find('.dialogue-end').exists()).toBe(true)
    expect(ended.find('.no-dialogues-preview').exists()).toBe(false)

    const empty = mountBox({ hasLine: false, noDialogues: true })
    expect(empty.find('.dialogue-box').exists()).toBe(false)
    expect(empty.find('.dialogue-end').exists()).toBe(false)
    expect(empty.find('.no-dialogues-preview').exists()).toBe(true)
  })

  it('对白盒按 content_type 与 boxStyle 生成样式类', () => {
    const wrapper = mountBox({ contentType: '描述', boxStyle: 'bubble' })
    const box = wrapper.find('.dialogue-box')
    expect(box.classes()).toContain('box-描述')
    expect(box.classes()).toContain('style-bubble')
  })

  it('角色名与富文本按 props 渲染', () => {
    const wrapper = mountBox()
    expect(wrapper.find('.character-name').text()).toBe('林夕')
    expect(wrapper.find('.dialogue-text').html()).toContain('<span>你好</span>')
    expect(wrapper.find('.dialogue-text').attributes('style')).toContain('font-size: 18px')
  })

  it('点击对白盒抛 advance', async () => {
    const wrapper = mountBox()
    await wrapper.find('.dialogue-box').trigger('click')
    expect(wrapper.findComponent(PlayerDialogueBox).emitted('advance')).toHaveLength(1)
  })

  it('气泡头图只在 bubble + 对话 + 有头像时出现', () => {
    expect(mountBox({ boxStyle: 'bubble', avatarSrc: '/a.png' }).find('.bubble-avatar').exists()).toBe(true)
    expect(mountBox({ boxStyle: 'classic', avatarSrc: '/a.png' }).find('.bubble-avatar').exists()).toBe(false)
    expect(mountBox({ boxStyle: 'bubble', contentType: '描述', avatarSrc: '/a.png' }).find('.bubble-avatar').exists()).toBe(false)
    expect(mountBox({ boxStyle: 'bubble', avatarSrc: '' }).find('.bubble-avatar').exists()).toBe(false)
  })

  it('语音按钮只在 showVoiceButton 时出现，点击抛 replay-voice', async () => {
    expect(mountBox().find('.voice-replay-btn').exists()).toBe(false)
    const wrapper = mountBox({ showVoiceButton: true })
    const btn = wrapper.find('.voice-replay-btn')
    expect(btn.text()).toBe('语音')
    expect(btn.attributes('title')).toBe('重播本句语音')
    await btn.trigger('click')
    expect(wrapper.findComponent(PlayerDialogueBox).emitted('replay-voice')).toHaveLength(1)
  })

  it('分支选项按展示模型渲染，点击抛 select-choice 并带 path_id', async () => {
    const wrapper = mountBox({
      choices: [
        { id: 11, label: '跟上去' },
        { id: 12, label: '留在原地', imageUrl: '/c.png', locked: true, lockText: '需要好感度 3', title: '条件不足' },
      ],
    })
    const options = wrapper.findAll('.choice-option')
    expect(options).toHaveLength(2)
    expect(options[0].text()).toBe('跟上去')
    expect(options[0].classes()).not.toContain('has-image')
    expect(options[0].attributes('disabled')).toBeFalsy()

    expect(options[1].classes()).toContain('has-image')
    expect(options[1].classes()).toContain('is-locked')
    expect(options[1].find('.choice-image').attributes('src')).toBe('/c.png')
    expect(options[1].find('.choice-lock-hint').text()).toBe('需要好感度 3')
    expect(options[1].attributes('title')).toBe('条件不足')
    expect(options[1].attributes('disabled')).toBe('')

    await options[0].trigger('click')
    expect(wrapper.findComponent(PlayerDialogueBox).emitted('select-choice')).toEqual([[11]])
  })

  it('选项区点击不穿透到对白盒的 advance', async () => {
    const wrapper = mountBox({ choices: [{ id: 1, label: '继续' }] })
    await wrapper.find('.choice-panel').trigger('click')
    expect(wrapper.findComponent(PlayerDialogueBox).emitted('advance')).toBeUndefined()
  })

  it('7 个功能键事件逐层透传', async () => {
    const wrapper = mountBox()
    const funcButtons = wrapper.findComponent(PlayerFunctionButtons)
    expect(funcButtons.exists()).toBe(true)
    const buttons = wrapper.findAll('.func-btn')
    expect(buttons).toHaveLength(FUNCTION_EVENTS.length)
    for (let i = 0; i < FUNCTION_EVENTS.length; i += 1) {
      await buttons[i].trigger('click')
    }
    const box = wrapper.findComponent(PlayerDialogueBox)
    for (const event of FUNCTION_EVENTS) {
      expect(box.emitted(event)).toHaveLength(1)
    }
  })

  it('隐藏对话框时显示揭示按钮，点击抛 reveal-box', async () => {
    expect(mountBox().find('.show-dialogue-btn').exists()).toBe(false)
    const wrapper = mountBox({ showRevealButton: true })
    const btn = wrapper.find('.show-dialogue-btn')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(wrapper.findComponent(PlayerDialogueBox).emitted('reveal-box')).toHaveLength(1)
  })

  it('文案跟随 language 切换', () => {
    const wrapper = mountBox({ language: 'en', showVoiceButton: true })
    expect(wrapper.find('.voice-replay-btn').text()).toBe('Voice')
    expect(wrapper.find('.voice-replay-btn').attributes('title')).toBe('Replay this line')
  })

  it('autoPlay 透传给功能键组件', () => {
    const wrapper = mountBox({ autoPlay: true })
    expect(wrapper.findComponent(PlayerFunctionButtons).props('autoPlay')).toBe(true)
  })
})
