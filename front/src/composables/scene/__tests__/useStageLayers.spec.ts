import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useStageLayers } from '@/composables/scene/useStageLayers'
import type { StageLayerItem } from '@/composables/scene/useStageLayers'

function setup() {
  const slots = ref<Record<string, any>>({
    l1: { layer_id: 'l1', src: '/l1.png', layer_name: '立绘一', x: 10, y: 20, scale: 1.5, opacity: 0.5, rotate: 10, order: 1, boxStyle: { left: '10%' } },
    l2: { layer_id: 'l2', src: '/l2.png', x: 30, y: 40, order: 2 },
  })
  const avatarLayers = ref([
    { layer_id: 'l1', label: '立绘一', exists: true, visible: true, order: 1 },
    { layer_id: 'l2', label: '立绘二', exists: true, visible: false, order: 2 },
  ])
  const maxLayers = ref(8)
  const editable = ref(true)
  const canEdit = ref(true)
  const stageVisibility = ref<Record<string, boolean>>({ background: true, foreground: true, dialogue: true })
  const bgAvailable = ref(true)
  const fgAvailable = ref(false)
  const dialogueCount = ref(3)
  const dialogueKey = ref<string | number | null>('d1')
  const onStageVisibility = vi.fn()
  const onTransform = vi.fn()
  const onReplaceAsset = vi.fn()
  const onReorder = vi.fn()

  const layers = useStageLayers({
    slots: () => slots.value,
    avatarLayers: () => avatarLayers.value,
    maxLayers: () => maxLayers.value,
    editable: () => editable.value,
    canEdit: () => canEdit.value,
    stageVisibility: () => stageVisibility.value,
    bgAvailable: () => bgAvailable.value,
    fgAvailable: () => fgAvailable.value,
    dialogueCount: () => dialogueCount.value,
    dialogueKey: () => dialogueKey.value,
    onStageVisibility,
    onTransform,
    onReplaceAsset,
    onReorder,
  })

  return {
    layers,
    slots,
    avatarLayers,
    maxLayers,
    editable,
    canEdit,
    dialogueCount,
    dialogueKey,
    onStageVisibility,
    onTransform,
    onReplaceAsset,
    onReorder,
  }
}

function layerDrag(data?: Record<string, string>) {
  const store: Record<string, string> = {}
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      effectAllowed: '',
      setData: (type: string, value: string) => { store[type] = value },
      getData: (type: string) => data?.[type] ?? store[type] ?? '',
    },
  } as unknown as DragEvent
}

