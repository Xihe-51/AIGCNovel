/**
 * 舞台图层模型：选中态、属性条（缩放/透明度/旋转）、图层列表与图层列表拖拽排序。
 *
 * 依赖全部通过 getter 注入，写操作只抛领域回调（显隐 / 变换 / 替换素材 / 换序），
 * 不直接改剧本数据，方便预览组件在只读场景下复用。
 */
import { computed, ref, watch } from 'vue'
import { isImageAssetUrl, readAssetDropPayload } from './useStageAssetDrop'
import type { StageAssetPayload } from './useStageAssetDrop'

export interface StageSlot {
  src: string
  style?: Record<string, any>
  boxStyle?: Record<string, any>
  coord?: 'stage' | 'sprite'
  visible?: boolean
  order?: number
  x?: number
  y?: number
  scale?: number
  opacity?: number
  rotate?: number
  layer_id: string
  layer_name?: string
  character_id?: number | null
  avatar_id?: number | null
  /** 基础图 + 差分层叠加图（按 order 从小到大） */
  sources?: string[]
}

export interface StageLayerInfo {
  layer_id: string
  label: string
  exists: boolean
  visible: boolean
  order: number
}

export interface StageLayerItem {
  key: string
  label: string
  exists: boolean
  selectable: boolean
  isAvatar: boolean
  visible: boolean
  order: number
  stateLabel: string
}

export interface StageTransformPayload {
  layerId: string
  scale?: number
  opacity?: number
  rotate?: number
  x?: number
  y?: number
  reset?: boolean
}

export interface UseStageLayersOptions {
  slots: () => Record<string, StageSlot | null>
  avatarLayers: () => StageLayerInfo[]
  maxLayers: () => number
  editable: () => boolean
  canEdit: () => boolean
  stageVisibility: () => Record<string, boolean>
  bgAvailable: () => boolean
  fgAvailable: () => boolean
  dialogueCount: () => number
  dialogueKey: () => string | number | null
  onStageVisibility: (layerKey: string, visible: boolean) => void
  onTransform: (payload: StageTransformPayload) => void
  onReplaceAsset: (layerId: string, payload: StageAssetPayload) => void
  onReorder: (from: string, to: string) => void
}

