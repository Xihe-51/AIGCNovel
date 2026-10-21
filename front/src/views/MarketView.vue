<template>
  <div class="orange-market">
    <TechNavCircle />
    
    <div class="market-container">
      <!-- 头部区域 -->
      <div class="market-header">
        <div class="header-left">
          <h1 class="market-title">
            <span class="title-main">资源市场</span>
            <span class="title-sub">素材工坊</span>
          </h1>
          <p class="market-desc">发现高质量创作素材，让你的故事更精彩</p>
        </div>
        
        <button 
          class="upload-work-btn" 
          @click="showUploadDialog"
          v-if="userId"
        >
          <el-icon><Upload /></el-icon>
          <span>上传素材</span>
        </button>
      </div>

      <!-- 搜索栏 -->
      <div class="search-section">
        <div class="search-wrapper">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索你想要的素材..."
            class="search-input"
            clearable
            @clear="handleSearch"
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          
          <div class="filter-group">
            <el-select
              v-model="searchType"
              placeholder="全部类型"
              class="type-select"
              clearable
              @change="handleSearch"
            >
              <el-option label="全部" value="" />
              <el-option label="角色" value="角色">
                <div class="select-option">
                  <span>👤 角色</span>
                </div>
              </el-option>
              <el-option label="背景" value="背景">
                <div class="select-option">
                  <span>🏞️ 背景</span>
                </div>
              </el-option>
              <el-option label="CG" value="CG">
                <div class="select-option">
                  <span>🎨 CG</span>
                </div>
              </el-option>
              <el-option label="其他" value="其他">
                <div class="select-option">
                  <span>📦 其他</span>
                </div>
              </el-option>
            </el-select>
            
            <button class="search-btn" @click="handleSearch">
              <el-icon><Search /></el-icon>
            </button>
          </div>
        </div>
        
        <!-- 统计信息 -->
        <div class="stats-info">
          <span class="stat-item">
            <span class="stat-value">{{ totalResources }}</span>
            <span class="stat-label">个素材</span>
          </span>
        </div>
      </div>

      <!-- 资源网格 -->
      <div class="resource-grid">
        <div 
          class="resource-card" 
          v-for="resource in resources" 
          :key="resource.resource_id"
          :style="{ '--delay': Math.random() * 0.3 + 's' }"
        >
          <!-- 封面区域 -->
          <div class="card-cover" @click="showResourceDetail(resource)">
            <img 
              v-if="getFileType(resource.file_url) === 1" 
              :src="`${BASE_URL}${resource.file_url}`" 
              class="cover-image"
              alt="resource cover"
            />
            
            <div v-else-if="getFileType(resource.file_url) === 2" class="cover-audio">
              <div class="audio-icon">
                <el-icon><Headset /></el-icon>
              </div>
              <audio controls class="audio-player">
                <source :src="`${BASE_URL}${resource.file_url}`" type="audio/mpeg">
              </audio>
            </div>
            
            <div v-else class="cover-other" @click="showResourceDetail(resource)">
              <div class="other-icon">
                <el-icon><Link /></el-icon>
              </div>
              <span class="other-label">模型链接</span>
            </div>
            
            <!-- 类型标签 -->
            <span class="type-badge" :style="{ background: getTypeColor(resource.resource_type) }">
              {{ resource.resource_type }}
            </span>
            
            <!-- 价格标签 -->
            <span class="price-badge" :class="{ free: resource.price === 0 }">
              <el-icon v-if="resource.price === 0"><Present /></el-icon>
              <el-icon v-else><Coin /></el-icon>
              {{ resource.price === 0 ? '免费' : resource.price }}
            </span>
          </div>
          
          <!-- 信息区域 -->
          <div class="card-info">
            <h3 class="resource-title" @click="showResourceDetail(resource)">
              {{ resource.title }}
            </h3>
            
            <div class="resource-meta">
              <span class="author">
                <el-avatar 
                  :size="20" 
                  :src="resource.avatar_url || undefined"
                  class="author-avatar"
                >
                  <el-icon><User /></el-icon>
                </el-avatar>
                <span class="author-name">{{ resource.username }}</span>
              </span>
              
              <span class="meta-counts">
                <span class="download-count">
                  <el-icon><Download /></el-icon>
                  {{ formatDownloadCount(resource.download_count) }}
                </span>
                <span class="reference-count" :title="`被引用 ${resource.reference_count || 0} 次`">
                  <el-icon><Link /></el-icon>
                  {{ formatDownloadCount(resource.reference_count || 0) }}
                </span>
              </span>
            </div>
            
            <div class="card-actions">
              <button 
                class="download-btn" 
                @click="handleDownload(resource)"
              >
                <el-icon><Download /></el-icon>
                <span>下载</span>
              </button>
              
              <div class="owner-actions" v-if="userId && resource.uploader_id === userId">
                <button class="icon-btn edit" @click="editResource(resource)">
                  <el-icon><Edit /></el-icon>
                </button>
                <button class="icon-btn delete" @click="confirmDelete(resource)">
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div class="empty-state" v-if="resources.length === 0">
        <div class="empty-illustration">
          <svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
            <rect x="30" y="40" width="60" height="70" rx="8" fill="#ffb7c540" />
            <rect x="110" y="30" width="60" height="80" rx="8" fill="#c9a9e840" />
            <circle cx="60" cy="75" r="12" fill="#ffb7c5" />
            <rect x="130" y="55" width="20" height="30" rx="4" fill="#c9a9e8" />
            <path d="M60,120 L100,105 L140,120" fill="none" stroke="#a8e6cf" stroke-width="2" />
          </svg>
        </div>
        <p class="empty-text">暂无素材，快来上传第一个吧 ✨</p>
      </div>

      <!-- 分页 -->
      <div class="pagination-wrapper" v-if="totalResources > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="totalResources"
          layout="prev, pager, next"
          @current-change="handlePageChange"
          class="custom-pagination"
        />
      </div>
    </div>

    <!-- 详情对话框 -->
    <el-dialog 
      v-model="detailDialogVisible" 
      width="800px"
      class="orange-dialog"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="dialog-header">
          <span class="dialog-title">素材详情</span>
        </div>
      </template>
      
      <div class="resource-detail">
        <div class="detail-media" v-if="getFileType(currentResource.file_url) !== 3">
          <img 
            v-if="getFileType(currentResource.file_url) === 1" 
            :src="`${BASE_URL}${currentResource.file_url}`" 
            class="detail-image"
          />
          <div v-if="getFileType(currentResource.file_url) === 2" class="detail-audio">
            <div class="audio-visualizer">
              <div class="bar" v-for="i in 8" :key="i" :style="{ '--i': i }"></div>
            </div>
            <audio controls class="audio-element">
              <source :src="`${BASE_URL}${currentResource.file_url}`" type="audio/mpeg">
            </audio>
          </div>
        </div>
        <div v-else class="detail-link">
          <el-icon><Link /></el-icon>
          <p>模型仓库地址：</p>
          <a :href="currentResource.file_url" target="_blank">{{ currentResource.file_url }}</a>
        </div>
        
        <div class="detail-info">
          <div class="detail-header">
            <h2>{{ currentResource.title }}</h2>
            <span class="detail-type" :style="{ background: getTypeColor(currentResource.resource_type) }">
              {{ currentResource.resource_type }}
            </span>
          </div>
          
          <p class="detail-description">{{ currentResource.description || '暂无描述' }}</p>
          
          <div class="detail-stats">
            <div class="stat-card">
              <el-icon><User /></el-icon>
              <div class="stat-content">
                <span class="stat-label">作者</span>
                <span class="stat-value">{{ currentResource.username }}</span>
              </div>
            </div>
            <div class="stat-card">
              <el-icon><Download /></el-icon>
              <div class="stat-content">
                <span class="stat-label">下载</span>
                <span class="stat-value">{{ currentResource.download_count }}</span>
              </div>
            </div>
            <div class="stat-card">
              <el-icon><Calendar /></el-icon>
              <div class="stat-content">
                <span class="stat-label">上传</span>
                <span class="stat-value">{{ formatDate(currentResource.created_at) }}</span>
              </div>
            </div>
            <div class="stat-card">
              <el-icon><Link /></el-icon>
              <div class="stat-content">
                <span class="stat-label">被引用</span>
                <span class="stat-value">{{ currentResource.reference_count || 0 }} 次</span>
              </div>
            </div>
            <div class="stat-card">
              <el-icon><Document /></el-icon>
              <div class="stat-content">
                <span class="stat-label">许可</span>
                <span class="stat-value">{{ currentResource.license_type }}</span>
              </div>
            </div>
          </div>
          
          <div class="detail-price">
            <span class="price-label">价格</span>
            <span class="price-value" :class="{ free: currentResource.price === 0 }">
              {{ currentResource.price === 0 ? '免费' : '¥' + currentResource.price }}
            </span>
          </div>
          
          <div class="detail-actions">
            <button class="primary-btn download-btn" @click="handleDownload(currentResource)">
              <el-icon><Download /></el-icon>
              <span>下载素材</span>
            </button>
            <button 
              v-if="userId"
              class="secondary-btn reference-btn"
              @click="openReferenceDialog(currentResource)"
            >
              <el-icon><Link /></el-icon>
              <span>引用到项目</span>
            </button>
            <button 
              v-if="userId && currentResource.uploader_id === userId"
              class="secondary-btn edit-btn"
              @click="editResource(currentResource)"
            >
              <el-icon><Edit /></el-icon>
              <span>编辑</span>
            </button>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 上传/编辑对话框 -->
    <el-dialog 
      v-model="uploadDialogVisible" 
      :title="isEditing ? '编辑素材' : '上传新素材'" 
      style="color: white;"
      width="520px"
      class="orange-dialog"
    >
      <el-form :model="resourceForm" label-position="top" class="upload-form" :rules="formRules" ref="resourceFormRef">
        <el-form-item label="素材名称" prop="title">
          <el-input v-model="resourceForm.title" placeholder="给你的素材起个名字..." />
        </el-form-item>
        
        <el-form-item label="素材描述" prop="description">
          <el-input 
            v-model="resourceForm.description" 
            type="textarea" 
            :rows="3" 
            placeholder="描述一下这个素材..." 
          />
        </el-form-item>
        
        <div class="form-row">
          <el-form-item label="素材类型" prop="resource_type">
            <div class="type-options">
              <span 
                v-for="type in ['角色', '背景', 'CG', '其他']" 
                :key="type"
                class="type-option"
                :class="{ selected: resourceForm.resource_type === type }"
                @click="resourceForm.resource_type = type"
              >
                {{ type }}
              </span>
            </div>
          </el-form-item>
        </div>
        
        <el-form-item label="许可协议" prop="license_type">
          <el-select v-model="resourceForm.license_type" placeholder="选择许可协议">
            <el-option label="CC BY" value="CC BY" />
            <el-option label="CC BY-SA" value="CC BY-SA" />
            <el-option label="CC BY-NC" value="CC BY-NC" />
            <el-option label="商业授权" value="商业授权" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="价格 (¥)" prop="price">
          <el-input-number 
            v-model="resourceForm.price" 
            :min="0" 
            :step="1"
            controls-position="right"
          />
          <span class="price-hint">设为 0 表示免费</span>
        </el-form-item>
        
        <el-form-item label="上传文件" prop="file_url" v-if="!isEditing">
          <el-upload
            class="custom-upload"
            drag
            :action="BASE_URL+'/user/api/upload'"
            :on-success="handleUploadSuccess"
            :before-upload="beforeUpload"
            :show-file-list="false"
          >
            <div class="upload-area">
              <el-icon class="upload-icon"><UploadFilled /></el-icon>
              <p>拖拽或<em>点击上传</em></p>
              <span class="upload-tip">支持图片/音频，不超过10MB</span>
            </div>
          </el-upload>
        </el-form-item>
        
        <el-form-item label="或提供链接" v-if="!isEditing">
          <el-input v-model="resourceForm.file_url" placeholder="输入模型/资源链接地址" />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <button class="dialog-btn cancel" @click="uploadDialogVisible = false">取消</button>
        <button class="dialog-btn confirm" @click="submitResource">
          {{ isEditing ? '保存' : '上传' }}
        </button>
      </template>
    </el-dialog>

    <!-- 支付对话框 -->
    <el-dialog 
      v-model="paymentDialogVisible" 
      width="420px"
      class="orange-dialog payment-dialog"
      :close-on-click-modal="false"
    >
      <div class="payment-container">
        <div class="payment-header">
          <h3>{{ currentResource.title }}</h3>
          <p class="payment-amount">¥{{ currentResource.price?.toFixed(2) }}</p>
        </div>
        
        <div class="payment-tabs">
          <span 
            class="tab" 
            :class="{ active: paymentMethod === 'wechat' }"
            @click="paymentMethod = 'wechat'"
          >
            <el-icon><ChatDotRound /></el-icon>
            微信支付
          </span>
          <span 
            class="tab" 
            :class="{ active: paymentMethod === 'alipay' }"
            @click="paymentMethod = 'alipay'"
          >
            <el-icon><Wallet /></el-icon>
            支付宝
          </span>
        </div>
        
        <div class="qr-code-container">
          <div class="qr-wrapper">
            <canvas ref="wechatQrCode" class="qr-code" v-show="paymentMethod === 'wechat'"></canvas>
            <canvas ref="alipayQrCode" class="qr-code" v-show="paymentMethod === 'alipay'"></canvas>
            
            <div v-if="paymentStatus === 'processing'" class="qr-overlay">
              <el-icon class="spinner"><Loading /></el-icon>
              <p>处理中...</p>
            </div>
            <div v-if="paymentStatus === 'success'" class="qr-overlay success">
              <el-icon><CircleCheckFilled /></el-icon>
              <p>支付成功</p>
            </div>
          </div>
        </div>
        
        <div class="payment-footer">
          <p class="countdown" v-if="paymentStatus === 'scanning'">
            剩余时间: {{ Math.floor(countdown / 60) }}:{{ (countdown % 60).toString().padStart(2, '0') }}
          </p>
          <p class="notice">模拟支付，不会产生真实交易</p>
        </div>
      </div>
      
      <template #footer>
        <button 
          v-if="paymentStatus === 'scanning'" 
          class="dialog-btn confirm" 
          @click="simulateScanSuccess"
        >
          模拟扫码成功
        </button>
        <button 
          v-if="paymentStatus === 'scanning'" 
          class="dialog-btn cancel" 
          @click="cancelPayment"
        >
          取消
        </button>
        <button 
          v-if="paymentStatus === 'success'" 
          class="dialog-btn confirm" 
          @click="completePayment"
        >
          完成
        </button>
      </template>
    </el-dialog>

    <!-- 引用到项目对话框 -->
    <el-dialog 
      v-model="referenceDialogVisible" 
      width="420px"
      class="orange-dialog"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="dialog-header">
          <span class="dialog-title">引用到项目</span>
        </div>
      </template>
      
      <div class="reference-container">
        <p class="reference-tip">
          选择要把「{{ currentResource.title }}」引用到哪个项目：
        </p>
        <el-select 
          v-model="referenceProjectId" 
          placeholder="请选择项目" 
          class="reference-select"
        >
          <el-option 
            v-for="p in myProjects" 
            :key="p.project_id"
            :label="p.title"
            :value="p.project_id"
          />
        </el-select>
        <p v-if="myProjectsLoaded && myProjects.length === 0" class="reference-empty">
          你还没有项目，先去项目页创建一个吧
        </p>
      </div>
      
      <template #footer>
        <button class="dialog-btn cancel" @click="referenceDialogVisible = false">取消</button>
        <button 
          class="dialog-btn confirm" 
          :disabled="!referenceProjectId" 
          @click="submitReference"
        >
          确定引用
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Search, User, Coin, Upload, Download, 
  Calendar, Document, UploadFilled,
  Loading, CircleCheckFilled, Headset, Link,
  Present, Edit, Delete, ChatDotRound, Wallet
} from '@element-plus/icons-vue'
import { jwtDecode } from "jwt-decode"
import { 
  listResources as apiListResources, 
  getResourceDetail, 
  createResource, 
  updateResource, 
  deleteResource,
  searchResources,
  incrementDownloadCount,
  referenceResource
} from '@/api/market'
import { getProjects } from '@/api/project'
import { BASE_URL } from "@/utils/request"
import QRCode from 'qrcode'
import TechNavCircle from '@/components/TechNavCircle.vue'

