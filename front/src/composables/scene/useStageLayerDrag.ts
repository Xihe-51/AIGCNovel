/**
 * 舞台立绘指针拖拽：多选整组位移、网格吸附、按舞台百分比换算后抛出 avatar-group-move。
 *
 * 拖拽期间用独立的 translate 属性做视觉位移，不污染槽位自身的 transform；
 * 松手时统一复位 translate 并把结果交给页面写入剧本。
 */
import type { Ref } from 'vue'

export interface StageLayerMove {
  layerId: string
  x: number
  y: number
}

export interface UseStageLayerDragOptions {
  editable: () => boolean
  canEdit: () => boolean
  gridSnap: () => number
  slots: () => Record<string, { x?: number; y?: number } | null>
  selectedLayerIds: Ref<string[]>
  primaryLayerId: Ref<string | null>
  isSelected: (layerId: string) => boolean
  selectLayer: (layerId: string, multi?: boolean) => void
  syncLocal: () => void
  onGroupMove: (updates: StageLayerMove[]) => void
}

interface DragState {
  layerIds: string[]
  starts: Record<string, { x: number; y: number }>
  startX: number
  startY: number
  dx: number
  dy: number
  unitW: number
  unitH: number
  els: HTMLElement[]
  moved: boolean
}

export const snapToGrid = (value: number, step: number) => {
  const size = Number(step) || 0
  if (size <= 0) return value
  return Math.round(value / size) * size
}

export const clampPercent = (value: number) => Math.max(0, Math.min(100, value))

export const roundPercent = (value: number) => Math.round(value * 10) / 10

export function useStageLayerDrag(options: UseStageLayerDragOptions) {
  let drag: DragState | null = null

  const onDragMove = (e: PointerEvent) => {
    if (!drag) return
    drag.dx = e.clientX - drag.startX
    drag.dy = e.clientY - drag.startY
    if (Math.abs(drag.dx) + Math.abs(drag.dy) > 3) drag.moved = true
    // 用独立的 translate 属性做拖拽位移，不覆盖槽位本身的 transform
    for (const el of drag.els) {
      el.style.translate = `${drag.dx}px ${drag.dy}px`
    }
  }

  const stopDrag = () => {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
    window.removeEventListener('pointercancel', onDragEnd)
  }

  const onDragEnd = () => {
    stopDrag()
    if (!drag) return
    const d = drag
    drag = null
    for (const el of d.els) el.style.translate = ''
    if (!d.moved) return
    const dxPct = d.dx / d.unitW * 100
    const dyPct = d.dy / d.unitH * 100
    // 网格吸附：开启后对齐到 gridStep 的整数倍，便于对齐左右/居中
    const step = options.gridSnap()
    const updates = d.layerIds.map(layerId => {
      const base = d.starts[layerId] || { x: 50, y: 100 }
      return {
        layerId,
        x: roundPercent(clampPercent(snapToGrid(base.x + dxPct, step))),
        y: roundPercent(clampPercent(snapToGrid(base.y + dyPct, step))),
      }
    })
    options.onGroupMove(updates)
  }

  const startDrag = (e: PointerEvent, layerId: string) => {
    if (!options.editable() || !options.canEdit()) return
    const multi = e.ctrlKey || e.metaKey || e.shiftKey
    if (multi) {
      options.selectLayer(layerId, true)
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (!options.isSelected(layerId)) {
      options.selectedLayerIds.value = [layerId]
      options.primaryLayerId.value = layerId
      options.syncLocal()
    }
    const ids = options.selectedLayerIds.value.length ? [...options.selectedLayerIds.value] : [layerId]
    const host = e.currentTarget as HTMLElement | null
    if (!host) return
    const img = host.querySelector('img') as HTMLImageElement | null
    const rect = (img || host).getBoundingClientRect()
    const stage = host.closest('.preview-container') as HTMLElement | null
    const stageRect = stage ? stage.getBoundingClientRect() : null
    const slots = options.slots()
    const starts: Record<string, { x: number; y: number }> = {}
    for (const id of ids) {
      const slot = slots[id]
      if (slot) {
        starts[id] = { x: Number(slot.x) || 0, y: Number(slot.y) || 0 }
      } else if (id === layerId && stageRect && rect.width) {
        // 回退立绘：第一次拖拽时把当前视觉位置换算成舞台坐标
        starts[id] = {
          x: ((rect.left + rect.width / 2 - stageRect.left) / stageRect.width) * 100,
          y: ((rect.bottom - stageRect.top) / stageRect.height) * 100,
        }
      } else {
        starts[id] = { x: 50, y: 100 }
      }
    }
    const els: HTMLElement[] = []
    if (stage) {
      for (const node of Array.from(stage.querySelectorAll('[data-layer-id]')) as HTMLElement[]) {
        if (ids.includes(String(node.dataset.layerId))) els.push(node)
      }
    }
    if (!els.includes(host)) els.push(host)
    drag = {
      layerIds: ids,
      starts,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      unitW: stageRect?.width || rect.width || 1,
      unitH: stageRect?.height || rect.height || 1,
      els,
      moved: false,
    }
    try { host.setPointerCapture?.(e.pointerId) } catch (err) { /* 合成事件没有活动指针，忽略 */ }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
    window.addEventListener('pointercancel', onDragEnd)
    e.preventDefault()
    e.stopPropagation()
  }

  return { startDrag, stopDrag }
}
