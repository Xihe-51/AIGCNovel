import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerDebugPanel from '@/components/player/PlayerDebugPanel.vue'

const VARIABLES = [
  { variable_id: 1, name: 'trust', label: '信任度', initial_value: 0 },
  { variable_id: 2, name: 'fear', label: '恐惧', initial_value: 5 },
]

const COVERAGE = {
  nodeTotal: 10,
  nodeVisited: 3,
  nodePct: 30,
  edgeTotal: 4,
  edgeVisited: 1,
  edgePct: 25,
}

const mountPanel = (props: Record<string, unknown> = {}) =>
  mount(PlayerDebugPanel, {
    props: {
      sceneIndex: 0,
      sceneCount: 3,
      nodeId: 10,
      jumpId: '',
      variables: VARIABLES,
      variableValues: { trust: 7 },
      breakpoint: { enabled: false, variable: '', op: '>=', value: 0 },
      breakpointHit: '',
      history: [],
      snapshots: [],
      coverage: COVERAGE,
      uncoveredNodes: [],
      uncoveredEdges: [],
      ...props,
    },
  })

describe('PlayerDebugPanel', () => {
  it('渲染当前场次、节点与变量当前值', () => {
    const wrapper = mountPanel({ sceneIndex: 1, sceneCount: 3, nodeId: 12 })
    expect(wrapper.find('.debug-pos').text()).toContain('场景 2/3')
    expect(wrapper.find('.debug-pos').text()).toContain('节点 #12')

    const rows = wrapper.findAll('.debug-var')
    expect(rows).toHaveLength(2)
    expect(rows[0].find('.debug-var-input').element.value).toBe('7')
    expect(rows[1].find('.debug-var-input').element.value).toBe('5')
  })

  it('无变量时展示空态', () => {
    const wrapper = mountPanel({ variables: [] })
    expect(wrapper.findAll('.debug-var')).toHaveLength(0)
    expect(wrapper.find('.debug-vars .debug-empty').text()).toBe('项目还没有变量')
  })

  it('跳转输入与按钮分别上抛 update:jumpId 与 jump', async () => {
    const wrapper = mountPanel()
    await wrapper.find('.debug-jump input').setValue('42')
    await wrapper.find('.debug-jump button').trigger('click')

    expect(wrapper.emitted('update:jumpId')?.[0]).toEqual(['42'])
    expect(wrapper.emitted('jump')).toHaveLength(1)
  })

  it('变量热改上抛 set-var 且带上变量对象', async () => {
    const wrapper = mountPanel()
    await wrapper.findAll('.debug-var-input')[0].setValue('9')

    const payload = wrapper.emitted('set-var')?.[0]
    expect(payload?.[0]).toMatchObject({ name: 'trust' })
    expect(payload?.[1]).toBe('9')
  })

  it('条件断点开关、变量、运算符、阈值都通过 update:breakpoint 合并上抛', async () => {
    const wrapper = mountPanel()
    const applyBreakpoint = async () => {
      const all = wrapper.emitted('update:breakpoint') || []
      if (all.length) await wrapper.setProps({ breakpoint: all[all.length - 1][0] })
    }

    const [toggle] = wrapper.findAll('.debug-section-head button')
    await toggle.trigger('click')
    const first = wrapper.emitted('update:breakpoint')?.[0]?.[0]
    expect(first).toMatchObject({ enabled: true, variable: '', op: '>=', value: 0 })
    await applyBreakpoint()

    await wrapper.find('.debug-break-var').setValue('fear')
    await applyBreakpoint()
    await wrapper.find('.debug-break-op').setValue('<')
    await applyBreakpoint()
    await wrapper.find('.debug-break-value').setValue('3')
    await applyBreakpoint()

    const all = wrapper.emitted('update:breakpoint') || []
    expect(all[all.length - 1][0]).toMatchObject({ enabled: true, variable: 'fear', op: '<', value: 3 })
  })

  it('断点命中提示按 breakpointHit 显示', () => {
    const wrapper = mountPanel({ breakpointHit: '信任度 5 >= 3' })
    expect(wrapper.find('.debug-break-hit').text()).toContain('信任度 5 >= 3')
  })

  it('变量历史最多展示 12 条并支持清空', async () => {
    const history = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      at: `10:0${i}`,
      label: '信任度',
      from: i,
      to: i + 1,
      reason: '手动调试',
    }))
    const wrapper = mountPanel({ history })
    expect(wrapper.findAll('.debug-history-item')).toHaveLength(12)

    await wrapper.findAll('.debug-section')[1].find('button').trigger('click')
    expect(wrapper.emitted('clear-history')).toHaveLength(1)
  })

  it('快照恢复与删除上抛对应事件', async () => {
    const snapshots = [{ id: 's1', time: '10:00:00', node: 10 }]
    const wrapper = mountPanel({ snapshots })
    const item = wrapper.find('.debug-snapshot-item')
    const buttons = item.findAll('button')

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('restore-snapshot')?.[0]?.[0]).toMatchObject({ id: 's1' })
    expect(wrapper.emitted('delete-snapshot')?.[0]).toEqual(['s1'])
  })

  it('覆盖率展示百分比并按比例设置进度条宽度', () => {
    const wrapper = mountPanel()
    const rows = wrapper.findAll('.debug-coverage-row')
    expect(rows[0].text()).toContain('3 / 10')
    expect(rows[1].text()).toContain('1 / 4')

    const bars = wrapper.findAll('.debug-bar-fill')
    expect(bars[0].attributes('style')).toContain('30%')
    expect(bars[1].attributes('style')).toContain('25%')
  })

  it('点击未走到节点上抛 jump-to', async () => {
    const wrapper = mountPanel({
      uncoveredNodes: [{ content_id: 33, scene_title: '走廊', content_text: '脚步声' }],
    })
    await wrapper.find('.debug-uncovered-item').trigger('click')
    expect(wrapper.emitted('jump-to')?.[0]).toEqual([33])
  })

  it('未走分支为自动跳转时展示备用文案', () => {
    const wrapper = mountPanel({
      uncoveredEdges: [{ path_id: 1, source_content_id: 5, target_content_id: 6, choice_text: '' }],
    })
    expect(wrapper.findAll('.debug-uncovered-item')[0].text()).toContain('自动跳转')
    expect(wrapper.findAll('.debug-uncovered-item')[0].text()).toContain('#6')
  })

  it('关闭按钮上抛 close', async () => {
    const wrapper = mountPanel()
    await wrapper.find('.debug-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
