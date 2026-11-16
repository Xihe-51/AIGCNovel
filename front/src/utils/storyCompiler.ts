export interface CompileStatCard {
  label: string
  value: string | number
}

export interface CompileStatsLike {
  chapter_count: number
  scene_count: number
  node_count: number
  dialogue_count: number
  narration_count: number
  character_unknown: number
  source_preserved_pct: number
}

/** 编译统计 -> 顶部指标卡 */
export const buildCompileStatCards = (stats?: CompileStatsLike | null): CompileStatCard[] => {
  if (!stats) return []
  return [
    { label: '章节', value: stats.chapter_count },
    { label: '场景', value: stats.scene_count },
    { label: '内容', value: stats.node_count },
    { label: '对白 / 旁白', value: `${stats.dialogue_count} / ${stats.narration_count}` },
    { label: '未绑定角色', value: stats.character_unknown },
    { label: '原文保真', value: `${stats.source_preserved_pct}%` },
  ]
}

/** 诊断级别 -> 中文标签 */
export const diagnosticLevelLabel = (level: string) => {
  if (level === 'error') return '错误'
  if (level === 'warning') return '警告'
  return '建议'
}

/** 依据扩展名推断编译格式 */
export const detectCompileFormat = (filename?: string | null) =>
  /\.(md|markdown)$/i.test(filename || '') ? 'markdown' : 'txt'

/** 历史记录时间展示：非法值原样返回 */
export const formatCompileTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}
