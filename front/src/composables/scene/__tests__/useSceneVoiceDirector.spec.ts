import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useSceneVoiceDirector } from '@/composables/scene/useSceneVoiceDirector'

const autoTagEmotions = vi.fn()

vi.mock('@/api/dialogue', () => ({
  autoTagEmotions: (...args: any[]) => autoTagEmotions(...args),
  saveDialogues: vi.fn(),
}))

vi.mock('@/api/ai', () => ({
  generateVoice: vi.fn(),
  submitAndWait: vi.fn(),
}))

vi.mock('@/api/asset', () => ({
  importAiAsset: vi.fn(),
}))

vi.mock('@/api/version', () => ({
  createProjectVersion: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

function createDirector(options: {
  projectId?: any
  sceneProjectId?: number
  dialogues?: any[]
  selected?: number[]
} = {}) {
  const projectId = ref(options.projectId ?? '7')
  const scene = ref({ project_id: options.sceneProjectId ?? 7 })
  const dialogues = ref<any[]>(options.dialogues ?? [])
  const selectedIndexes = ref<number[]>(options.selected ?? [])
  const snapshot = vi.fn(() => JSON.parse(JSON.stringify(dialogues.value)))
  const pushHistory = vi.fn()
  const markDirty = vi.fn()

  const director = useSceneVoiceDirector({
    projectId,
    scene,
    dialogues,
    selectedIndexes,
    snapshot,
    pushHistory,
    markDirty,
  })

  return { ...director, dialogues, selectedIndexes, projectId, scene, snapshot, pushHistory, markDirty }
}

beforeEach(() => {
  autoTagEmotions.mockReset()
  autoTagEmotions.mockResolvedValue([])
  vi.mocked(ElMessage.success).mockReset()
  vi.mocked(ElMessage.warning).mockReset()
  vi.mocked(ElMessage.error).mockReset()
  vi.mocked(ElMessage.info).mockReset()
})

describe('useSceneVoiceDirector / 情绪统计', () => {
  it('可配音台词排除选择节点', () => {
    const d = createDirector({
      dialogues: [
        { content_text: 'a' },
        { content_type: '选择', content_text: '选' },
        { content_text: 'b' },
      ],
    })
    expect(d.sceneVoicableCount.value).toBe(2)
  })

  it('按情绪分桶，未知情绪计入未标注', () => {
    const d = createDirector({
      dialogues: [
        { content_text: 'a', emotion: '生气' },
        { content_text: 'b', emotion: '平静' },
        { content_text: 'c', emotion: '奇怪标签' },
        { content_text: 'd' },
        { content_type: '选择', content_text: '选' },
      ],
    })
    const { stats, total } = d.sceneEmotionStats.value
    expect(total).toBe(4)
    expect(stats['生气']).toBe(1)
    expect(stats['平静']).toBe(1)
    expect(stats['未标注']).toBe(2)
    expect(stats['犹豫']).toBe(0)
  })

  it('emotionStatRows 计算百分比并保留全部情绪行', () => {
    const d = createDirector({
      dialogues: [
        { content_text: 'a', emotion: '生气' },
        { content_text: 'b', emotion: '生气' },
        { content_text: 'c', emotion: '平静' },
        { content_text: 'd' },
      ],
    })
    const rows = d.emotionStatRows.value
    expect(rows).toHaveLength(6)
    expect(rows.find(r => r.emotion === '生气')).toEqual({ emotion: '生气', count: 2, percent: 50 })
    expect(rows.find(r => r.emotion === '未标注')).toEqual({ emotion: '未标注', count: 1, percent: 25 })
  })

  it('没有台词时百分比为 0 而不是 NaN', () => {
    const d = createDirector({ dialogues: [] })
    expect(d.emotionStatRows.value.every(r => r.percent === 0)).toBe(true)
  })
})

describe('useSceneVoiceDirector / 打开与范围', () => {
  it('没有选中台词时默认标注全部', () => {
    const d = createDirector({ selected: [] })
    d.openVoiceDirector()
    expect(d.voiceDirectorVisible.value).toBe(true)
    expect(d.emotionTagScope.value).toBe('all')
  })

  it('有选中台词时默认只标注选中', () => {
    const d = createDirector({ selected: [1] })
    d.openVoiceDirector()
    expect(d.emotionTagScope.value).toBe('selected')
  })

  it('打开时清空上一次的识别结果并重置筛选', () => {
    const d = createDirector({ selected: [] })
    d.emotionTagRows.value = [{ index: 0 }]
    d.emotionTagOnlyUnlabeled.value = false
    d.openVoiceDirector()
    expect(d.emotionTagRows.value).toEqual([])
    expect(d.emotionTagOnlyUnlabeled.value).toBe(true)
  })

  it('scope=all 时排除选择节点与空文本', () => {
    const d = createDirector({
      dialogues: [
        { content_text: 'a' },
        { content_type: '选择', content_text: '选' },
        { content_text: '  ' },
        { content_text: 'b' },
      ],
    })
    d.emotionTagScope.value = 'all'
    expect(d.emotionTagTargets.value.map(t => t.index)).toEqual([0, 3])
  })

  it('scope=selected 时只保留选中下标', () => {
    const d = createDirector({
      dialogues: [{ content_text: 'a' }, { content_text: 'b' }, { content_text: 'c' }],
      selected: [1],
    })
    d.emotionTagScope.value = 'selected'
    expect(d.emotionTagTargets.value.map(t => t.index)).toEqual([1])
  })

  it('onlyUnlabeled=true 时跳过已标注台词', () => {
    const d = createDirector({
      dialogues: [
        { content_text: 'a' },
        { content_text: 'b', emotion: '平静' },
        { content_text: 'c', emotion: '自定义' },
      ],
    })
    d.emotionTagScope.value = 'all'
    d.emotionTagOnlyUnlabeled.value = true
    expect(d.emotionTagTargets.value.map(t => t.index)).toEqual([0, 2])
  })
})

describe('useSceneVoiceDirector / 自动标注', () => {
  it('正在识别时不重入', async () => {
    const d = createDirector({ dialogues: [{ content_text: 'a' }] })
    d.emotionTagRunning.value = true
    await d.runEmotionAutoTag()
    expect(autoTagEmotions).not.toHaveBeenCalled()
  })

  it('项目 id 缺失时提示并退出', async () => {
    const d = createDirector({ projectId: '', sceneProjectId: 0, dialogues: [{ content_text: 'a' }] })
    await d.runEmotionAutoTag()
    expect(ElMessage.warning).toHaveBeenCalledWith('项目信息加载中，请稍后再试')
    expect(autoTagEmotions).not.toHaveBeenCalled()
  })

  it('没有目标台词时按筛选条件给出不同提示', async () => {
    const d = createDirector({ dialogues: [] })
    d.emotionTagOnlyUnlabeled.value = true
    await d.runEmotionAutoTag()
    expect(ElMessage.info).toHaveBeenCalledWith('当前范围内没有未标注情绪的台词')

    d.emotionTagOnlyUnlabeled.value = false
    await d.runEmotionAutoTag()
    expect(ElMessage.info).toHaveBeenCalledWith('当前范围内没有可标注的台词')
  })

  it('识别成功时生成带默认值的勾选行', async () => {
    autoTagEmotions.mockResolvedValue([{ index: 0, emotion: '生气', reason: '关键词', confidence: 'high' }])
    const d = createDirector({ dialogues: [{ content_text: 'a' }, { content_text: 'b' }] })
    await d.runEmotionAutoTag()
    expect(autoTagEmotions).toHaveBeenCalledWith(7, [
      { index: 0, content_id: null, text: 'a' },
      { index: 1, content_id: null, text: 'b' },
    ])
    expect(d.emotionTagRows.value).toEqual([
      { index: 0, text: 'a', emotion: '生气', reason: '关键词', confidence: 'high', checked: true },
      { index: 1, text: 'b', emotion: '平静', reason: '规则推断', confidence: 'low', checked: true },
    ])
  })

  it('返回未知情绪时回退成平静', async () => {
    autoTagEmotions.mockResolvedValue([{ index: 0, emotion: '暴怒' }])
    const d = createDirector({ dialogues: [{ content_text: 'a' }] })
    await d.runEmotionAutoTag()
    expect(d.emotionTagRows.value[0].emotion).toBe('平静')
  })

  it('识别失败时提示错误并复位运行态', async () => {
    autoTagEmotions.mockRejectedValue(new Error('ai down'))
    const d = createDirector({ dialogues: [{ content_text: 'a' }] })
    await d.runEmotionAutoTag()
    expect(ElMessage.error).toHaveBeenCalledWith('情绪识别失败：ai down')
    expect(d.emotionTagRunning.value).toBe(false)
  })
})

describe('useSceneVoiceDirector / 应用标注', () => {
  it('没有勾选行时提示先勾选', () => {
    const d = createDirector({ dialogues: [{ content_text: 'a' }] })
    d.emotionTagRows.value = [{ index: 0, emotion: '生气', checked: false }]
    d.applyEmotionTags()
    expect(ElMessage.info).toHaveBeenCalledWith('请先勾选要应用的标注')
    expect(d.markDirty).not.toHaveBeenCalled()
  })

  it('标注与现状一致时不记历史', () => {
    const d = createDirector({ dialogues: [{ content_text: 'a', emotion: '生气' }] })
    d.emotionTagRows.value = [{ index: 0, emotion: '生气', checked: true }]
    d.applyEmotionTags()
    expect(ElMessage.info).toHaveBeenCalledWith('所选情绪与现有标注一致，无需修改')
    expect(d.pushHistory).not.toHaveBeenCalled()
  })

  it('有变化时写回台词、记历史并标脏', () => {
    const d = createDirector({
      dialogues: [{ content_text: 'a' }, { content_text: 'b', emotion: '平静' }],
    })
    const beforeSnapshot = JSON.parse(JSON.stringify(d.dialogues.value))
    d.emotionTagRows.value = [
      { index: 0, emotion: '生气', checked: true },
      { index: 1, emotion: '犹豫', checked: true },
    ]
    d.applyEmotionTags()
    expect(d.dialogues.value[0].emotion).toBe('生气')
    expect(d.dialogues.value[1].emotion).toBe('犹豫')
    expect(d.snapshot).toHaveBeenCalled()
    expect(d.pushHistory).toHaveBeenCalledWith(beforeSnapshot)
    expect(d.markDirty).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('已应用 2 条情绪标注，点「保存全部」后生效')
  })

  it('下标越界时跳过而不是抛错', () => {
    const d = createDirector({ dialogues: [{ content_text: 'a' }] })
    d.emotionTagRows.value = [{ index: 9, emotion: '生气', checked: true }]
    d.applyEmotionTags()
    expect(ElMessage.info).toHaveBeenCalledWith('所选情绪与现有标注一致，无需修改')
  })

  it('emotionTagCheckedCount 只数勾选行', () => {
    const d = createDirector({})
    d.emotionTagRows.value = [
      { index: 0, checked: true },
      { index: 1, checked: false },
      { index: 2, checked: true },
    ]
    expect(d.emotionTagCheckedCount.value).toBe(2)
  })
})
