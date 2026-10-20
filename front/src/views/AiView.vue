<template>
  <div class="ai-studio">
    <TechNavCircle />
    
    <div class="studio-container">
      <!-- 头部 -->
      <div class="studio-header">
        <div class="header-content">
          <h1 class="studio-title">
            <span class="title-main">AI魔法工坊</span>
            <span class="title-sub">创作助手</span>
          </h1>
          <p class="studio-desc">用AI的力量创造你的视觉小说世界 ✨</p>
        </div>
      </div>

      <!-- 模型选择 -->
      <div class="model-selector-wrapper">
        <div class="model-selector" v-if="activeTab === 'text'">
          <el-select v-model="selectedTextModel" placeholder="选择文本模型" class="model-dropdown">
            <el-option v-for="item in textModels" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-tooltip content="选择适合的文本生成模型" placement="right">
            <el-icon class="help-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>

        <div class="model-selector" v-if="activeTab === 'image'">
          <el-select v-model="selectedImageModel" placeholder="选择图像模型" class="model-dropdown">
            <el-option v-for="item in imageModels" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-tooltip content="选择适合的图像生成模型" placement="right">
            <el-icon class="help-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>

        <div class="model-selector" v-if="activeTab === 'music'">
          <el-select v-model="selectedMusicModel" placeholder="选择音乐模型" class="model-dropdown">
            <el-option v-for="item in musicModels" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-tooltip content="MusicGen 生成 BGM / 环境音；项目暂无云端音乐 API" placement="right">
            <el-icon class="help-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>

        <div class="model-selector" v-if="activeTab === 'voice'">
          <el-select v-model="selectedVoiceModel" placeholder="选择配音模型" class="model-dropdown">
            <el-option v-for="item in voiceModels" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-tooltip content="火山引擎 TTS：把台词念成音频" placement="right">
            <el-icon class="help-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
      </div>

      <!-- 主要内容区 -->
      <div class="generator-content">
        <el-tabs v-model="activeTab" class="ai-tabs">
          <el-tab-pane label="文本生成" name="text">
            <text-generator 
              @generate="handleTextGenerate" 
              :loading="loading.text"
              :history="history.filter(item => item.type === 'text')" 
            />
          </el-tab-pane>
          <el-tab-pane label="文生图" name="image">
            <image-generator 
              @generate="handleImageGenerate" 
              :loading="loading.image"
              :history="history.filter(item => item.type === 'image')" 
            />
          </el-tab-pane>
          <el-tab-pane label="音乐生成" name="music">
            <voice-generator
              @generate="handleMusicGenerate"
              :loading="loading.music"
              :model="selectedMusicModel"
              :history="history.filter(item => item.type === 'music')"
            />
          </el-tab-pane>
          <el-tab-pane label="语音配音" name="voice">
            <voice-synthesizer
              @generate="handleVoiceGenerate"
              :loading="loading.voice"
              :history="history.filter(item => item.type === 'voice')"
            />
          </el-tab-pane>
        </el-tabs>

        <!-- 历史记录 -->
        <div class="history-section" v-if="history.length > 0">
          <h3 class="history-title">
            <el-icon><Clock /></el-icon>
            生成历史
          </h3>
          <div class="history-items">
            <div v-for="(item, index) in history" :key="index" class="history-item">
              <div class="item-header">
                <div class="item-info">
                  <span class="item-type" :class="item.type">{{ getTypeLabel(item.type) }}</span>
                  <span class="item-time">{{ formatTime(item.created_at) }}</span>
                </div>
                <div class="item-actions">
                  <button class="action-btn export" @click="exportItem(item)" title="导出">
                    <el-icon><Download /></el-icon>
                  </button>
                  <button 
                    v-if="item.type === 'image'" 
                    class="action-btn edit" 
                    @click="editWithPhotopea(item)"
                    title="在线编辑"
                  >
                    <el-icon><Edit /></el-icon>
                  </button>
                  <button class="action-btn delete" @click="removeHistory(item.generation_id)" title="删除">
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </div>
              <!-- <div class="item-prompt">提示词：{{ item.prompt_text }}</div> -->
              <div class="item-result" v-if="item.type === 'text'">{{ item.generated_text }}</div>
              <img v-else-if="item.type === 'image'" :src="BASE_URL + item.generated_text" class="generated-image" />
              <audio v-else-if="item.type === 'music' || item.type === 'voice'" controls :src="BASE_URL + item.generated_text" class="generated-voice"></audio>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import {
  MagicStick, Clock, Delete, Download, QuestionFilled, Edit 
} from '@element-plus/icons-vue'
import TextGenerator from '@/components/TextGenerator.vue'
import ImageGenerator from '@/components/ImageGenerator.vue'
import VoiceGenerator from '@/components/VoiceGenerator.vue'
import VoiceSynthesizer from '@/components/VoiceSynthesizer.vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getAIGenerationsByUser, getModels, generateText,
  deleteAIGenerationById, generateImage, generateMusic, generateVoice,
  submitAndWait, getAiHealth
} from "@/api/ai"
import { BASE_URL } from "@/utils/request"
import TechNavCircle from '@/components/TechNavCircle.vue'
import ThemeToggleBtn from '@/components/ThemeToggleBtn.vue'