// 状态
const paymentDialogVisible = ref(false)
const paymentMethod = ref('wechat')
const paymentStatus = ref('scanning')
const countdown = ref(300)
const countdownTimer = ref(null)
const wechatQrCode = ref(null)
const alipayQrCode = ref(null)

const token = localStorage.getItem('token')
const decodedToken = token ? jwtDecode(token) : null
const userId = decodedToken?.identity

const resources = ref([])
const currentPage = ref(1)
const pageSize = ref(12)
const totalResources = ref(0)
const searchKeyword = ref('')
const searchType = ref('')

const detailDialogVisible = ref(false)
const uploadDialogVisible = ref(false)
const referenceDialogVisible = ref(false)
const referenceProjectId = ref(null)
const myProjects = ref([])
const myProjectsLoaded = ref(false)
const currentResource = ref({})
const resourceForm = ref({
  title: '',
  description: '',
  resource_type: '',
  file_url: '',
  price: 0,
  license_type: 'CC BY'
})
const resourceFormRef = ref(null)
const isEditing = ref(false)
const editingResourceId = ref(null)

const formRules = {
  title: [{ required: true, message: '请输入素材名称', trigger: 'blur' }],
  resource_type: [{ required: true, message: '请选择素材类型', trigger: 'change' }],
  license_type: [{ required: true, message: '请选择许可协议', trigger: 'change' }]
}

