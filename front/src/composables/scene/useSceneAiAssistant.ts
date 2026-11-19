/**
 * AI 续写 / 问答：AI 弹窗的全部状态与请求编排。
 *
 * 历史沿革：早期前端自制的 generateHistorySummary()（近邻 5 条 + 固定规则截断）
 * 已废弃，现在一律走 /ai/continue_story：
 *   - 上下文压缩交给 LangChain ConversationSummaryBufferMemory（近期原文 + 远期 LLM 摘要）
 *   - 角色人设由 RAG 向量检索自动注入，保证人物一致性
 *   - 前端只负责把「已写剧情 + 本次要求」传过去
 *
 * 这里只产出候选文案；写入哪条台词由 applyAIAnswer 决定，
 * 具体落盘仍交给场景的 dirty / 自动保存链路。
 */
import type { Ref } from 'vue'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { continueStory } from '@/api/ai'
import { formatErrorMessage } from '@/utils/errorMessage'

export interface AiHistoryEntry {
  content_type: string | undefined
  character_name: string
  content_text: string
}

/**
 * 取「当前条目之前」的已写剧情，作为续写上下文。
 *
 * cut 为当前编辑条目下标；为 null 时表示「追加到末尾」，取全部。
 * 空文本条目一律跳过——它们只是尚未填写的占位行。
 * 纯函数，便于单测。
 */
export const buildAiHistory = (
  dialogues: any[] | null | undefined,
  cut: number | null | undefined,
  getCharacterName: (characterId: any) => string
): AiHistoryEntry[] => {
  const list = dialogues || []
  const limit = cut === null || cut === undefined ? list.length : cut
  return list
    .slice(0, Math.max(0, limit))
    .filter((d) => (d?.content_text || '').trim())
    .map((d) => ({
      content_type: d.content_type,
      character_name: getCharacterName(d.character_id),
      content_text: d.content_text,
    }))
}

export interface SceneAiAssistantContext {
  projectId: Ref<string | number | null | undefined>
  scene: Ref<any>
  dialogues: Ref<any[]>
  getCharacterName: (characterId: any) => string
}

export function useSceneAiAssistant(ctx: SceneAiAssistantContext) {
  const { projectId, scene, dialogues, getCharacterName } = ctx

  const aiDialogVisible = ref(false)
  const aiQuestion = ref('')
  const aiAnswer = ref('')
  const aiLoading = ref(false)
  const currentAIIndex = ref<number | null>(null)
  const aiStage = ref('')
  const aiRefs = ref<any[]>([])

  const openAIDialog = (index: number) => {
    currentAIIndex.value = index
    aiQuestion.value = ''
    aiAnswer.value = ''
    aiDialogVisible.value = true
  }

  const sendToAI = async () => {
    if (!aiQuestion.value.trim()) {
      ElMessage.warning('请输入问题')
      return
    }
    if (!projectId.value) {
      ElMessage.warning('项目信息加载中，请稍后再试')
      return
    }

    aiLoading.value = true
    aiAnswer.value = ''
    aiRefs.value = []
    aiStage.value = '正在整理上下文…'

    try {
      const history = buildAiHistory(dialogues.value, currentAIIndex.value, getCharacterName)

      const result = await continueStory(
        {
          project_id: projectId.value as number,
          scene_id: scene.value.scene_id,
          user_input: aiQuestion.value,
          history,
          use_rag: true,
          length: 500,
          temperature: 0.8,
          forbidden_words: '',
        },
        {
          onProgress: (s: any) => {
            if (s?.progress?.stage) aiStage.value = s.progress.stage
          },
        }
      )

      aiAnswer.value = result?.generated_text || ''
      aiRefs.value = result?.persona_hits || []

      if (!aiAnswer.value) {
        ElMessage.error('AI生成失败：返回内容为空')
      } else if (aiRefs.value.length) {
        ElMessage.success('已生成（参考角色：' + aiRefs.value.map((r) => r.name).join('、') + '）')
      }
    } catch (err: any) {
      console.error('AI请求失败:', err)
      ElMessage.error(formatErrorMessage('AI服务请求失败', err))
    } finally {
      aiLoading.value = false
      aiStage.value = ''
    }
  }

  const applyAIAnswer = () => {
    if (currentAIIndex.value !== null && aiAnswer.value) {
      dialogues.value[currentAIIndex.value].content_text = aiAnswer.value
      ElMessage.success('已应用到当前对话')
      aiDialogVisible.value = false
    }
  }

  return {
    aiDialogVisible,
    aiQuestion,
    aiAnswer,
    aiLoading,
    currentAIIndex,
    aiStage,
    aiRefs,
    openAIDialog,
    sendToAI,
    applyAIAnswer,
  }
}
