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
              v-if="userId"
              class="secondary-btn reference-btn"
              @click="openImportDialog(currentResource)"
            >
              <el-icon><FolderAdd /></el-icon>
              <span>入库到项目</span>
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

    <!-- 素材入库对话框 -->
    <el-dialog
      v-model="importDialogVisible"
      width="420px"
      class="orange-dialog"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="dialog-header">
          <span class="dialog-title">入库到项目</span>
        </div>
      </template>

      <div class="reference-container">
        <p class="reference-tip">
          把「{{ importTarget?.title }}」复制到项目素材目录，之后可在创作页「素材」里直接拖到场景：
        </p>
        <el-select
          v-model="importProjectId"
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
        <button class="dialog-btn cancel" @click="importDialogVisible = false">取消</button>
        <button
          class="dialog-btn confirm"
          :disabled="!importProjectId || importing"
          @click="submitImport"
        >
          {{ importing ? '入库中…' : '确定入库' }}
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
  Present, Edit, Delete, ChatDotRound, Wallet, FolderAdd
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
const importDialogVisible = ref(false)
const importProjectId = ref(null)
const importTarget = ref(null)
const importing = ref(false)
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

// 打开「入库到项目」对话框：把市场素材复制到项目素材目录
const openImportDialog = async (resource) => {
  if (!userId) {
    ElMessage.warning('请先登录后再入库')
    return
  }
  importTarget.value = resource
  importProjectId.value = null
  importDialogVisible.value = true
  try {
    myProjects.value = await getProjects()
  } catch (error) {
    myProjects.value = []
    ElMessage.error('获取项目列表失败')
  } finally {
    myProjectsLoaded.value = true
  }
}

const submitImport = async () => {
  if (!importProjectId.value || !importTarget.value) {
    ElMessage.warning('请先选择目标项目')
    return
  }
  importing.value = true
  try {
    await importMarketAsset(Number(importProjectId.value), importTarget.value.resource_id)
    ElMessage.success('已入库到项目素材，可在创作页「素材」里拖拽使用')
    importDialogVisible.value = false
    fetchResources()
    if (detailDialogVisible.value) {
      const detail = await getResourceDetail(importTarget.value.resource_id)
      currentResource.value = detail.data.data
    }
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '入库失败')
  } finally {
    importing.value = false
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

<style scoped lang="scss" src="./market/marketShell.scss"></style>
<style scoped lang="scss" src="./market/marketGrid.scss"></style>
<style scoped lang="scss" src="./market/marketDialogs.scss"></style>
<style scoped lang="scss" src="./market/marketResponsive.scss"></style>

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