const taskStage = ref('')   // 异步任务的进度文案（空串表示无任务）

const textModels = ref([])
const imageModels = ref([])
const musicModels = ref([])
const voiceModels = ref([])

const selectedTextModel = ref('')
const selectedImageModel = ref('')
const selectedMusicModel = ref('')
const selectedVoiceModel = ref('')

const activeTab = ref('text')
const loading = ref({
  text: false,
  image: false,
  music: false,
  voice: false
})

const history = ref([])
const category = ref('')

const getTypeLabel = (type) => {
  const types = { text: '文本', image: '图片', music: '音乐', voice: '配音' }
  category.value = types[type] || '未知'
  return types[type] || '未知'
}

const formatTime = (date) => {
  return new Date(date).toLocaleString()
}

const loadHistory = async () => {
  const res = await getAIGenerationsByUser()
  const modelsRes = await getModels()

  // 把个人中心里创建的「我的 AI 模型」并入下拉框（此前取到却被丢弃，P1-2）
  const myModels = Array.isArray(modelsRes)
    ? modelsRes
    : (modelsRes?.data?.models || modelsRes?.data || modelsRes?.models || [])
  const textOptions = (Array.isArray(myModels) ? myModels : [])
    .filter((m) => !m.type || m.type === 'text')
    .map((m) => ({
      value: m.model_path || m.name,
      label: `${m.name}（我的模型）`,
    }))
    .filter((m) => m.value)
  const seen = new Set()
  const dedupedText = textOptions.filter((m) => {
    if (seen.has(m.value)) return false
    seen.add(m.value)
    return true
  })

  textModels.value = [{ value: 'deepseek', label: 'DeepSeek' }, ...dedupedText]
  // 图像双轨：云端默认；本地 SD 需手动选择（CPU 出图约 20 秒/张，且占用约 3.8GB 内存）
  imageModels.value = [
    { value: 'hunyuan', label: '通义万象（云端）' },
    { value: 'local', label: '本地 SD（CPU，较慢）' },
  ]
  musicModels.value = [
    { value: 'local', label: '本地 MusicGen（CPU，较慢）' },
  ]
  // 火山 TTS 配音：value 必须为空/cloud，不能是 'local'，否则会被判定成音乐后端
  voiceModels.value = [{ value: 'volcengine', label: '火山引擎 TTS（云端）' }]
  if (!selectedMusicModel.value) selectedMusicModel.value = 'local'
  if (!selectedVoiceModel.value) selectedVoiceModel.value = 'volcengine'
  
  history.value = res.data
}

