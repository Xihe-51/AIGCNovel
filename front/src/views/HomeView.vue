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
                    <el-dropdown-item command="txt">导出剧本 TXT</el-dropdown-item>
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
            </div>
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
    </div>
        </div>

</template>

<script setup lang="ts">



import { ref, computed, onMounted, watch, nextTick ,onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import {
  MagicStick,
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
import * as projectApi from '@/api/project'
import type { Project, TemplateMeta } from '@/api/project'
import { BASE_URL } from "@/utils/request"

interface ProjectForm {
  title: string
  genre: string
  template_type: string
  isPublic?: boolean
}

const router = useRouter()
const projects = ref<Project[]>([])
const dialogVisible = ref(false)
const isEditMode = ref(false)
const currentProjectId = ref<number | null>(null)
const coverFile = ref<File | null>(null)
const loading = ref(false)
const isPublicMode = ref(false)
const statsTimeRange = ref('all')
const templates = ref<TemplateMeta[]>([])
const importInputRef = ref<HTMLInputElement | null>(null)

// 图表相关引用
const genreChartRef = ref<HTMLDivElement | null>(null)
const wordCountChartRef = ref<HTMLDivElement | null>(null)
const statusChartRef = ref<HTMLDivElement | null>(null)

// 图表实例
let genreChart: echarts.ECharts | null = null
let wordCountChart: echarts.ECharts | null = null
let statusChart: echarts.ECharts | null = null

const projectForm = ref<ProjectForm>({
  title: '',
  genre: '',
  template_type: '线性叙事',
  isPublic: false
})

const dialogTitle = computed(() => isEditMode.value ? '编辑项目' : '新建项目')

// 封面样式
const coverStyle = (project: Project) => ({
  backgroundImage: project.cover_url 
    ? `url(${BASE_URL}${project.cover_url})` 
    : 'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)'
})

// 获取项目列表 - 根据模式切换获取不同项目
const fetchProjects = async () => {
  try {
    loading.value = true
    let res;
    if (isPublicMode.value) {
      // 获取公开项目
      res = await projectApi.getPublicProjects()
    } else {
      // 获取用户自己的项目
      res = await projectApi.getProjects()
    }
    projects.value = res
    
    // 当切换到我的项目时，初始化图表
    if (!isPublicMode.value) {
      nextTick(() => {
        initCharts()
      })
    }
  } catch (error) {
    console.log(error)
    ElMessage.error(isPublicMode.value ? '获取公开项目列表失败' : '获取项目列表失败')
  } finally {
    loading.value = false
  }
}

// 处理模式切换
const handleModeChange = () => {
  // 切换模式时重新加载项目列表
  fetchProjects()
}

// 刷新图表数据
const refreshCharts = () => {
  if (!isPublicMode.value && projects.value.length > 0) {
    initCharts()
  }
}

// 初始化图表
const initCharts = () => {
  // 处理时间范围过滤
  const filteredProjects = filterProjectsByTimeRange(projects.value, statsTimeRange.value)
  
  // 项目类型分布图表
  if (genreChartRef.value) {
    if (genreChart) {
      genreChart.dispose()
    }
    genreChart = echarts.init(genreChartRef.value)
    const genreData = getGenreDistribution(filteredProjects)
    
    genreChart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderColor: '#ffccd5',
        borderWidth: 1,
        textStyle: {
          color: '#333'
        },
        formatter: '{a} <br/>{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 10,
        textStyle: {
          color: '#666'
        }
      },
      series: [
        {
          name: '项目类型',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: '#fff',
            borderWidth: 2,
            color: function(params: any) {
              const colorList = [
                '#ff9a9e', '#f67280', '#c06c84', 
                '#6c5b7b', '#355c7d', '#ffaaa5', '#fad0c4'
              ];
              return colorList[params.dataIndex % colorList.length];
            }
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 16,
              fontWeight: 'bold',
              color: '#333'
            }
          },
          labelLine: {
            show: false
          },
          data: genreData
        }
      ]
    })
  }
  
  // 字数统计趋势图表
  if (wordCountChartRef.value) {
    if (wordCountChart) {
      wordCountChart.dispose()
    }
    wordCountChart = echarts.init(wordCountChartRef.value)
    const wordCountData = getWordCountByDate(filteredProjects)
    
    wordCountChart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderColor: '#ffccd5',
        borderWidth: 1,
        textStyle: {
          color: '#333'
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        axisLine: {
          lineStyle: {
            color: '#ffccd5'
          }
        },
        axisLabel: {
          color: '#666'
        }
      },
      yAxis: {
        type: 'value',
        axisLine: {
          lineStyle: {
            color: '#ffccd5'
          }
        },
        axisLabel: {
          color: '#666',
          formatter: '{value} 字'
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(255, 204, 213, 0.2)'
          }
        }
      },
      series: [
        {
          name: '累计字数',
          type: 'line',
          stack: 'Total',
          data: wordCountData.values,
          smooth: true,
          lineStyle: {
            width: 3,
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#ff9a9e' },
              { offset: 1, color: '#fad0c4' }
            ])
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(255, 154, 158, 0.4)' },
              { offset: 1, color: 'rgba(250, 208, 196, 0.1)' }
            ])
          },
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: {
            color: '#ff9a9e'
          },
          emphasis: {
            itemStyle: {
              color: '#fff',
              borderColor: '#ff9a9e',
              borderWidth: 2,
              shadowBlur: 10,
              shadowColor: 'rgba(255, 154, 158, 0.5)'
            }
          }
        }
      ]
    })
  }
  
  // 项目状态分布图表
  if (statusChartRef.value) {
    if (statusChart) {
      statusChart.dispose()
    }
    statusChart = echarts.init(statusChartRef.value)
    const statusData = getStatusDistribution(filteredProjects)
    
    statusChart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderColor: '#ffccd5',
        borderWidth: 1,
        textStyle: {
          color: '#333'
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: statusData.labels,
        axisLine: {
          lineStyle: {
            color: '#ffccd5'
          }
        },
        axisLabel: {
          color: '#666'
        }
      },
      yAxis: {
        type: 'value',
        axisLine: {
          lineStyle: {
            color: '#ffccd5'
          }
        },
        axisLabel: {
          color: '#666'
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(255, 204, 213, 0.2)'
          }
        }
      },
      series: [
        {
          data: statusData.values,
          type: 'bar',
          barWidth: '60%',
          itemStyle: {
            color: function(params: any) {
              const colorList = [
                new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#67c23a' },
                  { offset: 1, color: '#b3e19d' }
                ]),
                new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#ff9a9e' },
                  { offset: 1, color: '#fad0c4' }
                ])
              ];
              return colorList[params.dataIndex];
            },
            borderRadius: [4, 4, 0, 0]
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.1)'
            }
          }
        }
      ]
    })
  }
  
