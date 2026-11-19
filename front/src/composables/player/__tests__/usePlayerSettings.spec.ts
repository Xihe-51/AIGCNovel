import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { DEFAULT_PLAYER_SETTINGS, usePlayerSettings } from '@/composables/player/usePlayerSettings'
import { withSetup } from '@/__tests__/helpers'

const SETTINGS_KEY = 'aigc:player:settings'

describe('usePlayerSettings', () => {
  it('没有本地记录时使用默认设置', () => {
    const { result, wrapper } = withSetup(() => usePlayerSettings())
    result.loadSettings()
    expect(result.playerSettings.value).toMatchObject(DEFAULT_PLAYER_SETTINGS)
    expect(result.playerSettings.value.fullscreen).toBe(false)
    wrapper.unmount()
  })

  it('读取本地设置时与默认值合并，缺字段不丢默认', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ bgmVolume: 20, language: 'zh-TW' }))
    const { result, wrapper } = withSetup(() => usePlayerSettings())
    result.loadSettings()
    expect(result.playerSettings.value.bgmVolume).toBe(20)
    expect(result.playerSettings.value.language).toBe('zh-TW')
    expect(result.playerSettings.value.voiceVolume).toBe(DEFAULT_PLAYER_SETTINGS.voiceVolume)
    wrapper.unmount()
  })

  it('本地数据损坏时回退默认值且不抛错', () => {
    localStorage.setItem(SETTINGS_KEY, '{not-json')
    const { result, wrapper } = withSetup(() => usePlayerSettings())
    expect(() => result.loadSettings()).not.toThrow()
    expect(result.playerSettings.value.textSpeed).toBe(DEFAULT_PLAYER_SETTINGS.textSpeed)
    wrapper.unmount()
  })

  it('全屏状态以浏览器实际状态为准', () => {
    Object.defineProperty(document, 'fullscreenElement', { value: {}, configurable: true })
    const { result, wrapper } = withSetup(() => usePlayerSettings())
    result.loadSettings()
    expect(result.playerSettings.value.fullscreen).toBe(true)
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    wrapper.unmount()
  })

  it('设置变化时自动持久化并触发回调', async () => {
    const onSettingsChange = vi.fn()
    const { result, wrapper } = withSetup(() => usePlayerSettings({ onSettingsChange }))
    result.playerSettings.value.voiceVolume = 45
    await nextTick()
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').voiceVolume).toBe(45)
    expect(onSettingsChange).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('resetSettings 恢复默认并触发 onReset', () => {
    const onReset = vi.fn()
    const { result, wrapper } = withSetup(() => usePlayerSettings({ onReset }))
    result.playerSettings.value.fontSize = 24
    result.resetSettings()
    expect(result.playerSettings.value.fontSize).toBe(DEFAULT_PLAYER_SETTINGS.fontSize)
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').fontSize)
      .toBe(DEFAULT_PLAYER_SETTINGS.fontSize)
    wrapper.unmount()
  })

  it('浏览器不支持全屏时回滚开关状态', async () => {
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    const { result, wrapper } = withSetup(() => usePlayerSettings())
    result.playerSettings.value.fullscreen = true
    await result.toggleFullscreen(true)
    expect(result.playerSettings.value.fullscreen).toBe(false)
    wrapper.unmount()
  })
})
