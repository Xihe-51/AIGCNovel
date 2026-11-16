<template>
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
      <el-table-column label="操作" width="210">
        <template #default="{ row }">
          <button class="action-btn edit" @click="editCharacter(row)">编辑</button>
          <button class="action-btn settings" @click="showSettingsDialog(row)">参数</button>
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
    <el-dialog
      v-model="settingsDialogVisible"
      :title="`参数设置${currentCharacter?.name ? ` · ${currentCharacter.name}` : ''}`"
      width="500px"
      class="custom-dialog"
    >
      <div class="settings-panel">
        <button class="secondary-btn small" @click="addSetting">
          <el-icon><Plus /></el-icon>
          添加参数
        </button>
      
        <el-table :data="settingsArray" class="settings-table">
          <el-table-column prop="key" label="参数名">
            <template #default="{ row, $index }">
              <el-input :model-value="row.key" @change="renameSetting($index, $event)" />
            </template>
          </el-table-column>
          <el-table-column prop="value" label="参数值">
            <template #default="{ row, $index }">
              <el-input :model-value="row.value" @change="updateSettingValue($index, $event)" />
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
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { Plus, UploadFilled } from '@element-plus/icons-vue'
import type { Character } from '@/api/character'
import { TRANSLATION_LANGUAGES } from '@/api/translation'
import { BASE_URL } from '@/utils/request'
import ProjectLayerDialog from '@/components/project/ProjectLayerDialog.vue'
import { useProjectCutout } from '@/composables/project/useProjectCutout'
import { useProjectCharacters } from '@/composables/project/useProjectCharacters'

const props = defineProps<{ projectId: number }>()

const emit = defineEmits<{
  (e: 'stats-change', payload: { characters: Character[]; avatarCount: number }): void
}>()

// 角色库：列表与搜索、角色抽屉表单、立绘与参数设置都在 useProjectCharacters 内
const {
  avatarTypes, characters, characterAvatars, currentCharacterAvatars,
  characterSearch, loadingCharacters, filteredCharacters, totalAvatars,
  isAdd, characterDrawerVisible, currentCharacter, characterNameTranslations,
  avatarDialogVisible, newAvatar, selectedFile, previewImageUrl, selectedAvatar,
  layerDialogVisible, layerTargetAvatar, settingsDialogVisible, settingsArray,
  fetchCharacters, showAddCharacterDialog, editCharacter, saveCharacter, deleteCharacter,
  showAddAvatarDialog, handleChange, addAvatar, selectAvatar, setDefaultAvatar,
  deleteAvatar, openLayerDialog, handleLayerChanged, getAvatarUrl, onAvatarImgError,
  showSettingsDialog, addSetting, removeSetting, renameSetting, updateSettingValue,
} = useProjectCharacters({ projectId: () => props.projectId })

// 抠图状态与流程由 useProjectCutout 自管
const {
  cutoutLoadingId, cutoutBatchRunning, cutoutDialogVisible, cutoutTarget,
  cutoutPercent, cutoutStage, cutoutStatus, cutoutError, stopCutoutTimer,
  cutoutAvatar, retryCutout, batchCutout,
} = useProjectCutout({ characters, characterAvatars, currentCharacterAvatars, selectedAvatar })

fetchCharacters()

// 概览页签要用角色数与立绘数，由本面板统一上报，避免两处各拉一份角色库
watch(
  () => [characters.value.length, totalAvatars.value] as const,
  () => emit('stats-change', { characters: characters.value, avatarCount: totalAvatars.value }),
  { immediate: true }
)
</script>

<style src="./projectDialog.css"></style>

<style scoped lang="scss">
@use './projectCharactersPanel';
</style>
