import { describe, expect, it } from 'vitest'
import {
  MAX_SCALE,
  MIN_SCALE,
  NODE_H,
  NODE_W,
  applyNodePositions,
  applyStoredPositions,
  buildRenderEdges,
  buildSceneOptions,
  canvasExtent,
  clampScale,
  computeAutoLayoutPositions,
  computeFitView,
  countVisibleEdges,
  hitTestNode,
  labelOfNode,
  nodeToneClass,
  parseStoredPositions,
  serializeNodePositions,
  snippetText,
  sortNodesByPlayOrder,
  toCanvasPoint,
} from '@/utils/storyGraph'

const node = (overrides: Record<string, any> = {}) => ({
  content_id: 1,
  content_type: '对话',
  content_text: '你好',
  scene_id: 10,
  scene_title: '第一幕',
  scene_order: 1,
  order_num: 1,
  _x: 0,
  _y: 0,
  ...overrides,
})

describe('utils/storyGraph / 展示文本', () => {
  it('空内容显示占位符', () => {
    expect(snippetText('')).toBe('（空内容）')
    expect(snippetText(null)).toBe('（空内容）')
    expect(snippetText(undefined)).toBe('（空内容）')
  })

  it('压缩连续空白', () => {
    expect(snippetText('  你好 \n\n 世界  ')).toBe('你好 世界')
  })

  it('超过长度截断并补省略号', () => {
    expect(snippetText('一二三四五六七八九十', 5)).toBe('一二三四五…')
    expect(snippetText('一二三', 5)).toBe('一二三')
  })

  it('节点类型映射到色调类名', () => {
    expect(nodeToneClass('选择')).toBe('is-choice')
    expect(nodeToneClass('描述')).toBe('is-narration')
    expect(nodeToneClass('对话')).toBe('is-dialogue')
    expect(nodeToneClass(undefined)).toBe('is-dialogue')
  })

  it('labelOfNode 拼出节点标签，缺失时提示已删除', () => {
    const nodes = [node({ content_id: 7 })]
    expect(labelOfNode(nodes, 7)).toBe('#7 对话 · 你好')
    expect(labelOfNode(nodes, 99)).toBe('#99（已删除）')
  })
})

describe('utils/storyGraph / 播放顺序与自动布局', () => {
  const nodes = [
    node({ content_id: 3, scene_id: 20, scene_order: 2, order_num: 1 }),
    node({ content_id: 2, scene_id: 10, scene_order: 1, order_num: 2 }),
    node({ content_id: 1, scene_id: 10, scene_order: 1, order_num: 1 }),
  ]

  it('先按场景顺序、再按场景内顺序排序，且不改动入参', () => {
    const sorted = sortNodesByPlayOrder(nodes)
    expect(sorted.map(n => n.content_id)).toEqual([1, 2, 3])
    expect(nodes.map(n => n.content_id)).toEqual([3, 2, 1])
  })

  it('同场景同顺序时按内容 id 兜底', () => {
    const tie = [node({ content_id: 9 }), node({ content_id: 4 })]
    expect(sortNodesByPlayOrder(tie).map(n => n.content_id)).toEqual([4, 9])
  })

  it('一个场景一列，场景内按行向下排布', () => {
    const positions = computeAutoLayoutPositions(nodes)
    expect(positions).toEqual([
      { content_id: 1, x: 40, y: 40 },
      { content_id: 2, x: 40, y: 134 },
      { content_id: 3, x: 340, y: 40 },
    ])
  })

  it('applyNodePositions 只写回命中的节点', () => {
    const target = [node({ content_id: 1, _x: 0, _y: 0 }), node({ content_id: 2, _x: 5, _y: 5 })]
    applyNodePositions(target, [{ content_id: 1, x: 100, y: 200 }])
    expect([target[0]._x, target[0]._y]).toEqual([100, 200])
    expect([target[1]._x, target[1]._y]).toEqual([5, 5])
  })
})

