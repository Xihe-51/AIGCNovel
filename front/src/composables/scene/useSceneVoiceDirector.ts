/**
 * 配音导演：场景情绪分布统计 + 规则自动标注。
 *
 * 只做"算统计 / 跑识别 / 把确认后的标签写回台词"，
 * 写回后的撤销历史与脏标记由页面通过回调注入，避免反向依赖编辑器的历史栈。
 */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { autoTagEmotions } from '@/api/dialogue'
import { EMOTION_OPTIONS } from '@/composables/scene/useSceneVoiceBatch'

export interface SceneVoiceDirectorContext {
  /** 当前项目 id（字符串形式，可能为空） */
  projectId: Ref<any>
  /** 当前场景，兜底取 project_id */
  scene: Ref<any>
  /** 场景全部台词 */
  dialogues: Ref<any[]>
  /** 当前选中的台词下标 */
  selectedIndexes: Ref<number[]>
  /** 取当前台词快照，用于撤销 */
  snapshot: () => any[]
  /** 记一条撤销历史 */
  pushHistory: (snapshot: any[]) => void
  /** 标记有未保存改动 */
  markDirty: () => void
}

export function useSceneVoiceDirector(ctx: SceneVoiceDirectorContext) {
  const voiceDirectorVisible = ref(false)
  /** all=本场景全部台词，selected=仅选中 */
  const emotionTagScope = ref('all')
  const emotionTagOnlyUnlabeled = ref(true)
  const emotionTagRunning = ref(false)
  /** { index, text, emotion, reason, confidence, checked } */
  const emotionTagRows = ref<any[]>([])

  const sceneVoicableCount = computed(() =>
    ctx.dialogues.value.filter((d: any) => d && d.content_type !== '选择').length
  )

  const sceneEmotionStats = computed(() => {
    const stats: Record<string, number> = {}
    ;[...EMOTION_OPTIONS, '未标注'].forEach(e => { stats[e] = 0 })
    let total = 0
    for (const d of ctx.dialogues.value) {
      if (!d || d.content_type === '选择') continue
      const emotion = EMOTION_OPTIONS.includes(d.emotion) ? d.emotion : '未标注'
      stats[emotion] += 1
      total += 1
    }
    return { stats, total }
  })

  const emotionStatRows = computed(() =>
    [...EMOTION_OPTIONS, '未标注'].map(emotion => ({
      emotion,
      count: sceneEmotionStats.value.stats[emotion],
      percent: sceneEmotionStats.value.total
        ? Math.round(sceneEmotionStats.value.stats[emotion] * 100 / sceneEmotionStats.value.total)
        : 0
    }))
  )

  const emotionTagCheckedCount = computed(() => emotionTagRows.value.filter(r => r.checked).length)

  const openVoiceDirector = () => {
    emotionTagRows.value = []
    emotionTagScope.value = ctx.selectedIndexes.value.length ? 'selected' : 'all'
    emotionTagOnlyUnlabeled.value = true
    voiceDirectorVisible.value = true
  }

  // 本次要送去做规则识别的台词（按范围与「仅补全未标注」筛选）
  const emotionTagTargets = computed(() => {
    const selected = new Set(ctx.selectedIndexes.value)
    return ctx.dialogues.value
      .map((dialogue: any, index: number) => ({ dialogue, index }))
      .filter(({ dialogue, index }) =>
        dialogue &&
        dialogue.content_type !== '选择' &&
        String(dialogue.content_text || '').trim() &&
        (emotionTagScope.value === 'all' || selected.has(index)) &&
        (!emotionTagOnlyUnlabeled.value || !EMOTION_OPTIONS.includes(dialogue.emotion))
      )
  })

  const runEmotionAutoTag = async () => {
    if (emotionTagRunning.value) return
    const pid = Number(ctx.projectId.value || ctx.scene.value.project_id)
    const targets = emotionTagTargets.value
    if (!pid) {
      ElMessage.warning('项目信息加载中，请稍后再试')
      return
    }
    if (!targets.length) {
      ElMessage.info(emotionTagOnlyUnlabeled.value ? '当前范围内没有未标注情绪的台词' : '当前范围内没有可标注的台词')
      return
    }
    emotionTagRunning.value = true
    try {
      const suggestions: any[] = await autoTagEmotions(
        pid,
        targets.map(({ dialogue, index }) => ({
          index,
          content_id: dialogue.content_id || null,
          text: String(dialogue.content_text || '')
        }))
      )
      const byIndex = new Map(suggestions.map((s: any) => [s.index, s]))
      emotionTagRows.value = targets.map(({ dialogue, index }) => {
        const s: any = byIndex.get(index) || {}
        return {
          index,
          text: String(dialogue.content_text || '').trim(),
          emotion: EMOTION_OPTIONS.includes(s.emotion) ? s.emotion : '平静',
          reason: s.reason || '规则推断',
          confidence: s.confidence || 'low',
          checked: true
        }
      })
    } catch (e: any) {
      console.error('情绪识别失败:', e)
      ElMessage.error('情绪识别失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
    } finally {
      emotionTagRunning.value = false
    }
  }

  // 把确认后的建议写回台词（只改本地，统一走「保存全部」落库）
  const applyEmotionTags = () => {
    const rows = emotionTagRows.value.filter(r => r.checked && r.emotion)
    if (!rows.length) {
      ElMessage.info('请先勾选要应用的标注')
      return
    }
    let changed = 0
    const before = ctx.snapshot()
    for (const row of rows) {
      const dialogue = ctx.dialogues.value[row.index]
      if (!dialogue) continue
      if (dialogue.emotion !== row.emotion) {
        dialogue.emotion = row.emotion
        changed += 1
      }
    }
    if (!changed) {
      ElMessage.info('所选情绪与现有标注一致，无需修改')
      return
    }
    ctx.pushHistory(before)
    ctx.markDirty()
    ElMessage.success(`已应用 ${changed} 条情绪标注，记得保存`)
  }

  return {
    voiceDirectorVisible,
    emotionTagScope,
    emotionTagOnlyUnlabeled,
    emotionTagRunning,
    emotionTagRows,
    sceneVoicableCount,
    sceneEmotionStats,
    emotionStatRows,
    emotionTagCheckedCount,
    openVoiceDirector,
    emotionTagTargets,
    runEmotionAutoTag,
    applyEmotionTags,
  }
}
