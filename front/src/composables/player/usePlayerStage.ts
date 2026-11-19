/**
 * 播放器舞台视觉状态：立绘图层、背景/前景切换、节点级显隐。
 *
 * 只负责「画面状态」，演出指令如何解析仍留在播放器里；
 * 场景与角色列表通过 getter 注入，避免初始化顺序问题。
 */
import { computed, ref, watch } from 'vue'
import { listDirectives } from '@/api/directive'
import { BASE_URL } from '@/utils/request'

export const LEGACY_POSITION_ORDER = { left: 0, center: 1, right: 2 }
export const layerIdOf = (p: any = {}) => p.layer_id || p.position || 'center'
export const layerNameOf = (p: any = {}) => p.layer_name || (({ left: '左侧', center: '中间', right: '右侧' } as any)[p.position] || '立绘')
export const layerOrderOf = (p: any = {}) => {
  if (p.order !== undefined && p.order !== null && Number.isFinite(Number(p.order))) return Number(p.order)
  if (p.z !== undefined && p.z !== null && Number.isFinite(Number(p.z))) return Number(p.z)
  return (LEGACY_POSITION_ORDER as any)[p.position || 'center'] ?? 0
}
export const stageDefaultX = (layerId: string) => {
  if (layerId === 'left') return 20
  if (layerId === 'right') return 80
  return 50
}

export interface PlayerStageContext {
  getProjectId: () => number
  getCurrentScene: () => any
  getCharacters: () => any[]
  getDefaultBackground?: () => string
  /** 舞台重置时同时清理停顿/特效等外部状态 */
  onReset?: () => void
}

