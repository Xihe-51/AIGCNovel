<template>
  <div class="resource-card" :style="{ '--delay': delay }">
    <div class="card-cover" @click="emit('detail')">
      <img
        v-if="fileType === 1"
        :src="`${BASE_URL}${resource.file_url}`"
        class="cover-image"
        alt="resource cover"
      />

      <div v-else-if="fileType === 2" class="cover-audio">
        <div class="audio-icon">
          <el-icon><Headset /></el-icon>
        </div>
        <audio controls preload="none" class="audio-player">
          <source :src="`${BASE_URL}${resource.file_url}`" :type="audioMimeType">
        </audio>
      </div>

      <div v-else class="cover-other" @click="emit('detail')">
        <div class="other-icon">
          <el-icon><Link /></el-icon>
        </div>
        <span class="other-label">模型链接</span>
      </div>

      <span class="type-badge" :style="{ background: getTypeColor(resource.resource_type) }">
        {{ resource.resource_type }}
      </span>

      <span class="price-badge" :class="{ free: resource.price === 0 }">
        <el-icon v-if="resource.price === 0"><Present /></el-icon>
        <el-icon v-else><Coin /></el-icon>
        {{ resource.price === 0 ? '免费' : resource.price }}
      </span>
    </div>

    <div class="card-info">
      <h3 class="resource-title" @click="emit('detail')">
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
        <button class="download-btn" @click="emit('download')">
          <el-icon><Download /></el-icon>
          <span>下载</span>
        </button>

        <div class="owner-actions" v-if="isOwner">
          <button class="icon-btn edit" @click="emit('edit')">
            <el-icon><Edit /></el-icon>
          </button>
          <button class="icon-btn delete" @click="emit('remove')">
            <el-icon><Delete /></el-icon>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Coin, Delete, Download, Edit, Headset, Link, Present, User } from '@element-plus/icons-vue'
import type { Resource } from '@/api/market'
import { BASE_URL } from '@/utils/request'
import { formatDownloadCount, getAudioMimeType, getFileType, getTypeColor } from '@/utils/market'

const props = defineProps<{
  resource: Resource
  userId?: number | string | null
}>()

const emit = defineEmits<{
  (e: 'detail'): void
  (e: 'download'): void
  (e: 'edit'): void
  (e: 'remove'): void
}>()

const delay = Math.random() * 0.3 + 's'
const fileType = computed(() => getFileType(props.resource.file_url))
const audioMimeType = computed(() => getAudioMimeType(props.resource.file_url))
const isOwner = computed(() => Boolean(props.userId) && props.resource.uploader_id === props.userId)
</script>

<style scoped lang="scss" src="./resourceCard.scss"></style>
