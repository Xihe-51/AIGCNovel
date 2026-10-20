<template>
  <div class="generator-card">
    <h3><el-icon><Document /></el-icon> 文本生成</h3>
    <el-form label-position="top">
      <el-form-item label="提示词">
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="4"
          placeholder="输入你想要生成的文本描述，例如：'写一段浪漫的表白场景，发生在樱花树下'"
        ></el-input>
      </el-form-item>
      
      <el-form-item label="长度">
        <el-slider v-model="length" :min="50" :max="500" show-input></el-slider>
      </el-form-item>
      
      <el-form-item label="过滤词（逗号分隔）">
        <el-input v-model="forbiddenWords" placeholder="暴力,色情,政治..."></el-input>
      </el-form-item>
      
      <el-button 
        type="primary" 
        @click="handleGenerate"
        :loading="loading"
        class="generate-btn"
      >
        <template #icon><el-icon><MagicStick /></el-icon></template>
        生成文本
      </el-button>
    </el-form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { MagicStick, Document } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['generate'])
defineProps({
  loading: Boolean,
  history: Array
})

const prompt = ref('')
const length = ref(200)
const forbiddenWords = ref('')

const handleGenerate = () => {
  if (!prompt.value.trim()) {
    ElMessage.warning('请输入提示词')
    return
  }
  
  emit('generate', prompt.value, {
    length: length.value,
    forbidden_words: forbiddenWords.value
  })
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

:deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  box-shadow: none;
  padding: 4px 12px;
  transition: all 0.2s;
}

:deep(.el-input__wrapper:hover) {
  border-color: rgba(255, 183, 197, 0.3);
  background: rgba(255, 255, 255, 0.08);
}

:deep(.el-input__wrapper.is-focus) {
  border-color: #ffb7c5;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(255, 183, 197, 0.1);
}

:deep(.el-input__inner) {
  color: #ffffff;
}

:deep(.el-input__inner::placeholder) {
  color: #6b7280;
}

:deep(.el-slider) {
  padding: 0 4px;
}

:deep(.el-slider__bar) {
  background: linear-gradient(90deg, #ffb7c5, #c9a9e8);
  height: 4px;
}

:deep(.el-slider__button) {
  width: 18px;
  height: 18px;
  background: white;
  border: 2px solid #ffb7c5;
  box-shadow: 0 2px 8px rgba(255, 183, 197, 0.3);
}

:deep(.el-slider__button:hover) {
  transform: scale(1.2);
}

:deep(.el-slider__runway) {
  background: rgba(255, 255, 255, 0.1);
  height: 4px;
}

:deep(.el-slider__input) {
  width: 100px !important;
  display: flex;
  align-items: center;

  .el-input-number__decrease,
  .el-input-number__increase {
    width: 28px !important;
    height: 28px !important;
    font-size: 12px !important;
    color: #9ca3af;
  }
  
  .el-input-number__decrease:hover,
  .el-input-number__increase:hover {
    color: #ffb7c5;
  }

  .el-input__wrapper {
    padding: 0 4px !important;
    height: 28px !important;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  
  .el-input__wrapper:hover {
    border-color: rgba(255, 183, 197, 0.3);
  }
  
  .el-input__wrapper.is-focus {
    border-color: #ffb7c5;
  }

  .el-input__inner {
    color: #ffffff;
    text-align: center;
    padding: 0 !important;
    font-size: 13px !important;
  }
}

.generate-btn {
  width: 100%;
  margin-top: 24px;
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