// 方法
const getFileType = (url) => {
  if (!url) return 3
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.aac', '.flac']
  const lowerUrl = url.toLowerCase()
  if (imageExtensions.some(ext => lowerUrl.endsWith(ext))) return 1
  if (audioExtensions.some(ext => lowerUrl.endsWith(ext))) return 2
  return 3
}

const getTypeColor = (type) => {
  const colors = {
    '角色': '#ffb7c5',
    '背景': '#a8e6cf',
    'CG': '#c9a9e8',
    '其他': '#b8b8b8'
  }
  return colors[type] || '#ffb7c5'
}

const formatDownloadCount = (count) => {
  if (count >= 10000) return (count / 10000).toFixed(1) + 'w'
  if (count >= 1000) return (count / 1000).toFixed(1) + 'k'
  return count.toString()
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}

const fetchResources = async () => {
  try {
    const params = {
      page: currentPage.value,
      per_page: pageSize.value,
      keyword: searchKeyword.value,
      type: searchType.value
    }
    const response = await searchResources(params)
    resources.value = response.data.data.resources
    totalResources.value = response.data.data.total
  } catch (error) {
    ElMessage.error('获取资源列表失败')
  }
}

const handlePageChange = (page) => {
  currentPage.value = page
  fetchResources()
}

const handleSearch = () => {
  currentPage.value = 1
  fetchResources()
}

