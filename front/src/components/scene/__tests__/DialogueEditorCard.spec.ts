import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import DialogueEditorCard from '@/components/scene/DialogueEditorCard.vue'

const STUBS = {
  Plus: true,
  MagicStick: true,
  'el-icon': { template: '<span class="icon"><slot /></span>' },
  'el-button': { inheritAttrs: false, template: '<button v-bind="$attrs"><slot /></button>' },
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
  'el-form': { template: '<div class="stub-form"><slot /></div>' },
  'el-form-item': { template: '<div class="stub-form-item"><slot /></div>' },
  'el-input': { template: '<div class="stub-input"><slot /></div>' },
  'el-select': {
    emits: ['change'],
    template:
      '<div class="stub-select"><span class="stub-select-change" @click="$emit(\'change\', \'next\')">chg</span><slot /></div>',
  },
  'el-option': { template: '<div class="stub-option"><slot /></div>' },
  'el-input-number': { template: '<div class="stub-number"><slot /></div>' },
  'el-radio-group': { template: '<div class="stub-radio-group"><slot /></div>' },
  'el-radio-button': { template: '<div class="stub-radio-button"><slot /></div>' },
  'el-upload': {
    props: ['httpRequest'],
    template:
      '<div class="stub-upload"><slot /><button class="stub-upload-go" @click="httpRequest && httpRequest({ file: \'probe\' })">up</button></div>',
  },
}

const domainEventNames = (emitted: Record<string, any[][]> = {}) =>
  Object.keys(emitted)
    .filter((name) => !emitted[name].every((args) => args[0] instanceof Event))
    .sort()

const CHARACTERS = [{ character_id: 1, name: '林夏' }]
const VARIABLES = [{ variable_id: 1, name: 'favor', label: '好感度' }]

const makeDialogue = (over: Record<string, any> = {}) => ({
  content_id: 11,
  order_num: 1,
  content_type: '对话',
  character_id: 1,
  avatar_id: null,
  content_text: '你好',
  emotion: '',
  translations: {},
  ...over,
})

const makeProps = (over: Record<string, any> = {}) => {
  const dialogue = over.dialogue ?? makeDialogue()
  return {
    dialogue,
    index: 0,
    characters: CHARACTERS,
    variables: VARIABLES,
    dialogues: [dialogue],
    projectNodes: [],
    jumpMap: {},
    effectsMap: {},
    fsmStatesMap: {},
    selected: false,
    focused: false,
    ...over,
  }
}

const Harness = defineComponent({
  props: { cardProps: { type: Object, required: true } },
  setup: (props) => () =>
    h('div', { class: 'harness' }, [h(DialogueEditorCard, props.cardProps as any)]),
})

const mountCard = (over: Record<string, any> = {}) =>
  mount(Harness, {
    props: { cardProps: makeProps(over) },
    global: { stubs: STUBS },
  })

