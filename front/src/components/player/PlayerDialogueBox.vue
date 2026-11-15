<template>
	<!-- 对话显示区域（位于最上层） -->
	<div v-if="visible" class="dialogue-display">
		<!-- 当前对话 -->
		<div
			v-if="hasLine"
			:class="['dialogue-box', `box-${contentType}`, `style-${boxStyle || 'classic'}`]"
			@click="emit('advance')"
		>
			<img
				v-if="bubbleAvatarSrc"
				class="bubble-avatar"
				:src="bubbleAvatarSrc"
				alt=""
				@error="hideBrokenImage"
			/>
			<span class="character-name">{{ characterName }}</span>
			<button
				v-if="showVoiceButton"
				type="button"
				class="voice-replay-btn"
				:title="t('player.voiceReplay')"
				@click.stop="emit('replay-voice')"
			>{{ t('player.voiceBtn') }}</button>
			<div
				class="dialogue-text"
				:style="{ fontSize: fontSize + 'px', lineHeight: lineHeight }"
				v-html="textHtml"
			></div>

			<!-- 分支选项：选择后跳到目标节点，而不是线性继续 -->
			<div v-if="choices.length" class="choice-panel" @click.stop>
				<button
					v-for="choice in choices"
					:key="choice.id"
					:class="['choice-option', { 'has-image': !!choice.imageUrl, 'is-locked': choice.locked }]"
					:disabled="choice.locked"
					:title="choice.title"
					@click.stop="emit('select-choice', choice.id)"
				>
					<img
						v-if="choice.imageUrl"
						:src="choice.imageUrl"
						class="choice-image"
						alt=""
						loading="lazy"
					/>
					<span class="choice-label">{{ choice.label }}</span>
					<span v-if="choice.locked" class="choice-lock-hint">{{ choice.lockText }}</span>
				</button>
			</div>

			<PlayerFunctionButtons
				:language="language"
				:auto-play="autoPlay"
				@history="emit('history')"
				@toggle-box="emit('toggle-box')"
				@skip="emit('skip')"
				@toggle-auto="emit('toggle-auto')"
				@restart="emit('restart')"
				@save="emit('save')"
				@exit="emit('exit')"
			/>
		</div>

		<!-- 场景对话结束，自动进入下一场景 -->
		<div v-if="sceneEnded" class="dialogue-end">
			<PlayerFunctionButtons
				:language="language"
				:auto-play="autoPlay"
				@history="emit('history')"
				@toggle-box="emit('toggle-box')"
				@skip="emit('skip')"
				@toggle-auto="emit('toggle-auto')"
				@restart="emit('restart')"
				@save="emit('save')"
				@exit="emit('exit')"
			/>
		</div>

		<!-- 场景无对话，自动进入下一场景 -->
		<div v-if="noDialogues" class="no-dialogues-preview">
			<PlayerFunctionButtons
				:language="language"
				:auto-play="autoPlay"
				@history="emit('history')"
				@toggle-box="emit('toggle-box')"
				@skip="emit('skip')"
				@toggle-auto="emit('toggle-auto')"
				@restart="emit('restart')"
				@save="emit('save')"
				@exit="emit('exit')"
			/>
		</div>
	</div>

	<!-- 对话框隐藏时显示的显示按钮 -->
	<div v-if="showRevealButton" class="show-dialogue-btn" @click="emit('reveal-box')">
		<el-tooltip :content="t('tooltip.showBox')" placement="top">
			<el-icon size="30">
				<View />
			</el-icon>
		</el-tooltip>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PlayerFunctionButtons from '@/components/player/PlayerFunctionButtons.vue'
import { hideBrokenImage } from '@/utils/dom'
import { playerText } from '@/utils/playerI18n'

export interface DialogueChoiceView {
	id: number | string
	label: string
	imageUrl?: string
	locked?: boolean
	lockText?: string
	title?: string
}

// 对话框区域：只负责「显出当前这句 + 选项 + 功能键」，
// 逐字机、语音播放、分支跳转、存档等一律由父级通过数据/事件驱动。
const props = defineProps<{
	language: string
	visible: boolean
	hasLine: boolean
	sceneEnded: boolean
	noDialogues: boolean
	contentType: string
	boxStyle: string
	fontSize: number
	lineHeight: string | number
	characterName: string
	textHtml: string
	avatarSrc: string
	showVoiceButton: boolean
	autoPlay: boolean
	showRevealButton: boolean
	choices: DialogueChoiceView[]
}>()

const emit = defineEmits<{
	(e: 'advance'): void
	(e: 'replay-voice'): void
	(e: 'select-choice', id: number | string): void
	(e: 'history'): void
	(e: 'toggle-box'): void
	(e: 'skip'): void
	(e: 'toggle-auto'): void
	(e: 'restart'): void
	(e: 'save'): void
	(e: 'exit'): void
	(e: 'reveal-box'): void
}>()

const t = (key: string) => playerText(props.language, key)

