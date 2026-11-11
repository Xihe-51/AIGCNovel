<template>
	<el-dialog v-model="visibleModel" title="立绘差分层" width="600px" class="custom-dialog">
		<div v-if="avatar" class="layer-panel">
			<div class="layer-base">
				<img :src="BASE_URL + (avatar.image_url || '')" alt="" />
				<div class="layer-base-meta">
					<p class="layer-base-title">
						{{ avatar.avatar_type }} · {{ avatar.costume || '默认服装' }}
					</p>
					<p class="layer-base-desc">
						基础图固定不动；差分图按「叠放顺序」压在上面，数字越大越靠前。透明底 PNG 效果最好。
					</p>
				</div>
			</div>

			<div v-if="avatar.layers && avatar.layers.length" class="layer-list">
				<div v-for="layer in avatar.layers" :key="layer.layer_id" class="layer-row">
					<img :src="BASE_URL + layer.image_url" alt="" class="layer-thumb" />
					<el-input
						v-model="layer.layer_name"
						placeholder="层名称"
						class="layer-name"
						@change="saveAvatarLayer(layer)"
					/>
					<el-select v-model="layer.layer_type" class="layer-type" @change="saveAvatarLayer(layer)">
						<el-option v-for="t in layerTypes" :key="t.value" :label="t.label" :value="t.value" />
					</el-select>
					<el-input-number
						v-model="layer.order"
						:min="0"
						:max="99"
						size="small"
						controls-position="right"
						class="layer-order"
						@change="saveAvatarLayer(layer)"
					/>
					<button class="avatar-btn delete" @click="removeAvatarLayer(layer)">删除</button>
				</div>
			</div>
			<p v-else class="layer-empty">还没有差分层。上传一张透明底表情/姿势图即可叠加。</p>

			<div class="layer-upload">
				<el-upload
					:show-file-list="false"
					:auto-upload="false"
					:on-change="onLayerFileChange"
					accept=".png,.webp,.jpg,.jpeg"
					drag
				>
					<div class="upload-area layer-upload-area">
						<el-icon><UploadFilled /></el-icon>
						<p>点击或拖拽上传差分图{{ layerFile ? `：${layerFile.name}` : '' }}</p>
					</div>
				</el-upload>
				<div class="layer-upload-form">
					<el-input v-model="newLayer.layer_name" placeholder="层名称，如「微笑」" />
					<el-select v-model="newLayer.layer_type">
						<el-option v-for="t in layerTypes" :key="t.value" :label="t.label" :value="t.value" />
					</el-select>
					<button class="dialog-btn confirm" :disabled="!layerFile || saving" @click="addAvatarLayer">
						{{ saving ? '上传中…' : '添加差分层' }}
					</button>
				</div>
			</div>
		</div>
		<template #footer>
			<button class="dialog-btn cancel" @click="visibleModel = false">关闭</button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import {
	uploadCharacterAvatarLayer,
	updateCharacterAvatarLayer,
	deleteCharacterAvatarLayer,
} from '@/api/character'
import type { CharacterAvatarLayer } from '@/api/character'
import { BASE_URL } from '@/utils/request'

/** 差分层只需要基础图信息，页面里的立绘对象字段更宽，这里按用到的字段声明 */
interface LayerAvatar {
	avatar_id: number
	avatar_type: string
	costume?: string
	image_url?: string
	layers?: CharacterAvatarLayer[]
}

const props = defineProps<{
	visible: boolean
	avatar: LayerAvatar | null
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'changed'): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const layerTypes = [
	{ value: 'expression', label: '表情' },
	{ value: 'pose', label: '姿势' },
	{ value: 'costume', label: '服装' },
	{ value: 'other', label: '其他' },
]

const layerFile = ref<File | null>(null)
const saving = ref(false)
const newLayer = ref<{ layer_name: string; layer_type: string }>({ layer_name: '', layer_type: 'expression' })

watch(
	() => props.visible,
	(open: boolean) => {
		if (!open) return
		layerFile.value = null
		newLayer.value = { layer_name: '', layer_type: 'expression' }
	}
)

const onLayerFileChange = (file: any) => {
	layerFile.value = file?.raw || null
}

// 差分层按叠放顺序升序展示，和「数字越大越靠前」的语义保持一致
const sortTargetLayers = () => {
	const avatar = props.avatar
	if (!avatar?.layers) return
	avatar.layers = [...avatar.layers].sort(
		(a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)
	)
}

const addAvatarLayer = async () => {
	if (!props.avatar || !layerFile.value) return
	saving.value = true
	try {
		await uploadCharacterAvatarLayer(
			props.avatar.avatar_id,
			layerFile.value,
			newLayer.value.layer_name.trim() || undefined,
			newLayer.value.layer_type,
		)
		layerFile.value = null
		newLayer.value = { layer_name: '', layer_type: 'expression' }
		emit('changed')
		ElMessage.success('差分层已添加')
	} catch (error) {
		ElMessage.error('差分层上传失败，请重试')
	} finally {
		saving.value = false
	}
}

const saveAvatarLayer = async (layer: CharacterAvatarLayer) => {
	try {
		await updateCharacterAvatarLayer(layer.layer_id, {
			layer_name: layer.layer_name || '',
			layer_type: layer.layer_type,
			order: Number(layer.order) || 0,
		})
		sortTargetLayers()
		ElMessage.success('差分层已更新')
	} catch (error) {
		ElMessage.error('差分层更新失败')
	}
}

const removeAvatarLayer = async (layer: CharacterAvatarLayer) => {
	try {
		await ElMessageBox.confirm('确定要删除这个差分层吗？', '警告', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
		await deleteCharacterAvatarLayer(layer.layer_id)
		emit('changed')
		ElMessage.success('差分层已删除')
	} catch {}
}
</script>

<style src="./projectDialog.css"></style>

<style scoped lang="scss">
.layer-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.layer-base {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px;
  background: #fdf3f7;
  border: 1px solid #f6d6e2;
  border-radius: 10px;

  img {
    width: 56px;
    height: 72px;
    object-fit: contain;
    background: #fff;
    border-radius: 6px;
  }
}

.layer-base-meta {
  flex: 1;
  min-width: 0;
}

.layer-base-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #3d2b32;
}

.layer-base-desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: #8a6a76;
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid #f0dfe6;
  border-radius: 8px;
  background: #fff;
}

.layer-thumb {
  width: 40px;
  height: 52px;
  object-fit: contain;
  background: #faf6f8;
  border-radius: 4px;
  flex: none;
}

.layer-name {
  flex: 1;
  min-width: 90px;
}

.layer-type {
  width: 88px;
  flex: none;
}

.layer-order {
  width: 96px;
  flex: none;
}

.layer-empty {
  margin: 0;
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: #b99aa5;
  background: #faf6f8;
  border: 1px dashed #e8d3dd;
  border-radius: 8px;
}

.layer-upload {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .el-upload {
    width: 100%;
  }

  .el-upload-dragger {
    width: 100%;
  }
}

.upload-area {
  padding: 30px;
  text-align: center;
  color: #999999;

  .el-icon {
    font-size: 40px;
    margin-bottom: 12px;
    color: #ff8fab;
  }

  p {
    margin: 0;
  }
}

.layer-upload-area {
  padding: 14px 0 !important;
  font-size: 12px;
}

.layer-upload-form {
  display: flex;
  gap: 8px;

  .el-input {
    flex: 1;
  }

  .el-select {
    width: 100px;
    flex: none;
  }

  .dialog-btn.confirm {
    flex: none;
    padding: 0 14px;
  }
}
</style>
