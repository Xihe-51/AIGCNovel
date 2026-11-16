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
            <ProjectOverviewPanel
              :project="project"
              :project-id="projectId"
              :scene-count="scenes.length"
              :character-count="characters.length"
              :avatar-count="totalAvatars"
              :dialogue-count="totalDialogues"
            />
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
                    <span>{{ describeCgUnlock(row) }}</span>
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
import { ref, defineComponent, onMounted } from 'vue'
import { Plus, UploadFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getProject, getDialogueCount, type Project } from '@/api/project'
import { TRANSLATION_LANGUAGES } from '@/api/translation'
import { getScenes, type Scene } from '@/api/scenes'
import { BASE_URL } from '@/utils/request'
import TechNavCircle from '@/components/TechNavCircle.vue'
import ProjectOverviewPanel from '@/components/project/ProjectOverviewPanel.vue'
import ProjectVariableDialog from '@/components/project/ProjectVariableDialog.vue'
import ProjectEndingDialog from '@/components/project/ProjectEndingDialog.vue'
import ProjectCgDialog from '@/components/project/ProjectCgDialog.vue'
import ProjectLayerDialog from '@/components/project/ProjectLayerDialog.vue'
import { useProjectCutout } from '@/composables/project/useProjectCutout'
import { useProjectVariables } from '@/composables/project/useProjectVariables'
import { useProjectEndings } from '@/composables/project/useProjectEndings'
import { useProjectCgs } from '@/composables/project/useProjectCgs'
import { useProjectCharacters } from '@/composables/project/useProjectCharacters'

export default defineComponent({
  name: 'ProjectView',
  components: {
    Plus, UploadFilled,
    TechNavCircle, ProjectOverviewPanel,
    ProjectVariableDialog, ProjectEndingDialog, ProjectCgDialog,
    ProjectLayerDialog
  },
  props: {
    projectId: { type: Number, required: true }
  },
  setup(props) {
    // 原有状态
    const project = ref<Project | null>(null)
    const totalDialogues = ref(0)
    const scenes = ref<Scene[]>([])
    const loadingScenes = ref(false)
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

    // 结局：列表读写、触发节点下拉与弹窗编排都在 useProjectEndings 内
    const {
      endings,
      endingDialogVisible,
      editingEndingId,
      endingSaving,
      endingInitial,
      nodeOptions,
      fetchEndings,
      openCreateEnding,
      openEditEnding,
      handleSaveEnding,
      removeEnding,
      nodeLabel,
      formatEndingConditions,
    } = useProjectEndings({ projectId: () => Number(props.projectId) })

    // CG 图鉴：列表读写、弹窗编排与解锁文案都在 useProjectCgs 内
    const {
      cgs,
      cgDialogVisible,
      editingCGId,
      cgSaving,
      cgInitial,
      describeCgUnlock,
      fetchCGs,
      openCreateCG,
      openEditCG,
      handleSaveCG,
      removeCG,
    } = useProjectCgs({
      projectId: () => Number(props.projectId),
      // CG 弹窗的「解锁条件」下拉复用结局列表
      ensureEndings: fetchEndings,
    })

    // 角色库：列表与搜索、角色抽屉表单、立绘与参数设置都在 useProjectCharacters 内
    const {
      avatarTypes, characters, characterAvatars, currentCharacterAvatars,
      characterSearch, loadingCharacters, filteredCharacters, totalAvatars,
      isAdd, characterDrawerVisible, currentCharacter, characterNameTranslations,
      avatarDialogVisible, newAvatar, selectedFile, previewImageUrl, selectedAvatar,
      layerDialogVisible, layerTargetAvatar, settingsDialogVisible, settingsArray,
      fetchCharacters, fetchCharacterAvatars, syncCurrentCharacterAvatars,
      showAddCharacterDialog, editCharacter, saveCharacter, deleteCharacter,
      showAddAvatarDialog, handleChange, addAvatar, selectAvatar, setDefaultAvatar,
      deleteAvatar, openLayerDialog, handleLayerChanged, getAvatarUrl, onAvatarImgError,
      showSettingsDialog, addSetting, removeSetting, renameSetting, updateSettingValue, updateSettings,
    } = useProjectCharacters({ projectId: () => Number(props.projectId) })

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
        await Promise.all([fetchCharacters(), fetchScenes(projectId)])
      } catch (error) {
        ElMessage.error('获取项目详情失败')
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

    // ==================== 生命周期 ====================
    onMounted(async () => {
      await fetchProjectDetails(props.projectId)
      const res = await getDialogueCount(props.projectId)
      totalDialogues.value = res?.length ?? 0
      await fetchVariables()
      await fetchEndings()
      await fetchCGs()
    })

    return {
      project, isAdd, selectedFile, characters, characterAvatars, scenes,
      currentCharacterAvatars, BASE_URL, activeTab,
      variables, variableDialogVisible, editingVariableId, variableSaving, variableInitial,
      missingBehaviorVariables, behaviorSaving, enableBehaviorVariables, isBehaviorVariable,
      fetchVariables, openCreateVariable, openEditVariable, handleSaveVariable, removeVariable,
      endings, endingDialogVisible, editingEndingId, endingSaving, endingInitial, nodeOptions,
      fetchEndings, openCreateEnding, openEditEnding, handleSaveEnding, removeEnding, nodeLabel, formatEndingConditions,
      cgs, cgDialogVisible, editingCGId, cgSaving, cgInitial,
      fetchCGs, openCreateCG, openEditCG, handleSaveCG, removeCG, describeCgUnlock,
      characterDrawerVisible, currentCharacter, characterNameTranslations,
      TRANSLATION_LANGUAGES, avatarDialogVisible, newAvatar,
      selectedAvatar, cutoutLoadingId, cutoutBatchRunning,
      cutoutDialogVisible, cutoutTarget, cutoutPercent, cutoutStage, cutoutStatus, cutoutError,
      stopCutoutTimer, retryCutout, batchCutout,
      settingsDialogVisible,
      characterSearch, loadingCharacters,
      avatarTypes, previewImageUrl, filteredCharacters, totalAvatars, totalDialogues,
      settingsArray,
      handleChange, getGenreColor,
      showAddCharacterDialog, editCharacter, saveCharacter, deleteCharacter,
      showAddAvatarDialog, addAvatar, selectAvatar, setDefaultAvatar, cutoutAvatar, deleteAvatar,
      layerDialogVisible, layerTargetAvatar,
      openLayerDialog, handleLayerChanged,
      showSettingsDialog, addSetting, removeSetting, renameSetting, updateSettingValue, updateSettings,
      getAvatarUrl, onAvatarImgError,
      // 补充原有方法的引用
      fetchProjectDetails
    }
  }
})
</script>
<style scoped lang="scss" src="./project/projectShell.scss"></style>
<style scoped lang="scss" src="./project/projectCharacters.scss"></style>
<style scoped lang="scss" src="./project/projectDialogs.scss"></style>
<style scoped lang="scss" src="./project/projectResponsive.scss"></style>
<style scoped lang="scss" src="./project/projectPanels.scss"></style>
