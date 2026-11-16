import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useStoryGraphViewport } from '@/composables/storyGraph/useStoryGraphViewport'
import { MAX_SCALE, MIN_SCALE } from '@/utils/storyGraph'
import type { GraphNodeLike } from '@/utils/storyGraph'

function setup(nodes: GraphNodeLike[] = [
  { content_id: 1, scene_id: 1, _x: 0, _y: 0 },
  { content_id: 2, scene_id: 1, _x: 300, _y: 0 },
]) {
  const fitNodes = ref(nodes)
  let rect: { left: number; top: number } | null = { left: 100, top: 50 }
  const viewport = useStoryGraphViewport({
    getCanvasRect: () => rect,
    getViewportSize: () => ({ width: 800, height: 600 }),
    getFitNodes: () => fitNodes.value,
    getHitNodes: () => fitNodes.value,
  })
  return {
    viewport,
    fitNodes,
    setRect: (value: { left: number; top: number } | null) => {
      rect = value
    },
  }
}

describe('useStoryGraphViewport / 初始与样式', () => {
  it('初始 100% 且没有平移', () => {
    const { viewport } = setup()
    expect(viewport.scale.value).toBe(1)
    expect(viewport.pan.value).toEqual({ x: 0, y: 0 })
    expect(viewport.innerStyle.value).toEqual({
      transform: 'translate(0px, 0px) scale(1)',
      transformOrigin: '0 0',
    })
  })

  it('resetView 回到 100%', () => {
    const { viewport } = setup()
    viewport.zoom(0.5)
    viewport.pan.value = { x: 120, y: -40 }
    viewport.resetView()
    expect(viewport.scale.value).toBe(1)
    expect(viewport.pan.value).toEqual({ x: 0, y: 0 })
  })
})

describe('useStoryGraphViewport / 缩放', () => {
  it('zoom 夹取在 MIN_SCALE ~ MAX_SCALE', () => {
    const { viewport } = setup()
    viewport.zoom(5)
    expect(viewport.scale.value).toBe(MAX_SCALE)
    viewport.zoom(-50)
    expect(viewport.scale.value).toBe(MIN_SCALE)
  })

  it('onWheel 向下滚动缩小、向上滚动放大，步长 0.1', () => {
    const { viewport } = setup()
    viewport.onWheel({ deltaY: 1 } as WheelEvent)
    expect(viewport.scale.value).toBe(0.9)
    viewport.onWheel({ deltaY: -1 } as WheelEvent)
    viewport.onWheel({ deltaY: -1 } as WheelEvent)
    expect(viewport.scale.value).toBe(1.1)
  })

  it('缩放不会累计出小数尾巴', () => {
    const { viewport } = setup()
    for (let i = 0; i < 3; i++) viewport.zoom(0.1)
    expect(viewport.scale.value).toBe(1.3)
  })
})

describe('useStoryGraphViewport / 适配视图', () => {
  it('按节点包围盒缩放并居中', () => {
    const { viewport } = setup()
    viewport.zoomToFit()
    expect(viewport.scale.value).toBeCloseTo(1.38, 2)
    expect(viewport.pan.value.x).toBeCloseTo(48.1, 1)
    expect(viewport.pan.value.y).toBeCloseTo(251.7, 1)
  })

  it('没有节点时保持原状', () => {
    const { viewport, fitNodes } = setup([])
    fitNodes.value = []
    viewport.zoomToFit()
    expect(viewport.scale.value).toBe(1)
    expect(viewport.pan.value).toEqual({ x: 0, y: 0 })
  })
})

describe('useStoryGraphViewport / 坐标换算', () => {
  it('centerOn 把目标点移到视口中心', () => {
    const { viewport } = setup()
    viewport.centerOn({ x: 100, y: 200 })
    expect(viewport.pan.value).toEqual({ x: 300, y: 100 })
  })

  it('centerOn 在没有尺寸时不动', () => {
    const { viewport } = setup()
    const size = { width: 0, height: 0 }
    const zero = useStoryGraphViewport({
      getCanvasRect: () => null,
      getViewportSize: () => size,
      getFitNodes: () => [],
      getHitNodes: () => [],
    })
    zero.centerOn({ x: 100, y: 200 })
    expect(zero.pan.value).toEqual({ x: 0, y: 0 })
    expect(viewport.pan.value).toEqual({ x: 0, y: 0 })
  })

  it('toCanvas 扣掉容器偏移与平移，并按缩放还原', () => {
    const { viewport } = setup()
    expect(viewport.toCanvas(300, 250)).toEqual({ x: 200, y: 200 })
    viewport.pan.value = { x: 100, y: 100 }
    viewport.zoom(1)
    expect(viewport.toCanvas(300, 250)).toEqual({ x: 50, y: 50 })
  })

  it('容器矩形缺失时按原点计算', () => {
    const { viewport, setRect } = setup()
    setRect(null)
    expect(viewport.toCanvas(30, 40)).toEqual({ x: 30, y: 40 })
  })

  it('hitTest 只命中节点矩形内', () => {
    const { viewport } = setup()
    expect(viewport.hitTest({ x: 10, y: 10 })?.content_id).toBe(1)
    expect(viewport.hitTest({ x: 320, y: 10 })?.content_id).toBe(2)
    expect(viewport.hitTest({ x: 700, y: 500 })).toBeNull()
  })
})
