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
                    <button class="icon-btn delete" @click="removeModel(model.model_id)" title="删除">
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
                v-for="type in modelTypeOptions" 
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
                v-for="type in modelTypeOptions" 
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
import { defineComponent, onMounted } from 'vue'
import {
  Camera, Message, Iphone, Clock,
  Plus, Edit, Delete, Cpu, Picture, Microphone, Collection
} from '@element-plus/icons-vue'
import { formatTime } from '@/utils/date'
import {
  getGenreColor, getModelIcon, getModelIconColor, getModelTypeColor, getTypeLabel
} from '@/utils/individual'
import { useIndividualView } from '@/composables/individual/useIndividualView'
import TechNavCircle from '@/components/TechNavCircle.vue'

export default defineComponent({
  name: 'IndividualCenter',
  components: {
    Camera, Message, Iphone, Clock, Plus, Edit, Delete, Cpu, Picture, Microphone, Collection, TechNavCircle
  },
  setup() {
    const view = useIndividualView()

    onMounted(() => {
      view.loadUserData()
    })

    return {
      ...view,
      formatTime,
      getGenreColor, getModelIcon, getModelIconColor, getModelTypeColor, getTypeLabel
    }
  }
})
</script>

<style scoped lang="scss" src="./individualView.scss"></style>