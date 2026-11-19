export type MarketFileKind = 1 | 2 | 3

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

const AUDIO_MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac'
}

const AUDIO_EXTENSIONS = Object.keys(AUDIO_MIME_TYPES)

const TYPE_COLORS: Record<string, string> = {
  '角色': '#ffb7c5',
  '背景': '#a8e6cf',
  'CG': '#c9a9e8',
  '其他': '#b8b8b8'
}

const DEFAULT_TYPE_COLOR = '#ffb7c5'

export function getFileType(url?: string | null): MarketFileKind {
  if (!url) return 3
  const lowerUrl = url.toLowerCase()
  if (IMAGE_EXTENSIONS.some(ext => lowerUrl.endsWith(ext))) return 1
  if (AUDIO_EXTENSIONS.some(ext => lowerUrl.endsWith(ext))) return 2
  return 3
}

export function getAudioMimeType(url?: string | null): string | undefined {
  if (!url) return undefined
  const lowerUrl = url.toLowerCase()
  const matched = AUDIO_EXTENSIONS.find(ext => lowerUrl.endsWith(ext))
  return matched ? AUDIO_MIME_TYPES[matched] : undefined
}

export function getTypeColor(type?: string | null): string {
  if (!type) return DEFAULT_TYPE_COLOR
  return TYPE_COLORS[type] || DEFAULT_TYPE_COLOR
}

export function formatDownloadCount(count?: number | null): string {
  const value = Number(count)
  if (!Number.isFinite(value)) return '0'
  if (value >= 10000) return (value / 10000).toFixed(1) + 'w'
  if (value >= 1000) return (value / 1000).toFixed(1) + 'k'
  return value.toString()
}

export function formatMarketDate(dateString?: string | null): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
