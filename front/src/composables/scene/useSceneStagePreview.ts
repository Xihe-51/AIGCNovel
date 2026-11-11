/**
 * 场景编辑器的舞台预览模型：按当前台词节点推导演出效果。
 *
 * 只做「读」：指令 → 图层/背景/前景/可见性/特效；写操作与撤销栈留在页面侧。
 * 依赖通过 ref / getter 注入，避免反向依赖 SceneEdit 的其余状态。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { listNodeDirectives } from '@/api/directive'
import { layerIdOf, layerNameOf, layerOrderOf, stageDefaultX } from '@/composables/player/usePlayerStage'

export interface SceneStagePreviewContext {
  projectId: Ref<string | number>
  characters: Ref<any[]>
  scene: Ref<any>
  dialogues: Ref<any[]>
  currentDialogueIndex: Ref<number>
  assetSrc: (url: string) => string
  avatarLayersOf: (avatarId: number | null | undefined) => string[]
  defaultBackground: string
}

export function useSceneStagePreview(ctx: SceneStagePreviewContext) {
  const previewDirectives = ref<any[]>([])

  const defaultAvatarSources = (characterId: number | null | undefined) => {
    if (!characterId) return []
    const char = ctx.characters.value.find(c => c.character_id === characterId)
    if (!char) return []
    const list = char.avatars || []
    const def = list.find((a: any) => a.is_default) || list[0]
    if (def && def.avatar_id) {
      const layers = ctx.avatarLayersOf(def.avatar_id)
      if (layers.length) return layers
    }
    return char.avatar_url ? [ctx.assetSrc(char.avatar_url)] : []
  }

  // 预览立绘：对话绑定角色时显示对应立绘；旁白沿用本场景上一位说话的角色，
  // 直到出现新的角色（要清空舞台请用「演出」里的隐藏指令）。
  const previewSpeaker = computed(() => {
    for (let i = Math.min(ctx.currentDialogueIndex.value, ctx.dialogues.value.length - 1); i >= 0; i--) {
      const d = ctx.dialogues.value[i]
      if (d && d.character_id) return d
    }
    return null
  })

  const previewAvatarSources = computed(() => {
    const d = previewSpeaker.value
    if (!d) return []
    const byAvatar = ctx.avatarLayersOf(d.avatar_id)
    if (byAvatar.length) return byAvatar
    return defaultAvatarSources(d.character_id)
  })

  const previewAvatarSrc = computed(() => previewAvatarSources.value[0] || '')

  const previewSlots = computed(() => {
    const slots: Record<string, any> = {}
    for (const d of previewDirectives.value) {
      if (d.directive_type !== 'avatar') continue
      const p = d.payload || {}
      const layerId = layerIdOf(p)
      if (p.action === 'hide') {
        delete slots[layerId]
        continue
      }
      const assetImage = p.image_url ? [ctx.assetSrc(p.image_url)] : []
      const sources = assetImage.length
        ? assetImage
        : (ctx.avatarLayersOf(p.avatar_id).length ? ctx.avatarLayersOf(p.avatar_id) : defaultAvatarSources(p.character_id))
      const src = sources[0]
      if (!src) continue
      // 旧指令用 position + sprite 坐标；统一折算成舞台坐标，任意图层都走同一套渲染
      const legacy = p.coord !== 'stage'
      const x = legacy ? stageDefaultX(layerId) : (Number(p.x) || 0)
      const y = legacy ? 100 : (Number(p.y) || 0)
      const scale = Number(p.scale) || 1
      const opacity = p.opacity === undefined || p.opacity === null ? 1 : Number(p.opacity)
      const rotate = Number(p.rotate) || 0
      const order = layerOrderOf(p)
      const visible = p.visible !== false
      const boxStyle = {
        left: `${x}%`,
        top: `${y}%`,
        bottom: 'auto',
        right: 'auto',
        transform: 'translate(-50%, -100%)',
        zIndex: 10 + order
      }
      const style = {
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        opacity
      }
      slots[layerId] = {
        src,
        sources,
        style,
        boxStyle,
        coord: 'stage',
        visible,
        order,
        layer_id: layerId,
        layer_name: layerNameOf(p),
        x,
        y,
        scale,
        opacity,
        rotate,
        character_id: p.character_id,
        avatar_id: p.avatar_id
      }
    }
    return slots
  })

  const hasPreviewSlots = computed(() => Object.keys(previewSlots.value).length > 0)

  // 图层列表：order 越高越靠前（列表展示时再倒序）
  const avatarLayers = computed(() => Object.values(previewSlots.value)
    .map(slot => ({
      layer_id: slot.layer_id,
      label: slot.layer_name || slot.layer_id,
      exists: true,
      visible: slot.visible !== false,
      order: slot.order
    }))
    .sort((a, b) => a.order - b.order))

  // 舞台层可见性（背景/前景/对话框）：由节点级 stage 指令控制，缺省全部可见
  const stageVisibility = computed(() => {
    const base = { background: true, foreground: true, dialogue: true }
    for (const d of previewDirectives.value) {
      if (d.directive_type !== 'stage') continue
      const p = d.payload || {}
      if (typeof p.background === 'boolean') base.background = p.background
      if (typeof p.foreground === 'boolean') base.foreground = p.foreground
      if (typeof p.dialogue === 'boolean') base.dialogue = p.dialogue
    }
    return base
  })

  const previewBgSrc = computed(() => {
    if (!stageVisibility.value.background) return ''
    let bg = ''
    for (const d of previewDirectives.value) {
      if (d.directive_type !== 'background') continue
      const p = d.payload || {}
      if (p.layer === 'foreground') continue
      bg = p.url || ''
    }
    if (bg) return ctx.assetSrc(bg)
    return ctx.scene.value.background_url ? ctx.assetSrc(ctx.scene.value.background_url) : ctx.defaultBackground
  })

  // 背景/前景是否存在真实资源（与是否被隐藏无关，供图层列表判断"空/已设置"）
  const bgAvailable = computed(() => {
    for (const d of previewDirectives.value) {
      if (d.directive_type !== 'background') continue
      const p = d.payload || {}
      if (p.layer === 'foreground') continue
      if (p.url) return true
    }
    return !!ctx.scene.value.background_url
  })

  const fgAvailable = computed(() => {
    for (const d of previewDirectives.value) {
      if (d.directive_type !== 'background') continue
      const p = d.payload || {}
      if (p.layer === 'foreground' && p.url) return true
    }
    return false
  })

  const previewFgSrc = computed(() => {
    if (!stageVisibility.value.foreground) return ''
    let fg = ''
    for (const d of previewDirectives.value) {
      if (d.directive_type !== 'background') continue
      const p = d.payload || {}
      if (p.layer !== 'foreground') continue
      fg = p.url || ''
    }
    return fg ? ctx.assetSrc(fg) : ''
  })

  // 场景设置里的背景图 404 降级；舞台预览的裂图由 SceneStagePreview 自己处理
  const settingsBgFailed = ref(false)
  watch(() => ctx.scene.value.background_url, () => { settingsBgFailed.value = false })

  /* 画面效果：当前节点最后一条 effect 指令在预览里触发一次 */
  const activeEffect = ref<any>(null)
  let effectTimer: ReturnType<typeof setTimeout> | null = null

  const previewEffect = computed(() => {
    const list = previewDirectives.value.filter(d => d.directive_type === 'effect')
    if (!list.length) return null
    return list[list.length - 1].payload || null
  })

  const triggerPreviewEffect = (p: any) => {
    if (effectTimer) clearTimeout(effectTimer)
    activeEffect.value = null
    if (!p) return
    const duration = Number(p.duration_ms) || (p.effect === 'weather' ? 3000 : 400)
    // 先置空再赋值，保证连续两次相同效果也能重新播放 CSS 动画
    nextTick(() => {
      activeEffect.value = { ...p, duration_ms: duration, key: Date.now() }
      effectTimer = setTimeout(() => { activeEffect.value = null }, duration)
    })
  }

  watch(previewEffect, (p) => { triggerPreviewEffect(p) }, { immediate: true, deep: true })

  onBeforeUnmount(() => {
    if (effectTimer) clearTimeout(effectTimer)
  })

  const loadPreviewDirectives = async (contentId: number | string | null | undefined) => {
    if (!contentId) {
      previewDirectives.value = []
      return
    }
    try {
      previewDirectives.value = await listNodeDirectives(Number(ctx.projectId.value), Number(contentId))
    } catch (e) {
      previewDirectives.value = []
    }
  }

  return {
    previewDirectives,
    previewSlots,
    hasPreviewSlots,
    avatarLayers,
    stageVisibility,
    previewBgSrc,
    bgAvailable,
    fgAvailable,
    previewFgSrc,
    previewAvatarSources,
    previewAvatarSrc,
    previewSpeaker,
    defaultAvatarSources,
    settingsBgFailed,
    activeEffect,
    previewEffect,
    triggerPreviewEffect,
    loadPreviewDirectives,
  }
}
