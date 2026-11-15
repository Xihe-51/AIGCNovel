/**
 * 播放器开局装载：作品信息 / 场景 / 台词 / 剧情分支 / 角色头像的拉取编排。
 *
 * 本文件是播放器唯一的数据装载入口，装载态（场景、台词、角色、分支、加载与错误、
 * 皮肤与封面、历史回想）由 composable 自持；已读记录、章节、变量、结局、成就、
 * 公开版本、试玩埋点等下游域通过适配器注入，composable 只负责顺序与容错。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getDialoguesBySceneId,
  getCharactersByProjectId,
  getCharacterAvatars as getCharacterAvatarsApi,
} from '@/api/dialogue'
import { getScenes as getProjectScenes } from '@/api/scenes'
import { listBranches } from '@/api/branch'
import { getProject } from '@/api/project'

export interface StartPosition {
  sceneIndex: number
  dialogueIndex: number
}

/** 场景按 order_num 升序；返回新数组，不改动入参 */
export const sortScenes = (scenes: any[]): any[] =>
  (scenes || []).slice().sort((a, b) => (a?.order_num ?? 0) - (b?.order_num ?? 0))

/**
 * 逐场景拉取台词，补上 scene_id 并按 order_num 升序，产出 { sceneId: nodes[] }。
 * 播放器后续所有按场景取词的逻辑都依赖这份映射，因此 scene_id 在这里统一注入。
 */
export const collectDialogues = async (
  scenes: any[],
  fetchDialogues: (sceneId: any) => Promise<any[]>,
): Promise<Record<string, any[]>> => {
  const result: Record<string, any[]> = {}
  for (const scene of scenes || []) {
    const sceneId = scene?.scene_id
    const nodes = await fetchDialogues(sceneId)
    result[sceneId] = (nodes || [])
      .map((node) => ({ ...node, scene_id: sceneId }))
      .sort((a, b) => (a?.order_num ?? 0) - (b?.order_num ?? 0))
  }
  return result
}

/** 角色与各自头像合并；单个角色取头像失败时降级为空头像，不拖垮整个装载流程 */
export const attachCharacterAvatars = async (
  characters: any[],
  fetchAvatars: (characterId: any) => Promise<any[]>,
): Promise<any[]> => Promise.all((characters || []).map(async (char) => {
  try {
    const avatars = await fetchAvatars(char?.character_id)
    return { ...char, avatars: avatars || [] }
  } catch (e) {
    return { ...char, avatars: [] }
  }
}))

/** 在全部台词里定位 ?start=<content_id> 指定节点，找不到返回 null */
export const findStartPosition = (
  scenes: any[],
  allDialogues: Record<string, any[]>,
  contentId: number,
): StartPosition | null => {
  if (!contentId) return null
  const sceneList = scenes || []
  for (let sceneIndex = 0; sceneIndex < sceneList.length; sceneIndex++) {
    const nodes = allDialogues?.[sceneList[sceneIndex]?.scene_id] || []
    const dialogueIndex = nodes.findIndex((node) => Number(node?.content_id) === Number(contentId))
    if (dialogueIndex >= 0) return { sceneIndex, dialogueIndex }
  }
  return null
}

/** 历史回想：之前场景的全部台词 + 当前场景已播部分，统一附带场景名 */
export const buildHistoryDialogues = (
  scenes: any[],
  allDialogues: Record<string, any[]>,
  sceneIndex: number,
  dialogueIndex: number,
): any[] => {
  const sceneList = scenes || []
  const history: any[] = []
  const upper = Math.min(Math.max(Number(sceneIndex) || 0, 0), sceneList.length)
  for (let i = 0; i < upper; i++) {
    const scene = sceneList[i]
    const nodes = allDialogues?.[scene?.scene_id] || []
    history.push(...nodes.map((node) => ({ ...node, scene_title: scene?.title || '' })))
  }
  const current = sceneList[upper]
  const currentNodes = allDialogues?.[current?.scene_id] || []
  if (current?.scene_id && currentNodes.length) {
    history.push(...currentNodes
      .slice(0, Math.max(Number(dialogueIndex) || 0, 0))
      .map((node) => ({ ...node, scene_title: current?.title || '' })))
  }
  return history
}

