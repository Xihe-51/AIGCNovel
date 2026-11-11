<template>
	<el-dialog
		v-model="visibleModel"
		title="素材体检"
		width="720px"
		class="custom-dialog"
		:close-on-click-modal="false"
	>
		<div v-if="loading" class="asset-loading">
			<div class="spinner"></div>
			<span>正在核对素材文件…</span>
		</div>
		<div v-else-if="result" class="asset-check">
			<div :class="['asset-summary', result.healthy ? 'is-ok' : 'is-warn']">
				<el-icon><WarningFilled /></el-icon>
				<span v-if="result.healthy">
					素材全部就位：共 {{ result.total }} 条素材，文件都在。
				</span>
				<span v-else>
					发现 {{ result.missing_count }} 条缺失素材
					（共 {{ result.total }} 条，正常 {{ result.ok_count }} 条）。
				</span>
			</div>

			<div v-if="result.missing_count" class="asset-section">
				<div class="asset-section-title">缺失的文件</div>
				<div v-for="(m, i) in result.missing" :key="'m' + i" class="asset-row">
					<span class="asset-kind">{{ m.kind_label }}</span>
					<span class="asset-where">{{ m.where }}</span>
					<span class="asset-url">{{ m.url }}</span>
				</div>
			</div>

			<div v-if="result.market_references.length" class="asset-section">
				<div class="asset-section-title">
					引用的市场素材（{{ result.market_references.length }} 条）
				</div>
				<div v-for="(r, i) in result.market_references" :key="'r' + i" class="asset-row">
					<span class="asset-kind">{{ r.resource_type }}</span>
					<span class="asset-where">{{ r.title }}</span>
					<span :class="['asset-status', r.status]">
						{{ r.status === 'missing' ? '文件缺失' : (r.status === 'external' ? '外链' : '正常') }}
					</span>
					<span class="asset-count">被引用 {{ r.reference_count }} 次</span>
				</div>
			</div>

			<p class="asset-tip">
				缺失通常是静态文件被删/搬走，或从市场素材删除后遗留。重新上传即可修复。
			</p>
		</div>
		<template #footer>
			<button class="dialog-btn cancel" @click="visibleModel = false">关闭</button>
			<button class="dialog-btn confirm" @click="runCheck">重新检查</button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { WarningFilled } from '@element-plus/icons-vue'
import { checkProjectAssets } from '@/api/asset'
import type { AssetCheckResult } from '@/api/asset'

const props = defineProps<{
	visible: boolean
	projectId: number
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const loading = ref(false)
const result = ref<AssetCheckResult | null>(null)

// 体检结果只在弹窗打开时拉取，关闭后保留上一次结果
const runCheck = async () => {
	loading.value = true
	result.value = null
	try {
		result.value = await checkProjectAssets(props.projectId)
	} catch (error) {
		console.error('素材体检失败:', error)
		ElMessage.error('素材体检失败，请稍后重试')
	} finally {
		loading.value = false
	}
}

watch(
	() => props.visible,
	(open: boolean) => {
		if (open) runCheck()
	}
)
</script>

<style src="./projectDialog.css"></style>

<style scoped lang="scss">
.asset-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 28px 4px;
  color: #8a6a76;
  font-size: 13px;
}

.asset-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 14px;
}

.asset-summary.is-ok {
  color: #1f7a52;
  background: #f0fbf5;
  border: 1px solid #cdeeda;
}

.asset-summary.is-warn {
  color: #a8562a;
  background: #fff8f0;
  border: 1px solid #f6dfc8;
}

.asset-section {
  margin-bottom: 14px;
}

.asset-section-title {
  font-size: 12px;
  color: #8a6a76;
  margin-bottom: 8px;
}

.asset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #f5e4ea;
  border-radius: 9px;
  background: #fff;
  margin-bottom: 6px;
  font-size: 12px;
}

.asset-kind {
  flex-shrink: 0;
  font-size: 10px;
  color: #c81f4a;
  background: #fdeef3;
  border: 1px solid #f6d6e2;
  border-radius: 6px;
  padding: 1px 7px;
}

.asset-where {
  flex-shrink: 0;
  max-width: 200px;
  color: #3d2b32;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-url {
  flex: 1;
  min-width: 0;
  color: #b99aa5;
  font-family: Consolas, Monaco, monospace;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-status {
  flex-shrink: 0;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
}

.asset-status.ok { color: #1f7a52; background: #f0fbf5; }
.asset-status.missing { color: #c0392b; background: #fdeeee; }
.asset-status.external { color: #6b7280; background: #f4f4f5; }

.asset-count {
  flex-shrink: 0;
  font-size: 11px;
  color: #8a6a76;
}

.asset-tip {
  margin: 6px 0 0;
  font-size: 11px;
  color: #b99aa5;
  line-height: 1.6;
}
</style>
