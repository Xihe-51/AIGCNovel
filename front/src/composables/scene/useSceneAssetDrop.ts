/**
 * 场景编辑器的素材拖拽入口。
 *
 * 两条链路：
 * 1. 素材库拖到舞台空白处 → 新建立绘层；拖到已有图层 → 替换该层图片。
 * 2. 素材库拖到场景设置槽位 → 图片填背景、音频填背景音乐。
 *
 * 舞台链路写的是节点演出指令，因此写前入撤销栈、失败后回滚栈顶；
 * 场景设置链路只改本地 scene 字段，交给 useSceneSettingsAutosave 防抖保存。
 */
import type { ComputedRef, Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createDirective, updateDirective } from '@/api/directive'
import { MAX_AVATAR_LAYERS } from '@/composables/scene/useDirectiveEditor'

export interface SceneAssetDropContext {
  projectId: Ref<string | number>
  currentDialogue: ComputedRef<any>
  avatarLayers: ComputedRef<any[]>
  scene: Ref<any>
  stageUndoStack: Ref<any[]>
  dragOverBg: Ref<boolean>
  dragOverMusic: Ref<boolean>
  settingsBgFailed: Ref<boolean>
  musicPlaying: Ref<boolean>
  musicProgress: Ref<number>
  musicDuration: Ref<number>
  snapshotStageDirectives: () => void
  markStageUndoApplied: () => void
  nextLayerOrder: () => number
  findAvatarDirective: (layerId: string) => any
  loadPreviewDirectives: (contentId: number | string | null | undefined) => any
  refreshDirectiveList: () => any
  pushHistory: () => void
  markDirty: () => void
}

export interface StageAssetPayload {
  url: string
  label: string
}

const clampPercent = (value: any, fallback: number) => {
  const num = Number(value) || fallback
  return Math.max(0, Math.min(100, num))
}

export function useSceneAssetDrop(ctx: SceneAssetDropContext) {
  const isImageUrl = (url: any) => /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(String(url || ''))
  const isAudioUrl = (url: any) => /\.(mp3|wav|ogg)(\?|$)/i.test(String(url || ''))

  const readAssetPayload = (e: DragEvent) => {
    try {
      const raw = e.dataTransfer?.getData('application/x-aigc-asset') || ''
      return raw ? JSON.parse(raw) : null
    } catch (_) {
      return null
    }
  }

  // 从拖拽数据里取出可用的图片地址：优先自定义素材载荷，其次纯文本链接
  const stageAssetPayload = (ev: DragEvent): StageAssetPayload | null => {
    try {
      const raw = ev.dataTransfer?.getData('application/x-aigc-asset') || ''
      if (raw) {
        const data = JSON.parse(raw)
        const url = data?.url || data?.image_url || ''
        if (url) return { url, label: data?.label || data?.title || '' }
      }
      const text = ev.dataTransfer?.getData('text/plain') || ''
      if (text && isImageUrl(text)) return { url: text, label: '' }
    } catch (_) {
      /* 非素材拖拽数据 */
    }
    return null
  }

  const onStageAssetDrop = async ({ url, label, x, y }: any) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) {
      ElMessage.warning('请先保存当前台词，再把素材拖到舞台')
      return
    }
    if (ctx.avatarLayers.value.length >= MAX_AVATAR_LAYERS) {
      ElMessage.warning(`最多 ${MAX_AVATAR_LAYERS} 个立绘图层`)
      return
    }
    const pid = Number(ctx.projectId.value)
    const contentId = Number(dialogue.content_id)
    const layerId = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const layerName = String(label || '素材立绘').slice(0, 30) || '素材立绘'
    ctx.snapshotStageDirectives()
    try {
      await createDirective(pid, {
        content_id: contentId,
        directive_type: 'avatar',
        payload: {
          layer_id: layerId,
          layer_name: layerName,
          order: ctx.nextLayerOrder(),
          image_url: url,
          action: 'show',
          coord: 'stage',
          x: clampPercent(x, 50),
          y: clampPercent(y, 100),
          scale: 1,
          opacity: 1,
          rotate: 0
        }
      })
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      ctx.markStageUndoApplied()
      ElMessage.success(`已用素材创建立绘层「${layerName}」`)
    } catch (e) {
      ctx.stageUndoStack.value.pop()
      console.error('素材立绘层创建失败:', e)
      ElMessage.error('素材立绘层创建失败，请重试')
    }
  }

  const onAvatarReplaceAsset = async (layerId: string, asset: StageAssetPayload) => {
    const dialogue = ctx.currentDialogue.value
    if (!dialogue?.content_id) {
      ElMessage.warning('请先保存当前台词，再替换图层素材')
      return
    }
    const existing = ctx.findAvatarDirective(layerId)
    if (!existing) {
      ElMessage.warning('该图层还没有立绘指令，无法替换素材')
      return
    }
    const pid = Number(ctx.projectId.value)
    const contentId = Number(dialogue.content_id)
    ctx.snapshotStageDirectives()
    try {
      await updateDirective(pid, existing.directive_id, {
        payload: {
          ...(existing.payload || {}),
          layer_id: layerId,
          image_url: asset.url,
          layer_name: (existing.payload && existing.payload.layer_name) || asset.label || layerId,
          action: 'show'
        }
      })
      await ctx.loadPreviewDirectives(contentId)
      await ctx.refreshDirectiveList()
      ctx.markStageUndoApplied()
      ElMessage.success('图层素材已替换')
    } catch (e) {
      ctx.stageUndoStack.value.pop()
      console.error('替换图层素材失败:', e)
      ElMessage.error('替换图层素材失败，请重试')
    }
  }

  const onBackgroundDrop = (e: DragEvent) => {
    ctx.dragOverBg.value = false
    const payload = readAssetPayload(e)
    const url = payload?.url || e.dataTransfer?.getData('text/plain') || ''
    if (!url || (!isImageUrl(url) && payload?.asset_kind !== 'image')) {
      ElMessage.warning('请拖入图片素材')
      return
    }
    ctx.pushHistory()
    ctx.markDirty()
    ctx.scene.value.background_url = url
    ctx.settingsBgFailed.value = false
    ElMessage.success('已填入背景图，稍后自动保存')
  }

  const onMusicDrop = (e: DragEvent) => {
    ctx.dragOverMusic.value = false
    const payload = readAssetPayload(e)
    const url = payload?.url || e.dataTransfer?.getData('text/plain') || ''
    if (!url || (!isAudioUrl(url) && payload?.asset_kind !== 'audio')) {
      ElMessage.warning('请拖入音频素材')
      return
    }
    ctx.pushHistory()
    ctx.markDirty()
    ctx.scene.value.music_url = url
    ctx.musicPlaying.value = false
    ctx.musicProgress.value = 0
    ctx.musicDuration.value = 0
    ElMessage.success('已填入背景音乐，稍后自动保存')
  }

  return {
    isImageUrl,
    isAudioUrl,
    readAssetPayload,
    stageAssetPayload,
    onStageAssetDrop,
    onAvatarReplaceAsset,
    onBackgroundDrop,
    onMusicDrop,
  }
}
