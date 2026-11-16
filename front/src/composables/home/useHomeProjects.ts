import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { confirmAction } from '@/utils/confirm'
import { extractErrorMessage } from '@/utils/errorMessage'
import * as projectApi from '@/api/project'
import type { Project } from '@/api/project'

export function useHomeProjects() {
  const projects = ref<Project[]>([])
  const loading = ref(false)
  const isPublicMode = ref(false)
  const importInputRef = ref<HTMLInputElement | null>(null)

  const fetchProjects = async () => {
    try {
      loading.value = true
      projects.value = isPublicMode.value
        ? await projectApi.getPublicProjects()
        : await projectApi.getProjects()
    } catch (error) {
      console.log(error)
      ElMessage.error(isPublicMode.value ? '获取公开项目列表失败' : '获取项目列表失败')
    } finally {
      loading.value = false
    }
  }

  const handleModeChange = () => {
    fetchProjects()
  }

  const confirmDelete = async (projectId: number) => {
    const confirmed = await confirmAction('确定要删除这个项目吗?', {
      title: '提示',
      customClass: 'delete-confirm',
    })
    if (!confirmed) return
    try {
      await projectApi.deleteProject(projectId)
      projects.value = projects.value.filter(p => p.project_id !== projectId)
      ElMessage.success('项目已删除')
    } catch (error) {
      ElMessage.error(extractErrorMessage(error, '删除项目失败'))
    }
  }

  const handleImportClick = () => {
    importInputRef.value?.click()
  }

  const handleImportFile = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      const bundle = JSON.parse(await file.text())
      await projectApi.importProject(bundle)
      ElMessage.success('项目导入成功')
      fetchProjects()
    } catch (error) {
      ElMessage.error('导入失败：请确认文件是有效的项目 JSON 包')
    } finally {
      input.value = ''
    }
  }

  return {
    projects,
    loading,
    isPublicMode,
    importInputRef,
    fetchProjects,
    handleModeChange,
    confirmDelete,
    handleImportClick,
    handleImportFile
  }
}
