import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DialogueChoiceEditor from '@/components/scene/DialogueChoiceEditor.vue'
import DialogueEffectEditor from '@/components/scene/DialogueEffectEditor.vue'
import { BASE_URL } from '@/utils/request'

const STUBS = {
  Plus: true,
  'el-button': { inheritAttrs: false, template: '<button v-bind="$attrs"><slot /></button>' },
  'el-input': { template: '<div class="stub-input"><slot /></div>' },
  'el-select': { template: '<div class="stub-select"><slot /></div>' },
  'el-option': { template: '<div class="stub-option"><slot /></div>' },
  'el-input-number': { template: '<div class="stub-number"><slot /></div>' },
  'el-radio-group': { template: '<div class="stub-radio-group"><slot /></div>' },
  'el-radio-button': { template: '<div class="stub-radio-button"><slot /></div>' },
  'el-upload': { template: '<div class="stub-upload"><slot /></div>' },
}

const CHARACTERS = [{ character_id: 1, name: '林夏' }]
const VARIABLES = [{ variable_id: 1, name: 'favor', label: '好感度' }]

const makeChoiceDialogue = (over: Record<string, any> = {}) => ({
  content_id: 21,
  order_num: 1,
  content_type: '选择',
  translations: {},
  _choices: [
    { choice_text: '接受', target_content_id: 22, path_id: 5, cond_items: [] },
    { choice_text: '拒绝', target_content_id: 23, path_id: 6, cond_items: [] },
  ],
  ...over,
})

const mountChoice = (over: Record<string, any> = {}) =>
  mount(DialogueChoiceEditor, {
    props: {
      dialogue: makeChoiceDialogue(),
      characters: CHARACTERS,
      variables: VARIABLES,
      choiceTargets: [],
      ...over,
    },
    global: { stubs: STUBS },
  })

