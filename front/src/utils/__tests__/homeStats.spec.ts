import { describe, expect, it } from 'vitest'
import type { Project } from '@/api/project'
import {
  buildCoverStyle,
  filterProjectsByTimeRange,
  formatHomeDate,
  getGenreDistribution,
  getGenreTagType,
  getStatusDistribution,
  getTemplateTagType,
  getWordCountByDate
} from '../homeStats'

const project = (over: Partial<Project> = {}): Project =>
  ({
    project_id: 1,
    title: '未命名',
    genre: '悬疑',
    template_type: '线性叙事',
    word_count: 0,
    is_public: false,
    created_at: '2024-01-02T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z',
    ...over
  } as unknown as Project)

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

describe('filterProjectsByTimeRange', () => {
  it('all 范围原样返回', () => {
    const list = [project({ project_id: 1 }), project({ project_id: 2 })]
    expect(filterProjectsByTimeRange(list, 'all')).toBe(list)
  })

  it('按天数过滤掉过旧项目', () => {
    const fresh = project({ project_id: 1, created_at: daysAgo(2) })
    const stale = project({ project_id: 2, created_at: daysAgo(30) })
    const result = filterProjectsByTimeRange([fresh, stale], '7')
    expect(result.map(p => p.project_id)).toEqual([1])
  })

  it('非法范围不做过滤', () => {
    const list = [project({ project_id: 1, created_at: daysAgo(90) })]
    expect(filterProjectsByTimeRange(list, 'abc')).toHaveLength(1)
    expect(filterProjectsByTimeRange(list, '0')).toHaveLength(1)
  })
})

describe('getGenreDistribution', () => {
  it('按类型聚合并保持出现顺序', () => {
    const result = getGenreDistribution([
      project({ genre: '悬疑' }),
      project({ genre: '恋爱' }),
      project({ genre: '悬疑' })
    ])
    expect(result).toEqual([
      { name: '悬疑', value: 2 },
      { name: '恋爱', value: 1 }
    ])
  })

  it('空类型归入未分类', () => {
    expect(getGenreDistribution([project({ genre: '' })])).toEqual([
      { name: '未分类', value: 1 }
    ])
  })

  it('空列表返回空数组', () => {
    expect(getGenreDistribution([])).toEqual([])
  })
})

describe('getWordCountByDate', () => {
  it('按日期汇总字数并升序排列', () => {
    const result = getWordCountByDate([
      project({ created_at: '2024-01-03T08:00:00.000Z', word_count: 400 }),
      project({ created_at: '2024-01-02T08:00:00.000Z', word_count: 100 }),
      project({ created_at: '2024-01-02T20:00:00.000Z', word_count: 50 })
    ])
    expect(result.dates).toEqual(['2024-01-02', '2024-01-03'])
    expect(result.values).toEqual([150, 400])
  })

  it('空列表返回空结构', () => {
    expect(getWordCountByDate([])).toEqual({ dates: [], values: [] })
  })
})

describe('getStatusDistribution', () => {
  it('区分公开与未公开', () => {
    const result = getStatusDistribution([
      project({ is_public: true }),
      project({ is_public: false }),
      project({ is_public: false })
    ])
    expect(result).toEqual({ labels: ['已公开', '未公开'], values: [1, 2] })
  })
})

describe('formatHomeDate', () => {
  it('输出 YYYY-MM-DD 并补零', () => {
    expect(formatHomeDate('2024-03-05T10:20:30')).toBe('2024-03-05')
  })

  it('非法日期返回空串', () => {
    expect(formatHomeDate('not-a-date')).toBe('')
  })
})

describe('标签类型映射', () => {
  it('已知类型返回对应样式', () => {
    expect(getGenreTagType('恋爱')).toBe('danger')
    expect(getGenreTagType('悬疑')).toBe('')
    expect(getTemplateTagType('分支叙事')).toBe('success')
  })

  it('未知类型回退为空串', () => {
    expect(getGenreTagType('未知类型')).toBe('')
    expect(getTemplateTagType('未知模板')).toBe('')
  })
})

describe('buildCoverStyle', () => {
  it('有封面时拼接 BASE_URL', () => {
    expect(buildCoverStyle({ cover_url: '/covers/a.png' }, 'http://api.test')).toEqual({
      backgroundImage: 'url(http://api.test/covers/a.png)'
    })
  })

  it('无封面时使用默认渐变', () => {
    expect(buildCoverStyle({}, '')).toEqual({
      backgroundImage: 'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)'
    })
  })
})