const showResourceDetail = async (resource) => {
  try {
    const response = await getResourceDetail(resource.resource_id)
    currentResource.value = response.data.data
    detailDialogVisible.value = true
  } catch (error) {
    ElMessage.error('获取资源详情失败')
  }
}

// 打开「引用到项目」对话框：拉取自己的项目列表
const openReferenceDialog = async (resource) => {
  if (!userId) {
    ElMessage.warning('请先登录后再引用')
    return
  }
  currentResource.value = resource
  referenceProjectId.value = null
  referenceDialogVisible.value = true
  try {
    myProjects.value = await getProjects()
  } catch (error) {
    myProjects.value = []
    ElMessage.error('获取项目列表失败')
  } finally {
    myProjectsLoaded.value = true
  }
}

const submitReference = async () => {
  if (!referenceProjectId.value) {
    ElMessage.warning('请先选择目标项目')
    return
  }
  try {
    await referenceResource(currentResource.value.resource_id, referenceProjectId.value)
    ElMessage.success('已引用到项目')
    referenceDialogVisible.value = false
    // 刷新详情中的引用计数与列表卡片
    const detail = await getResourceDetail(currentResource.value.resource_id)
    currentResource.value = detail.data.data
    fetchResources()
  } catch (error) {
    ElMessage.error('引用失败，请确认该项目属于你')
  }
}

const generateQrCode = async () => {
  const text = `payment|${currentResource.value.resource_id}|${Date.now()}`
  if (wechatQrCode.value) {
    await QRCode.toCanvas(wechatQrCode.value, text, { width: 160, margin: 1 })
  }
  if (alipayQrCode.value) {
    await QRCode.toCanvas(alipayQrCode.value, text, { width: 160, margin: 1 })
  }
}

const startCountdown = () => {
  countdown.value = 300
  clearInterval(countdownTimer.value)
  countdownTimer.value = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer.value)
      paymentDialogVisible.value = false
      ElMessage.error('支付超时')
    }
  }, 1000)
}

const simulateScanSuccess = () => {
  paymentStatus.value = 'processing'
  setTimeout(() => {
    paymentStatus.value = 'success'
    clearInterval(countdownTimer.value)
  }, 1500)
}

const completePayment = async () => {
  paymentDialogVisible.value = false
  await proceedDownload(currentResource.value)
  resetPaymentState()
}

const cancelPayment = () => {
  paymentDialogVisible.value = false
  resetPaymentState()
}

const resetPaymentState = () => {
  clearInterval(countdownTimer.value)
  paymentStatus.value = 'scanning'
}

const proceedDownload = async (resource) => {
  try {
    await incrementDownloadCount(resource.resource_id)
    fetchResources()
    const link = document.createElement('a')
    link.href = `${BASE_URL}${resource.file_url}`
    link.download = resource.title
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    ElMessage.success('下载成功')
  } catch (error) {
    ElMessage.error('下载失败')
  }
}

