import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import DialogueCardHeader from '@/components/scene/DialogueCardHeader.vue'

const BASE_PROPS = {
  index: 0,
  total: 3,
  selected: false,
  fsmState: 'draft',
  canPlay: true,
  hasCondition: false,
}

const STUBS = {
  Plus: true,
  'el-icon': { template: '<span class="icon"><slot /></span>' },
  'el-button': {
    props: ['disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  'el-checkbox': {
    props: ['modelValue'],
    emits: ['change'],
    template:
      '<input type="checkbox" :checked="modelValue" @change="$emit(\'change\', $event.target.checked)" />',
  },
  'el-dropdown': {
    template:
      '<div class="stub-dropdown"><slot /><button class="stub-fsm-command" @click="$emit(\'command\', \'reviewed\')">fsm</button></div>',
  },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div><slot /></div>' },
}

const domainEventNames = (emitted: Record<string, any[][]> = {}) =>
  Object.keys(emitted)
    .filter((name) => !emitted[name].every((args) => args[0] instanceof Event))
    .sort()

const Harness = defineComponent({
  props: { headerProps: { type: Object, required: true } },
  setup: (props) => () =>
    h('div', { class: 'harness' }, [h(DialogueCardHeader, props.headerProps as any)]),
})

const mountHeader = (props: Record<string, any> = {}) =>
  mount(Harness, {
    props: { headerProps: { ...BASE_PROPS, ...props } },
    global: { stubs: STUBS },
  })

describe('DialogueCardHeader', () => {
  it('序号从 1 开始，状态徽标文案与 class 跟随 fsmState', () => {
    expect(mountHeader({ index: 2 }).find('.dialogue-index').text()).toBe('3')

    const reviewed = mountHeader({ fsmState: 'reviewed' })
    expect(reviewed.find('.fsm-badge').text()).toBe('已审核')
    expect(reviewed.find('.fsm-badge').classes()).toContain('reviewed')

    const draft = mountHeader()
    expect(draft.find('.fsm-badge').text()).toBe('草稿')
    expect(draft.find('.fsm-badge').classes()).toContain('draft')
  })

  it('试玩按钮由 canPlay 单独控制', () => {
    expect(mountHeader({ canPlay: false }).find('.play-btn').attributes('disabled')).toBeDefined()
    expect(mountHeader({ canPlay: true }).find('.play-btn').attributes('disabled')).toBeUndefined()
  })

  it('首条禁用上移、末条禁用下移', () => {
    const first = mountHeader({ index: 0, total: 3 })
    expect(first.findAll('.move-btn')[0].attributes('disabled')).toBeDefined()
    expect(first.findAll('.move-btn')[1].attributes('disabled')).toBeUndefined()

    const last = mountHeader({ index: 2, total: 3 })
    expect(last.findAll('.move-btn')[0].attributes('disabled')).toBeUndefined()
    expect(last.findAll('.move-btn')[1].attributes('disabled')).toBeDefined()
  })

  it('hasCondition 时条件按钮带 has-condition 标记', () => {
    expect(mountHeader().find('.condition-btn').classes()).not.toContain('has-condition')
    expect(mountHeader({ hasCondition: true }).find('.condition-btn').classes()).toContain(
      'has-condition'
    )
  })

  it('每个操作只抛对应的领域事件', async () => {
    const wrapper = mountHeader({ index: 1, total: 3 })
    const header = wrapper.findComponent(DialogueCardHeader)

    const actions = [
      { selector: '.directive-btn', event: 'open-directive' },
      { selector: '.condition-btn', event: 'open-node-condition' },
      { selector: '.play-btn', event: 'play' },
      { selector: '.delete-btn', event: 'delete' },
    ]
    for (const { selector, event } of actions) {
      await wrapper.find(selector).trigger('click')
      expect(header.emitted(event)).toHaveLength(1)
    }

    await wrapper.findAll('.move-btn')[0].trigger('click')
    expect(header.emitted('move-up')).toHaveLength(1)
    await wrapper.findAll('.move-btn')[1].trigger('click')
    expect(header.emitted('move-down')).toHaveLength(1)

    await wrapper.findAll('.dialogue-actions button').at(-1)!.trigger('click')
    expect(header.emitted('add')).toHaveLength(1)

    await wrapper.find('.dlg-select').setValue(true)
    expect(header.emitted('toggle-select')).toHaveLength(1)

    await wrapper.find('.stub-fsm-command').trigger('click')
    expect(header.emitted('set-fsm')).toEqual([['reviewed']])
  })

  it('不额外抛出未声明的事件', async () => {
    const wrapper = mountHeader({ index: 1, total: 3 })
    const header = wrapper.findComponent(DialogueCardHeader)
    await wrapper.find('.directive-btn').trigger('click')
    await wrapper.find('.stub-fsm-command').trigger('click')
    expect(domainEventNames(header.emitted())).toEqual(['open-directive', 'set-fsm'])
  })
})