function item(partial: Partial<StageLayerItem>): StageLayerItem {
  return {
    key: 'l1',
    label: '立绘一',
    exists: true,
    selectable: true,
    isAvatar: true,
    visible: true,
    order: 1,
    stateLabel: '层级 1',
    ...partial,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useStageLayers 选中与属性条', () => {
  it('单选后同步该图层的缩放/透明度/旋转', () => {
    const { layers } = setup()
    layers.selectLayer('l1')
    expect(layers.selectedLayerIds.value).toEqual(['l1'])
    expect(layers.primaryLayerId.value).toBe('l1')
    expect(layers.localScale.value).toBe(1.5)
    expect(layers.localOpacity.value).toBe(0.5)
    expect(layers.localRotate.value).toBe(10)
  })

  it('缺少变换字段时回落到默认值', () => {
    const { layers } = setup()
    layers.selectLayer('l2')
    expect(layers.localScale.value).toBe(1)
    expect(layers.localOpacity.value).toBe(1)
    expect(layers.localRotate.value).toBe(0)
  })

  it('未进入编辑态或没有权限时不选中', () => {
    const { layers, editable, canEdit } = setup()
    editable.value = false
    layers.selectLayer('l1')
    expect(layers.selectedLayerIds.value).toEqual([])
    editable.value = true
    canEdit.value = false
    layers.selectLayer('l1')
    expect(layers.selectedLayerIds.value).toEqual([])
  })

  it('多选在 Set 上切换，取消后主选中回落到末项', () => {
    const { layers } = setup()
    layers.selectLayer('l1')
    layers.selectLayer('l2', true)
    expect(layers.selectedLayerIds.value).toEqual(['l1', 'l2'])
    expect(layers.primaryLayerId.value).toBe('l2')
    layers.selectLayer('l2', true)
    expect(layers.selectedLayerIds.value).toEqual(['l1'])
    expect(layers.primaryLayerId.value).toBe('l1')
    layers.selectLayer('l1', true)
    expect(layers.selectedLayerIds.value).toEqual([])
    expect(layers.primaryLayerId.value).toBeNull()
  })

  it('清空选中后不再有主图层', () => {
    const { layers } = setup()
    layers.selectLayer('l1')
    layers.clearSelection()
    expect(layers.selectedLayerIds.value).toEqual([])
    expect(layers.primaryLayerId.value).toBeNull()
  })

  it('applyTransform 抛当前主图层的变换', () => {
    const { layers, onTransform } = setup()
    layers.selectLayer('l1')
    layers.localScale.value = 2
    layers.localOpacity.value = 0.8
    layers.localRotate.value = -5
    layers.applyTransform()
    expect(onTransform).toHaveBeenCalledWith({ layerId: 'l1', scale: 2, opacity: 0.8, rotate: -5 })
  })

  it('resetTransform 复位本地值并带 reset 标记', () => {
    const { layers, onTransform } = setup()
    layers.selectLayer('l1')
    layers.resetTransform()
    expect(layers.localScale.value).toBe(1)
    expect(layers.localOpacity.value).toBe(1)
    expect(layers.localRotate.value).toBe(0)
    expect(onTransform).toHaveBeenCalledWith({ layerId: 'l1', scale: 1, opacity: 1, rotate: 0, reset: true })
  })

  it('没有主图层时 applyTransform / resetTransform 都不抛事件', () => {
    const { layers, onTransform } = setup()
    layers.applyTransform()
    layers.resetTransform()
    expect(onTransform).not.toHaveBeenCalled()
  })

  it('选中图层在盒样式里临时提到最上', () => {
    const { layers } = setup()
    expect(layers.slotBoxStyle('l1')).toEqual({ left: '10%' })
    layers.selectLayer('l1')
    expect(layers.slotBoxStyle('l1')).toEqual({ left: '10%', zIndex: 60 })
    expect(layers.slotBoxStyle('l2')).toEqual({})
  })
})

describe('useStageLayers 图层列表', () => {
  it('按 背景 → 立绘（order 降序）→ 前景 → 对话框 排列', () => {
    const { layers } = setup()
    expect(layers.layerItems.value.map(i => i.key)).toEqual(['background', 'l2', 'l1', 'foreground', 'dialogue'])
  })

  it('状态文案区分 空 / 已隐藏 / 层级 N / 已设置', () => {
    const { layers } = setup()
    const byKey = Object.fromEntries(layers.layerItems.value.map(i => [i.key, i.stateLabel]))
    expect(byKey).toEqual({
      background: '已设置',
      l2: '已隐藏',
      l1: '层级 1',
      foreground: '空',
      dialogue: '已设置',
    })
  })

  it('渲染顺序按 order 升序', () => {
    const { layers } = setup()
    expect(layers.renderedLayers.value.map(s => s.layer_id)).toEqual(['l1', 'l2'])
  })

  it('图层数量达到上限时禁止新建', () => {
    const { layers, maxLayers } = setup()
    expect(layers.layerLimitReached.value).toBe(false)
    maxLayers.value = 2
    expect(layers.layerLimitReached.value).toBe(true)
  })

  it('图层名三级回退：槽位名 → 立绘标签 → 图层 id', () => {
    const { layers, slots } = setup()
    expect(layers.layerLabel('l1')).toBe('立绘一')
    delete slots.value.l1.layer_name
    expect(layers.layerLabel('l1')).toBe('立绘一')
    expect(layers.layerLabel('ghost')).toBe('ghost')
  })

  it('点击非立绘图层切换显隐', () => {
    const { layers, onStageVisibility } = setup()
    layers.onLayerClick({ ctrlKey: false, metaKey: false, shiftKey: false } as MouseEvent, item({
      key: 'background',
      label: '背景',
      isAvatar: false,
      visible: true,
      stateLabel: '已设置',
    }))
    expect(onStageVisibility).toHaveBeenCalledWith('background', false)
  })

  it('点击已存在的立绘层按修饰键决定是否多选', () => {
    const { layers } = setup()
    layers.onLayerClick({ ctrlKey: false, metaKey: false, shiftKey: true } as MouseEvent, item({}))
    expect(layers.selectedLayerIds.value).toEqual(['l1'])
  })

  it('点击不存在的立绘层不做选中', () => {
    const { layers } = setup()
    layers.onLayerClick({ ctrlKey: false, metaKey: false, shiftKey: false } as MouseEvent, item({ exists: false }))
    expect(layers.selectedLayerIds.value).toEqual([])
  })
})

