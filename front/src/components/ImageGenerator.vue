<template>
  <div class="generator-card">
    <h3><el-icon><Picture /></el-icon> 文生图</h3>
    <el-form label-position="top">
      <!-- 风格预设 - 可折叠 -->
      <el-form-item>
        <el-button 
          size="small" 
          @click="showStylePanel = !showStylePanel"
          class="style-toggle-btn"
        >
          <el-icon><Setting /></el-icon> 
          {{ showStylePanel ? '收起风格参数' : '风格参数设置' }}
          <span v-if="selectedStyle" class="selected-badge">
            · {{ selectedStyle }}
          </span>
        </el-button>
        
        <div v-if="showStylePanel" class="style-panel">
          <div class="style-presets">
            <el-button 
              v-for="style in stylePresets" 
              :key="style.name"
              size="small"
              :type="selectedStyle === style.name ? 'primary' : 'default'"
              @click="toggleStyle(style)"
              class="style-btn"
            >
              {{ style.icon }} {{ style.name }}
            </el-button>
          </div>
          <div v-if="selectedStyle" class="style-tip">
            已选风格：{{ selectedStyle }}
          </div>
        </div>
      </el-form-item>

      <el-form-item label="提示词">
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="4"
          placeholder="描述你想要生成的图像，例如：'樱花树下的少女，粉色色调，阳光透过树叶'"
        ></el-input>
      </el-form-item>
      
      <el-radio-group v-model="size">
        <el-radio-button value="1024x1024">1:1 方形</el-radio-button>
        <el-radio-button value="768x1152">3:4 竖版</el-radio-button>
        <el-radio-button value="1280x720">4:3 横版</el-radio-button>
      </el-radio-group>
      
      <el-button 
        type="primary" 
        @click="handleGenerate"
        :loading="loading"
        class="generate-btn"
      >
        <template #icon><el-icon><MagicStick /></el-icon></template>
        生成图像
      </el-button>
    </el-form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { MagicStick, Picture, Setting } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['generate'])
defineProps({
  loading: Boolean,
  history: Array
})

const prompt = ref('')
const size = ref('1024x1024')
const selectedStyle = ref('')
const showStylePanel = ref(false)

// 风格预设列表
const stylePresets = [
  {
    name: '二次元',
    icon: '🎨',
    prompt: 'anime style, 2D illustration, cel shading, clean lines, vibrant colors',
    negative: 'realistic, 3D, photograph, blurry, low quality',
    steps: 28,
    cfg: 7
  },
  {
    name: '古风',
    icon: '🏯',
    prompt: 'traditional Chinese art style, ink wash painting influence, elegant, flowing lines, soft colors',
    negative: 'modern, western, neon, graffiti, low quality',
    steps: 28,
    cfg: 7
  },
  {
    name: '现代',
    icon: '🌃',
    prompt: 'modern anime style, urban setting, clean design, natural lighting, detailed background',
    negative: 'traditional, ancient, rustic, low quality, blurry',
    steps: 28,
    cfg: 7
  },
  {
    name: '奇幻',
    icon: '🪄',
    prompt: 'fantasy anime style, magical atmosphere, ethereal lighting, detailed costume, sparkling effects',
    negative: 'realistic, mundane, plain, low quality, blurry',
    steps: 28,
    cfg: 7
  }
]

// 构建最终Prompt
const buildFinalPrompt = () => {
  const style = stylePresets.find(s => s.name === selectedStyle.value)
  
  if (!style) {
    return prompt.value.trim()
  }
  
  const finalPrompt = style.prompt + ', ' + prompt.value.trim()
  
  const wordCount = finalPrompt.split(/\s+/).length
  if (wordCount > 150) {
    ElMessage.warning(`提示词较长（约${wordCount}个单词），可能超出模型限制，建议精简`)
  }
  
  return finalPrompt
}

