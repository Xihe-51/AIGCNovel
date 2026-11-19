/**
 * 播放器演出指令：把节点上的 avatar / background / music / sound / wait / effect / stage 指令
 * 应用到舞台与音频状态。
 *
 * 舞台状态以 ref 注入、副作用以适配器注入，composable 只负责解析指令，
 * 不持有播放流程状态，也不发请求。
 */
import type { Ref } from 'vue'
import { BASE_URL } from '@/utils/request'
import { layerIdOf, layerNameOf, layerOrderOf, stageDefaultX } from './usePlayerStage'

export interface PlayerDirectivesContext {
  /** content_id → 该节点的指令列表 */
  getDirectivesByContent: () => Record<string, any[]>
  stageAvatars: Ref<any>
  stageLayerVisible: Ref<any>
  fgFromDirective: Ref<string>
  bgFromDirective: Ref<string>
  bgTransition: Ref<string>
  bgDuration: Ref<number>
  getBackgroundMusic: () => HTMLAudioElement | null
  fadeBgmTo: (volume: number, duration: number) => void
  getBgmTargetVolume: () => number
  /** 立绘差分层来源：基础图 + 叠加层 */
  avatarLayersOf: (avatarId: number) => string[]
  /** 角色默认立绘来源 */
  defaultAvatarLayersOf: (characterId: number) => string[]
  /** 角色显示名：无立绘素材时用于占位名字牌 */
  characterNameOf?: (characterId: number) => string
  triggerEffect: (payload: any) => void
  scheduleWait: (ms: number) => void
}

/** 立绘定位：旧指令用 position + sprite，统一折算成舞台百分比坐标 */
export const buildAvatarBoxStyle = (layerId: string, payload: any): Record<string, any> => {
  const legacy = payload.coord !== 'stage'
  const x = legacy ? stageDefaultX(layerId) : (Number(payload.x) || 0)
  const y = legacy ? 100 : (Number(payload.y) || 0)
  const boxStyle: Record<string, any> = {
    left: `${x}%`,
    top: `${y}%`,
    bottom: 'auto',
    right: 'auto',
    transform: 'translate(-50%, -100%)',
    zIndex: 10 + layerOrderOf(payload),
  }
  if (payload.visible === false) boxStyle.display = 'none'
  return boxStyle
}

/** 立绘图层：没有可用素材时返回 null，保持原图层不变 */
export const buildAvatarLayer = (payload: any, sources: string[]): Record<string, any> | null => {
  const src = (sources || [])[0]
  if (!src) return null
  const layerId = layerIdOf(payload)
  const scale = Number(payload.scale) || 1
  const rotate = Number(payload.rotate) || 0
  const opacity = payload.opacity === undefined || payload.opacity === null
    ? 1
    : Number(payload.opacity)
  return {
    layer_id: layerId,
    layer_name: layerNameOf(payload),
    order: layerOrderOf(payload),
    visible: payload.visible !== false,
    src,
    sources,
    style: {
      transform: `scale(${scale}) rotate(${rotate}deg)`,
      opacity,
    },
    boxStyle: buildAvatarBoxStyle(layerId, payload),
  }
}

/**
 * 占位图层：角色还没有任何立绘素材（例如编译器建的占位角色）时使用。
 * 不画图，只给舞台留出位置与名字牌，避免「指令生效但画面空白」被误判成没执行。
 */
export const buildAvatarPlaceholder = (payload: any, name: string): Record<string, any> => {
  const layerId = layerIdOf(payload)
  const scale = Number(payload.scale) || 1
  const rotate = Number(payload.rotate) || 0
  const opacity = payload.opacity === undefined || payload.opacity === null
    ? 1
    : Number(payload.opacity)
  return {
    layer_id: layerId,
    layer_name: layerNameOf(payload),
    order: layerOrderOf(payload),
    visible: payload.visible !== false,
    placeholder: true,
    name: name || '',
    src: '',
    sources: [],
    style: {
      transform: `scale(${scale}) rotate(${rotate}deg)`,
      opacity,
    },
    boxStyle: buildAvatarBoxStyle(layerId, payload),
  }
}

/** 已有真实素材的图层：占位层不得覆盖它 */
export const hasAvatarArt = (layer: any) => (
  !!layer
  && layer.placeholder !== true
  && (!!layer.src || (Array.isArray(layer.sources) && layer.sources.length > 0))
)

/** 节点级舞台显隐：只接受布尔值，未提供则保留原状态 */
export const applyStageVisibility = (current: any, payload: any): any => {
  const next = { ...(current || {}) }
  if (typeof payload.background === 'boolean') next.background = payload.background
  if (typeof payload.foreground === 'boolean') next.foreground = payload.foreground
  if (typeof payload.dialogue === 'boolean') next.dialogue = payload.dialogue
  return next
}

export function usePlayerDirectives(ctx: PlayerDirectivesContext) {
  const applyDirectives = (dialogue: any) => {
    if (!dialogue) return
    const list = ctx.getDirectivesByContent()[dialogue.content_id] || []
    if (!list.length) return

    const next = { ...ctx.stageAvatars.value }
    let waitMs = 0
    let lastEffect: any = null

    for (const d of list) {
      const p = d.payload || {}
      if (d.directive_type === 'avatar') {
        const layerId = layerIdOf(p)
        if (p.action === 'hide') {
          delete next[layerId]
        } else {
          const assetSources = p.image_url ? [BASE_URL + p.image_url] : []
          const avatarSources = ctx.avatarLayersOf(p.avatar_id)
          const fallbackSources = assetSources.length
            ? assetSources
            : (avatarSources.length ? avatarSources : ctx.defaultAvatarLayersOf(p.character_id))
          const layer = buildAvatarLayer(p, fallbackSources)
          if (layer) {
            next[layerId] = layer
          } else if (p.character_id && !hasAvatarArt(next[layerId])) {
            next[layerId] = buildAvatarPlaceholder(p, ctx.characterNameOf?.(p.character_id) || '')
          }
        }
      } else if (d.directive_type === 'background') {
        if (p.layer === 'foreground') {
          ctx.fgFromDirective.value = p.url || ''
        } else {
          ctx.bgTransition.value = p.transition || 'fade'
          ctx.bgDuration.value = Number(p.duration_ms) || 400
          ctx.bgFromDirective.value = p.url || ''
        }
      } else if (d.directive_type === 'music') {
        const music = ctx.getBackgroundMusic()
        if (p.action === 'stop') {
          if (music) {
            music.pause()
            music.currentTime = 0
          }
        } else if (p.url && music) {
          music.src = BASE_URL + p.url
          music.volume = 0
          music.play().then(() => {
            ctx.fadeBgmTo(ctx.getBgmTargetVolume(), 600)
          }).catch(() => {})
        }
      } else if (d.directive_type === 'sound' && p.url) {
        const audio = new Audio(BASE_URL + p.url)
        audio.volume = 1
        audio.play().catch(() => {})
      } else if (d.directive_type === 'wait') {
        waitMs += Math.max(0, Number(p.ms) || 0)
      } else if (d.directive_type === 'effect') {
        lastEffect = p
      } else if (d.directive_type === 'stage') {
        ctx.stageLayerVisible.value = applyStageVisibility(ctx.stageLayerVisible.value, p)
      }
    }

    ctx.stageAvatars.value = next
    if (lastEffect) ctx.triggerEffect(lastEffect)
    if (waitMs) ctx.scheduleWait(waitMs)
  }

  return { applyDirectives }
}
