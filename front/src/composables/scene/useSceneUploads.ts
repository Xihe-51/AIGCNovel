/**
 * 素材上传：背景图 / 背景音乐 / 语音统一走 uploadSceneFile（用 file_type 分流）。
 *
 * 上传成功后直接写回 scene / dialogues 的对应字段，并把原始响应透传给
 * el-upload 的 onSuccess / onError，组件里只保留「哪个槽位传给谁」的接线。
 */
import { ElMessage } from 'element-plus'
import type { Ref } from 'vue'
import { uploadSceneFile } from '@/api/scenes'

/** 组装上传表单：文件 + 项目 + 文件类型。纯函数。 */
export const buildSceneUploadForm = (
  file: any,
  projectId: string | number | null | undefined,
  fileType: string
) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('project_id', String(projectId ?? ''))
  formData.append('file_type', fileType)
  return formData
}

export interface SceneUploadsContext {
  projectId: Ref<string | number>
  scene: Ref<any>
  dialogues: Ref<any[]>
}

export function useSceneUploads(ctx: SceneUploadsContext) {
  const { projectId, scene, dialogues } = ctx

  const runUpload = async (
    params: any,
    fileType: string,
    label: string,
    apply: (url: any) => void
  ) => {
    try {
      const formData = buildSceneUploadForm(params?.file, projectId.value, fileType)
      const response = await uploadSceneFile(formData)
      if (!response?.success) throw new Error(response?.message || `${label}上传失败`)
      apply(response.data?.url)
      ElMessage.success(`${label}上传成功`)
      params?.onSuccess?.(response)
    } catch (err: any) {
      console.error(`${label}上传失败:`, err)
      ElMessage.error(`${label}上传失败: ` + (err?.message || '未知错误'))
      params?.onError?.(err)
    }
  }

  const handleBackgroundUpload = (params: any) =>
    runUpload(params, 'image', '背景图', (url) => {
      scene.value.background_url = url
    })

  const handleMusicUpload = (params: any) =>
    runUpload(params, 'audio', '背景音乐', (url) => {
      scene.value.music_url = url
    })

  const handleVoiceUpload = (params: any, index: number) =>
    runUpload(params, 'voice', '语音', (url) => {
      if (dialogues.value[index]) dialogues.value[index].voice_url = url
    })

  return { handleBackgroundUpload, handleMusicUpload, handleVoiceUpload }
}
