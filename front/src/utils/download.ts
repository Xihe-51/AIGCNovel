/**
 * 触发浏览器下载：文本/二进制内容统一走 Blob + 临时 <a> 链接。
 */
export function downloadFile(content: string | Blob, filename: string, mime: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
