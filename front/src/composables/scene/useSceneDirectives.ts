/**
 * 演出指令（节点级）：打开 DirectiveDialog 编辑某条台词上的演出指令。
 *
 * 弹窗自己读写指令（列表、增删改都在 DirectiveDialog 内部），父级只负责三件事：
 * 1. 记住当前正在编辑哪条台词（content_id），并让右侧预览跟随它；
 * 2. 指令变更后入舞台撤销栈；
 * 3. 若变更的正是预览中的那条，刷新预览。
 *
 * dialogRef 是模板 ref，只能由组件创建后传进来。
 */
import type { Ref } from 'vue'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

export interface SceneDirectivesContext {
  dialogues: Ref<any[]>
  currentDialogueIndex: Ref<number>
  directiveDialogRef: Ref<any>
  recordStageUndo: (contentId: any, before: any, after: any) => void
  syncPreviewIfCurrent: (contentId: any) => void
}

/** 弹窗标题里的目标描述：类型：前 18 个字。纯函数，便于单测。 */
export const buildDirectiveTarget = (dialogue: any) => {
  const kind = dialogue?.content_type === '描述' ? '旁白' : (dialogue?.content_type || '对话')
  const text = (dialogue?.content_text || '').slice(0, 18) || '（空）'
  return `${kind}：${text}`
}

export function useSceneDirectives(ctx: SceneDirectivesContext) {
  const { dialogues, currentDialogueIndex, directiveDialogRef, recordStageUndo, syncPreviewIfCurrent } = ctx

  const directiveDialogVisible = ref(false)
  const directiveContentId = ref<any>(null)
  const directiveTarget = ref('')

  const refreshDirectiveList = async () => {
    await directiveDialogRef.value?.reload?.()
  }

  const handleDirectivesChanged = ({ contentId, before, after }: { contentId: any; before: any; after: any }) => {
    recordStageUndo(contentId, before, after)
    syncPreviewIfCurrent(contentId)
  }

  const openDirectiveDialog = (index: number) => {
    const d = dialogues.value[index]
    if (!d || !d.content_id) {
      ElMessage.warning('先保存这条对话，再配置演出')
      return
    }
    // 让右侧预览跟随当前正在编辑的这条对话，避免显示上一条的角色
    currentDialogueIndex.value = index
    directiveContentId.value = d.content_id
    directiveTarget.value = buildDirectiveTarget(d)
    directiveDialogVisible.value = true
  }

  return {
    directiveDialogVisible,
    directiveContentId,
    directiveTarget,
    refreshDirectiveList,
    handleDirectivesChanged,
    openDirectiveDialog,
  }
}
