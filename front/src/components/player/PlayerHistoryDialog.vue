<script lang="ts">
export interface HistoryDialogueItem {
	key: number | string
	sceneTitle?: string
	character?: string
	text?: string
	chosen?: boolean
	choiceText?: string
}
</script>

<template>
	<!-- 历史回想浮层：点击遮罩或关闭图标收起 -->
	<div v-if="visible" class="history-dialogue-container" @click="emit('close')">
		<div class="history-dialogue-content">
			<div class="history-header">
				<h3>{{ t('history.title') }}</h3>
				<el-icon class="close-btn" @click.stop="emit('close')">
					<CloseBold />
				</el-icon>
			</div>
			<div class="history-scroll-area">
				<div v-for="item in items" :key="item.key" class="history-item">
					<div v-if="item.sceneTitle" class="history-scene">{{ item.sceneTitle }}</div>
					<span class="history-character">{{ item.character }}</span>
					<span class="history-text">{{ item.text }}</span>
					<div v-if="item.chosen" class="history-chosen">{{ t('history.choiceLabel') }}{{ item.choiceText }}</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { CloseBold } from '@element-plus/icons-vue'
import { playerText } from '@/utils/playerI18n'

const props = withDefaults(
	defineProps<{
		language: string
		visible?: boolean
		items?: HistoryDialogueItem[]
	}>(),
	{
		visible: false,
		items: () => [],
	},
)

const emit = defineEmits<{
	(e: 'close'): void
}>()

const t = (key: string) => playerText(props.language, key)
</script>

<style scoped>
.history-dialogue-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

.history-dialogue-content {
  width: 100%;
  max-width: 800px;
  background-color: rgba(0, 0, 0, 0.85);
  border-radius: 12px;
  padding: 20px;
  color: white;
  max-height: 80vh;
  position: relative;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.history-header h3 {
  margin: 0;
  font-size: 18px;
}

.history-scroll-area {
  max-height: calc(80vh - 80px);
  overflow-y: auto;
  padding-right: 10px;
}

.history-item {
  margin-bottom: 15px;
  padding: 10px;
  border-radius: 6px;
  background-color: rgba(255, 255, 255, 0.1);
}

.history-character {
  font-weight: bold;
  color: #ff6b8b;
  margin-right: 10px;
}

.history-scene {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 4px;
}

.history-chosen {
  margin-top: 4px;
  font-size: 13px;
  color: #ffd1dc;
}

.history-text {
  line-height: 1.6;
}

.close-btn {
  color: white;
  cursor: pointer;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #ff6b8b;
}

@media (max-width: 768px) {
  .history-dialogue-content {
    width: 94vw;
    max-height: 82vh;
  }
}
</style>
