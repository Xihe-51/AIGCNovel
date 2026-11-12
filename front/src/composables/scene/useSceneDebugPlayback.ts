/**
 * 单条台词的调试播放：新标签页打开播放器，并带 ?debug=1&start=<content_id>。
 *
 * 只有已保存（有 content_id）的台词才能定位；项目信息还没就绪时给出提示而不是瞎跳。
 */
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'

export interface SceneDebugPlaybackContext {
  projectId: Ref<string | number>
  scene: Ref<any>
}

/** 播放器调试地址。抽成纯函数，便于单测。 */
export const buildDebugPlayUrl = (
  projectId: string | number,
  contentId: string | number
) => `/view/${projectId}?debug=1&start=${contentId}`

export function useSceneDebugPlayback(ctx: SceneDebugPlaybackContext) {
  const { projectId, scene } = ctx

  const playFromDialogue = (dialogue: any) => {
    if (!dialogue || !dialogue.content_id) {
      ElMessage.warning('请先保存这条台词，再从这里试玩')
      return
    }
    const pid = projectId.value || scene.value?.project_id
    if (!pid) {
      ElMessage.warning('项目信息加载中，请稍后再试')
      return
    }
    window.open(buildDebugPlayUrl(pid, dialogue.content_id), '_blank')
  }

  return { playFromDialogue }
}