const toggleStyle = (style) => {
  if (selectedStyle.value === style.name) {
    selectedStyle.value = ''
    ElMessage.info('已取消风格预设')
    return
  }
  
  selectedStyle.value = style.name
  ElMessage.success(`已选择「${style.name}」风格`)
}

const handleGenerate = () => {
  if (!prompt.value.trim()) {
    ElMessage.warning('请输入提示词')
    return
  }
  
  const style = stylePresets.find(s => s.name === selectedStyle.value)
  const finalPrompt = buildFinalPrompt()
  
  const params = {
    size: size.value,
    originalPrompt: prompt.value.trim(),
    finalPrompt: finalPrompt
  }
  
  if (style) {
    params.style = style.name
    params.steps = style.steps
    params.cfg = style.cfg
    params.negative = style.negative
  }
  
  emit('generate', finalPrompt, params)
}
</script>

<style scoped>
.generator-card {
  padding: 24px;
  background: linear-gradient(135deg, 
    rgba(255, 183, 197, 0.06) 0%, 
    rgba(201, 169, 232, 0.06) 100%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

h3 {
  color: #ffb7c5;
  margin: 0 0 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
}

/* 风格参数折叠按钮 */
.style-toggle-btn {
  border-radius: 20px;
  font-size: 13px;
  padding: 8px 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #9ca3af;
  transition: all 0.2s;
}

.style-toggle-btn:hover {
  border-color: rgba(255, 183, 197, 0.3);
  color: #ffb7c5;
}

.selected-badge {
  color: #ffb7c5;
  font-weight: 600;
}

/* 风格面板 */
.style-panel {
  margin-top: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.style-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.style-btn {
  border-radius: 20px;
  font-size: 13px;
  padding: 6px 16px;
  transition: all 0.2s;
}

.style-btn:hover {
  transform: translateY(-1px);
}

.style-tip {
  margin-top: 10px;
  font-size: 12px;
  color: #9ca3af;
  padding: 6px 12px;
  background: rgba(255, 183, 197, 0.08);
  border-radius: 10px;
}

:deep(.el-form-item__label) {
  color: #9ca3af;
  font-weight: 500;
  font-size: 14px;
}

:deep(.el-textarea__inner) {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  color: #ffffff;
  font-size: 14px;
  line-height: 1.6;
  padding: 12px 16px;
  resize: none;
  transition: all 0.2s;
}

:deep(.el-textarea__inner:hover) {
  border-color: rgba(255, 183, 197, 0.3);
  background: rgba(255, 255, 255, 0.08);
}

:deep(.el-textarea__inner:focus) {
  border-color: #ffb7c5;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(255, 183, 197, 0.1);
}

:deep(.el-textarea__inner::placeholder) {
  color: #6b7280;
}

:deep(.el-radio-group) {
  display: flex;
  gap: 12px;
  margin: 20px 0;
}

:deep(.el-radio-button__inner) {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  color: #9ca3af;
  padding: 10px 20px;
  border-radius: 30px !important;
  font-size: 14px;
  transition: all 0.2s;
}

:deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: linear-gradient(135deg, #ffb7c5, #c9a9e8);
  border-color: transparent !important;
  color: white;
  box-shadow: 0 4px 12px rgba(255, 183, 197, 0.3);
}

:deep(.el-radio-button:hover .el-radio-button__inner) {
  color: #ffb7c5;
}

.generate-btn {
  width: 100%;
  margin-top: 16px;
  padding: 14px;
  background: linear-gradient(135deg, #ffb7c5, #c9a9e8) !important;
  border: none !important;
  border-radius: 40px !important;
  color: white !important;
  font-size: 16px;
  font-weight: 600;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(255, 183, 197, 0.3);
}

.generate-btn:hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 20px rgba(255, 183, 197, 0.4) !important;
  background: linear-gradient(135deg, #ffc4d0, #d4b8ee) !important;
}

.generate-btn:active {
  transform: translateY(0) !important;
}

.generate-btn.is-loading {
  opacity: 0.8;
}
</style>