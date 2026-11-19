import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerPerformPanel from '@/components/player/PlayerPerformPanel.vue'

const CHARACTERS = [
  {
    character_id: 7,
    name: '妄',
    avatars: [
      { avatar_id: 11, avatar_type: '微笑' },
      { avatar_id: 12, avatar_type: '冷漠' },
    ],
  },
]

const mountPanel = (props: Record<string, unknown> = {}) =>
  mount(PlayerPerformPanel, {
    props: {
      sceneIndex: 0,
      sceneCount: 3,
      nodeId: 12,
      characters: CHARACTERS,
      contentType: '对话',
      contentText: '初始台词',
      avatarId: '',
      background: '',
      music: '',
      saving: false,
      status: '',
      ...props,
    },
  })

describe('PlayerPerformPanel', () => {
  it('渲染当前场次与节点信息', () => {
    const wrapper = mountPanel({ sceneIndex: 1, sceneCount: 4, nodeId: 99 })
    const pos = wrapper.find('.perform-pos')
    expect(pos.text()).toContain('场景 2/4')
    expect(pos.text()).toContain('节点 #99')
    expect(wrapper.find('.perform-head').text()).toContain('演出模式')
  })

  it('立绘选择器仅在对话节点出现', () => {
    const withAvatar = mountPanel({ contentType: '对话' })
    expect(withAvatar.find('.perform-select').exists()).toBe(true)
    expect(withAvatar.findAll('.perform-select option')).toHaveLength(3)
    expect(withAvatar.findAll('.perform-select optgroup')).toHaveLength(1)

    const withoutAvatar = mountPanel({ contentType: '旁白' })
    expect(withoutAvatar.find('.perform-select').exists()).toBe(false)
  })

  it('文本框与 URL 输入把值通过 update 事件上抛', async () => {
    const wrapper = mountPanel()
    await wrapper.find('.perform-textarea').setValue('改后的台词')
    await wrapper.findAll('.perform-input')[0].setValue('/uploads/bg.png')
    await wrapper.findAll('.perform-input')[1].setValue('/uploads/bgm.mp3')

    expect(wrapper.emitted('update:contentText')?.[0]).toEqual(['改后的台词'])
    expect(wrapper.emitted('update:background')?.[0]).toEqual(['/uploads/bg.png'])
    expect(wrapper.emitted('update:music')?.[0]).toEqual(['/uploads/bgm.mp3'])
  })

  it('立绘选择上抛 update:avatarId', async () => {
    const wrapper = mountPanel({ contentType: '对话' })
    await wrapper.find('.perform-select').setValue('12')
    expect(wrapper.emitted('update:avatarId')?.[0]).toEqual(['12'])
  })

  it('saving 时按钮禁用并显示保存中', () => {
    const idle = mountPanel()
    expect(idle.find('.perform-save').attributes('disabled')).toBeUndefined()
    expect(idle.find('.perform-save').text()).toBe('保存并热更新')

    const saving = mountPanel({ saving: true })
    expect(saving.find('.perform-save').attributes('disabled')).toBeDefined()
    expect(saving.find('.perform-save').text()).toBe('保存中…')
  })

  it('保存与关闭只抛出领域事件', async () => {
    const wrapper = mountPanel({ status: '已写入' })
    await wrapper.find('.perform-save').trigger('click')
    await wrapper.find('.perform-close').trigger('click')

    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.find('.perform-status').text()).toBe('已写入')
  })
})
