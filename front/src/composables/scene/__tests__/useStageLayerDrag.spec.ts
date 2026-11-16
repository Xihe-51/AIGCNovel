import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  clampPercent,
  roundPercent,
  snapToGrid,
  useStageLayerDrag,
} from '@/composables/scene/useStageLayerDrag'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

interface HostOptions {
  layerId?: string
  layerIds?: string[]
  stageRect?: Rect
  rect?: Rect
}

function setup(initialSlots: Record<string, any> = {}) {
  const editable = ref(true)
  const canEdit = ref(true)
  const gridSnap = ref(0)
  const slots = ref<Record<string, any>>(initialSlots)
  const selectedLayerIds = ref<string[]>([])
  const primaryLayerId = ref<string | null>(null)
  const syncLocal = vi.fn()
  const selectLayer = vi.fn((layerId: string, multi?: boolean) => {
    if (multi) {
      if (!selectedLayerIds.value.includes(layerId)) selectedLayerIds.value = [...selectedLayerIds.value, layerId]
      return
    }
    selectedLayerIds.value = [layerId]
    primaryLayerId.value = layerId
  })
  const onGroupMove = vi.fn()

  const drag = useStageLayerDrag({
    editable: () => editable.value,
    canEdit: () => canEdit.value,
    gridSnap: () => gridSnap.value,
    slots: () => slots.value,
    selectedLayerIds,
    primaryLayerId,
    isSelected: (layerId: string) => selectedLayerIds.value.includes(layerId),
    selectLayer,
    syncLocal,
    onGroupMove,
  })

  return {
    drag,
    editable,
    canEdit,
    gridSnap,
    slots,
    selectedLayerIds,
    primaryLayerId,
    syncLocal,
    selectLayer,
    onGroupMove,
  }
}

function rectOf(rect: Rect) {
  return {
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect
}

function buildHost(options: HostOptions = {}) {
  const rect = rectOf(options.rect || { left: 100, top: 50, width: 80, height: 120 })
  const stage = document.createElement('div')
  stage.className = 'preview-container'
  stage.getBoundingClientRect = () => rectOf(options.stageRect || { left: 0, top: 0, width: 400, height: 200 })
  const nodes: Record<string, HTMLElement> = {}
  for (const id of options.layerIds || []) {
    const node = document.createElement('div')
    node.setAttribute('data-layer-id', id)
    stage.appendChild(node)
    nodes[id] = node
  }
  const host = document.createElement('div')
  const layerId = options.layerId || 'l1'
  host.setAttribute('data-layer-id', layerId)
  host.getBoundingClientRect = () => rect
  stage.appendChild(host)
  nodes[layerId] = host
  document.body.appendChild(stage)
  return { stage, host, nodes }
}

function buildDetachedHost(rect: Rect = { left: 0, top: 0, width: 80, height: 120 }) {
  const host = document.createElement('div')
  host.setAttribute('data-layer-id', 'l1')
  host.getBoundingClientRect = () => rectOf(rect)
  document.body.appendChild(host)
  return host
}

function pointerEvent(init: { currentTarget?: Element | null; ctrlKey?: boolean } = {}) {
  return {
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: false,
    shiftKey: false,
    currentTarget: init.currentTarget ?? null,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent
}

function fireMove(dx: number, dy: number) {
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: dx, clientY: dy }))
}

function fireEnd() {
  window.dispatchEvent(new MouseEvent('pointerup'))
}

let current: ReturnType<typeof useStageLayerDrag> | null = null

beforeEach(() => {
  current?.stopDrag()
  current = null
})

afterEach(() => {
  current?.stopDrag()
  current = null
})

describe('网格吸附与百分比换算', () => {
  it('步长为 0 时原样返回，避免除零', () => {
    expect(snapToGrid(12.34, 0)).toBe(12.34)
  })

  it('步长为负数或非法值时原样返回', () => {
    expect(snapToGrid(12.34, -5)).toBe(12.34)
    expect(snapToGrid(12.34, Number.NaN)).toBe(12.34)
  })

  it('按步长对齐到最近的整数倍', () => {
    expect(snapToGrid(47.3, 5)).toBe(45)
    expect(snapToGrid(48, 5)).toBe(50)
    expect(snapToGrid(-3, 5)).toBe(-5)
  })

  it('把百分比夹紧到 0~100', () => {
    expect(clampPercent(-8)).toBe(0)
    expect(clampPercent(105)).toBe(100)
    expect(clampPercent(42.6)).toBe(42.6)
  })

  it('结果保留一位小数', () => {
    expect(roundPercent(13.249)).toBe(13.2)
    expect(roundPercent(28.5)).toBe(28.5)
    expect(roundPercent(99.99)).toBe(100)
  })
})

