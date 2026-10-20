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
              <!-- 基本信息卡片 -->
              <div class="info-card">
                <div class="card-header">
                  <el-icon><InfoFilled /></el-icon>
                  <span>基本信息</span>
                </div>
                <div class="info-grid">
                  <div class="info-row">
                    <span class="label">项目ID</span>
                    <span class="value">{{ project.project_id }}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">总字数</span>
                    <span class="value">{{ project.word_count }}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">创建时间</span>
                    <span class="value">{{ formatTime(project.created_at) }}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">更新时间</span>
                    <span class="value">{{ formatTime(project.updated_at) }}</span>
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

              <!-- 高级功能预览 -->
              <div class="preview-section">
                <button class="preview-btn" @click="openFeaturePreview">
                  <el-icon><View /></el-icon>
                  <span>高级功能预览</span>
                </button>
              </div>

              <div class="greeting-message">
                <p class="gradient-text">项目概览</p>
              </div>

              <!-- 功能预览弹窗 -->
              <el-dialog 
                v-model="showFeaturePreview" 
                title="可视化剧情树" 
                width="900px" 
                class="custom-dialog" 
                :close-on-click-modal="false"
              >
                <div class="feature-preview-content">
                  <!-- 工具栏 -->
                  <div class="canvas-toolbar">
                    <span class="toolbar-title">
                      剧情树编辑器 — 当前项目：{{ project?.title || '未命名' }}（{{ flowNodes.length }}个节点）
                    </span>
                    <div class="toolbar-actions">
                      <button class="tool-btn" @click="zoomIn">🔍+</button>
                      <button class="tool-btn" @click="zoomOut">🔍-</button>
                      <button class="tool-btn" @click="resetCanvas">↺ 重置</button>
                      <button class="tool-btn" @click="refreshCanvas">🔄 刷新数据</button>
                      <button class="tool-btn" @click="openNodeEditor">🧩 节点级编辑</button>
                    </div>
                  </div>
                  
                  <!-- 可拖拽画布 -->
                  <div 
                    class="flow-canvas-wrapper"
                    ref="canvasWrapper"
                    @wheel.prevent="handleWheel"
                    @mousedown="startPan"
                    @mousemove="onPan"
                    @mouseup="endPan"
                    @mouseleave="endPan"
                  >
                    <!-- 加载状态 -->
                    <div v-if="canvasLoading" class="canvas-status">
                      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
                      <p>正在从服务器加载场景数据...</p>
                    </div>

                    <!-- 空状态 -->
                    <div v-else-if="flowNodes.length === 0" class="canvas-status">
                      <el-icon :size="32"><WarningFilled /></el-icon>
                      <p>当前项目暂无场景</p>
                      <p style="font-size: 12px; color: #999; margin-top: 8px;">请先在“场景编辑”中创建场景，再打开此预览</p>
                    </div>

                    <!-- 画布内容 -->
                    <div v-else
                      class="flow-canvas-inner"
                      :style="{
                        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
                        transformOrigin: '0 0'
                      }"
                    >
                      <!-- SVG连线 -->
                      <svg class="flow-svg" :width="canvasWidth" :height="canvasHeight">
                        <g v-for="(edge, i) in edges" :key="'e'+i">
                          <line 
                            :x1="edge.x1" :y1="edge.y1" 
                            :x2="edge.x2" :y2="edge.y2"
                            :stroke="edge.kind === 'branch' ? '#ff8fab' : '#cbd5e1'"
                            :stroke-width="edge.kind === 'branch' ? 2.5 : 1.5"
                            :stroke-dasharray="edge.kind === 'branch' ? '' : '6 4'"
                            :marker-end="edge.kind === 'branch' ? 'url(#arrowhead)' : 'url(#arrowhead-seq)'"
                          >
                            <title>{{ edge.kind === 'branch' ? ('分支：' + (edge.choice || '（无选项文案）')) : '顺序播放' }}</title>
                          </line>
                          <text
                            v-if="edge.kind === 'branch' && edge.choice"
                            :x="(edge.x1 + edge.x2) / 2"
                            :y="(edge.y1 + edge.y2) / 2 - 4"
                            text-anchor="middle"
                            font-size="11"
                            fill="#c81f4a"
                          >{{ edge.choice.length > 12 ? edge.choice.slice(0, 12) + '…' : edge.choice }}</text>
                        </g>
                        <defs>
                          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="#ff8fab"/>
                          </marker>
                          <marker id="arrowhead-seq" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                            <polygon points="0 0, 8 3, 0 6" fill="#cbd5e1"/>
                          </marker>
                        </defs>
                      </svg>
                      
                      <!-- 节点  -->
                      <div 
                        v-for="node in flowNodes" 
                        :key="node.id"
                        class="flow-node"
                        :class="[node.type, { selected: selectedNode?.id === node.id }]"
                        :style="{ left: node.x + 'px', top: node.y + 'px' }"
                        @mousedown.stop="startDragNode($event, node)"
                        @click.stop="selectNode(node)"
                      >
                        <span class="node-icon">{{ node.icon }}</span>
                        <span class="node-label">{{ node.label }}</span>
                        <span class="node-order">#{{ node.order }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- 节点属性面板 -->
                  <div v-if="selectedNode" class="node-props-panel">
                    <h5>{{ selectedNode.icon }} {{ selectedNode.label }}</h5>
                    <div class="prop-row">
                      <span>场景ID：</span>
                      <span>{{ selectedNode.sceneId }}</span>
                    </div>
                    <div class="prop-row">
                      <span>序号：</span>
                      <span>第 {{ selectedNode.order }} 幕</span>
                    </div>
                    <div class="prop-row">
                      <span>描述：</span>
                      <span>{{ selectedNode.scene || '暂无描述' }}</span>
                    </div>
                    <div class="prop-row">
                      <span>类型：</span>
                      <span>{{ selectedNode.type === 'start' ? '起始场景' : selectedNode.type === 'ending' ? '结局场景' : selectedNode.type === 'branch' ? '分支场景' : '中间场景' }}</span>
                    </div>
                    <div v-if="selectedNode.choiceCount" class="prop-row">
                      <span>选择项：</span>
                      <span>该场景含 {{ selectedNode.choiceCount }} 条「选择」类型内容</span>
                    </div>
                    <div v-if="selectedNode.branchOut" class="prop-row">
                      <span>分叉：</span>
                      <span>该场景存在多选分支出口</span>
                    </div>
                  </div>

                  <!-- FSM 剧情链校验面板（第 2 批） -->
                  <div v-if="storyValidation" class="story-check-panel">
                    <div class="check-head">
                      <span class="check-title">剧情链校验</span>
                      <el-tag
                        :type="storyValidation.ok ? 'success' : 'danger'"
                        size="small"
                        effect="dark"
                      >{{ storyValidation.ok ? '结构正常' : (storyValidation.errors.length + ' 个问题') }}</el-tag>
                      <span class="check-stats">
                        节点 {{ storyValidation.summary.nodes }} ·
                        分支 {{ storyValidation.summary.edges }} ·
                        结局 {{ storyValidation.summary.endings }} ·
                        路径 {{ storyValidation.summary.path_count < 0 ? '—' : storyValidation.summary.path_count }} ·
                        覆盖率 {{ Math.round((storyValidation.summary.coverage || 0) * 100) }}%
                      </span>
                    </div>

                    <div v-if="storyValidation.errors.length" class="check-list error">
                      <div v-for="(it, i) in storyValidation.errors" :key="'ce'+i" class="check-item">
                        <span class="check-code">{{ it.code }}</span>
                        <span>{{ it.message }}</span>
                      </div>
                    </div>

                    <div v-if="storyValidation.warnings.length" class="check-list warn">
                      <div v-for="(it, i) in storyValidation.warnings" :key="'cw'+i" class="check-item">
                        <span class="check-code">{{ it.code }}</span>
                        <span>{{ it.message }}</span>
                      </div>
                    </div>

                    <div v-if="!storyValidation.errors.length && !storyValidation.warnings.length" class="check-ok">
                      未发现死循环、孤儿节点或未配置分支的选择节点
                    </div>
                  </div>

                  <!-- 底部说明 -->
                  <p class="feature-note">
                    节点数据来源：{{ graphSource === 'branch_paths'
                      ? 'branch_paths 真实分支拓扑（' + (storyGraph?.stats?.edge_count || 0) + ' 条分支）'
                      : 'scenes 表顺序（未检测到分支数据，已回退）' }}
                    &nbsp;|&nbsp;实线 = 玩家选择分支，虚线 = 顺序播放
                    &nbsp;|&nbsp;点击查看属性
                  </p>
                </div>
                <template #footer>
                  <button class="dialog-btn confirm" @click="showFeaturePreview = false">知道了</button>
                </template>
              </el-dialog>

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
                      <img :src="getAvatarUrl(row)" :alt="row.name" loading="lazy" decoding="async" />
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
                  </el-form>

                  <el-divider v-if="!isAdd">角色立绘</el-divider>

                  <div class="avatar-grid" v-if="!isAdd">
                    <div 
                      v-for="avatar in currentCharacterAvatars" 
                      :key="avatar.avatar_id"
                      class="avatar-card"
                      :class="{ selected: selectedAvatar?.avatar_id === avatar.avatar_id }"
                      @click="selectAvatar(avatar)"
                    >
                      <div class="avatar-image">
                        <img :src="BASE_URL + avatar.image_url" loading="lazy" decoding="async" />
                      </div>
                      <div class="avatar-info">
                        <span class="avatar-type">{{ avatar.avatar_type }}</span>
                        <span class="avatar-costume">{{ avatar.costume || '默认服装' }}</span>
                      </div>
                      <div class="avatar-actions">
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
                </div>
                <button class="primary-btn" @click="openCreateVariable">新建变量</button>
              </div>

              <el-table :data="variables" class="variables-table" v-if="variables.length">
                <el-table-column prop="label" label="展示名" min-width="120" />
                <el-table-column prop="name" label="变量名" min-width="120" />
                <el-table-column prop="initial_value" label="初始值" width="90" />
                <el-table-column label="范围" width="120">
                  <template #default="{ row }">
                    {{ row.min_value ?? '-' }} ~ {{ row.max_value ?? '-' }}
                  </template>
                </el-table-column>
                <el-table-column prop="description" label="说明" min-width="140" />
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
          
          <!-- 场景编辑 -->
          <el-tab-pane label="场景编辑" name="scenes">
            <ScenesManage :projectId="projectId.toString()"/>
          </el-tab-pane>
        </el-tabs>

        <!-- 变量编辑 -->
        <el-dialog v-model="variableDialogVisible"
                   :title="editingVariableId ? '编辑变量' : '新建变量'"
                   width="480px" class="custom-dialog">
          <el-form label-position="top">
            <el-form-item label="展示名" required>
              <el-input v-model="variableForm.label" placeholder="如：林瑶好感度" />
            </el-form-item>
            <el-form-item label="变量名（英文 key）" required>
              <el-input v-model="variableForm.name" placeholder="affection_lin"
                        :disabled="!!editingVariableId" />
            </el-form-item>
            <el-form-item label="初始值">
              <el-input v-model="variableForm.initial_value" placeholder="0" />
            </el-form-item>
            <div class="variable-range">
              <el-form-item label="最小值">
                <el-input v-model="variableForm.min_value" placeholder="留空表示不限" />
              </el-form-item>
              <el-form-item label="最大值">
                <el-input v-model="variableForm.max_value" placeholder="留空表示不限" />
              </el-form-item>
            </div>
            <el-form-item label="说明">
              <el-input v-model="variableForm.description" placeholder="可选" />
            </el-form-item>
          </el-form>
          <template #footer>
            <button class="dialog-btn cancel" @click="variableDialogVisible = false">取消</button>
            <button class="dialog-btn confirm" @click="saveVariable" :disabled="variableSaving">保存</button>
          </template>
        </el-dialog>

        <!-- 结局编辑 -->
        <el-dialog v-model="endingDialogVisible"
                   :title="editingEndingId ? '编辑结局' : '新建结局'"
                   width="560px" class="custom-dialog">
          <el-form label-position="top">
            <el-form-item label="结局标题" required>
              <el-input v-model="endingForm.title" placeholder="如：林瑶的告白" />
            </el-form-item>
            <el-form-item label="结局描述">
              <el-input v-model="endingForm.description" type="textarea" :rows="3"
                        placeholder="结局页展示的文字" />
            </el-form-item>
            <el-form-item label="触发节点" required>
              <el-select v-model="endingForm.content_id" placeholder="选择到达哪个节点时判定"
                         style="width: 100%" filterable>
                <el-option v-for="n in storyNodes" :key="n.content_id"
                           :label="nodeLabel(n.content_id)" :value="n.content_id" />
              </el-select>
            </el-form-item>
            <el-form-item label="触发条件（全部成立）">
              <div class="ending-conditions">
                <div v-for="(c, ci) in endingForm.conditions" :key="ci" class="ending-condition-row">
                  <el-select v-model="c.variable" size="small" placeholder="变量" class="condition-var">
                    <el-option v-for="v in variables" :key="v.variable_id"
                               :label="v.label" :value="v.name" />
                  </el-select>
                  <el-select v-model="c.op" size="small" class="condition-op">
                    <el-option label="≥" value=">=" />
                    <el-option label=">" value=">" />
                    <el-option label="≤" value="<=" />
                    <el-option label="<" value="<" />
                    <el-option label="=" value="==" />
                    <el-option label="≠" value="!=" />
                  </el-select>
                  <el-input-number v-model="c.value" size="small" :step="1" class="condition-value" />
                  <button class="action-btn delete" @click="removeEndingCondition(ci)">删除</button>
                </div>
                <button class="action-btn" @click="addEndingCondition">添加条件</button>
              </div>
            </el-form-item>
          </el-form>
          <template #footer>
            <button class="dialog-btn cancel" @click="endingDialogVisible = false">取消</button>
            <button class="dialog-btn confirm" @click="saveEnding" :disabled="endingSaving">保存</button>
          </template>
        </el-dialog>

        <!-- CG 编辑 -->
        <el-dialog v-model="cgDialogVisible"
                   :title="editingCGId ? '编辑 CG' : '添加 CG'"
                   width="520px" class="custom-dialog">
          <el-form label-position="top">
            <el-form-item label="标题" required>
              <el-input v-model="cgForm.title" placeholder="如：雨中告白" />
            </el-form-item>
            <el-form-item label="CG 图片" required>
              <div class="cg-image-picker">
                <img v-if="cgForm.image_url" :src="BASE_URL + cgForm.image_url"
                     class="cg-thumb-lg" alt="CG 预览" />
                <div v-else class="cg-thumb-lg cg-thumb-empty">未选择图片</div>
                <div class="cg-image-actions">
                  <input ref="cgFileInput" type="file" accept="image/*" style="display: none"
                         @change="onCGFileChange" />
                  <button class="action-btn" @click="pickCGFile" :disabled="cgUploading">
                    {{ cgUploading ? '上传中…' : '上传本地图片' }}
                  </button>
                  <button class="action-btn" @click="openCGMarketPicker">从市场选 CG</button>
                </div>
              </div>
            </el-form-item>
            <el-form-item label="说明">
              <el-input v-model="cgForm.description" type="textarea" :rows="2"
                        placeholder="可选，鉴赏页展示的文字" />
            </el-form-item>
            <el-form-item label="解锁条件">
              <el-select v-model="cgForm.unlock_ending_id" clearable style="width: 100%"
                         placeholder="初始可见（无需解锁）">
                <el-option v-for="e in endings" :key="e.ending_id"
                           :label="e.title" :value="e.ending_id" />
              </el-select>
            </el-form-item>
          </el-form>
          <template #footer>
            <button class="dialog-btn cancel" @click="cgDialogVisible = false">取消</button>
            <button class="dialog-btn confirm" @click="saveCG" :disabled="cgSaving">保存</button>
          </template>
        </el-dialog>

        <!-- 从市场选 CG 素材 -->
        <el-dialog v-model="cgMarketVisible" title="选择市场 CG 素材" width="480px" class="custom-dialog">
          <el-select v-model="cgMarketSelected" filterable placeholder="搜索「CG」类型素材"
                     style="width: 100%" :loading="cgMarketLoading">
            <el-option v-for="r in cgMarketOptions" :key="r.resource_id"
                       :label="`${r.title}（${r.username || '匿名'}）`" :value="r.resource_id" />
          </el-select>
          <p class="variables-tip" style="margin-top: 10px">
            选择后会引用该素材（计入素材引用数），并自动带出图片地址。
          </p>
          <div v-if="!cgMarketLoading && !cgMarketOptions.length" class="variables-empty">
            市场上还没有「CG」类型素材。
          </div>
          <template #footer>
            <button class="dialog-btn cancel" @click="cgMarketVisible = false">取消</button>
            <button class="dialog-btn confirm" @click="applyCGMarket" :disabled="!cgMarketSelected">确定</button>
          </template>
        </el-dialog>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, defineComponent, onMounted, computed, onUnmounted, watch } from 'vue'