const handleTextGenerate = async (prompt, options) => {
  if (!selectedTextModel.value) {
    ElMessage.warning('请选择文本模型')
    return
  }
  const data = {
    model: selectedTextModel.value,
    prompt: prompt,
    length: options.length,
    forbidden_words: options.forbidden_words
  }
  loading.value.text = true
  try {
    const info = await submitAndWait(() => generateText(data), {
      onProgress: (s) => { if (s.progress?.stage) taskStage.value = s.progress.stage }
    })
    if (info?.backend) {
      ElMessage.success(`文本生成完成（后端：${info.backend}）`)
    } else {
      ElMessage.success('文本生成完成')
    }
    loadHistory()
  } catch (error) {
    ElMessage.error(error?.message || '生成文本失败')
  } finally {
    loading.value.text = false
    taskStage.value = ''
  }
}

const handleImageGenerate = async (prompt, options) => {
  if (!selectedImageModel.value) {
    ElMessage.warning('请选择图像模型')
    return
  }

  // 本地 SD 走 CPU，出图要吃掉约 3.8GB 内存。提前判断，别让用户白等一次失败。
  if (selectedImageModel.value === 'local') {
    try {
      const health = await getAiHealth()
      const sd = health?.local_sd
      if (sd && sd.ram_ok === false) {
        ElMessage.error(
          `内存不足：本地 SD 需要 ${sd.need_ram_gb}GB 可用内存，当前只有 ${sd.free_ram_gb}GB。` +
          '请先关闭浏览器/QQ 等程序后重试，或改用「通义万象（云端）」。'
        )
        return
      }
      if (sd && sd.ok === false) {
        ElMessage.error('本地 SD 不可用：' + (sd.reasons || []).join('；'))
        return
      }
    } catch {
      // 健康检查失败不阻断，交给后端判定
    }
  }

  loading.value.image = true
  const [width, height] = options.size.split('x').map(Number)
  const data = {
    model: selectedImageModel.value,
    prompt: prompt,
    width: width,
    height: height,
  }
  try {
    await submitAndWait(() => generateImage(data), {
      onProgress: (s) => { if (s.progress?.stage) taskStage.value = s.progress.stage }
    })
    ElMessage.success('图像生成完成')
    loadHistory()
  } catch (error) {
    ElMessage.error(error?.message || '生成图像失败')
  } finally {
    loading.value.image = false
    taskStage.value = ''
  }
}

const handleMusicGenerate = async (prompt, options) => {
  const model = selectedMusicModel.value || 'local'

  // 本地 MusicGen 走 CPU，需要约 3GB 可用内存；先判断，别让用户白等几分钟
  if (model === 'local') {
    try {
      const health = await getAiHealth()
      const mg = health?.local_music
      if (mg && mg.ram_ok === false) {
        ElMessage.error(
          `内存不足：本地 MusicGen 需要 ${mg.need_ram_gb}GB 可用内存，当前只有 ${mg.free_ram_gb}GB。` +
          '请先关闭浏览器/QQ 等程序后重试。'
        )
        return
      }
      if (mg && mg.ok === false) {
        ElMessage.error('本地 MusicGen 不可用：' + (mg.reasons || []).join('；'))
        return
      }
    } catch {
      // 健康检查失败不阻断，交给后端判定
    }
  }

  loading.value.music = true
  try {
    const info = await submitAndWait(() => generateMusic({
      model: model,
      prompt: prompt,
      duration: options?.duration ?? 10,
    }), {
      onProgress: (s) => { if (s.progress?.stage) taskStage.value = s.progress.stage }
    })
    const secs = info?.audio_seconds ? `（${info.audio_seconds} 秒音频）` : ''
    ElMessage.success('音乐生成完成' + secs)
    loadHistory()
  } catch (error) {
    ElMessage.error(error?.message || '音乐生成失败')
  } finally {
    loading.value.music = false
    taskStage.value = ''
  }
}

const handleVoiceGenerate = async (text, options) => {
  loading.value.voice = true
  try {
    const info = await submitAndWait(() => generateVoice({
      text: text,
      voice_type: options?.voice_type,
    }), {
      onProgress: (s) => { if (s.progress?.stage) taskStage.value = s.progress.stage }
    })
    if (info?.voice_type) {
      ElMessage.success(`配音生成完成（音色：${info.voice_type}）`)
    } else {
      ElMessage.success('配音生成完成')
    }
    loadHistory()
  } catch (error) {
    ElMessage.error(error?.message || '配音生成失败')
  } finally {
    loading.value.voice = false
    taskStage.value = ''
  }
}

