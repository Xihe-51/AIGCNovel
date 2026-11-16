/**
 * 场景左栏的全项目搜索与批量替换。
 *
 * 搜索输入带 300ms 防抖，并用请求序号丢弃过期响应（快速输入时避免旧结果覆盖新结果）；
 * 替换先 dry-run 统计命中数量，二次确认后才真正写库。
 * 定位与数据刷新通过回调注入，composable 不直接依赖父组件的 emits。
 */
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { confirmAction } from '@/utils/confirm'
import { searchProject, replaceProjectText } from '@/api/scenes'
import type { ProjectSearchItem } from '@/api/scenes'
import { formatErrorMessage } from '@/utils/errorMessage'

export interface SceneProjectSearchContext {
  projectId: Ref<string | number>
  /** 点击搜索结果：定位到场景（contentId 为 null 表示只定位场景） */
  onLocate: (sceneId: number, contentId: number | null) => void
  /** 批量替换写库成功，外层需要刷新场景/章节等数据 */
  onDataChanged: () => void
}

export function useSceneProjectSearch(ctx: SceneProjectSearchContext) {
  const query = ref('')
  const results = ref<ProjectSearchItem[]>([])
  const searching = ref(false)
  const replaceQuery = ref('')
  const replacing = ref(false)

  let timer: ReturnType<typeof setTimeout> | null = null
  let seq = 0

  const runSearch = async () => {
    const q = query.value.trim()
    if (!q) {
      results.value = []
      searching.value = false
      return
    }
    const current = ++seq
    searching.value = true
    try {
      const res = await searchProject(Number(ctx.projectId.value), q)
      if (current === seq) results.value = res.items || []
    } catch (e) {
      console.warn('搜索失败:', e)
      if (current === seq) results.value = []
    } finally {
      if (current === seq) searching.value = false
    }
  }

  watch(query, () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(runSearch, 300)
  })

  const applyReplace = async () => {
    const q = query.value.trim()
    if (!q || replacing.value) return
    replacing.value = true
    try {
      const dry = await replaceProjectText(Number(ctx.projectId.value), q, replaceQuery.value, true)
      if (!dry.occurrences) {
        ElMessage.info('没有可替换的内容')
        return
      }
      const parts = [`${dry.occurrences} 处`]
      if (dry.contents) parts.push(`台词/旁白 ${dry.contents} 条`)
      if (dry.choices) parts.push(`选项 ${dry.choices} 条`)
      if (dry.scenes) parts.push(`场景 ${dry.scenes} 个`)
      const extra = replaceQuery.value ? '' : '替换内容为空，这些文字将被删除。'
      const confirmed = await confirmAction(
        `将替换 ${parts.join('，')}。${extra}是否继续？`,
        { title: '批量替换', confirmButtonText: '全部替换' },
      )
      if (!confirmed) return
      const res = await replaceProjectText(Number(ctx.projectId.value), q, replaceQuery.value, false)
      ElMessage.success(`已替换 ${res.occurrences} 处`)
      await runSearch()
      ctx.onDataChanged()
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('替换失败', e))
    } finally {
      replacing.value = false
    }
  }

  const openResult = (r: ProjectSearchItem) => {
    ctx.onLocate(r.scene_id, r.content_id)
    // 打开结果后收起搜索面板，恢复场景列表并显示当前场景
    query.value = ''
    results.value = []
  }

  return {
    query,
    results,
    searching,
    replaceQuery,
    replacing,
    runSearch,
    applyReplace,
    openResult,
  }
}
