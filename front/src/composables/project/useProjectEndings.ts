import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getStoryGraph } from '@/api/branch'
import type { StoryNode } from '@/api/branch'
import { createEnding, deleteEnding, listEndings, updateEnding } from '@/api/ending'
import type { Ending, EndingCondition, EndingPayload } from '@/api/ending'

export interface StoryNodeOption {
  content_id: number
  label: string
}

/** 节点下拉/表格里的可读文案：场景名 · #序号 正文前 16 字 */
export function describeStoryNode(
  node: Pick<StoryNode, 'scene_title' | 'order_num' | 'content_text'> | null | undefined,
  contentId: number,
): string {
  if (!node) return `#${contentId}`
  const text = String(node.content_text || '').replace(/\s+/g, ' ').slice(0, 16)
  return `${node.scene_title || ''} · #${node.order_num} ${text}`
}

/** 结局条件摘要；没有任何条件时明确写成「无条件」 */
export function describeEndingConditions(conditions: EndingCondition[] | null | undefined): string {
  if (!conditions || !conditions.length) return '无条件'
  return conditions.map((item) => `${item.variable} ${item.op} ${item.value}`).join(' 且 ')
}

export interface ProjectEndingsContext {
  projectId: () => number
}

export function useProjectEndings(ctx: ProjectEndingsContext) {
  const endings = ref<Ending[]>([])
  const storyNodes = ref<StoryNode[]>([])
  const endingDialogVisible = ref(false)
  const editingEndingId = ref<number | null>(null)
  const endingSaving = ref(false)
  /** 交给结局弹窗的初始行；null 表示新建 */
  const endingInitial = ref<Ending | null>(null)

  const fetchEndings = async () => {
    try {
      endings.value = await listEndings(ctx.projectId())
    } catch (e) {
      console.warn('读取结局失败:', e)
      endings.value = []
    }
  }

  /** 结局弹窗需要剧情节点做「触发节点」下拉，打开弹窗前才拉图 */
  const loadStoryNodes = async () => {
    try {
      const graph = await getStoryGraph(ctx.projectId(), false)
      storyNodes.value = graph?.nodes || []
    } catch (e) {
      storyNodes.value = []
    }
  }

  const nodeLabel = (contentId: number) =>
    describeStoryNode(storyNodes.value.find((node) => node.content_id === contentId), contentId)

  const formatEndingConditions = (conditions: EndingCondition[]) => describeEndingConditions(conditions)

  const nodeOptions = computed<StoryNodeOption[]>(() =>
    storyNodes.value.map((node) => ({
      content_id: node.content_id,
      label: describeStoryNode(node, node.content_id),
    })),
  )

  const openCreateEnding = async () => {
    editingEndingId.value = null
    endingInitial.value = null
    await loadStoryNodes()
    endingDialogVisible.value = true
  }

  const openEditEnding = async (row: Ending) => {
    editingEndingId.value = row.ending_id
    endingInitial.value = row
    await loadStoryNodes()
    endingDialogVisible.value = true
  }

  /** 结局弹窗已完成校验，这里只负责落库与刷新 */
  const handleSaveEnding = async ({ endingId, payload }: { endingId: number | null; payload: EndingPayload }) => {
    endingSaving.value = true
    try {
      if (endingId) {
        await updateEnding(ctx.projectId(), endingId, payload)
        ElMessage.success('结局已更新')
      } else {
        await createEnding(ctx.projectId(), payload)
        ElMessage.success('结局已创建')
      }
      endingDialogVisible.value = false
      await fetchEndings()
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || e?.message || '保存结局失败')
    } finally {
      endingSaving.value = false
    }
  }

  const removeEnding = async (row: Ending) => {
    try {
      await ElMessageBox.confirm(`删除结局「${row.title}」？`, '删除结局', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      })
      await deleteEnding(ctx.projectId(), row.ending_id)
      ElMessage.success('结局已删除')
      await fetchEndings()
    } catch (e) {
      /* 取消 */
    }
  }

  return {
    endings,
    storyNodes,
    endingDialogVisible,
    editingEndingId,
    endingSaving,
    endingInitial,
    nodeOptions,
    fetchEndings,
    loadStoryNodes,
    nodeLabel,
    formatEndingConditions,
    openCreateEnding,
    openEditEnding,
    handleSaveEnding,
    removeEnding,
  }
}
