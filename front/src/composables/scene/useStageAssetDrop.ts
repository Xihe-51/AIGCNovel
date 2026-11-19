/**
 * 舞台素材拖拽：素材库图片落到舞台空白处新建图层，落到已有立绘层则替换该层图片。
 *
 * 只负责读取拖拽载荷与高亮状态，真正的写入通过 onAssetDrop / onReplaceAsset 回调交给页面。
 */
import { ref } from 'vue'

export interface StageAssetPayload {
  url: string
  label: string
}

export interface StageAssetDropPayload extends StageAssetPayload {
  x: number
  y: number
}

export interface UseStageAssetDropOptions {
  onAssetDrop: (payload: StageAssetDropPayload) => void
  onReplaceAsset: (layerId: string, payload: StageAssetPayload) => void
}

const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i

export const isImageAssetUrl = (url: string) => IMAGE_PATTERN.test(String(url || ''))

export const hasAssetDragType = (ev: DragEvent) => {
  const types = ev.dataTransfer?.types || []
  return Array.from(types).includes('application/x-aigc-asset')
}

export function readAssetDropPayload(ev: DragEvent): StageAssetPayload | null {
  try {
    const raw = ev.dataTransfer?.getData('application/x-aigc-asset') || ''
    if (raw) {
      const data = JSON.parse(raw)
      const url = data?.url || data?.image_url || ''
      if (url) return { url, label: data?.label || data?.title || '' }
    }
    const text = ev.dataTransfer?.getData('text/plain') || ''
    if (text && isImageAssetUrl(text)) return { url: text, label: '' }
  } catch (_) {
    /* 忽略非 JSON 拖拽数据 */
  }
  return null
}

export function useStageAssetDrop(options: UseStageAssetDropOptions) {
  const assetOver = ref(false)
  // 拖到某个已存在的立绘上时，记录它的 layer_id 用于高亮提示
  const assetOverAvatar = ref<string | null>(null)

  const onAssetDragOver = (ev: DragEvent) => {
    if (hasAssetDragType(ev)) assetOver.value = true
  }

  const onAssetDragLeave = () => {
    assetOver.value = false
  }

  const onAssetDrop = (ev: DragEvent) => {
    assetOver.value = false
    assetOverAvatar.value = null
    const payload = readAssetDropPayload(ev)
    if (!payload || !isImageAssetUrl(payload.url)) return
    const host = ev.currentTarget as HTMLElement | null
    const rect = host?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return
    const x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100))
    options.onAssetDrop({ ...payload, x, y })
  }

  const onAvatarAssetDragOver = (ev: DragEvent) => {
    if (!hasAssetDragType(ev)) return
    const layerId = (ev.currentTarget as HTMLElement | null)?.getAttribute('data-layer-id') || null
    assetOverAvatar.value = layerId
    assetOver.value = true
  }

  const onAvatarAssetDrop = (ev: DragEvent, layerId: string) => {
    assetOver.value = false
    assetOverAvatar.value = null
    const asset = readAssetDropPayload(ev)
    if (!asset || !isImageAssetUrl(asset.url)) return
    options.onReplaceAsset(layerId, asset)
  }

  return {
    assetOver,
    assetOverAvatar,
    onAssetDragOver,
    onAssetDragLeave,
    onAssetDrop,
    onAvatarAssetDragOver,
    onAvatarAssetDrop,
  }
}
