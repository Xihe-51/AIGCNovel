export interface UiTheme {
  key: string
  label: string
  desc: string
  /** 预览色块：容器背景 / 对话框 / 强调色 */
  swatches: [string, string, string]
}

/** 播放器 UI 皮肤；key 与后端 UI_THEMES 保持一致 */
export const UI_THEMES: UiTheme[] = [
  {
    key: 'classic',
    label: '经典粉白',
    desc: '默认风格，浅色对话框 + 粉色强调',
    swatches: ['#fff5f7', 'rgba(255,255,255,0.92)', '#d81f37']
  },
  {
    key: 'sakura',
    label: '樱花',
    desc: '奶白底 + 樱粉描边，偏少女向',
    swatches: ['#fff1f4', '#fffaf7', '#e58aa8']
  },
  {
    key: 'ink',
    label: '水墨',
    desc: '宣纸底 + 墨色文字，适合古风',
    swatches: ['#f3efe6', 'rgba(250,247,240,0.94)', '#3d3a33']
  },
  {
    key: 'midnight',
    label: '午夜',
    desc: '深蓝底 + 冷色文字，适合悬疑/科幻',
    swatches: ['#101623', 'rgba(23,30,46,0.92)', '#8ab4ff']
  },
  {
    key: 'mint',
    label: '薄荷',
    desc: '浅绿底 + 青绿强调，清爽明亮',
    swatches: ['#eefaf3', 'rgba(255,255,255,0.94)', '#1f8f6a']
  }
]

export const themeClass = (key?: string | null) => `theme-${key || 'classic'}`
