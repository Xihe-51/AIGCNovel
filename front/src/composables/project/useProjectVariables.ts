/**
 * 作品变量库：变量列表读写、弹窗开关，以及活叙事「行为变量」的一键启用。
 *
 * 行为变量是作者显式启用的两条内置定义（选择犹豫秒数 / 回看次数），
 * 未被播放器记录前不该出现在项目里，所以这里只创建缺失项、不覆盖已有定义。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createVariable, deleteVariable, listVariables, updateVariable } from '@/api/variable'
import type { ProjectVariable, VariablePayload } from '@/api/variable'
import { extractErrorMessage, formatErrorMessage } from '@/utils/errorMessage'
import { confirmDanger } from '@/utils/confirm'

export interface BehaviorVariableDefinition {
  name: string
  label: string
  initial_value: number
  min_value: number
  max_value: number
  description: string
}

/** 活叙事内置行为变量：由播放器自动记录，不作为普通数值加减 */
export const BEHAVIOR_VARIABLES: BehaviorVariableDefinition[] = [
  {
    name: 'behavior_hesitation',
    label: '选择犹豫秒数',
    initial_value: 0,
    min_value: 0,
    max_value: 60,
    description: '玩家在当前选择节点上犹豫的秒数，每次做出选择后更新；可用于后续旁白/隐藏剧情条件',
  },
  {
    name: 'behavior_review',
    label: '回看次数',
    initial_value: 0,
    min_value: 0,
    max_value: 99,
    description: '本局玩家打开回想或执行「上一句」回退的次数；可用于隐藏剧情条件',
  },
]

export const BEHAVIOR_VARIABLE_PREFIX = 'behavior_'

/** 行为变量在列表里打标用，不参与数值加减 */
export function isBehaviorVariable(row: { name?: string } | null | undefined): boolean {
  return String(row?.name || '').startsWith(BEHAVIOR_VARIABLE_PREFIX)
}

/** 只挑出尚未建过的定义，避免重复写入 */
export function findMissingBehaviorVariables(
  definitions: BehaviorVariableDefinition[],
  existing: { name?: string }[],
): BehaviorVariableDefinition[] {
  return definitions.filter((def) => !existing.some((item) => item.name === def.name))
}

export interface ProjectVariablesContext {
  projectId: () => number
}

export function useProjectVariables(ctx: ProjectVariablesContext) {
  const variables = ref<ProjectVariable[]>([])
  const behaviorSaving = ref(false)
  const variableDialogVisible = ref(false)
  const editingVariableId = ref<number | null>(null)
  const variableSaving = ref(false)
  /** 交给变量弹窗的初始行；null 表示新建 */
  const variableInitial = ref<ProjectVariable | null>(null)

  const missingBehaviorVariables = computed(() =>
    findMissingBehaviorVariables(BEHAVIOR_VARIABLES, variables.value)
  )

  const fetchVariables = async () => {
    try {
      variables.value = await listVariables(ctx.projectId())
    } catch (e) {
      console.warn('读取变量失败:', e)
      variables.value = []
    }
  }

  const enableBehaviorVariables = async () => {
    if (behaviorSaving.value || !missingBehaviorVariables.value.length) return
    behaviorSaving.value = true
    try {
      for (const def of missingBehaviorVariables.value) {
        await createVariable(ctx.projectId(), {
          name: def.name,
          label: def.label,
          character_id: null,
          initial_value: def.initial_value,
          min_value: def.min_value,
          max_value: def.max_value,
          description: def.description,
          persist: false,
        })
      }
      await fetchVariables()
      ElMessage.success('行为变量已启用，可在剧情条件与后续旁白中使用')
    } catch (e: any) {
      ElMessage.error(extractErrorMessage(e, '启用行为变量失败'))
    } finally {
      behaviorSaving.value = false
    }
  }

  const openCreateVariable = () => {
    editingVariableId.value = null
    variableInitial.value = null
    variableDialogVisible.value = true
  }

  const openEditVariable = (row: ProjectVariable) => {
    editingVariableId.value = row.variable_id
    variableInitial.value = row
    variableDialogVisible.value = true
  }

  /** 变量弹窗已完成校验，这里只负责落库与刷新 */
  const handleSaveVariable = async (
    { variableId, payload }: { variableId: number | null; payload: VariablePayload },
  ) => {
    variableSaving.value = true
    try {
      if (variableId) {
        await updateVariable(ctx.projectId(), variableId, payload)
        ElMessage.success('变量已更新')
      } else {
        await createVariable(ctx.projectId(), payload)
        ElMessage.success('变量已创建')
      }
      variableDialogVisible.value = false
      await fetchVariables()
    } catch (e: any) {
      ElMessage.error(extractErrorMessage(e, '保存变量失败'))
    } finally {
      variableSaving.value = false
    }
  }

  const removeVariable = async (row: ProjectVariable) => {
    const confirmed = await confirmDanger(
      `删除变量「${row.label}」？引用它的节点数值变化也会被清除。`,
      { title: '删除变量' },
    )
    if (!confirmed) return
    try {
      await deleteVariable(ctx.projectId(), row.variable_id)
      ElMessage.success('变量已删除')
      await fetchVariables()
    } catch (e) {
      ElMessage.error(formatErrorMessage('删除变量失败', e))
    }
  }

  return {
    variables,
    behaviorSaving,
    isBehaviorVariable,
    missingBehaviorVariables,
    variableDialogVisible,
    editingVariableId,
    variableSaving,
    variableInitial,
    fetchVariables,
    enableBehaviorVariables,
    openCreateVariable,
    openEditVariable,
    handleSaveVariable,
    removeVariable,
  }
}