export function usePlayerStage(ctx: PlayerStageContext) {
  const stageAvatars = ref<any>({})
  const bgFromDirective = ref('')
  const bgTransition = ref('fade')
  const bgDuration = ref(400)
  const fgFromDirective = ref('')
  const directivesByContent = ref<any>({})
  // 节点级舞台层可见性（背景/前景/对话框），由 stage 指令控制
  const stageLayerVisible = ref({ background: true, foreground: true, dialogue: true })

  const stageLayers = computed(() => Object.values(stageAvatars.value)
    .filter(Boolean)
    .sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0)))

  const hasStageAvatars = computed(() => stageLayers.value.length > 0)

  const stageBackground = computed(() => {
    if (stageLayerVisible.value.background === false) return ''
    if (bgFromDirective.value) return BASE_URL + bgFromDirective.value
    const scene = ctx.getCurrentScene()
    return scene?.background_url
      ? BASE_URL + scene.background_url
      : (ctx.getDefaultBackground?.() ?? '')
  })

  // 立绘差分层：返回 [基础图, ...叠加层]；按 order 从小到大
  const avatarLayersOf = (avatarId: number) => {
    if (!avatarId) return []
    for (const char of ctx.getCharacters()) {
      const avatar = (char.avatars || []).find((a: any) => a.avatar_id === avatarId)
      if (!avatar || !avatar.image_url) continue
      const layers = (avatar.layers || [])
        .filter((l: any) => l && l.image_url)
        .slice()
        .sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .map((l: any) => BASE_URL + l.image_url)
      return [BASE_URL + avatar.image_url, ...layers]
    }
    return []
  }

  const defaultAvatarLayersOf = (characterId: number) => {
    const c = ctx.getCharacters().find((x: any) => x.character_id === characterId)
    if (!c) return []
    const list = c.avatars || []
    const def = list.find((a: any) => a.is_default) || list[0]
    if (def && def.avatar_id) {
      const layers = avatarLayersOf(def.avatar_id)
      if (layers.length) return layers
    }
    return c.avatar_url ? [BASE_URL + c.avatar_url] : []
  }

  const loadDirectiveData = async () => {
    try {
      const rows = await listDirectives(ctx.getProjectId())
      const map: any = {}
      for (const r of rows) {
        if (!map[r.content_id]) map[r.content_id] = []
        map[r.content_id].push(r)
      }
      directivesByContent.value = map
    } catch (e) {
      console.warn('读取演出指令失败:', e)
      directivesByContent.value = {}
    }
  }

  const resetStage = () => {
    stageAvatars.value = {}
    bgFromDirective.value = ''
    bgTransition.value = 'fade'
    bgDuration.value = 400
    fgFromDirective.value = ''
    stageLayerVisible.value = { background: true, foreground: true, dialogue: true }
    ctx.onReset?.()
  }

  /* ===== 背景淡入淡出 / 硬切 / 黑场 ===== */
  const bgShown = ref('')
  const bgFading = ref(false)
  const bgBlackout = ref(false)
  let bgSwapTimer: ReturnType<typeof setTimeout> | null = null

  const swapBackground = (url: string) => {
    if (bgSwapTimer) {
      clearTimeout(bgSwapTimer)
      bgSwapTimer = null
    }
    if (!url || url === bgShown.value) return

    const transition = bgTransition.value || 'fade'
    const duration = Math.max(100, Number(bgDuration.value) || 400)

    // 硬切：直接换图，不做任何过渡
    if (transition === 'cut') {
      bgFading.value = false
      bgBlackout.value = false
      bgShown.value = url
      return
    }

    // 先淡出旧图（黑场则同时压黑），换完图并解码成功后再淡入
    bgFading.value = true
    if (transition === 'black') bgBlackout.value = true
    bgSwapTimer = setTimeout(() => {
      bgShown.value = url
      const img = new Image()
      const done = () => {
        bgFading.value = false
        bgBlackout.value = false
        bgSwapTimer = null
      }
      img.onload = done
      img.onerror = done
      img.src = url
    }, transition === 'black' ? Math.floor(duration / 2) : 260)
  }

  watch(stageBackground, (url) => {
    // 背景层被 stage 指令隐藏时，直接清空当前背景，避免残留
    if (!url) {
      if (bgSwapTimer) {
        clearTimeout(bgSwapTimer)
        bgSwapTimer = null
      }
      bgFading.value = false
      bgBlackout.value = false
      bgShown.value = ''
      return
    }
    if (!bgShown.value) {
      bgShown.value = url
      return
    }
    swapBackground(url)
  }, { immediate: true })

  /* ===== 前景图层 ===== */
  const fgShown = ref('')
  const fgFading = ref(false)
  let fgSwapTimer: ReturnType<typeof setTimeout> | null = null

  watch(
    () => (fgFromDirective.value ? BASE_URL + fgFromDirective.value : ''),
    (url) => {
      if (fgSwapTimer) {
        clearTimeout(fgSwapTimer)
        fgSwapTimer = null
      }
      if (!url) {
        fgShown.value = ''
        fgFading.value = false
        return
      }
      fgFading.value = true
      fgSwapTimer = setTimeout(() => {
        fgShown.value = url
        const img = new Image()
        const done = () => {
          fgFading.value = false
          fgSwapTimer = null
        }
        img.onload = done
        img.onerror = done
        img.src = url
      }, 180)
    }
  )

  // 离开播放器时清理未完成的背景/前景过渡
  const clearStageTransitions = () => {
    if (bgSwapTimer) {
      clearTimeout(bgSwapTimer)
      bgSwapTimer = null
    }
    if (fgSwapTimer) {
      clearTimeout(fgSwapTimer)
      fgSwapTimer = null
    }
  }

  return {
    stageAvatars,
    bgFromDirective,
    bgTransition,
    bgDuration,
    fgFromDirective,
    directivesByContent,
    stageLayerVisible,
    stageLayers,
    hasStageAvatars,
    stageBackground,
    avatarLayersOf,
    defaultAvatarLayersOf,
    loadDirectiveData,
    resetStage,
    clearStageTransitions,
    bgShown,
    bgFading,
    bgBlackout,
    fgShown,
    fgFading,
  }
}
