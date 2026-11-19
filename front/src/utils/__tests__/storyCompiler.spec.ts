import { describe, expect, it } from 'vitest'
import {
  buildCompileStatCards,
  compileNodeKindLabel,
  detectCompileFormat,
  diagnosticLevelLabel,
  formatCompileTime,
} from '../storyCompiler'
import type { CompileStatsLike } from '../storyCompiler'

describe('buildCompileStatCards', () => {
  const stats: CompileStatsLike = {
    chapter_count: 3,
    scene_count: 12,
    node_count: 240,
    dialogue_count: 180,
    narration_count: 60,
    character_unknown: 2,
    source_preserved_pct: 97.5,
  }

  it('无统计时返回空数组', () => {
    expect(buildCompileStatCards()).toEqual([])
    expect(buildCompileStatCards(null)).toEqual([])
  })

  it('按固定顺序输出六张指标卡', () => {
    const cards = buildCompileStatCards(stats)
    expect(cards.map(c => c.label)).toEqual(['章节', '场景', '内容', '对白 / 旁白', '未绑定角色', '原文保真'])
    expect(cards[0].value).toBe(3)
    expect(cards[1].value).toBe(12)
    expect(cards[2].value).toBe(240)
    expect(cards[3].value).toBe('180 / 60')
    expect(cards[4].value).toBe(2)
    expect(cards[5].value).toBe('97.5%')
  })

  it('有选项时在「对白 / 旁白」之后插入选项卡', () => {
    const cards = buildCompileStatCards({ ...stats, choice_count: 4 })
    expect(cards.map(c => c.label)).toEqual([
      '章节', '场景', '内容', '对白 / 旁白', '选项', '未绑定角色', '原文保真',
    ])
    expect(cards[4].value).toBe(4)
  })

  it('选项数为 0 时不插入选项卡', () => {
    const cards = buildCompileStatCards({ ...stats, choice_count: 0 })
    expect(cards.map(c => c.label)).not.toContain('选项')
  })
})

describe('compileNodeKindLabel', () => {
  it('映射已知节点类型', () => {
    expect(compileNodeKindLabel('dialogue')).toBe('对白')
    expect(compileNodeKindLabel('choice')).toBe('选项')
    expect(compileNodeKindLabel('narration')).toBe('旁白')
  })

  it('未知或空值兜底为旁白', () => {
    expect(compileNodeKindLabel('')).toBe('旁白')
    expect(compileNodeKindLabel(null)).toBe('旁白')
    expect(compileNodeKindLabel(undefined)).toBe('旁白')
    expect(compileNodeKindLabel('unknown')).toBe('旁白')
  })
})

describe('diagnosticLevelLabel', () => {
  it('映射已知级别', () => {
    expect(diagnosticLevelLabel('error')).toBe('错误')
    expect(diagnosticLevelLabel('warning')).toBe('警告')
    expect(diagnosticLevelLabel('info')).toBe('建议')
  })

  it('未知级别兜底为建议', () => {
    expect(diagnosticLevelLabel('debug')).toBe('建议')
    expect(diagnosticLevelLabel('')).toBe('建议')
  })
})

describe('detectCompileFormat', () => {
  it('md / markdown 扩展名识别为 markdown', () => {
    expect(detectCompileFormat('story.md')).toBe('markdown')
    expect(detectCompileFormat('STORY.MD')).toBe('markdown')
    expect(detectCompileFormat('a/b/story.markdown')).toBe('markdown')
  })

  it('其它扩展名与空值回退 txt', () => {
    expect(detectCompileFormat('story.txt')).toBe('txt')
    expect(detectCompileFormat('story.md.bak')).toBe('txt')
    expect(detectCompileFormat('')).toBe('txt')
    expect(detectCompileFormat(null)).toBe('txt')
    expect(detectCompileFormat(undefined)).toBe('txt')
  })
})

describe('formatCompileTime', () => {
  it('空值返回空串', () => {
    expect(formatCompileTime()).toBe('')
    expect(formatCompileTime(null)).toBe('')
    expect(formatCompileTime('')).toBe('')
  })

  it('合法时间按中文本地化输出', () => {
    const iso = '2026-01-02T03:04:05Z'
    expect(formatCompileTime(iso)).toBe(new Date(iso).toLocaleString('zh-CN'))
  })

  it('非法时间原样返回', () => {
    expect(formatCompileTime('not-a-date')).toBe('not-a-date')
  })
})
