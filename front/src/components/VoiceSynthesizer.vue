<template>
  <div class="generator-card">
    <h3><el-icon><Microphone /></el-icon>语音配音</h3>
    <p class="card-tip">
      把台词念成音频（云端 TTS）。这里输入的是<strong>要说出来的文字</strong>，不是音乐描述。
    </p>
    <el-form label-position="top">
      <el-form-item label="配音文本">
        <el-input
          v-model="text"
          type="textarea"
          :rows="5"
          maxlength="1000"
          show-word-limit
          placeholder="例如：雨还在下。她把伞收起来，第一次觉得这条回家的路这么短。"
        ></el-input>
      </el-form-item>

      <el-form-item label="音色">
        <el-select v-model="voiceType" class="voice-select" placeholder="选择音色">
          <el-option
            v-for="item in voices"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button size="small" @click="applyDialogue" class="preset-btn">
          <el-icon><DocumentCopy /></el-icon> 用当前场景的台词填充
        </el-button>
      </el-form-item>

      <el-button
        type="primary"
        @click="handleGenerate"
        :loading="loading"
        class="generate-btn"
      >
        <template #icon><el-icon><Microphone /></el-icon></template>
        生成配音
      </el-button>
    </el-form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Microphone, DocumentCopy } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  loading: Boolean,
  history: Array,
  // 场景台词，一键填充
  scenePrompt: { type: String, default: '' }
})

const emit = defineEmits(['generate'])

const text = ref('')
const voiceType = ref('BV001_streaming')

// 火山引擎常用音色（cluster=volcano_tts）
const voices = [
  { value: 'BV001_streaming', label: '通用女声 · 童声偏亮' },
  { value: 'BV002_streaming', label: '通用男声 · 沉稳' },
  { value: 'BV700_streaming', label: '通用女声 · 知性' },
  { value: 'BV705_streaming', label: '通用女声 · 活泼' },
  { value: 'BV701_streaming', label: '通用男声 · 磁性' },
]

const applyDialogue = () => {
  if (!props.scenePrompt) {
    ElMessage.info('还没有可用的场景台词，请手动输入')
    return
  }
  text.value = props.scenePrompt
}

const handleGenerate = () => {
  if (!text.value.trim()) {
    ElMessage.warning('请输入配音文本')
    return
  }
  emit('generate', text.value, { voice_type: voiceType.value })
}
</script>

<style scoped>
.generator-card {
  padding: 24px;
  background: linear-gradient(135deg,
    rgba(160, 220, 255, 0.06) 0%,
    rgba(201, 169, 232, 0.06) 100%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

h3 {
  color: #8fd3ff;
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
}

.card-tip {
  margin: 0 0 20px;
  font-size: 13px;
  color: #9ca3af;
  line-height: 1.6;
}

.card-tip strong {
  color: #c9d4e0;
}

:deep(.el-form-item) {
  margin-bottom: 20px;
}

:deep(.el-form-item__label) {
  color: #9ca3af;
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 8px;
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
  border-color: rgba(143, 211, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
}

:deep(.el-textarea__inner:focus) {
  border-color: #8fd3ff;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(143, 211, 255, 0.1);
}

:deep(.el-textarea__inner::placeholder) {
  color: #6b7280;
}

:deep(.el-textarea .el-input__count) {
  background: transparent;
  color: #6b7280;
}

:deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  box-shadow: none;
  padding: 4px 12px;
  transition: all 0.2s;
}

:deep(.el-input__wrapper:hover) {
  border-color: rgba(143, 211, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
}

:deep(.el-input__wrapper.is-focus) {
  border-color: #8fd3ff;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(143, 211, 255, 0.1);
}

:deep(.el-input__inner) {
  color: #ffffff;
}

.voice-select {
  width: 100%;
}

.preset-btn {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: #8fd3ff !important;
  border-radius: 20px !important;
  font-size: 12px;
}

.preset-btn:hover {
  border-color: rgba(143, 211, 255, 0.4) !important;
  background: rgba(143, 211, 255, 0.08) !important;
}

.generate-btn {
  width: 100%;
  margin-top: 8px;
  padding: 14px;
  background: linear-gradient(135deg, #8fd3ff, #c9a9e8) !important;
  border: none !important;
  border-radius: 40px !important;
  color: white !important;
  font-size: 16px;
  font-weight: 600;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(143, 211, 255, 0.3);
}

.generate-btn:hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 20px rgba(143, 211, 255, 0.4) !important;
  background: linear-gradient(135deg, #a5dcff, #d4b8ee) !important;
}

.generate-btn:active {
  transform: translateY(0) !important;
}

.generate-btn.is-loading {
  opacity: 0.8;
}
</style>
