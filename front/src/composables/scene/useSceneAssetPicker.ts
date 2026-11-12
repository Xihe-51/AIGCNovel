/**
 * 素材库复用：从项目已有素材中挑背景图 / 背景音乐。
 *
 * 数据源是 api/asset 的 checkProjectAssets（素材体检接口），这里只做三件事：
 * 1. 只保留磁盘上真实存在（status === 'ok'）且扩展名匹配当前类型的条目；
 * 2. 同一 url 只留 usage_count 最高的一条，再整体按引用次数降序；
 * 3. 选中后写回 scene：背景要复位 settingsBgFailed，音乐要先停掉正在试听的音频。
 *
 * 写入 scene 后不直接调保存接口，交给 useSceneSettingsAutosave 防抖落盘。
 */
import type { Ref } from 'vue'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { checkProjectAssets } from '@/api/asset'
import type { AssetItem } from '@/api/asset'

export type AssetPickerKind = 'image' | 'audio'

export interface SceneAssetPickerContext {
  projectId: Ref<string | number>
  scene: Ref<any>
  settingsBgFailed: Ref<boolean>
  stopSettingsAudio: () => void
}

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i

/** 过滤 + 同址去重 + 按引用次数降序。纯函数，便于单测。 */
export const pickAssetItems = (
  items: AssetItem[] | null | undefined,
  kind: AssetPickerKind
): AssetItem[] => {
  const pattern = kind === 'image' ? IMAGE_EXT : AUDIO_EXT
  const map = new Map<string, AssetItem>()
  for (const it of (items || [])) {
    if (!it || it.status !== 'ok' || !pattern.test(it.url || '')) continue
    const prev = map.get(it.url)
    if (!prev || (it.usage_count || 0) > (prev.usage_count || 0)) {
      map.set(it.url, it)
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
}

export function useSceneAssetPicker(ctx: SceneAssetPickerContext) {
  const { projectId, scene, settingsBgFailed, stopSettingsAudio } = ctx

  const assetPickerVisible = ref(false)
  const assetPickerKind = ref<AssetPickerKind>('image')
  const assetPickerLoading = ref(false)
  const assetPickerItems = ref<AssetItem[]>([])

  const openAssetPicker = async (kind: AssetPickerKind) => {
    assetPickerKind.value = kind
    assetPickerVisible.value = true
    assetPickerLoading.value = true
    assetPickerItems.value = []
    try {
      const pid = Number(projectId.value || scene.value?.project_id)
      const res = await checkProjectAssets(pid)
      assetPickerItems.value = pickAssetItems(res?.items, kind)
    } catch (e: any) {
      ElMessage.error('读取素材库失败：' + (e?.message || '未知错误'))
    } finally {
      assetPickerLoading.value = false
    }
  }

  const useAssetFromLibrary = (asset: AssetItem | null | undefined) => {
    if (!asset) return
    if (assetPickerKind.value === 'image') {
      scene.value.background_url = asset.url
      settingsBgFailed.value = false
    } else {
      stopSettingsAudio()
      scene.value.music_url = asset.url
    }
    assetPickerVisible.value = false
    ElMessage.success('已填入素材，稍后自动保存')
  }

  return {
    assetPickerVisible,
    assetPickerKind,
    assetPickerLoading,
    assetPickerItems,
    openAssetPicker,
    useAssetFromLibrary,
  }
}
