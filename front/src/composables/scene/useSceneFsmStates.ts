/**
 * 台词审校状态（FSM）：草稿 → AI生成 → 已审核 → 已发布。
 *
 * 状态只存在浏览器本地（localStorage，按场景隔离），不回写后端：
 * 它是个编辑辅助标记，不是剧本内容的一部分。
 *
 * 未保存的台词没有 content_id，用 new_<order_num> 作临时键，
 * 保证「还没保存也能标状态」。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

export interface FsmStateOption {
  value: string
  label: string
  desc: string
  color: string
}

export const FSM_STATES: FsmStateOption[] = [
  { value: 'draft', label: '草稿', desc: '手动创建，待编辑', color: '#b8b8b8' },
  { value: 'ai_generated', label: 'AI生成', desc: 'AI产出，待审核', color: '#ffa726' },
  { value: 'reviewed', label: '已审核', desc: '审核通过，可发布', color: '#66bb6a' },
  { value: 'published', label: '已发布', desc: '锁定，不可编辑', color: '#42a5f5' },
]

export const FSM_STATE_LABELS: Record<string, string> = {
  draft: '草稿',
  ai_generated: 'AI生成',
  reviewed: '已审核',
  published: '已发布',
}

/** 台词 → 本地状态键：已保存用 content_id，未保存用 new_<order_num>。纯函数。 */
export const fsmKeyOf = (dialogue: any) => dialogue?.content_id || `new_${dialogue?.order_num}`

/** 取某条台词的状态，缺省为 draft。纯函数。 */
export const pickFsmState = (map: Record<string, string> | null | undefined, dialogue: any) => {
  const key = fsmKeyOf(dialogue)
  return (key && map?.[key]) || 'draft'
}

/** localStorage 里的 JSON → 状态表；脏数据一律当空表。纯函数。 */
export const parseFsmStates = (raw: string | null | undefined): Record<string, string> => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export interface SceneFsmStatesContext {
  sceneId: () => string | number
}

export function useSceneFsmStates(ctx: SceneFsmStatesContext) {
  const { sceneId } = ctx

  const dialogueFsmStates = ref<Record<string, string>>({})

  const fsmStorageKey = () => `aigc:fsm:${sceneId()}`

  const loadFsmStates = () => {
    dialogueFsmStates.value = parseFsmStates(localStorage.getItem(fsmStorageKey()))
  }

  const persistFsmStates = () => {
    try {
      localStorage.setItem(fsmStorageKey(), JSON.stringify(dialogueFsmStates.value))
    } catch (e) {
      console.warn('保存审校状态失败:', e)
    }
  }

  const getFsmState = (dialogue: any) => pickFsmState(dialogueFsmStates.value, dialogue)

  const setFsmState = (dialogue: any, state: string) => {
    const key = fsmKeyOf(dialogue)
    dialogueFsmStates.value[key] = state
    persistFsmStates()
    ElMessage.success(`状态已切换为：${FSM_STATE_LABELS[state]}`)
  }

  return {
    fsmStates: FSM_STATES,
    fsmStateLabels: FSM_STATE_LABELS,
    dialogueFsmStates,
    loadFsmStates,
    persistFsmStates,
    getFsmState,
    setFsmState,
  }
}
