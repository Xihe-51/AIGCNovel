/**
 * 静态网页发布包的数据适配层。
 *
 * 发布包不启动后端：story.js 里已经包含播放器所需的全部只读接口快照，
 * 这里接管 axios 请求，按路径返回快照，并把存档 / 已读 / 跨周目变量 /
 * 结局 / 成就 / BGM 解锁等玩家状态落到 localStorage。
 */
import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios'
import request from '@/utils/request'

export interface StaticStory {
  version: number
  project_id: number
  title?: string
  generated_at?: string
  endpoints: Record<string, any>
}

interface LocalSave {
  summary: string
  updated_at: string
  state: any
}

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const writeJson = (key: string, value: any): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    /* 隐私模式 / 存储空间不足时写入会失败 */
    return false
  }
}

const removeKey = (key: string) => {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

const clone = <T>(value: T): T => {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value))
}

const summarizeSave = (slot: number, row: LocalSave) => ({
  slot,
  summary: row.summary,
  updated_at: row.updated_at,
  thumbnail_url: row.state?.thumbnail_url || null,
  scene_title: row.state?.scene_title || null,
  scene_id: row.state?.scene_id ?? null,
})

const ok = (config: AxiosRequestConfig, data: any): AxiosResponse => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: config as any,
})

const httpError = (config: AxiosRequestConfig, status: number, message: string) => {
  const error: any = new Error(message)
  error.config = config
  error.response = {
    data: { success: false, message },
    status,
    statusText: 'Error',
    headers: {},
    config,
  }
  return error
}

const normalizePath = (url?: string) => {
  const raw = String(url || '').split('?')[0]
  if (!raw) return '/'
  return raw.startsWith('/') ? raw : `/${raw}`
}

const parseBody = (config: AxiosRequestConfig): any => {
  const data: any = config.data
  if (!data) return {}
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return {}
    }
  }
  return data
}

const compare = (current: number, op: string, target: number) => {
  if (op === '>') return current > target
  if (op === '>=') return current >= target
  if (op === '<') return current < target
  if (op === '<=') return current <= target
  if (op === '==') return current === target
  if (op === '!=') return current !== target
  return false
}

const conditionMet = (
  condition: any,
  variables: Record<string, number>,
  endingIds: Set<number>,
  finished: boolean
) => {
  const cond = condition || {}
  if (cond.type === 'ending') {
    const id = Number(cond.ending_id)
    return Number.isFinite(id) && endingIds.has(id)
  }
  if (cond.type === 'variable') {
    const name = String(cond.variable || '')
    if (!(name in variables)) return false
    const current = Number(variables[name])
    const target = Number(cond.value)
    if (!Number.isFinite(current) || !Number.isFinite(target)) return false
    return compare(current, String(cond.op || ''), target)
  }
  if (cond.type === 'finish') return Boolean(finished)
  return false
}

