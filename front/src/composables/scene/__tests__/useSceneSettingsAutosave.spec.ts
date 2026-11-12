import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { updateScene, setSceneLock } from '@/api/scenes'
import { createProjectVersion } from '@/api/version'
import { useSceneSettingsAutosave } from '@/composables/scene/useSceneSettingsAutosave'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/api/scenes', () => ({
  updateScene: vi.fn(),
  setSceneLock: vi.fn(),
}))

vi.mock('@/api/version', () => ({
  createProjectVersion: vi.fn(),
}))

function createAutosave(options: {
  scene?: any
  sceneId?: number | string
  projectId?: string
  ready?: boolean
  lock?: any
} = {}) {
  const scene = ref<any>({
    scene_id: 15,
    project_id: 7,
    title: '初稿',
    description: '描述',
    background_url: 'bg.png',
    music_url: '',
    order_num: 1,
    ...options.scene,
  })
  const sceneId = options.sceneId ?? 15
  const projectId = options.projectId ?? '7'
  const ready = ref(options.ready ?? true)
  const lock = ref<any>(options.lock ?? { mode: 'none', items: [] })
  const onSaved = vi.fn()

  const api = useSceneSettingsAutosave({
    sceneId: () => sceneId,
    scene,
    projectId: () => projectId,
    getSceneReady: () => ready.value,
    buildLock: () => lock.value,
    onSaved,
  })

  return { ...api, scene, ready, lock, onSaved, sceneId, projectId }
}

beforeEach(() => {
  vi.useRealTimers()
  vi.mocked(ElMessage.success).mockReset()
  vi.mocked(ElMessage.warning).mockReset()
  vi.mocked(ElMessage.error).mockReset()
  vi.mocked(ElMessage.info).mockReset()
  vi.mocked(updateScene).mockReset().mockResolvedValue({} as any)
  vi.mocked(setSceneLock).mockReset().mockResolvedValue({} as any)
  vi.mocked(createProjectVersion).mockReset().mockResolvedValue({} as any)
})

describe('useSceneSettingsAutosave / 快照与脏标记', () => {
  it('初始不脏，resetSnapshot 后依然不脏', () => {
    const a = createAutosave()
    expect(a.sceneDirty.value).toBe(false)
    a.resetSnapshot()
    expect(a.sceneDirty.value).toBe(false)
  })

  it('只有可保存字段变化才标记为脏', () => {
    const a = createAutosave()
    a.resetSnapshot()

    a.scene.value.order_num = 99
    a.scene.value.created_at = '2026-01-01'
    a.refreshSceneDirty()
    expect(a.sceneDirty.value).toBe(false)

    a.scene.value.title = '改过的标题'
    a.refreshSceneDirty()
    expect(a.sceneDirty.value).toBe(true)
  })

  it('剧情锁变化也会标记为脏', () => {
    const a = createAutosave()
    a.resetSnapshot()
    a.lock.value = { mode: 'condition', items: [{ key: 'gold', op: '>=', value: 10 }] }
    a.refreshSceneDirty()
    expect(a.sceneDirty.value).toBe(true)
  })

  it('改回原值后脏标记自动清除', () => {
    const a = createAutosave()
    a.resetSnapshot()
    a.scene.value.title = '临时'
    a.refreshSceneDirty()
    expect(a.sceneDirty.value).toBe(true)
    a.scene.value.title = '初稿'
    a.refreshSceneDirty()
    expect(a.sceneDirty.value).toBe(false)
  })

  it('场景未加载完成时 refreshSceneDirty 直接返回', () => {
    const a = createAutosave({ ready: false })
    a.scene.value.title = '改过'
    a.refreshSceneDirty()
    expect(a.sceneDirty.value).toBe(false)
  })
})

describe('useSceneSettingsAutosave / 防抖自动保存', () => {
  it('连续改动只在 1200ms 静默后保存一次', async () => {
    vi.useFakeTimers()
    const a = createAutosave()
    a.resetSnapshot()

    a.scene.value.title = 'A'
    a.refreshSceneDirty()
    await vi.advanceTimersByTimeAsync(600)
    a.scene.value.title = 'AB'
    a.refreshSceneDirty()
    await vi.advanceTimersByTimeAsync(1199)
    expect(updateScene).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(updateScene).toHaveBeenCalledTimes(1)
    expect(vi.mocked(updateScene).mock.calls[0][1]).toEqual(expect.objectContaining({ title: 'AB' }))
  })

  it('自动保存为静默模式：不提示成功也不打版本', async () => {
    vi.useFakeTimers()
    const a = createAutosave()
    a.resetSnapshot()
    a.scene.value.title = 'A'
    a.refreshSceneDirty()
    await vi.advanceTimersByTimeAsync(1200)

    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(createProjectVersion).not.toHaveBeenCalled()
    expect(a.onSaved).toHaveBeenCalledTimes(1)
    expect(a.sceneDirty.value).toBe(false)
  })

  it('cancelScheduledSave 取消未触发的自动保存', async () => {
    vi.useFakeTimers()
    const a = createAutosave()
    a.resetSnapshot()
    a.scene.value.title = 'A'
    a.refreshSceneDirty()
    a.cancelScheduledSave()
    await vi.advanceTimersByTimeAsync(5000)
    expect(updateScene).not.toHaveBeenCalled()
  })
})

