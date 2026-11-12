import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import {
  FSM_STATES,
  fsmKeyOf,
  parseFsmStates,
  pickFsmState,
  useSceneFsmStates,
} from '@/composables/scene/useSceneFsmStates'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

describe('fsmKeyOf', () => {
  it('已保存的台词用 content_id', () => {
    expect(fsmKeyOf({ content_id: 12, order_num: 3 })).toBe(12)
  })

  it('未保存的台词用 new_<order_num>', () => {
    expect(fsmKeyOf({ order_num: 3 })).toBe('new_3')
  })

  it('空对象也能给出键', () => {
    expect(fsmKeyOf({})).toBe('new_undefined')
  })
})

describe('pickFsmState', () => {
  it('没有记录时回落为草稿', () => {
    expect(pickFsmState({}, { content_id: 1 })).toBe('draft')
    expect(pickFsmState(null, { content_id: 1 })).toBe('draft')
  })

  it('命中记录时返回该状态', () => {
    expect(pickFsmState({ 1: 'reviewed' }, { content_id: 1 })).toBe('reviewed')
  })
})

describe('parseFsmStates', () => {
  it('空值返回空表', () => {
    expect(parseFsmStates(null)).toEqual({})
    expect(parseFsmStates('')).toEqual({})
  })

  it('解析合法 JSON', () => {
    expect(parseFsmStates('{"1":"published"}')).toEqual({ 1: 'published' })
  })

  it('脏数据返回空表而不抛错', () => {
    expect(parseFsmStates('not-json')).toEqual({})
    expect(parseFsmStates('"text"')).toEqual({})
  })
})

describe('useSceneFsmStates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  const createFsm = (sceneId: string | number = '7') => useSceneFsmStates({ sceneId: () => sceneId })

  it('暴露四个可选状态', () => {
    const fsm = createFsm()
    expect(fsm.fsmStates.map(s => s.value)).toEqual(['draft', 'ai_generated', 'reviewed', 'published'])
    expect(FSM_STATES.length).toBe(4)
  })

  it('切换状态后写入本地并按场景隔离', () => {
    const fsm = createFsm('7')
    fsm.setFsmState({ content_id: 5 }, 'reviewed')
    expect(localStorage.getItem('aigc:fsm:7')).toBe('{"5":"reviewed"}')
    expect(ElMessage.success).toHaveBeenCalledWith('状态已切换为：已审核')

    const other = createFsm('8')
    other.loadFsmStates()
    expect(other.getFsmState({ content_id: 5 })).toBe('draft')
  })

  it('加载已存的状态', () => {
    localStorage.setItem('aigc:fsm:7', '{"5":"published"}')
    const fsm = createFsm('7')
    fsm.loadFsmStates()
    expect(fsm.getFsmState({ content_id: 5 })).toBe('published')
  })

  it('本地数据损坏时回落空表', () => {
    localStorage.setItem('aigc:fsm:7', '{{bad')
    const fsm = createFsm('7')
    fsm.loadFsmStates()
    expect(fsm.dialogueFsmStates.value).toEqual({})
  })

  it('未保存的台词用 order_num 记状态', () => {
    const fsm = createFsm('7')
    fsm.setFsmState({ order_num: 2 }, 'ai_generated')
    expect(fsm.getFsmState({ order_num: 2 })).toBe('ai_generated')
    expect(localStorage.getItem('aigc:fsm:7')).toBe('{"new_2":"ai_generated"}')
  })
})