const bubbleAvatarSrc = computed(() => (
	props.boxStyle === 'bubble' && props.contentType === '对话' && props.avatarSrc ? props.avatarSrc : ''
))
</script>

<style scoped>
/* 对话显示区域 - 位于最上层 */
.dialogue-display {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px;
  z-index: 3; /* 对话框层级最高 */
}

.dialogue-box {
  background-color: var(--ui-dialog-bg);
  color: var(--ui-dialog-text);
  border-radius: 12px;
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
}

.dialogue-box:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.25);
}

/* 气泡对话样式 */
.dialogue-box.style-bubble {
  background: transparent;
  box-shadow: none;
  max-width: 760px;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.dialogue-box.style-bubble:hover {
  transform: none;
  box-shadow: none;
}

.dialogue-box.style-bubble .bubble-avatar {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.95);
  margin-bottom: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.dialogue-box.style-bubble .character-name {
  display: inline-block;
  background: var(--ui-name-bg);
  color: var(--ui-name);
  padding: 3px 12px;
  border-radius: 12px 12px 12px 3px;
  font-size: 13px;
  margin-bottom: 6px;
}

.dialogue-box.style-bubble .dialogue-text {
  background: var(--ui-bubble-bg);
  border-radius: 3px 16px 16px 16px;
  padding: 14px 18px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16);
  color: var(--ui-dialog-text);
  min-width: 220px;
}

/* 旁白气泡：居中、半透明深色，不走角色气泡 */
.dialogue-box.style-bubble.box-描述 {
  align-items: center;
}

.dialogue-box.style-bubble.box-描述 .character-name {
  display: none;
}

.dialogue-box.style-bubble.box-描述 .dialogue-text {
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border-radius: 16px;
  text-align: center;
  padding: 12px 22px;
}

.dialogue-box.style-bubble .continue-indicator {
  align-self: flex-end;
}

.character-name {
  font-weight: bold;
  color: var(--ui-name);
  font-size: 16px;
}

.voice-replay-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  border: 1px solid var(--ui-choice-border);
  background: var(--ui-choice-bg);
  color: var(--ui-choice-text);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.16s ease;
}

.voice-replay-btn:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
}

.dialogue-text strong {
  font-weight: 700;
}

.dialogue-text ruby rt {
  font-size: 0.55em;
  color: #b37d8f;
  letter-spacing: 0;
}

.dialogue-text {
  font-size: 18px;
  line-height: 1.6;
  color: var(--ui-dialog-text);
  margin-bottom: 15px;
  min-height: 100px;
}

/* 分支选项 */
.choice-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 8px 0 16px;
}

.choice-option {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--ui-choice-border);
  border-radius: 10px;
  background: var(--ui-choice-bg);
  color: var(--ui-choice-text);
  font-size: 16px;
  text-align: left;
  cursor: pointer;
  transition: all 0.18s ease;
}

/* 图片选项：上方配图 + 下方文案 */
.choice-option.has-image {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}

.choice-image {
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: 8px;
  display: block;
}

.choice-label {
  display: block;
}

.choice-option.has-image .choice-label {
  padding: 0 6px 4px;
}

.choice-option:hover {
  transform: translateX(4px);
  border-color: #ff7b9c;
  box-shadow: 0 4px 14px rgba(255, 123, 156, 0.25);
}

.choice-option.is-locked {
  opacity: 0.62;
  cursor: not-allowed;
  filter: grayscale(0.45);
}

.choice-option.is-locked:hover {
  transform: none;
  border-color: var(--ui-choice-border);
  box-shadow: none;
}

.choice-lock-hint {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #9a7a86;
  line-height: 1.5;
}

.continue-indicator {
  position: absolute;
  bottom: 10px;
  right: 150px; /* 留出更多功能按钮的位置 */
  color: var(--ui-accent);
  animation: bounce 1.5s infinite;
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(5px);
  }
}

/* 显示对话框按钮（当对话框隐藏时） */
.show-dialogue-btn {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background-color: rgba(255, 255, 255, 0.8);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  z-index: 4;
  color: #d81f37;
}

.show-dialogue-btn:hover {
  background-color: white;
}

/* 对话结束和无对话状态 */
.dialogue-end, .no-dialogues-preview {
  text-align: center;
  background-color: rgba(255, 255, 255, 0.9);
  padding: 20px;
  border-radius: 12px;
  max-width: 500px;
  margin: 0 auto;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
  position: relative;
  min-height: 100px; /* 确保有足够空间显示按钮 */
}

@media (max-width: 1200px) {
  .continue-indicator {
    right: 130px;
  }
}

@media (max-width: 768px) {
  .dialogue-display {
    padding: 10px;
  }

  .dialogue-box {
    padding: 14px;
    border-radius: 10px;
  }

  .dialogue-text {
    font-size: 16px;
    min-height: 72px;
    margin-bottom: 8px;
  }

  .continue-indicator {
    right: 100px;
  }

  .choice-option {
    padding: 14px;
    font-size: 15px;
  }
}
</style>