describe('startDrag 启动条件', () => {
  it('非编辑态不启动拖拽', () => {
    const ctx = setup()
    ctx.editable.value = false
    const { host } = buildHost()
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    expect(ctx.selectLayer).not.toHaveBeenCalled()
    fireMove(40, 20)
    fireEnd()
    expect(ctx.onGroupMove).not.toHaveBeenCalled()
  })

  it('无编辑权限时不启动拖拽', () => {
    const ctx = setup()
    ctx.canEdit.value = false
    const { host } = buildHost()
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    expect(ctx.selectLayer).not.toHaveBeenCalled()
    fireEnd()
    expect(ctx.onGroupMove).not.toHaveBeenCalled()
  })

  it('按住修饰键时只切换选中，不进入拖拽', () => {
    const ctx = setup()
    const { host } = buildHost()
    const ev = pointerEvent({ currentTarget: host, ctrlKey: true })
    ctx.drag.startDrag(ev, 'l1')
    expect(ctx.selectLayer).toHaveBeenCalledWith('l1', true)
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(ev.stopPropagation).toHaveBeenCalled()
    expect(ctx.syncLocal).not.toHaveBeenCalled()
    fireEnd()
    expect(ctx.onGroupMove).not.toHaveBeenCalled()
  })

  it('拖拽未选中的图层时先补选中并同步属性条', () => {
    const ctx = setup({ l1: { x: 10, y: 20 } })
    const { host } = buildHost()
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    expect(ctx.selectedLayerIds.value).toEqual(['l1'])
    expect(ctx.primaryLayerId.value).toBe('l1')
    expect(ctx.syncLocal).toHaveBeenCalledTimes(1)
  })

  it('拖拽已选中的图层时不重复同步属性条', () => {
    const ctx = setup({ l1: { x: 10, y: 20 } })
    ctx.selectedLayerIds.value = ['l1']
    ctx.primaryLayerId.value = 'l1'
    const { host } = buildHost()
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    expect(ctx.syncLocal).not.toHaveBeenCalled()
    expect(ctx.selectedLayerIds.value).toEqual(['l1'])
  })

  it('事件缺少 currentTarget 时只补选中，不残留监听', () => {
    const ctx = setup({ l1: { x: 10, y: 20 } })
    ctx.drag.startDrag(pointerEvent({ currentTarget: null }), 'l1')
    expect(ctx.selectedLayerIds.value).toEqual(['l1'])
    fireMove(40, 20)
    fireEnd()
    expect(ctx.onGroupMove).not.toHaveBeenCalled()
  })
})

describe('startDrag 起点坐标', () => {
  it('槽位已有坐标时直接作为起点', () => {
    const ctx = setup({ l1: { x: 0, y: 0 } })
    const { host } = buildHost()
    ctx.selectedLayerIds.value = ['l1']
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    fireMove(40, 20)
    fireEnd()
    expect(ctx.onGroupMove).toHaveBeenCalledWith([{ layerId: 'l1', x: 10, y: 10 }])
  })

  it('回退立绘按当前视觉位置换算舞台坐标', () => {
    const ctx = setup()
    const { host } = buildHost({
      rect: { left: 180, top: 60, width: 40, height: 100 },
      stageRect: { left: 100, top: 20, width: 400, height: 200 },
    })
    ctx.selectedLayerIds.value = ['l1']
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    fireMove(40, 20)
    fireEnd()
    expect(ctx.onGroupMove).toHaveBeenCalledWith([{ layerId: 'l1', x: 35, y: 80 }])
  })

  it('既无槽位也无舞台时回落到舞台中心底部', () => {
    const ctx = setup()
    const host = buildDetachedHost()
    ctx.selectedLayerIds.value = ['l1']
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    fireMove(8, -4)
    fireEnd()
    expect(ctx.onGroupMove).toHaveBeenCalledWith([{ layerId: 'l1', x: 60, y: 96.7 }])
  })
})

