import type { Project } from '@/api/project'

export function filterProjectsByTimeRange(projects: Project[], range: string): Project[] {
  if (range === 'all') return projects
  const days = parseInt(range)
  if (!Number.isFinite(days) || days <= 0) return projects
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  return projects.filter(project => new Date(project.created_at) >= cutoffDate)
}

export function getGenreDistribution(projects: Project[]): { name: string; value: number }[] {
  const genreMap: Record<string, number> = {}
  projects.forEach(project => {
    const genre = project.genre || '未分类'
    genreMap[genre] = (genreMap[genre] || 0) + 1
  })
  return Object.entries(genreMap).map(([name, value]) => ({ name, value }))
}

export function getWordCountByDate(projects: Project[]): { dates: string[]; values: number[] } {
  const dateMap: Record<string, number> = {}
  projects.forEach(project => {
    const date = new Date(project.created_at).toISOString().split('T')[0]
    dateMap[date] = (dateMap[date] || 0) + (project.word_count || 0)
  })
  const dates = Object.keys(dateMap).sort()
  return { dates, values: dates.map(date => dateMap[date]) }
}

export function getStatusDistribution(projects: Project[]): { labels: string[]; values: number[] } {
  let publicCount = 0
  let privateCount = 0
  projects.forEach(project => {
    if (project.is_public) publicCount++
    else privateCount++
  })
  return { labels: ['已公开', '未公开'], values: [publicCount, privateCount] }
}

export function formatHomeDate(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const GENRE_TAG_MAP: Record<string, string> = {
  '悬疑': '',
  '恋爱': 'danger',
  '科幻': 'info',
  '奇幻': 'warning',
  '历史': 'success',
  '现代': '',
  '其他': 'info'
}

export function getGenreTagType(genre: string): string {
  return GENRE_TAG_MAP[genre] || ''
}

const TEMPLATE_TAG_MAP: Record<string, string> = {
  '线性叙事': '',
  '分支叙事': 'success',
  '开放世界': 'warning'
}

export function getTemplateTagType(template: string): string {
  return TEMPLATE_TAG_MAP[template] || ''
}

export function buildCoverStyle(project: Pick<Project, 'cover_url'>, baseUrl: string) {
  return {
    backgroundImage: project.cover_url
      ? `url(${baseUrl}${project.cover_url})`
      : 'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)'
  }
}
