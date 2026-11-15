import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerHistoryDialog from '@/components/player/PlayerHistoryDialog.vue'

const BASE_PROPS = {
  language: 'zh-CN',
  visible: true,
  items: [],
}

const mountDialog = (props: Record<string, unknown> = {}) =>
  mount(PlayerHistoryDialog, {
    props: { ...BASE_PROPS, ...props },
    global: {
      stubs: {
        'el-icon': { template: '<span class="icon"><slot /></span>' },
      },
    },
  })

describe('PlayerHistoryDialog', () => {
  it('不可见时不渲染任何结构', () => {
    const wrapper = mountDialog({ visible: false })
    expect(wrapper.find('.history-dialogue-container').exists()).toBe(false)
    expect(wrapper.find('.history-dialogue-content').exists()).toBe(false)
  })

  it('可见时渲染遮罩与标题', () => {
    const wrapper = mountDialog()
    expect(wrapper.find('.history-dialogue-container').exists()).toBe(true)
    expect(wrapper.find('.history-header h3').text()).toBe('历史对话')
    expect(wrapper.find('.close-btn').exists()).toBe(true)
  })

  it('标题跟随语言切换', () => {
    const wrapper = mountDialog({ language: 'en' })
    expect(wrapper.find('.history-header h3').text()).toBe('Dialogue history')
  })

  it('按顺序渲染历史条目并输出角色与正文', () => {
    const wrapper = mountDialog({
      items: [
        { key: 0, character: '林夕', text: '第一句' },
        { key: 1, character: '李暮尘', text: '第二句' },
      ],
    })
    const items = wrapper.findAll('.history-item')
    expect(items).toHaveLength(2)
    expect(items[0].find('.history-character').text()).toBe('林夕')
    expect(items[0].find('.history-text').text()).toBe('第一句')
    expect(items[1].find('.history-text').text()).toBe('第二句')
  })

  it('有场景标题时渲染场景行，缺省时整行不渲染', () => {
    const wrapper = mountDialog({
      items: [
        { key: 0, sceneTitle: '走廊', character: '林夕', text: '第一句' },
        { key: 1, character: '林夕', text: '第二句' },
      ],
    })
    const items = wrapper.findAll('.history-item')
    expect(items[0].find('.history-scene').text()).toBe('走廊')
    expect(items[1].find('.history-scene').exists()).toBe(false)
  })

  it('选项条目带出选择文案，普通条目不带', () => {
    const wrapper = mountDialog({
      items: [
        { key: 0, character: '林夕', text: '第一句', chosen: true, choiceText: '回头' },
        { key: 1, character: '林夕', text: '第二句' },
      ],
    })
    const items = wrapper.findAll('.history-item')
    expect(items[0].find('.history-chosen').text()).toBe('选择：回头')
    expect(items[1].find('.history-chosen').exists()).toBe(false)
  })

  it('点击遮罩关闭', async () => {
    const wrapper = mountDialog()
    await wrapper.find('.history-dialogue-container').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('点击关闭图标只触发一次关闭', async () => {
    const wrapper = mountDialog()
    await wrapper.find('.close-btn').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