describe('拖拽移动与落点', () => {
  it('位移不足 3px 视为点击，不抛出位移事件', () => {
    const ctx = setup({ l1: { x: 10, y: 20 } })
    const { host } = buildHost()
    ctx.selectedLayerIds.value = ['l1']
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    fireMove(1, 1)
    fireEnd()
    expect(ctx.onGroupMove).not.toHaveBeenCalled()
    expect(host.style.translate).toBe('')
  })

  it('按舞台尺寸把像素位移换算成百分比', () => {
    const ctx = setup({ l1: { x: 10, y: 20 } })
    const { host } = buildHost()
    ctx.selectedLayerIds.value = ['l1']
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    fireMove(40, 20)
    fireEnd()
    expect(ctx.onGroupMove).toHaveBeenCalledWith([{ layerId: 'l1', x: 20, y: 30 }])
  })

  it('关闭网格吸附时保留一位小数', () => {
    const ctx = setup({ l1: { x: 10, y: 20 } })
    const { host } = buildHost()
    ctx.selectedLayerIds.value = ['l1']
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    fireMove(13, 17)
    fireEnd()
    expect(ctx.onGroupMove).toHaveBeenCalledWith([{ layerId: 'l1', x: 13.3, y: 28.5 }])
  })

  it('开启网格吸附时落点对齐到网格', () => {
    const ctx = setup({ l1: { x: 10, y: 20 } })
    ctx.gridSnap.value = 5
    const { host } = buildHost()
    ctx.selectedLayerIds.value = ['l1']
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    fireMove(13, 17)
    fireEnd()
    expect(ctx.onGroupMove).toHaveBeenCalledWith([{ layerId: 'l1', x: 15, y: 30 }])
  })

  it('落点超出舞台时夹紧到 0~100', () => {
    const ctx = setup({ l1: { x: 95, y: 2 } })
    const { host } = buildHost()
    ctx.selectedLayerIds.value = ['l1']
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    fireMove(40, -20)
    fireEnd()
    expect(ctx.onGroupMove).toHaveBeenCalledWith([{ layerId: 'l1', x: 100, y: 0 }])
  })

  it('多选时整组一起位移', () => {
    const ctx = setup({ l1: { x: 10, y: 20 }, l2: { x: 30, y: 40 } })
    ctx.selectedLayerIds.value = ['l1', 'l2']
    ctx.primaryLayerId.value = 'l1'
    const { host } = buildHost({ layerId: 'l1', layerIds: ['l2'] })
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    fireMove(40, 20)
    fireEnd()
    expect(ctx.onGroupMove).toHaveBeenCalledWith([
      { layerId: 'l1', x: 20, y: 30 },
      { layerId: 'l2', x: 40, y: 50 },
    ])
  })

  it('拖拽期间用 translate 位移，松手后复位', () => {
    const ctx = setup({ l1: { x: 10, y: 20 }, l2: { x: 30, y: 40 } })
    ctx.selectedLayerIds.value = ['l1', 'l2']
    ctx.primaryLayerId.value = 'l1'
    const { host, nodes } = buildHost({ layerId: 'l1', layerIds: ['l2'] })
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    fireMove(40, 20)
    expect(nodes.l1.style.translate).toBe('40px 20px')
    expect(nodes.l2.style.translate).toBe('40px 20px')
    fireEnd()
    expect(nodes.l1.style.translate).toBe('')
    expect(nodes.l2.style.translate).toBe('')
  })
})

describe('stopDrag 清理', () => {
  it('stopDrag 可重复调用且移除监听', () => {
    const ctx = setup({ l1: { x: 10, y: 20 } })
    const { host } = buildHost()
    ctx.selectedLayerIds.value = ['l1']
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    ctx.drag.stopDrag()
    ctx.drag.stopDrag()
    fireMove(40, 20)
    fireEnd()
    expect(ctx.onGroupMove).not.toHaveBeenCalled()
    expect(host.style.translate).toBe('')
  })

  it('松手后再次 pointerup 不重复抛出位移', () => {
    const ctx = setup({ l1: { x: 10, y: 20 } })
    const { host } = buildHost()
    ctx.selectedLayerIds.value = ['l1']
    current = ctx.drag
    ctx.drag.startDrag(pointerEvent({ currentTarget: host }), 'l1')
    fireMove(40, 20)
    fireEnd()
    fireEnd()
    expect(ctx.onGroupMove).toHaveBeenCalledTimes(1)
  })
})
