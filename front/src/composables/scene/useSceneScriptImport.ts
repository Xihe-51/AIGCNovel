/**
 * 剧本批量导入：把解析好的剧本行追加（或替换）成场景台词。
 *
 * 只负责"把 entries 变成 dialogue 行"，历史栈与脏标记通过回调注入。
 */
import { ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { confirmAction } from '@/utils/confirm'

export interface ScriptEntry {
  name?: string
  text: string
}

export interface SceneScriptImportContext {
  dialogues: Ref<any[]>
  scene: Ref<any>
  /** 项目角色，用于把台词行匹配到角色（角色列表在页面里较晚加载，用 getter 注入） */
  getCharacters: () => any[]
  pushHistory: () => void
  markDirty: () => void
  clearSelection: () => void
}

export function useSceneScriptImport(ctx: SceneScriptImportContext) {
  const scriptImportVisible = ref(false)

  const openScriptImport = () => {
    scriptImportVisible.value = true
  }

  const handleScriptImport = async ({ mode, entries }: { mode: 'append' | 'replace'; entries: ScriptEntry[] }) => {
    if (!entries.length) {
      ElMessage.warning('没有可导入的内容')
      return
    }
    if (mode === 'replace' && ctx.dialogues.value.length) {
      const confirmed = await confirmAction(
        '会清空当前场景的全部对话（仅本地，保存后生效），确定替换？',
        { title: '替换全部对话', confirmButtonText: '替换' },
      )
      if (!confirmed) return
    }
    ctx.pushHistory()
    if (mode === 'replace') ctx.dialogues.value = []
    const base = ctx.dialogues.value.length
    const unknown = new Set<string>()
    entries.forEach((item, i) => {
      const char = item.name ? ctx.getCharacters().find((c: any) => c.name === item.name) : null
      if (item.name && !char) unknown.add(item.name)
      ctx.dialogues.value.push({
        project_id: ctx.scene.value.project_id,
        scene_id: ctx.scene.value.scene_id,
        content_type: char ? '对话' : '描述',
        content_text: char ? item.text : (item.name ? `【${item.name}】${item.text}` : item.text),
        character_id: char ? char.character_id : '',
        avatar_id: '',
        order_num: base + i + 1
      })
    })
    ctx.markDirty()
    ctx.clearSelection()
    scriptImportVisible.value = false
    ElMessage.success(`已导入 ${entries.length} 条，点「保存全部」落库`)
    if (unknown.size) {
      ElMessage.warning(`未找到角色：${[...unknown].join('、')}，这些行已按旁白保留`)
    }
  }

  return {
    scriptImportVisible,
    openScriptImport,
    handleScriptImport,
  }
}
