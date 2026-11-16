import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import * as projectApi from '@/api/project'
import type { Project } from '@/api/project'
import { listEndings } from '@/api/ending'
import type { Ending } from '@/api/ending'
import { DOCX_MIME, downloadFile } from '@/utils/download'
import { formatErrorMessage } from '@/utils/errorMessage'

export type MultiFormat = 'novel' | 'audio' | 'storyboard'

export function useProjectExport() {
  const exportDialogVisible = ref(false)
  const exportFormat = ref<MultiFormat>('novel')
  const exportTarget = ref<Project | null>(null)
  const exportEndingId = ref<number | undefined>(undefined)
  const projectEndings = ref<Ending[]>([])
  const exporting = ref(false)
  let exportSeq = 0

  const openFormatExport = async (project: Project, format: MultiFormat) => {
    const seq = ++exportSeq
    exportTarget.value = project
    exportFormat.value = format
    exportEndingId.value = undefined
    projectEndings.value = []
    exportDialogVisible.value = true
    try {
      const rows = await listEndings(project.project_id)
      if (seq === exportSeq) projectEndings.value = rows
    } catch (e) {
      if (seq === exportSeq) projectEndings.value = []
    }
  }

  const handleExport = async (project: Project, format: string) => {
    if (format === 'novel' || format === 'audio' || format === 'storyboard') {
      openFormatExport(project, format)
      return
    }
    try {
      if (format === 'txt') {
        const text = await projectApi.exportProjectText(project.project_id)
        downloadFile(text, `${project.title}.txt`, 'text/plain;charset=utf-8')
      } else if (format === 'docx') {
        const blob = await projectApi.exportProjectDocx(project.project_id)
        downloadFile(blob, `${project.title}.docx`, DOCX_MIME)
      } else if (format === 'static') {
        ElMessage.info('正在打包静态网页，包含素材时可能需要一点时间')
        const blob = await projectApi.exportProjectStaticPackage(project.project_id)
        downloadFile(blob, `${project.title}-网页版.zip`, 'application/zip')
      } else {
        const bundle = await projectApi.exportProjectBundle(project.project_id)
        downloadFile(JSON.stringify(bundle, null, 2), `${project.title}.json`, 'application/json')
      }
      ElMessage.success('导出成功')
    } catch (error: any) {
      ElMessage.error('导出失败：' + (error?.message || '请稍后重试'))
    }
  }

  const confirmFormatExport = async () => {
    const project = exportTarget.value
    if (!project || exporting.value) return
    exporting.value = true
    try {
      const suffix = { novel: '主线小说', storyboard: '分镜脚本', audio: '有声剧脚本' }[
        exportFormat.value
      ]
      let blob: Blob
      if (exportFormat.value === 'novel') {
        blob = await projectApi.exportProjectNovel(project.project_id, exportEndingId.value)
      } else if (exportFormat.value === 'storyboard') {
        blob = await projectApi.exportProjectStoryboard(project.project_id, exportEndingId.value)
      } else {
        blob = await projectApi.exportProjectAudioScript(project.project_id, exportEndingId.value)
      }
      downloadFile(blob, `${project.title}-${suffix}.docx`, DOCX_MIME)
      ElMessage.success('导出成功')
      exportDialogVisible.value = false
    } catch (error: any) {
      ElMessage.error(
        formatErrorMessage('导出失败', error)
      )
    } finally {
      exporting.value = false
    }
  }

  return {
    exportDialogVisible,
    exportFormat,
    exportTarget,
    exportEndingId,
    projectEndings,
    exporting,
    handleExport,
    confirmFormatExport
  }
}
