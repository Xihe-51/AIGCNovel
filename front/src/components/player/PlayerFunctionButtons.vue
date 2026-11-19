<template>
	<div class="function-buttons">
		<el-tooltip :content="t('tooltip.history')" placement="top">
			<el-icon @click.stop="emit('history')" class="func-btn">
				<Search />
			</el-icon>
		</el-tooltip>

		<el-tooltip :content="t('tooltip.hideBox')" placement="top">
			<el-icon @click.stop="emit('toggle-box')" class="func-btn">
				<Hide />
			</el-icon>
		</el-tooltip>

		<el-tooltip :content="t('tooltip.skip')" placement="top">
			<el-icon @click.stop="emit('skip')" class="func-btn">
				<DArrowRight />
			</el-icon>
		</el-tooltip>

		<el-tooltip :content="autoPlay ? t('tooltip.autoOff') : t('tooltip.autoOn')" placement="top">
			<el-icon @click.stop="emit('toggle-auto')" class="func-btn">
				<VideoPlay />
			</el-icon>
		</el-tooltip>

		<el-tooltip :content="t('tooltip.restart')" placement="top">
			<el-icon @click.stop="emit('restart')" class="func-btn">
				<SwitchButton />
			</el-icon>
		</el-tooltip>

		<el-tooltip :content="t('tooltip.saveProgress')" placement="top">
			<el-icon @click.stop="emit('save')" class="func-btn save-func-btn">
				<DocumentAdd />
			</el-icon>
		</el-tooltip>

		<el-tooltip :content="t('tooltip.exitGame')" placement="top">
			<el-icon @click.stop="emit('exit')" class="func-btn">
				<CloseBold />
			</el-icon>
		</el-tooltip>
	</div>
</template>

<script setup lang="ts">
import {
	Search,
	Hide,
	DArrowRight,
	VideoPlay,
	SwitchButton,
	DocumentAdd,
	CloseBold,
} from '@element-plus/icons-vue'
import { playerText } from '@/utils/playerI18n'

// 对话框右下角的 7 个功能按钮：只接收展示所需的数据（文案语言 + 自动播放状态），
// 点击一律向父级抛领域事件，自身不持有播放状态、不调用任何播放逻辑。
const props = defineProps<{
	language: string
	autoPlay: boolean
}>()

const emit = defineEmits<{
	(e: 'history'): void
	(e: 'toggle-box'): void
	(e: 'skip'): void
	(e: 'toggle-auto'): void
	(e: 'restart'): void
	(e: 'save'): void
	(e: 'exit'): void
}>()

const t = (key: string) => playerText(props.language, key)
</script>

<style scoped>
/* 功能按钮区域（定位相对最近的 .dialogue-box / .dialogue-end 定位祖先） */
.function-buttons {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: flex;
  gap: 10px;
  z-index: 4;
}

.func-btn {
  width: 30px;
  height: 30px;
  color: #d81f37;
  cursor: pointer;
  transition: all 0.2s;
  background-color: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.func-btn:hover {
  transform: scale(1.1);
  color: #ff6b8b;
}

/* 移动端：触控目标不小于 40px */
@media (max-width: 768px) {
  .func-btn {
    width: 40px;
    height: 40px;
    font-size: 20px;
  }

  .function-buttons {
    gap: 8px;
    flex-wrap: wrap;
  }
}
</style>
