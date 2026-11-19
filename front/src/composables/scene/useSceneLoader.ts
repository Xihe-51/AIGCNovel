/**
 * 场景数据装载：进入编辑器时把场景本体、剧情节点、变量、角色、台词一次拉齐，
 * 并按顺序驱动其它 composable 的加载钩子（剧情锁 → 分支 → 审校状态 → 草稿恢复）。
 *
 * 跨 composable 的动作全部以回调注入，这里不反向依赖它们；
 * 状态（scene/projectId/dialogues/...）由父级持有并传入，方便其它 composable 共享。
 */
import { nextTick } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getSceneById,
  getDialoguesBySceneId,
  getCharactersByProjectId,
  getCharacterAvatars,
} from '@/api/dialogue'
import { getStoryGraph } from '@/api/branch'
import { listVariables, listEffects } from '@/api/variable'

/** 原始数值变化列表 → 按 content_id 聚合，节点级编辑可直接取用。纯函数。 */
export const groupEffectsByContent = (all: any[] | null | undefined) => {
  const map: Record<string, any[]> = {}
  for (const e of all || []) {
    if (!map[e.content_id]) map[e.content_id] = []
    map[e.content_id].push({
      variable_id: e.variable_id,
      label: e.label,
      delta: e.delta,
    })
  }
  return map
}

/** 台词按 order_num 升序；返回新数组，不改入参。纯函数。 */
export const sortDialoguesByOrder = (list: any[] | null | undefined) =>
  [...(list || [])].sort((a, b) => (a?.order_num ?? 0) - (b?.order_num ?? 0))

export interface SceneLoaderContext {
  sceneId: () => string | number
  focusContentId: () => number | null | undefined
  scene: Ref<any>
  projectId: Ref<string | number>
  dialogues: Ref<any[]>
  projectNodes: Ref<any[]>
  variables: Ref<any[]>
  effectsMap: Ref<Record<string, any>>
  characters: Ref<any[]>
  loading: Ref<boolean>
  error: Ref<string>
  sceneReady: Ref<boolean>
  loadSceneLock: () => Promise<void> | void
  resetSnapshot: () => void
  loadJumpMap: () => Promise<void> | void
  loadFsmStates: () => void
  ensureChoices: (dialogue: any) => Promise<any>
  resetHistory: () => void
  maybeRestoreDraft: () => Promise<void> | void
  focusDialogueByContentId: (contentId: any) => void
}

export function useSceneLoader(ctx: SceneLoaderContext) {
  const { sceneId, focusContentId, scene, projectId, dialogues } = ctx
  const { projectNodes, variables, effectsMap, characters } = ctx
  const { loading, error, sceneReady } = ctx

  /** 加载项目全部剧情节点（供分支跳转目标选择，支持跨场景） */
  const loadProjectNodes = async () => {
    if (!projectId.value) return
    try {
      const graph = await getStoryGraph(Number(projectId.value), false)
      projectNodes.value = graph?.nodes || []
    } catch (e) {
      console.warn('加载项目剧情节点失败，分支目标仅限当前场景:', e)
      projectNodes.value = []
    }
  }

  /** 加载项目变量与全部节点的数值变化 */
  const loadVariablesAndEffects = async () => {
    if (!projectId.value) return
    try {
      variables.value = await listVariables(Number(projectId.value))
      const all = await listEffects(Number(projectId.value))
      effectsMap.value = groupEffectsByContent(all)
    } catch (e) {
      console.warn('加载变量/数值变化失败:', e)
      variables.value = []
      effectsMap.value = {}
    }
  }

  const fetchSceneData = async () => {
    try {
      loading.value = true
      sceneReady.value = false
      const sceneIdNum = Number(sceneId())
      if (isNaN(sceneIdNum)) throw new Error('无效的场景ID')

      const sceneData = await getSceneById(sceneIdNum)
      scene.value = sceneData

      // 先确定 projectId：ensureChoices 依赖它，否则已有分支选项会加载成空数组
      // （表现为「库里有分支，编辑器里一个选项都不显示」）
      projectId.value = sceneData.project_id || ''
      await loadProjectNodes()
      await loadVariablesAndEffects()
      await ctx.loadSceneLock()
      // 场景设置与剧情锁加载完成后才建立基线，避免加载过程被误判成用户改动
      ctx.resetSnapshot()
      sceneReady.value = true
      await ctx.loadJumpMap()

      const dialoguesData = await getDialoguesBySceneId(sceneIdNum)
      dialogues.value = sortDialoguesByOrder(dialoguesData)
      ctx.loadFsmStates()

      // 为「选择」类型的内容预加载已有分支选项（此时 projectId 已就绪）
      await Promise.all(
        dialogues.value
          .filter((d: any) => d.content_type === '选择')
          .map((d: any) => ctx.ensureChoices(d))
      )

      // 重置历史，并检查是否有上次未保存的本地草稿
      ctx.resetHistory()
      await ctx.maybeRestoreDraft()

      if (sceneData.project_id) {
        const chars = await getCharactersByProjectId(sceneData.project_id)
        characters.value = await Promise.all(
          (chars || []).map(async (char: any) => {
            const avatars = await getCharacterAvatars(char.character_id)
            return { ...char, avatars: avatars || [] }
          })
        )
      }

      nextTick(() => {
        const target = focusContentId()
        if (target) ctx.focusDialogueByContentId(target)
      })
    } catch (err: any) {
      sceneReady.value = false
      console.error('获取场景数据失败:', err)
      error.value = err?.message || '获取数据失败，请稍后重试'
      ElMessage.error(error.value)
    } finally {
      loading.value = false
    }
  }

  return { loadProjectNodes, loadVariablesAndEffects, fetchSceneData }
}
