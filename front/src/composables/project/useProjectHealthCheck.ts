import { computed, ref } from 'vue'
import { checkProjectAssets } from '@/api/asset'
import { getStoryGraph } from '@/api/branch'
import type { StoryIssue } from '@/api/branch'
import { listEndings } from '@/api/ending'
import {
  buildNodeSceneMap,
  findUnreachableEndings,
  isProjectHealthy,
  resolveIssueTarget,
} from '@/utils/projectHealth'
import type { MissingAssetLike, UnreachableEnding } from '@/utils/projectHealth'
import { reportErrorMessage } from './useHealthReport'

export interface ProjectHealthCheckContext {
  projectId: () => string | number | null | undefined
  /** 点某条问题时把「场景 + 节点」抛给外层跳转 */
  onLocate: (sceneId: number, contentId: number | null) => void
}

/** 发布前自检：素材缺失 + 剧情校验 + 结局可达性，一次并发拉齐 */
export function useProjectHealthCheck(ctx: ProjectHealthCheckContext) {
  const loading = ref(false)
  const error = ref('')
  const missingAssets = ref<MissingAssetLike[]>([])
  const errors = ref<StoryIssue[]>([])
  const warnings = ref<StoryIssue[]>([])
  const endings = ref<any[]>([])
  const unreachableEndings = ref<UnreachableEnding[]>([])
  const healthy = ref(false)
  /** 剧情节点 -> 所属场景，用于把校验问题定位回脚本 */
  const nodeSceneMap = ref<Record<number, number>>({})

  const reachableEndingCount = computed(() => endings.value.length - unreachableEndings.value.length)

  const locate = (sceneId?: number | null, contentId?: number | null) => {
    if (!sceneId) return
    ctx.onLocate(Number(sceneId), contentId ?? null)
  }

  const runCheck = async () => {
    const projectId = ctx.projectId()
    if (!projectId || loading.value) return
    loading.value = true
    error.value = ''
    try {
      const [assetRes, graphRes, endingRows] = await Promise.all([
        checkProjectAssets(Number(projectId)),
        getStoryGraph(Number(projectId), true),
        listEndings(Number(projectId)),
      ])

      missingAssets.value = (assetRes?.missing || []) as MissingAssetLike[]

      const validation = graphRes?.validation
      errors.value = validation?.errors || []
      warnings.value = validation?.warnings || []

      const sceneMap = buildNodeSceneMap(graphRes?.nodes || [])
      nodeSceneMap.value = sceneMap

      endings.value = endingRows || []
      unreachableEndings.value = findUnreachableEndings(
        endings.value,
        sceneMap,
        validation?.orphans || [],
      )

      healthy.value = isProjectHealthy({
        missing: missingAssets.value.length,
        errors: errors.value.length,
        unreachable: unreachableEndings.value.length,
      })
    } catch (e: any) {
      console.error('项目自检失败:', e)
      error.value = reportErrorMessage('自检失败', e)
    } finally {
      loading.value = false
    }
  }

  /** 从问题详情里尽量找出可定位的节点 */
  const locateIssue = (issue: StoryIssue) => {
    const target = resolveIssueTarget(issue, nodeSceneMap.value)
    locate(target.sceneId ?? undefined, target.contentId)
  }

  return {
    loading,
    error,
    missingAssets,
    errors,
    warnings,
    endings,
    unreachableEndings,
    healthy,
    nodeSceneMap,
    reachableEndingCount,
    runCheck,
    locate,
    locateIssue,
  }
}
