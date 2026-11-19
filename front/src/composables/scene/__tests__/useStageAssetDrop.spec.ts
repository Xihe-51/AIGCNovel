import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hasAssetDragType,
  isImageAssetUrl,
  readAssetDropPayload,
  useStageAssetDrop,
} from '@/composables/scene/useStageAssetDrop'

interface FakeDragOptions {
  types?: string[]
  data?: Record<string, string>
  clientX?: number
  clientY?: number
  currentTarget?: any
}

function dragEvent(options: FakeDragOptions = {}) {
  return {
    dataTransfer: {
      types: options.types || [],
      getData: (type: string) => options.data?.[type] || '',
    },
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
    currentTarget: options.currentTarget ?? null,
    stopPropagation: vi.fn(),
  } as unknown as DragEvent
}

function fakeHost(rect: { left: number; top: number; width: number; height: number }, layerId?: string) {
  return {
    getBoundingClientRect: () => rect,
    getAttribute: (name: string) => (name === 'data-layer-id' ? layerId || null : null),
  }
}

function setup() {
  const onAssetDrop = vi.fn()
  const onReplaceAsset = vi.fn()
  const drop = useStageAssetDrop({ onAssetDrop, onReplaceAsset })
  return {
    assetOver: drop.assetOver,
    assetOverAvatar: drop.assetOverAvatar,
    onAssetDragOver: drop.onAssetDragOver,
    onAssetDragLeave: drop.onAssetDragLeave,
    handleDrop: drop.onAssetDrop,
    onAvatarAssetDragOver: drop.onAvatarAssetDragOver,
    onAvatarAssetDrop: drop.onAvatarAssetDrop,
    onAssetDrop,
    onReplaceAsset,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useStageAssetDrop 图片判定', () => {
  it('识别常见图片扩展名与带查询串的地址', () => {
    expect(isImageAssetUrl('/assets/a.png')).toBe(true)
    expect(isImageAssetUrl('/assets/a.JPEG')).toBe(true)
    expect(isImageAssetUrl('/assets/a.webp?x=1')).toBe(true)
    expect(isImageAssetUrl('https://cdn.test/b.gif')).toBe(true)
  })

  it('拒绝非图片与空值', () => {
    expect(isImageAssetUrl('')).toBe(false)
    expect(isImageAssetUrl('/assets/a.txt')).toBe(false)
    expect(isImageAssetUrl('javascript:alert(1)')).toBe(false)
  })

  it('只有自定义 MIME 才算素材拖拽', () => {
    expect(hasAssetDragType(dragEvent({ types: ['application/x-aigc-asset'] }))).toBe(true)
    expect(hasAssetDragType(dragEvent({ types: ['text/plain'] }))).toBe(false)
  })
})

describe('useStageAssetDrop 读取拖拽载荷', () => {
  it('优先解析自定义 MIME 里的 JSON', () => {
    const payload = readAssetDropPayload(dragEvent({
      data: { 'application/x-aigc-asset': JSON.stringify({ url: '/a.png', label: '立绘 A' }) },
    }))
    expect(payload).toEqual({ url: '/a.png', label: '立绘 A' })
  })

  it('兼容 image_url / title 字段', () => {
    const payload = readAssetDropPayload(dragEvent({
      data: { 'application/x-aigc-asset': JSON.stringify({ image_url: '/b.png', title: '背景 B' }) },
    }))
    expect(payload).toEqual({ url: '/b.png', label: '背景 B' })
  })

  it('自定义 MIME 缺 url 时回退 text/plain 图片地址', () => {
    const payload = readAssetDropPayload(dragEvent({
      data: {
        'application/x-aigc-asset': JSON.stringify({ label: '没有地址' }),
        'text/plain': '/c.png',
      },
    }))
    expect(payload).toEqual({ url: '/c.png', label: '' })
  })

  it('text/plain 不是图片时返回 null', () => {
    expect(readAssetDropPayload(dragEvent({ data: { 'text/plain': '/notes.txt' } }))).toBeNull()
  })

  it('JSON 非法时不抛错，直接返回 null', () => {
    expect(readAssetDropPayload(dragEvent({
      data: { 'application/x-aigc-asset': 'not-json', 'text/plain': '/d.png' },
    }))).toBeNull()
  })
})

