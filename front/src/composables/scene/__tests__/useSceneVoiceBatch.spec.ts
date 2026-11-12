import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useSceneVoiceBatch, EMOTION_OPTIONS } from '@/composables/scene/useSceneVoiceBatch'

const generateVoice = vi.fn()
const submitAndWait = vi.fn()
const importAiAsset = vi.fn()
const saveDialogues = vi.fn()
const autoTagEmotions = vi.fn()
const createProjectVersion = vi.fn()

vi.mock('@/api/ai', () => ({
  generateVoice: (...args: any[]) => generateVoice(...args),
  submitAndWait: (...args: any[]) => submitAndWait(...args),
}))

vi.mock('@/api/asset', () => ({
  importAiAsset: (...args: any[]) => importAiAsset(...args),
}))

vi.mock('@/api/dialogue', () => ({
  saveDialogues: (...args: any[]) => saveDialogues(...args),
  autoTagEmotions: (...args: any[]) => autoTagEmotions(...args),
}))

vi.mock('@/api/version', () => ({
  createProjectVersion: (...args: any[]) => createProjectVersion(...args),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

function createBatch(options: {
  projectId?: any
  sceneProjectId?: number
  dialogues?: any[]
  characters?: any[]
  selected?: number[]
} = {}) {
  const projectId = ref(options.projectId ?? '7')
  const scene = ref({ project_id: options.sceneProjectId ?? 7 })
  const dialogues = ref<any[]>(options.dialogues ?? [])
  const characters = ref<any[]>(options.characters ?? [])
  const selectedIndexes = ref<number[]>(options.selected ?? [])

  const batch = useSceneVoiceBatch({
    projectId,
    scene,
    dialogues,
    selectedIndexes,
    getCharacters: () => characters.value,
  })

  return { ...batch, dialogues, characters, selectedIndexes, projectId, scene }
}

beforeEach(() => {
  generateVoice.mockReset()
  submitAndWait.mockReset()
  importAiAsset.mockReset()
  saveDialogues.mockReset()
  autoTagEmotions.mockReset()
  createProjectVersion.mockReset()
  vi.mocked(ElMessage.success).mockReset()
  vi.mocked(ElMessage.warning).mockReset()
  vi.mocked(ElMessage.info).mockReset()

  // 真实实现会先调用传入的工厂函数（内部才发出 generateVoice 请求），这里保持同样的调用关系
  submitAndWait.mockImplementation(async (fn: any) => {
    await fn()
    return { file: 'https://cdn/voice.mp3' }
  })
  importAiAsset.mockResolvedValue({ url: '/static/x.mp3' })
  saveDialogues.mockImplementation(async (d: any) => ({ ...d, content_id: d.content_id || 999 }))
  autoTagEmotions.mockResolvedValue([])
  createProjectVersion.mockResolvedValue(undefined)
})

describe('useSceneVoiceBatch / 弹窗与预览', () => {
  it('情绪标签与后端约定一致', () => {
    expect(EMOTION_OPTIONS).toEqual(['平静', '犹豫', '生气', '哭腔', '低声'])
  })

  it('没有选中台词时打不开弹窗', () => {
    const b = createBatch({ selected: [] })
    b.openVoiceBatch()
    expect(b.voiceBatchVisible.value).toBe(false)
  })

  it('打开弹窗时重置进度与错误', () => {
    const b = createBatch({ selected: [0] })
    b.voiceBatchErrors.value = ['旧错误']
    b.voiceBatchDone.value = 3
    b.voiceBatchTotal.value = 5
    b.openVoiceBatch()
    expect(b.voiceBatchVisible.value).toBe(true)
    expect(b.voiceBatchErrors.value).toEqual([])
    expect(b.voiceBatchDone.value).toBe(0)
    expect(b.voiceBatchTotal.value).toBe(0)
  })

  it('voiceBatchItems 按选中下标映射台词', () => {
    const b = createBatch({
      dialogues: [{ content_text: 'a' }, { content_text: 'b' }, { content_text: 'c' }],
      selected: [0, 2],
    })
    expect(b.voiceBatchItems.value).toEqual([
      { index: 0, dialogue: { content_text: 'a' } },
      { index: 2, dialogue: { content_text: 'c' } },
    ])
  })

  it('characterVoiceFor 取角色默认音色，缺失时返回空串', () => {
    const b = createBatch({
      characters: [
        { character_id: 1, voice_type: 'female-1' },
        { character_id: 2 },
      ],
    })
    expect(b.characterVoiceFor({ character_id: 1 })).toBe('female-1')
    expect(b.characterVoiceFor({ character_id: 2 })).toBe('')
    expect(b.characterVoiceFor({ character_id: 99 })).toBe('')
    expect(b.characterVoiceFor(null)).toBe('')
  })
})

describe('useSceneVoiceBatch / 执行前置校验', () => {
  const baseArgs = { voice: 'v', overwrite: false, useCharacter: false, useEmotion: false, autoTag: false }

  it('正在跑时不重入', async () => {
    const b = createBatch({ dialogues: [{ content_text: 'a' }], selected: [0] })
    b.voiceBatchRunning.value = true
    await b.runVoiceBatch({ ...baseArgs, queue: [0] })
    expect(submitAndWait).not.toHaveBeenCalled()
  })

  it('项目 id 缺失时提示并退出', async () => {
    const b = createBatch({ projectId: '', sceneProjectId: 0, dialogues: [{ content_text: 'a' }] })
    await b.runVoiceBatch({ ...baseArgs, queue: [0] })
    expect(ElMessage.warning).toHaveBeenCalledWith('项目信息加载中，请稍后再试')
    expect(submitAndWait).not.toHaveBeenCalled()
  })

  it('projectId 为空时回落到 scene.project_id', async () => {
    const b = createBatch({
      projectId: '',
      sceneProjectId: 12,
      dialogues: [{ content_id: 1, content_text: 'a' }],
    })
    await b.runVoiceBatch({ ...baseArgs, queue: [0] })
    expect(importAiAsset).toHaveBeenCalledWith(12, expect.any(String), 'https://cdn/voice.mp3')
  })

  it('队列过滤掉选择节点、空文本与已有配音', async () => {
    const b = createBatch({
      dialogues: [
        { content_id: 1, content_type: '选择', content_text: '选项' },
        { content_id: 2, content_text: '   ' },
        { content_id: 3, content_text: '已配音', voice_url: '/a.mp3' },
      ],
    })
    await b.runVoiceBatch({ ...baseArgs, queue: [0, 1, 2] })
    expect(ElMessage.info).toHaveBeenCalledWith('没有符合筛选条件的台词，请检查情绪筛选或勾选「覆盖已有配音」')
    expect(submitAndWait).not.toHaveBeenCalled()
  })

  it('overwrite=true 时已有配音的台词也会重做', async () => {
    const b = createBatch({ dialogues: [{ content_id: 3, content_text: '已配音', voice_url: '/a.mp3' }] })
    await b.runVoiceBatch({ ...baseArgs, overwrite: true, queue: [0] })
    expect(submitAndWait).toHaveBeenCalledTimes(1)
  })
})

describe('useSceneVoiceBatch / 执行流程', () => {
  const baseArgs = { voice: 'v', overwrite: false, useCharacter: false, useEmotion: false, autoTag: false }

  it('成功时回填 voice_url、计数并创建版本', async () => {
    const b = createBatch({ dialogues: [{ content_id: 5, content_text: '你好' }] })
    await b.runVoiceBatch({ ...baseArgs, queue: [0] })
    expect(b.dialogues.value[0].voice_url).toMatch(/^\/static\/project\/7\/voice\/voice_5_\d+\.mp3$/)
    expect(b.voiceBatchDone.value).toBe(1)
    expect(b.voiceBatchTotal.value).toBe(1)
    expect(b.voiceBatchErrors.value).toEqual([])
    expect(createProjectVersion).toHaveBeenCalledWith(7, '批量配音')
    expect(ElMessage.success).toHaveBeenCalledWith('已为 1 条台词生成配音')
    expect(b.voiceBatchRunning.value).toBe(false)
  })

  it('未保存的新台词先落库拿到 content_id', async () => {
    const b = createBatch({ dialogues: [{ content_text: '新台词' }] })
    await b.runVoiceBatch({ ...baseArgs, queue: [0] })
    expect(saveDialogues).toHaveBeenCalledWith(expect.objectContaining({ order_num: 1 }))
    expect(b.dialogues.value[0].content_id).toBe(999)
  })

  it('角色音色优先于统一音色', async () => {
    const b = createBatch({
      dialogues: [{ content_id: 1, content_text: 'a', character_id: 1 }],
      characters: [{ character_id: 1, voice_type: 'male-2' }],
    })
    await b.runVoiceBatch({ ...baseArgs, useCharacter: true, voice: 'fallback', queue: [0] })
    expect(generateVoice).toHaveBeenCalledWith(expect.objectContaining({ voice_type: 'male-2' }))
  })

  it('未开启 useCharacter 时用统一音色', async () => {
    const b = createBatch({
      dialogues: [{ content_id: 1, content_text: 'a', character_id: 1 }],
      characters: [{ character_id: 1, voice_type: 'male-2' }],
    })
    await b.runVoiceBatch({ ...baseArgs, useCharacter: false, voice: 'fallback', queue: [0] })
    expect(generateVoice).toHaveBeenCalledWith(expect.objectContaining({ voice_type: 'fallback' }))
  })

  it('useEmotion 关闭时不传情绪', async () => {
    const b = createBatch({ dialogues: [{ content_id: 1, content_text: 'a', emotion: '生气' }] })
    await b.runVoiceBatch({ ...baseArgs, useEmotion: false, queue: [0] })
    expect(generateVoice).toHaveBeenCalledWith(expect.objectContaining({ emotion: '' }))
  })

  it('autoTag 只给未标注的台词补情绪', async () => {
    autoTagEmotions.mockResolvedValue([{ index: 0, emotion: '生气' }])
    const b = createBatch({
      dialogues: [
        { content_id: 1, content_text: 'a' },
        { content_id: 2, content_text: 'b', emotion: '平静' },
      ],
    })
    await b.runVoiceBatch({ ...baseArgs, autoTag: true, queue: [0, 1] })
    expect(autoTagEmotions).toHaveBeenCalledTimes(1)
    expect(autoTagEmotions.mock.calls[0][1]).toHaveLength(1)
    expect(b.dialogues.value[0].emotion).toBe('生气')
  })

  it('autoTag 失败时按未标注继续配音', async () => {
    autoTagEmotions.mockRejectedValue(new Error('ai down'))
    const b = createBatch({ dialogues: [{ content_id: 1, content_text: 'a' }] })
    await b.runVoiceBatch({ ...baseArgs, autoTag: true, queue: [0] })
    expect(submitAndWait).toHaveBeenCalledTimes(1)
    expect(b.voiceBatchErrors.value).toEqual([])
  })

  it('单条失败不影响后续，并汇总错误提示', async () => {
    submitAndWait
      .mockRejectedValueOnce(new Error('TTS 挂了'))
      .mockResolvedValueOnce({ file: 'https://cdn/ok.mp3' })
    const b = createBatch({
      dialogues: [
        { content_id: 1, content_text: 'a' },
        { content_id: 2, content_text: 'b' },
      ],
    })
    await b.runVoiceBatch({ ...baseArgs, queue: [0, 1] })
    expect(b.voiceBatchErrors.value).toHaveLength(1)
    expect(b.voiceBatchErrors.value[0]).toContain('#1')
    expect(b.voiceBatchDone.value).toBe(2)
    expect(ElMessage.warning).toHaveBeenCalledWith('1 条配音失败，详见弹窗')
  })

  it('TTS 没有返回地址时记为失败', async () => {
    submitAndWait.mockResolvedValue({})
    const b = createBatch({ dialogues: [{ content_id: 1, content_text: 'a' }] })
    await b.runVoiceBatch({ ...baseArgs, queue: [0] })
    expect(b.voiceBatchErrors.value[0]).toContain('TTS 未返回音频地址')
  })

  it('全部失败时不创建版本、不提示成功', async () => {
    submitAndWait.mockRejectedValue(new Error('down'))
    const b = createBatch({ dialogues: [{ content_id: 1, content_text: 'a' }] })
    await b.runVoiceBatch({ ...baseArgs, queue: [0] })
    expect(createProjectVersion).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('执行结束后复位运行态与当前项', async () => {
    const b = createBatch({ dialogues: [{ content_id: 1, content_text: 'a' }] })
    await b.runVoiceBatch({ ...baseArgs, queue: [0] })
    expect(b.voiceBatchRunning.value).toBe(false)
    expect(b.voiceBatchCurrent.value).toBe('')
  })
})
