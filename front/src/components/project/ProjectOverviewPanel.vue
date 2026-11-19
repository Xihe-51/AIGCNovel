<template>
  <div v-if="project" class="overview-panel">
    <!-- 作品头卡 -->
    <div class="hero-card">
      <div class="hero-cover">
        <img v-if="project.cover_url" :src="BASE_URL + project.cover_url" alt="" />
        <span v-else>{{ project.title.slice(0, 1) }}</span>
      </div>
      <div class="hero-main">
        <div class="hero-title-row">
          <h2 class="hero-title">{{ project.title }}</h2>
          <span class="hero-tag">{{ project.genre }}</span>
          <span :class="['hero-tag', project.is_public ? 'is-public' : 'is-private']">
            {{ project.is_public ? '已公开' : '未公开' }}
          </span>
        </div>
        <div class="hero-meta">
          <span>{{ project.word_count }} 字</span>
          <span class="dot">·</span>
          <span>{{ sceneCount }} 个场景</span>
          <span class="dot">·</span>
          <span>{{ characterCount }} 个角色</span>
          <span class="dot">·</span>
          <span>更新于 {{ formatTime(project.updated_at) }}</span>
        </div>
        <div class="hero-actions">
          <button class="hero-primary" @click="goCreate">
            <el-icon><Edit /></el-icon>
            <span>开始创作</span>
          </button>
          <button class="hero-ghost" @click="openPlayer">
            <el-icon><VideoPlay /></el-icon>
            <span>试玩</span>
          </button>
          <button class="hero-ghost" @click="openReleasePreview">
            <el-icon><Promotion /></el-icon>
            <span>发布预览</span>
          </button>
          <button class="hero-ghost" @click="showFeaturePreview = true">
            <el-icon><View /></el-icon>
            <span>剧情树预览</span>
          </button>
          <button class="hero-ghost" @click="assetDialogVisible = true">
            <el-icon><WarningFilled /></el-icon>
            <span>素材体检</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 统计数据 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon user">
          <el-icon><User /></el-icon>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ characterCount }}</span>
          <span class="stat-label">角色数量</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon picture">
          <el-icon><Picture /></el-icon>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ avatarCount }}</span>
          <span class="stat-label">立绘数量</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon film">
          <el-icon><Film /></el-icon>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ sceneCount }}</span>
          <span class="stat-label">场景数量</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon chat">
          <el-icon><ChatLineRound /></el-icon>
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ dialogueCount }}</span>
          <span class="stat-label">对话数量</span>
        </div>
      </div>
    </div>

    <!-- 功能预览弹窗 -->
    <ProjectFlowPreview
      v-model:visible="showFeaturePreview"
      :project-id="projectId"
      :project-title="project.title"
      @open-node-editor="showNodeEditor = true"
    />

    <!-- 节点级剧情图编辑器（第 10 批） -->
    <el-dialog
      v-model="showNodeEditor"
      title="节点级剧情图"
      width="1120px"
      class="custom-dialog"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <StoryGraphEditor v-if="showNodeEditor" :project-id="projectId" />
    </el-dialog>

    <!-- 素材体检 -->
    <ProjectAssetDialog v-model:visible="assetDialogVisible" :project-id="projectId" />
  </div>

  <div v-else class="loading-state">
    <div class="spinner"></div>
    <span>加载中...</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Edit, VideoPlay, Promotion, View, WarningFilled,
  User, Picture, Film, ChatLineRound,
} from '@element-plus/icons-vue'
import type { Project } from '@/api/project'
import { BASE_URL } from '@/utils/request'
import StoryGraphEditor from '@/components/StoryGraphEditor.vue'
import ProjectFlowPreview from '@/components/project/ProjectFlowPreview.vue'
import ProjectAssetDialog from '@/components/project/ProjectAssetDialog.vue'

const props = defineProps<{
  project: Project | null
  projectId: number
  sceneCount: number
  characterCount: number
  avatarCount: number
  dialogueCount: number
}>()

const router = useRouter()
const showFeaturePreview = ref(false)
const showNodeEditor = ref(false)
const assetDialogVisible = ref(false)

const goCreate = () => {
  router.push(`/create/${props.projectId}`)
}

const openPlayer = () => {
  window.open(router.resolve({ path: `/view/${props.projectId}`, query: { edit: '1' } }).href, '_blank')
}

const openReleasePreview = () => {
  window.open(router.resolve({ path: `/view/${props.projectId}`, query: { release: '1' } }).href, '_blank')
}

const formatTime = (time: string) => new Date(time).toLocaleString()
</script>

<style scoped lang="scss" src="./projectOverviewPanel.scss"></style>