describe('useStageAssetDrop 舞台落点', () => {
  it('只有自定义 MIME 拖入才点亮高亮', () => {
    const drop = setup()
    drop.onAssetDragOver(dragEvent({ types: ['text/plain'] }))
    expect(drop.assetOver.value).toBe(false)
    drop.onAssetDragOver(dragEvent({ types: ['application/x-aigc-asset'] }))
    expect(drop.assetOver.value).toBe(true)
  })

  it('拖离舞台熄灭高亮', () => {
    const drop = setup()
    drop.assetOver.value = true
    drop.onAssetDragLeave()
    expect(drop.assetOver.value).toBe(false)
  })

  it('落点换算成 0~100 的舞台百分比', () => {
    const drop = setup()
    const host = fakeHost({ left: 100, top: 50, width: 400, height: 200 })
    drop.handleDrop(dragEvent({
      data: { 'application/x-aigc-asset': JSON.stringify({ url: '/a.png', label: 'A' }) },
      clientX: 300,
      clientY: 150,
      currentTarget: host,
    }))
    expect(drop.onAssetDrop).toHaveBeenCalledWith({ url: '/a.png', label: 'A', x: 50, y: 50 })
    expect(drop.assetOver.value).toBe(false)
    expect(drop.assetOverAvatar.value).toBeNull()
  })

  it('落点越界时夹紧到舞台内', () => {
    const drop = setup()
    const host = fakeHost({ left: 0, top: 0, width: 100, height: 100 })
    drop.handleDrop(dragEvent({
      data: { 'text/plain': '/a.png' },
      clientX: -50,
      clientY: 400,
      currentTarget: host,
    }))
    expect(drop.onAssetDrop).toHaveBeenCalledWith({ url: '/a.png', label: '', x: 0, y: 100 })
  })

  it('非图片或宿主尺寸为 0 时不落地', () => {
    const drop = setup()
    drop.handleDrop(dragEvent({ data: { 'text/plain': '/a.txt' }, currentTarget: fakeHost({ left: 0, top: 0, width: 100, height: 100 }) }))
    drop.handleDrop(dragEvent({ data: { 'text/plain': '/a.png' }, currentTarget: fakeHost({ left: 0, top: 0, width: 0, height: 0 }) }))
    expect(drop.onAssetDrop).not.toHaveBeenCalled()
  })
})

describe('useStageAssetDrop 立绘替换', () => {
  it('拖到立绘上时记录并高亮目标图层', () => {
    const drop = setup()
    drop.onAvatarAssetDragOver(dragEvent({
      types: ['application/x-aigc-asset'],
      currentTarget: fakeHost({ left: 0, top: 0, width: 10, height: 10 }, 'layer-2'),
    }))
    expect(drop.assetOverAvatar.value).toBe('layer-2')
    expect(drop.assetOver.value).toBe(true)
  })

  it('非素材拖拽不改高亮', () => {
    const drop = setup()
    drop.onAvatarAssetDragOver(dragEvent({
      types: ['text/plain'],
      currentTarget: fakeHost({ left: 0, top: 0, width: 10, height: 10 }, 'layer-2'),
    }))
    expect(drop.assetOverAvatar.value).toBeNull()
  })

  it('图片落到立绘层替换该层素材', () => {
    const drop = setup()
    drop.assetOver.value = true
    drop.assetOverAvatar.value = 'layer-2'
    drop.onAvatarAssetDrop(dragEvent({ data: { 'text/plain': '/new.png' } }), 'layer-2')
    expect(drop.onReplaceAsset).toHaveBeenCalledWith('layer-2', { url: '/new.png', label: '' })
    expect(drop.assetOver.value).toBe(false)
    expect(drop.assetOverAvatar.value).toBeNull()
  })

  it('非图片落到立绘层不替换', () => {
    const drop = setup()
    drop.onAvatarAssetDrop(dragEvent({ data: { 'text/plain': '/new.txt' } }), 'layer-2')
    expect(drop.onReplaceAsset).not.toHaveBeenCalled()
  })
})
