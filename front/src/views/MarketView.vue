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
        <ResourceCard
          v-for="resource in resources"
          :key="resource.resource_id"
          :resource="resource"
          :user-id="userId"
          @detail="showResourceDetail(resource)"
          @download="handleDownload(resource)"
          @edit="editResource(resource)"
          @remove="confirmDelete(resource)"
        />
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

    <ResourceDetailDialog
      v-model:visible="detailDialogVisible"
      :resource="currentResource"
      :user-id="userId"
      @download="handleDownload(currentResource)"
      @reference="openReferenceDialog(currentResource)"
      @import-asset="openImportDialog(currentResource)"
      @edit="editResource(currentResource)"
    />

    <ResourceUploadDialog
      v-model:visible="uploadDialogVisible"
      :editing-resource="editingResource"
      @submitted="fetchResources"
    />

    <PaymentDialog
      v-model:visible="paymentDialogVisible"
      :resource="currentResource"
      @paid="proceedDownload(currentResource)"
    />

    <ReferenceProjectDialog
      v-model:visible="referenceDialogVisible"
      mode="reference"
      :resource="currentResource"
      :projects="myProjects"
      :projects-loaded="myProjectsLoaded"
      :submitting="referencing"
      @confirm="submitReference"
    />

    <ReferenceProjectDialog
      v-model:visible="importDialogVisible"
      mode="import"
      :resource="importTarget"
      :projects="myProjects"
      :projects-loaded="myProjectsLoaded"
      :submitting="importing"
      @confirm="submitImport"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Upload } from '@element-plus/icons-vue'
import { jwtDecode } from 'jwt-decode'
import {
  deleteResource,
  getResourceDetail,
  incrementDownloadCount,
  referenceResource,
  searchResources
} from '@/api/market'
import type { Resource } from '@/api/market'
import { importMarketAsset } from '@/api/asset'
import { getProjects } from '@/api/project'
import type { Project } from '@/api/project'
import { BASE_URL } from '@/utils/request'
import TechNavCircle from '@/components/TechNavCircle.vue'
import ResourceCard from '@/components/market/ResourceCard.vue'
import ResourceDetailDialog from '@/components/market/ResourceDetailDialog.vue'
import ResourceUploadDialog from '@/components/market/ResourceUploadDialog.vue'
import PaymentDialog from '@/components/market/PaymentDialog.vue'
import ReferenceProjectDialog from '@/components/market/ReferenceProjectDialog.vue'

const userId = (() => {
  try {
    const token = localStorage.getItem('token') || ''
    const decoded = token ? jwtDecode<{ identity?: string | number }>(token) : null
    return decoded?.identity ?? null
  } catch {
    return null
  }
})()

const resources = ref<Resource[]>([])
const currentPage = ref(1)
const pageSize = ref(12)
const totalResources = ref(0)
const searchKeyword = ref('')
const searchType = ref('')

const currentResource = ref<Resource>({})
const detailDialogVisible = ref(false)

const uploadDialogVisible = ref(false)
const editingResource = ref<Resource | null>(null)

const paymentDialogVisible = ref(false)

const referenceDialogVisible = ref(false)
const importDialogVisible = ref(false)
const importTarget = ref<Resource | null>(null)
const myProjects = ref<Project[]>([])
const myProjectsLoaded = ref(false)
const referencing = ref(false)
const importing = ref(false)

const fetchResources = async () => {
  try {
    const response: any = await searchResources({
      page: currentPage.value,
      per_page: pageSize.value,
      keyword: searchKeyword.value,
      type: searchType.value
    })
    const payload = response?.data?.data ?? {}
    resources.value = payload.resources ?? []
    totalResources.value = payload.total ?? 0
  } catch (error) {
    ElMessage.error('获取资源列表失败')
  }
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchResources()
}

const handleSearch = () => {
  currentPage.value = 1
  fetchResources()
}

const showResourceDetail = async (resource: Resource) => {
  try {
    const detail: any = await getResourceDetail(resource.resource_id)
    currentResource.value = detail?.data?.data ?? resource
    detailDialogVisible.value = true
  } catch (error) {
    ElMessage.error('获取资源详情失败')
  }
}

const refreshCurrentResource = async () => {
  const resourceId = currentResource.value.resource_id
  if (!resourceId) return
  const detail: any = await getResourceDetail(resourceId).catch(() => null)
  if (detail?.data?.data) currentResource.value = detail.data.data
}

const loadMyProjects = async () => {
  try {
    myProjects.value = await getProjects()
  } catch (error) {
    myProjects.value = []
    ElMessage.error('获取项目列表失败')
  } finally {
    myProjectsLoaded.value = true
  }
}

const openReferenceDialog = async (resource: Resource) => {
  if (!userId) {
    ElMessage.warning('请先登录后再引用')
    return
  }
  currentResource.value = resource
  referenceDialogVisible.value = true
  await loadMyProjects()
}

const submitReference = async (projectId: number) => {
  referencing.value = true
  try {
    await referenceResource(currentResource.value.resource_id, projectId)
    ElMessage.success('已引用到项目')
    referenceDialogVisible.value = false
    await refreshCurrentResource()
    fetchResources()
  } catch (error) {
    ElMessage.error('引用失败，请确认该项目属于你')
  } finally {
    referencing.value = false
  }
}

const openImportDialog = async (resource: Resource) => {
  if (!userId) {
    ElMessage.warning('请先登录后再入库')
    return
  }
  importTarget.value = resource
  importDialogVisible.value = true
  await loadMyProjects()
}

const submitImport = async (projectId: number) => {
  const target = importTarget.value
  if (!target?.resource_id) {
    ElMessage.warning('请先选择目标项目')
    return
  }
  importing.value = true
  try {
    await importMarketAsset(Number(projectId), target.resource_id)
    ElMessage.success('已入库到项目素材，可在创作页「素材」里拖拽使用')
    importDialogVisible.value = false
    fetchResources()
    if (detailDialogVisible.value) await refreshCurrentResource()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '入库失败')
  } finally {
    importing.value = false
  }
}

const proceedDownload = async (resource: Resource) => {
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

const handleDownload = async (resource: Resource) => {
  if (!userId) {
    ElMessage.warning('请先登录后再下载')
    return
  }
  if (Number(resource.price) > 0) {
    currentResource.value = resource
    paymentDialogVisible.value = true
    return
  }
  await proceedDownload(resource)
}

const showUploadDialog = () => {
  editingResource.value = null
  uploadDialogVisible.value = true
}

const editResource = (resource: Resource) => {
  detailDialogVisible.value = false
  editingResource.value = resource
  uploadDialogVisible.value = true
}

const confirmDelete = (resource: Resource) => {
  ElMessageBox.confirm(`确定要删除"${resource.title}"吗？`, '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await deleteResource(resource.resource_id)
      ElMessage.success('删除成功')
      fetchResources()
    } catch (error: any) {
      // 后端会说明「仍被 N 处引用」，这里原样展示，别吞成笼统的「删除失败」
      const msg = error?.response?.data?.message || error?.message || '删除失败'
      ElMessage.error(msg)
    }
  }).catch(() => {})
}

onMounted(() => {
  fetchResources()
})
</script>

<style scoped lang="scss" src="./market/marketShell.scss"></style>
<style scoped lang="scss" src="./market/marketGrid.scss"></style>
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
