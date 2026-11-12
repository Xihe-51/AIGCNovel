/**
 * 场景批量配音：把选中的台词逐条走 TTS，生成音频后回填 voice_url。
 *
 * 只依赖台词列表与角色音色，队列筛选在弹窗里算好后传入，
 * 这里负责逐条执行、进度反馈与失败收集。
 */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { generateVoice, submitAndWait } from '@/api/ai'
import { importAiAsset } from '@/api/asset'
import { saveDialogues, autoTagEmotions } from '@/api/dialogue'
import { createProjectVersion } from '@/api/version'

/** 台词情绪标签（与后端 EMOTION_OPTIONS 一致） */
export const EMOTION_OPTIONS = ['平静', '犹豫', '生气', '哭腔', '低声']

export interface SceneVoiceBatchContext {
  /** 当前项目 id（字符串形式，可能为空） */
  projectId: Ref<any>
  /** 当前场景，兜底取 project_id */
  scene: Ref<any>
  /** 场景全部台词 */
  dialogues: Ref<any[]>
  /** 项目角色，用于取默认音色（角色列表在页面里较晚加载，用 getter 注入） */
  getCharacters: () => any[]
  /** 当前选中的台词下标 */
  selectedIndexes: Ref<number[]>
}

export function useSceneVoiceBatch(ctx: SceneVoiceBatchContext) {
  const voiceBatchVisible = ref(false)
  const voiceBatchRunning = ref(false)
  const voiceBatchDone = ref(0)
  const voiceBatchTotal = ref(0)
  const voiceBatchCurrent = ref('')
  const voiceBatchErrors = ref<string[]>([])

  // 弹窗队列预览的数据源：当前选中的台词
  const voiceBatchItems = computed(() =>
    ctx.selectedIndexes.value.map(i => ({ index: i, dialogue: ctx.dialogues.value[i] }))
  )

  const openVoiceBatch = () => {
    if (!ctx.selectedIndexes.value.length) return
    voiceBatchErrors.value = []
    voiceBatchDone.value = 0
    voiceBatchTotal.value = 0
    voiceBatchCurrent.value = ''
    voiceBatchVisible.value = true
  }

  // 台词对应角色的默认音色（未设置时返回空串）
  const characterVoiceFor = (dialogue: any): string => {
    if (!dialogue || !dialogue.character_id) return ''
    const c = (ctx.getCharacters() || []).find((x: any) => x.character_id === dialogue.character_id)
    return (c && c.voice_type) || ''
  }

  const runVoiceBatch = async ({
    voice,
    overwrite,
    useCharacter,
    useEmotion,
    autoTag,
    queue,
  }: {
    voice: string
    overwrite: boolean
    useCharacter: boolean
    useEmotion: boolean
    autoTag: boolean
    queue: number[]
  }) => {
    if (voiceBatchRunning.value) return
    const pid = Number(ctx.projectId.value || ctx.scene.value.project_id)
    if (!pid) {
      ElMessage.warning('项目信息加载中，请稍后再试')
      return
    }
    // 队列由弹窗按当前筛选条件算好，这里只做兜底校验
    const queue_ = queue
      .map(index => ({ index, dialogue: ctx.dialogues.value[index] }))
      .filter(({ dialogue }) =>
        dialogue &&
        dialogue.content_type !== '选择' &&
        String(dialogue.content_text || '').trim() &&
        (overwrite || !dialogue.voice_url)
      )
    if (!queue_.length) {
      ElMessage.info('没有符合筛选条件的台词，请检查情绪筛选或勾选「覆盖已有配音」')
      return
    }

    voiceBatchRunning.value = true
    voiceBatchErrors.value = []
    voiceBatchTotal.value = queue_.length
    voiceBatchDone.value = 0
    let success = 0

    try {
      // 未标注情绪的台词先按规则补全，确保「按情绪调整语速/音调」生效
      if (autoTag) {
        const missing = queue_.filter(({ dialogue }) => !EMOTION_OPTIONS.includes(dialogue.emotion))
        if (missing.length) {
          try {
            const suggestions: any[] = await autoTagEmotions(
              pid,
              missing.map(({ index, dialogue }) => ({
                index,
                content_id: dialogue.content_id || null,
                text: String(dialogue.content_text || '')
              }))
            )
            const byIndex = new Map(suggestions.map((s: any) => [s.index, s.emotion]))
            missing.forEach(({ index }) => {
              const emotion = byIndex.get(index)
              const dialogue = ctx.dialogues.value[index]
              if (emotion && dialogue) dialogue.emotion = emotion
            })
          } catch (e) {
            console.warn('情绪自动识别失败，按未标注继续配音:', e)
          }
        }
      }

      for (const item of queue_) {
        const index = item.index
        let dialogue = ctx.dialogues.value[index]
        if (!dialogue) continue
        voiceBatchCurrent.value = `#${index + 1} ${String(dialogue.content_text || '').slice(0, 24)}`
        try {
          // 未保存的新台词先生成节点，拿到 content_id 才能定位配音文件
          if (!dialogue.content_id) {
            dialogue.order_num = index + 1
            const saved: any = await saveDialogues(dialogue)
            dialogue = { ...saved, _choices: dialogue._choices, _effects: dialogue._effects }
            ctx.dialogues.value[index] = dialogue
          }

          const text = String(dialogue.content_text || '').trim()
          const voiceType = (useCharacter && characterVoiceFor(dialogue)) || voice
          const emotion = useEmotion ? (dialogue.emotion || '') : ''
          const info: any = await submitAndWait(
            () => generateVoice({ text, voice_type: voiceType, emotion }),
            { onProgress: (s: any) => { if (s.progress?.stage) voiceBatchCurrent.value = s.progress.stage } }
          )
          const sourceUrl = info?.file || info?.generated_text
          if (!sourceUrl) throw new Error('TTS 未返回音频地址')

          const extMatch = String(sourceUrl).match(/\.([a-z0-9]+)(?:\?|$)/i)
          const ext = extMatch ? extMatch[1] : 'mp3'
          const targetUrl = `/static/project/${pid}/voice/voice_${dialogue.content_id}_${Date.now()}.${ext}`
          await importAiAsset(pid, targetUrl, sourceUrl)

          const saved: any = await saveDialogues({ ...dialogue, voice_url: targetUrl })
          ctx.dialogues.value[index] = { ...saved, _choices: dialogue._choices, _effects: dialogue._effects }
          success += 1
        } catch (e: any) {
          console.error('批量配音失败:', e)
          voiceBatchErrors.value.push(`#${index + 1} ${e?.response?.data?.message || e?.message || '未知错误'}`)
        } finally {
          voiceBatchDone.value += 1
        }
      }
      if (success) {
        createProjectVersion(pid, '批量配音').catch(() => {})
        ElMessage.success(`已为 ${success} 条台词生成配音`)
      }
      if (voiceBatchErrors.value.length) {
        ElMessage.warning(`${voiceBatchErrors.value.length} 条配音失败，详见弹窗`)
      }
    } finally {
      voiceBatchRunning.value = false
      voiceBatchCurrent.value = ''
    }
  }

  return {
    voiceBatchVisible,
    voiceBatchRunning,
    voiceBatchDone,
    voiceBatchTotal,
    voiceBatchCurrent,
    voiceBatchErrors,
    voiceBatchItems,
    openVoiceBatch,
    characterVoiceFor,
    runVoiceBatch,
  }
}