//页面滑动效果
const background = document.querySelector(".background") as HTMLElement | null;

if (background) {
    document.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        
        if (scrollY !== 0) {
            background.style.backgroundPosition = `calc(50% + ${scrollY}px) calc(50% + ${scrollY}px)`;
        } else {
            background.style.backgroundPosition = '';
        }
    });
}


  // 处理窗口大小变化
  const handleResize = () => {
    genreChart?.resize()
    wordCountChart?.resize()
    statusChart?.resize()
  }
  
  window.addEventListener('resize', handleResize)
  
  // 组件卸载时清除事件监听
  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
    genreChart?.dispose()
    wordCountChart?.dispose()
    statusChart?.dispose()
  })
}

// 根据时间范围过滤项目
const filterProjectsByTimeRange = (projects: Project[], range: string) => {
  if (range === 'all') return projects
  
  const days = parseInt(range)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  
  return projects.filter(project => {
    const projectDate = new Date(project.created_at)
    return projectDate >= cutoffDate
  })
}

// 获取项目类型分布数据
const getGenreDistribution = (projects: Project[]) => {
  const genreMap: Record<string, number> = {}
  
  projects.forEach(project => {
    if (genreMap[project.genre]) {
      genreMap[project.genre]++
    } else {
      genreMap[project.genre] = 1
    }
  })
  
  return Object.entries(genreMap).map(([name, value]) => ({
    name,
    value
  }))
}

