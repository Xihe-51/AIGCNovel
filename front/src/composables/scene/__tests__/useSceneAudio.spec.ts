import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { formatClock, useSceneAudio } from '@/composables/scene/useSceneAudio'

const createAudio = (overrides: Record<string, any> = {}) => ({
  paused: true,
  currentTime: 0,
  duration: 0,
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  ...overrides,
})

const createAudioComposable = (overrides: { scene?: any; settingsAudio?: any; backgroundMusic?: any } = {}) => {
  const scene = overrides.scene ?? ref<any>({ music_url: 'bgm.mp3' })
  const settingsAudio = overrides.settingsAudio ?? ref<any>(createAudio())
  const backgroundMusic = overrides.backgroundMusic ?? ref<any>(createAudio({ paused: false }))
  const audio = useSceneAudio({ scene, settingsAudio, backgroundMusic })
  return { audio, scene, settingsAudio, backgroundMusic }
}

describe('formatClock', () => {
  it('非法值回落 0:00', () => {
    expect(formatClock(null)).toBe('0:00')
    expect(formatClock(undefined)).toBe('0:00')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(Number.NaN)).toBe('0:00')
  })

  it('不足一分钟时补零', () => {
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(59)).toBe('0:59')
  })

  it('整分钟与秒取整', () => {
    expect(formatClock(60)).toBe('1:00')
    expect(formatClock(125.9)).toBe('2:05')
  })
})

describe('useSceneAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('试听开始前先停掉舞台 BGM', async () => {
    const { audio, settingsAudio, backgroundMusic } = createAudioComposable()

    audio.toggleMusic()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(backgroundMusic.value.pause).toHaveBeenCalled()
    expect(backgroundMusic.value.currentTime).toBe(0)
    expect(settingsAudio.value.play).toHaveBeenCalled()
    expect(audio.musicPlaying.value).toBe(true)
  })

  it('再次点击试听则暂停', () => {
    const settingsAudio = ref<any>(createAudio({ paused: false }))
    const { audio } = createAudioComposable({ settingsAudio })

    audio.toggleMusic()

    expect(settingsAudio.value.pause).toHaveBeenCalled()
    expect(audio.musicPlaying.value).toBe(false)
  })

  it('没有试听元素时点击不抛错', () => {
    const { audio } = createAudioComposable({ settingsAudio: ref<any>(null) })

    expect(() => audio.toggleMusic()).not.toThrow()
    expect(audio.musicPlaying.value).toBe(false)
  })

  it('BGM 默认静音，开关切换时播放与停播', () => {
    const { audio, backgroundMusic } = createAudioComposable()

    expect(audio.bgmMuted.value).toBe(true)

    audio.toggleBgm()
    expect(audio.bgmMuted.value).toBe(false)
    expect(backgroundMusic.value.play).toHaveBeenCalled()

    audio.toggleBgm()
    expect(audio.bgmMuted.value).toBe(true)
    expect(backgroundMusic.value.pause).toHaveBeenCalled()
  })

  it('场景没有音乐时开启 BGM 不播放', () => {
    const { audio, backgroundMusic } = createAudioComposable({ scene: ref<any>({}) })

    audio.toggleBgm()

    expect(audio.bgmMuted.value).toBe(false)
    expect(backgroundMusic.value.play).not.toHaveBeenCalled()
  })

  it('关闭试听会复位播放态与进度', () => {
    const { audio, settingsAudio } = createAudioComposable()
    audio.musicPlaying.value = true
    audio.musicProgress.value = 12

    audio.stopSettingsAudio()

    expect(settingsAudio.value.pause).toHaveBeenCalled()
    expect(settingsAudio.value.currentTime).toBe(0)
    expect(audio.musicPlaying.value).toBe(false)
    expect(audio.musicProgress.value).toBe(0)
  })

  it('播放进度与时长同步到响应式状态', () => {
    const { audio, settingsAudio } = createAudioComposable()
    settingsAudio.value.currentTime = 8
    settingsAudio.value.duration = 90

    audio.onMusicTime()
    audio.onMusicMeta()

    expect(audio.musicProgress.value).toBe(8)
    expect(audio.musicDuration.value).toBe(90)
  })

  it('拖动进度条写入音频元素', () => {
    const { audio, settingsAudio } = createAudioComposable()

    audio.seekMusic({ target: { value: '42' } })

    expect(settingsAudio.value.currentTime).toBe(42)
    expect(audio.musicProgress.value).toBe(42)
  })

  it('元素为空时同步与拖动都不抛错', () => {
    const { audio } = createAudioComposable({ settingsAudio: ref<any>(null) })

    expect(() => audio.onMusicTime()).not.toThrow()
    expect(() => audio.onMusicMeta()).not.toThrow()
    expect(() => audio.seekMusic({ target: { value: '3' } })).not.toThrow()
    expect(audio.musicDuration.value).toBe(0)
  })
})