describe('useSceneSettingsAutosave / 手动保存', () => {
  it('保存成功：写场景、写剧情锁、打版本、回调通知', async () => {
    const a = createAutosave({ lock: { mode: 'none', items: [] } })
    a.resetSnapshot()
    a.scene.value.title = '新标题'

    await a.persistSceneSettings({ silent: false, version: true })

    expect(updateScene).toHaveBeenCalledWith(15, expect.objectContaining({ title: '新标题' }))
    expect(setSceneLock).toHaveBeenCalledWith(7, 15, { mode: 'none', items: [] })
    expect(createProjectVersion).toHaveBeenCalledWith(7, '保存场景设置')
    expect(ElMessage.success).toHaveBeenCalledWith('场景设置保存成功')
    expect(a.onSaved).toHaveBeenCalledTimes(1)
    expect(a.sceneDirty.value).toBe(false)
    expect(a.sceneSaving.value).toBe(false)
  })

  it('没有 projectId 时跳过剧情锁与版本', async () => {
    const a = createAutosave({ projectId: '' })
    a.resetSnapshot()
    await a.persistSceneSettings({ silent: false, version: true })
    expect(updateScene).toHaveBeenCalledTimes(1)
    expect(setSceneLock).not.toHaveBeenCalled()
    expect(createProjectVersion).not.toHaveBeenCalled()
  })

  it('没有 sceneId 或场景未就绪时直接返回', async () => {
    const noId = createAutosave({ sceneId: 0 })
    await noId.persistSceneSettings({ silent: false, version: true })

    const notReady = createAutosave({ ready: false })
    await notReady.persistSceneSettings({ silent: false, version: true })

    expect(updateScene).not.toHaveBeenCalled()
  })

  it('saveSceneSettings 取消排队并走非静默保存', async () => {
    vi.useFakeTimers()
    const a = createAutosave()
    a.resetSnapshot()
    a.scene.value.title = 'A'
    a.refreshSceneDirty()

    a.saveSceneSettings()
    await vi.advanceTimersByTimeAsync(5000)

    expect(updateScene).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('场景设置保存成功')
  })

  it('保存期间用户又改动时，保存后仍标记为脏并继续排队', async () => {
    vi.useFakeTimers()
    let mutated = false
    vi.mocked(updateScene).mockImplementation(async () => {
      if (!mutated) {
        mutated = true
        a.scene.value.title = '保存中又改的'
      }
      return {} as any
    })
    const a = createAutosave()
    a.resetSnapshot()
    a.scene.value.title = '第一次'

    a.saveSceneSettings()
    await vi.advanceTimersByTimeAsync(0)

    expect(a.sceneDirty.value).toBe(true)

    await vi.advanceTimersByTimeAsync(1200)
    expect(updateScene).toHaveBeenCalledTimes(2)
    expect(a.sceneDirty.value).toBe(false)
  })
})

describe('useSceneSettingsAutosave / 并发与失败', () => {
  it('静默保存撞上正在保存时会排队补一次', async () => {
    const a = createAutosave()
    a.resetSnapshot()

    let resolveFirst: (v: any) => void = () => {}
    vi.mocked(updateScene).mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve
    }) as any)

    a.scene.value.title = 'A'
    const first = a.persistSceneSettings({ silent: false, version: false })
    expect(a.sceneSaving.value).toBe(true)

    a.scene.value.title = 'AB'
    await a.persistSceneSettings({ silent: true, version: false })
    expect(updateScene).toHaveBeenCalledTimes(1)

    resolveFirst({})
    await first
    await vi.waitFor(() => expect(a.sceneDirty.value).toBe(false))

    expect(updateScene).toHaveBeenCalledTimes(2)
    expect(vi.mocked(updateScene).mock.calls[1][1]).toEqual(expect.objectContaining({ title: 'AB' }))
    a.cancelScheduledSave()
  })

  it('手动保存在保存中时提示稍候，不发第二次请求', async () => {
    const a = createAutosave()
    a.resetSnapshot()

    let resolveFirst: (v: any) => void = () => {}
    vi.mocked(updateScene).mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve
    }) as any)

    const first = a.persistSceneSettings({ silent: false, version: false })
    await a.persistSceneSettings({ silent: false, version: false })

    expect(ElMessage.info).toHaveBeenCalledWith('场景设置正在保存，请稍候')
    expect(updateScene).toHaveBeenCalledTimes(1)

    resolveFirst({})
    await first
  })

  it('静默保存失败给出警告，保留脏标记', async () => {
    vi.mocked(updateScene).mockRejectedValue(new Error('network'))
    const a = createAutosave()
    a.resetSnapshot()
    a.sceneDirty.value = true

    await a.persistSceneSettings({ silent: true, version: false })

    expect(ElMessage.warning).toHaveBeenCalledWith('场景设置自动保存失败，请手动保存')
    expect(a.sceneDirty.value).toBe(true)
    expect(a.sceneSaving.value).toBe(false)
  })

  it('手动保存失败给出错误信息，保留脏标记', async () => {
    vi.mocked(updateScene).mockRejectedValue(new Error('boom'))
    const a = createAutosave()
    a.resetSnapshot()
    a.sceneDirty.value = true

    await a.persistSceneSettings({ silent: false, version: true })

    expect(ElMessage.error).toHaveBeenCalledWith('保存场景设置失败: boom')
    expect(a.sceneDirty.value).toBe(true)
    expect(createProjectVersion).not.toHaveBeenCalled()
  })

  it('剧情锁写入失败同样按保存失败处理', async () => {
    vi.mocked(setSceneLock).mockRejectedValue(new Error('lock down'))
    const a = createAutosave()
    a.resetSnapshot()
    a.sceneDirty.value = true

    await a.persistSceneSettings({ silent: false, version: true })

    expect(ElMessage.error).toHaveBeenCalledWith('保存场景设置失败: lock down')
    expect(a.sceneDirty.value).toBe(true)
  })
})
