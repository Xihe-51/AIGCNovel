<template>
  <el-dialog
    v-model="visibleModel"
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
      <div class="detail-media" v-if="fileType !== 3">
        <img
          v-if="fileType === 1"
          :src="`${BASE_URL}${resource.file_url}`"
          class="detail-image"
        />
        <div v-if="fileType === 2" class="detail-audio">
          <div class="audio-visualizer">
            <div class="bar" v-for="i in 8" :key="i" :style="{ '--i': i }"></div>
          </div>
          <audio controls class="audio-element">
            <source :src="`${BASE_URL}${resource.file_url}`" type="audio/mpeg">
          </audio>
        </div>
      </div>
      <div v-else class="detail-link">
        <el-icon><Link /></el-icon>
        <p>模型仓库地址：</p>
        <a :href="resource.file_url" target="_blank">{{ resource.file_url }}</a>
      </div>

      <div class="detail-info">
        <div class="detail-header">
          <h2>{{ resource.title }}</h2>
          <span class="detail-type" :style="{ background: getTypeColor(resource.resource_type) }">
            {{ resource.resource_type }}
          </span>
        </div>

        <p class="detail-description">{{ resource.description || '暂无描述' }}</p>

        <div class="detail-stats">
          <div class="stat-card">
            <el-icon><User /></el-icon>
            <div class="stat-content">
              <span class="stat-label">作者</span>
              <span class="stat-value">{{ resource.username }}</span>
            </div>
          </div>
          <div class="stat-card">
            <el-icon><Download /></el-icon>
            <div class="stat-content">
              <span class="stat-label">下载</span>
              <span class="stat-value">{{ resource.download_count }}</span>
            </div>
          </div>
          <div class="stat-card">
            <el-icon><Calendar /></el-icon>
            <div class="stat-content">
              <span class="stat-label">上传</span>
              <span class="stat-value">{{ formatMarketDate(resource.created_at) }}</span>
            </div>
          </div>
          <div class="stat-card">
            <el-icon><Link /></el-icon>
            <div class="stat-content">
              <span class="stat-label">被引用</span>
              <span class="stat-value">{{ resource.reference_count || 0 }} 次</span>
            </div>
          </div>
          <div class="stat-card">
            <el-icon><Document /></el-icon>
            <div class="stat-content">
              <span class="stat-label">许可</span>
              <span class="stat-value">{{ resource.license_type }}</span>
            </div>
          </div>
        </div>

        <div class="detail-price">
          <span class="price-label">价格</span>
          <span class="price-value" :class="{ free: resource.price === 0 }">
            {{ resource.price === 0 ? '免费' : '¥' + resource.price }}
          </span>
        </div>

        <div class="detail-actions">
          <button class="primary-btn download-btn" @click="emit('download')">
            <el-icon><Download /></el-icon>
            <span>下载素材</span>
          </button>
          <button
            v-if="isLoggedIn"
            class="secondary-btn reference-btn"
            @click="emit('reference')"
          >
            <el-icon><Link /></el-icon>
            <span>引用到项目</span>
          </button>
          <button
            v-if="isLoggedIn"
            class="secondary-btn reference-btn"
            @click="emit('import-asset')"
          >
            <el-icon><FolderAdd /></el-icon>
            <span>入库到项目</span>
          </button>
          <button
            v-if="isOwner"
            class="secondary-btn edit-btn"
            @click="emit('edit')"
          >
            <el-icon><Edit /></el-icon>
            <span>编辑</span>
          </button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Calendar, Document, Download, Edit, FolderAdd, Link, User } from '@element-plus/icons-vue'
import type { Resource } from '@/api/market'
import { BASE_URL } from '@/utils/request'
import { formatMarketDate, getFileType, getTypeColor } from '@/utils/market'

const props = defineProps<{
  visible: boolean
  resource: Resource
  userId?: number | string | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'download'): void
  (e: 'reference'): void
  (e: 'import-asset'): void
  (e: 'edit'): void
}>()

const visibleModel = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value)
})

const fileType = computed(() => getFileType(props.resource.file_url))
const isLoggedIn = computed(() => Boolean(props.userId))
const isOwner = computed(() => Boolean(props.userId) && props.resource.uploader_id === props.userId)
</script>

<style scoped lang="scss" src="./resourceDetailDialog.scss"></style>