export interface PlayerBootstrapContext {
  projectId: () => number
  /** 发布版（静态包或 ?release=1）：剥掉调试器与演出入口 */
  releaseView: () => boolean
  debugRequested: () => boolean
  isOwner: () => boolean
  canPerform: () => boolean
  /** route.query.start 的原始值，仅调试模式生效 */
  startQuery: () => any
  setDebugMode: (value: boolean) => void
  setPerformMode: (value: boolean) => void
  setProjectOwnerId: (value: number) => void
  setSceneIndex: (index: number) => void
  setDialogueIndex: (index: number) => void
  loadProgress: () => void
  loadStoryGraph: (projectId: number) => void | Promise<any>
  loadReads: () => Promise<any>
  loadChapterData: () => Promise<any>
  loadDebugSnapshots: () => void
  loadVariableSystem: () => Promise<any>
  loadEndings: () => Promise<any>
  loadPlayerAchievements: () => Promise<any>
  loadPublicReleases: () => Promise<any>
  /** 装载成功后的开局流程：起播、历史回想、试玩埋点、成就检查 */
  onLoaded: () => void
  t: (key: string, params?: any) => string
}

export function usePlayerBootstrap(ctx: PlayerBootstrapContext) {
  const scenes = ref<any[]>([])
  const allDialogues = ref<Record<string, any[]>>({})
  const characters = ref<any[]>([])
  const branches = ref<any[]>([])
  const loading = ref(true)
  const error = ref('')
  const historyDialogues = ref<any[]>([])
  const playTheme = ref('classic')
  const projectCoverUrl = ref('')

  /** 装载全部作品数据；失败时落到 error 供模板展示，成功则交给 onLoaded 起播 */
  const fetchProjectData = async () => {
    try {
      loading.value = true
      const projectIdNum = ctx.projectId()

      if (isNaN(projectIdNum)) {
        throw new Error('无效的项目ID')
      }

      // 尝试从本地存储加载进度
      ctx.loadProgress()

      // 作品皮肤：作者可在创作页「外观」里切换
      try {
        const projectInfo = await getProject(projectIdNum)
        playTheme.value = projectInfo.ui_theme || 'classic'
        projectCoverUrl.value = projectInfo.cover_url || ''
        ctx.setProjectOwnerId(Number(projectInfo.user_id) || 0)
      } catch (e) {
        playTheme.value = 'classic'
        ctx.setProjectOwnerId(0)
      }

      // 发布版只保留玩家能力：调试器 / 演出入口 / 节点跳转均需作者身份
      const debug = ctx.debugRequested() && ctx.isOwner() && !ctx.releaseView()
      ctx.setDebugMode(debug)
      ctx.setPerformMode(ctx.canPerform())

      // 获取项目下的所有场景（按顺序排列）
      scenes.value = sortScenes(await getProjectScenes(projectIdNum))

      if (scenes.value.length === 0) {
        throw new Error('该项目下没有场景数据')
      }

      allDialogues.value = await collectDialogues(
        scenes.value,
        (sceneId) => getDialoguesBySceneId(sceneId),
      )

      // 剧情分支：播放器要按 branch_paths 跳转，而不是永远线性往下走
      try {
        branches.value = await listBranches(projectIdNum)
      } catch (e) {
        console.warn('读取剧情分支失败，按线性剧情播放:', e)
        branches.value = []
      }

      // 调试模式：读取完整拓扑，用于面板里的覆盖率统计
      if (debug) {
        await ctx.loadStoryGraph(projectIdNum)
      }

      // 已读记录：跳过已读功能依赖它
      await ctx.loadReads()

      // 章节（章节快捷跳转 / 路线图鉴）
      await ctx.loadChapterData()

      // 调试状态快照（仅调试模式）
      if (debug) ctx.loadDebugSnapshots()

      // 项目变量与节点数值变化
      await ctx.loadVariableSystem()

      // 结局定义
      await ctx.loadEndings()

      // 成就定义与本人解锁状态
      await ctx.loadPlayerAchievements()

      // 更新记录（公开作品）
      await ctx.loadPublicReleases()

      // 调试：从 ?start=<content_id> 指定节点开始
      const startId = debug ? Number(ctx.startQuery() || 0) : 0
      if (startId) {
        const position = findStartPosition(scenes.value, allDialogues.value, startId)
        if (position) {
          ctx.setSceneIndex(position.sceneIndex)
          ctx.setDialogueIndex(position.dialogueIndex)
        } else {
          ElMessage.warning(ctx.t('toast.startNodeMissing', { id: startId }))
        }
      }

      // 获取角色列表并关联各自的头像
      const chars = await getCharactersByProjectId(projectIdNum)
      characters.value = await attachCharacterAvatars(
        chars,
        (characterId) => getCharacterAvatarsApi(characterId),
      )

    } catch (err) {
      console.error('获取项目数据失败:', err)
      const message = (err as any)?.message || '获取数据失败，请稍后重试'
      error.value = message
      ElMessage.error(message)
    } finally {
      loading.value = false
      // 数据加载完成后自动开始播放
      if (!error.value) ctx.onLoaded()
    }
  }

  return {
    scenes,
    allDialogues,
    characters,
    branches,
    loading,
    error,
    historyDialogues,
    playTheme,
    projectCoverUrl,
    fetchProjectData,
  }
}
