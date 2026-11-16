import { describe, expect, it } from 'vitest'
import {
  buildSceneGroups,
  moveSceneInList,
  renumberScenes,
  searchResultTypeLabel,
  sortScenesByOrder,
  splitHighlightParts,
} from '../sceneList'
import type { ChapterLike, SceneOrderLike } from '../sceneList'

const scene = (scene_id: number, order_num: number): SceneOrderLike => ({ scene_id, order_num })

describe('sortScenesByOrder', () => {
  it('按序号升序且不改原数组', () => {
    const input = [scene(3, 3), scene(1, 1), scene(2, 2)]
    const sorted = sortScenesByOrder(input)
    expect(sorted.map(s => s.scene_id)).toEqual([1, 2, 3])
    expect(input.map(s => s.scene_id)).toEqual([3, 1, 2])
  })

  it('空数组安全', () => {
    expect(sortScenesByOrder([])).toEqual([])
  })
})

describe('buildSceneGroups', () => {
  const chapters: ChapterLike[] = [
    { chapter_id: 10, title: '第一幕', order_num: 1 },
    { chapter_id: 20, title: '第二幕', order_num: 2 },
  ]

  it('按章节分组并保留章节顺序', () => {
    const groups = buildSceneGroups(chapters, { 1: 10, 2: 10, 3: 20 }, [scene(1, 1), scene(2, 2), scene(3, 3)])
    expect(groups.map(g => g.key)).toEqual(['chapter-10', 'chapter-20'])
    expect(groups[0].scenes.map(s => s.scene_id)).toEqual([1, 2])
    expect(groups[1].scenes.map(s => s.scene_id)).toEqual([3])
  })

  it('未归属场景进「未分组」并排在最后', () => {
    const groups = buildSceneGroups(chapters, { 1: 10 }, [scene(1, 1), scene(9, 9)])
    expect(groups.map(g => g.key)).toEqual(['chapter-10', 'ungrouped'])
    expect(groups[1].title).toBe('未分组')
    expect(groups[1].scenes.map(s => s.scene_id)).toEqual([9])
  })

  it('空章节被过滤', () => {
    const groups = buildSceneGroups(chapters, { 1: 10 }, [scene(1, 1)])
    expect(groups.map(g => g.key)).toEqual(['chapter-10'])
  })

  it('没有章节时不显示分组标题', () => {
    const groups = buildSceneGroups([], {}, [scene(1, 1)])
    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('')
    expect(groups[0].chapterId).toBeNull()
  })

  it('章节归属指向不存在的章节时归入未分组', () => {
    const groups = buildSceneGroups(chapters, { 5: 99 }, [scene(5, 1)])
    expect(groups.map(g => g.key)).toEqual(['ungrouped'])
  })
})

describe('renumberScenes', () => {
  it('连续编号并返回被改动的场景', () => {
    const list = [scene(5, 1), scene(7, 3), scene(9, 8)]
    const { list: next, changed } = renumberScenes(list)
    expect(next.map(s => s.order_num)).toEqual([1, 2, 3])
    expect(changed.map(s => s.scene_id)).toEqual([7, 9])
  })

  it('已连续时没有改动项', () => {
    const { changed } = renumberScenes([scene(1, 1), scene(2, 2)])
    expect(changed).toEqual([])
  })
})

describe('moveSceneInList', () => {
  const base = () => [scene(1, 1), scene(2, 2), scene(3, 3)]

  it('放到目标之前', () => {
    const next = moveSceneInList(base(), 3, 1, false)
    expect(next?.map(s => s.scene_id)).toEqual([3, 1, 2])
    expect(next?.map(s => s.order_num)).toEqual([1, 2, 3])
  })

  it('放到目标之后', () => {
    const next = moveSceneInList(base(), 1, 2, true)
    expect(next?.map(s => s.scene_id)).toEqual([2, 1, 3])
  })

  it('拖到自身返回 null', () => {
    expect(moveSceneInList(base(), 2, 2, false)).toBeNull()
  })

  it('源不在列表返回 null', () => {
    expect(moveSceneInList(base(), 99, 1, false)).toBeNull()
  })

  it('目标不在列表时追加到末尾', () => {
    const next = moveSceneInList(base(), 1, 99, false)
    expect(next?.map(s => s.scene_id)).toEqual([2, 3, 1])
  })

  it('不修改原数组顺序', () => {
    const input = base()
    moveSceneInList(input, 3, 1, false)
    expect(input.map(s => s.scene_id)).toEqual([1, 2, 3])
  })
})

describe('splitHighlightParts', () => {
  it('空查询返回整段普通文本', () => {
    expect(splitHighlightParts('abc', '')).toEqual([{ text: 'abc', hit: false }])
    expect(splitHighlightParts('', '')).toEqual([{ text: '', hit: false }])
  })

  it('空文本且有查询时返回空片段', () => {
    expect(splitHighlightParts('', 'x')).toEqual([])
  })

  it('命中词高亮且大小写不敏感', () => {
    expect(splitHighlightParts('Hello world hello', 'hello')).toEqual([
      { text: 'Hello', hit: true },
      { text: ' world ', hit: false },
      { text: 'hello', hit: true },
    ])
  })

  it('开头即命中时不产生空片段', () => {
    expect(splitHighlightParts('abcabc', 'abc')).toEqual([
      { text: 'abc', hit: true },
      { text: 'abc', hit: true },
    ])
  })

  it('未命中时整段普通文本', () => {
    expect(splitHighlightParts('abc', 'zzz')).toEqual([{ text: 'abc', hit: false }])
  })
})

describe('searchResultTypeLabel', () => {
  it('choice / scene 使用固定标签', () => {
    expect(searchResultTypeLabel({ result_type: 'choice' })).toBe('选项')
    expect(searchResultTypeLabel({ result_type: 'scene' })).toBe('场景')
  })

  it('其余回退到内容类型或「剧情」', () => {
    expect(searchResultTypeLabel({ result_type: 'content', content_type: '旁白' })).toBe('旁白')
    expect(searchResultTypeLabel({})).toBe('剧情')
  })
})
