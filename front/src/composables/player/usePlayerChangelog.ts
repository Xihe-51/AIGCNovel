/**
 * 玩家侧更新日志：拉取作品的公开版本清单，并托管更新日志弹窗的可见性。
 *
 * 只有公开发布过的作品才会返回记录，请求失败一律按「没有更新日志」处理，
 * 播放器底部入口据此隐藏，不打断试玩。
 */
import { ref } from 'vue'
import { listPublicReleases } from '@/api/release'
import type { ProjectRelease } from '@/api/release'

export interface PlayerChangelogContext {
  projectId: () => number
}

export function usePlayerChangelog(ctx: PlayerChangelogContext) {
  const changelogVisible = ref(false)
  const publicReleases = ref<ProjectRelease[]>([])

  const loadPublicReleases = async () => {
    try {
      const list = await listPublicReleases(ctx.projectId())
      publicReleases.value = Array.isArray(list) ? list : []
    } catch (e) {
      publicReleases.value = []
    }
  }

  return { changelogVisible, publicReleases, loadPublicReleases }
}