export function useStageLayers(options: UseStageLayersOptions) {
  const selectedLayerIds = ref<string[]>([])
  const primaryLayerId = ref<string | null>(null)
  const localScale = ref(1)
  const localOpacity = ref(1)
  const localRotate = ref(0)

  const selectedSlot = computed(() => (primaryLayerId.value ? options.slots()[primaryLayerId.value] : null))
  const isSelected = (layerId: string) => selectedLayerIds.value.includes(layerId)
  const layerLimitReached = computed(() => options.avatarLayers().length >= options.maxLayers())
  const layerLabel = (id: string) => options.slots()[id]?.layer_name
    || options.avatarLayers().find(l => l.layer_id === id)?.label
    || id

  // 舞台渲染顺序：order 越小越靠后，选中图层临时提到最上
  const renderedLayers = computed<StageSlot[]>(() => (Object.values(options.slots()) as (StageSlot | null)[])
    .filter((slot): slot is StageSlot => !!slot)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)))

  const syncLocal = () => {
    const slot = selectedSlot.value
    localScale.value = Number(slot?.scale) || 1
    localOpacity.value = slot?.opacity === undefined || slot?.opacity === null ? 1 : Number(slot.opacity)
    localRotate.value = Number(slot?.rotate) || 0
  }

  const clearSelection = () => {
    selectedLayerIds.value = []
    primaryLayerId.value = null
  }

  const selectLayer = (layerId: string, multi = false) => {
    if (!options.editable() || !options.canEdit()) return
    if (multi) {
      const next = new Set(selectedLayerIds.value)
      if (next.has(layerId)) next.delete(layerId)
      else next.add(layerId)
      selectedLayerIds.value = [...next]
      primaryLayerId.value = next.has(layerId)
        ? layerId
        : (selectedLayerIds.value[selectedLayerIds.value.length - 1] || null)
    } else {
      selectedLayerIds.value = [layerId]
      primaryLayerId.value = layerId
    }
    syncLocal()
  }

  const applyTransform = () => {
    if (!primaryLayerId.value) return
    options.onTransform({
      layerId: primaryLayerId.value,
      scale: Number(localScale.value) || 1,
      opacity: localOpacity.value === undefined || localOpacity.value === null ? 1 : Number(localOpacity.value),
      rotate: Number(localRotate.value) || 0,
    })
  }

  const resetTransform = () => {
    if (!primaryLayerId.value) return
    localScale.value = 1
    localOpacity.value = 1
    localRotate.value = 0
    options.onTransform({
      layerId: primaryLayerId.value,
      scale: 1,
      opacity: 1,
      rotate: 0,
      reset: true,
    })
  }

  watch(selectedSlot, () => { if (primaryLayerId.value) syncLocal() }, { deep: true })
  watch(() => options.editable(), (v) => { if (!v) clearSelection() })
  watch(() => options.dialogueKey(), () => { clearSelection() })

  const slotBoxStyle = (layerId: string) => {
    const base = options.slots()[layerId]?.boxStyle || {}
    // 选中层临时提到最上，方便拖动被遮挡的立绘
    return isSelected(layerId) ? { ...base, zIndex: 60 } : base
  }

  const layerItems = computed<StageLayerItem[]>(() => {
    const item = (
      key: string,
      label: string,
      exists: boolean,
      selectable: boolean,
      isAvatar = false,
      visible = options.stageVisibility()[key] !== false,
      order = 0
    ): StageLayerItem => ({
      key,
      label,
      exists,
      selectable,
      isAvatar,
      visible,
      order,
      stateLabel: !exists
        ? '空'
        : !visible
          ? '已隐藏'
          : (isAvatar ? `层级 ${order}` : '已设置'),
    })
    const avatarItems = options.avatarLayers()
      .slice()
      .sort((a, b) => b.order - a.order)
      .map(l => item(l.layer_id, l.label, l.exists, true, true, l.visible, l.order))
    return [
      item('background', '背景', options.bgAvailable(), true),
      ...avatarItems,
      item('foreground', '前景', options.fgAvailable(), true),
      item('dialogue', '对话框', options.dialogueCount() > 0, true),
    ]
  })

  const onLayerClick = (e: MouseEvent, layer: StageLayerItem) => {
    if (!layer.selectable) return
    if (!layer.isAvatar) {
      // 背景/前景/对话框：点击切换显隐
      options.onStageVisibility(layer.key, !layer.visible)
      return
    }
    if (layer.exists) selectLayer(layer.key, e.ctrlKey || e.metaKey || e.shiftKey)
  }

  // 图层列表拖拽排序：把源图层拖到目标图层的位置，交换两者层级
  const dragLayerKey = ref<string | null>(null)
  const dragOverKey = ref<string | null>(null)

  const onLayerDragStart = (e: DragEvent, layer: StageLayerItem) => {
    if (!layer.isAvatar || !layer.exists) { e.preventDefault(); return }
    dragLayerKey.value = layer.key
    e.dataTransfer?.setData('text/plain', layer.key)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  const onLayerDragOver = (_e: DragEvent, layer: StageLayerItem) => {
    if (!dragLayerKey.value || !layer.isAvatar || !layer.exists) return
    if (layer.key !== dragLayerKey.value) dragOverKey.value = layer.key
  }

  const onLayerDrop = (ev: DragEvent, layer: StageLayerItem) => {
    // 素材图片落到已有立绘层 → 替换该层图片
    const asset = readAssetDropPayload(ev)
    if (asset && isImageAssetUrl(asset.url) && layer.isAvatar && layer.exists) {
      ev.stopPropagation()
      dragLayerKey.value = null
      dragOverKey.value = null
      options.onReplaceAsset(layer.key, asset)
      return
    }
    const from = dragLayerKey.value
    const to = layer.key
    dragLayerKey.value = null
    dragOverKey.value = null
    if (!from || !to || from === to || !layer.isAvatar || !layer.exists) return
    options.onReorder(from, to)
  }

  const onLayerDragEnd = () => {
    dragLayerKey.value = null
    dragOverKey.value = null
  }

  return {
    selectedLayerIds,
    primaryLayerId,
    localScale,
    localOpacity,
    localRotate,
    selectedSlot,
    isSelected,
    layerLimitReached,
    layerLabel,
    renderedLayers,
    syncLocal,
    clearSelection,
    selectLayer,
    applyTransform,
    resetTransform,
    slotBoxStyle,
    layerItems,
    onLayerClick,
    dragLayerKey,
    dragOverKey,
    onLayerDragStart,
    onLayerDragOver,
    onLayerDrop,
    onLayerDragEnd,
  }
}