const handleDownload = async (resource) => {
  if (!userId) {
    ElMessage.warning('请先登录后再下载')
    return
  }
  if (resource.price > 0) {
    currentResource.value = resource
    paymentDialogVisible.value = true
    nextTick(() => {
      generateQrCode()
      startCountdown()
    })
    return
  }
  await proceedDownload(resource)
}

const showUploadDialog = () => {
  isEditing.value = false
  resourceForm.value = {
    title: '',
    description: '',
    resource_type: '',
    file_url: '',
    price: 0,
    license_type: 'CC BY'
  }
  uploadDialogVisible.value = true
}

const editResource = (resource) => {
  isEditing.value = true
  editingResourceId.value = resource.resource_id
  resourceForm.value = {
    title: resource.title,
    description: resource.description,
    resource_type: resource.resource_type,
    file_url: resource.file_url,
    price: parseFloat(resource.price) || 0,
    license_type: resource.license_type
  }
  uploadDialogVisible.value = true
  detailDialogVisible.value = false
}

const submitResource = async () => {
  try {
    await resourceFormRef.value.validate()
    if (isEditing.value) {
      await updateResource(editingResourceId.value, resourceForm.value)
      ElMessage.success('素材更新成功')
    } else {
      await createResource(resourceForm.value)
      ElMessage.success('素材上传成功')
    }
    uploadDialogVisible.value = false
    fetchResources()
  } catch (error) {
    ElMessage.error((isEditing.value ? '更新' : '上传') + '失败')
  }
}

const confirmDelete = (resource) => {
  ElMessageBox.confirm(`确定要删除"${resource.title}"吗？`, '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await deleteResource(resource.resource_id)
      ElMessage.success('删除成功')
      fetchResources()
    } catch (error) {
      // 后端会说明「仍被 N 处引用」，这里原样展示，别吞成笼统的「删除失败」
      const msg = (error && error.response && error.response.data && error.response.data.message)
        || (error && error.message)
        || '删除失败'
      ElMessage.error(msg)
    }
  }).catch(() => {})
}

const handleUploadSuccess = (response) => {
  if (response.code === 200) {
    resourceForm.value.file_url = response.data.file_url
    ElMessage.success('上传成功')
  } else {
    ElMessage.error('上传失败')
  }
}

const beforeUpload = (file) => {
  const isValid = file.type.startsWith('image/') || file.type.startsWith('audio/')
  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isValid) {
    ElMessage.error('只能上传图片或音频')
    return false
  }
  if (!isLt10M) {
    ElMessage.error('文件不能超过10MB')
    return false
  }
  return true
}

watch(paymentMethod, () => {
  paymentStatus.value = 'scanning'
})

onMounted(() => {
  fetchResources()
})
</script>

<style scoped lang="scss">
// 样式变量
$bg-primary: #1a1a2e;
$bg-secondary: #16213e;
$pink: #ffb7c5;
$purple: #c9a9e8;
$mint: #a8e6cf;
$warm: #ffe6b0;
$border-light: rgba(255, 255, 255, 0.08);
$text-primary: #ffffff;
$text-secondary: #9ca3af;

.orange-market {
  min-height: 100vh;
  background: linear-gradient(135deg, $bg-primary 0%, $bg-secondary 100%);
  padding: 80px 24px 40px;
}

.market-container {
  max-width: 1400px;
  margin: 0 auto;
}

// 头部
.market-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  
  .header-left {
    .market-title {
      display: flex;
      align-items: baseline;
      gap: 16px;
      margin: 0 0 8px;
      
      .title-main {
        font-size: 42px;
        font-weight: 700;
        background: linear-gradient(135deg, $pink, $purple);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      
      .title-sub {
        font-size: 20px;
        color: $mint;
        font-weight: 400;
      }
    }
    
    .market-desc {
      margin: 0;
      color: $text-secondary;
      font-size: 15px;
      letter-spacing: 1px;
    }
  }
  
  .upload-work-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 28px;
    background: linear-gradient(135deg, $pink, $purple);
    border: none;
    border-radius: 50px;
    color: white;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 4px 20px rgba(255, 183, 197, 0.3);
    
    &:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 30px rgba(255, 183, 197, 0.4);
    }
  }
}

// 搜索区域
.search-section {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
  border: 1px solid $border-light;
  border-radius: 60px;
  padding: 8px 8px 8px 24px;
  margin-bottom: 40px;
  
  .search-wrapper {
    display: flex;
    align-items: center;
    gap: 16px;
    
    .search-input {
      flex: 1;
      
      :deep(.el-input__wrapper) {
        background: transparent;
        border: none;
        box-shadow: none;
        padding: 12px 0;
        
        .el-input__inner {
          color: $text-primary;
          font-size: 15px;
          
          &::placeholder {
            color: $text-secondary;
          }
        }
        
        .el-input__prefix {
          color: $pink;
        }
      }
    }
    
    .filter-group {
      display: flex;
      align-items: center;
      gap: 12px;
      
      .type-select {
        width: 140px;
        
        :deep(.el-input__wrapper) {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid $border-light;
          border-radius: 40px;
          box-shadow: none;
          
          .el-input__inner {
            color: $text-primary;
          }
        }
      }
      
      .search-btn {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: linear-gradient(135deg, $pink, $purple);
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s;
        
        &:hover {
          transform: scale(1.05);
        }
      }
    }
  }
  
  .stats-info {
    padding: 8px 0 0;
    
    .stat-item {
      color: $text-secondary;
      font-size: 13px;
      
      .stat-value {
        color: $pink;
        font-weight: 600;
        margin-right: 4px;
      }
    }
  }
}

