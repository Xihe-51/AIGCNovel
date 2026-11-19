import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { confirmAction } from '@/utils/confirm'
import type { FormInstance, FormRules, UploadProps } from 'element-plus'
import type { ECharts } from 'echarts'
import {
  createAIModel,
  deleteAIModel,
  getUserInfo,
  getUserModels,
  getUserProjects,
  getUserStatistics,
  updateAIModel,
  updateUserInfo,
  uploadAvatar
} from '@/api/individual'
import type { AIModel, Project, UserInfo, UserStatistics } from '@/api/individual'
import { BASE_URL } from '@/utils/request'
import { formatErrorMessage } from '@/utils/errorMessage'
import { formatProfileDate, MODEL_TYPE_OPTIONS } from '@/utils/individual'

export type AIModelDraft = AIModel & { model_path?: string }

export interface ModelFormDraft {
  name: string
  style_description: string
  type: string
  model_path: string
}

export const DEFAULT_AVATAR = 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'

export const MODEL_FORM_RULES: FormRules = {
  name: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
  style_description: [{ required: true, message: '请输入风格描述', trigger: 'blur' }],
  model_path: [{ required: true, message: '请输入模型路径', trigger: 'blur' }]
}

const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif']
const AVATAR_MAX_MB = 2

const createEmptyModelForm = (): ModelFormDraft => ({
  name: '',
  style_description: '',
  type: '',
  model_path: ''
})

const createEmptyModelDraft = (): AIModelDraft => ({
  model_id: 0,
  name: '',
  style_description: '',
  type: '',
  model_path: ''
})

