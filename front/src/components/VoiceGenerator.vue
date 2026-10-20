<template>
  <div class="generator-card">
    <h3><el-icon><Headset /></el-icon>音乐生成</h3>
    <p class="card-tip">
      生成 BGM / 环境音 / 旋律片段。描述乐器和氛围，不要写台词。
    </p>
    <el-form label-position="top">
      <el-form-item label="音乐描述">
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="4"
          placeholder="例如：温柔的钢琴独奏，缓慢的节奏，带一点雨声，适合安静的夜晚场景"
        ></el-input>
      </el-form-item>

      <el-form-item>
        <el-button size="small" @click="applyPreset" class="preset-btn">
          <el-icon><DocumentCopy /></el-icon> 用当前场景的描述填充
        </el-button>
      </el-form-item>

      <el-form-item :label="`时长：${duration} 秒`">
        <el-slider v-model="duration" :min="5" :max="30" :step="5" show-input></el-slider>
      </el-form-item>

      <div class="cost-hint" v-if="isLocal">
        本地 MusicGen（CPU）生成 {{ duration }} 秒约需
        {{ Math.max(1, Math.round(duration * 0.35)) }}~{{ Math.max(2, Math.round(duration * 0.7)) }} 分钟，
        且需要约 3GB 可用内存。
      </div>

      <el-button
        type="primary"
        @click="handleGenerate"
        :loading="loading"
        class="generate-btn"
      >
        <template #icon><el-icon><MagicStick /></el-icon></template>
        生成音乐
      </el-button>
    </el-form>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { MagicStick, Headset, DocumentCopy } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  loading: Boolean,
  history: Array,
  // 父组件传入的当前模型，用于估算耗时提示
  model: { type: String, default: '' },
  // 场景上下文，可一键填充
  scenePrompt: { type: String, default: '' }
})

const emit = defineEmits(['generate'])

const prompt = ref('')
const duration = ref(10)

const isLocal = computed(() => {
  const m = (props.model || '').toLowerCase()
  return !m || m === 'local' || m === 'musicgen' || m === 'musicgen-small'
})

const applyPreset = () => {
  if (!props.scenePrompt) {
    ElMessage.info('还没有可用的场景描述，请手动输入')
    return
  }
  prompt.value = props.scenePrompt
}

const handleGenerate = () => {
  if (!prompt.value.trim()) {
    ElMessage.warning('请输入音乐描述')
    return
  }
  emit('generate', prompt.value, { duration: duration.value })
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

.preset-btn {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: #c9a9e8 !important;
  border-radius: 20px !important;
  font-size: 12px;
}

.preset-btn:hover {
  border-color: rgba(201, 169, 232, 0.4) !important;
  background: rgba(201, 169, 232, 0.08) !important;
}

.cost-hint {
  margin: -4px 0 16px;
  padding: 10px 14px;
  font-size: 12px;
  line-height: 1.6;
  color: #f0c419;
  background: rgba(240, 196, 25, 0.08);
  border: 1px solid rgba(240, 196, 25, 0.2);
  border-radius: 10px;
}

.generate-btn {
  width: 100%;
  margin-top: 8px;
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
