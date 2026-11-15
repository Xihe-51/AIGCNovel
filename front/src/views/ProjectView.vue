<template>
  <div class="project-studio">
    <TechNavCircle />
    <div class="studio-container">
      <!-- 顶部导航栏 -->
      <div class="studio-header">
        <div class="header-content">
          <h1 class="project-title">{{ project?.title || '项目详情' }}</h1>
          <span class="genre-tag" :style="{ background: getGenreColor(project?.genre) }">
            {{ project?.genre || '未知类型' }}
          </span>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="studio-main">
        <el-tabs v-model="activeTab" class="custom-tabs">
          <!-- 项目概览 -->
          <el-tab-pane label="项目概览" name="overview">
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
                    <span>{{ scenes.length }} 个场景</span>
                    <span class="dot">·</span>
                    <span>{{ characters.length }} 个角色</span>
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
                    <button class="hero-ghost" @click="openFeaturePreview">
                      <el-icon><View /></el-icon>
                      <span>剧情树预览</span>
                    </button>
                    <button class="hero-ghost" @click="openAssetCheck">
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
                    <span class="stat-value">{{ characters.length }}</span>
                    <span class="stat-label">角色数量</span>
                  </div>
                </div>

                <div class="stat-card">
                  <div class="stat-icon picture">
                    <el-icon><Picture /></el-icon>
                  </div>
                  <div class="stat-content">
                    <span class="stat-value">{{ totalAvatars }}</span>
                    <span class="stat-label">立绘数量</span>
                  </div>
                </div>

                <div class="stat-card">
                  <div class="stat-icon film">
                    <el-icon><Film /></el-icon>
                  </div>
                  <div class="stat-content">
                    <span class="stat-value">{{ scenes.length }}</span>
                    <span class="stat-label">场景数量</span>
                  </div>
                </div>

                <div class="stat-card">
                  <div class="stat-icon chat">
                    <el-icon><ChatLineRound /></el-icon>
                  </div>
                  <div class="stat-content">
                    <span class="stat-value">{{ totalDialogues }}</span>
                    <span class="stat-label">对话数量</span>
                  </div>
                </div>
              </div>

              <!-- 功能预览弹窗 -->
              <ProjectFlowPreview
                v-model:visible="showFeaturePreview"
                :project-id="projectId"
                :project-title="project?.title || ''"
                @open-node-editor="openNodeEditor"
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
          </el-tab-pane>

          <!-- 角色管理 -->
          <el-tab-pane label="角色管理" name="characters">
            <div class="characters-panel">
              <div class="panel-toolbar">
                <button class="primary-btn" @click="showAddCharacterDialog">
                  <el-icon><Plus /></el-icon>
                  <span>添加角色</span>
                </button>
                
                <div class="search-box">
                  <el-input 
                    v-model="characterSearch" 
                    placeholder="搜索角色..." 
                    clearable
                    prefix-icon="Search"
                  />
                </div>
              </div>

              <el-table 
                :data="filteredCharacters" 
                class="custom-table"
                row-key="character_id"
                v-loading="loadingCharacters"
              >
                <el-table-column label="头像" width="80">
                  <template #default="{ row }">
                    <div class="avatar-cell">
                      <img :src="getAvatarUrl(row)" :alt="row.name" loading="lazy" decoding="async" @error="onAvatarImgError" />
                    </div>
                  </template>
                </el-table-column>
                <el-table-column prop="name" label="姓名" />
                <el-table-column prop="age" label="年龄" width="80" />
                <el-table-column label="主角" width="80">
                  <template #default="{ row }">
                    <span class="status-badge" :class="{ main: row.is_main }">
                      {{ row.is_main ? '是' : '否' }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column prop="description" label="角色描述" show-overflow-tooltip />
                <el-table-column label="操作" width="150">
                  <template #default="{ row }">
                    <button class="action-btn edit" @click="editCharacter(row)">编辑</button>
                    <button class="action-btn delete" @click="deleteCharacter(row.character_id)">删除</button>
                  </template>
                </el-table-column>
              </el-table>

               <el-drawer 
                v-model="characterDrawerVisible" 
                :title="!isAdd ? '编辑角色' : '添加角色'" 
                direction="rtl"
                size="480px"
                class="custom-drawer"
              >
                <div v-if="currentCharacter" class="drawer-content">
                  <el-form :model="currentCharacter" label-position="top">
                    <el-form-item label="角色名称">
                      <el-input v-model="currentCharacter.name" placeholder="请输入角色名称" />
                    </el-form-item>
                    <el-form-item label="年龄">
                      <el-input-number v-model="currentCharacter.age" :min="1" :max="100" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="主角">
                      <el-switch v-model="currentCharacter.is_main" />
                    </el-form-item>
                    <el-form-item label="角色描述">
                      <el-input 
                        v-model="currentCharacter.description" 
                        type="textarea" 
                        :rows="3" 
                        placeholder="请输入角色描述" 
                      />
                    </el-form-item>
                    <el-form-item label="角色名译文" v-if="!isAdd">
                      <div class="character-name-translations">
                        <div
                          v-for="lang in TRANSLATION_LANGUAGES"
                          :key="lang.code"
                          class="character-name-translation-row"
                        >
                          <span class="character-name-translation-label">{{ lang.label }}</span>
                          <el-input
                            v-model="characterNameTranslations[lang.code]"
                            :placeholder="`留空则使用「${currentCharacter.name}」`"
                          />
                        </div>
                        <div class="character-name-translation-tip">
                          播放器、导出包与静态网页包会按阅读语言显示对应译名，缺失时回退简体中文。
                        </div>
                      </div>
                    </el-form-item>
                  </el-form>

                  <div v-if="!isAdd" class="avatar-section-head">
                    <span class="avatar-section-title">角色立绘</span>
                    <button
                      class="avatar-btn cutout"
                      :disabled="cutoutLoadingId !== null || cutoutBatchRunning"
                      @click="batchCutout"
                    >
                      {{ cutoutBatchRunning ? '批量抠图中…' : '全部抠图' }}
                    </button>
                  </div>

                  <div class="avatar-grid" v-if="!isAdd">
                    <div 
                      v-for="avatar in currentCharacterAvatars" 
                      :key="avatar.avatar_id"
                      class="avatar-card"
                      :class="{ selected: selectedAvatar?.avatar_id === avatar.avatar_id }"
                      @click="selectAvatar(avatar)"
                    >
                      <div class="avatar-image">
                        <img :src="BASE_URL + avatar.image_url" loading="lazy" decoding="async" @error="onAvatarImgError" />
                      </div>
                      <div class="avatar-info">
                        <span class="avatar-type">{{ avatar.avatar_type }}</span>
                        <span class="avatar-costume">{{ avatar.costume || '默认服装' }}</span>
                      </div>
                      <div class="avatar-actions">
                        <button
                          class="avatar-btn layer"
                          :title="`差分叠加层：${(avatar.layers || []).length} 层`"
                          @click.stop="openLayerDialog(avatar)"
                        >
                          差分{{ (avatar.layers || []).length ? `(${avatar.layers!.length})` : '' }}
                        </button>
                        <button
                          class="avatar-btn cutout"
                          :disabled="cutoutLoadingId !== null || cutoutBatchRunning"
                          title="去掉立绘背景，保留透明底人物"
                          @click.stop="cutoutAvatar(avatar)"
                        >
                          {{ cutoutLoadingId === avatar.avatar_id ? '抠图中…' : '抠图' }}
                        </button>
                        <button 
                          class="avatar-btn" 
                          :class="{ default: avatar.is_default }"
                          @click.stop="setDefaultAvatar(avatar)"
                        >
                          {{ avatar.is_default ? '默认' : '设为默认' }}
                        </button>
                        <button class="avatar-btn delete" @click.stop="deleteAvatar(avatar.avatar_id)">
                          删除
                        </button>
                      </div>
                    </div>

                    <div class="add-avatar-card" @click="showAddAvatarDialog">
                      <el-icon><Plus /></el-icon>
                      <span>添加立绘</span>
                    </div>
                  </div>

                  <div class="drawer-footer">
                    <button class="secondary-btn" @click="characterDrawerVisible = false">取消</button>
                    <button class="primary-btn" @click="saveCharacter">保存</button>
                  </div>
                </div>
              </el-drawer>

              <!-- 添加立绘对话框 -->
              <el-dialog v-model="avatarDialogVisible" title="添加立绘" width="460px" class="custom-dialog">
                <el-form :model="newAvatar" label-position="top">
                  <el-form-item label="表情类型">
                    <div class="type-options">
                      <span 
                        v-for="type in avatarTypes" 
                        :key="type"
                        class="type-option"
                        :class="{ selected: newAvatar.avatar_type === type }"
                        @click="newAvatar.avatar_type = type"
                      >
                        {{ type }}
                      </span>
                    </div>
                  </el-form-item>
                  <el-form-item label="服装描述">
                    <el-input v-model="newAvatar.costume" placeholder="请输入服装描述" />
                  </el-form-item>
                  <el-form-item label="设为默认">
                    <el-switch v-model="newAvatar.is_default" />
                  </el-form-item>
                  <el-form-item label="上传立绘">
                    <el-upload 
                      ref="upload" 
                      :show-file-list="false" 
                      :auto-upload="false"
                      :on-change="handleChange" 
                      accept=".jpg,.jpeg,.png,.gif,.webp"
                      drag
                    >
                      <div class="upload-area">
                        <el-icon><UploadFilled /></el-icon>
                        <p>点击或拖拽上传立绘图片</p>
                      </div>
                    </el-upload>
                  </el-form-item>
                </el-form>
                
                <div v-if="previewImageUrl" class="preview-image">
                  <img :src="previewImageUrl" />
                </div>
                
                <template #footer>
                  <button class="dialog-btn cancel" @click="avatarDialogVisible = false">取消</button>
                  <button class="dialog-btn confirm" @click="addAvatar" :disabled="!selectedFile">确定</button>
                </template>
              </el-dialog>

              <!-- 立绘差分层管理 -->
              <ProjectLayerDialog
                v-model:visible="layerDialogVisible"
                :avatar="layerTargetAvatar"
                @changed="handleLayerChanged"
              />

              <!-- 抠图进度对话框 -->
              <el-dialog
                v-model="cutoutDialogVisible"
                title="角色抠图"
                width="420px"
                class="custom-dialog cutout-dialog"
                :close-on-click-modal="false"
                :show-close="cutoutStatus !== 'running'"
                @closed="stopCutoutTimer"
              >
                <div class="cutout-progress">
                  <div v-if="cutoutTarget" class="cutout-target">
                    {{ cutoutTarget.avatar_type }} · {{ cutoutTarget.costume || '默认服装' }}
                  </div>
                  <el-progress
                    :percentage="cutoutPercent"
                    :stroke-width="10"
                    :color="cutoutStatus === 'error' ? '#F56C6C' : (cutoutStatus === 'success' ? '#67C23A' : '#5b8def')"
                  />
                  <div class="cutout-stage">{{ cutoutStage }}</div>
                  <div v-if="cutoutError" class="cutout-error">{{ cutoutError }}</div>
                  <div class="cutout-hint">大图可能需要几秒；处理期间可以点「后台运行」，完成后会提示。</div>
                </div>
                <template #footer>
                  <button v-if="cutoutStatus === 'error'" class="dialog-btn confirm" @click="retryCutout">重试</button>
                  <button class="dialog-btn cancel" @click="cutoutDialogVisible = false">
                    {{ cutoutStatus === 'running' ? '后台运行' : '关闭' }}
                  </button>
                </template>
              </el-dialog>

              <!-- 参数设置对话框 -->
              <el-dialog v-model="settingsDialogVisible" title="参数设置" width="500px" class="custom-dialog">
                <div class="settings-panel">
                  <button class="secondary-btn small" @click="addSetting">
                    <el-icon><Plus /></el-icon>
                    添加参数
                  </button>
                  
                  <el-table :data="settingsArray" class="settings-table">
                    <el-table-column prop="key" label="参数名">
                      <template #default="{ row }">
                        <el-input v-model="row.key" @change="updateSettings" />
                      </template>
                    </el-table-column>
                    <el-table-column prop="value" label="参数值">
                      <template #default="{ row }">
                        <el-input v-model="row.value" @change="updateSettings" />
                      </template>
                    </el-table-column>
                    <el-table-column label="操作" width="80">
                      <template #default="{ $index }">
                        <button class="action-btn delete" @click="removeSetting($index)">删除</button>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
                <template #footer>
                  <button class="dialog-btn confirm" @click="settingsDialogVisible = false">关闭</button>
                </template>
              </el-dialog>
            </div>
          </el-tab-pane>

          <!-- 变量（好感度/数值/开关） -->
          <el-tab-pane label="变量" name="variables">
            <div class="variables-panel">
              <div class="variables-header">
                <div>
                  <h3>项目变量</h3>
                  <p class="variables-tip">用于好感度、数值、开关；在「场景编辑 → 数值变化」里给节点加减。</p>
                  <p class="variables-tip">活叙事行为变量仅在你点击启用后记录，可在剧情条件中使用。</p>
                </div>
                <div class="variables-actions">
                  <button
                    v-if="missingBehaviorVariables.length"
                    class="primary-btn behavior-btn"
                    :disabled="behaviorSaving"
                    @click="enableBehaviorVariables"
                  >
                    {{ behaviorSaving ? '启用中…' : '启用行为变量' }}
                  </button>
                  <button class="primary-btn" @click="openCreateVariable">新建变量</button>
                </div>
              </div>

              <el-table :data="variables" class="variables-table" v-if="variables.length">
                <el-table-column prop="label" label="展示名" min-width="120" />
                <el-table-column label="变量名" min-width="140">
                  <template #default="{ row }">
                    <span>{{ row.name }}</span>
                    <el-tag v-if="isBehaviorVariable(row)" type="success" size="small" class="behavior-tag">行为</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="initial_value" label="初始值" width="90" />
                <el-table-column label="范围" width="120">
                  <template #default="{ row }">
                    {{ row.min_value ?? '-' }} ~ {{ row.max_value ?? '-' }}
                  </template>
                </el-table-column>
                <el-table-column prop="description" label="说明" min-width="140" />
                <el-table-column label="跨周目" width="90">
                  <template #default="{ row }">
                    <el-tag v-if="row.persist" type="warning" size="small">保留</el-tag>
                    <span v-else>—</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="140">
                  <template #default="{ row }">
                    <button class="action-btn" @click="openEditVariable(row)">编辑</button>
                    <button class="action-btn delete" @click="removeVariable(row)">删除</button>
                  </template>
                </el-table-column>
              </el-table>

              <div v-else class="variables-empty">
                还没有变量，先建一个「好感度」试试。
              </div>
            </div>
          </el-tab-pane>

          <!-- 结局 -->
          <el-tab-pane label="结局" name="endings">
            <div class="variables-panel">
              <div class="variables-header">
                <div>
                  <h3>结局收集</h3>
                  <p class="variables-tip">到达触发节点且条件全部成立时解锁结局。</p>
                </div>
                <button class="primary-btn" @click="openCreateEnding">新建结局</button>
              </div>

              <el-table v-if="endings.length" :data="endings" class="variables-table">
                <el-table-column prop="title" label="结局" min-width="120" />
                <el-table-column label="触发节点" min-width="220">
                  <template #default="{ row }">{{ nodeLabel(row.content_id) }}</template>
                </el-table-column>
                <el-table-column label="条件" min-width="180">
                  <template #default="{ row }">{{ formatEndingConditions(row.conditions) }}</template>
                </el-table-column>
                <el-table-column label="状态" width="100">
                  <template #default="{ row }">
                    <el-tag :type="row.unlocked ? 'success' : 'info'" size="small">
                      {{ row.unlocked ? '已解锁' : '未解锁' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="140">
                  <template #default="{ row }">
                    <button class="action-btn" @click="openEditEnding(row)">编辑</button>
                    <button class="action-btn delete" @click="removeEnding(row)">删除</button>
                  </template>
                </el-table-column>
              </el-table>

              <div v-else class="variables-empty">还没有结局，先建一个试试。</div>
            </div>
          </el-tab-pane>

          <!-- CG 图鉴 -->
          <el-tab-pane label="CG 图鉴" name="cgs">
            <div class="variables-panel">
              <div class="variables-header">
                <div>
                  <h3>CG 图鉴</h3>
                  <p class="variables-tip">登记作品的 CG。绑定结局后，玩家达成该结局才在鉴赏页解锁；不绑定的初始可见。</p>
                </div>
                <button class="primary-btn" @click="openCreateCG">添加 CG</button>
              </div>

              <el-table v-if="cgs.length" :data="cgs" class="variables-table">
                <el-table-column label="预览" width="120">
                  <template #default="{ row }">
                    <img v-if="row.image_url" :src="BASE_URL + row.image_url"
                         class="cg-thumb" alt="CG 预览" loading="lazy" />
                    <span v-else class="cg-thumb-empty">无图</span>
                  </template>
                </el-table-column>
                <el-table-column prop="title" label="标题" min-width="130" />
                <el-table-column label="解锁条件" min-width="180">
                  <template #default="{ row }">
                    <span v-if="row.unlock_ending_id">
                      达成结局「{{ row.unlock_ending_title || ('#' + row.unlock_ending_id) }}」
                    </span>
                    <span v-else>初始可见</span>
                  </template>
                </el-table-column>
                <el-table-column prop="description" label="说明" min-width="150" />
                <el-table-column label="操作" width="140">
                  <template #default="{ row }">
                    <button class="action-btn" @click="openEditCG(row)">编辑</button>
                    <button class="action-btn delete" @click="removeCG(row)">删除</button>
                  </template>
                </el-table-column>
              </el-table>

              <div v-else class="variables-empty">还没有 CG，先添加一张试试。</div>
            </div>
          </el-tab-pane>
        </el-tabs>

        <!-- 变量编辑 -->
        <ProjectVariableDialog
          v-model:visible="variableDialogVisible"
          :saving="variableSaving"
          :editing-id="editingVariableId"
          :initial="variableInitial"
          :characters="characters"
          @save="handleSaveVariable"
        />

        <!-- 结局编辑 -->
        <ProjectEndingDialog
          v-model:visible="endingDialogVisible"
          :saving="endingSaving"
          :editing-id="editingEndingId"
          :initial="endingInitial"
          :node-options="nodeOptions"
          :variables="variables"
          @save="handleSaveEnding"
        />

        <!-- CG 编辑 -->
        <ProjectCgDialog
          v-model:visible="cgDialogVisible"
          :saving="cgSaving"
          :editing-id="editingCGId"
          :initial="cgInitial"
          :project-id="Number(projectId)"
          :endings="endings"
          @save="handleSaveCG"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, defineComponent, onMounted, computed, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { 
  DocumentAdd, VideoPlay, InfoFilled, Notebook, Edit, User, Picture, 
  Film, ChatLineRound, Plus, Search, Sort, Close, Refresh,
  ArrowUp, ArrowDown, Share, Microphone, UploadFilled, View, WarningFilled, Promotion
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getProject, getDialogueCount } from '@/api/project'
import { getCharacters, getCharacterAvatarsBatch, createCharacter, updateCharacter, deleteCharacter_by_Id, uploadCharacterAvatar, deleteCharacterAvatar, updateCharacterAvatar } from '@/api/character'
import type { AvatarType, CharacterAvatarLayer } from '@/api/character'
import { saveCharacterNameTranslation, TRANSLATION_LANGUAGES } from '@/api/translation'
import { getScenes } from '@/api/scenes'
import { getDialoguesBySceneId } from '@/api/dialogue'
import { getStoryGraph } from '@/api/branch'
import { listEndings, createEnding, updateEnding, deleteEnding } from '@/api/ending'
import { listCGs, createCG, updateCG, deleteCG } from '@/api/cg'
import { BASE_URL } from '@/utils/request'
import defaultAvatarImg from '@/assets/default.jpg'
import StoryGraphEditor from '@/components/StoryGraphEditor.vue'
import TechNavCircle from '@/components/TechNavCircle.vue'
import ProjectVariableDialog from '@/components/project/ProjectVariableDialog.vue'
import ProjectEndingDialog from '@/components/project/ProjectEndingDialog.vue'
import ProjectCgDialog from '@/components/project/ProjectCgDialog.vue'
import ProjectFlowPreview from '@/components/project/ProjectFlowPreview.vue'
import ProjectAssetDialog from '@/components/project/ProjectAssetDialog.vue'
import ProjectLayerDialog from '@/components/project/ProjectLayerDialog.vue'
import { useProjectCutout } from '@/composables/project/useProjectCutout'
import { useProjectVariables } from '@/composables/project/useProjectVariables'

// 接口定义保持不变
interface Project {
  project_id: number
  user_id: number
  title: string
  cover_url?: string
  genre: string
  template_type: string
  word_count: number
  description?: string
  is_public?: boolean
  created_at: string
  updated_at: string
}

interface Character {
  character_id: number
  project_id: number
  name: string
  name_translations?: Record<string, string>
  age?: number
  description?: string
  settings?: Record<string, any>
  is_main: boolean
  created_at: string
  avatar_url?: string
}

interface CharacterAvatar {
  avatar_id: number
  character_id: number
  image_url?: string
  avatar_type: string
  costume?: string
  is_default: boolean
  created_at: string
  layers?: CharacterAvatarLayer[]
}

interface Scene {
  scene_id: number
  project_id: number
  title: string
  background_url?: string
  background_color?: string
  description?: string
  order_num: number
  created_at: string
}

interface ScriptContent {
  content_id?: number
  project_id: number
  scene_id: number
  character_id?: number
  character?: Character
  content_type: '对话' | '描述' | '选择'
  content_text: string
  avatar_type?: string
  branch_condition?: any
  order_num: number
  options?: { text: string; target: number | string }[]
  tempId?: string
}

interface SceneCharacter {
  character_id: number
  name: string
  position: { x: number; y: number; z: number; scale?: number }
  avatar_type?: string
  currentAvatar?: CharacterAvatar
}

const avatarTypes = ['正常', '高兴', '生气', '悲伤', '惊讶', '其他']
const selectedFile = ref<File | null>(null)

export default defineComponent({
  name: 'ProjectView',
  components: {
    DocumentAdd, VideoPlay, InfoFilled, Notebook, Edit, User, Picture,
    Film, ChatLineRound, Plus, Search, Sort, Close, Refresh,
    ArrowUp, ArrowDown, Share, Microphone, UploadFilled, View, WarningFilled, Promotion,
    TechNavCircle, StoryGraphEditor,
  ProjectFlowPreview,
    ProjectVariableDialog, ProjectEndingDialog, ProjectCgDialog,
    ProjectAssetDialog, ProjectLayerDialog
  },
  props: {
    projectId: { type: Number, required: true }
  },
  setup(props) {
    const router = useRouter()
    // 原有状态
    const project = ref<Project | null>(null)
    const editingDescription = ref(false)
    const totalDialogues = ref(0)
    const isAdd = ref(false)
    const characters = ref<Character[]>([])
    const characterAvatars = ref<CharacterAvatar[]>([])
    const currentCharacterAvatars = ref<CharacterAvatar[]>([])
    const characterSearch = ref('')
    const loadingCharacters = ref(false)
    const scenes = ref<Scene[]>([])
    const loadingScenes = ref(false)
    const sceneScriptContents = ref<ScriptContent[]>([])
    const activeTab = ref('overview')

    // 项目变量：列表读写、弹窗开关与行为变量启用都在 useProjectVariables 内
    const {
      variables,
      behaviorSaving,
      isBehaviorVariable,
      missingBehaviorVariables,
      variableDialogVisible,
      editingVariableId,
      variableSaving,
      variableInitial,
      fetchVariables,
      enableBehaviorVariables,
      openCreateVariable,
      openEditVariable,
      handleSaveVariable,
      removeVariable,
    } = useProjectVariables({ projectId: () => Number(props.projectId) })

    // 变量绑定角色后，播放器「好感度」页按角色展示
    const characterName = (id: number | null | undefined) => {
      if (!id) return '—'
      return characters.value.find(c => c.character_id === id)?.name || `#${id}`
    }

    // 结局
    const endings = ref<any[]>([])
    const endingDialogVisible = ref(false)
    const editingEndingId = ref<number | null>(null)
    const endingSaving = ref(false)
    const storyNodes = ref<any[]>([])
    // 交给结局弹窗的初始行；null 表示新建
    const endingInitial = ref<any | null>(null)

    // CG 图鉴
    const cgs = ref<any[]>([])
    const cgDialogVisible = ref(false)
    const editingCGId = ref<number | null>(null)
    const cgSaving = ref(false)
    // 交给 CG 弹窗的初始行；null 表示新建
    const cgInitial = ref<any | null>(null)
    const characterDrawerVisible = ref(false)
    const currentCharacter = ref<Character | null>(null)
    // 角色名译文：{ 'zh-TW': '…', en: '…', ja: '…' }
    const characterNameTranslations = ref<Record<string, string>>({})
    const avatarDialogVisible = ref(false)
    const newAvatar = ref<Partial<CharacterAvatar>>({ avatar_type: '正常', is_default: false })
    const selectedAvatar = ref<CharacterAvatar | null>(null)
    // 立绘分层差分：基础图 + 表情/姿势叠加层（叠加层增删改由 ProjectLayerDialog 自管）
    const layerDialogVisible = ref(false)
    const layerTargetAvatar = ref<CharacterAvatar | null>(null)
    const settingsDialogVisible = ref(false)
    const showFeaturePreview = ref(false)
    const showNodeEditor = ref(false)
    const assetDialogVisible = ref(false)
    const sceneEditorVisible = ref(false)
    const currentScene = ref<Scene | null>(null)
    const sceneCharacters = ref<SceneCharacter[]>([])
    const currentSceneBackground = ref('')
    const draggingCharacter = ref<SceneCharacter | null>(null)
    const dragStartPos = ref({ x: 0, y: 0 })
    const previewMode = ref(false)
    const previewImageUrl = ref<string>('')
    const currentPreviewScene = ref<Scene | null>(null)
    const currentPreviewContentIndex = ref(0)
    const currentPreviewContent = ref<ScriptContent | null>(null)
    const currentPreviewCharacters = ref<SceneCharacter[]>([])

    // 剧情树画布的状态与交互由 ProjectFlowPreview 自管，这里只控制显隐
    const openFeaturePreview = () => {
      showFeaturePreview.value = true
    }
    // 进入独立的创作工作台（场景列表 + 对话编辑 + 工具面板）
    const goCreate = () => {
      router.push(`/create/${props.projectId}`)
    }

    // 新窗口打开播放器试玩（作者预览带演出模式入口）
    const openPlayer = () => {
      window.open(router.resolve({ path: `/view/${props.projectId}`, query: { edit: '1' } }).href, '_blank')
    }

    // 以玩家视角打开发布版：关闭调试器与演出编辑入口
    const openReleasePreview = () => {
      window.open(router.resolve({ path: `/view/${props.projectId}`, query: { release: '1' } }).href, '_blank')
    }

    // 第 10 批：节点级剧情图编辑器（content-level 节点 + 拖拽连线 + 条件编辑）
    const openNodeEditor = () => {
      showNodeEditor.value = true
    }

    // 素材体检：扫描与结果渲染由 ProjectAssetDialog 自管，这里只负责显隐
    const openAssetCheck = () => {
      assetDialogVisible.value = true
    }

    const filteredCharacters = computed(() => {
      if (!characterSearch.value) return characters.value
      return characters.value.filter(char =>
        char.name.includes(characterSearch.value) ||
        (char.description && char.description.includes(characterSearch.value))
      )
    })

    const totalAvatars = computed(() => characterAvatars.value.length)

    const getGenreColor = (genre?: string) => {
      const colors: Record<string, string> = {
        '悬疑': '#6c5b7b', '恋爱': '#ff8fab', '科幻': '#5d5fef',
        '奇幻': '#c9a9e8', '历史': '#c49a6c', '现代': '#a8e6cf', '其他': '#b8b8b8'
      }
      return colors[genre || ''] || '#ff8fab'
    }

    const fetchProjectDetails = async (projectId: number) => {
      try {
        const res = await getProject(projectId)
        project.value = res
        await Promise.all([fetchCharacters(projectId), fetchScenes(projectId)])
      } catch (error) {
        ElMessage.error('获取项目详情失败')
      }
    }

    const fetchCharacters = async (projectId: number) => {
      loadingCharacters.value = true
      try {
        const res = await getCharacters(projectId)
        characters.value = res
        await fetchCharacterAvatars()
      } finally {
        loadingCharacters.value = false
      }
    }

    const fetchCharacterAvatars = async () => {
      try {
        const characterIds = characters.value.map(c => c.character_id)
        if (characterIds.length > 0) {
          characterAvatars.value = await getCharacterAvatarsBatch(characterIds)
        }
      } catch (error) {
        console.error('获取角色立绘失败:', error)
      }
    }

    const fetchScenes = async (projectId: number) => {
      loadingScenes.value = true
      try {
        const res = await getScenes(projectId)
        scenes.value = res
      } finally {
        loadingScenes.value = false
      }
    }

    const fetchScriptContents = async (sceneId: number) => {
      const res = await getDialoguesBySceneId(sceneId)
      const contents: ScriptContent[] = res
      contents.forEach(content => {
        if (content.character_id) {
          content.character = characters.value.find(c => c.character_id === content.character_id)
        }
      })
      sceneScriptContents.value = contents
    }

    const formatTime = (time: string) => new Date(time).toLocaleString()

    const getContentTagType = (type: string) => {
      const types: Record<string, string> = { '对话': 'success', '描述': '', '选择': 'warning' }
      return types[type] || 'info'
    }

    const getCharacterColor = (characterId: number) => {
      const colors = ['#ff9ff3', '#feca57', '#ff6b6b', '#48dbfb', '#1dd1a1', '#f368e0']
      return colors[characterId % colors.length]
    }

    const showAddCharacterDialog = () => {
      currentCharacter.value = { character_id: 0, project_id: props.projectId, name: '', is_main: false, created_at: new Date().toISOString() }
      characterNameTranslations.value = {}
      isAdd.value = true
      currentCharacterAvatars.value = []
      characterDrawerVisible.value = true
    }

    const editCharacter = (character: Character) => {
      currentCharacter.value = { ...character }
      characterNameTranslations.value = { ...(character.name_translations || {}) }
      characterDrawerVisible.value = true
      isAdd.value = false
      fetchCharacterAvatarsForCharacter(character.character_id)
    }

    const fetchCharacterAvatarsForCharacter = (characterId: number) => {
      currentCharacterAvatars.value = characterAvatars.value.filter(a => a.character_id === characterId)
    }

    const saveCharacter = async () => {
      if (!currentCharacter.value) return
      const character = currentCharacter.value
      if (character.character_id === 0) {
        try {
          const created = await createCharacter(character)
          characters.value.push(created || character)
          ElMessage.success('角色添加成功')
          setTimeout(() => location.reload(), 1200)
        } catch (e: any) {
          ElMessage.error('角色添加失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
        }
        characterDrawerVisible.value = false
        return
      }

      try {
        const updated = await updateCharacter(character)
        // 角色名译文：逐语言保存，空值由后端删除
        const translations: Record<string, string> = {}
        for (const lang of TRANSLATION_LANGUAGES) {
          const name = String(characterNameTranslations.value[lang.code] || '').trim()
          const saved = await saveCharacterNameTranslation(character.character_id, lang.code, name)
          if (saved?.name) translations[lang.code] = saved.name
        }
        const merged: Character = { ...(updated || character), name_translations: translations }
        const index = characters.value.findIndex(c => c.character_id === character.character_id)
        if (index !== -1) characters.value[index] = merged
        ElMessage.success('角色更新成功')
        characterDrawerVisible.value = false
      } catch (e: any) {
        ElMessage.error('角色更新失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
      }
    }

    const deleteCharacter = async (characterId: number) => {
      try {
        await ElMessageBox.confirm('确定要删除这个角色吗？所有相关立绘和对话也将被删除。', '警告', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
        await deleteCharacter_by_Id(characterId)
        characters.value = characters.value.filter(c => c.character_id !== characterId)
        characterAvatars.value = characterAvatars.value.filter(a => a.character_id !== characterId)
        ElMessage.success('角色删除成功')
      } catch {}
    }

    const showAddAvatarDialog = () => {
      if (!currentCharacter.value) return
      newAvatar.value = { character_id: currentCharacter.value.character_id, avatar_type: '正常', is_default: false }
      avatarDialogVisible.value = true
    }

    const handleChange = (file: any) => {
      selectedFile.value = file.raw
      if (previewImageUrl.value) URL.revokeObjectURL(previewImageUrl.value)
      previewImageUrl.value = URL.createObjectURL(file.raw)
    }

    const addAvatar = async () => {
      if (!currentCharacter.value || !selectedFile.value) return
      if (!newAvatar.value.costume) { ElMessage.warning('请填写服装描述'); return }
      try {
        await uploadCharacterAvatar(selectedFile.value, currentCharacter.value.project_id, currentCharacter.value.character_id, (newAvatar.value.avatar_type as AvatarType) || '正常', newAvatar.value.costume, newAvatar.value.is_default ? true : false)
        if (newAvatar.value.is_default) {
          characterAvatars.value.forEach(a => { if (a.character_id === currentCharacter.value?.character_id) a.is_default = false })
        }
        await fetchProjectDetails(props.projectId)
        ElMessage.success('立绘添加成功')
        avatarDialogVisible.value = false
        characterDrawerVisible.value = false
        previewImageUrl.value = ''
        newAvatar.value = { avatar_type: '正常', costume: '', is_default: false }
        selectedFile.value = null
      } catch (error) { ElMessage.error('立绘上传失败，请重试') }
    }

    const selectAvatar = (avatar: CharacterAvatar) => { selectedAvatar.value = avatar }
    const setDefaultAvatar = (avatar: CharacterAvatar) => {
      if (avatar.is_default) { ElMessage.warning('已为默认立绘'); return }
      updateCharacterAvatar({ avatar_id: avatar.avatar_id })
      characterAvatars.value.forEach(a => { if (a.character_id === avatar.character_id) a.is_default = a.avatar_id === avatar.avatar_id })
      ElMessage.success('默认立绘设置成功')
      fetchProjectDetails(props.projectId)
    }

    const deleteAvatar = async (avatarId: number) => {
      try {
        await ElMessageBox.confirm('确定要删除这个立绘吗？', '警告', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
        await deleteCharacterAvatar(avatarId)
        await fetchCharacterAvatars()
        characterDrawerVisible.value = false
        characterAvatars.value = characterAvatars.value.filter(a => a.avatar_id !== avatarId)
        ElMessage.success('立绘删除成功')
      } catch {}
    }

    // ==================== 立绘分层差分 ====================
    const syncCurrentCharacterAvatars = () => {
      if (!currentCharacter.value || isAdd.value) return
      const characterId = currentCharacter.value.character_id
      currentCharacterAvatars.value = characterAvatars.value.filter(a => a.character_id === characterId)
      if (layerTargetAvatar.value) {
        const avatarId = layerTargetAvatar.value.avatar_id
        layerTargetAvatar.value = currentCharacterAvatars.value.find(a => a.avatar_id === avatarId) || null
      }
    }

    const openLayerDialog = (avatar: CharacterAvatar) => {
      layerTargetAvatar.value = avatar
      layerDialogVisible.value = true
    }

    // 差分层增删后重新拉取立绘，并把弹窗目标指到刷新后的对象
    const handleLayerChanged = async () => {
      await fetchCharacterAvatars()
      syncCurrentCharacterAvatars()
    }

    // 抠图状态与流程由 useProjectCutout 自管
    const {
      cutoutLoadingId,
      cutoutBatchRunning,
      cutoutDialogVisible,
      cutoutTarget,
      cutoutPercent,
      cutoutStage,
      cutoutStatus,
      cutoutError,
      stopCutoutTimer,
      cutoutAvatar,
      retryCutout,
      batchCutout,
    } = useProjectCutout({ characters, characterAvatars, currentCharacterAvatars, selectedAvatar })

    const showSettingsDialog = () => { settingsDialogVisible.value = true }

    const settingsArray = computed({
      get() {
        if (!currentCharacter.value?.settings) return []
        return Object.entries(currentCharacter.value.settings).map(([key, value]) => ({ key, value }))
      },
      set(value) {
        if (!currentCharacter.value) return
        const settings: Record<string, any> = {}
        value.forEach(item => settings[item.key] = item.value)
        currentCharacter.value.settings = settings
      }
    })

    const addSetting = () => {
      if (!currentCharacter.value) return
      if (!currentCharacter.value.settings) currentCharacter.value.settings = {}
      const newKey = `param_${Object.keys(currentCharacter.value.settings).length + 1}`
      currentCharacter.value.settings[newKey] = ''
    }

    const removeSetting = (index: number) => {
      if (!currentCharacter.value?.settings) return
      const key = settingsArray.value[index].key
      delete currentCharacter.value.settings[key]
    }

    // 参数设置改动后自动落库（此前是空函数，改了参数关掉对话框就丢）
    let settingsSaveTimer: ReturnType<typeof setTimeout> | null = null
    const updateSettings = () => {
      const c = currentCharacter.value
      if (!c || !c.character_id) return
      if (settingsSaveTimer) clearTimeout(settingsSaveTimer)
      settingsSaveTimer = setTimeout(async () => {
        try {
          await updateCharacter({ ...c })
        } catch (e) {
          console.error('保存角色参数失败:', e)
          ElMessage.error('参数保存失败，请稍后重试')
        }
      }, 600)
    }

    const getNextScene = (currentSceneId: number) => {
      const sortedScenes = [...scenes.value].sort((a, b) => a.order_num - b.order_num)
      const currentIndex = sortedScenes.findIndex(s => s.scene_id === currentSceneId)
      if (currentIndex === -1 || currentIndex >= sortedScenes.length - 1) return null
      return sortedScenes[currentIndex + 1]
    }

    const getAvatarUrl = (row: any) => {
      if (row.avatar_url) return BASE_URL + row.avatar_url
      const defaultAvatar = characterAvatars.value.find(a => a.character_id === row.character_id && a.is_default)
      if (defaultAvatar) return BASE_URL + defaultAvatar.image_url
      return defaultAvatarImg
    }

    // 立绘文件已丢失时退回默认头像，不再显示裂图
    const onAvatarImgError = (e: Event) => {
      const el = e.target as HTMLImageElement
      if (!el || el.dataset.fallbackApplied) return
      el.dataset.fallbackApplied = '1'
      el.src = defaultAvatarImg
    }

    const startVoice = (voice_url: string) => {
      const audio = new Audio(BASE_URL + voice_url)
      audio.play().catch(error => console.error("播放失败:", error))
    }

    // ==================== 结局 ====================
    const fetchEndings = async () => {
      try {
        endings.value = await listEndings(Number(props.projectId))
      } catch (e) {
        console.warn('读取结局失败:', e)
        endings.value = []
      }
    }

    const loadStoryNodes = async () => {
      try {
        const graph: any = await getStoryGraph(Number(props.projectId), false)
        storyNodes.value = graph?.nodes || []
      } catch (e) {
        storyNodes.value = []
      }
    }

    const nodeLabel = (contentId: number) => {
      const node = storyNodes.value.find(n => n.content_id === contentId)
      if (!node) return `#${contentId}`
      const text = (node.content_text || '').replace(/\s+/g, ' ').slice(0, 16)
      return `${node.scene_title || ''} · #${node.order_num} ${text}`
    }

    const formatEndingConditions = (conds: any[]) => {
      if (!conds || !conds.length) return '无条件'
      return conds.map(c => `${c.variable} ${c.op} ${c.value}`).join(' 且 ')
    }

    // 结局弹窗的触发节点下拉：节点 id → 可读标签
    const nodeOptions = computed(() => storyNodes.value.map(n => ({
      content_id: n.content_id,
      label: nodeLabel(n.content_id),
    })))

    const openCreateEnding = async () => {
      editingEndingId.value = null
      endingInitial.value = null
      await loadStoryNodes()
      endingDialogVisible.value = true
    }

    const openEditEnding = async (row: any) => {
      editingEndingId.value = row.ending_id
      endingInitial.value = row
      await loadStoryNodes()
      endingDialogVisible.value = true
    }

    // 结局弹窗已完成校验，这里只负责落库与刷新
    const handleSaveEnding = async ({ endingId, payload }: { endingId: number | null; payload: any }) => {
      endingSaving.value = true
      try {
        if (endingId) {
          await updateEnding(Number(props.projectId), endingId, payload)
          ElMessage.success('结局已更新')
        } else {
          await createEnding(Number(props.projectId), payload)
          ElMessage.success('结局已创建')
        }
        endingDialogVisible.value = false
        await fetchEndings()
      } catch (e: any) {
        ElMessage.error(e?.response?.data?.message || e?.message || '保存结局失败')
      } finally {
        endingSaving.value = false
      }
    }

    const removeEnding = async (row: any) => {
      try {
        await ElMessageBox.confirm(`删除结局「${row.title}」？`, '删除结局', {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
        })
        await deleteEnding(Number(props.projectId), row.ending_id)
        ElMessage.success('结局已删除')
        await fetchEndings()
      } catch (e) {
        // 取消
      }
    }

    // ==================== CG 图鉴 ====================
    const fetchCGs = async () => {
      try {
        cgs.value = await listCGs(Number(props.projectId))
      } catch (e) {
        console.warn('读取 CG 失败:', e)
        cgs.value = []
      }
    }

    const openCreateCG = async () => {
      editingCGId.value = null
      cgInitial.value = null
      await fetchEndings()
      cgDialogVisible.value = true
    }

    const openEditCG = async (row: any) => {
      editingCGId.value = row.cg_id
      await fetchEndings()
      cgInitial.value = row
      cgDialogVisible.value = true
    }

    // CG 弹窗自己处理上传与市场选图，这里只负责落库与刷新
    const handleSaveCG = async ({ cgId, payload }: { cgId: number | null; payload: any }) => {
      cgSaving.value = true
      try {
        if (cgId) {
          await updateCG(Number(props.projectId), cgId, payload)
          ElMessage.success('CG 已更新')
        } else {
          await createCG(Number(props.projectId), payload)
          ElMessage.success('CG 已添加')
        }
        cgDialogVisible.value = false
        await fetchCGs()
      } catch (e: any) {
        ElMessage.error(e?.response?.data?.message || e?.message || '保存 CG 失败')
      } finally {
        cgSaving.value = false
      }
    }

    const removeCG = async (row: any) => {
      try {
        await ElMessageBox.confirm(`删除 CG「${row.title}」？`, '删除 CG', {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
        })
        await deleteCG(Number(props.projectId), row.cg_id)
        ElMessage.success('CG 已删除')
        await fetchCGs()
      } catch (e) {
        // 取消
      }
    }

    // ==================== 生命周期 ====================
    onUnmounted(() => {
      if (settingsSaveTimer) clearTimeout(settingsSaveTimer)
      if (previewImageUrl.value) URL.revokeObjectURL(previewImageUrl.value)
    })

    onMounted(async () => {
      await fetchProjectDetails(props.projectId)
      const res = await getDialogueCount(props.projectId)
      totalDialogues.value = res?.length ?? 0
      await fetchVariables()
      await fetchEndings()
    })

    return {
      project, isAdd, selectedFile, characters, characterAvatars, scenes,
      currentCharacterAvatars, BASE_URL, sceneScriptContents, activeTab,
      variables, variableDialogVisible, editingVariableId, variableSaving, variableInitial,
      missingBehaviorVariables, behaviorSaving, enableBehaviorVariables, isBehaviorVariable,
      fetchVariables, openCreateVariable, openEditVariable, handleSaveVariable, removeVariable,
      endings, endingDialogVisible, editingEndingId, endingSaving, endingInitial, nodeOptions,
      fetchEndings, openCreateEnding, openEditEnding, handleSaveEnding, removeEnding, nodeLabel, formatEndingConditions,
      cgs, cgDialogVisible, editingCGId, cgSaving, cgInitial,
      fetchCGs, openCreateCG, openEditCG, handleSaveCG, removeCG,
      characterDrawerVisible, currentCharacter, characterNameTranslations,
      TRANSLATION_LANGUAGES, avatarDialogVisible, newAvatar,
      selectedAvatar, cutoutLoadingId, cutoutBatchRunning,
      cutoutDialogVisible, cutoutTarget, cutoutPercent, cutoutStage, cutoutStatus, cutoutError,
      stopCutoutTimer, retryCutout, batchCutout,
      settingsDialogVisible, showFeaturePreview, showNodeEditor,
      assetDialogVisible, openAssetCheck,
      sceneEditorVisible, currentScene, sceneCharacters, currentSceneBackground,
      previewMode, currentPreviewScene, currentPreviewContent, currentPreviewCharacters,
      editingDescription, characterSearch, loadingCharacters, loadingScenes,
      avatarTypes, previewImageUrl, filteredCharacters, totalAvatars, totalDialogues,
      settingsArray,
      formatTime, handleChange, getGenreColor, getContentTagType, getCharacterColor,
      showAddCharacterDialog, editCharacter, saveCharacter, deleteCharacter,
      showAddAvatarDialog, addAvatar, selectAvatar, setDefaultAvatar, cutoutAvatar, deleteAvatar,
      layerDialogVisible, layerTargetAvatar,
      openLayerDialog, handleLayerChanged,
      showSettingsDialog, addSetting, removeSetting, updateSettings,
      fetchScenes, getNextScene,
      getAvatarUrl, onAvatarImgError, startVoice,
      openFeaturePreview, openNodeEditor, goCreate, openPlayer, openReleasePreview,
      // 补充原有方法的引用
      fetchCharacters, fetchProjectDetails, fetchCharacterAvatars
    }
  }
})
</script>
<style scoped lang="scss" src="./project/projectShell.scss"></style>
<style scoped lang="scss" src="./project/projectOverview.scss"></style>
<style scoped lang="scss" src="./project/projectStates.scss"></style>
<style scoped lang="scss" src="./project/projectCharacters.scss"></style>
<style scoped lang="scss" src="./project/projectDialogs.scss"></style>
<style scoped lang="scss" src="./project/projectResponsive.scss"></style>
<style scoped lang="scss" src="./project/projectPanels.scss"></style>