export function useIndividualView() {
  const defaultAvatar = DEFAULT_AVATAR
  const defaultCover = ''

  const userInfo = ref<UserInfo>({
    user_id: 0,
    username: '',
    email: '',
    phone: '',
    avatar_url: '',
    created_at: ''
  })
  const statistics = ref<UserStatistics>({ project_count: 0, model_count: 0, total_word_count: 0 })
  const recentProjects = ref<Project[]>([])
  const recentModels = ref<AIModel[]>([])
  const editForm = ref<{ username: string; email: string; phone: string; password?: string }>({
    username: '',
    email: '',
    phone: '',
    password: ''
  })
  const chartRef = ref<HTMLElement | null>(null)

  const showCreateDialog = ref(false)
  const showEditDialog = ref(false)
  const creating = ref(false)
  const editing = ref(false)
  const createFormRef = ref<FormInstance>()
  const editFormRef = ref<FormInstance>()

  const createForm = ref<ModelFormDraft>(createEmptyModelForm())
  const editingModel = ref<AIModelDraft>(createEmptyModelDraft())

  const formRules = MODEL_FORM_RULES
  const modelTypeOptions = MODEL_TYPE_OPTIONS
  const formatDate = formatProfileDate

  let chart: ECharts | null = null

  const handleChartResize = () => chart?.resize()

  const initChart = async () => {
    if (!chartRef.value) return
    const echarts = await import('echarts')
    chart?.dispose()
    chart = echarts.init(chartRef.value)
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      series: [
        {
          name: '创作数据',
          type: 'pie',
          radius: ['50%', '70%'],
          itemStyle: {
            borderRadius: 8,
            borderColor: 'transparent',
            borderWidth: 0
          },
          label: { show: false },
          emphasis: { scale: true, label: { show: true } },
          data: [
            {
              value: statistics.value.project_count,
              name: '项目数',
              itemStyle: { color: '#ffb7c5' }
            },
            {
              value: statistics.value.total_word_count / 1000,
              name: '千字数',
              itemStyle: { color: '#c9a9e8' }
            }
          ]
        }
      ]
    })
    window.addEventListener('resize', handleChartResize)
  }

  const loadModels = async () => {
    try {
      const res = await getUserModels()
      if (res.data.code === 200) {
        recentModels.value = res.data.data.models || []
      }
    } catch (error) {
      ElMessage.error(formatErrorMessage('加载模型列表失败', error))
    }
  }

  const loadUserData = async () => {
    try {
      const userRes = await getUserInfo()
      userInfo.value = userRes.data.data
      editForm.value = {
        username: userRes.data.data.username,
        email: userRes.data.data.email,
        phone: userRes.data.data.phone || '',
        password: ''
      }
      userInfo.value.avatar_url = BASE_URL + userInfo.value.avatar_url

      const statsRes = await getUserStatistics()
      statistics.value = statsRes.data.data

      const projectsRes = await getUserProjects(1, 10)
      recentProjects.value = projectsRes.data.data.projects || []

      await loadModels()
      await initChart()
    } catch (error) {
      ElMessage.error(formatErrorMessage('加载用户数据失败', error))
    }
  }

  const handleAvatarUpload = async (options: { file: File }) => {
    try {
      const res = await uploadAvatar(options.file)
      if (res.data.code === 200) {
        userInfo.value.avatar_url = res.data.data.avatar_url
        ElMessage.success('头像上传成功')
      }
    } catch (error) {
      ElMessage.error(formatErrorMessage('头像上传失败', error))
    }
  }

  const beforeAvatarUpload: UploadProps['beforeUpload'] = (file) => {
    const isImage = AVATAR_MIME_TYPES.includes(file.type)
    const isLt2M = file.size / 1024 / 1024 < AVATAR_MAX_MB
    if (!isImage) ElMessage.error('只能上传图片文件!')
    if (!isLt2M) ElMessage.error(`图片大小不能超过${AVATAR_MAX_MB}MB!`)
    return isImage && isLt2M
  }

  const submitProfileUpdate = async () => {
    try {
      const updateData: { username: string; email: string; phone: string; password?: string } = {
        ...editForm.value
      }
      if (!updateData.password) delete updateData.password
      const res = await updateUserInfo(updateData)
      if (res.data.code === 200) {
        ElMessage.success('个人信息更新成功')
        await loadUserData()
      }
    } catch (error) {
      ElMessage.error(formatErrorMessage('更新个人信息失败', error))
    }
  }

  const submitCreate = async () => {
    try {
      await createFormRef.value?.validate()
      creating.value = true
      const res = await createAIModel(createForm.value)
      if (res.data.code === 200) {
        ElMessage.success('模型创建成功')
        showCreateDialog.value = false
        await loadModels()
        createForm.value = createEmptyModelForm()
      }
    } catch (error) {
      console.error(error)
    } finally {
      creating.value = false
    }
  }

  const handleEdit = (model: AIModel) => {
    editingModel.value = { ...model }
    showEditDialog.value = true
  }

  const submitEdit = async () => {
    try {
      await editFormRef.value?.validate()
      editing.value = true
      const res = await updateAIModel(editingModel.value.model_id, {
        name: editingModel.value.name,
        style_description: editingModel.value.style_description,
        type: editingModel.value.type,
        model_path: editingModel.value.model_path
      })
      if (res.data.code === 200) {
        ElMessage.success('模型更新成功')
        showEditDialog.value = false
        await loadModels()
      }
    } catch (error) {
      console.error(error)
    } finally {
      editing.value = false
    }
  }

  const removeModel = async (modelId: number) => {
    const confirmed = await confirmAction('确定要删除这个模型吗？', { title: '警告' })
    if (!confirmed) return
    try {
      const res = await deleteAIModel(modelId)
      if (res.data.code === 200) {
        ElMessage.success('模型删除成功')
        await loadModels()
      }
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('删除失败', e))
    }
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      window.removeEventListener('resize', handleChartResize)
      chart?.dispose()
      chart = null
    })
  }

  return {
    userInfo,
    statistics,
    recentProjects,
    recentModels,
    editForm,
    chartRef,
    defaultAvatar,
    defaultCover,
    BASE_URL,
    showCreateDialog,
    showEditDialog,
    creating,
    editing,
    createForm,
    editingModel,
    createFormRef,
    editFormRef,
    formRules,
    modelTypeOptions,
    formatDate,
    loadUserData,
    loadModels,
    initChart,
    handleAvatarUpload,
    beforeAvatarUpload,
    submitProfileUpdate,
    submitCreate,
    handleEdit,
    submitEdit,
    removeModel
  }
}
