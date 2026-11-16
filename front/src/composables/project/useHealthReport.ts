import { ref } from 'vue'
import type { Ref } from 'vue'

export interface HealthReportContext<T> {
  /** 取当前项目 id；空值时直接跳过请求 */
  projectId: () => string | number | null | undefined
  fetch: (projectId: number) => Promise<T>
  /** 失败提示前缀，如「巡检失败」 */
  errorLabel: string
}

export interface HealthReportState<T> {
  loading: Ref<boolean>
  data: Ref<T | null>
  error: Ref<string>
  run: () => Promise<void>
}

/** 统一把接口错误压成一句可读文案 */
export const reportErrorMessage = (label: string, e: any): string =>
  `${label}：${e?.response?.data?.message || e?.message || '未知错误'}`

/**
 * 自检类报告的异步状态：一次请求一份报告，失败即清空并给出提示。
 * 弹窗的开关不在这里，组件用 v-model:visible 自己控制。
 */
export function useHealthReport<T>(ctx: HealthReportContext<T>): HealthReportState<T> {
  const loading = ref(false)
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref('')

  const run = async () => {
    const projectId = ctx.projectId()
    if (!projectId || loading.value) return
    loading.value = true
    error.value = ''
    try {
      data.value = await ctx.fetch(Number(projectId))
    } catch (e: any) {
      data.value = null
      error.value = reportErrorMessage(ctx.errorLabel, e)
    } finally {
      loading.value = false
    }
  }

  return { loading, data, error, run }
}
