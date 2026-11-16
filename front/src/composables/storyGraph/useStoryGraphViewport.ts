import { computed, ref } from 'vue'
import type { CanvasPoint, GraphNodeLike } from '@/utils/storyGraph'
import { clampScale, computeFitView, hitTestNode, toCanvasPoint } from '@/utils/storyGraph'

export interface UseStoryGraphViewportOptions {
  /** 画布容器的屏幕矩形（用于屏幕坐标 → 画布坐标） */
  getCanvasRect: () => { left: number; top: number } | null
  /** 画布可视区尺寸（用于适配视图与居中） */
  getViewportSize: () => { width: number; height: number }
  /** 适配视图时参与计算的节点（当前筛选结果） */
  getFitNodes: () => GraphNodeLike[]
  /** 命中检测时参与计算的节点（全部节点） */
  getHitNodes: () => GraphNodeLike[]
}

const ZOOM_STEP = 0.1

/** 画布视图变换：缩放、平移、适配视图与坐标换算 */
export function useStoryGraphViewport(options: UseStoryGraphViewportOptions) {
  const scale = ref(1)
  const pan = ref<CanvasPoint>({ x: 0, y: 0 })

  const innerStyle = computed(() => ({
    transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${scale.value})`,
    transformOrigin: '0 0',
  }))

  const resetView = () => {
    scale.value = 1
    pan.value = { x: 0, y: 0 }
  }

  const zoom = (delta: number) => {
    scale.value = clampScale(scale.value + delta)
  }

  const onWheel = (e: WheelEvent) => {
    zoom(e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)
  }

  const zoomToFit = () => {
    const view = computeFitView(options.getFitNodes(), options.getViewportSize())
    if (!view) return
    scale.value = view.scale
    pan.value = view.pan
  }

  const centerOn = (point: CanvasPoint) => {
    const { width, height } = options.getViewportSize()
    if (!width || !height) return
    pan.value = {
      x: width / 2 - point.x * scale.value,
      y: height / 2 - point.y * scale.value,
    }
  }

  const toCanvas = (clientX: number, clientY: number) =>
    toCanvasPoint(clientX, clientY, options.getCanvasRect(), pan.value, scale.value)

  const hitTest = (point: CanvasPoint) => hitTestNode(options.getHitNodes(), point)

  return {
    scale,
    pan,
    innerStyle,
    resetView,
    zoom,
    onWheel,
    zoomToFit,
    centerOn,
    toCanvas,
    hitTest,
  }
}

export type StoryGraphViewport = ReturnType<typeof useStoryGraphViewport>
