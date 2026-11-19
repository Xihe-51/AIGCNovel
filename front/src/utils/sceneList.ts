export interface SceneOrderLike {
  scene_id: number
  order_num: number
}

export interface ChapterLike {
  chapter_id: number
  title: string
  order_num: number
}

export interface SceneGroup<T extends SceneOrderLike> {
  key: string
  title: string
  chapterId: number | null
  scenes: T[]
}

export interface SearchResultLike {
  result_type?: string
  content_type?: string
}

export interface HighlightPart {
  text: string
  hit: boolean
}

/** 按 order_num 升序排序（不修改原数组） */
export const sortScenesByOrder = <T extends SceneOrderLike>(scenes: T[]): T[] =>
  [...scenes].sort((a, b) => a.order_num - b.order_num)

/** 章节 + 场景归属 -> 分组列表；空分组不输出，未归属场景收进「未分组」 */
export const buildSceneGroups = <T extends SceneOrderLike>(
  chapters: ChapterLike[],
  chapterMap: Record<number, number>,
  sortedScenes: T[]
): SceneGroup<T>[] => {
  const groups: SceneGroup<T>[] = chapters.map(c => ({
    key: 'chapter-' + c.chapter_id,
    title: c.title,
    chapterId: c.chapter_id,
    scenes: [],
  }))
  const byChapter = new Map<number, SceneGroup<T>>()
  for (const g of groups) {
    if (g.chapterId !== null) byChapter.set(g.chapterId, g)
  }
  const ungrouped: SceneGroup<T> = {
    key: 'ungrouped',
    title: chapters.length ? '未分组' : '',
    chapterId: null,
    scenes: [],
  }
  for (const s of sortedScenes) {
    const cid = chapterMap[s.scene_id]
    const group = cid ? byChapter.get(cid) : null
    if (group) group.scenes.push(s)
    else ungrouped.scenes.push(s)
  }
  const result = groups.filter(g => g.scenes.length)
  if (ungrouped.scenes.length) result.push(ungrouped)
  return result
}

/** 剩余场景重新连续编号，返回新顺序与被改动的场景 */
export const renumberScenes = <T extends SceneOrderLike>(sortedScenes: T[]) => {
  const list = sortedScenes.slice()
  const changed = list.filter((s, i) => s.order_num !== i + 1)
  list.forEach((s, i) => { s.order_num = i + 1 })
  return { list, changed }
}

/** 拖拽落点计算：把 fromId 移到 targetId 前/后，返回重排后的新数组；非法移动返回 null */
export const moveSceneInList = <T extends SceneOrderLike>(
  sortedScenes: T[],
  fromId: number,
  targetId: number,
  after: boolean
): T[] | null => {
  if (fromId === targetId) return null
  const list = sortedScenes.slice()
  const fromIdx = list.findIndex(x => x.scene_id === fromId)
  if (fromIdx < 0) return null
  const [moved] = list.splice(fromIdx, 1)
  let insertAt = list.findIndex(x => x.scene_id === targetId)
  if (insertAt < 0) insertAt = list.length
  if (after) insertAt += 1
  list.splice(insertAt, 0, moved)
  list.forEach((s, i) => { s.order_num = i + 1 })
  return list
}

/** 搜索命中词拆成普通片段/高亮片段，避免使用 v-html */
export const splitHighlightParts = (text: string, query: string): HighlightPart[] => {
  const q = String(query || '').trim()
  const src = String(text || '')
  if (!q) return [{ text: src, hit: false }]
  const lower = src.toLowerCase()
  const needle = q.toLowerCase()
  const parts: HighlightPart[] = []
  let i = 0
  while (i < src.length) {
    const pos = lower.indexOf(needle, i)
    if (pos < 0) {
      parts.push({ text: src.slice(i), hit: false })
      break
    }
    if (pos > i) parts.push({ text: src.slice(i, pos), hit: false })
    parts.push({ text: src.slice(pos, pos + q.length), hit: true })
    i = pos + q.length
  }
  return parts.filter(p => p.text)
}

/** 搜索结果类型标签 */
export const searchResultTypeLabel = (result: SearchResultLike) => {
  if (result.result_type === 'choice') return '选项'
  if (result.result_type === 'scene') return '场景'
  return result.content_type || '剧情'
}
