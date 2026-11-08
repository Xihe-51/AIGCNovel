// 对白富文本轻量标记：
//   **加粗**
//   [color=#e8467c]彩色文字[/color]
//   [ruby=zhùyīn]注音文字[/ruby]
// 解析后统一输出纯文本与分段样式，供播放器逐字显示和编辑器预览使用。

export interface RichTextSegment {
  text: string
  color: string | null
  bold: boolean
  ruby: string | null
}

export interface RichTextResult {
  plain: string
  segments: RichTextSegment[]
}

const TOKEN_RE = /\[color=([^\]]+)\]|\[\/color\]|\[ruby=([^\]]+)\]|\[\/ruby\]|\*\*/g
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/

export function parseRichText(raw: string): RichTextResult {
  const src = String(raw || '')
  const segments: RichTextSegment[] = []
  let color: string | null = null
  let bold = false
  let ruby: string | null = null
  let lastIndex = 0
  let match: RegExpExecArray | null

  const pushText = (text: string) => {
    if (text) segments.push({ text, color, bold, ruby })
  }

  TOKEN_RE.lastIndex = 0
  while ((match = TOKEN_RE.exec(src))) {
    pushText(src.slice(lastIndex, match.index))
    const token = match[0]
    if (token === '**') {
      bold = !bold
    } else if (token.startsWith('[color=')) {
      const value = String(match[1] || '').trim()
      color = COLOR_RE.test(value) ? value : null
    } else if (token === '[/color]') {
      color = null
    } else if (token.startsWith('[ruby=')) {
      ruby = String(match[2] || '').trim()
    } else if (token === '[/ruby]') {
      ruby = null
    }
    lastIndex = TOKEN_RE.lastIndex
  }
  pushText(src.slice(lastIndex))

  return {
    plain: segments.map(s => s.text).join(''),
    segments,
  }
}

const escapeHtml = (text: string) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

/** limit 为按纯文本字符数截断，用于逐字显示；不传则渲染全部 */
export function renderRichHtml(result: RichTextResult, limit = Infinity): string {
  if (!result || !result.segments.length || limit <= 0) return ''
  const parts: string[] = []
  let used = 0
  for (const seg of result.segments) {
    if (used >= limit) break
    const take = Math.min(seg.text.length, limit - used)
    let html = escapeHtml(seg.text.slice(0, take))
    if (seg.ruby) html = `<ruby>${html}<rt>${escapeHtml(seg.ruby)}</rt></ruby>`
    if (seg.bold) html = `<strong>${html}</strong>`
    if (seg.color) html = `<span style="color:${escapeHtml(seg.color)}">${html}</span>`
    parts.push(html)
    used += take
  }
  return parts.join('')
}