// 资源网格
.resource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 24px;
  margin-bottom: 40px;
}

.resource-card {
  background: linear-gradient(135deg, 
    rgba(255, 183, 197, 0.08) 0%, 
    rgba(201, 169, 232, 0.08) 100%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 183, 197, 0.15);
  border-radius: 20px;
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  animation: fadeInUp 0.5s ease forwards;
  animation-delay: var(--delay);
  opacity: 0;
  
  &:hover {
    transform: translateY(-8px);
    border-color: rgba(255, 183, 197, 0.4);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 
                0 0 30px rgba(255, 183, 197, 0.15);
    background: linear-gradient(135deg, 
      rgba(255, 183, 197, 0.12) 0%, 
      rgba(201, 169, 232, 0.12) 100%);
    
    .cover-image {
      transform: scale(1.05);
    }
  }
  
  .card-cover {
    height: 200px;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    background: linear-gradient(135deg, 
      rgba(26, 26, 46, 0.6) 0%, 
      rgba(22, 33, 62, 0.6) 100%);
    
    .cover-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.4s;
    }
    
    .cover-audio {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, 
        rgba(255, 183, 197, 0.15) 0%, 
        rgba(201, 169, 232, 0.15) 100%);
      
      .audio-icon {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: rgba(255, 183, 197, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        color: $pink;
        margin-bottom: 12px;
        border: 1px solid rgba(255, 183, 197, 0.3);
      }
      
      .audio-player {
        width: 90%;
        height: 36px;
        
        &::-webkit-media-controls-panel {
          background: rgba(255, 255, 255, 0.1);
        }
      }
    }
    
    .cover-other {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, 
        rgba(168, 230, 207, 0.1) 0%, 
        rgba(255, 230, 176, 0.1) 100%);
      
      .other-icon {
        font-size: 40px;
        color: $mint;
        margin-bottom: 8px;
        opacity: 0.8;
      }
      
      .other-label {
        color: $text-secondary;
        font-size: 13px;
      }
    }
    
    .type-badge {
      position: absolute;
      top: 12px;
      left: 12px;
      padding: 4px 12px;
      border-radius: 30px;
      font-size: 11px;
      font-weight: 500;
      color: white;
      backdrop-filter: blur(4px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .price-badge {
      position: absolute;
      top: 12px;
      right: 12px;
      padding: 4px 12px;
      border-radius: 30px;
      background: rgba(26, 26, 46, 0.7);
      backdrop-filter: blur(8px);
      font-size: 13px;
      font-weight: 600;
      color: $warm;
      display: flex;
      align-items: center;
      gap: 4px;
      border: 1px solid rgba(255, 230, 176, 0.3);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      
      &.free {
        color: $mint;
        border-color: rgba(168, 230, 207, 0.3);
      }
    }
  }
  
  .card-info {
    padding: 16px;
    background: linear-gradient(180deg, 
      rgba(26, 26, 46, 0.3) 0%, 
      rgba(26, 26, 46, 0.5) 100%);
    
    .resource-title {
      margin: 0 0 12px;
      color: $text-primary;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.4;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      
      &:hover {
        color: $pink;
      }
    }
    
    .resource-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      
      .author {
        display: flex;
        align-items: center;
        gap: 8px;
        
        .author-avatar {
          border: 1px solid rgba(255, 183, 197, 0.3);
          background: rgba(255, 183, 197, 0.1);
        }
        
        .author-name {
          color: $text-secondary;
          font-size: 13px;
        }
      }
      
      .meta-counts {
        display: flex;
        align-items: center;
        gap: 10px;
        
        .download-count,
        .reference-count {
          display: flex;
          align-items: center;
          gap: 4px;
          color: $text-secondary;
          font-size: 12px;
        }
        
        .reference-count {
          color: $mint;
        }
      }
    }
    
    .card-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      
      .download-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px;
        background: linear-gradient(135deg, 
          rgba(255, 183, 197, 0.8) 0%, 
          rgba(201, 169, 232, 0.8) 100%);
        border: none;
        border-radius: 30px;
        color: white;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(255, 183, 197, 0.2);
        
        &:hover {
          opacity: 1;
          background: linear-gradient(135deg, $pink, $purple);
          box-shadow: 0 6px 16px rgba(255, 183, 197, 0.3);
        }
      }
      
      .owner-actions {
        display: flex;
        gap: 6px;
        
        .icon-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid $border-light;
          color: $text-secondary;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          
          &:hover {
            background: rgba(255, 255, 255, 0.1);
            color: $text-primary;
          }
          
          &.delete:hover {
            background: rgba(255, 107, 107, 0.2);
            color: #ff6b6b;
            border-color: rgba(255, 107, 107, 0.5);
          }
        }
      }
    }
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// 空状态
.empty-state {
  text-align: center;
  padding: 60px 20px;
  
  .empty-illustration {
    width: 200px;
    margin: 0 auto 24px;
    opacity: 0.7;
  }
  
  .empty-text {
    color: $text-secondary;
    font-size: 16px;
  }
}

// 分页
.pagination-wrapper {
  display: flex;
  justify-content: center;
  
  :deep(.el-pagination) {
    --el-pagination-bg-color: transparent;
    --el-pagination-button-bg-color: rgba(255, 255, 255, 0.05);
    --el-pagination-text-color: #{$text-secondary};
    --el-pagination-hover-color: #{$pink};
    
    .el-pager li {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid $border-light;
      border-radius: 12px;
      
      &:hover {
        color: $pink;
      }
      
      &.is-active {
        background: linear-gradient(135deg, $pink, $purple);
        border-color: transparent;
        color: white;
      }
    }
    
    .btn-prev, .btn-next {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid $border-light;
      border-radius: 12px;
      color: $text-secondary;
      
      &:hover {
        color: $pink;
      }
    }
  }
}