// 获取按日期统计的字数数据
const getWordCountByDate = (projects: Project[]) => {
  // 按创建日期分组
  const dateMap: Record<string, number> = {}
  
  projects.forEach(project => {
    const date = new Date(project.created_at).toISOString().split('T')[0]
    if (dateMap[date]) {
      dateMap[date] += project.word_count
    } else {
      dateMap[date] = project.word_count
    }
  })
  
  // 按日期排序
  const sortedDates = Object.keys(dateMap).sort()
  
  return {
    dates: sortedDates,
    values: sortedDates.map(date => dateMap[date])
  }
}

// 获取项目状态分布数据（公开/私有）
const getStatusDistribution = (projects: Project[]) => {
  let publicCount = 0
  let privateCount = 0
  
  projects.forEach(project => {
    if (project.is_public) {
      publicCount++
    } else {
      privateCount++
    }
  })
  
  return {
    labels: ['已公开', '未公开'],
    values: [publicCount, privateCount]
  }
}

// 显示创建对话框
const showCreateDialog = () => {
  isEditMode.value = false
  projectForm.value = {
    title: '',
    genre: '',
    template_type: '线性叙事',
    isPublic: false
  }
  dialogVisible.value = true
}

// 显示编辑对话框
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

// 提交项目
const submitProject = async () => {
  if (!projectForm.value.title || !projectForm.value.genre) {
    ElMessage.warning('请填写完整信息')
    return
  }
  
  try {
    if (isEditMode.value && currentProjectId.value) {
      // 更新项目
      const updatedProject = await projectApi.updateProject(
        currentProjectId.value,
        {
          title: projectForm.value.title,
          genre: projectForm.value.genre,
          template_type: projectForm.value.template_type,
          is_public: projectForm.value.isPublic
        }
      )
      
      // 如果有上传封面
      if (coverFile.value) {
        const { cover_url } = await projectApi.uploadProjectCover(
          currentProjectId.value,
          coverFile.value
        )
        updatedProject.cover_url = cover_url
      }
      
      projects.value = projects.value.map(p => 
        p.project_id === currentProjectId.value ? updatedProject : p
      )
      ElMessage.success('项目更新成功')
    } else {
      // 创建项目
      const newProject = await projectApi.createProject({
        title: projectForm.value.title,
        genre: projectForm.value.genre,
        template_type: projectForm.value.template_type,
        is_public: projectForm.value.isPublic
      })
      projects.value.unshift(newProject)
      ElMessage.success('项目创建成功')
    }
    fetchProjects()
    dialogVisible.value = false
    coverFile.value = null
  } catch (error) {
    ElMessage.error(isEditMode.value ? '更新项目失败' : '创建项目失败')
  }
}

// 加载模板中心元数据（失败时回退到内置三种模板）
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
  templates.value = [
    { template_type: '线性叙事', name: '线性叙事', description: '单主线顺序推进，适合短篇与明确结局的故事。', features: ['单主线', '顺序阅读'], starter_scenes: [], recommended_variables: [] },
    { template_type: '分支叙事', name: '分支叙事', description: '关键时刻提供选择，不同选择走向不同结局。', features: ['多分支', '多结局'], starter_scenes: [], recommended_variables: [] },
    { template_type: '开放世界', name: '开放世界', description: '多场景自由探索，用变量串联线索与状态。', features: ['多场景', '变量驱动'], starter_scenes: [], recommended_variables: [] }
  ]
}

// 触发浏览器下载
const downloadFile = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 导出项目：json=完整项目包，txt=纯文本剧本
const handleExport = async (project: Project, format: string) => {
  try {
    if (format === 'txt') {
      const text = await projectApi.exportProjectText(project.project_id)
      downloadFile(text, `${project.title}.txt`, 'text/plain;charset=utf-8')
    } else {
      const bundle = await projectApi.exportProjectBundle(project.project_id)
      downloadFile(JSON.stringify(bundle, null, 2), `${project.title}.json`, 'application/json')
    }
    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

// 导入项目（选择 JSON 文件 → 新建项目）
const handleImportClick = () => {
  importInputRef.value?.click()
}

const handleImportFile = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const bundle = JSON.parse(text)
    const project = await projectApi.importProject(bundle)
    if (project) projects.value.unshift(project)
    ElMessage.success('项目导入成功')
    fetchProjects()
  } catch (error) {
    ElMessage.error('导入失败：请确认文件是有效的项目 JSON 包')
  } finally {
    input.value = ''
  }
}

