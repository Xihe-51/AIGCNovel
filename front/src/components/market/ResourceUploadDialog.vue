<template>
  <el-dialog
    v-model="visibleModel"
    :title="isEditing ? '编辑素材' : '上传新素材'"
    style="color: white;"
    width="520px"
    class="orange-dialog"
  >
    <el-form :model="form" label-position="top" class="upload-form" :rules="formRules" ref="formRef">
      <el-form-item label="素材名称" prop="title">
        <el-input v-model="form.title" placeholder="给你的素材起个名字..." />
      </el-form-item>

      <el-form-item label="素材描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="描述一下这个素材..."
        />
      </el-form-item>

      <div class="form-row">
        <el-form-item label="素材类型" prop="resource_type">
          <div class="type-options">
            <span
              v-for="type in RESOURCE_TYPES"
              :key="type"
              class="type-option"
              :class="{ selected: form.resource_type === type }"
              @click="form.resource_type = type"
            >
              {{ type }}
            </span>
          </div>
        </el-form-item>
      </div>

      <el-form-item label="许可协议" prop="license_type">
        <el-select v-model="form.license_type" placeholder="选择许可协议">
          <el-option label="CC BY" value="CC BY" />
          <el-option label="CC BY-SA" value="CC BY-SA" />
          <el-option label="CC BY-NC" value="CC BY-NC" />
          <el-option label="商业授权" value="商业授权" />
        </el-select>
      </el-form-item>

      <el-form-item label="价格 (¥)" prop="price">
        <el-input-number
          v-model="form.price"
          :min="0"
          :step="1"
          controls-position="right"
        />
        <span class="price-hint">设为 0 表示免费</span>
      </el-form-item>

      <el-form-item label="上传文件" prop="file_url" v-if="!isEditing">
        <el-upload
          class="custom-upload"
          drag
          :action="BASE_URL + '/user/api/upload'"
          :on-success="handleUploadSuccess"
          :before-upload="beforeUpload"
          :show-file-list="false"
        >
          <div class="upload-area">
            <el-icon class="upload-icon"><UploadFilled /></el-icon>
            <p>拖拽或<em>点击上传</em></p>
            <span class="upload-tip">支持图片/音频，不超过10MB</span>
          </div>
        </el-upload>
      </el-form-item>

      <el-form-item label="或提供链接" v-if="!isEditing">
        <el-input v-model="form.file_url" placeholder="输入模型/资源链接地址" />
      </el-form-item>
    </el-form>

    <template #footer>
      <button class="dialog-btn cancel" @click="visibleModel = false">取消</button>
      <button class="dialog-btn confirm" :disabled="submitting" @click="submit">
        {{ isEditing ? '保存' : '上传' }}
      </button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { createResource, updateResource } from '@/api/market'
import type { Resource } from '@/api/market'
import { BASE_URL } from '@/utils/request'

type ResourceForm = {
  title: string
  description: string
  resource_type: string
  file_url: string
  price: number
  license_type: string
}

const RESOURCE_TYPES = ['角色', '背景', 'CG', '其他']
const MAX_FILE_SIZE_MB = 10

const props = defineProps<{
  visible: boolean
  editingResource?: Resource | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'submitted'): void
}>()

const visibleModel = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value)
})

const isEditing = computed(() => Boolean(props.editingResource?.resource_id))

const createEmptyForm = (): ResourceForm => ({
  title: '',
  description: '',
  resource_type: '',
  file_url: '',
  price: 0,
  license_type: 'CC BY'
})

const form = ref<ResourceForm>(createEmptyForm())
const formRef = ref<FormInstance>()
const submitting = ref(false)

const formRules: FormRules = {
  title: [{ required: true, message: '请输入素材名称', trigger: 'blur' }],
  resource_type: [{ required: true, message: '请选择素材类型', trigger: 'change' }],
  license_type: [{ required: true, message: '请选择许可协议', trigger: 'change' }]
}

const resetForm = () => {
  const source = props.editingResource
  if (source) {
    form.value = {
      title: source.title ?? '',
      description: source.description ?? '',
      resource_type: source.resource_type ?? '',
      file_url: source.file_url ?? '',
      price: Number(source.price) || 0,
      license_type: source.license_type ?? 'CC BY'
    }
  } else {
    form.value = createEmptyForm()
  }
  nextTick(() => formRef.value?.clearValidate())
}

watch(
  () => props.visible,
  (open: boolean) => {
    if (open) resetForm()
  }
)

const submit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (isEditing.value && props.editingResource?.resource_id) {
      await updateResource(props.editingResource.resource_id, form.value)
      ElMessage.success('素材更新成功')
    } else {
      await createResource(form.value)
      ElMessage.success('素材上传成功')
    }
    visibleModel.value = false
    emit('submitted')
  } catch (error) {
    ElMessage.error((isEditing.value ? '更新' : '上传') + '失败')
  } finally {
    submitting.value = false
  }
}

const handleUploadSuccess = (response: any) => {
  if (response?.code === 200 && response?.data) {
    form.value.file_url = response.data.file_url
    ElMessage.success('上传成功')
  } else {
    ElMessage.error('上传失败')
  }
}

const beforeUpload = (file: File) => {
  const isValid = file.type.startsWith('image/') || file.type.startsWith('audio/')
  const isLt10M = file.size / 1024 / 1024 < MAX_FILE_SIZE_MB
  if (!isValid) {
    ElMessage.error('只能上传图片或音频')
    return false
  }
  if (!isLt10M) {
    ElMessage.error(`文件不能超过${MAX_FILE_SIZE_MB}MB`)
    return false
  }
  return true
}
</script>

<style scoped lang="scss" src="./resourceUploadDialog.scss"></style>
