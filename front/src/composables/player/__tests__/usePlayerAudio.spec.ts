import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { usePlayerAudio } from '@/composables/player/usePlayerAudio'
import { DEFAULT_PLAYER_SETTINGS } from '@/composables/player/usePlayerSettings'
import { withSetup } from '@/__tests__/helpers'

const createAudio = (overrides: Record<string, unknown> = {}) => ({
	paused: false,
	volume: 0,
	currentTime: 0,
	play: vi.fn(() => Promise.resolve()),
	pause: vi.fn(),
	...overrides,
}) as any

const setup = (options: {
	bgm?: any
	voice?: any
	settings?: Record<string, unknown>
	scene?: any
} = {}) => {
	const backgroundMusic = ref<HTMLAudioElement | null>(options.bgm ?? createAudio())
	const dialogueVoice = ref<HTMLAudioElement | null>(options.voice ?? createAudio())
	const playerSettings = ref({ ...DEFAULT_PLAYER_SETTINGS, ...(options.settings || {}) })
	const { result, wrapper } = withSetup(() => usePlayerAudio({
		backgroundMusic,
		dialogueVoice,
		playerSettings,
		getCurrentScene: () => options.scene ?? null,
	}))
	return { result, wrapper, backgroundMusic, dialogueVoice, playerSettings }
}

describe('usePlayerAudio', () => {
	it('目标音量按用户设置计算，语音播放时压到 35%', () => {
		const { result, wrapper } = setup({ bgm: createAudio({ paused: true }) })
		expect(result.bgmTargetVolume()).toBeCloseTo(0.6)
		result.onVoicePlay()
		expect(result.bgmTargetVolume()).toBeCloseTo(0.21)
		result.onVoiceEnded()
		expect(result.bgmTargetVolume()).toBeCloseTo(0.6)
		wrapper.unmount()
	})

	it('applyVolumes 同时应用 BGM 与语音音量', () => {
		const bgm = createAudio({ paused: true })
		const voice = createAudio()
		const { result, wrapper } = setup({ bgm, voice, settings: { bgmVolume: 40, voiceVolume: 50 } })
		result.applyVolumes()
		expect(bgm.volume).toBeCloseTo(0.4)
		expect(voice.volume).toBeCloseTo(0.5)
		wrapper.unmount()
	})

	it('语音音量直接作用于 dialogueVoice 引用，不依赖 DOM 位置', () => {
		const stray = document.createElement('audio')
		stray.className = 'dialogue-display-audio'
		document.body.appendChild(stray)
		const voice = createAudio()
		const { result, wrapper } = setup({ voice, settings: { voiceVolume: 30 } })
		result.applyVolumes()
		expect(voice.volume).toBeCloseTo(0.3)
		expect(stray.volume).toBe(1)
		stray.remove()
		wrapper.unmount()
	})

	it('BGM 播放中语音闪避会淡出到闪避音量，语音结束后淡回', () => {
		vi.useFakeTimers()
		const bgm = createAudio({ paused: false, volume: 0.6 })
		const { result, wrapper } = setup({ bgm })
		result.onVoicePlay()
		vi.advanceTimersByTime(300)
		expect(bgm.volume).toBeCloseTo(0.21, 2)
		result.onVoiceEnded()
		vi.advanceTimersByTime(500)
		expect(bgm.volume).toBeCloseTo(0.6, 2)
		wrapper.unmount()
		vi.useRealTimers()
	})

	it('重复设置相同的闪避状态不会重算', () => {
		const bgm = createAudio({ paused: false, volume: 0.6 })
		const { result, wrapper } = setup({ bgm })
		result.onVoicePlay()
		const first = bgm.volume
		result.onVoicePlay()
		expect(bgm.volume).toBe(first)
		wrapper.unmount()
	})

	it('replayVoice 从头播放并应用语音音量', () => {
		const voice = createAudio({ currentTime: 5 })
		const { result, wrapper } = setup({ voice, settings: { voiceVolume: 50 } })
		result.replayVoice()
		expect(voice.currentTime).toBe(0)
		expect(voice.volume).toBeCloseTo(0.5)
		expect(voice.play).toHaveBeenCalledTimes(1)
		wrapper.unmount()
	})

	it('没有语音元素时 replayVoice 静默返回', () => {
		const { result, wrapper } = setup({ voice: null })
		expect(() => result.replayVoice()).not.toThrow()
		wrapper.unmount()
	})

	it('标签页重新可见时把淡变直接补到终值', () => {
		const bgm = createAudio({ paused: false, volume: 0.6 })
		const { result, wrapper } = setup({ bgm })
		result.fadeBgmTo(0.21, 900)
		expect(bgm.volume).toBeGreaterThan(0.21)
		result.onBgmVisibilityChange()
		expect(bgm.volume).toBeCloseTo(0.21)
		wrapper.unmount()
	})

	it('stopBackgroundMusic 暂停并归零进度', () => {
		const bgm = createAudio({ currentTime: 12 })
		const { result, wrapper } = setup({ bgm })
		result.stopBackgroundMusic()
		expect(bgm.pause).toHaveBeenCalled()
		expect(bgm.currentTime).toBe(0)
		wrapper.unmount()
	})
})
