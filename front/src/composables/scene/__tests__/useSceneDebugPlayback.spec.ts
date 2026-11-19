import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { buildDebugPlayUrl, useSceneDebugPlayback } from '@/composables/scene/useSceneDebugPlayback'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

function createPlayback(options: { projectId?: string | number; sceneProjectId?: string | number } = {}) {
  const projectId = ref<string | number>(options.projectId ?? 7)
  const scene = ref<any>({ project_id: options.sceneProjectId ?? 7 })
  const playback = useSceneDebugPlayback({ projectId, scene })
  return { playback, projectId, scene }
}

describe('buildDebugPlayUrl', () => {
  it('拼出带 debug 与 start 的播放器地址', () => {
    expect(buildDebugPlayUrl(7, 101)).toBe('/view/7?debug=1&start=101')
  })

  it('字符串参数原样拼接', () => {
    expect(buildDebugPlayUrl('p1', 'c9')).toBe('/view/p1?debug=1&start=c9')
  })
})

describe('useSceneDebugPlayback', () => {
  let openSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  it('未保存的台词给出提示且不跳转', () => {
    const { playback } = createPlayback()
    playback.playFromDialogue({ content_text: '草稿' })
    expect(ElMessage.warning).toHaveBeenCalledWith('请先保存这条台词，再从这里试玩')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('dialogue 为空时同样提示', () => {
    const { playback } = createPlayback()
    playback.playFromDialogue(null)
    expect(ElMessage.warning).toHaveBeenCalledWith('请先保存这条台词，再从这里试玩')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('项目信息缺失时提示稍后再试', () => {
    const { playback } = createPlayback({ projectId: '', sceneProjectId: '' })
    playback.playFromDialogue({ content_id: 101 })
    expect(ElMessage.warning).toHaveBeenCalledWith('项目信息加载中，请稍后再试')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('projectId 为空时回落到 scene.project_id', () => {
    const { playback } = createPlayback({ projectId: '', sceneProjectId: 42 })
    playback.playFromDialogue({ content_id: 101 })
    expect(openSpy).toHaveBeenCalledWith('/view/42?debug=1&start=101', '_blank')
  })

  it('正常路径打开新标签页', () => {
    const { playback } = createPlayback({ projectId: 7 })
    playback.playFromDialogue({ content_id: 202 })
    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledWith('/view/7?debug=1&start=202', '_blank')
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })
})
