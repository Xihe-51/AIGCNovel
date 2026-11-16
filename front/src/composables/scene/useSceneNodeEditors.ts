/**
 * 节点级编辑：台词显示条件弹窗 + 节点数值变化（effects）。
 *
 * 两类编辑都是「改本地对象 → markDirty → 保存全部时落库」的同一节奏，
 * 因此放在一个 composable 里，页面只保留模板绑定。
 */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { saveContentEffects } from '@/api/variable'
import {
  buildNodeConditionPayload,
  ensureDialogueEffects,
  hasNodeCondition as hasNodeConditionOf,
} from '@/utils/scene'
import type { NodeConditionItem } from '@/utils/scene'

export interface SceneNodeEditorsContext {
  projectId: Ref<string | number>
  dialogues: Ref<any[]>
  variables: Ref<any[]>
  effectsMap: Ref<Record<string, any[]>>
  markDirty: () => void
  pushHistory: () => void
}

export function useSceneNodeEditors(ctx: SceneNodeEditorsContext) {
  // ===== 台词显示条件 =====
  const nodeConditionVisible = ref(false)
  const nodeConditionIndex = ref(-1)
  const nodeConditionMode = ref('and')
  const nodeConditionItems = ref<any[]>([])
  const nodeConditionTarget = computed(() => {
    const d = ctx.dialogues.value[nodeConditionIndex.value]
    return d ? (d.content_text || '').slice(0, 30) : ''
  })

  const hasNodeCondition = (dialogue: any) => hasNodeConditionOf(dialogue)

  const openNodeConditionDialog = (index: number) => {
    nodeConditionIndex.value = index
    const cond = ctx.dialogues.value[index]?.branch_condition
    nodeConditionMode.value = cond?.mode === 'or' ? 'or' : 'and'
    const items = Array.isArray(cond?.items)
      ? cond.items
      : (cond?.variable ? [cond] : [])
    nodeConditionItems.value = items.map((c: any) => ({
      variable: c.variable || '',
      op: c.op || '>=',
      value: Math.trunc(Number(c.value) || 0),
    }))
    nodeConditionVisible.value = true
  }

  const applyNodeCondition = (draft?: { mode?: string; items?: NodeConditionItem[] } | null) => {
    const dialogue = ctx.dialogues.value[nodeConditionIndex.value]
    if (!dialogue) return
    const payload = draft
      ? buildNodeConditionPayload(draft.mode, draft.items)
      : buildNodeConditionPayload(nodeConditionMode.value, nodeConditionItems.value)
    dialogue.branch_condition = payload
    ctx.markDirty()
    nodeConditionVisible.value = false
    ElMessage.success(
      dialogue.branch_condition
        ? '已设置台词显示条件，保存全部后生效'
        : '已清除台词显示条件，保存全部后生效'
    )
  }

  const clearNodeCondition = () => {
    const dialogue = ctx.dialogues.value[nodeConditionIndex.value]
    if (!dialogue) return
    dialogue.branch_condition = null
    ctx.markDirty()
    nodeConditionVisible.value = false
    ElMessage.success('已清除台词显示条件，保存全部后生效')
  }

  // ===== 节点数值变化 =====
  const getDialogueEffects = (dialogue: any) => ensureDialogueEffects(dialogue, ctx.effectsMap.value)

  const addEffect = (dialogue: any) => {
    ctx.pushHistory()
    ctx.markDirty()
    const list = getDialogueEffects(dialogue)
    list.push({
      variable_id: ctx.variables.value[0]?.variable_id || null,
      delta: 1,
    })
  }

  const removeEffect = (dialogue: any, index: number) => {
    ctx.pushHistory()
    ctx.markDirty()
    getDialogueEffects(dialogue).splice(index, 1)
  }

  const saveDialogueEffects = async (dialogue: any) => {
    if (!dialogue.content_id) {
      ElMessage.warning('请先保存本条内容，再配置数值变化')
      return
    }
    const list = (getDialogueEffects(dialogue) || [])
      .filter((e: any) => e.variable_id && Number(e.delta) !== 0)
      .map((e: any) => ({ variable_id: Number(e.variable_id), delta: Math.trunc(Number(e.delta)) }))

    try {
      await saveContentEffects(Number(ctx.projectId.value), dialogue.content_id, list)
      ctx.effectsMap.value = {
        ...ctx.effectsMap.value,
        [dialogue.content_id]: list.map((e: any) => ({
          ...e,
          label: ctx.variables.value.find(v => v.variable_id === e.variable_id)?.label || '',
        })),
      }
      dialogue._effects = (ctx.effectsMap.value[dialogue.content_id] || []).map((e: any) => ({ ...e }))
      ElMessage.success(`已保存 ${list.length} 条数值变化`)
    } catch (e: any) {
      console.error('保存数值变化失败:', e)
      ElMessage.error('保存数值变化失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
    }
  }

  return {
    nodeConditionVisible,
    nodeConditionIndex,
    nodeConditionMode,
    nodeConditionItems,
    nodeConditionTarget,
    hasNodeCondition,
    openNodeConditionDialog,
    applyNodeCondition,
    clearNodeCondition,
    getDialogueEffects,
    addEffect,
    removeEffect,
    saveDialogueEffects,
  }
}
