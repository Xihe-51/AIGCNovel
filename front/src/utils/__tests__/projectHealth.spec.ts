import { describe, expect, it } from 'vitest'
import {
  buildHealthReport,
  buildNodeSceneMap,
  findUnreachableEndings,
  isProjectHealthy,
  resolveIssueTarget,
  stopReasonClass,
  stopReasonLabel,
} from '../projectHealth'
import type { EndingLike, MissingAssetLike, StoryIssueLike, UnreachableEnding } from '../projectHealth'

describe('buildNodeSceneMap', () => {
  it('把节点映射到所属场景', () => {
    const map = buildNodeSceneMap([
      { content_id: 1, scene_id: 10 },
      { content_id: 2, scene_id: 20 },
    ])
    expect(map).toEqual({ 1: 10, 2: 20 })
  })

  it('空列表返回空映射', () => {
    expect(buildNodeSceneMap([])).toEqual({})
  })
})

describe('findUnreachableEndings', () => {
  const endings: EndingLike[] = [
    { content_id: 1, title: '好结局' },
    { content_id: 2, title: '坏结局' },
  ]

  it('全部可达时返回空数组', () => {
    const map = { 1: 10, 2: 20 }
    expect(findUnreachableEndings(endings, map, [])).toEqual([])
  })

  it('节点不存在时归为不可达，sceneId 为 0', () => {
    const map = { 1: 10 }
    const bad = findUnreachableEndings(endings, map, [])
    expect(bad).toHaveLength(1)
    expect(bad[0]).toEqual({ title: '坏结局', reason: '指向的节点 #2 不存在', sceneId: 0 })
  })

  it('节点是孤儿时归为不可达并带上场景 id', () => {
    const map = { 1: 10, 2: 20 }
    const bad = findUnreachableEndings(endings, map, [2])
    expect(bad).toHaveLength(1)
    expect(bad[0]).toEqual({ title: '坏结局', reason: '结局节点从主入口不可达', sceneId: 20 })
  })

  it('同时存在缺失节点与孤儿时按结局顺序输出', () => {
    const map = { 2: 20 }
    const bad = findUnreachableEndings(endings, map, [2])
    expect(bad.map(b => b.title)).toEqual(['好结局', '坏结局'])
  })
})

describe('isProjectHealthy', () => {
  it('三项都为 0 视为健康', () => {
    expect(isProjectHealthy({ missing: 0, errors: 0, unreachable: 0 })).toBe(true)
  })

  it('任一项非 0 视为不健康', () => {
    expect(isProjectHealthy({ missing: 1, errors: 0, unreachable: 0 })).toBe(false)
    expect(isProjectHealthy({ missing: 0, errors: 2, unreachable: 0 })).toBe(false)
    expect(isProjectHealthy({ missing: 0, errors: 0, unreachable: 3 })).toBe(false)
  })
})

describe('buildHealthReport', () => {
  const missingAssets: MissingAssetLike[] = [{ kind_label: '背景图', where: '场景 1' }]
  const errors: StoryIssueLike[] = [{ code: 'CYCLE', message: '存在循环' }]
  const warnings: StoryIssueLike[] = [{ code: 'ORPHAN', message: '有孤立节点', detail: { content_id: 9 } }]
  const unreachableEndings: UnreachableEnding[] = [{ title: '真结局', reason: '结局节点从主入口不可达', sceneId: 3 }]
  const generatedAt = new Date('2026-01-02T03:04:05')

  it('按分区输出完整文本', () => {
    const text = buildHealthReport({
      projectId: 12,
      healthy: false,
      missingAssets,
      errors,
      warnings,
      unreachableEndings,
      generatedAt,
    })
    const lines = text.split('\n')
    expect(lines[0]).toBe('项目 #12 发布前自检报告')
    expect(lines[1]).toBe(`生成时间：${generatedAt.toLocaleString()}`)
    expect(lines[2]).toBe('结论：存在问题，建议修复后再发布')
    expect(text).toContain('缺失素材（1）')
    expect(text).toContain('- [背景图] 场景 1')
    expect(text).toContain('剧情错误（1）')
    expect(text).toContain('- [CYCLE] 存在循环')
    expect(text).toContain('提醒（1）')
    expect(text).toContain('- [ORPHAN] 有孤立节点')
    expect(text).toContain('不可达结局（1）')
    expect(text).toContain('- 真结局：结局节点从主入口不可达')
  })

  it('健康时结论为通过', () => {
    const text = buildHealthReport({
      projectId: 'p-1',
      healthy: true,
      missingAssets: [],
      errors: [],
      warnings: [],
      unreachableEndings: [],
      generatedAt,
    })
    expect(text).toContain('项目 #p-1 发布前自检报告')
    expect(text).toContain('结论：通过，可以发布')
    expect(text).toContain('缺失素材（0）')
  })
})

describe('stopReasonLabel', () => {
  it('映射四种终止原因', () => {
    expect(stopReasonLabel('ending')).toBe('达成结局')
    expect(stopReasonLabel('dropoff')).toBe('中途流失')
    expect(stopReasonLabel('dead_end')).toBe('走进死路')
    expect(stopReasonLabel('other')).toBe('未达结局')
  })
})

describe('stopReasonClass', () => {
  it('映射样式类名', () => {
    expect(stopReasonClass('ending')).toBe('is-good')
    expect(stopReasonClass('dead_end')).toBe('is-bad')
    expect(stopReasonClass('dropoff')).toBe('is-warn')
    expect(stopReasonClass('other')).toBe('is-warn')
  })
})

describe('resolveIssueTarget', () => {
  const sceneMap = { 7: 70 }

  it('优先使用 detail.content_id 与 detail.scene_id', () => {
    const issue: StoryIssueLike = { code: 'X', message: 'm', detail: { content_id: 7, scene_id: 99 } }
    expect(resolveIssueTarget(issue, sceneMap)).toEqual({ sceneId: 99, contentId: 7 })
  })

  it('scene_id 缺失时用节点所属场景兜底', () => {
    const issue: StoryIssueLike = { code: 'X', message: 'm', detail: { content_id: 7 } }
    expect(resolveIssueTarget(issue, sceneMap)).toEqual({ sceneId: 70, contentId: 7 })
  })

  it('从 cycle 数组取第一个节点', () => {
    const issue: StoryIssueLike = { code: 'X', message: 'm', detail: { cycle: [7, 8] } }
    expect(resolveIssueTarget(issue, sceneMap)).toEqual({ sceneId: 70, contentId: 7 })
  })

  it('回退到 source_content_id', () => {
    const issue: StoryIssueLike = { code: 'X', message: 'm', detail: { source_content_id: 7 } }
    expect(resolveIssueTarget(issue, sceneMap)).toEqual({ sceneId: 70, contentId: 7 })
  })

  it('无任何线索时两项均为 null', () => {
    const issue: StoryIssueLike = { code: 'X', message: 'm' }
    expect(resolveIssueTarget(issue, sceneMap)).toEqual({ sceneId: null, contentId: null })
  })
})