import { 
  DocumentAdd, VideoPlay, InfoFilled, Notebook, Edit, User, Picture, 
  Film, ChatLineRound, Loading, Plus, Search, Sort, Close, Refresh,
  ArrowUp, ArrowDown, Share, Microphone, UploadFilled, View, WarningFilled
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getProject, getDialogueCount } from '@/api/project'
import { getCharacters, getCharacterAvatarsBatch, createCharacter, updateCharacter, deleteCharacter_by_Id, uploadCharacterAvatar, deleteCharacterAvatar, updateCharacterAvatar } from '@/api/character'
import type { AvatarType } from '@/api/character'
import { getScenes, uploadSceneFile } from '@/api/scenes'
import { getDialoguesBySceneId } from '@/api/dialogue'
import { getStoryGraph } from '@/api/branch'
import { listVariables, createVariable, updateVariable, deleteVariable } from '@/api/variable'
import { listEndings, createEnding, updateEnding, deleteEnding } from '@/api/ending'
import { listCGs, createCG, updateCG, deleteCG } from '@/api/cg'
import { searchResources, getResourceDetail } from '@/api/market'
import { BASE_URL } from '@/utils/request'
import ScenesManage from '@/components/ScenesManage.vue'
import StoryGraphEditor from '@/components/StoryGraphEditor.vue'
import TechNavCircle from '@/components/TechNavCircle.vue'

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
  created_at: string
  updated_at: string
}

