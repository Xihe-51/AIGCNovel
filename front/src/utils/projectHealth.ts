export interface MissingAssetLike {
  kind_label: string
  where: string
  scene_id?: number
  content_id?: number
}

export interface StoryIssueLike {
  code: string
  message: string
  detail?: any
}

export interface EndingLike {
  content_id: number
  title: string
}

export interface UnreachableEnding {
  title: string
  reason: string
  sceneId: number
}

export interface HealthReportInput {
  projectId: string | number
  healthy: boolean
  missingAssets: MissingAssetLike[]
  errors: StoryIssueLike[]
  warnings: StoryIssueLike[]
  unreachableEndings: UnreachableEnding[]
  generatedAt?: Date
}

/** 剧情节点 -> 所属场景，供「定位到脚本」使用 */
export const buildNodeSceneMap = (nodes: Array<{ content_id: number; scene_id: number }>) => {
  const map: Record<number, number> = {}
  for (const n of nodes) map[n.content_id] = n.scene_id
  return map
}

/** 结局节点不存在、或从主入口不可达 */
export const findUnreachableEndings = (
  endings: EndingLike[],
  sceneMap: Record<number, number>,
  orphans: number[]
): UnreachableEnding[] => {
  const orphanSet = new Set(orphans)
  const bad: UnreachableEnding[] = []
  for (const en of endings) {
    const sceneId = sceneMap[en.content_id] || 0
    if (!sceneMap[en.content_id]) {
      bad.push({ title: en.title, reason: `指向的节点 #${en.content_id} 不存在`, sceneId: 0 })
    } else if (orphanSet.has(en.content_id)) {
      bad.push({ title: en.title, reason: '结局节点从主入口不可达', sceneId })
    }
  }
  return bad
}

export const isProjectHealthy = (counts: { missing: number; errors: number; unreachable: number }) =>
  !counts.missing && !counts.errors && !counts.unreachable

export const buildHealthReport = (input: HealthReportInput) => {
  const { projectId, healthy, missingAssets, errors, warnings, unreachableEndings } = input
  const generatedAt = input.generatedAt || new Date()
  return [
    `项目 #${projectId} 发布前自检报告`,
    `生成时间：${generatedAt.toLocaleString()}`,
    `结论：${healthy ? '通过，可以发布' : '存在问题，建议修复后再发布'}`,
    '',
    `缺失素材（${missingAssets.length}）`,
    ...missingAssets.map(m => `- [${m.kind_label}] ${m.where}`),
    '',
    `剧情错误（${errors.length}）`,
    ...errors.map(e => `- [${e.code}] ${e.message}`),
    '',
    `提醒（${warnings.length}）`,
    ...warnings.map(w => `- [${w.code}] ${w.message}`),
    '',
    `不可达结局（${unreachableEndings.length}）`,
    ...unreachableEndings.map(en => `- ${en.title}：${en.reason}`),
  ].join('\n')
}

export const stopReasonLabel = (reason: string) => {
  if (reason === 'ending') return '达成结局'
  if (reason === 'dropoff') return '中途流失'
  if (reason === 'dead_end') return '走进死路'
  return '未达结局'
}

export const stopReasonClass = (reason: string) => {
  if (reason === 'ending') return 'is-good'
  if (reason === 'dead_end') return 'is-bad'
  return 'is-warn'
}

/** 从问题详情里尽量找出可定位的节点 */
export const resolveIssueTarget = (issue: StoryIssueLike, sceneMap: Record<number, number>) => {
  const detail = issue.detail || {}
  const rawContentId =
    detail.content_id || (Array.isArray(detail.cycle) ? detail.cycle[0] : null) || detail.source_content_id
  const contentId = rawContentId == null ? null : Number(rawContentId)
  const rawSceneId = detail.scene_id || (contentId ? sceneMap[contentId] : null)
  return {
    sceneId: rawSceneId == null ? null : Number(rawSceneId),
    contentId,
  }
}
