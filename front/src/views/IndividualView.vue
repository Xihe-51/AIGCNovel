<template>
  <div class="profile-studio">
    <TechNavCircle />
    
    <div class="studio-container">
      <!-- 顶部用户信息卡片 -->
      <div class="user-profile-wrapper">
        <div class="profile-card">
          <div class="avatar-section">
            <el-avatar :size="120" :src="userInfo.avatar_url || defaultAvatar" class="user-avatar" />
            <el-upload 
              class="avatar-uploader" 
              :show-file-list="false" 
              :http-request="handleAvatarUpload"
              :before-upload="beforeAvatarUpload"
            >
              <button class="upload-btn">
                <el-icon><Camera /></el-icon>
              </button>
            </el-upload>
          </div>
          
          <div class="user-info">
            <h2>{{ userInfo.username }}</h2>
            <div class="info-item">
              <el-icon><Message /></el-icon>
              <span>{{ userInfo.email }}</span>
            </div>
            <div class="info-item" v-if="userInfo.phone">
              <el-icon><Iphone /></el-icon>
              <span>{{ userInfo.phone }}</span>
            </div>
            <div class="info-item">
              <el-icon><Clock /></el-icon>
              <span>注册于 {{ formatDate(userInfo.created_at) }}</span>
            </div>
          </div>
          
          <div class="stats-overview">
            <div class="stat-item">
              <span class="stat-value">{{ statistics.project_count }}</span>
              <span class="stat-label">项目数</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ statistics.model_count }}</span>
              <span class="stat-label">AI模型</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ statistics.total_word_count }}</span>
              <span class="stat-label">总字数</span>
            </div>
          </div>
        </div>
        
        <!-- 我的项目 -->
        <div class="projects-card">
          <div class="card-header">
            <h3>我的项目</h3>
          </div>
          <div class="project-list">
            <el-scrollbar height="360px">
              <div v-for="project in recentProjects" :key="project.project_id" class="project-item">
                <div class="project-cover"
                  :style="{ backgroundImage: `url(${BASE_URL}${project.cover_url || defaultCover})` }">
                </div>
                <div class="project-info">
                  <h4>{{ project.title }}</h4>
                  <div class="project-meta">
                    <span class="genre-tag" :style="{ background: getGenreColor(project.genre) }">
                      {{ project.genre }}
                    </span>
                    <span class="word-count">{{ project.word_count }}字</span>
                  </div>
                  <div class="project-date">{{ formatDate(project.updated_at) }}更新</div>
                </div>
              </div>
            </el-scrollbar>
          </div>
        </div>
      </div>

      <!-- 主要内容区域 -->
      <div class="main-content">
        <!-- 左侧 -->
        <div class="content-left">
          <!-- 数据图表 -->
          <div class="chart-card">
            <h3>创作数据统计</h3>
            <div ref="chartRef" class="chart-container"></div>
          </div>

          <!-- 个人信息编辑 -->
          <div class="edit-card">
            <h3>编辑个人信息</h3>
            <el-form :model="editForm" label-position="top">
              <el-form-item label="用户名">
                <el-input v-model="editForm.username" placeholder="请输入用户名" />
              </el-form-item>
              <el-form-item label="邮箱">
                <el-input v-model="editForm.email" type="email" placeholder="请输入邮箱" />
              </el-form-item>
              <el-form-item label="手机号">
                <el-input v-model="editForm.phone" placeholder="请输入手机号" />
              </el-form-item>
              <el-form-item label="密码">
                <el-input v-model="editForm.password" type="password" show-password placeholder="留空则不修改" />
              </el-form-item>
              <el-form-item>
                <button class="save-btn" @click="submitProfileUpdate">保存更改</button>
              </el-form-item>
            </el-form>
          </div>
        </div>

        <!-- 右侧 - AI模型 -->
        <div class="content-right">
          <div class="models-card">
            <div class="card-header">
              <h3>我的AI模型</h3>
              <button class="create-btn" @click="showCreateDialog = true">
                <el-icon><Plus /></el-icon>
                <span>新建模型</span>
              </button>
            </div>
            
            <el-scrollbar height="520px">
              <div class="model-list">
                <div v-for="model in recentModels" :key="model.model_id" class="model-item">
                  <div class="model-icon" :style="{ color: getModelIconColor(model.type) }">
                    <el-icon :size="24">
                      <component :is="getModelIcon(model.type)" />
                    </el-icon>
                  </div>
                  <div class="model-info">
                    <h4>{{ model.name }}</h4>
                    <p>{{ model.style_description }}</p>
                    <div class="model-tags">
                      <span class="type-tag" v-if="model.type" :style="{ background: getModelTypeColor(model.type) }">
                        {{ model.type }}
                      </span>
                      <span class="time-tag" v-if="model.created_at">
                        {{ formatTime(model.created_at) }}
                      </span>
                    </div>
                  </div>
                  <div class="model-actions">
                    <button class="icon-btn edit" @click="handleEdit(model)" title="编辑">
                      <el-icon><Edit /></el-icon>
                    </button>
                    <button class="icon-btn delete" @click="handleDelete(model.model_id)" title="删除">
                      <el-icon><Delete /></el-icon>
                    </button>
                  </div>
                </div>

                <div class="empty-state" v-if="recentModels.length === 0">
                  <el-icon><Cpu /></el-icon>
                  <p>暂无AI模型</p>
                </div>
              </div>
            </el-scrollbar>
          </div>
        </div>
      </div>

      <!-- 创建模型对话框 -->
      <el-dialog v-model="showCreateDialog" title="创建新模型" width="480px" class="custom-dialog">
        <el-form :model="createForm" :rules="formRules" ref="createFormRef" label-position="top">
          <el-form-item label="模型名称" prop="name">
            <el-input v-model="createForm.name" placeholder="请输入模型名称" />
          </el-form-item>
          <el-form-item label="风格描述" prop="style_description">
            <el-input v-model="createForm.style_description" type="textarea" :rows="3" placeholder="请输入模型风格描述" />
          </el-form-item>
          <el-form-item label="模型类型">
            <div class="type-options">
              <span 
                v-for="type in ['text', 'image', 'audio']" 
                :key="type"
                class="type-option"
                :class="{ selected: createForm.type === type }"
                @click="createForm.type = type"
              >
                {{ getTypeLabel(type) }}
              </span>
            </div>
          </el-form-item>
          <el-form-item label="模型路径" prop="model_path">
            <el-input v-model="createForm.model_path" placeholder="请输入模型存储路径" />
          </el-form-item>
        </el-form>
        <template #footer>
          <button class="dialog-btn cancel" @click="showCreateDialog = false">取消</button>
          <button class="dialog-btn confirm" @click="submitCreate" :disabled="creating">
            {{ creating ? '创建中...' : '确定' }}
          </button>
        </template>
      </el-dialog>

      <!-- 编辑模型对话框 -->
      <el-dialog v-model="showEditDialog" title="编辑模型" width="480px" class="custom-dialog">
        <el-form :model="editingModel" :rules="formRules" ref="editFormRef" label-position="top">
          <el-form-item label="模型名称" prop="name">
            <el-input v-model="editingModel.name" placeholder="请输入模型名称" />
          </el-form-item>
          <el-form-item label="风格描述" prop="style_description">
            <el-input v-model="editingModel.style_description" type="textarea" :rows="3" placeholder="请输入模型风格描述" />
          </el-form-item>
          <el-form-item label="模型类型">
            <div class="type-options">
              <span 
                v-for="type in ['text', 'image', 'audio']" 
                :key="type"
                class="type-option"
                :class="{ selected: editingModel.type === type }"
                @click="editingModel.type = type"
              >
                {{ getTypeLabel(type) }}
              </span>
            </div>
          </el-form-item>
          <el-form-item label="模型路径" prop="model_path">
            <el-input v-model="editingModel.model_path" placeholder="请输入模型存储路径" />
          </el-form-item>
        </el-form>
        <template #footer>
          <button class="dialog-btn cancel" @click="showEditDialog = false">取消</button>
          <button class="dialog-btn confirm" @click="submitEdit" :disabled="editing">
            {{ editing ? '保存中...' : '保存' }}
          </button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from 'vue'
