import { describe, expect, it } from 'vitest'
import { buildChoiceViews } from '@/composables/player/playerChoiceViews'
import { BASE_URL } from '@/utils/request'

const deps = {
  localizedChoice: (branch: any) => branch?.choice_text || '',
  t: (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  conditionText: (conditions: any) => (conditions ? String(conditions.variable) : ''),
}

describe('buildChoiceViews', () => {
  it('空选项返回空数组', () => {
    expect(buildChoiceViews([], deps)).toEqual([])
    expect(buildChoiceViews(undefined as any, deps)).toEqual([])
  })

  it('文案缺失时回退到 continue 文案', () => {
    const views = buildChoiceViews([{ path_id: 7, choice_text: '' }], deps)
    expect(views[0].label).toBe('choice.continue')
    expect(views[0].id).toBe(7)
  })

  it('可选选项不带锁定提示与标题', () => {
    const views = buildChoiceViews([{ path_id: 1, choice_text: '走进雨里' }], deps)
    expect(views[0]).toMatchObject({
      label: '走进雨里',
      imageUrl: '',
      locked: false,
      lockText: '',
      title: '',
    })
  })

  it('图片地址按 BASE_URL 拼接', () => {
    const views = buildChoiceViews([{ path_id: 2, choice_text: '去码头', image_url: '/covers/a.png' }], deps)
    expect(views[0].imageUrl).toBe(BASE_URL + '/covers/a.png')
  })

  it('锁定选项同时给出锁文案与悬浮标题', () => {
    const views = buildChoiceViews([{
      path_id: 3,
      choice_text: '推开那扇门',
      locked: true,
      conditions: { variable: 'clues' },
    }], deps)
    expect(views[0].locked).toBe(true)
    expect(views[0].lockText).toBe('choice.locked:{"cond":"clues"}')
    expect(views[0].title).toBe('choice.conditionNotMet:{"cond":"clues"}')
  })

  it('多条选项保持原始顺序', () => {
    const views = buildChoiceViews([
      { path_id: 1, choice_text: 'A' },
      { path_id: 2, choice_text: 'B' },
    ], deps)
    expect(views.map(v => v.id)).toEqual([1, 2])
    expect(views.map(v => v.label)).toEqual(['A', 'B'])
  })
})