describe('DialogueEditorCard', () => {
  it('卡片壳把头部事件补上 index / dialogue 后抛出', async () => {
    const dialogue = makeDialogue()
    const others = [makeDialogue({ content_id: 12, order_num: 2 }), makeDialogue({ content_id: 13, order_num: 3 })]
    const wrapper = mountCard({ dialogue, dialogues: [dialogue, ...others], index: 1 })
    const card = wrapper.findComponent(DialogueEditorCard)

    await wrapper.find('.directive-btn').trigger('click')
    expect(card.emitted('open-directive')).toEqual([[1]])

    await wrapper.find('.condition-btn').trigger('click')
    expect(card.emitted('open-node-condition')).toEqual([[1]])

    await wrapper.find('.play-btn').trigger('click')
    expect(card.emitted('play')).toEqual([[dialogue]])

    await wrapper.find('.delete-btn').trigger('click')
    expect(card.emitted('delete')).toEqual([[1]])

    await wrapper.findAll('.move-btn')[0].trigger('click')
    expect(card.emitted('move-up')).toEqual([[1]])
    await wrapper.findAll('.move-btn')[1].trigger('click')
    expect(card.emitted('move-down')).toEqual([[1]])

    await wrapper.findAll('.dialogue-actions button').at(-1)!.trigger('click')
    expect(card.emitted('add')).toHaveLength(1)

    await wrapper.find('.stub-fsm-command').trigger('click')
    expect(card.emitted('set-fsm')).toEqual([[{ dialogue, state: 'reviewed' }]])

    await wrapper.find('.dlg-select').setValue(true)
    expect(card.emitted('toggle-select')).toEqual([[1]])

    expect(domainEventNames(card.emitted())).toEqual(
      [
        'add',
        'delete',
        'move-down',
        'move-up',
        'open-directive',
        'open-node-condition',
        'play',
        'select',
        'set-fsm',
        'toggle-select',
      ].sort()
    )
  })

  it('点击卡片任意位置抛出 select，选中与聚焦只是样式差异', async () => {
    const wrapper = mountCard({ index: 2, selected: true, focused: true })
    const card = wrapper.findComponent(DialogueEditorCard)

    const root = wrapper.find('.dialogue-editor-item')
    expect(root.classes()).toContain('is-focused')
    expect(root.attributes('data-content-id')).toBe('11')
    await root.trigger('click')
    expect(card.emitted('select')).toEqual([[2]])

    const unsaved = mountCard({ dialogue: makeDialogue({ content_id: null, order_num: 4 }) })
    expect(unsaved.find('.dialogue-editor-item').attributes('data-content-id')).toBe('')
    expect(unsaved.find('.dialogue-editor-item').classes()).not.toContain('is-focused')
  })

  it('选择项子组件的事件由卡片壳补回 dialogue', async () => {
    const dialogue = makeDialogue({
      content_type: '选择',
      _choices: [
        { choice_text: '接受', target_content_id: 12, path_id: 5, cond_items: [] },
        { choice_text: '拒绝', target_content_id: 13, path_id: 6, cond_items: [] },
      ],
    })
    const wrapper = mountCard({ dialogue })
    const card = wrapper.findComponent(DialogueEditorCard)

    await wrapper.findAll('.choice-row')[0].findAll('button')[1].trigger('click')
    expect(card.emitted('remove-choice')).toEqual([[{ dialogue, optionIndex: 0 }]])

    await wrapper.findAll('.choice-cond-actions button')[1].trigger('click')
    expect(card.emitted('add-choice-condition')).toEqual([[{ dialogue, optionIndex: 1 }]])

    await wrapper.findAll('.choice-row')[1].findAll('button')[0].trigger('click')
    expect(card.emitted('open-choice-translation')).toEqual([[dialogue._choices[1]]])

    await wrapper.findAll('.choice-actions button')[0].trigger('click')
    expect(card.emitted('add-choice')).toEqual([[dialogue]])

    await wrapper.findAll('.choice-actions button')[1].trigger('click')
    expect(card.emitted('save-choices')).toEqual([[{ dialogue, index: 0 }]])
  })

  it('多条件删除由卡片壳补回 dialogue', async () => {
    const dialogue = makeDialogue({
      content_type: '选择',
      _choices: [
        {
          choice_text: 'A',
          path_id: 5,
          cond_items: [
            { variable: 'favor', op: '>=', value: 3 },
            { variable: 'trust', op: '<', value: 1 },
          ],
        },
      ],
    })
    const wrapper = mountCard({ dialogue })
    const card = wrapper.findComponent(DialogueEditorCard)

    await wrapper.findAll('.choice-condition')[1].find('button').trigger('click')
    expect(card.emitted('remove-choice-condition')).toEqual([
      [{ dialogue, optionIndex: 0, conditionIndex: 1 }],
    ])
  })

  it('数值子组件的事件由卡片壳补回 dialogue', async () => {
    const dialogue = makeDialogue()
    const wrapper = mountCard({
      dialogue,
      effectsMap: { '11': [{ variable_id: 1, delta: 2 }, { variable_id: 1, delta: -1 }] },
    })
    const card = wrapper.findComponent(DialogueEditorCard)

    await wrapper.findAll('.effect-row')[1].find('button').trigger('click')
    expect(card.emitted('remove-effect')).toEqual([[{ dialogue, effectIndex: 1 }]])

    await wrapper.findAll('.effect-actions button')[0].trigger('click')
    expect(card.emitted('add-effect')).toEqual([[dialogue]])

    await wrapper.findAll('.effect-actions button')[1].trigger('click')
    expect(card.emitted('save-effects')).toEqual([[dialogue]])
  })

  it('语音上传把 el-upload 回调桥接成 upload-voice 的 Promise', async () => {
    const wrapper = mountCard()
    const card = wrapper.findComponent(DialogueEditorCard)

    await wrapper.find('.stub-upload-go').trigger('click')
    const events = card.emitted('upload-voice') as any[][]
    expect(events).toHaveLength(1)

    const payload = events[0][0]
    expect(payload.index).toBe(0)
    expect(payload.options.file).toBe('probe')
    expect(typeof payload.options.onSuccess).toBe('function')
    expect(typeof payload.options.onError).toBe('function')
  })

  it('自动跳转只在已保存且非选择节点时出现，变更抛出 set-jump', async () => {
    const dialogue = makeDialogue()
    const wrapper = mountCard({ dialogue, jumpMap: { '11': { target_content_id: 12 } } })
    const card = wrapper.findComponent(DialogueEditorCard)

    expect(wrapper.find('.jump-select').exists()).toBe(true)
    await wrapper.find('.jump-select .stub-select-change').trigger('click')
    expect(card.emitted('set-jump')).toEqual([[{ dialogue, target: 'next' }]])

    const unsaved = mountCard({ dialogue: makeDialogue({ content_id: null }) })
    expect(unsaved.find('.jump-select').exists()).toBe(false)

    const choice = mountCard({ dialogue: makeDialogue({ content_type: '选择', _choices: [] }) })
    expect(choice.find('.jump-select').exists()).toBe(false)
  })

  it('类型下拉变更抛出 content-type-change，且不额外抛别的事件', async () => {
    const dialogue = makeDialogue()
    const wrapper = mountCard({ dialogue })
    const card = wrapper.findComponent(DialogueEditorCard)

    await wrapper.findAll('.dialogue-form .stub-select')[0].find('.stub-select-change').trigger('click')
    expect(card.emitted('content-type-change')).toEqual([[dialogue]])
    expect(card.emitted('character-change')).toBeUndefined()
  })
})