export function installStaticAdapter(story: StaticStory) {
  const pid = Number(story.project_id)
  const pidText = String(pid)
  const endpoints = story.endpoints || {}
  const keys = {
    saves: `aigc:static:saves:${pid}`,
    reads: `aigc:static:reads:${pid}`,
    meta: `aigc:static:meta:${pid}`,
    endings: `aigc:static:endings:${pid}`,
    achievements: `aigc:static:achievements:${pid}`,
    music: `aigc:static:music:${pid}`,
  }

  request.defaults.baseURL = ''
  request.defaults.adapter = (async (config: any) => {
    const method = String(config.method || 'get').toLowerCase()
    const path = normalizePath(config.url)
    const segments = path.split('/').filter(Boolean)
    const body = parseBody(config)

    if (method === 'get') {
      // ---------- 本地玩家状态 ----------
      if (path === `/project/reads/${pid}`) {
        return ok(config, {
          success: true,
          data: { content_ids: readJson<number[]>(keys.reads, []) },
        })
      }

      if (path === `/project/meta/${pid}`) {
        return ok(config, {
          success: true,
          data: readJson(keys.meta, { variables: {}, updated_at: null as string | null }),
        })
      }

      if (segments[0] === 'project' && segments[1] === 'saves' && segments[2] === pidText) {
        const saves = readJson<Record<string, LocalSave>>(keys.saves, {})
        if (segments.length === 3) {
          const items = Object.keys(saves)
            .map((slot) => summarizeSave(Number(slot), saves[slot]))
            .sort((a, b) => a.slot - b.slot)
          return ok(config, { success: true, data: items })
        }
        const slot = Number(segments[3])
        const row = saves[String(slot)]
        if (!row) throw httpError(config, 404, '存档位为空')
        return ok(config, {
          success: true,
          data: {
            ...summarizeSave(slot, row),
            state: row.state,
          },
        })
      }

      // ---------- 需要叠加本地解锁状态的快照 ----------
      if (path === `/project/endings/${pid}`) {
        const snapshot = clone(endpoints[path]) || { success: true, data: [] }
        const unlocked = new Set<number>(readJson<number[]>(keys.endings, []))
        for (const ending of snapshot.data || []) {
          ending.unlocked = unlocked.has(Number(ending.ending_id))
        }
        return ok(config, snapshot)
      }

      if (path === `/project/achievements/${pid}`) {
        const snapshot = clone(endpoints[path]) || { success: true, data: [] }
        const unlocked = new Set<number>(readJson<number[]>(keys.achievements, []))
        for (const item of snapshot.data || []) {
          item.unlocked = unlocked.has(Number(item.achievement_id))
        }
        return ok(config, snapshot)
      }

      if (path === `/project/music_gallery/${pid}`) {
        const snapshot = clone(endpoints[path]) || { success: true, data: { items: [] } }
        const unlocked = new Set<string>(readJson<string[]>(keys.music, []))
        const items = (snapshot.data?.items || []).map((item: any) => ({
          ...item,
          unlocked: unlocked.has(String(item.music_url || '')),
        }))
        return ok(config, {
          success: true,
          data: {
            items,
            total: items.length,
            unlocked_count: items.filter((item: any) => item.unlocked).length,
          },
        })
      }

      if (path === `/project/gallery/${pid}`) {
        const cgs = clone(endpoints[`/project/cgs/${pid}`]?.data) || []
        const unlockedEndings = new Set<number>(readJson<number[]>(keys.endings, []))
        const items = cgs.map((cg: any) => {
          const unlocked =
            cg.unlock_ending_id === null ||
            cg.unlock_ending_id === undefined ||
            unlockedEndings.has(Number(cg.unlock_ending_id))
          return {
            cg_id: cg.cg_id,
            title: cg.title,
            description: cg.description,
            image_url: unlocked ? cg.image_url : null,
            unlock_ending_id: cg.unlock_ending_id,
            unlock_ending_title: cg.unlock_ending_title,
            order_num: cg.order_num,
            unlocked,
          }
        })
        return ok(config, {
          success: true,
          data: {
            project_id: pid,
            title: story.title || '',
            total: items.length,
            unlocked_count: items.filter((item: any) => item.unlocked).length,
            items,
          },
        })
      }

      // 发布包不提供调试剧情图，返回空拓扑避免页面报错
      if (path === `/project/story_graph/${pid}`) {
        return ok(config, {
          success: true,
          data: {
            project_id: pid,
            nodes: [],
            edges: [],
            stats: { node_count: 0, edge_count: 0, scene_count: 0 },
          },
        })
      }

      // ---------- 离线数据快照 ----------
      if (endpoints[path]) {
        return ok(config, clone(endpoints[path]))
      }
      return ok(config, { success: true, data: null })
    }

    // ---------- 写操作：改本地状态或直接忽略 ----------
    if (path === `/project/reads/${pid}`) {
      if (method === 'delete') {
        removeKey(keys.reads)
        return ok(config, { success: true, data: { content_ids: [] } })
      }
      const ids = new Set<number>(readJson<number[]>(keys.reads, []))
      for (const id of body.content_ids || []) ids.add(Number(id))
      writeJson(keys.reads, [...ids])
      return ok(config, { success: true, data: { content_ids: [...ids] } })
    }

    if (path === `/project/meta/${pid}` && method === 'put') {
      const current = readJson<any>(keys.meta, { variables: {}, updated_at: null })
      const meta = {
        variables: { ...(current.variables || {}), ...(body.variables || {}) },
        updated_at: new Date().toISOString(),
      }
      writeJson(keys.meta, meta)
      return ok(config, { success: true, data: meta })
    }

    if (segments[0] === 'project' && segments[1] === 'saves' && segments[2] === pidText) {
      const slot = Number(segments[3])
      const saves = readJson<Record<string, LocalSave>>(keys.saves, {})
      if (method === 'put') {
        saves[String(slot)] = {
          summary: String(body.summary || ''),
          updated_at: new Date().toISOString(),
          state: body.state || {},
        }
        if (!writeJson(keys.saves, saves)) {
          throw httpError(config, 507, '浏览器本地存储空间不足，无法保存存档')
        }
        return ok(config, {
          success: true,
          data: summarizeSave(slot, saves[String(slot)]),
        })
      }
      if (method === 'delete') {
        delete saves[String(slot)]
        if (!writeJson(keys.saves, saves)) {
          throw httpError(config, 507, '浏览器本地存储空间不足，无法删除存档')
        }
        return ok(config, { success: true, data: { slot } })
      }
    }

    if (path === `/project/achievements/${pid}/check` && method === 'post') {
      const unlocked = new Set<number>(readJson<number[]>(keys.achievements, []))
      const definitions = clone(endpoints[`/project/achievements/${pid}`]?.data) || []
      const variables = body.variables || {}
      const endingIds = new Set<number>((body.endings || []).map((id: any) => Number(id)))
      const finished = Boolean(body.finished)
      const newlyUnlocked: any[] = []
      for (const item of definitions) {
        const id = Number(item.achievement_id)
        if (unlocked.has(id)) continue
        if (!conditionMet(item.condition, variables, endingIds, finished)) continue
        unlocked.add(id)
        newlyUnlocked.push({ ...item, unlocked: true })
      }
      writeJson(keys.achievements, [...unlocked])
      return ok(config, {
        success: true,
        data: {
          newly_unlocked: newlyUnlocked,
          unlocked_ids: [...unlocked].sort((a, b) => a - b),
          achievements: definitions.map((item: any) => ({
            ...item,
            unlocked: unlocked.has(Number(item.achievement_id)),
          })),
        },
      })
    }

    if (
      segments[0] === 'project' &&
      segments[1] === 'endings' &&
      segments[2] === pidText &&
      segments[4] === 'unlock' &&
      method === 'post'
    ) {
      const endingId = Number(segments[3])
      const unlocked = new Set<number>(readJson<number[]>(keys.endings, []))
      unlocked.add(endingId)
      writeJson(keys.endings, [...unlocked])
      return ok(config, { success: true, data: { ending_id: endingId, unlocked: true } })
    }

    if (path === `/project/music_gallery/${pid}/unlock` && method === 'post') {
      const url = String(body.music_url || '')
      const unlocked = new Set<string>(readJson<string[]>(keys.music, []))
      if (url) unlocked.add(url)
      writeJson(keys.music, [...unlocked])
      return ok(config, { success: true, data: { music_url: url, unlocked: true } })
    }

    // 试玩埋点、演出预览等写操作在静态包中没有服务端，直接视为成功
    return ok(config, { success: true, data: {} })
  }) as AxiosAdapter
}
