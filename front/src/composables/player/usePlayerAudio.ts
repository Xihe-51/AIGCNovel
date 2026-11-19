/**
 * 播放器音频：BGM 淡入淡出、语音闪避、音量应用与语音重播。
 *
 * 上下文通过 ref / getter 注入，避免 composable 反向依赖播放器页面。
 * 用 setInterval + Date.now() 计时而非 requestAnimationFrame：
 * 后台标签页 rAF 会被完全暂停，淡入会卡在中间音量（甚至 0，音频仍在播）。
 */
import { onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { PlayerSettings } from './usePlayerSettings'

export interface PlayerAudioContext {
  backgroundMusic: Ref<HTMLAudioElement | null>
  dialogueVoice: Ref<HTMLAudioElement | null>
  playerSettings: Ref<PlayerSettings>
  getCurrentScene: () => any
}

export function usePlayerAudio(ctx: PlayerAudioContext) {
  let bgmFadeTimer: ReturnType<typeof setInterval> | null = null
  let bgmFadeTarget = 0
  let bgmDuckActive = false

  const cancelBgmFade = () => {
    if (bgmFadeTimer) clearInterval(bgmFadeTimer)
    bgmFadeTimer = null
  }

  // 目标音量：用户设置 × 闪避系数（语音播放时压到 35%）
  const bgmTargetVolume = () => (
    (ctx.playerSettings.value.bgmVolume / 100) * (bgmDuckActive ? 0.35 : 1)
  )

  const fadeBgmTo = (target: number, duration = 600) => {
    const audio = ctx.backgroundMusic.value
    if (!audio) return
    cancelBgmFade()
    const from = Number(audio.volume) || 0
    const to = Math.max(0, Math.min(1, target))
    bgmFadeTarget = to
    if (duration <= 0 || Math.abs(to - from) < 0.001) {
      audio.volume = to
      return
    }
    const startAt = Date.now()
    const tick = () => {
      const t = Math.min(1, (Date.now() - startAt) / duration)
      audio.volume = from + (to - from) * t
      if (t >= 1) {
        cancelBgmFade()
        audio.volume = to // 终值兜底
      }
    }
    bgmFadeTimer = setInterval(tick, 40)
    tick() // 立即走一步，避免等第一个 interval
  }

  // 标签页重新可见时，若淡入还没结束就直接补到终值，不依赖被暂停的定时器
  const onBgmVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return
    const audio = ctx.backgroundMusic.value
    if (audio && bgmFadeTimer) {
      cancelBgmFade()
      audio.volume = bgmFadeTarget
    }
  }

  // 播放背景音乐（同一首持续播放时只微调音量，不重头播放）
  const playBackgroundMusic = () => {
    const audio = ctx.backgroundMusic.value
    const scene = ctx.getCurrentScene()
    if (!audio || !scene?.music_url) return
    const target = bgmTargetVolume()
    if (!audio.paused) {
      fadeBgmTo(target, 400)
      return
    }
    audio.volume = 0
    audio.play().then(() => {
      fadeBgmTo(target, 900)
    }).catch(e => {
      console.log('背景音乐自动播放失败，需要用户交互后才能播放:', e)
    })
  }

  // 停止背景音乐
  const stopBackgroundMusic = () => {
    cancelBgmFade()
    if (ctx.backgroundMusic.value) {
      ctx.backgroundMusic.value.pause()
      ctx.backgroundMusic.value.currentTime = 0
    }
  }

  // 语音播放期间压低 BGM，语音结束/暂停后恢复
  const setBgmDucking = (active: boolean) => {
    if (bgmDuckActive === active) return
    bgmDuckActive = active
    const audio = ctx.backgroundMusic.value
    if (audio && !audio.paused) fadeBgmTo(bgmTargetVolume(), active ? 250 : 450)
  }

  const onVoicePlay = () => setBgmDucking(true)
  const onVoiceEnded = () => setBgmDucking(false)

  // 阅读设置变化或读档后统一应用音量
  const applyVolumes = () => {
    const bgm = ctx.backgroundMusic.value
    if (bgm) {
      if (bgm.paused) bgm.volume = bgmTargetVolume()
      else fadeBgmTo(bgmTargetVolume(), 200)
    }
    const voice = ctx.dialogueVoice.value
    if (voice) voice.volume = ctx.playerSettings.value.voiceVolume / 100
  }

  // 重播本句语音（语音总开关关闭时按钮不显示）
  const replayVoice = () => {
    const audio = ctx.dialogueVoice.value
    if (!audio) return
    try {
      audio.currentTime = 0
      audio.volume = ctx.playerSettings.value.voiceVolume / 100
      audio.play().catch(() => { /* 浏览器拦截时忽略 */ })
    } catch (_) { /* ignore */ }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onBgmVisibilityChange)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onBgmVisibilityChange)
    cancelBgmFade()
  })

  return {
    cancelBgmFade,
    bgmTargetVolume,
    fadeBgmTo,
    playBackgroundMusic,
    stopBackgroundMusic,
    setBgmDucking,
    onVoicePlay,
    onVoiceEnded,
    onBgmVisibilityChange,
    applyVolumes,
    replayVoice,
  }
}