// 对话框
:deep(.el-dialog.orange-dialog) {
  background: linear-gradient(135deg, 
    rgba(26, 26, 46, 0.98) 0%, 
    rgba(22, 33, 62, 0.98) 100%);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 183, 197, 0.2);
  border-radius: 24px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);

  .el-dialog__header {
    padding: 20px 24px 0;
    border-bottom: none;
    
    .dialog-header {
      .dialog-title {
        color: $text-primary;
        font-size: 20px;
        font-weight: 600;
      }
    }
    
    .el-dialog__headerbtn {
      .el-dialog__close {
        color: $text-secondary;
        
        &:hover {
          color: $pink;
        }
      }
    }
  }
  
  .el-dialog__body {
    padding: 24px;
  }
  
  .el-dialog__footer {
    padding: 0 24px 24px;
  }
}

// 详情页
.resource-detail {
  display: flex;
  gap: 30px;
  
  .detail-media {
    flex: 1;
    
    .detail-image {
      width: 100%;
      max-height: 400px;
      object-fit: contain;
      border-radius: 16px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid $border-light;
    }
    
    .detail-audio {
      .audio-visualizer {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 6px;
        height: 100px;
        margin-bottom: 24px;
        
        .bar {
          width: 6px;
          background: linear-gradient(180deg, $pink, $purple);
          border-radius: 3px;
          animation: audioBar 1s ease-in-out infinite;
          animation-delay: calc(var(--i) * 0.1s);
          height: calc(30px + var(--i) * 8px);
        }
      }
      
      .audio-element {
        width: 100%;
        
        &::-webkit-media-controls-panel {
          background: rgba(255, 255, 255, 0.05);
        }
      }
    }
  }
  
  .detail-link {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 16px;
    border: 1px solid $border-light;
    
    .el-icon {
      font-size: 48px;
      color: $mint;
      margin-bottom: 16px;
    }
    
    p {
      color: $text-secondary;
      margin-bottom: 8px;
    }
    
    a {
      color: $pink;
      text-decoration: none;
      word-break: break-all;
      
      &:hover {
        text-decoration: underline;
      }
    }
  }
  
  .detail-info {
    flex: 1;
    
    .detail-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
      
      h2 {
        margin: 0;
        color: $text-primary;
        font-size: 24px;
      }
      
      .detail-type {
        padding: 4px 14px;
        border-radius: 30px;
        font-size: 13px;
        color: white;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }
    }
    
    .detail-description {
      color: $text-secondary;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    
    .detail-stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 24px;
      
      .stat-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid $border-light;
        border-radius: 14px;
        
        .el-icon {
          font-size: 22px;
          color: $pink;
        }
        
        .stat-content {
          display: flex;
          flex-direction: column;
          
          .stat-label {
            font-size: 11px;
            color: $text-secondary;
          }
          
          .stat-value {
            font-size: 15px;
            color: $text-primary;
            font-weight: 500;
          }
        }
      }
    }
    
    .detail-price {
      display: flex;
      align-items: baseline;
      gap: 16px;
      margin-bottom: 24px;
      padding: 16px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 14px;
      border: 1px solid $border-light;
      
      .price-label {
        color: $text-secondary;
        font-size: 14px;
      }
      
      .price-value {
        font-size: 28px;
        font-weight: 700;
        color: $warm;
        
        &.free {
          color: $mint;
        }
      }
    }
    
    .detail-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      
      .primary-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 14px;
        background: linear-gradient(135deg, $pink, $purple);
        border: none;
        border-radius: 40px;
        color: white;
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s;
        box-shadow: 0 4px 15px rgba(255, 183, 197, 0.3);
        
        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(255, 183, 197, 0.4);
        }
      }
      
      .secondary-btn {
        padding: 14px 24px;
        background: transparent;
        border: 1px solid $border-light;
        border-radius: 40px;
        color: $text-secondary;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
        
        &:hover {
          background: rgba(255, 255, 255, 0.05);
          color: $text-primary;
          border-color: rgba(255, 183, 197, 0.3);
        }
      }
      
      .reference-btn {
        &:hover {
          color: $mint;
          border-color: rgba(168, 230, 207, 0.4);
        }
      }
    }
  }
}

// 引用到项目对话框
.reference-container {
  .reference-tip {
    color: $text-secondary;
    font-size: 14px;
    line-height: 1.6;
    margin: 0 0 16px;
  }
  
  .reference-select {
    width: 100%;
    
    :deep(.el-input__wrapper) {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid $border-light;
      border-radius: 12px;
      box-shadow: none;
      
      &:hover, &.is-focus {
        border-color: $pink;
      }
      
      .el-input__inner {
        color: $text-primary;
      }
    }
  }
  
  .reference-empty {
    margin: 12px 0 0;
    color: $text-secondary;
    font-size: 13px;
  }
}

@keyframes audioBar {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.8); }
}

