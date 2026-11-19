import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import * as projectApi from '@/api/project'
import type { Project, TemplateMeta } from '@/api/project'
import { FALLBACK_TEMPLATES } from '@/utils/homeTemplates'

export interface ProjectForm {
  title: string
  genre: string
  template_type: string
  isPublic?: boolean
}

export interface ProjectFormContext {
  onSubmitted: () => void
}

const emptyForm = (): ProjectForm => ({
  title: '',
  genre: '',
  template_type: '线性叙事',
  isPublic: false
})

export function useProjectForm(ctx: ProjectFormContext) {
  const dialogVisible = ref(false)
  const isEditMode = ref(false)
  const currentProjectId = ref<number | null>(null)
  const coverFile = ref<File | null>(null)
  const templates = ref<TemplateMeta[]>([])
  const projectForm = ref<ProjectForm>(emptyForm())

  const dialogTitle = computed(() => (isEditMode.value ? '编辑项目' : '新建项目'))

  const loadTemplates = async () => {
    try {
      const list = await projectApi.getTemplates()
      if (Array.isArray(list) && list.length > 0) {
        templates.value = list
        return
      }
    } catch (error) {
      console.warn('获取模板列表失败，使用内置模板兜底', error)
    }
    templates.value = FALLBACK_TEMPLATES
  }

  const showCreateDialog = () => {
    isEditMode.value = false
    projectForm.value = emptyForm()
    dialogVisible.value = true
  }

  const showEditDialog = (project: Project) => {
    isEditMode.value = true
    currentProjectId.value = project.project_id
    projectForm.value = {
      title: project.title,
      genre: project.genre,
      template_type: project.template_type,
      isPublic: project.is_public
    }
    dialogVisible.value = true
  }

  const handleCoverChange = (file: { raw: File }) => {
    coverFile.value = file.raw
  }

  const submitProject = async () => {
    if (!projectForm.value.title || !projectForm.value.genre) {
      ElMessage.warning('请填写完整信息')
      return
    }
    try {
      if (isEditMode.value && currentProjectId.value) {
        const updatedProject = await projectApi.updateProject(currentProjectId.value, {
          title: projectForm.value.title,
          genre: projectForm.value.genre,
          template_type: projectForm.value.template_type,
          is_public: projectForm.value.isPublic
        })
        if (coverFile.value) {
          const { cover_url } = await projectApi.uploadProjectCover(
            currentProjectId.value,
            coverFile.value
          )
          updatedProject.cover_url = cover_url
        }
        ElMessage.success('项目更新成功')
      } else {
        await projectApi.createProject({
          title: projectForm.value.title,
          genre: projectForm.value.genre,
          template_type: projectForm.value.template_type,
          is_public: projectForm.value.isPublic
        })
        const tpl = templates.value.find(
          t => t.template_type === projectForm.value.template_type
        )
        const sceneCount = tpl?.starter_scenes?.length || 0
        ElMessage.success(
          sceneCount
            ? `项目创建成功，已按模板预置 ${sceneCount} 个场景`
            : '项目创建成功'
        )
      }
      ctx.onSubmitted()
      dialogVisible.value = false
      coverFile.value = null
    } catch (error) {
      ElMessage.error(isEditMode.value ? '更新项目失败' : '创建项目失败')
    }
  }

  return {
    dialogVisible,
    isEditMode,
    currentProjectId,
    coverFile,
    templates,
    projectForm,
    dialogTitle,
    loadTemplates,
    showCreateDialog,
    showEditDialog,
    handleCoverChange,
    submitProject
  }
}