const removeHistory = (index) => {
  ElMessageBox.confirm('确定删除该条记录吗？', '删除确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    deleteAIGenerationById(index).then(() => {
      loadHistory()
      ElMessage.success('删除成功')
    }).catch(() => {
      ElMessage.error('删除失败')
    })
  }).catch(() => {})
}

const editWithPhotopea = (item) => {
  const imageUrl = BASE_URL + item.generated_text
  const photopeaUrl = `https://www.photopea.com/#${encodeURIComponent(imageUrl)}`
  window.open(photopeaUrl, '_blank')
  ElMessage.success('正在打开编辑器...')
}

const exportItem = (item) => {
  switch (item.type) {
    case 'text': exportText(item.generated_text); break
    case 'image': exportImage(BASE_URL + item.generated_text); break
    case 'voice': exportAudio(item.generated_text); break
    case 'music': exportAudio(item.generated_text); break
  }
}

const exportText = (text) => {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AI文本_${new Date().toISOString().slice(0, 10)}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const exportImage = (imageUrl) => {
  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = imageUrl
  a.download = `AI图片_${new Date().toISOString().slice(0, 10)}.png`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl)
  }, 100)
}

const exportAudio = (audioUrl) => {
  const a = document.createElement('a')
  a.href = audioUrl
  a.download = `AI语音_${new Date().toISOString().slice(0, 10)}.mp3`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

onMounted(() => {
  loadHistory()
})
</script>

<style scoped lang="scss">
$bg-primary: #1a1a2e;
$bg-secondary: #16213e;
$pink: #ffb7c5;
$purple: #c9a9e8;
$mint: #a8e6cf;
$warm: #ffe6b0;
$border-light: rgba(255, 255, 255, 0.08);
$text-primary: #ffffff;
$text-secondary: #9ca3af;

.ai-studio {
  min-height: 100vh;
  background: linear-gradient(135deg, $bg-primary 0%, $bg-secondary 100%);
  padding: 80px 24px 40px;

  &.light {
    background: linear-gradient(135deg, #fffafc 0%, #fef4f8 100%);
  }
}

.studio-container {
  max-width: 1200px;
  margin: 0 auto;
}

// 头部
.studio-header {
  margin-bottom: 32px;
  
  .header-content {
    .studio-title {
      display: flex;
      align-items: baseline;
      gap: 16px;
      margin: 0 0 8px;
      
      .title-main {
        font-size: 42px;
        font-weight: 700;
        background: linear-gradient(135deg, $pink, $purple);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      
      .title-sub {
        font-size: 20px;
        color: #3f7d6a;
        font-weight: 400;
      }
    }
    
    .studio-desc {
      margin: 0;
      color: $text-secondary;
      font-size: 15px;
      letter-spacing: 1px;
    }
  }
}

// 模型选择器
.model-selector-wrapper {
  margin-bottom: 24px;
}

.model-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  
  .model-dropdown {
    width: 260px;
    
    :deep(.el-input__wrapper) {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid $border-light;
      border-radius: 40px;
      box-shadow: none;
      padding: 8px 16px;
      
      .el-input__inner {
        color: $text-primary;
        
        &::placeholder {
          color: $text-secondary;
        }
      }
      
      &:hover, &.is-focus {
        border-color: $pink;
      }
    }
  }
  
  .help-icon {
    color: $pink;
    font-size: 18px;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.2s;
    
    &:hover {
      opacity: 1;
    }
  }
}

// 标签页
.ai-tabs {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
  border: 1px solid $border-light;
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 30px;
  
  :deep(.el-tabs__header) {
    margin-bottom: 20px;
  }
  
  :deep(.el-tabs__nav-wrap::after) {
    background-color: $border-light;
    height: 1px;
  }
  
  :deep(.el-tabs__item) {
    color: $text-secondary;
    font-size: 16px;
    font-weight: 500;
    padding: 0 24px;
    height: 44px;
    line-height: 44px;
    
    &:hover {
      color: $pink;
    }
    
    &.is-active {
      color: $pink;
    }
  }
  
  :deep(.el-tabs__active-bar) {
    background: linear-gradient(90deg, $pink, $purple);
    height: 3px;
    border-radius: 3px;
  }
}

// 历史记录
.history-section {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
  border: 1px solid $border-light;
  border-radius: 20px;
  padding: 24px;
  
  .history-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 20px;
    color: $text-primary;
    font-size: 18px;
    font-weight: 600;
    
    .el-icon {
      color: $pink;
    }
  }
}

.history-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.history-item {
  background: linear-gradient(135deg, 
    rgba(255, 183, 197, 0.06) 0%, 
    rgba(201, 169, 232, 0.06) 100%);
  backdrop-filter: blur(8px);
  border: 1px solid $border-light;
  border-radius: 16px;
  padding: 18px;
  transition: all 0.3s;
  
  &:hover {
    border-color: rgba(255, 183, 197, 0.3);
    background: linear-gradient(135deg, 
      rgba(255, 183, 197, 0.1) 0%, 
      rgba(201, 169, 232, 0.1) 100%);
    transform: translateY(-4px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
  }
  
  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
    
    .item-info {
      display: flex;
      align-items: center;
      gap: 10px;
      
      .item-type {
        padding: 4px 12px;
        border-radius: 30px;
        font-size: 11px;
        font-weight: 500;
        color: white;
        
        &.text { background: $pink; }
        &.image { background: $purple; }
        &.music { background: $purple; }
        &.voice { background: $mint; }
      }
      
      .item-time {
        color: $text-secondary;
        font-size: 12px;
      }
    }
    
    .item-actions {
      display: flex;
      gap: 6px;
      
      .action-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid $border-light;
        color: $text-secondary;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        
        &:hover {
          background: rgba(255, 255, 255, 0.1);
          color: $text-primary;
        }
        
        &.delete:hover {
          background: rgba(255, 107, 107, 0.2);
          color: #ff6b6b;
          border-color: rgba(255, 107, 107, 0.5);
        }
        
        &.edit:hover {
          color: $mint;
          border-color: rgba(168, 230, 207, 0.5);
        }
      }
    }
  }
  
  .item-prompt {
    color: $text-secondary;
    font-size: 13px;
    margin-bottom: 12px;
    padding: 10px 12px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 10px;
    word-break: break-word;
    
    &::before {
      content: '💬 ';
    }
  }
  
  .item-result {
    color: $text-primary;
    font-size: 14px;
    line-height: 1.6;
    word-break: break-word;
    padding: 10px 0;
  }
  
  .generated-image {
    width: 100%;
    border-radius: 12px;
    border: 1px solid $border-light;
    cursor: pointer;
    transition: transform 0.2s;
    
    &:hover {
      transform: scale(1.02);
    }
  }
  
  .generated-voice {
    width: 100%;
    height: 40px;
    margin-top: 8px;
    
    &::-webkit-media-controls-panel {
      background: rgba(255, 255, 255, 0.05);
    }
  }
}

// 音乐功能对话框
:deep(.music-dialog) {
  background: $bg-primary !important;
  border: 1px solid $border-light !important;
  border-radius: 20px !important;
  
  .el-message-box__title {
    color: $text-primary !important;
  }
  
  .el-message-box__message {
    color: $text-secondary !important;
    white-space: pre-line;
  }
  
  .el-button--primary {
    background: linear-gradient(135deg, $pink, $purple) !important;
    border: none !important;
    border-radius: 30px !important;
    padding: 10px 30px !important;
    
    &:hover {
      opacity: 0.9;
    }
  }
}

// 响应式
@media (max-width: 768px) {
  .ai-studio {
    padding: 70px 16px 30px;
  }
  
  .studio-header .studio-title {
    .title-main {
      font-size: 32px;
    }
    .title-sub {
      font-size: 16px;
    }
  }
  
  .history-items {
    grid-template-columns: 1fr;
  }
  
  .model-selector .model-dropdown {
    width: 100%;
  }
}
</style>