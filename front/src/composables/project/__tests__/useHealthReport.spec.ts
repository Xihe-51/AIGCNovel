import { describe, expect, it, vi } from 'vitest'
import { reportErrorMessage, useHealthReport } from '@/composables/project/useHealthReport'
import type { HealthReportContext } from '@/composables/project/useHealthReport'

const makeState = (ctx: Partial<HealthReportContext<string>> = {}) =>
  useHealthReport<string>({
    projectId: () => 7,
    fetch: vi.fn(async () => 'report'),
    errorLabel: '巡检失败',
    ...ctx,
  })

const failing = (e: any) =>
  makeState({
    fetch: vi.fn(async () => {
      throw e
    }),
  })

describe('reportErrorMessage', () => {
  it('优先取后端返回的 message', () => {
    expect(reportErrorMessage('巡检失败', { response: { data: { message: '项目不存在' } } })).toBe(
      '巡检失败：项目不存在',
    )
  })

  it('没有 response 时回退到异常自身的 message', () => {
    expect(reportErrorMessage('巡检失败', new Error('Network Error'))).toBe('巡检失败：Network Error')
  })

  it('什么都拿不到时给「未知错误」', () => {
    expect(reportErrorMessage('巡检失败', null)).toBe('巡检失败：未知错误')
    expect(reportErrorMessage('巡检失败', {})).toBe('巡检失败：未知错误')
  })
})

describe('useHealthReport', () => {
  it('请求成功后填充 data 并清空 error', async () => {
    const state = makeState()
    await state.run()
    expect(state.data.value).toBe('report')
    expect(state.error.value).toBe('')
    expect(state.loading.value).toBe(false)
  })

  it('把项目 id 转成数字后传给 fetch', async () => {
    const fetch = vi.fn(async () => 'report')
    const state = makeState({ projectId: () => '7', fetch })
    await state.run()
    expect(fetch).toHaveBeenCalledWith(7)
  })

  it('请求失败时清空 data 并写入带前缀的提示', async () => {
    const state = failing({ response: { data: { message: '项目不存在' } } })
    await state.run()
    expect(state.data.value).toBeNull()
    expect(state.error.value).toBe('巡检失败：项目不存在')
    expect(state.loading.value).toBe(false)
  })

  it('重新发起请求会先清掉上一次的错误', async () => {
    let shouldFail = true
    const state = makeState({
      fetch: vi.fn(async () => {
        if (shouldFail) throw new Error('boom')
        return 'ok'
      }),
    })
    await state.run()
    expect(state.error.value).toBe('巡检失败：boom')
    shouldFail = false
    await state.run()
    expect(state.error.value).toBe('')
    expect(state.data.value).toBe('ok')
  })

  it('项目 id 为空时直接跳过，不发请求', async () => {
    const fetch = vi.fn(async () => 'report')
    const state = makeState({ projectId: () => null, fetch })
    await state.run()
    expect(fetch).not.toHaveBeenCalled()
    expect(state.loading.value).toBe(false)
    expect(state.data.value).toBeNull()
  })

  it('上一次请求未结束时的重入会被忽略', async () => {
    let resolve!: (value: string) => void
    const fetch = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r
        }),
    )
    const state = makeState({ fetch })
    const first = state.run()
    const second = state.run()
    expect(state.loading.value).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    resolve('report')
    await Promise.all([first, second])
    expect(state.data.value).toBe('report')
    expect(state.loading.value).toBe(false)
  })
})
