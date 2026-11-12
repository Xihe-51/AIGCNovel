/**
 * 场景播放条件（剧情锁）：进入本场景前需要满足的变量条件。
 *
 * 后端只有一份「项目内所有场景的锁」映射（scene_id -> 条件），这里负责：
 * 1. 读出来并兼容两种历史格式（items 数组 / 单条件字段）；
 * 2. 编辑态维护 mode(and/or) + items；
 * 3. 存盘前序列化成 payload，没填变量就返回 null（表示不加锁）。
 *
 * 写入后不直接保存，交给 useSceneSettingsAutosave 防抖落盘。
 */
import type { Ref } from 'vue'
import { ref } from 'vue'
import { listSceneLocks } from '@/api/scenes'

export interface SceneLockContext {
  projectId: Ref<string | number>
  sceneId: () => string | number
}

export interface SceneLockItem {
  variable: string
  op: string
  value: number
}

/** 后端返回的单个场景条件 → 编辑态。纯函数，便于单测。 */
export const normalizeSceneLock = (raw: any): { mode: string; items: SceneLockItem[] } => {
  if (!raw) return { mode: 'and', items: [] }
  if (Array.isArray(raw.items)) {
    return {
      mode: raw.mode === 'or' ? 'or' : 'and',
      items: raw.items.map((c: any) => ({
        variable: c.variable || '',
        op: c.op || '>=',
        value: Number(c.value) || 0,
      })),
    }
  }
  if (raw.variable) {
    return {
      mode: 'and',
      items: [{ variable: raw.variable, op: raw.op || '>=', value: Number(raw.value) || 0 }],
    }
  }
  return { mode: 'and', items: [] }
}

/** 编辑态 → 存盘 payload：没填变量视为不加锁。纯函数，便于单测。 */
export const buildSceneLockPayload = (mode: string, items: SceneLockItem[]) => {
  const cleaned = (items || [])
    .filter(c => c && c.variable)
    .map(c => ({
      variable: c.variable,
      op: c.op || '>=',
      value: Math.trunc(Number(c.value) || 0),
    }))
  if (!cleaned.length) return null
  return { mode: mode === 'or' ? 'or' : 'and', items: cleaned }
}

export function useSceneLock(ctx: SceneLockContext) {
  const { projectId, sceneId } = ctx

  const sceneLockMode = ref('and')
  const sceneLockItems = ref<SceneLockItem[]>([])

  const addSceneLockCondition = () => {
    sceneLockItems.value.push({ variable: '', op: '>=', value: 0 })
  }

  const removeSceneLockCondition = (index: number) => {
    sceneLockItems.value.splice(index, 1)
  }

  const loadSceneLock = async () => {
    sceneLockMode.value = 'and'
    sceneLockItems.value = []
    if (!projectId.value) return
    try {
      const map = await listSceneLocks(Number(projectId.value))
      const raw = map[String(sceneId())]
      if (!raw) return
      const next = normalizeSceneLock(raw)
      sceneLockMode.value = next.mode
      sceneLockItems.value = next.items
    } catch (e) {
      console.warn('读取场景播放条件失败:', e)
    }
  }

  const getSceneLockPayload = () => buildSceneLockPayload(sceneLockMode.value, sceneLockItems.value)

  return {
    sceneLockMode,
    sceneLockItems,
    addSceneLockCondition,
    removeSceneLockCondition,
    loadSceneLock,
    buildSceneLockPayload: getSceneLockPayload,
  }
}