describe('DialogueChoiceEditor', () => {
  it('无选项时不渲染选项行，未保存时禁用保存分支并提示先保存', () => {
    const wrapper = mountChoice({
      dialogue: makeChoiceDialogue({ content_id: null, _choices: [] }),
    })
    expect(wrapper.findAll('.choice-item')).toHaveLength(0)
    expect(wrapper.findAll('.choice-actions button')[1].attributes('disabled')).toBeDefined()
    expect(wrapper.find('.choice-hint').text()).toContain('请先点「保存」')
  })

  it('已保存时可用保存分支并提示写入 branch_paths', () => {
    const wrapper = mountChoice()
    expect(wrapper.findAll('.choice-item')).toHaveLength(2)
    expect(wrapper.findAll('.choice-actions button')[1].attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.choice-hint').text()).toContain('branch_paths')
  })

  it('删除选项抛出的序号是当前选项下标', async () => {
    const wrapper = mountChoice()
    const editor = wrapper.findComponent(DialogueChoiceEditor)
    await wrapper.findAll('.choice-item')[1].findAll('.choice-row button')[1].trigger('click')
    expect(editor.emitted('remove-choice')).toEqual([[1]])
  })

  it('添加选项与保存分支各自只抛一个事件', async () => {
    const wrapper = mountChoice()
    const editor = wrapper.findComponent(DialogueChoiceEditor)
    await wrapper.findAll('.choice-actions button')[0].trigger('click')
    expect(editor.emitted('add-choice')).toHaveLength(1)
    await wrapper.findAll('.choice-actions button')[1].trigger('click')
    expect(editor.emitted('save-choices')).toHaveLength(1)
  })

  it('条件超过一条时才显示关系单选与逐条删除', async () => {
    const twoConds = makeChoiceDialogue({
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
    const wrapper = mountChoice({ dialogue: twoConds })
    const editor = wrapper.findComponent(DialogueChoiceEditor)

    expect(wrapper.find('.choice-cond-head').exists()).toBe(true)
    expect(wrapper.findAll('.choice-condition')).toHaveLength(2)
    expect(wrapper.find('.condition-tip').text()).toContain('条件全部成立时显示')

    await wrapper.findAll('.choice-condition')[1].find('button').trigger('click')
    expect(editor.emitted('remove-choice-condition')).toEqual([
      [{ optionIndex: 0, conditionIndex: 1 }],
    ])

    const oneCond = makeChoiceDialogue({
      _choices: [
        { choice_text: 'A', path_id: 5, cond_items: [{ variable: 'favor', op: '>=', value: 3 }] },
      ],
    })
    const single = mountChoice({ dialogue: oneCond })
    expect(single.find('.choice-cond-head').exists()).toBe(false)
    expect(single.find('.choice-condition').findAll('button')).toHaveLength(0)
  })

  it('选项未保存 path_id 时译文按钮禁用，保存后可抛译文事件', async () => {
    const unsaved = mountChoice({
      dialogue: makeChoiceDialogue({ _choices: [{ choice_text: 'A', cond_items: [] }] }),
    })
    expect(unsaved.find('.choice-row button').attributes('disabled')).toBeDefined()

    const wrapper = mountChoice()
    const editor = wrapper.findComponent(DialogueChoiceEditor)
    await wrapper.findAll('.choice-row')[1].findAll('button')[0].trigger('click')
    expect(editor.emitted('open-choice-translation')).toEqual([
      [wrapper.props('dialogue')._choices[1]],
    ])
  })

  it('配图按 BASE_URL 拼接缩略图，清除配图抛 clear-choice-image', async () => {
    const dialogue = makeChoiceDialogue({
      _choices: [{ choice_text: 'A', path_id: 5, image_url: '/uploads/a.png', cond_items: [] }],
    })
    const wrapper = mountChoice({ dialogue })
    const editor = wrapper.findComponent(DialogueChoiceEditor)

    expect(wrapper.find('.choice-image-thumb').attributes('src')).toBe(`${BASE_URL}/uploads/a.png`)
    await wrapper.findAll('.choice-image-row button')[1].trigger('click')
    expect(editor.emitted('clear-choice-image')).toEqual([[dialogue._choices[0]]])
  })
})

const EFFECTS = [
  { variable_id: 1, delta: 2 },
  { variable_id: 1, delta: -1 },
]

const mountEffects = (over: Record<string, any> = {}) =>
  mount(DialogueEffectEditor, {
    props: { effects: EFFECTS, variables: VARIABLES, hasContentId: true, ...over },
    global: { stubs: STUBS },
  })

describe('DialogueEffectEditor', () => {
  it('没有变量时禁用添加并提示先建变量', () => {
    const wrapper = mountEffects({ variables: [] })
    expect(wrapper.findAll('.effect-actions button')[0].attributes('disabled')).toBeDefined()
    expect(wrapper.find('.choice-hint').text()).toContain('先在「项目 → 变量」')
  })

  it('未保存内容时禁用保存并提示先保存', () => {
    const wrapper = mountEffects({ hasContentId: false })
    expect(wrapper.findAll('.effect-actions button')[0].attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('.effect-actions button')[1].attributes('disabled')).toBeDefined()
    expect(wrapper.find('.choice-hint').text()).toContain('请先点「保存」')
  })

  it('按顺序渲染数值行，删除抛出的是该行下标', async () => {
    const wrapper = mountEffects()
    const editor = wrapper.findComponent(DialogueEffectEditor)
    expect(wrapper.findAll('.effect-row')).toHaveLength(2)
    await wrapper.findAll('.effect-row')[1].find('button').trigger('click')
    expect(editor.emitted('remove-effect')).toEqual([[1]])
  })

  it('添加数值与保存数值各自只抛一个事件', async () => {
    const wrapper = mountEffects()
    const editor = wrapper.findComponent(DialogueEffectEditor)
    await wrapper.findAll('.effect-actions button')[0].trigger('click')
    expect(editor.emitted('add-effect')).toHaveLength(1)
    await wrapper.findAll('.effect-actions button')[1].trigger('click')
    expect(editor.emitted('save-effects')).toHaveLength(1)
  })
})