import { 
  Camera, Message, Iphone, Clock, 
  Plus, Edit, Delete, Cpu, Picture, Microphone, Collection
} from '@element-plus/icons-vue'
import { 
  getUserInfo, updateUserInfo, uploadAvatar, getUserModels, 
  getUserProjects, getUserStatistics, createAIModel, updateAIModel, deleteAIModel
} from '@/api/individual'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules, UploadProps } from 'element-plus'
import { BASE_URL } from "@/utils/request"
import { formatTime } from '@/utils/date'
import TechNavCircle from '@/components/TechNavCircle.vue'

interface UserInfo {
  user_id: number;
  username: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  created_at?: string;
}

interface AIModel {
  model_id: number;
  name: string;
  style_description: string;
  type?: string;
  model_path?: string;
  created_at?: string;
}

interface Project {
  project_id: number;
  title: string;
  cover_url?: string;
  genre: string;
  word_count: number;
  updated_at?: string;
}

export default defineComponent({
  name: 'IndividualCenter',
  components: { 
    Camera, Message, Iphone, Clock, Plus, Edit, Delete, Cpu, Picture, Microphone, Collection, TechNavCircle
  },
  setup() {
    const defaultAvatar = ref('https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png')
    const defaultCover = ref('')

    const userInfo = ref<UserInfo>({ user_id: 0, username: '', email: '', phone: '', avatar_url: '', created_at: '' })
    const statistics = ref({ project_count: 0, model_count: 0, total_word_count: 0 })
    const recentProjects = ref<Project[]>([])
    const recentModels = ref<AIModel[]>([])
    const editForm = ref<{ username: string; email: string; phone: string; password?: string }>({ username: '', email: '', phone: '', password: '' })
    const chartRef = ref<HTMLElement | null>(null)

    const showCreateDialog = ref(false)
    const showEditDialog = ref(false)
    const creating = ref(false)
    const editing = ref(false)
    const createFormRef = ref<FormInstance>()
    const editFormRef = ref<FormInstance>()
    
    const createForm = ref({ name: '', style_description: '', type: '', model_path: '' })
    const editingModel = ref<AIModel>({ model_id: 0, name: '', style_description: '', type: '', model_path: '' })
    
    const formRules: FormRules = {
      name: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
      style_description: [{ required: true, message: '请输入风格描述', trigger: 'blur' }],
      model_path: [{ required: true, message: '请输入模型路径', trigger: 'blur' }]
    }

    const getGenreColor = (genre: string) => {
      const colors: Record<string, string> = {
        '悬疑': '#6c5b7b', '恋爱': '#ffb7c5', '科幻': '#5d5fef',
        '奇幻': '#c9a9e8', '历史': '#c49a6c', '现代': '#a8e6cf', '其他': '#b8b8b8'
      }
      return colors[genre] || '#ffb7c5'
    }

    const getModelIcon = (type?: string) => {
      const icons: Record<string, any> = { 'text': 'Collection', 'image': 'Picture', 'audio': 'Microphone' }
      return icons[type || ''] || 'Cpu'
    }

    const getModelIconColor = (type?: string) => {
      const colors: Record<string, string> = { 'text': '#5d5fef', 'image': '#ffb7c5', 'audio': '#a8e6cf' }
      return colors[type || ''] || '#c9a9e8'
    }

    const getModelTypeColor = (type?: string) => {
      const colors: Record<string, string> = { 'text': '#5d5fef', 'image': '#ffb7c5', 'audio': '#a8e6cf' }
      return colors[type || ''] || '#9ca3af'
    }

    const getTypeLabel = (type: string) => {
      const labels: Record<string, string> = { 'text': '文本', 'image': '图像', 'audio': '语音' }
      return labels[type] || type
    }

    const formatDate = (dateString?: string) => {
      if (!dateString) return '未知时间'
      const date = new Date(dateString)
      return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
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
        initChart()
      } catch (error) {
        ElMessage.error('加载用户数据失败')
      }
    }

    const loadModels = async () => {
      try {
        const res = await getUserModels()
        if (res.data.code === 200) {
          recentModels.value = res.data.data.models || []
        }
      } catch (error) {
        ElMessage.error('加载模型列表失败')
      }
    }

    const initChart = async () => {
      if (!chartRef.value) return
      // 图表库按需加载，避免个人页首屏预取 echarts
      const echarts = await import('echarts')
      const chart = echarts.init(chartRef.value)
      chart.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        series: [{
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
            { value: statistics.value.project_count, name: '项目数', itemStyle: { color: '#ffb7c5' } },
            { value: statistics.value.total_word_count / 1000, name: '千字数', itemStyle: { color: '#c9a9e8' } }
          ]
        }]
      })
      window.addEventListener('resize', () => chart.resize())
    }

    const handleAvatarUpload = async (options: any) => {
      try {
        const res = await uploadAvatar(options.file)
        if (res.data.code === 200) {
          userInfo.value.avatar_url = res.data.data.avatar_url
          ElMessage.success('头像上传成功')
        }
      } catch (error) {
        ElMessage.error('头像上传失败')
      }
    }

    const beforeAvatarUpload: UploadProps['beforeUpload'] = (file) => {
      const isImage = ['image/jpeg', 'image/png', 'image/gif'].includes(file.type)
      const isLt2M = file.size / 1024 / 1024 < 2
      if (!isImage) ElMessage.error('只能上传图片文件!')
      if (!isLt2M) ElMessage.error('图片大小不能超过2MB!')
      return isImage && isLt2M
    }

    const submitProfileUpdate = async () => {
      try {
        const updateData = { ...editForm.value }
        if (!updateData.password) delete updateData.password
        const res = await updateUserInfo(updateData)
        if (res.data.code === 200) {
          ElMessage.success('个人信息更新成功')
          loadUserData()
        }
      } catch (error) {
        ElMessage.error('更新个人信息失败')
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
          loadModels()
          createForm.value = { name: '', style_description: '', type: '', model_path: '' }
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
          loadModels()
        }
      } catch (error) {
        console.error(error)
      } finally {
        editing.value = false
      }
    }

    const handleDelete = (modelId: number) => {
      ElMessageBox.confirm('确定要删除这个模型吗？', '警告', {
        confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
      }).then(async () => {
        try {
          const res = await deleteAIModel(modelId)
          if (res.data.code === 200) {
            ElMessage.success('模型删除成功')
            loadModels()
          }
        } catch (error) {
          ElMessage.error('删除失败')
        }
      }).catch(() => {})
    }

    onMounted(() => loadUserData())

    return {
      userInfo, statistics, recentProjects, recentModels, editForm, chartRef,
      defaultAvatar, defaultCover, BASE_URL,
      showCreateDialog, showEditDialog, creating, editing,
      createForm, editingModel, createFormRef, editFormRef, formRules,
      formatDate, formatTime,
      handleAvatarUpload, beforeAvatarUpload, submitProfileUpdate,
      getGenreColor, getModelIcon, getModelIconColor, getModelTypeColor, getTypeLabel,
      submitCreate, handleEdit, submitEdit, handleDelete
    }
  }
})
</script>

<style scoped lang="scss" src="./individualView.scss"></style>