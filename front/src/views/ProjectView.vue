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
            <ProjectCharactersPanel
              :project-id="projectId"
              @stats-change="onCharacterStats"
            />
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

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { Character } from '@/api/character'
import { getProject, getDialogueCount, type Project } from '@/api/project'
import { getScenes, type Scene } from '@/api/scenes'
import { BASE_URL } from '@/utils/request'
import TechNavCircle from '@/components/TechNavCircle.vue'
import ProjectOverviewPanel from '@/components/project/ProjectOverviewPanel.vue'
import ProjectCharactersPanel from '@/components/project/ProjectCharactersPanel.vue'
import ProjectVariableDialog from '@/components/project/ProjectVariableDialog.vue'
import ProjectEndingDialog from '@/components/project/ProjectEndingDialog.vue'
import ProjectCgDialog from '@/components/project/ProjectCgDialog.vue'
import { useProjectVariables } from '@/composables/project/useProjectVariables'
import { useProjectEndings } from '@/composables/project/useProjectEndings'
import { useProjectCgs } from '@/composables/project/useProjectCgs'

const props = defineProps<{ projectId: number }>()

// 原有状态
const project = ref<Project | null>(null)
const totalDialogues = ref(0)
const scenes = ref<Scene[]>([])
const activeTab = ref('overview')

// 角色库归 ProjectCharactersPanel 所有，本页只留概览要用的两份派生值
const characters = ref<Character[]>([])
const totalAvatars = ref(0)

const onCharacterStats = (payload: { characters: Character[]; avatarCount: number }) => {
  characters.value = payload.characters
  totalAvatars.value = payload.avatarCount
}

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
    await fetchScenes(projectId)
  } catch (error) {
    ElMessage.error('获取项目详情失败')
  }
}

const fetchScenes = async (projectId: number) => {
  const res = await getScenes(projectId)
  scenes.value = res
}

// ==================== 生命周期 ====================
onMounted(async () => {
  await fetchProjectDetails(props.projectId)
  const res = await getDialogueCount(props.projectId)
  totalDialogues.value = res?.length ?? 0
  await fetchVariables()
  await fetchEndings()
  await fetchCGs()
})
</script>
<style scoped lang="scss" src="./project/projectShell.scss"></style>
<style scoped lang="scss" src="./project/projectDialogs.scss"></style>
<style scoped lang="scss" src="./project/projectResponsive.scss"></style>
<style scoped lang="scss" src="./project/projectPanels.scss"></style>
