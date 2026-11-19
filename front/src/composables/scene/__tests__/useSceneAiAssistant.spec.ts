import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { buildAiHistory, useSceneAiAssistant } from '@/composables/scene/useSceneAiAssistant'
import { continueStory } from '@/api/ai'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/api/ai', () => ({
  continueStory: vi.fn(),
}))

const createAssistant = (overrides: Record<string, any> = {}) => {
  const projectId = ref<string | number | null>(7)
  const scene = ref({ scene_id: 15 })
  const dialogues = ref<any[]>([
    { content_type: '对话', character_id: 1, content_text: '第一句' },
    { content_type: '描述', character_id: null, content_text: '   ' },
    { content_type: '对话', character_id: 2, content_text: '第三句' },
    { content_type: '对话', character_id: 1, content_text: '第四句' },
  ])
  const getCharacterName = vi.fn((id: any) => (id ? `角色${id}` : '旁白'))
  const assistant = useSceneAiAssistant({ projectId, scene, dialogues, getCharacterName, ...overrides })
  return { assistant, projectId, scene, dialogues, getCharacterName }
}

describe('buildAiHistory', () => {
  const name = (id: any) => (id ? `角色${id}` : '旁白')

  it('cut 为下标时只取该条之前的剧情', () => {
    const list = [
      { content_type: '对话', character_id: 1, content_text: 'A' },
      { content_type: '对话', character_id: 2, content_text: 'B' },
      { content_type: '对话', character_id: 1, content_text: 'C' },
    ]
    expect(buildAiHistory(list, 2, name).map((h) => h.content_text)).toEqual(['A', 'B'])
  })

  it('cut 为 null 时取全部', () => {
    const list = [
      { content_type: '对话', character_id: 1, content_text: 'A' },
      { content_type: '对话', character_id: 2, content_text: 'B' },
    ]
    expect(buildAiHistory(list, null, name)).toHaveLength(2)
  })

  it('跳过空白文本的占位行', () => {
    const list = [
      { content_type: '对话', character_id: 1, content_text: 'A' },
      { content_type: '对话', character_id: 2, content_text: '' },
      { content_type: '对话', character_id: 3, content_text: '   ' },
    ]
    expect(buildAiHistory(list, null, name)).toHaveLength(1)
  })

  it('把 character_id 映射成角色名', () => {
    const list = [{ content_type: '描述', character_id: null, content_text: '夜色深沉' }]
    expect(buildAiHistory(list, null, name)[0]).toEqual({
      content_type: '描述',
      character_name: '旁白',
      content_text: '夜色深沉',
    })
  })

  it('空列表与负数 cut 都不抛错', () => {
    expect(buildAiHistory([], null, name)).toEqual([])
    expect(buildAiHistory(null, null, name)).toEqual([])
    expect(buildAiHistory([{ content_text: 'A' }], -1, name)).toEqual([])
  })
})

describe('useSceneAiAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(continueStory as any).mockResolvedValue({ generated_text: '生成的一段', persona_hits: [] })
  })

  it('打开弹窗时清空上次的提问与答案', () => {
    const { assistant } = createAssistant()
    assistant.aiQuestion.value = '旧问题'
    assistant.aiAnswer.value = '旧答案'

    assistant.openAIDialog(2)

    expect(assistant.currentAIIndex.value).toBe(2)
    expect(assistant.aiQuestion.value).toBe('')
    expect(assistant.aiAnswer.value).toBe('')
    expect(assistant.aiDialogVisible.value).toBe(true)
  })

  it('空提问时提示且不发请求', async () => {
    const { assistant } = createAssistant()
    assistant.aiQuestion.value = '   '

    await assistant.sendToAI()

    expect(ElMessage.warning).toHaveBeenCalledWith('请输入问题')
    expect(continueStory).not.toHaveBeenCalled()
    expect(assistant.aiLoading.value).toBe(false)
  })

  it('项目未加载时提示且不发请求', async () => {
    const { assistant } = createAssistant({ projectId: ref(null) })
    assistant.aiQuestion.value = '继续写'

    await assistant.sendToAI()

    expect(ElMessage.warning).toHaveBeenCalledWith('项目信息加载中，请稍后再试')
    expect(continueStory).not.toHaveBeenCalled()
  })

  it('正常请求：带上正确上下文并写入答案', async () => {
    const { assistant, getCharacterName } = createAssistant()
    assistant.openAIDialog(2)
    assistant.aiQuestion.value = '让王医生出场'

    await assistant.sendToAI()

    const [params] = (continueStory as any).mock.calls[0]
    expect(params.project_id).toBe(7)
    expect(params.scene_id).toBe(15)
    expect(params.user_input).toBe('让王医生出场')
    expect(params.use_rag).toBe(true)
    expect(params.history).toEqual([
      { content_type: '对话', character_name: '角色1', content_text: '第一句' },
    ])
    expect(getCharacterName).toHaveBeenCalledWith(1)

    expect(assistant.aiAnswer.value).toBe('生成的一段')
    expect(assistant.aiRefs.value).toEqual([])
    expect(assistant.aiLoading.value).toBe(false)
    expect(assistant.aiStage.value).toBe('')
  })

  it('命中角色人设时给出参考角色提示', async () => {
    ;(continueStory as any).mockResolvedValue({
      generated_text: '生成的一段',
      persona_hits: [{ name: '王医生' }, { name: '林小雨' }],
    })
    const { assistant } = createAssistant()
    assistant.aiQuestion.value = '继续写'

    await assistant.sendToAI()

    expect(assistant.aiRefs.value).toHaveLength(2)
    expect(ElMessage.success).toHaveBeenCalledWith('已生成（参考角色：王医生、林小雨）')
  })

  it('返回内容为空时报错', async () => {
    ;(continueStory as any).mockResolvedValue({ generated_text: '', persona_hits: [] })
    const { assistant } = createAssistant()
    assistant.aiQuestion.value = '继续写'

    await assistant.sendToAI()

    expect(ElMessage.error).toHaveBeenCalledWith('AI生成失败：返回内容为空')
    expect(assistant.aiAnswer.value).toBe('')
  })

  it('请求失败时报错并复位加载态', async () => {
    ;(continueStory as any).mockRejectedValue(new Error('网络中断'))
    const { assistant } = createAssistant()
    assistant.aiQuestion.value = '继续写'

    await assistant.sendToAI()

    expect(ElMessage.error).toHaveBeenCalledWith('AI服务请求失败：网络中断')
    expect(assistant.aiLoading.value).toBe(false)
    expect(assistant.aiStage.value).toBe('')
  })

  it('应用答案写入当前台词并关闭弹窗', () => {
    const { assistant, dialogues } = createAssistant()
    assistant.openAIDialog(1)
    assistant.aiAnswer.value = '替换后的内容'

    assistant.applyAIAnswer()

    expect(dialogues.value[1].content_text).toBe('替换后的内容')
    expect(ElMessage.success).toHaveBeenCalledWith('已应用到当前对话')
    expect(assistant.aiDialogVisible.value).toBe(false)
  })

  it('没选条目或答案为空时应用不生效', () => {
    const { assistant, dialogues } = createAssistant()
    assistant.aiAnswer.value = '替换后的内容'

    assistant.applyAIAnswer()
    expect(dialogues.value[1].content_text).toBe('   ')

    assistant.openAIDialog(1)
    assistant.aiAnswer.value = ''
    assistant.applyAIAnswer()

    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(assistant.aiDialogVisible.value).toBe(true)
  })
})
