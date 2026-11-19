/**
 * 播放器阅读设置：localStorage 持久化、音量应用、全屏切换。
 *
 * 音量与打字机属于播放器运行时，通过回调注入，避免 composable 反向依赖父组件。
 */
import { ref, watch } from 'vue'

export interface PlayerSettings {
  textSpeed: number
  autoDelay: number
  bgmVolume: number
  voiceVolume: number
  fullscreen: boolean
  skipRead: boolean
  boxStyle: string
  fontSize: number
  lineHeight: number
  showVariableNotice: boolean
  voiceEnabled: boolean
  spriteMotion: boolean
  audioDrama: boolean
  language: string
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  textSpeed: 2,      // 0 瞬间 / 1 快 / 2 正常 / 3 慢
  autoDelay: 3,      // 自动播放间隔（秒）
  bgmVolume: 60,     // 0-100
  voiceVolume: 80,   // 0-100
  fullscreen: false,
  skipRead: false,   // 跳过已读
  boxStyle: 'classic', // classic 经典底栏 / bubble 气泡对话
  fontSize: 18,      // 对话字号 14-24
  lineHeight: 1.6,   // 对话行距 1.3-2.2
  showVariableNotice: true, // 变量变化时显示「好感度 +5」浮层
  voiceEnabled: true, // 自动播放台词语音
  spriteMotion: true, // 立绘轻微呼吸动态
  audioDrama: false, // 有声剧模式：隐藏立绘与背景，只保留对白/旁白/音效/选项
  language: 'zh-CN', // 阅读语言：zh-CN 原文，其余语言优先显示译文
}

const SETTINGS_KEY = 'aigc:player:settings'

export interface UsePlayerSettingsOptions {
  /** 设置变化后立即应用音量等副作用 */
  onSettingsChange?: () => void
  /** 恢复默认后重新显示当前句 */
  onReset?: () => void
}

export function usePlayerSettings(options: UsePlayerSettingsOptions = {}) {
  const playerSettings = ref<PlayerSettings>({ ...DEFAULT_PLAYER_SETTINGS })
  const settingsVisible = ref(false)

  const loadSettings = () => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) {
        playerSettings.value = { ...DEFAULT_PLAYER_SETTINGS, ...JSON.parse(raw) }
      }
      // 全屏状态以浏览器实际状态为准（刷新后不会自动全屏）
      playerSettings.value.fullscreen = !!document.fullscreenElement
    } catch (e) {
      console.warn('读取阅读设置失败，使用默认值:', e)
    }
  }

  const saveSettings = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(playerSettings.value))
    } catch (e) {
      console.warn('保存阅读设置失败:', e)
    }
  }

  const openSettings = () => {
    settingsVisible.value = true
  }

  const resetSettings = () => {
    playerSettings.value = { ...DEFAULT_PLAYER_SETTINGS }
    saveSettings()
    options.onSettingsChange?.()
    options.onReset?.()
  }

  const toggleFullscreen = async (val: boolean) => {
    try {
      if (val && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else if (!val && document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch (e) {
      // 浏览器不允许（或 headless 不支持）时回滚开关状态
      playerSettings.value.fullscreen = !!document.fullscreenElement
      console.warn('全屏切换失败:', e)
    }
  }

  // 设置变化：持久化并立即应用音量
  watch(playerSettings, () => {
    saveSettings()
    options.onSettingsChange?.()
  }, { deep: true })

  return {
    playerSettings,
    settingsVisible,
    loadSettings,
    saveSettings,
    openSettings,
    resetSettings,
    toggleFullscreen,
  }
}
