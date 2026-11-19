<template>
	<button
		v-if="ready"
		class="player-settings-btn"
		:title="t('player.settingsTitle')"
		@click="emit('open-settings')"
	>
		<el-icon><Setting /></el-icon>
	</button>
	<button
		v-if="ready && canRollback"
		class="player-back-btn"
		:title="t('player.backOneLine')"
		@click="emit('rollback')"
	>
		<el-icon><RefreshLeft /></el-icon>
	</button>
	<button
		v-if="ready && canPerform"
		class="player-perform-btn"
		:class="{ 'is-active': performMode }"
		title="演出模式（作者预览）"
		@click="emit('toggle-perform')"
	>
		<el-icon><EditPen /></el-icon>
	</button>
	<button
		v-if="ready && hasVariables"
		class="player-status-btn"
		:title="t('player.statusTitle')"
		@click="emit('open-status')"
	>
		<el-icon><DataLine /></el-icon>
	</button>
	<button
		v-if="ready"
		class="player-gallery-btn"
		:title="t('player.galleryTitle')"
		@click="emit('open-gallery')"
	>
		<el-icon><Picture /></el-icon>
	</button>
	<button
		v-if="ready && hasReleases"
		class="player-changelog-btn"
		:title="t('changelog.title')"
		@click="emit('open-changelog')"
	>
		{{ t('player.updateBtn') }}
	</button>
	<button
		v-if="ready && hasChapters"
		class="player-chapter-btn"
		:title="t('chapters.title')"
		@click="emit('open-chapters')"
	>
		{{ t('player.chapterBtn') }}
	</button>
	<button
		v-if="ready && debugMode"
		class="player-debug-btn"
		title="调试器"
		@click="emit('toggle-debug')"
	>
		调试
	</button>
	<div v-if="ready && showRotateHint" class="rotate-hint">
		<span>{{ t('player.rotateHint') }}</span>
		<button @click.stop="emit('dismiss-rotate')">{{ t('player.gotIt') }}</button>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Setting, RefreshLeft, EditPen, DataLine, Picture } from '@element-plus/icons-vue'
import { playerText } from '@/utils/playerI18n'

// 播放器右上角入口栏 + 竖屏提示：只接收「能不能显示 / 显示什么文案」的数据，
// 点击一律抛领域事件，弹窗开启、模式切换、回退等动作全部由父级编排。
const props = defineProps<{
	language: string
	loading: boolean
	error: string
	canRollback: boolean
	canPerform: boolean
	performMode: boolean
	hasVariables: boolean
	hasReleases: boolean
	hasChapters: boolean
	debugMode: boolean
	showRotateHint: boolean
}>()

const emit = defineEmits<{
	(e: 'open-settings'): void
	(e: 'rollback'): void
	(e: 'toggle-perform'): void
	(e: 'open-status'): void
	(e: 'open-gallery'): void
	(e: 'open-changelog'): void
	(e: 'open-chapters'): void
	(e: 'toggle-debug'): void
	(e: 'dismiss-rotate'): void
}>()

const ready = computed(() => !props.loading && !props.error)
const t = (key: string) => playerText(props.language, key)
</script>

<style scoped>
/* 阅读设置入口 */
.player-settings-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 30;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: all 0.2s ease;
}

.player-settings-btn:hover {
  background: rgba(0, 0, 0, 0.45);
  transform: rotate(20deg);
}

/* 上一句回退 */
.player-back-btn {
  position: absolute;
  top: 66px;
  right: 16px;
  z-index: 30;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: all 0.2s ease;
}

.player-back-btn:hover {
  background: rgba(0, 0, 0, 0.45);
}

/* 演出模式入口 */
.player-perform-btn {
  position: absolute;
  top: 116px;
  right: 16px;
  z-index: 30;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: all 0.2s ease;
}

.player-perform-btn:hover,
.player-perform-btn.is-active {
  background: rgba(42, 163, 123, 0.72);
  border-color: rgba(255, 255, 255, 0.85);
}

/* 状态入口 */
.player-status-btn {
  position: absolute;
  top: 16px;
  right: 68px;
  z-index: 30;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: all 0.2s ease;
}

.player-status-btn:hover {
  background: rgba(0, 0, 0, 0.45);
}

/* CG 鉴赏入口 */
.player-gallery-btn {
  position: absolute;
  top: 16px;
  right: 120px;
  z-index: 30;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: all 0.2s ease;
}

.player-gallery-btn:hover {
  background: rgba(0, 0, 0, 0.45);
}

/* 更新记录入口 */
.player-changelog-btn {
  position: absolute;
  top: 16px;
  right: 172px;
  z-index: 30;
  height: 42px;
  min-width: 54px;
  padding: 0 12px;
  border-radius: 21px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: all 0.2s ease;
}

.player-changelog-btn:hover {
  background: rgba(0, 0, 0, 0.45);
}

/* 章节跳转 / 路线图鉴入口 */
.player-chapter-btn {
  position: absolute;
  top: 16px;
  right: 236px;
  z-index: 30;
  height: 42px;
  min-width: 54px;
  padding: 0 12px;
  border-radius: 21px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.player-chapter-btn:hover {
  background: rgba(0, 0, 0, 0.45);
}

/* 调试器入口 */
.player-debug-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 31;
  padding: 0 14px;
  height: 34px;
  border-radius: 17px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.32);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(6px);
}

/* 竖屏提示 */
.rotate-hint {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  backdrop-filter: blur(6px);
}

.rotate-hint button {
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: transparent;
  color: #fff;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}

/* 移动端：入口按钮加大触控面积并贴边 */
@media (max-width: 768px) {
  .player-settings-btn {
    top: 10px;
    right: 10px;
    width: 44px;
    height: 44px;
  }

  .player-back-btn {
    top: 62px;
    right: 10px;
    width: 44px;
    height: 44px;
  }

  .player-perform-btn {
    top: 114px;
    right: 10px;
    width: 44px;
    height: 44px;
  }

  .player-status-btn {
    top: 10px;
    right: 62px;
    width: 44px;
    height: 44px;
  }

  .player-gallery-btn {
    top: 10px;
    right: 114px;
    width: 44px;
    height: 44px;
  }

  .player-changelog-btn {
    top: 10px;
    right: 168px;
    height: 44px;
  }

  .player-chapter-btn {
    top: 10px;
    right: 232px;
    height: 44px;
  }
}
</style>
