/**
 * 台词列表的增删改排序：本地变更 + 服务端落库。
 *
 * 组件只负责「哪个按钮传哪个 index」；这里统一处理撤销快照（pushHistory）、
 * 脏标记、草稿清理的先后顺序，删除已落库台词时清空撤销栈（服务端级联删除
 * 无法回滚），以及保存后用服务端返回值回填并保留本地的分支 / 数值变化。
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Ref } from 'vue'

/** 新台词的本地草稿（content_id 由后端保存后返回）。纯函数。 */
export const createDialogueDraft = (scene: any, orderNum: number) => ({
  project_id: scene?.project_id,
  scene_id: scene?.scene_id,
  content_type: '对话',
  content_text: '',
  order_num: orderNum,
  character_id: '',
  avatar_id: '',
})

/** 按数组顺序重排 order_num（1..n）。纯函数，原地写入并返回同一数组。 */
export const renumberDialogues = (list: any[]) => {
  list.forEach((d, i) => {
    d.order_num = i + 1
  })
  return list
}

/** 与相邻台词交换位置；index 越界返回 false 且不改动列表。纯函数。 */
export const moveDialogue = (list: any[], index: number, direction: 'up' | 'down') => {
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return false
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= list.length) return false
  const temp = list[index]
  list[index] = list[target]
  list[target] = temp
  renumberDialogues(list)
  return true
}

/** 保存后回填：服务端字段优先，本地已加载的分支 / 数值变化保留。纯函数。 */
export const mergeSavedDialogue = (previous: any, saved: any) => ({
  ...saved,
  _choices: previous?._choices,
  _effects: previous?._effects,
})

/** 取已落库台词的 id 列表（跳过新增未保存的），作为重排接口入参。纯函数。 */
export const savedDialogueIds = (list: any[]) =>
  list.filter(d => d.content_id).map(d => d.content_id)

/** 去掉指定台词的数值变化记录，返回新对象（不修改入参）。纯函数。 */
export const omitDialogueEffects = (effects: Record<string, any>, contentId: any) => {
  const rest = { ...effects }
  delete rest[contentId]
  return rest
}

export interface SceneDialogueListContext {
  dialogues: Ref<any[]>
  scene: Ref<any>
  projectId: Ref<any>
  getSceneId: () => string | number
  loading: Ref<boolean>
  dirty: Ref<boolean>
  undoStack: Ref<any[]>
  redoStack: Ref<any[]>
  projectNodes: Ref<any[]>
  effectsMap: Ref<Record<string, any>>
  pushHistory: () => void
  markDirty: () => void
  clearDraft: () => void
  clearSelection: () => void
  saveDialogues: (dialogue: any) => Promise<any>
  deleteDialogueApi: (contentId: any) => Promise<any>
  reorderDialoguesApi: (sceneId: number, contentIds: any[]) => Promise<any>
  createProjectVersion: (projectId: number, label: string) => Promise<any>
}

