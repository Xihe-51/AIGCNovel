import { describe, expect, it } from 'vitest'
import { formatDownloadCount, formatMarketDate, getFileType, getTypeColor } from '../market'

describe('getFileType', () => {
  it('returns 3 when url is missing', () => {
    expect(getFileType()).toBe(3)
    expect(getFileType('')).toBe(3)
    expect(getFileType(null)).toBe(3)
  })

  it('detects image extensions case-insensitively', () => {
    expect(getFileType('https://cdn.example.com/a.png')).toBe(1)
    expect(getFileType('https://cdn.example.com/a.JPG')).toBe(1)
    expect(getFileType('https://cdn.example.com/a.webp')).toBe(1)
  })

  it('detects audio extensions case-insensitively', () => {
    expect(getFileType('https://cdn.example.com/a.mp3')).toBe(2)
    expect(getFileType('https://cdn.example.com/a.FLAC')).toBe(2)
  })

  it('falls back to 3 for unsupported extensions', () => {
    expect(getFileType('https://cdn.example.com/a.zip')).toBe(3)
    expect(getFileType('https://cdn.example.com/a')).toBe(3)
  })
})

describe('getTypeColor', () => {
  it('maps known resource types to their colors', () => {
    expect(getTypeColor('角色')).toBe('#ffb7c5')
    expect(getTypeColor('背景')).toBe('#a8e6cf')
    expect(getTypeColor('CG')).toBe('#c9a9e8')
    expect(getTypeColor('其他')).toBe('#b8b8b8')
  })

  it('falls back to the pink accent for unknown or empty types', () => {
    expect(getTypeColor('未知')).toBe('#ffb7c5')
    expect(getTypeColor('')).toBe('#ffb7c5')
    expect(getTypeColor()).toBe('#ffb7c5')
  })
})

describe('formatDownloadCount', () => {
  it('keeps raw values below one thousand', () => {
    expect(formatDownloadCount(0)).toBe('0')
    expect(formatDownloadCount(999)).toBe('999')
  })

  it('formats thousands with a k suffix', () => {
    expect(formatDownloadCount(1000)).toBe('1.0k')
    expect(formatDownloadCount(1543)).toBe('1.5k')
  })

  it('formats ten-thousands with a w suffix', () => {
    expect(formatDownloadCount(10000)).toBe('1.0w')
    expect(formatDownloadCount(128000)).toBe('12.8w')
  })

  it('treats non-numeric input as zero', () => {
    expect(formatDownloadCount()).toBe('0')
    expect(formatDownloadCount(null)).toBe('0')
    expect(formatDownloadCount(Number.NaN)).toBe('0')
  })
})

describe('formatMarketDate', () => {
  it('renders a YYYY-MM-DD date with zero padding', () => {
    expect(formatMarketDate('2024-03-05T10:20:30')).toBe('2024-03-05')
    expect(formatMarketDate('2024-11-09')).toBe('2024-11-09')
  })

  it('returns an empty string for missing or invalid dates', () => {
    expect(formatMarketDate()).toBe('')
    expect(formatMarketDate('')).toBe('')
    expect(formatMarketDate(null)).toBe('')
    expect(formatMarketDate('not-a-date')).toBe('')
  })
})