describe('utils/storyGraph / 本地位置记忆', () => {
  it('parseStoredPositions 容错非法输入', () => {
    expect(parseStoredPositions(null)).toEqual({})
    expect(parseStoredPositions('')).toEqual({})
    expect(parseStoredPositions('not-json')).toEqual({})
    expect(parseStoredPositions('"text"')).toEqual({})
  })

  it('parseStoredPositions 解析合法结构', () => {
    expect(parseStoredPositions('{"3":[10,20]}')).toEqual({ '3': [10, 20] })
  })

  it('applyStoredPositions 套用记忆位置并忽略残缺数据', () => {
    const nodes = [node({ content_id: 1, _x: 0, _y: 0 }), node({ content_id: 2, _x: 0, _y: 0 })]
    applyStoredPositions(nodes, { '1': [50, 60], '2': [1] as any })
    expect([nodes[0]._x, nodes[0]._y]).toEqual([50, 60])
    expect([nodes[1]._x, nodes[1]._y]).toEqual([0, 0])
  })

  it('serializeNodePositions 取整后写出', () => {
    const nodes = [node({ content_id: 1, _x: 10.6, _y: 20.2 })]
    expect(serializeNodePositions(nodes)).toEqual({ '1': [11, 20] })
  })
})

describe('utils/storyGraph / 画布尺寸与缩放', () => {
  it('空图也给出最小画布尺寸', () => {
    expect(canvasExtent([])).toEqual({ width: 1200, height: 720 })
  })

  it('节点越靠后画布越大', () => {
    const extent = canvasExtent([node({ _x: 2000, _y: 1000 })])
    expect(extent.width).toBe(2000 + NODE_W + 220)
    expect(extent.height).toBe(1000 + NODE_H + 200)
  })

  it('clampScale 限制在允许区间并保留两位小数', () => {
    expect(clampScale(10)).toBe(MAX_SCALE)
    expect(clampScale(0.01)).toBe(MIN_SCALE)
    expect(clampScale(1.23456)).toBe(1.23)
  })

  it('computeFitView 无节点或视口为 0 时返回 null', () => {
    expect(computeFitView([], { width: 1200, height: 720 })).toBeNull()
    expect(computeFitView([node()], { width: 0, height: 720 })).toBeNull()
  })

  it('computeFitView 把整组节点居中', () => {
    const view = computeFitView(
      [node({ content_id: 1, _x: 0, _y: 0 }), node({ content_id: 2, _x: 390, _y: 0 })],
      { width: 1200, height: 720 },
    )
    expect(view).not.toBeNull()
    expect(view!.scale).toBe(1.84)
    expect(view!.pan.x).toBeCloseTo(48, 5)
    expect(view!.pan.y).toBeCloseTo(295.6, 5)
  })
})

describe('utils/storyGraph / 命中检测与坐标换算', () => {
  it('命中节点矩形内部，边界算命中', () => {
    const nodes = [node({ content_id: 1, _x: 100, _y: 100 })]
    expect(hitTestNode(nodes, { x: 150, y: 120 })?.content_id).toBe(1)
    expect(hitTestNode(nodes, { x: 100, y: 100 })?.content_id).toBe(1)
    expect(hitTestNode(nodes, { x: 100 + NODE_W, y: 100 + NODE_H })?.content_id).toBe(1)
  })

  it('命中矩形外返回 null', () => {
    const nodes = [node({ content_id: 1, _x: 100, _y: 100 })]
    expect(hitTestNode(nodes, { x: 10, y: 10 })).toBeNull()
    expect(hitTestNode([], { x: 10, y: 10 })).toBeNull()
  })

  it('重叠时后渲染的节点优先', () => {
    const nodes = [
      node({ content_id: 1, _x: 0, _y: 0 }),
      node({ content_id: 2, _x: 10, _y: 10 }),
    ]
    expect(hitTestNode(nodes, { x: 20, y: 20 })?.content_id).toBe(2)
  })

  it('屏幕坐标换算考虑容器偏移、平移与缩放', () => {
    expect(toCanvasPoint(500, 300, { left: 100, top: 50 }, { x: 20, y: 10 }, 2))
      .toEqual({ x: 190, y: 120 })
  })

  it('缺少容器信息时按左上角零点换算', () => {
    expect(toCanvasPoint(40, 60, null, { x: 0, y: 0 }, 1)).toEqual({ x: 40, y: 60 })
  })

  it('缩放为 0 时按 1 处理，避免除零', () => {
    expect(toCanvasPoint(40, 60, null, { x: 0, y: 0 }, 0)).toEqual({ x: 40, y: 60 })
  })
})

