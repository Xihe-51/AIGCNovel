/**
 * 文本文件编码探测。
 *
 * 浏览器原生的 File.text() 只会按 UTF-8 解码；GBK / UTF-16 文件会变成乱码。
 * 这里读取原始字节后按「BOM → UTF-8 严格解码 → GBK 回退」的顺序探测，
 * 作为小说导入编译器的第一道防线。
 */
export interface DecodedTextFile {
  text: string
  encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'gbk'
}

export function decodeTextBuffer(buffer: ArrayBuffer): DecodedTextFile {
  const bytes = new Uint8Array(buffer)

  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' }
  }
  // UTF-16 LE / BE BOM
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' }
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    try {
      return { text: new TextDecoder('gbk').decode(bytes), encoding: 'gbk' }
    } catch {
      // 极少数环境不支持 GBK 标签时退回容错 UTF-8，至少不阻塞导入
      return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8' }
    }
  }
}