interface Character {
  character_id: number
  project_id: number
  name: string
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
    Film, ChatLineRound, Loading, Plus, Search, Sort, Close, Refresh,
    ArrowUp, ArrowDown, Share, Microphone, UploadFilled, View, WarningFilled,
    ScenesManage, TechNavCircle
  },
  props: {
    projectId: { type: Number, required: true }
  },
  setup(props) {
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

    // 项目变量
    const variables = ref<any[]>([])
    const variableDialogVisible = ref(false)
    const editingVariableId = ref<number | null>(null)
    const variableSaving = ref(false)
    const variableForm = ref({
      label: '',
      name: '',
      initial_value: '0',
      min_value: '',
      max_value: '',
      description: '',
    })

    // 结局
    const endings = ref<any[]>([])
    const endingDialogVisible = ref(false)
    const editingEndingId = ref<number | null>(null)
    const endingSaving = ref(false)
    const storyNodes = ref<any[]>([])
    const endingForm = ref({
      title: '',
      description: '',
      content_id: null as number | null,
      conditions: [] as { variable: string; op: string; value: number }[],
    })

    // CG 图鉴
    const cgs = ref<any[]>([])
    const cgDialogVisible = ref(false)
    const editingCGId = ref<number | null>(null)
    const cgSaving = ref(false)
    const cgUploading = ref(false)
    const cgFileInput = ref<HTMLInputElement | null>(null)
    const cgForm = ref({
      title: '',
      description: '',
      image_url: '',
      resource_id: null as number | null,
      unlock_ending_id: null as number | null,
    })
    const cgMarketVisible = ref(false)
    const cgMarketLoading = ref(false)
    const cgMarketOptions = ref<any[]>([])
    const cgMarketSelected = ref<number | null>(null)
    const characterDrawerVisible = ref(false)
    const currentCharacter = ref<Character | null>(null)
    const avatarDialogVisible = ref(false)
    const newAvatar = ref<Partial<CharacterAvatar>>({ avatar_type: '正常', is_default: false })
    const selectedAvatar = ref<CharacterAvatar | null>(null)
    const settingsDialogVisible = ref(false)
    const showFeaturePreview = ref(false)
    const showNodeEditor = ref(false)
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

    // 画布状态
    const scale = ref(1)
    const panOffset = ref({ x: 0, y: 0 })
    const canvasWidth = 1000
    const canvasHeight = 600
    const selectedNode = ref<any>(null)
    const canvasLoading = ref(false)
    const flowNodes = ref<any[]>([])
    const edges = ref<any[]>([])
    // 第 2 批：真实剧情拓扑（branch_paths）与 FSM 校验结果
    const storyGraph = ref<any>(null)
    const storyValidation = ref<any>(null)
    const graphSource = ref<'branch_paths' | 'scenes'>('scenes')

    // 画布交互逻辑
    const isPanning = ref(false)
    const panStart = ref({ x: 0, y: 0 })
    const draggingNode = ref<any>(null)
    const dragOffset = ref({ x: 0, y: 0 })

    const zoomIn = () => { scale.value = Math.min(2, scale.value + 0.1) }
    const zoomOut = () => { scale.value = Math.max(0.3, scale.value - 0.1) }
    const resetCanvas = () => { scale.value = 1; panOffset.value = { x: 0, y: 0 }; selectedNode.value = null }
    const refreshCanvas = async () => { await generateFlowFromScenes(); ElMessage.success('画布已刷新') }

    const handleWheel = (e: WheelEvent) => {
      scale.value = Math.max(0.3, Math.min(2, scale.value - e.deltaY * 0.001))
    }

    const startPan = (e: MouseEvent) => {
      if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('flow-canvas-wrapper')) {
        isPanning.value = true
        panStart.value = { x: e.clientX - panOffset.value.x, y: e.clientY - panOffset.value.y }
      }
    }

    const onPan = (e: MouseEvent) => {
      if (isPanning.value && !draggingNode.value) {
        panOffset.value = { x: e.clientX - panStart.value.x, y: e.clientY - panStart.value.y }
      }
      if (draggingNode.value) {
        draggingNode.value.x = e.clientX - dragOffset.value.x
        draggingNode.value.y = e.clientY - dragOffset.value.y
      }
    }

    const endPan = () => { isPanning.value = false; draggingNode.value = null }

    const startDragNode = (e: MouseEvent, node: any) => {
      draggingNode.value = node
      dragOffset.value = { x: e.clientX - node.x, y: e.clientY - node.y }
    }

    const selectNode = (node: any) => { selectedNode.value = node }

    // scenes实时生成画布节点
    // 第 2 批改造：优先读取 branch_paths 的真实拓扑（后端 /project/story_graph），
    // 把「剧情节点级」的边聚合到「场景级」展示；接口不可用时回退到旧的按场景顺序连线。
    const generateFlowFromScenes = async () => {
      if (!scenes.value || scenes.value.length === 0) {
        flowNodes.value = []
        edges.value = []
        storyGraph.value = null
        storyValidation.value = null
        return
      }

      canvasLoading.value = true

      // ---- 1. 拉真实拓扑（失败则回退） ----
      let graph: any = null
      try {
        graph = await getStoryGraph(props.projectId)
      } catch (e) {
        console.warn('剧情拓扑接口不可用，回退到场景顺序视图：', e)
        graph = null
      }
      storyGraph.value = graph
      storyValidation.value = graph?.validation || null
      graphSource.value = graph ? 'branch_paths' : 'scenes'

      const sortedScenes = [...scenes.value].sort((a, b) => a.order_num - b.order_num)
      const nodes: any[] = []
      const lines: any[] = []

      const startX = 400
      const startY = 40
      const rowHeight = 140
      const colWidth = 260

      // ---- 2. 计算场景级坐标 ----
      const posOf: Record<number, { x: number; y: number }> = {}
      sortedScenes.forEach((scene, index) => {
        const row = Math.floor(index / 3)
        const col = index % 3
        const totalInRow = Math.min(sortedScenes.length - row * 3, 3)
        const rowStartX = startX - (totalInRow - 1) * colWidth / 2
        posOf[scene.scene_id] = { x: rowStartX + col * colWidth, y: startY + row * rowHeight }
      })

      // ---- 3. 按场景聚合剧情节点统计 ----
      const sceneStat: Record<number, any> = {}
      const contentToScene: Record<number, number> = {}
      if (graph) {
        for (const n of graph.nodes || []) {
          contentToScene[n.content_id] = n.scene_id
          const st = sceneStat[n.scene_id] || (sceneStat[n.scene_id] = {
            dialogue: 0, narration: 0, choice: 0, isStart: false, isEnding: false, hasBranchOut: false,
          })
          if (n.content_type === '对话') st.dialogue++
          else if (n.content_type === '描述') st.narration++
          else if (n.content_type === '选择') st.choice++
        }
        const v = graph.validation
        if (v) {
          if (v.primary_start != null) {
            const sid = contentToScene[v.primary_start]
            if (sid != null && sceneStat[sid]) sceneStat[sid].isStart = true
          }
          for (const t of v.terminal_nodes || []) {
            const sid = contentToScene[t]
            if (sid != null && sceneStat[sid]) sceneStat[sid].isEnding = true
          }
        }
        // 哪些场景有真实分叉出口
        const outCount: Record<number, number> = {}
        for (const e of graph.edges || []) {
          outCount[e.source_content_id] = (outCount[e.source_content_id] || 0) + 1
        }
        for (const cid of Object.keys(outCount)) {
          if (outCount[Number(cid)] >= 2) {
            const sid = contentToScene[Number(cid)]
            if (sid != null && sceneStat[sid]) sceneStat[sid].hasBranchOut = true
          }
        }
      }

      // ---- 4. 生成节点 ----
      sortedScenes.forEach((scene, index) => {
        const { x, y } = posOf[scene.scene_id]
        const st = sceneStat[scene.scene_id]

        let nodeType = 'middle'
        let icon = '📖'

        if (st?.isStart) {
          nodeType = 'start'; icon = '🎬'
        } else if (st?.isEnding) {
          nodeType = 'ending'; icon = '🏁'
        } else if (st?.hasBranchOut || (st?.choice || 0) > 0) {
          nodeType = 'branch'; icon = '🔀'
        } else if (!graph && index === 0) {
          // 回退模式：沿用旧的「第一个场景 = 起始」规则
          nodeType = 'start'; icon = '🎬'
        } else if (!graph) {
          // 回退模式：标题关键词猜测
          if (scene.title?.includes('结局') || scene.title?.includes('最终') ||
              scene.title?.includes('尾声') || scene.title?.includes('结尾') ||
              scene.title?.includes('结束') || scene.title?.includes('终')) {
            nodeType = 'ending'; icon = '🏁'
          } else if (scene.title?.includes('分支') || scene.title?.includes('选择') ||
                     scene.title?.includes('分岔') || scene.title?.includes('岔路')) {
            nodeType = 'branch'; icon = '🔀'
          }
        }

        const statText = st
          ? `对话${st.dialogue} · 旁白${st.narration}${st.choice ? ' · 选择' + st.choice : ''}`
          : (scene.description || `第${scene.order_num}幕`)

        nodes.push({
          id: `scene_${scene.scene_id}`,
          x, y,
          icon,
          label: scene.title || `场景${scene.order_num}`,
          type: nodeType,
          scene: statText,
          order: scene.order_num,
          sceneId: scene.scene_id,
          choiceCount: st?.choice || 0,
          branchOut: st?.hasBranchOut || false,
        })
      })

      // ---- 5. 生成连线 ----
      const scenePairSeen = new Set<string>()
      if (graph && (graph.edges || []).length) {
        // 5.1 真实跨场景分支（带选项文案）
        for (const e of graph.edges) {
          const s = contentToScene[e.source_content_id]
          const t = contentToScene[e.target_content_id]
          if (s == null || t == null || s === t) continue
          const key = `${s}->${t}`
          if (scenePairSeen.has(key)) continue
          scenePairSeen.add(key)
          const a = posOf[s], b = posOf[t]
          if (!a || !b) continue
          lines.push({
            x1: a.x + 50, y1: a.y + 30,
            x2: b.x, y2: b.y + 15,
            choice: e.choice_text || '',
            kind: 'branch',
          })
        }
      }

      // 5.2 顺序连线（补足未被分支覆盖的场景衔接，还原自然播放流）
      sortedScenes.forEach((scene, index) => {
        if (index >= sortedScenes.length - 1) return
        const next = sortedScenes[index + 1]
        const key = `${scene.scene_id}->${next.scene_id}`
        if (scenePairSeen.has(key)) return
        const a = posOf[scene.scene_id], b = posOf[next.scene_id]
        if (!a || !b) return
        scenePairSeen.add(key)
        lines.push({
          x1: a.x + 50, y1: a.y + 30,
          x2: b.x, y2: b.y + 15,
          choice: '',
          kind: 'sequence',
        })
      })

      flowNodes.value = nodes
      edges.value = lines
      canvasLoading.value = false
    }

    // 从「场景编辑」改完分支再切回概览时，自动刷新剧情树，避免看到旧拓扑
    watch(activeTab, (tab) => {
      if (tab === 'overview') generateFlowFromScenes()
    })

    // 打开弹窗（确保场景数据已加载）
    const openFeaturePreview = async () => {
      showFeaturePreview.value = true
      if (scenes.value.length === 0) {
        await fetchScenes(props.projectId)
      }
      await generateFlowFromScenes()
    }

    // 第 10 批：节点级剧情图编辑器（content-level 节点 + 拖拽连线 + 条件编辑）
    const openNodeEditor = () => {
      showNodeEditor.value = true
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
      isAdd.value = true
      currentCharacterAvatars.value = []
      characterDrawerVisible.value = true
    }

    const editCharacter = (character: Character) => {
      currentCharacter.value = { ...character }
      characterDrawerVisible.value = true
      isAdd.value = false
      fetchCharacterAvatarsForCharacter(character.character_id)
    }

    const fetchCharacterAvatarsForCharacter = (characterId: number) => {
      currentCharacterAvatars.value = characterAvatars.value.filter(a => a.character_id === characterId)
    }

    const saveCharacter = () => {
      if (!currentCharacter.value) return
      if (currentCharacter.value.character_id === 0) {
        createCharacter(currentCharacter.value)
        characters.value.push(currentCharacter.value)
        ElMessage.success('角色添加成功')
        setTimeout(() => location.reload(), 1500)
      } else {
        updateCharacter(currentCharacter.value)
        const index = characters.value.findIndex(c => c.character_id === currentCharacter.value?.character_id)
        if (index !== -1) { characters.value[index] = { ...currentCharacter.value }; ElMessage.success('角色更新成功') }
      }
      characterDrawerVisible.value = false
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
      return "/src/assets/default.jpg"
    }

    const startVoice = (voice_url: string) => {
      const audio = new Audio(BASE_URL + voice_url)
      audio.play().catch(error => console.error("播放失败:", error))
    }

    // ==================== 项目变量 ====================
    const fetchVariables = async () => {
      try {
        variables.value = await listVariables(Number(props.projectId))
      } catch (e) {
        console.warn('读取变量失败:', e)
        variables.value = []
      }
    }

    const resetVariableForm = () => {
      variableForm.value = {
        label: '',
        name: '',
        initial_value: '0',
        min_value: '',
        max_value: '',
        description: '',
      }
    }

    const openCreateVariable = () => {
      editingVariableId.value = null
      resetVariableForm()
      variableDialogVisible.value = true
    }

    const openEditVariable = (row: any) => {
      editingVariableId.value = row.variable_id
      variableForm.value = {
        label: row.label || '',
        name: row.name || '',
        initial_value: String(row.initial_value ?? 0),
        min_value: row.min_value == null ? '' : String(row.min_value),
        max_value: row.max_value == null ? '' : String(row.max_value),
        description: row.description || '',
      }
      variableDialogVisible.value = true
    }

    const parseOptionalInt = (value: string) => {
      if (value === '' || value === null || value === undefined) return null
      const n = Number(value)
      return Number.isFinite(n) ? Math.trunc(n) : null
    }

    const saveVariable = async () => {
      const label = variableForm.value.label.trim()
      const name = variableForm.value.name.trim()
      if (!label) {
        ElMessage.warning('请填写展示名')
        return
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,49}$/.test(name)) {
        ElMessage.warning('变量名只能包含字母/数字/下划线，且以字母或下划线开头')
        return
      }
      const payload = {
        name,
        label,
        initial_value: parseOptionalInt(variableForm.value.initial_value) ?? 0,
        min_value: parseOptionalInt(variableForm.value.min_value),
        max_value: parseOptionalInt(variableForm.value.max_value),
        description: variableForm.value.description.trim(),
      }
      variableSaving.value = true
      try {
        if (editingVariableId.value) {
          await updateVariable(Number(props.projectId), editingVariableId.value, payload)
          ElMessage.success('变量已更新')
        } else {
          await createVariable(Number(props.projectId), payload)
          ElMessage.success('变量已创建')
        }
        variableDialogVisible.value = false
        await fetchVariables()
      } catch (e: any) {
        ElMessage.error(e?.response?.data?.message || e?.message || '保存变量失败')
      } finally {
        variableSaving.value = false
      }
    }

    const removeVariable = async (row: any) => {
      try {
        await ElMessageBox.confirm(
          `删除变量「${row.label}」？引用它的节点数值变化也会被清除。`,
          '删除变量',
          { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
        )
        await deleteVariable(Number(props.projectId), row.variable_id)
        ElMessage.success('变量已删除')
        await fetchVariables()
      } catch (e) {
        // 取消
      }
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

    const resetEndingForm = () => {
      endingForm.value = {
        title: '',
        description: '',
        content_id: null,
        conditions: [],
      }
    }

    const openCreateEnding = async () => {
      editingEndingId.value = null
      resetEndingForm()
      await loadStoryNodes()
      endingDialogVisible.value = true
    }

    const openEditEnding = async (row: any) => {
      editingEndingId.value = row.ending_id
      endingForm.value = {
        title: row.title || '',
        description: row.description || '',
        content_id: row.content_id,
        conditions: (row.conditions || []).map((c: any) => ({ ...c })),
      }
      await loadStoryNodes()
      endingDialogVisible.value = true
    }

    const addEndingCondition = () => {
      endingForm.value.conditions.push({ variable: '', op: '>=', value: 0 })
    }

    const removeEndingCondition = (index: number) => {
      endingForm.value.conditions.splice(index, 1)
    }

    const saveEnding = async () => {
      const title = endingForm.value.title.trim()
      if (!title) {
        ElMessage.warning('请填写结局标题')
        return
      }
      if (!endingForm.value.content_id) {
        ElMessage.warning('请选择触发节点')
        return
      }
      const conditions = endingForm.value.conditions
        .filter(c => c.variable)
        .map(c => ({
          variable: c.variable,
          op: c.op || '>=',
          value: Math.trunc(Number(c.value) || 0),
        }))
      const payload = {
        title,
        description: endingForm.value.description.trim(),
        content_id: endingForm.value.content_id,
        conditions,
      }
      endingSaving.value = true
      try {
        if (editingEndingId.value) {
          await updateEnding(Number(props.projectId), editingEndingId.value, payload)
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

    const resetCGForm = () => {
      cgForm.value = {
        title: '',
        description: '',
        image_url: '',
        resource_id: null,
        unlock_ending_id: null,
      }
    }

    const openCreateCG = async () => {
      editingCGId.value = null
      resetCGForm()
      await fetchEndings()
      cgDialogVisible.value = true
    }

    const openEditCG = async (row: any) => {
      editingCGId.value = row.cg_id
      await fetchEndings()
      cgForm.value = {
        title: row.title || '',
        description: row.description || '',
        image_url: row.image_url || '',
        resource_id: row.resource_id ?? null,
        unlock_ending_id: row.unlock_ending_id ?? null,
      }
      cgDialogVisible.value = true
    }

    const pickCGFile = () => {
      cgFileInput.value?.click()
    }

    const onCGFileChange = async (event: Event) => {
      const input = event.target as HTMLInputElement
      const file = input.files?.[0]
      input.value = ''
      if (!file) return
      cgUploading.value = true
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('project_id', String(props.projectId))
        formData.append('file_type', 'image')
        const res: any = await uploadSceneFile(formData)
        const url = res?.data?.url
        if (!res?.success || !url) throw new Error(res?.error || '上传失败')
        cgForm.value.image_url = url
        cgForm.value.resource_id = null
        ElMessage.success('图片已上传')
      } catch (e: any) {
        ElMessage.error(e?.message || '图片上传失败')
      } finally {
        cgUploading.value = false
      }
    }

    const openCGMarketPicker = async () => {
      cgMarketSelected.value = null
      cgMarketVisible.value = true
      cgMarketLoading.value = true
      try {
        const res: any = await searchResources({ type: 'CG', page: 1, per_page: 50 } as any)
        cgMarketOptions.value = res?.data?.data?.resources || []
      } catch (e) {
        cgMarketOptions.value = []
      } finally {
        cgMarketLoading.value = false
      }
    }

    const applyCGMarket = async () => {
      if (!cgMarketSelected.value) return
      try {
        const res: any = await getResourceDetail(cgMarketSelected.value)
        const resource = res?.data?.data
        if (!resource?.file_url) throw new Error('素材缺少图片地址')
        cgForm.value.image_url = resource.file_url
        cgForm.value.resource_id = resource.resource_id
        if (!cgForm.value.title) cgForm.value.title = resource.title || ''
        cgMarketVisible.value = false
        ElMessage.success(`已选择素材「${resource.title}」`)
      } catch (e: any) {
        ElMessage.error(e?.response?.data?.message || e?.message || '读取素材失败')
      }
    }

    const saveCG = async () => {
      const title = cgForm.value.title.trim()
      if (!title) {
        ElMessage.warning('请填写 CG 标题')
        return
      }
      if (!cgForm.value.image_url && !cgForm.value.resource_id) {
        ElMessage.warning('请上传 CG 图片或选择市场素材')
        return
      }
      const payload = {
        title,
        description: cgForm.value.description.trim(),
        image_url: cgForm.value.image_url,
        resource_id: cgForm.value.resource_id,
        unlock_ending_id: cgForm.value.unlock_ending_id,
      }
      cgSaving.value = true
      try {
        if (editingCGId.value) {
          await updateCG(Number(props.projectId), editingCGId.value, payload)
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
      variables, variableDialogVisible, editingVariableId, variableSaving, variableForm,
      fetchVariables, openCreateVariable, openEditVariable, saveVariable, removeVariable,
      endings, endingDialogVisible, editingEndingId, endingSaving, storyNodes, endingForm,
      fetchEndings, openCreateEnding, openEditEnding, addEndingCondition, removeEndingCondition,
      saveEnding, removeEnding, nodeLabel, formatEndingConditions,
      cgs, cgDialogVisible, editingCGId, cgSaving, cgUploading, cgFileInput, cgForm,
      cgMarketVisible, cgMarketLoading, cgMarketOptions, cgMarketSelected,
      fetchCGs, openCreateCG, openEditCG, pickCGFile, onCGFileChange,
      openCGMarketPicker, applyCGMarket, saveCG, removeCG,
      characterDrawerVisible, currentCharacter, avatarDialogVisible, newAvatar,
      selectedAvatar, settingsDialogVisible, showFeaturePreview, showNodeEditor,
      sceneEditorVisible, currentScene, sceneCharacters, currentSceneBackground,
      previewMode, currentPreviewScene, currentPreviewContent, currentPreviewCharacters,
      editingDescription, characterSearch, loadingCharacters, loadingScenes,
      avatarTypes, previewImageUrl, filteredCharacters, totalAvatars, totalDialogues,
      settingsArray,
      formatTime, handleChange, getGenreColor, getContentTagType, getCharacterColor,
      showAddCharacterDialog, editCharacter, saveCharacter, deleteCharacter,
      showAddAvatarDialog, addAvatar, selectAvatar, setDefaultAvatar, deleteAvatar,
      showSettingsDialog, addSetting, removeSetting, updateSettings,
      fetchScenes, getNextScene,
      getAvatarUrl, startVoice,
      // 画布相关
      scale, panOffset, canvasWidth, canvasHeight, flowNodes, edges,
      selectedNode, canvasLoading,
      // 第 2 批：真实剧情拓扑 + FSM 校验
      storyGraph, storyValidation, graphSource,
      zoomIn, zoomOut, resetCanvas, refreshCanvas,
      handleWheel, startPan, onPan, endPan, startDragNode, selectNode,
      openFeaturePreview, openNodeEditor, generateFlowFromScenes,
      // 补充原有方法的引用
      fetchCharacters, fetchProjectDetails, fetchCharacterAvatars
    }
  }
})
</script>

<style scoped lang="scss">
$cg-pink: #ff8fab;
$cg-light-pink: #ffd1dc;
$cg-purple: #e2c3f2;
$cg-bg: #fff9fc;
$cg-card: #ffffff;
$cg-border: #f5d6e6;
$cg-text: #555555;
$cg-text-light: #999999;

.project-studio {
  min-height: 100vh;
  background: $cg-bg;
  padding: 80px 24px 40px;
}

.studio-container {
  max-width: 1400px;
  margin: 0 auto;
}

.studio-header {
  margin-bottom: 24px;
  
  .header-content {
    display: flex;
    align-items: center;
    gap: 20px;
    
    .project-title {
      margin: 0;
      font-size: 32px;
      font-weight: 700;
      color: #d65a99;
    }
    
    .genre-tag {
      padding: 6px 18px;
      border-radius: 30px;
      font-size: 14px;
      font-weight: 500;
      color: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }
}

.studio-main {
  background: $cg-card;
  border: 1px solid $cg-border;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(255, 143, 171, 0.08);
}

.custom-tabs {
  :deep(.el-tabs__header) {
    margin: 0 0 24px;
  }
  
  :deep(.el-tabs__nav-wrap::after) {
    background-color: $cg-border;
    height: 1px;
  }
  
  :deep(.el-tabs__item) {
    color: $cg-text-light;
    font-size: 16px;
    font-weight: 500;
    padding: 0 24px;
    height: 44px;
    line-height: 44px;
    
    &:hover {
      color: $cg-pink;
    }
    
    &.is-active {
      color: $cg-pink;
      font-weight: 600;
    }
  }
  
  :deep(.el-tabs__active-bar) {
    background: $cg-pink;
    height: 3px;
    border-radius: 3px;
  }
  
  :deep(.el-tab-pane) {
    color: $cg-text;
  }
}

// 概览页面
.overview-panel {
  .info-card {
    background: linear-gradient(135deg, #fff5f8 0%, #fef8ff 100%);
    border: 1px solid $cg-border;
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 30px;
    
    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      color: $cg-pink;
      font-size: 18px;
      font-weight: 600;
      
      .el-icon {
        font-size: 20px;
      }
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px 30px;
      
      .info-row {
        display: flex;
        align-items: center;
        
        .label {
          width: 90px;
          color: $cg-text-light;
          font-size: 14px;
        }
        
        .value {
          color: $cg-text;
          font-weight: 500;
        }
      }
    }
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 30px;
    
    .stat-card {
      background: $cg-card;
      border: 1px solid $cg-border;
      border-radius: 16px;
      padding: 24px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      transition: all 0.3s;
      
      &:hover {
        border-color: $cg-light-pink;
        transform: translateY(-4px);
        box-shadow: 0 8px 20px rgba(255, 143, 171, 0.12);
      }
      
      .stat-icon {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        
        &.user { 
          background: rgba(255, 143, 171, 0.1); 
          color: $cg-pink; 
        }
        &.picture { 
          background: rgba(226, 195, 242, 0.1); 
          color: $cg-purple; 
        }
        &.film { 
          background: rgba(168, 230, 207, 0.1); 
          color: #67d2b0; 
        }
        &.chat { 
          background: rgba(255, 214, 132, 0.1); 
          color: #ffc163; 
        }
      }
      
      .stat-content {
        .stat-value {
          display: block;
          font-size: 32px;
          font-weight: 700;
          color: #d65a99;
          line-height: 1.2;
        }
        
        .stat-label {
          color: $cg-text-light;
          font-size: 14px;
        }
      }
    }
  }
  
  // 高级功能预览
  .preview-section {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;

    .preview-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 24px;
      background: linear-gradient(135deg, #fff5f8, #fef8ff);
      border: 1px dashed #e2c3f2;
      border-radius: 30px;
      color: #c81f4a;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s;

      &:hover {
        background: linear-gradient(135deg, #ffe0ea, #f5e6ff);
        border-color: #ff8fab;
        transform: translateY(-2px);
        box-shadow: 0 4px 15px rgba(255, 143, 171, 0.15);
      }
    }
  }

  .greeting-message {
    text-align: center;
    padding: 20px;
    
    .gradient-text {
      font-size: 24px;
      font-weight: 600;
      background: linear-gradient(135deg, #ff8fab, #e2c3f2);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
  }
}

// 功能预览弹窗
.feature-preview-content {
  .canvas-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0 16px;
    
    .toolbar-title { font-size: 14px; font-weight: 600; color: #d65a99; }
    .toolbar-actions { display: flex; gap: 8px; }
    .tool-btn {
      padding: 4px 12px;
      background: #fff5f8;
      border: 1px solid #f8e1e8;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      color: #c81f4a;
      &:hover { background: #ffe0ea; }
    }
  }

  .flow-canvas-wrapper {
    width: 100%;
    height: 380px;
    background: linear-gradient(135deg, #fdf2f8 0%, #fef7ff 100%);
    border: 1px solid #f8e1e8;
    border-radius: 12px;
    overflow: hidden;
    cursor: grab;
    position: relative;
    
    &:active { cursor: grabbing; }
  }
  
  .flow-canvas-inner {
    position: relative;
    width: 900px;
    height: 400px;
    transition: none;
  }
  
  .flow-svg {
    position: absolute;
    top: 0; left: 0;
    pointer-events: none;
  }
  
  .flow-node {
    position: absolute;
    padding: 8px 14px;
    background: white;
    border: 2px solid #ffc0d0;
    border-radius: 10px;
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    transition: box-shadow 0.2s;
    z-index: 2;
    
    &:hover { box-shadow: 0 4px 16px rgba(255,143,171,0.2); }
    
    &.selected { border-color: #c81f4a; box-shadow: 0 0 0 3px rgba(200,31,74,0.15); }
    
    &.start { border-color: #90caf9; background: #e3f2fd; }
    &.ending { border-color: #a5d6a7; background: #e8f5e9; }
    &.branch { border-color: #ffcc80; background: #fff3e0; }
    
    .node-icon { font-size: 16px; }
    .node-label { font-weight: 500; color: #555; }
    
    .node-fsm-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      &.draft { background: #f5f5f5; color: #999; }
      &.ai_generated { background: #fff3e0; color: #e65100; }
      &.reviewed { background: #e8f5e9; color: #2e7d32; }
      &.published { background: #e3f2fd; color: #1565c0; }
    }
  }
  
  .node-props-panel {
    margin-top: 16px;
    padding: 16px;
    background: #fef8ff;
    border: 1px solid #f8e1e8;
    border-radius: 10px;
    
    h5 { margin: 0 0 12px; color: #c81f4a; font-size: 15px; }
    .prop-row {
      display: flex; gap: 8px;
      font-size: 13px; color: #777; margin-bottom: 6px;
      span:first-child { font-weight: 500; width: 80px; color: #999; }
    }
    .fsm-badge {
      padding: 2px 8px; border-radius: 10px; font-size: 11px;
      &.draft { background: #f5f5f5; color: #999; }
      &.ai_generated { background: #fff3e0; color: #e65100; }
      &.reviewed { background: #e8f5e9; color: #2e7d32; }
      &.published { background: #e3f2fd; color: #1565c0; }
    }
  }

  .feature-note {
    color: #b8a0aa;
    font-size: 12px;
    text-align: center;
    margin-top: 16px;
    padding: 8px;
    background: #fef8ff;
    border-radius: 8px;
  }

  /* 第 2 批：剧情链校验面板 */
  .story-check-panel {
    margin-top: 16px;
    padding: 14px 16px;
    background: #fbfbfe;
    border: 1px solid #e8e6f2;
    border-radius: 10px;
  }
  .check-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .check-title { font-weight: 600; color: #4b4b63; font-size: 14px; }
  .check-stats { font-size: 12px; color: #8b8b9e; }
  .check-list { margin-top: 8px; }
  .check-item {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 12.5px;
    line-height: 1.6;
    padding: 5px 0;
    border-top: 1px dashed #ececf3;
  }
  .check-item:first-child { border-top: none; }
  .check-list.error .check-item { color: #b42318; }
  .check-list.warn .check-item { color: #93610a; }
  .check-code {
    flex: 0 0 auto;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 4px;
    background: #f1f1f6;
    color: #6b6b80;
  }
  .check-ok { font-size: 12.5px; color: #2e7d32; }
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 80px;
  color: $cg-text-light;
  
  .spinner {
    width: 48px;
    height: 48px;
    border: 3px solid rgba(255, 143, 171, 0.2);
    border-top-color: $cg-pink;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

// 角色管理
.characters-panel {
  .panel-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    
    .primary-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: $cg-pink;
      border: none;
      border-radius: 30px;
      color: white;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s;
      box-shadow: 0 2px 10px rgba(255, 143, 171, 0.3);
      
      &:hover {
        transform: translateY(-2px);
        background: #ff7ba0;
        box-shadow: 0 4px 15px rgba(255, 143, 171, 0.4);
      }
    }
    
    .search-box {
      width: 280px;
      
      :deep(.el-input__wrapper) {
        background: #fff;
        border: 1px solid $cg-border;
        border-radius: 30px;
        box-shadow: none;
        padding: 4px 16px;
        
        .el-input__inner {
          color: $cg-text;
          
          &::placeholder {
            color: $cg-text-light;
          }
        }
        
        .el-input__prefix {
          color: $cg-pink;
        }
        
        &:hover, &.is-focus {
          border-color: $cg-pink;
        }
      }
    }
  }
  
  .custom-table {
    --el-table-row-hover-bg-color: #fff5f8;
    
    :deep(.el-table__header) {
      th {
        background: #fef8ff !important;
        border-bottom: 1px solid $cg-border !important;
        color: $cg-text-light;
        font-weight: 500;
        font-size: 14px;
      }
    }
    
    :deep(.el-table__body) {
      tr {
        background: transparent !important;
        
        td {
          border-bottom: 1px solid $cg-border !important;
          color: $cg-text;
        }
      }
    }
    
    .avatar-cell img {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      object-fit: cover;
      border: 2px solid $cg-border;
    }
    
    .status-badge {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      background: #f5f5f5;
      color: $cg-text-light;
      
      &.main {
        background: rgba(255, 143, 171, 0.1);
        color: $cg-pink;
      }
    }
    
    .action-btn {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      margin-right: 8px;
      
      &.edit {
        background: rgba(255, 143, 171, 0.1);
        color: $cg-pink;
        
        &:hover { 
          background: rgba(255, 143, 171, 0.2); 
        }
      }
      
      &.delete {
        background: rgba(255, 107, 107, 0.1);
        color: #ff6b6b;
        
        &:hover { 
          background: rgba(255, 107, 107, 0.2); 
        }
      }
    }
  }
}

// 抽屉
.custom-drawer {
  :deep(.el-drawer) {
    background: $cg-bg;
    border-left: 1px solid $cg-border;
  }
  
  :deep(.el-drawer__header) {
    padding: 20px 24px;
    border-bottom: 1px solid $cg-border;
    color: $cg-text;
    margin-bottom: 0;
    
    .el-drawer__title {
      font-size: 18px;
      font-weight: 600;
      color: #d65a99;
    }
    
    .el-drawer__close-btn {
      color: $cg-text-light;
      
      &:hover {
        color: $cg-pink;
      }
    }
  }
  
  :deep(.el-drawer__body) {
    padding: 24px;
  }
  
  :deep(.el-form-item__label) {
    color: $cg-text-light;
    font-weight: 500;
  }
  
  :deep(.el-input__wrapper) {
    background: #fff;
    border: 1px solid $cg-border;
    border-radius: 12px;
    box-shadow: none;
    
    .el-input__inner {
      color: $cg-text;
    }
    
    &:hover, &.is-focus {
      border-color: $cg-pink;
    }
  }
  
  :deep(.el-textarea__inner) {
    background: #fff;
    border: 1px solid $cg-border;
    border-radius: 12px;
    color: $cg-text;
    
    &:hover, &:focus {
      border-color: $cg-pink;
    }
  }
  
  :deep(.el-input-number) {
    .el-input__wrapper {
      background: #fff;
    }
  }
  
  :deep(.el-divider) {
    border-color: $cg-border;
    margin: 24px 0;
  }
  
  .drawer-content {
    .avatar-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-top: 16px;
      
      .avatar-card {
        background: #fff;
        border: 1px solid $cg-border;
        border-radius: 16px;
        padding: 16px;
        cursor: pointer;
        transition: all 0.3s;
        
        &:hover, &.selected {
          border-color: $cg-pink;
          background: #fff5f8;
          transform: translateY(-2px);
        }
        
        .avatar-image {
          width: 100%;
          aspect-ratio: 1;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 12px;
          background: #f9f9f9;
          
          img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
        }
        
        .avatar-info {
          text-align: center;
          margin-bottom: 12px;
          
          .avatar-type {
            display: block;
            color: $cg-text;
            font-weight: 500;
            margin-bottom: 4px;
          }
          
          .avatar-costume {
            color: $cg-text-light;
            font-size: 12px;
          }
        }
        
        .avatar-actions {
          display: flex;
          gap: 8px;
          
          .avatar-btn {
            flex: 1;
            padding: 6px;
            border-radius: 20px;
            font-size: 12px;
            cursor: pointer;
            background: #f9f9f9;
            border: 1px solid $cg-border;
            color: $cg-text-light;
            transition: all 0.2s;
            
            &:hover {
              background: #f0f0f0;
            }
            
            &.default {
              background: rgba(103, 210, 176, 0.1);
              border-color: rgba(103, 210, 176, 0.3);
              color: #67d2b0;
            }
            
            &.delete {
              background: rgba(255, 107, 107, 0.1);
              border-color: rgba(255, 107, 107, 0.3);
              color: #ff6b6b;
            }
          }
        }
      }
      
      .add-avatar-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 30px;
        background: #fef8ff;
        border: 2px dashed $cg-border;
        border-radius: 16px;
        color: $cg-text-light;
        cursor: pointer;
        transition: all 0.3s;
        
        &:hover {
          border-color: $cg-pink;
          color: $cg-pink;
          background: #fff5f8;
        }
        
        .el-icon {
          font-size: 32px;
        }
        
        span {
          font-size: 14px;
        }
      }
    }
    
    .drawer-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid $cg-border;
    }
  }
  
  .primary-btn {
    padding: 10px 24px;
    background: $cg-pink;
    border: none;
    border-radius: 30px;
    color: white;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s;
    
    &:hover {
      background: #ff7ba0;
      box-shadow: 0 4px 15px rgba(255, 143, 171, 0.3);
    }
  }
  
  .secondary-btn {
    padding: 10px 24px;
    background: transparent;
    border: 1px solid $cg-border;
    border-radius: 30px;
    color: $cg-text-light;
    cursor: pointer;
    transition: all 0.2s;
    
    &:hover {
      background: #fff5f8;
      color: $cg-text;
    }
  }
}

// 对话框
.custom-dialog {
  :deep(.el-dialog) {
    background: $cg-card;
    border: 1px solid $cg-border;
    border-radius: 20px;
    box-shadow: 0 10px 40px rgba(255, 143, 171, 0.15);
  }
  
  :deep(.el-dialog__header) {
    padding: 20px 24px 0;
    border-bottom: none;
    
    .el-dialog__title {
      color: #d65a99;
      font-size: 20px;
      font-weight: 600;
    }
    
    .el-dialog__headerbtn {
      .el-dialog__close {
        color: $cg-text-light;
        
        &:hover {
          color: $cg-pink;
        }
      }
    }
  }

  :deep(.el-dialog__body) {
    padding: 24px;
  }
  
  :deep(.el-dialog__footer) {
    padding: 0 24px 24px;
  }
  
  :deep(.el-form-item__label) {
    color: $cg-text-light;
  }
  
  :deep(.el-input__wrapper) {
    background: #fff;
    border: 1px solid $cg-border;
    border-radius: 12px;
    
    .el-input__inner {
      color: $cg-text;
    }
  }
  
  .type-options {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    
    .type-option {
      padding: 8px 16px;
      background: #f9f9f9;
      border: 1px solid $cg-border;
      border-radius: 30px;
      color: $cg-text-light;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      
      &:hover {
        background: #f0f0f0;
        color: $cg-text;
      }
      
      &.selected {
        background: $cg-pink;
        border-color: transparent;
        color: white;
      }
    }
  }
  
  .upload-area {
    padding: 30px;
    text-align: center;
    color: $cg-text-light;
    
    .el-icon {
      font-size: 40px;
      margin-bottom: 12px;
      color: $cg-pink;
    }
    
    p {
      margin: 0;
    }
  }
  
  :deep(.el-upload-dragger) {
    background: #fef8ff;
    border: 2px dashed $cg-border;
    border-radius: 16px;
    
    &:hover {
      border-color: $cg-pink;
    }
  }
  
  .preview-image {
    margin-top: 16px;
    text-align: center;
    
    img {
      max-width: 200px;
      max-height: 150px;
      border-radius: 12px;
      border: 1px solid $cg-border;
    }
  }
  
  .settings-panel {
    .secondary-btn {
      margin-bottom: 16px;
      
      &.small {
        padding: 8px 16px;
        font-size: 13px;
      }
    }
    
    .settings-table {
      background: transparent;
      
      :deep(.el-table__header) th {
        background: #fef8ff;
        border-bottom: 1px solid $cg-border;
        color: $cg-text-light;
      }
      
      :deep(.el-table__body) td {
        border-bottom: 1px solid $cg-border;
        color: $cg-text;
      }
      
      :deep(.el-input__wrapper) {
        background: #fff;
      }
    }
  }
  
  .dialog-btn {
    padding: 10px 24px;
    border-radius: 30px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s;
    border: none;
    
    &.cancel {
      background: transparent;
      border: 1px solid $cg-border;
      color: $cg-text-light;
      
      &:hover {
        background: #fff5f8;
        color: $cg-text;
      }
    }
    
    &.confirm {
      background: $cg-pink;
      color: white;
      margin-left: 12px;
      
      &:hover {
        background: #ff7ba0;
        box-shadow: 0 4px 15px rgba(255, 143, 171, 0.3);
      }
      
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }
    }
  }
}

// 响应式
@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr) !important;
  }
}

@media (max-width: 768px) {
  .project-studio {
    padding: 70px 16px 30px;
  }
  
  .studio-header .header-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    
    .project-title {
      font-size: 24px;
    }
  }
  
  .stats-grid {
    grid-template-columns: 1fr !important;
  }
  
  .panel-toolbar {
    flex-direction: column;
    gap: 16px;
    
    .search-box {
      width: 100% !important;
    }
  }
  
  .info-grid {
    grid-template-columns: 1fr !important;
  }
  
  .avatar-grid {
    grid-template-columns: 1fr !important;
  }
}

/* 项目变量 */
.variables-panel {
  padding: 8px 4px;
}

.variables-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.variables-header h3 {
  margin: 0 0 6px;
  color: #c81f4a;
}

.variables-tip {
  margin: 0;
  color: #888;
  font-size: 13px;
}

.variables-table {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

.variables-empty {
  padding: 40px;
  text-align: center;
  color: #999;
  background: #fff8fa;
  border-radius: 12px;
}

.variable-range {
  display: flex;
  gap: 12px;
}

.variable-range .el-form-item {
  flex: 1;
}

/* 结局条件 */
.ending-conditions {
  width: 100%;
}

.ending-condition-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.ending-condition-row .condition-var {
  flex: 1 1 160px;
  min-width: 130px;
}

.ending-condition-row .condition-op {
  flex: 0 0 80px;
}

.ending-condition-row .condition-value {
  flex: 0 0 120px;
}

/* CG 图鉴 */
.cg-thumb {
  display: block;
  width: 96px;
  height: 60px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #f0d5e2;
  background: #fff;
}

.cg-thumb-empty {
  color: #bbb;
  font-size: 12px;
}

.cg-image-picker {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  width: 100%;
}

.cg-thumb-lg {
  width: 150px;
  height: 96px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px dashed #f0d5e2;
  background: #fffafc;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 150px;
}

.cg-thumb-lg.cg-thumb-empty {
  font-size: 12px;
  color: #bbb;
}

.cg-image-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>