describe('useStageLayers 图层列表拖拽换序', () => {
  it('拖起立绘层记录源图层并把 key 写进 dataTransfer', () => {
    const { layers } = setup()
    const ev = layerDrag()
    layers.onLayerDragStart(ev, item({}))
    expect(layers.dragLayerKey.value).toBe('l1')
    expect(ev.dataTransfer?.getData('text/plain')).toBe('l1')
  })

  it('非立绘层拖起直接阻止默认行为', () => {
    const { layers } = setup()
    const ev = layerDrag()
    layers.onLayerDragStart(ev, item({ key: 'background', isAvatar: false }))
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(layers.dragLayerKey.value).toBeNull()
  })

  it('拖到其它立绘层上高亮目标', () => {
    const { layers } = setup()
    layers.onLayerDragStart(layerDrag(), item({ key: 'l1' }))
    layers.onLayerDragOver(layerDrag(), item({ key: 'l2', label: '立绘二', order: 2 }))
    expect(layers.dragOverKey.value).toBe('l2')
  })

  it('落到不同立绘层触发换序并清空拖拽状态', () => {
    const { layers, onReorder } = setup()
    layers.onLayerDragStart(layerDrag(), item({ key: 'l1' }))
    layers.onLayerDrop(layerDrag(), item({ key: 'l2', label: '立绘二', order: 2 }))
    expect(onReorder).toHaveBeenCalledWith('l1', 'l2')
    expect(layers.dragLayerKey.value).toBeNull()
    expect(layers.dragOverKey.value).toBeNull()
  })

  it('落到自己或非立绘层不换序', () => {
    const { layers, onReorder } = setup()
    layers.onLayerDragStart(layerDrag(), item({ key: 'l1' }))
    layers.onLayerDrop(layerDrag(), item({ key: 'l1' }))
    layers.onLayerDrop(layerDrag(), item({ key: 'background', isAvatar: false }))
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('素材图片落到立绘层改为替换该层图片', () => {
    const { layers, onReplaceAsset, onReorder } = setup()
    const ev = layerDrag({ 'text/plain': '/new.png' })
    layers.onLayerDrop(ev, item({ key: 'l2', label: '立绘二', order: 2 }))
    expect(onReplaceAsset).toHaveBeenCalledWith('l2', { url: '/new.png', label: '' })
    expect(onReorder).not.toHaveBeenCalled()
    expect(ev.stopPropagation).toHaveBeenCalled()
  })

  it('拖拽结束后清空拖拽状态', () => {
    const { layers } = setup()
    layers.onLayerDragStart(layerDrag(), item({ key: 'l1' }))
    layers.onLayerDragOver(layerDrag(), item({ key: 'l2', label: '立绘二', order: 2 }))
    layers.onLayerDragEnd()
    expect(layers.dragLayerKey.value).toBeNull()
    expect(layers.dragOverKey.value).toBeNull()
  })
})

describe('useStageLayers 外部状态联动', () => {
  it('退出编辑态时清空选中', async () => {
    const { layers, editable } = setup()
    layers.selectLayer('l1')
    editable.value = false
    await nextTick()
    expect(layers.selectedLayerIds.value).toEqual([])
  })

  it('切台词时清空选中', async () => {
    const { layers, dialogueKey } = setup()
    layers.selectLayer('l1')
    dialogueKey.value = 'd2'
    await nextTick()
    expect(layers.selectedLayerIds.value).toEqual([])
  })
})
