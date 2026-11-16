<template>
  <TechNavCircle/>
  <div class="background"><span>项目</span></div>
  <div class="project-container">
    <!-- 数据统计图表区域 -->
    <div class="stats-container" v-if="!isPublicMode">
      <el-card shadow="hover" class="stats-card">
        <div class="charts-grid">
          <div class="chart-item">
            <h3>项目类型分布</h3>
            <div ref="genreChartRef" class="chart-container"></div>
          </div>
          <div class="chart-item">
            <h3>项目状态分布</h3>
            <div ref="statusChartRef" class="chart-container"></div>
          </div>
          <div class="chart-item">
            <h3>字数增长趋势</h3>
            <div ref="wordCountChartRef" class="chart-container"></div>
          </div>
        </div>
      </el-card>
    </div>
    <div class="left">
      <!-- 头部区域 -->
      <div class="left-section-title">
    <h2>Ciallo～(∠・ω<)⌒★</h2>
    <p class="subtitle">你的创作分析报告:</p>
    </div>
     <div class="project-header">
      <!-- <h1>
        <el-icon class="header-icon"><MagicStick /></el-icon>
        {{ isPublicMode ? '公开项目' : '我的创作项目' }}
      </h1> -->
      <div class="header-actions">
        <!-- 切换滑块 -->
        <el-switch
          v-model="isPublicMode"
          active-text="公开项目"
          inactive-text="我的项目"
          @change="handleModeChange"
          class="view-switch"
        />
        
        <input
          ref="importInputRef"
          type="file"
          accept=".json,application/json"
          class="import-file-input"
          @change="handleImportFile"
        />
        <el-button 
          class="create-btn import-btn"
          round
          @click="handleImportClick"
          v-if="!isPublicMode"
        >
          <el-icon class="btn-icon"><Upload /></el-icon>导入项目
        </el-button>
        <el-button 
          type="primary" 
          @click="showCreateDialog" 
          class="create-btn" 
          round
          v-if="!isPublicMode"
        >
          <el-icon class="btn-icon"><Plus /></el-icon>新建项目
        </el-button>
      </div>
  
    </div>
    <!-- 项目列表 -->
     
    <div class="project-list" v-if="projects.length > 0">
  
      <el-card 
        v-for="project in projects" 
        :key="project.project_id"
        class="project-card"
        shadow="hover"
        @click="goToProjectDetail(project.project_id)"
      >
        <div class="card-cover" :style="coverStyle(project)">
          <!-- 项目公开状态标识 -->
          <div class="public-status-badge" v-if="!isPublicMode">
            <el-tag :type="project.is_public ? 'success' : 'info'" size="small">
              {{ project.is_public ? '已公开' : '未公开' }}
            </el-tag>
          </div>
          
          <div class="card-actions" v-if="!isPublicMode">
            <span class="action-dropdown" @click.stop>
              <el-dropdown trigger="click" @command="(fmt: string) => handleExport(project, fmt)">
                <el-button type="info" :icon="Download" circle size="small" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="json">导出 JSON 包</el-dropdown-item>
                    <el-dropdown-item command="static">导出静态网页包</el-dropdown-item>
                    <el-dropdown-item command="txt">导出剧本 TXT</el-dropdown-item>
                    <el-dropdown-item command="docx">导出剧本 DOCX</el-dropdown-item>
                    <el-dropdown-item command="novel">导出主线小说 DOCX</el-dropdown-item>
                    <el-dropdown-item command="audio">导出有声剧脚本 DOCX</el-dropdown-item>
                    <el-dropdown-item command="storyboard">导出分镜脚本 DOCX</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </span>
            <el-button 
              type="primary" 
              :icon="Edit" 
              circle
              @click.stop="showEditDialog(project)"
              size="small"
            />
            <el-button 
              type="danger" 
              :icon="Delete" 
              circle
              @click.stop="confirmDelete(project.project_id)"
              size="small"
            />
          </div>
          
          <!-- 公开项目标记 -->
          <div v-if="isPublicMode" class="public-badge">
            <el-tag type="success">公开</el-tag>
          </div>
        </div>
        <div class="card-content">
          <h3>{{ project.title }}</h3>
          <div class="card-meta">
            <el-tag :type="getGenreTagType(project.genre)" size="small">
              {{ project.genre }}
            </el-tag>
          </div>
          <div class="card-footer">
            <span class="word-count">
              <el-icon><Document /></el-icon>
              {{ project.word_count }}字
            </span>
            <span class="update-time">
              <el-icon><Clock /></el-icon>
              {{ formatDate(project.updated_at) }}
            </span>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 空状态 -->
    <el-empty 
      v-else 
      :description="isPublicMode ? '暂无公开项目' : '还没有任何项目，点击上方按钮创建一个吧~'" 
      class="empty-state"
    >
      <template #image>
        <div class="empty-svg">
          <svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
            <rect x="20" y="40" width="160" height="80" rx="5" fill="#f8e1e7" />
            <rect x="30" y="50" width="140" height="60" rx="3" fill="white" />
            <circle cx="60" cy="80" r="8" fill="#ff9a9e" />
            <rect x="80" y="75" width="80" height="10" rx="5" fill="#fad0c4" />
            <circle cx="60" cy="110" r="8" fill="#ff9a9e" />
            <rect x="80" y="105" width="60" height="10" rx="5" fill="#fad0c4" />
            <path d="M20,40 Q30,20 50,30 L60,20 Q70,10 80,20 L90,10 Q100,0 110,10 L120,0 Q130,-10 140,0 L150,10 Q160,20 170,10 L180,20 Q190,30 180,40 Z" fill="#ff9a9e" />
          </svg>
        </div>
      </template>
    </el-empty>

    <!-- 创建/编辑项目对话框 -->
    <el-dialog 
      :title="dialogTitle" 
      v-model="dialogVisible" 
      width="500px"
      class="project-dialog"
    >
      <el-form :model="projectForm" label-position="top">
        <el-form-item label="项目名称" required>
          <el-input v-model="projectForm.title" placeholder="请输入项目名称">
            <template #prefix>
              <el-icon><Notebook /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="作品类型" required>
          <el-select v-model="projectForm.genre" placeholder="请选择作品类型">
            <el-option label="悬疑" value="悬疑" />
            <el-option label="恋爱" value="恋爱" />
            <el-option label="科幻" value="科幻" />
            <el-option label="奇幻" value="奇幻" />
            <el-option label="历史" value="历史" />
            <el-option label="现代" value="现代" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="叙事模板" required>
          <div class="template-cards">
            <div
              v-for="tpl in templates"
              :key="tpl.template_type"
              class="template-card"
              :class="{ active: projectForm.template_type === tpl.template_type }"
              @click="projectForm.template_type = tpl.template_type"
            >
              <div class="template-card-head">
                <span class="template-name">{{ tpl.name }}</span>
                <el-icon v-if="projectForm.template_type === tpl.template_type" class="template-check">
                  <Select />
                </el-icon>
              </div>
              <p class="template-desc">{{ tpl.description }}</p>
              <div class="template-features">
                <span v-for="f in tpl.features" :key="f" class="feature-tag">{{ f }}</span>
              </div>
              <div v-if="tpl.starter_scenes && tpl.starter_scenes.length" class="template-skeleton">
                <span class="skeleton-label">预置场景</span>
                <span class="skeleton-scenes">
                  {{ tpl.starter_scenes.map(s => s.title).join(' → ') }}
                </span>
              </div>
              <div v-if="tpl.recommended_variables && tpl.recommended_variables.length" class="template-vars">
                <span class="skeleton-label">推荐变量</span>
                <span v-for="v in tpl.recommended_variables" :key="v.name" class="var-chip">{{ v.label }}</span>
              </div>
            </div>
          </div>
          <div class="template-tip">
            选好模板后，会按骨架自动建好场景与「【在此填写：…】」占位文本，进工作台直接改。
          </div>
        </el-form-item>
        <el-form-item label="公开项目" v-if="isEditMode">
          <el-switch v-model="projectForm.isPublic" active-text="公开" inactive-text="私有" />
        </el-form-item>
        <el-form-item label="封面图片" v-if="isEditMode">
          <el-upload
            action="#"
            :auto-upload="false"
            :show-file-list="false"
            :on-change="handleCoverChange"
          >
            <el-button type="primary" :icon="Upload">点击上传</el-button>
            <template #tip>
              <div class="el-upload__tip">建议尺寸 800x450px，支持JPG/PNG格式</div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取 消</el-button>
        <el-button type="primary" @click="submitProject">确 定</el-button>
      </template>
    </el-dialog>

    <!-- 多形态导出：选择结局/路线 -->
    <el-dialog v-model="exportDialogVisible" title="导出多形态作品" width="460px" append-to-body>
      <div style="font-size:12px;color:#8b6b78;line-height:1.7;margin-bottom:10px">
        {{ exportFormat === 'novel'
          ? '按选定路线展开成线性小说。'
          : exportFormat === 'audio'
            ? '按选定路线生成有声剧脚本，包含角色、情绪、BGM、音效与停顿提示。'
            : '按选定路线生成动态漫 / 短视频分镜表：镜号、画面、台词、情绪、镜头建议、时长与声音提示。' }}
        不选结局时使用默认主线（遇到选择取第一个可走选项）。
      </div>
      <el-form label-position="top">
        <el-form-item label="导出到哪个结局">
          <el-select v-model="exportEndingId" clearable placeholder="默认主线（第一个可走路线）" style="width:100%">
            <el-option
              v-for="en in projectEndings"
              :key="en.ending_id"
              :label="en.title"
              :value="en.ending_id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="exportDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="exporting" @click="confirmFormatExport">导出</el-button>
      </template>
    </el-dialog>
    </div>
        </div>