// 上传表单
.upload-form {
  :deep(.el-form-item__label) {
    color: $text-secondary;
    font-weight: 500;
  }
  
  :deep(.el-input__wrapper) {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid $border-light;
    border-radius: 12px;
    box-shadow: none;
    
    &:hover, &.is-focus {
      border-color: $pink;
    }
    
    .el-input__inner {
      color: $text-primary;
      
      &::placeholder {
        color: $text-secondary;
      }
    }
  }
  
  :deep(.el-textarea__inner) {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid $border-light;
    border-radius: 12px;
    color: $text-primary;
    
    &:hover, &:focus {
      border-color: $pink;
    }
  }
  
  :deep(.el-select) {
    .el-input__wrapper {
      background: rgba(255, 255, 255, 0.05);
    }
  }
  
  :deep(.el-input-number) {
    .el-input__wrapper {
      background: rgba(255, 255, 255, 0.05);
    }
  }
  
  .type-options {
    display: flex;
    gap: 12px;
    
    .type-option {
      flex: 1;
      padding: 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid $border-light;
      border-radius: 30px;
      color: $text-secondary;
      font-size: 14px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      
      &:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      
      &.selected {
        background: linear-gradient(135deg, $pink, $purple);
        border-color: transparent;
        color: white;
      }
    }
  }
  
  .price-hint {
    margin-left: 12px;
    color: $text-secondary;
    font-size: 12px;
  }
  
  .custom-upload {
    :deep(.el-upload-dragger) {
      background: rgba(255, 255, 255, 0.03);
      border: 2px dashed $border-light;
      border-radius: 16px;
      
      &:hover {
        border-color: $pink;
      }
    }
    
    .upload-area {
      padding: 30px;
      
      .upload-icon {
        font-size: 40px;
        color: $pink;
        margin-bottom: 12px;
      }
      
      p {
        color: $text-secondary;
        margin: 8px 0;
        
        em {
          color: $pink;
          font-style: normal;
        }
      }
      
      .upload-tip {
        font-size: 12px;
        color: $text-secondary;
      }
    }
  }
}

// 对话框按钮
.dialog-btn {
  padding: 10px 28px;
  border-radius: 30px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  border: none;
  
  &.cancel {
    background: transparent;
    border: 1px solid $border-light;
    color: $text-secondary;
    
    &:hover {
      background: rgba(255, 255, 255, 0.05);
      color: $text-primary;
    }
  }
  
  &.confirm {
    background: linear-gradient(135deg, $pink, $purple);
    color: white;
    margin-left: 12px;
    box-shadow: 0 4px 15px rgba(255, 183, 197, 0.3);
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(255, 183, 197, 0.4);
    }
  }
}

// 支付对话框
:deep(.el-dialog.orange-dialog.payment-dialog) {
  .payment-container {
    padding: 0 10px;
  }

  .payment-header {
    text-align: center;
    margin-bottom: 20px;

    h3 {
      margin: 0;
      color: $text-primary;
      font-size: 16px;
    }

    .payment-amount {
      font-size: 32px;
      font-weight: 700;
      color: $warm;
      margin: 10px 0 0;
    }
  }

  .payment-tabs {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;

    .tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid $border-light;
      border-radius: 40px;
      color: $text-secondary;
      cursor: pointer;
      transition: all 0.2s;

      &.active {
        background: linear-gradient(135deg, $pink, $purple);
        border-color: transparent;
        color: white;
      }

      &:hover:not(.active) {
        background: rgba(255, 255, 255, 0.06);
      }
    }
  }

  .qr-code-container {
    display: flex;
    justify-content: center;

    .qr-wrapper {
      position: relative;
      width: 200px;
      height: 200px;
      background: white;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20 rgba(0, 0, 0, 0.3);

      .qr-code {
        width: 180px;
        height: 180px;
      }

      .qr-overlay {
        position: absolute;
        inset: 0;
        background: rgba(26, 26, 46, 0.9);
        backdrop-filter: blur(4px);
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;

        .el-icon {
          font-size: 40px;
          margin-bottom: 8px;
        }

        &.success {
          background: rgba(168, 230, 207, 0.15);

          .el-icon {
            color: $mint;
          }
        }

        .spinner {
          animation: rotate 1s linear infinite;
        }
      }
    }
  }

  .payment-footer {
    text-align: center;
    margin-top: 20px;

    .countdown {
      color: $pink;
      font-weight: 600;
    }

    .notice {
      color: $text-secondary;
      font-size: 12px;
    }
  }
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

// 响应式
@media (max-width: 768px) {
  .orange-market {
    padding: 70px 16px 30px;
  }
  
  .market-header {
    flex-direction: column;
    gap: 20px;
    
    .header-left .market-title {
      .title-main {
        font-size: 32px;
      }
      
      .title-sub {
        font-size: 16px;
      }
    }
    
    .upload-work-btn {
      width: 100%;
      justify-content: center;
    }
  }
  
  .search-section {
    border-radius: 30px;
    padding: 16px;
    
    .search-wrapper {
      flex-direction: column;
      
      .filter-group {
        width: 100%;
        
        .type-select {
          flex: 1;
        }
      }
    }
  }
  
  .resource-grid {
    grid-template-columns: 1fr;
  }
  
  .resource-detail {
    flex-direction: column;
  }
}
</style>

<style lang="scss">
/* el-dialog 会 teleport 到 body，scoped 的 :deep 选不中，这里用全局样式兜底：
   上传素材表单较长（约 1100px），在 1000px 高的窗口里底部按钮会被顶出视口。 */
.el-dialog.orange-dialog {
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  margin-top: 5vh !important;
  margin-bottom: 5vh !important;
}

.el-dialog.orange-dialog .el-dialog__body {
  overflow-y: auto;
  max-height: calc(90vh - 150px);
}

.el-dialog.orange-dialog .el-dialog__footer {
  flex: 0 0 auto;
}
</style>