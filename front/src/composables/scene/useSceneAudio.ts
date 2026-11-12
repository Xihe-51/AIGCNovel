/**
 * 场景音频：场景设置里的试听播放器 + 舞台预览 BGM。
 *
 * 两条音轨互斥：试听开始时先停掉舞台 BGM，避免同时出声。
 * BGM 默认静音，只有作者手动点「BGM 开」才播放，防止打开场景就自动响。
 *
 * `settingsAudio` / `backgroundMusic` 是模板 ref（`ref="..."`），
 * 只能在组件里创建后注入，composable 不持有它们的所有权。
 */
import type { Ref } from 'vue'
import { ref } from 'vue'

/** 秒 → m:ss，非法值回落 0:00。纯函数，便于单测。 */
export const formatClock = (seconds: number | null | undefined) => {
  if (!seconds || Number.isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  return `${m}:${sec < 10 ? '0' : ''}${sec}`
}

export interface SceneAudioContext {
  scene: Ref<any>
  settingsAudio: Ref<any>
  backgroundMusic: Ref<any>
}

export function useSceneAudio(ctx: SceneAudioContext) {
  const { scene, settingsAudio, backgroundMusic } = ctx

  const musicPlaying = ref(false)
  const musicProgress = ref(0)
  const musicDuration = ref(0)
  // 默认静音：只有手动点「BGM 开」才播放，避免打开场景就自动响
  const bgmMuted = ref(true)

  const stopBackgroundMusic = () => {
    const audio = backgroundMusic.value
    if (!audio) return
    try {
      audio.pause()
      audio.currentTime = 0
    } catch (e) {
      // 忽略浏览器限制导致的暂停失败
    }
  }

  const stopSettingsAudio = () => {
    const el = settingsAudio.value
    if (!el) return
    try {
      el.pause()
      el.currentTime = 0
    } catch (e) {
      // 忽略浏览器限制导致的暂停失败
    }
    musicPlaying.value = false
    musicProgress.value = 0
  }

  const playBackgroundMusic = () => {
    if (!bgmMuted.value && backgroundMusic.value && scene.value.music_url) {
      backgroundMusic.value.play().catch((e: any) => {
        console.log('背景音乐自动播放失败:', e)
      })
    }
  }

  const toggleBgm = () => {
    bgmMuted.value = !bgmMuted.value
    if (bgmMuted.value) stopBackgroundMusic()
    else playBackgroundMusic()
  }

  /** 场景设置里的试听：与舞台 BGM 二选一，避免两条音轨同时出声。 */
  const toggleMusic = () => {
    const el = settingsAudio.value
    if (!el) return
    if (el.paused) {
      stopBackgroundMusic()
      el.play()
        .then(() => {
          musicPlaying.value = true
        })
        .catch(() => {})
    } else {
      el.pause()
      musicPlaying.value = false
    }
  }

  const onMusicTime = () => {
    if (settingsAudio.value) musicProgress.value = settingsAudio.value.currentTime
  }

  const onMusicMeta = () => {
    if (settingsAudio.value) musicDuration.value = settingsAudio.value.duration || 0
  }

  const seekMusic = (e: any) => {
    const v = Number(e.target.value)
    if (settingsAudio.value) settingsAudio.value.currentTime = v
    musicProgress.value = v
  }

  return {
    musicPlaying,
    musicProgress,
    musicDuration,
    bgmMuted,
    formatClock,
    playBackgroundMusic,
    toggleBgm,
    stopBackgroundMusic,
    stopSettingsAudio,
    toggleMusic,
    onMusicTime,
    onMusicMeta,
    seekMusic,
  }
}
