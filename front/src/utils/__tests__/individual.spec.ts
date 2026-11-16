import { describe, expect, it } from 'vitest'
import {
  formatProfileDate,
  getGenreColor,
  getModelIcon,
  getModelIconColor,
  getModelTypeColor,
  getTypeLabel,
  MODEL_TYPE_OPTIONS
} from '../individual'

describe('getGenreColor', () => {
  it('maps every known genre to its palette color', () => {
    expect(getGenreColor('悬疑')).toBe('#6c5b7b')
    expect(getGenreColor('恋爱')).toBe('#ffb7c5')
    expect(getGenreColor('科幻')).toBe('#5d5fef')
    expect(getGenreColor('奇幻')).toBe('#c9a9e8')
    expect(getGenreColor('历史')).toBe('#c49a6c')
    expect(getGenreColor('现代')).toBe('#a8e6cf')
    expect(getGenreColor('其他')).toBe('#b8b8b8')
  })

  it('falls back to the pink accent for unknown or empty genres', () => {
    expect(getGenreColor('武侠')).toBe('#ffb7c5')
    expect(getGenreColor('')).toBe('#ffb7c5')
    expect(getGenreColor()).toBe('#ffb7c5')
    expect(getGenreColor(null)).toBe('#ffb7c5')
  })
})

describe('getModelIcon', () => {
  it('maps model types to icon component names', () => {
    expect(getModelIcon('text')).toBe('Collection')
    expect(getModelIcon('image')).toBe('Picture')
    expect(getModelIcon('audio')).toBe('Microphone')
  })

  it('falls back to the Cpu icon', () => {
    expect(getModelIcon('video')).toBe('Cpu')
    expect(getModelIcon()).toBe('Cpu')
    expect(getModelIcon(null)).toBe('Cpu')
  })
})

describe('getModelIconColor', () => {
  it('maps model types to their accent color', () => {
    expect(getModelIconColor('text')).toBe('#5d5fef')
    expect(getModelIconColor('image')).toBe('#ffb7c5')
    expect(getModelIconColor('audio')).toBe('#a8e6cf')
  })

  it('falls back to the purple accent', () => {
    expect(getModelIconColor('video')).toBe('#c9a9e8')
    expect(getModelIconColor()).toBe('#c9a9e8')
  })
})

describe('getModelTypeColor', () => {
  it('shares the accent palette but uses a neutral fallback', () => {
    expect(getModelTypeColor('text')).toBe('#5d5fef')
    expect(getModelTypeColor('image')).toBe('#ffb7c5')
    expect(getModelTypeColor('audio')).toBe('#a8e6cf')
    expect(getModelTypeColor('video')).toBe('#9ca3af')
    expect(getModelTypeColor()).toBe('#9ca3af')
  })
})

describe('getTypeLabel', () => {
  it('translates the three model types', () => {
    expect(getTypeLabel('text')).toBe('文本')
    expect(getTypeLabel('image')).toBe('图像')
    expect(getTypeLabel('audio')).toBe('语音')
  })

  it('passes unknown values through unchanged', () => {
    expect(getTypeLabel('video')).toBe('video')
    expect(getTypeLabel('')).toBe('')
  })

  it('keeps the option list in sync with the labels', () => {
    expect(MODEL_TYPE_OPTIONS).toEqual(['text', 'image', 'audio'])
    for (const type of MODEL_TYPE_OPTIONS) {
      expect(getTypeLabel(type)).not.toBe(type)
    }
  })
})

describe('formatProfileDate', () => {
  it('renders a YYYY-MM-DD date with zero padding', () => {
    expect(formatProfileDate('2024-03-05T10:20:30')).toBe('2024-03-05')
    expect(formatProfileDate('2024-11-09')).toBe('2024-11-09')
  })

  it('shows 未知时间 for missing or invalid dates', () => {
    expect(formatProfileDate()).toBe('未知时间')
    expect(formatProfileDate('')).toBe('未知时间')
    expect(formatProfileDate(null)).toBe('未知时间')
    expect(formatProfileDate('not-a-date')).toBe('未知时间')
  })
})