describe('utils/storyGraph / 连线渲染', () => {
  const displayNodes = [
    node({ content_id: 1, scene_id: 10, order_num: 1, _x: 0, _y: 0 }),
    node({ content_id: 2, scene_id: 10, order_num: 2, _x: 300, _y: 0 }),
    node({ content_id: 3, scene_id: 20, scene_order: 2, order_num: 1, _x: 600, _y: 0 }),
  ]

  it('分支边带选项文案，顺序边跳过已有分支的源节点', () => {
    const rendered = buildRenderEdges(displayNodes, [
      { path_id: 9, source_content_id: 1, target_content_id: 2, choice_text: '去' },
    ])
    expect(rendered).toHaveLength(2)
    expect(rendered[0]).toMatchObject({ key: 'p9', kind: 'branch', label: '去' })
    expect(rendered[1]).toMatchObject({ key: 's2-3', kind: 'sequence', label: '', edge: null })
  })

  it('缺少选项文案时补占位，条件分支追加菱形标记', () => {
    const rendered = buildRenderEdges(displayNodes, [
      { source_content_id: 1, target_content_id: 2, conditions: { variable: 'love', op: '>=', value: 3 } },
    ])
    expect(rendered[0].key).toBe('p1-2')
    expect(rendered[0].label).toBe('（无选项文案） ◇')
    expect(rendered[0].edge).not.toBeNull()
  })

  it('端点被场景筛选过滤掉的分支不渲染，并退回顺序边', () => {
    const rendered = buildRenderEdges(displayNodes, [
      { path_id: 1, source_content_id: 1, target_content_id: 99, choice_text: 'x' },
    ])
    expect(rendered.map(e => e.kind)).toEqual(['sequence', 'sequence'])
    expect(rendered.map(e => e.key)).toEqual(['s1-2', 's2-3'])
  })

  it('坐标按节点矩形右中与左中计算', () => {
    const [branch] = buildRenderEdges(displayNodes, [
      { path_id: 5, source_content_id: 1, target_content_id: 2, choice_text: 'y' },
    ])
    expect([branch.x1, branch.y1, branch.x2, branch.y2])
      .toEqual([NODE_W, NODE_H / 2, 300, NODE_H / 2])
  })

  it('单节点图没有顺序边', () => {
    expect(buildRenderEdges([displayNodes[0]], [])).toEqual([])
  })
})

describe('utils/storyGraph / 场景筛选', () => {
  const nodes = [
    node({ content_id: 1, scene_id: 10, scene_order: 2, scene_title: '第二幕' }),
    node({ content_id: 2, scene_id: 20, scene_order: 1, scene_title: '第一幕' }),
    node({ content_id: 3, scene_id: 10, scene_order: 2, scene_title: '第二幕' }),
  ]

  it('buildSceneOptions 按场景去重后按幕序排列', () => {
    expect(buildSceneOptions(nodes)).toEqual([
      { scene_id: 20, title: '第一幕', order: 1 },
      { scene_id: 10, title: '第二幕', order: 2 },
    ])
  })

  it('缺少标题时给出兜底文案', () => {
    expect(buildSceneOptions([node({ scene_id: 77, scene_title: '' })]))
      .toEqual([{ scene_id: 77, title: '场景 77', order: 1 }])
  })

  it('countVisibleEdges 未筛选时返回全部，筛选时只统计两端都可见的连线', () => {
    const edges = [
      { source_content_id: 1, target_content_id: 3 },
      { source_content_id: 1, target_content_id: 2 },
    ]
    const visible = [nodes[0], nodes[2]]
    expect(countVisibleEdges(visible, edges, false)).toBe(2)
    expect(countVisibleEdges(visible, edges, true)).toBe(1)
  })
})
