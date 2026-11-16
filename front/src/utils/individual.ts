export const MODEL_TYPE_OPTIONS = ['text', 'image', 'audio'] as const

export type ModelType = (typeof MODEL_TYPE_OPTIONS)[number]

export type ModelIconName = 'Collection' | 'Picture' | 'Microphone' | 'Cpu'

const GENRE_COLORS: Record<string, string> = {
  '悬疑': '#6c5b7b',
  '恋爱': '#ffb7c5',
  '科幻': '#5d5fef',
  '奇幻': '#c9a9e8',
  '历史': '#c49a6c',
  '现代': '#a8e6cf',
  '其他': '#b8b8b8'
}

const DEFAULT_GENRE_COLOR = '#ffb7c5'

const MODEL_ICONS: Record<string, ModelIconName> = {
  text: 'Collection',
  image: 'Picture',
  audio: 'Microphone'
}

const DEFAULT_MODEL_ICON: ModelIconName = 'Cpu'

const MODEL_ACCENT_COLORS: Record<string, string> = {
  text: '#5d5fef',
  image: '#ffb7c5',
  audio: '#a8e6cf'
}

const DEFAULT_MODEL_ICON_COLOR = '#c9a9e8'

const DEFAULT_MODEL_TYPE_COLOR = '#9ca3af'

const MODEL_TYPE_LABELS: Record<string, string> = {
  text: '文本',
  image: '图像',
  audio: '语音'
}

const UNKNOWN_TIME_LABEL = '未知时间'

export function getGenreColor(genre?: string | null): string {
  if (!genre) return DEFAULT_GENRE_COLOR
  return GENRE_COLORS[genre] || DEFAULT_GENRE_COLOR
}

export function getModelIcon(type?: string | null): ModelIconName {
  if (!type) return DEFAULT_MODEL_ICON
  return MODEL_ICONS[type] || DEFAULT_MODEL_ICON
}

export function getModelIconColor(type?: string | null): string {
  if (!type) return DEFAULT_MODEL_ICON_COLOR
  return MODEL_ACCENT_COLORS[type] || DEFAULT_MODEL_ICON_COLOR
}

export function getModelTypeColor(type?: string | null): string {
  if (!type) return DEFAULT_MODEL_TYPE_COLOR
  return MODEL_ACCENT_COLORS[type] || DEFAULT_MODEL_TYPE_COLOR
}

export function getTypeLabel(type: string): string {
  return MODEL_TYPE_LABELS[type] || type
}

/** 个人中心只展示到日，空值/非法值统一显示「未知时间」 */
export function formatProfileDate(dateString?: string | null): string {
  if (!dateString) return UNKNOWN_TIME_LABEL
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return UNKNOWN_TIME_LABEL
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