export function useSceneDialogueList(ctx: SceneDialogueListContext) {
  const { dialogues, scene, projectId, loading, dirty, undoStack, redoStack, projectNodes, effectsMap } = ctx

  // 换角色后旧的立绘不再适用，清空 avatar_id 让用户重新选择
  const handleCharacterChange = (index: number) => {
    ctx.pushHistory()
    ctx.markDirty()
    if (dialogues.value[index]) dialogues.value[index].avatar_id = ''
  }

  const addNewDialogue = () => {
    ctx.pushHistory()
    ctx.markDirty()
    ctx.clearSelection()
    dialogues.value.push(createDialogueDraft(scene.value, dialogues.value.length + 1))
  }

  const saveDialogue = async (index: number) => {
    try {
      loading.value = true
      const dialogue = dialogues.value[index]
      if (!dialogue) return
      dialogue.order_num = index + 1
      const saved = await ctx.saveDialogues(dialogue)
      dialogues.value[index] = mergeSavedDialogue(dialogue, saved)
      // 新保存的节点要能立刻作为其它节点的跳转目标
      if (saved?.content_id && !projectNodes.value.some(n => n.content_id === saved.content_id)) {
        projectNodes.value.push({ ...saved, scene_title: scene.value?.title })
      }
      ElMessage.success('对话保存成功')
    } catch (err: any) {
      console.error('保存对话失败:', err)
      ElMessage.error('保存对话失败: ' + (err?.message || '未知错误'))
    } finally {
      loading.value = false
    }
  }

  const saveAllDialogues = async () => {
    if (!dialogues.value.length) return
    loading.value = true
    try {
      for (let i = 0; i < dialogues.value.length; i++) {
        const dialogue = dialogues.value[i]
        dialogue.order_num = i + 1
        const saved = await ctx.saveDialogues(dialogue)
        dialogues.value[i] = mergeSavedDialogue(dialogue, saved)
        if (saved?.content_id && !projectNodes.value.some(n => n.content_id === saved.content_id)) {
          projectNodes.value.push({ ...saved, scene_title: scene.value?.title })
        }
      }
      const ids = savedDialogueIds(dialogues.value)
      if (ids.length) await ctx.reorderDialoguesApi(Number(ctx.getSceneId()), ids)
      ctx.clearDraft()
      ElMessage.success('已保存全部对话')
      ctx.createProjectVersion(Number(projectId.value), '保存全部对话').catch(() => {})
    } catch (err: any) {
      console.error('保存全部对话失败:', err)
      ElMessage.error('保存失败: ' + (err?.message || '未知错误'))
    } finally {
      loading.value = false
    }
  }

  const deleteDialogue = async (index: number) => {
    const dialogue = dialogues.value[index]
    if (!dialogue) return

    // 已落库的台词：服务端删除会级联清理分支/数值/演出/结局/已读，
    // 前端撤销无法把它们一起恢复，所以必须先确认，并清空本地撤销栈。
    if (dialogue.content_id) {
      try {
        await ElMessageBox.confirm(
          '删除这条台词会同时删除它的分支、数值变化、演出指令、结局与已读记录，且无法撤销。确定删除？',
          '删除台词',
          {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            confirmButtonClass: 'el-button--danger'
          }
        )
      } catch (e) {
        return
      }
      const hadUnsaved = dirty.value
      try {
        await ctx.deleteDialogueApi(dialogue.content_id)
        projectNodes.value = projectNodes.value.filter(n => n.content_id !== dialogue.content_id)
        effectsMap.value = omitDialogueEffects(effectsMap.value, dialogue.content_id)
        dialogues.value.splice(index, 1)
        renumberDialogues(dialogues.value)
        ctx.clearSelection()
        // 旧快照里还带着已删除的节点，继续撤销会造出服务端不存在的“幽灵节点”
        undoStack.value = []
        redoStack.value = []
        if (hadUnsaved) ctx.markDirty()
        else ctx.clearDraft()
        ElMessage.success('台词已删除（不可撤销，可用项目版本回滚恢复）')
      } catch (err: any) {
        console.error('删除对话失败:', err)
        ElMessage.error('删除对话失败: ' + (err?.message || '未知错误'))
      }
      return
    }

    // 尚未保存的新台词：只改本地，保留撤销能力
    ctx.pushHistory()
    ctx.markDirty()
    dialogues.value.splice(index, 1)
    renumberDialogues(dialogues.value)
    ctx.clearSelection()
  }

  const moveDialogueUp = (index: number) => {
    if (index <= 0) return
    ctx.pushHistory()
    ctx.markDirty()
    moveDialogue(dialogues.value, index, 'up')
    ctx.clearSelection()
  }

  const moveDialogueDown = (index: number) => {
    if (index >= dialogues.value.length - 1) return
    ctx.pushHistory()
    ctx.markDirty()
    moveDialogue(dialogues.value, index, 'down')
    ctx.clearSelection()
  }

  const reorderDialogues = async () => {
    try {
      loading.value = true
      const orderedContentIds = dialogues.value.map(d => d.content_id)
      const response = await ctx.reorderDialoguesApi(Number(ctx.getSceneId()), orderedContentIds)
      if (response.success) {
        dialogues.value = response.data
        ElMessage.success('对话已重新排序并保存')
      } else {
        ElMessage.error('重新排序失败: ' + (response.message || '未知错误'))
      }
    } catch (err: any) {
      console.error('重新排序失败:', err)
      ElMessage.error('重新排序失败: ' + (err?.message || '网络错误'))
    } finally {
      loading.value = false
    }
  }

  return {
    handleCharacterChange,
    addNewDialogue,
    saveDialogue,
    saveAllDialogues,
    deleteDialogue,
    moveDialogueUp,
    moveDialogueDown,
    reorderDialogues,
  }
}
