<template>
  <el-dialog
    v-model="visibleModel"
    width="420px"
    class="orange-dialog"
    :close-on-click-modal="false"
  >
    <template #header>
      <div class="dialog-header">
        <span class="dialog-title">{{ copy.title }}</span>
      </div>
    </template>

    <div class="reference-container">
      <p class="reference-tip">{{ copy.tip }}</p>
      <el-select
        v-model="selectedProjectId"
        placeholder="请选择项目"
        class="reference-select"
      >
        <el-option
          v-for="p in projects"
          :key="p.project_id"
          :label="p.title"
          :value="p.project_id"
        />
      </el-select>
      <p v-if="projectsLoaded && projects.length === 0" class="reference-empty">
        你还没有项目，先去项目页创建一个吧
      </p>
    </div>

    <template #footer>
      <button class="dialog-btn cancel" @click="visibleModel = false">取消</button>
      <button
        class="dialog-btn confirm"
        :disabled="!selectedProjectId || submitting"
        @click="handleConfirm"
      >
        {{ submitting ? copy.loading : copy.confirm }}
      </button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Project } from '@/api/project'
import type { Resource } from '@/api/market'

type DialogMode = 'reference' | 'import'

const props = defineProps<{
  visible: boolean
  mode: DialogMode
  resource?: Resource | null
  projects: Project[]
  projectsLoaded: boolean
  submitting: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm', projectId: number): void
}>()

const visibleModel = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})

const selectedProjectId = ref<number | null>(null)

const copy = computed(() => {
  const title = props.resource?.title ?? ''
  if (props.mode === 'import') {
    return {
      title: '入库到项目',
      tip: `把「${title}」复制到项目素材目录，之后可在创作页「素材」里直接拖到场景：`,
      confirm: '确定入库',
      loading: '入库中…',
    }
  }
  return {
    title: '引用到项目',
    tip: `选择要把「${title}」引用到哪个项目：`,
    confirm: '确定引用',
    loading: '引用中…',
  }
})

const handleConfirm = () => {
  if (!selectedProjectId.value) return
  emit('confirm', selectedProjectId.value)
}

watch(
  () => props.visible,
  (open) => {
    if (open) selectedProjectId.value = null
  }
)
</script>

<style scoped lang="scss" src="./referenceProjectDialog.scss"></style>