</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  Plus,
  Edit,
  Delete,
  Document,
  Clock,
  Notebook,
  Upload,
  Download,
  Select
} from '@element-plus/icons-vue'
import type { Project } from '@/api/project'
import { BASE_URL } from '@/utils/request'
import { buildCoverStyle, formatHomeDate as formatDate, getGenreTagType } from '@/utils/homeStats'
import { useHomeBackground } from '@/composables/home/useHomeBackground'
import { useHomeCharts } from '@/composables/home/useHomeCharts'
import { useHomeProjects } from '@/composables/home/useHomeProjects'
import { useProjectExport } from '@/composables/home/useProjectExport'
import { useProjectForm } from '@/composables/home/useProjectForm'

const router = useRouter()

const {
  projects,
  isPublicMode,
  importInputRef,
  fetchProjects,
  handleModeChange,
  confirmDelete,
  handleImportClick,
  handleImportFile
} = useHomeProjects()

const statsTimeRange = ref('all')
const { genreChartRef, wordCountChartRef, statusChartRef, initCharts } = useHomeCharts({
  projects,
  isPublicMode,
  statsTimeRange
})

const {
  dialogVisible,
  isEditMode,
  templates,
  projectForm,
  dialogTitle,
  loadTemplates,
  showCreateDialog,
  showEditDialog,
  handleCoverChange,
  submitProject
} = useProjectForm({ onSubmitted: () => fetchProjects() })

const {
  exportDialogVisible,
  exportFormat,
  exportEndingId,
  projectEndings,
  exporting,
  handleExport,
  confirmFormatExport
} = useProjectExport()

useHomeBackground()

const coverStyle = (project: Project) => buildCoverStyle(project, BASE_URL)

const goToProjectDetail = (projectId: number) => {
  router.push(isPublicMode.value ? `/view/${projectId}` : `/project/${projectId}`)
}

watch(projects, (list) => {
  if (!isPublicMode.value && list.length > 0) nextTick(initCharts)
})

onMounted(() => {
  const token = localStorage.getItem('token')
  if (!token) {
    router.push('/login')
    return
  }
  loadTemplates()
  fetchProjects()
})
</script>

<style scoped lang="scss" src="./home/homeShell.scss"></style>
<style scoped lang="scss" src="./home/homeHeader.scss"></style>
<style scoped lang="scss" src="./home/homeSidebar.scss"></style>
<style scoped lang="scss" src="./home/homeStats.scss"></style>
<style scoped lang="scss" src="./home/homeProjects.scss"></style>
<style scoped lang="scss" src="./home/homeDialogs.scss"></style>
<style scoped lang="scss" src="./home/homeResponsive.scss"></style>