// 确认删除
const confirmDelete = (projectId: number) => {
  ElMessageBox.confirm('确定要删除这个项目吗?', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
    customClass: 'delete-confirm'
  }).then(async () => {
    try {
      await projectApi.deleteProject(projectId)
      projects.value = projects.value.filter(p => p.project_id !== projectId)
      ElMessage.success('项目已删除')
    } catch (error) {
      ElMessage.error('删除项目失败')
    }
  }).catch(() => {})
}

// 跳转到项目详情
const goToProjectDetail = (projectId: number) => {
  if(isPublicMode.value){
	router.push(`/view/${projectId}`)
  }
  else {
	router.push(`/project/${projectId}`)
  }
}

// 处理封面变化
const handleCoverChange = (file: any) => {
  coverFile.value = file.raw
}

// 格式化日期
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return `${date.getFullYear()}-${(
    date.getMonth() + 1
  ).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}

// 获取类型标签样式
const getGenreTagType = (genre: string) => {
  const map: Record<string, string> = {
    '悬疑': '',
    '恋爱': 'danger',
    '科幻': 'info',
    '奇幻': 'warning',
    '历史': 'success',
    '现代': '',
    '其他': 'info'
  }
  return map[genre] || ''
}

// 获取模板标签样式
const getTemplateTagType = (template: string) => {
  const map: Record<string, string> = {
    '线性叙事': '',
    '分支叙事': 'success',
    '开放世界': 'warning'
  }
  return map[template] || ''
}

// 监听项目数据变化，刷新图表
watch(projects, (newVal) => {
  if (!isPublicMode.value && newVal.length > 0) {
    nextTick(() => {
      initCharts()
    })
  }
})

onMounted(() => {
  const token = localStorage.getItem('token');
  if(!token){ 
	router.push(`/login`)
	return
  }
  loadTemplates()
  fetchProjects()
})
</script>

<style scoped lang="scss">
// ========== 橙光风格变量 ==========
$bg-primary: #1a1a2e;
$bg-secondary: #16213e;
$pink: #ffb7c5;
$purple: #c9a9e8;
$mint: #a8e6cf;
$warm: #ffe6b0;
$primary-pink: #ffb7c5;
$primary-peach: #c9a9e8;
$border-light: rgba(255, 255, 255, 0.1);
$shadow-soft: 0 8px 32px rgba(0, 0, 0, 0.3);
$transition-smooth: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

// ========== 全局重置 ==========
* {
  box-sizing: border-box;
}

// ========== 背景样式 ==========
.background {
  display: none; // 隐藏原来的背景图
}

// ========== 主容器 - 100vh 全屏布局 ==========
.project-container {
  display: flex;
  flex-wrap: nowrap;
  gap: 24px;
  align-items: flex-start;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 80px 32px 32px;
  height: 100vh;
  min-height: 100vh;
  max-height: 100vh;
  margin: 0;
  background: linear-gradient(135deg, $bg-primary 0%, $bg-secondary 100%);
  border: none;
  border-radius: 0;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  transform: none;
  overflow-y: auto;
  overflow-x: hidden;
  
  // 自定义滚动条
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.02);
  }
  
  &::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, $pink, $purple);
    border-radius: 10px;
    
    &:hover {
      background: linear-gradient(135deg, lighten($pink, 10%), lighten($purple, 10%));
    }
  }
}

// ========== 头部区域 ==========
.project-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 0 8px;
  
  .header-actions {
    width: auto;
    min-width: 355px;
    border-radius: 50px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 6px 6px 20px;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    border: 1px solid $border-light;
  }
  
  .view-switch {
    :deep(.el-switch__label) {
      padding: 0 8px;
      font-weight: 500;
      color: #9ca3af !important;
    }
    
    :deep(.el-switch__label--left) {
      color: $pink !important;
    }
    
    :deep(.el-switch__label--right) {
      color: $mint !important;
    }
    
    :deep(.el-switch__core) {
      background: rgba(255, 255, 255, 0.15);
      border-color: $border-light;
    }
    
    :deep(.is-checked .el-switch__core) {
      background: linear-gradient(135deg, $mint, lighten($mint, 15%));
      border-color: transparent;
    }
  }
  
  .create-btn {
    background: linear-gradient(135deg, $pink, $purple) !important;
    border: none !important;
    color: white !important;
    padding: 10px 22px !important;
    height: auto;
    font-weight: 500;
    letter-spacing: 1px;
    box-shadow: 0 4px 15px rgba(255, 183, 197, 0.3);
    
    .btn-icon {
      margin-right: 8px;
      font-size: 16px;
    }
    
    &:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 6px 20px rgba(255, 183, 197, 0.4) !important;
      background: linear-gradient(135deg, lighten($pink, 5%), lighten($purple, 5%)) !important;
    }
  }
  
  .import-file-input {
    display: none;
  }
  
  .import-btn {
    background: rgba(255, 255, 255, 0.08) !important;
    border: 1px solid $border-light !important;
    color: #e5e7eb !important;
    box-shadow: none;
    
    &:hover {
      background: rgba(255, 255, 255, 0.15) !important;
      transform: translateY(-2px) !important;
      box-shadow: 0 6px 20px rgba(168, 230, 207, 0.2) !important;
    }
  }
}

// ========== 左侧区域 ==========
.left {
  flex: 1;
  width: auto;
  min-width: 500px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.left-section-title {
  width: 100%;
  margin-bottom: 16px;
  padding-left: 16px;
  
  h2 {
    font-size: 48px;
    font-weight: 700;
    font-family: '思源黑体 CN', 'PingFang SC', sans-serif;
    -webkit-text-fill-color: transparent;
    background-image: linear-gradient(
      135deg,
      $pink,
      $purple,
      $mint,
      $warm,
      $pink
    );
    background-size: 300%;
    margin: 0 0 4px 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    background-clip: text;
    line-height: 1.2;
    
    &:hover {
      animation: streamer 3s linear infinite;
    }
  }
  
  .subtitle {
    color: #3f7d6a;
    font-size: 24px;
    font-weight: 400;
    margin: 4px 0 0;
    padding-left: 4px;
    margin-left: 8px;
    text-shadow: 0 2px 10px rgba(168, 230, 207, 0.3);
    letter-spacing: 2px;
  }
}

@keyframes streamer {
  0% {
    background-position: 0%;
  }
  100% {
    background-position: 300%;
  }
}

// ========== 统计图表区域 ==========
.stats-container {
  min-width: 340px;
  width: 360px;
  height: 100%;
  flex-shrink: 0;
  overflow-y: auto;
  
  &::-webkit-scrollbar {
    width: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, $pink, $purple);
    border-radius: 4px;
  }
}

.stats-card {
  background: rgba(255, 255, 255, 0.03) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid $border-light !important;
  border-radius: 20px !important;
  box-shadow: $shadow-soft !important;
  overflow: hidden;
  
  :deep(.el-card__body) {
    padding: 0;
  }
}

.charts-grid {
  display: grid !important;
  grid-template-columns: 1fr;
  width: 100%;
  padding: 20px;
  gap: 20px;
}

.chart-item {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid $border-light;
  transition: $transition-smooth;
  
  &:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 183, 197, 0.3);
    box-shadow: 0 4px 20px rgba(255, 183, 197, 0.1);
  }
  
  h3 {
    margin: 0 0 18px 0;
    color: $pink;
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    letter-spacing: 1px;
    
    &::before {
      content: '';
      display: inline-block;
      width: 4px;
      height: 18px;
      background: linear-gradient(180deg, $pink, $purple);
      border-radius: 2px;
      margin-right: 12px;
    }
  }
}

.chart-container {
  width: 100%;
  height: 200px;
  position: relative;
}

// ========== 项目列表 ==========
.project-list {
  flex: 1;
  min-width: 300px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  padding: 8px 4px;
  overflow-y: auto;
  
  &::-webkit-scrollbar {
    width: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, $pink, $purple);
    border-radius: 4px;
  }
}

.project-card {
  background: rgba(255, 255, 255, 0.03) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid $border-light !important;
  border-radius: 16px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15) !important;
  cursor: pointer;
  transition: $transition-smooth;
  overflow: hidden;
  
  &:hover {
    transform: translateY(-6px);
    border-color: rgba(255, 183, 197, 0.3) !important;
    box-shadow: 0 12px 30px rgba(255, 183, 197, 0.15) !important;
    background: rgba(255, 255, 255, 0.05) !important;
  }
  
  :deep(.el-card__body) {
    padding: 0;
  }
}

.card-cover {
  height: 160px;
  background-size: cover;
  background-position: center;
  position: relative;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 10px;
  
  .public-status-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 2;
    
    :deep(.el-tag) {
      backdrop-filter: blur(8px);
      background: rgba(0, 0, 0, 0.4) !important;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: white;
      font-weight: 500;
      font-size: 11px;
      padding: 2px 10px;
      border-radius: 20px;
    }
    
    :deep(.el-tag--success) {
      background: rgba(168, 230, 207, 0.3) !important;
      color: $mint !important;
    }
  }
  
  .card-actions {
    display: flex;
    gap: 6px;
    opacity: 0;
    transition: $transition-smooth;
    z-index: 3;
    
    .action-dropdown {
      display: inline-flex;
      align-items: center;
      outline: none;
      
      :deep(.el-dropdown) {
        outline: none;
      }
    }
    
    .el-button {
      width: 32px !important;
      height: 32px !important;
      backdrop-filter: blur(8px);
      background: rgba(0, 0, 0, 0.4) !important;
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      color: white !important;
      
      &:hover {
        background: rgba(255, 255, 255, 0.15) !important;
        transform: scale(1.1);
      }
      
      &.el-button--danger:hover {
        background: rgba(255, 107, 107, 0.7) !important;
      }
    }
  }
  
  .public-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 2;
    
    :deep(.el-tag) {
      backdrop-filter: blur(8px);
      background: rgba(168, 230, 207, 0.3) !important;
      border: 1px solid rgba(168, 230, 207, 0.3);
      color: $mint;
      font-weight: 500;
      font-size: 11px;
      padding: 2px 10px;
      border-radius: 20px;
    }
  }
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, transparent 50%);
    opacity: 0;
    transition: $transition-smooth;
    z-index: 1;
    border-radius: 16px 16px 0 0;
  }
  
  &:hover {
    &::before {
      opacity: 1;
    }
    
    .card-actions {
      opacity: 1;
    }
  }
}

.card-content {
  padding: 16px 14px;
  
  h3 {
    margin: 0 0 10px;
    color: #ffffff;
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.card-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  
  :deep(.el-tag) {
    background: rgba(255, 255, 255, 0.08) !important;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #e5e7eb;
    font-size: 11px;
    padding: 2px 10px;
    border-radius: 20px;
  }
}

.card-footer {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #9ca3af;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  
  span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .el-icon {
    margin-right: 4px;
    font-size: 13px;
    color: $pink;
  }
}

// ========== 空状态 ==========
.empty-state {
  margin-top: 40px;
  padding: 40px;
  
  :deep(.el-empty__description) {
    color: #9ca3af;
    font-size: 15px;
    margin-top: 16px;
  }
  
  .empty-svg {
    width: 180px;
    height: 110px;
    margin: 0 auto;
    filter: drop-shadow(0 4px 10px rgba(255, 183, 197, 0.2));
  }
}

// ========== 对话框样式 ==========
.project-dialog {
  :deep(.el-dialog) {
    background: $bg-primary;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid $border-light;
    border-radius: 24px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }
  
  :deep(.el-dialog__header) {
    background: linear-gradient(135deg, rgba(255, 183, 197, 0.15), rgba(201, 169, 232, 0.15));
    border-radius: 24px 24px 0 0;
    border-bottom: 1px solid $border-light;
    padding: 20px 24px;
    margin: 0;
    
    .el-dialog__title {
      color: white;
      font-size: 20px;
      font-weight: 600;
    }
    
    .el-dialog__headerbtn {
      top: 20px;
      right: 20px;
      
      .el-dialog__close {
        color: #9ca3af;
        font-size: 18px;
        
        &:hover {
          color: $pink;
        }
      }
    }
  }
  
  :deep(.el-dialog__body) {
    padding: 24px;
  }
  
  :deep(.el-form-item__label) {
    color: $pink;
    font-weight: 500;
    font-size: 14px;
  }
  
  :deep(.el-input__wrapper) {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid $border-light;
    border-radius: 12px;
    box-shadow: none;
    padding: 8px 16px;
    
    .el-input__inner {
      color: white;
      
      &::placeholder {
        color: #6b7280;
      }
    }
    
    &:hover, &.is-focus {
      border-color: $pink;
      background: rgba(255, 255, 255, 0.08);
    }
  }
  
  :deep(.el-select) {
    width: 100%;
    
    .el-input__wrapper {
      background: rgba(255, 255, 255, 0.05);
    }
  }
  
  .template-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }
  
  .template-card {
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid #f0d4de;
    background: #ffffff;
    cursor: pointer;
    transition: $transition-smooth;
    
    &:hover {
      border-color: #f3a8bf;
      background: #fffafc;
    }
    
    &.active {
      border-color: #e8467c;
      background: #fdeef3;
      box-shadow: 0 4px 14px rgba(232, 70, 124, 0.14);
    }
    
    .template-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      
      .template-name {
        color: #3d2b32;
        font-size: 15px;
        font-weight: 600;
      }
      
      .template-check {
        color: #e8467c;
        font-size: 16px;
      }
    }
    
    .template-desc {
      margin: 6px 0 8px;
      color: #8a6a76;
      font-size: 12px;
      line-height: 1.5;
    }
    
    .template-features {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      
      .feature-tag {
        padding: 2px 10px;
        border-radius: 20px;
        font-size: 11px;
        color: #b4446a;
        background: #fdeef3;
        border: 1px solid #f6d6e2;
      }
    }
  }
  
  :deep(.el-upload__tip) {
    color: #9ca3af;
  }
  
  :deep(.el-dialog__footer) {
    padding: 16px 24px 24px;
    border-top: 1px solid $border-light;
    
    .el-button {
      padding: 9px 22px;
      border-radius: 30px;
      font-weight: 500;
      
      &:not(.el-button--primary) {
        background: transparent;
        border: 1px solid $border-light;
        color: #9ca3af;
        
        &:hover {
          background: rgba(255, 255, 255, 0.05);
          color: white;
          border-color: rgba(255, 255, 255, 0.2);
        }
      }
      
      &.el-button--primary {
        background: linear-gradient(135deg, $pink, $purple);
        border: none;
        color: white;
        
        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(255, 183, 197, 0.4);
        }
      }
    }
  }
}

// ========== 删除确认框 ==========
.delete-confirm {
  :deep(.el-message-box) {
    background: $bg-primary;
    backdrop-filter: blur(20px);
    border: 1px solid $border-light;
    border-radius: 20px;
  }
  
  :deep(.el-message-box__header) {
    padding: 18px 20px;
    border-bottom: 1px solid $border-light;
    
    .el-message-box__title {
      color: white;
      font-weight: 600;
    }
    
    .el-message-box__close {
      color: #9ca3af;
    }
  }
  
  :deep(.el-message-box__content) {
    padding: 24px 20px;
    color: #e5e7eb;
  }
  
  :deep(.el-message-box__btns) {
    padding: 16px 20px 20px;
    border-top: 1px solid $border-light;
    
    .el-button {
      padding: 9px 22px;
      border-radius: 30px;
    }
  }
}

// ========== 响应式调整 ==========
@media (max-width: 1400px) {
  .project-container {
    padding: 70px 24px 24px;
  }
  
  .left-section-title h2 {
    font-size: 40px;
  }
  
  .left-section-title .subtitle {
    font-size: 20px;
  }
}

@media (max-width: 1200px) {
  .project-container {
    flex-wrap: wrap;
  }
  
  .stats-container {
    width: 100%;
    min-width: auto;
    height: auto;
    max-height: 400px;
  }
  
  .left {
    min-width: auto;
    height: auto;
  }
  
  .charts-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .project-container {
    padding: 60px 16px 16px;
  }
  
  .charts-grid {
    grid-template-columns: 1fr;
  }
  
  .project-list {
    grid-template-columns: 1fr;
  }
  
  .project-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    
    .header-actions {
      width: 100%;
      min-width: auto;
      justify-content: space-between;
      padding: 6px 6px 6px 16px;
    }
  }
  
  .left-section-title h2 {
    font-size: 32px;
  }
  
  .left-section-title .subtitle {
    font-size: 18px;
  }
}
</style>