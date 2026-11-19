<template>
	<div class="perform-panel">
		<div class="perform-head">
			<span>演出模式</span>
			<button class="perform-close" @click="emit('close')">×</button>
		</div>
		<div class="perform-pos">
			场景 {{ sceneIndex + 1 }}/{{ sceneCount }} · 节点 #{{ nodeId }}
		</div>
		<div class="perform-tip">改动直接写入作品，保存后当前画面热更新；玩家端不显示此面板。</div>

		<label class="perform-label">台词</label>
		<textarea
			:value="contentText"
			class="perform-textarea"
			rows="3"
			placeholder="当前节点台词"
			@input="emit('update:contentText', ($event.target as HTMLTextAreaElement).value)"
		></textarea>

		<template v-if="contentType === '对话'">
			<label class="perform-label">差分立绘</label>
			<select
				:value="avatarId"
				class="perform-select"
				@change="emit('update:avatarId', ($event.target as HTMLSelectElement).value)"
			>
				<option value="">跟随角色默认立绘</option>
				<optgroup v-for="c in characters" :key="c.character_id" :label="c.name">
					<option
						v-for="a in (c.avatars || [])"
						:key="a.avatar_id"
						:value="String(a.avatar_id)"
					>{{ a.avatar_type || '立绘' }} #{{ a.avatar_id }}</option>
				</optgroup>
			</select>
		</template>

		<label class="perform-label">场景背景 URL</label>
		<input
			:value="background"
			class="perform-input"
			placeholder="/uploads/... 或 https://..."
			@input="emit('update:background', ($event.target as HTMLInputElement).value)"
		/>

		<label class="perform-label">场景 BGM URL</label>
		<input
			:value="music"
			class="perform-input"
			placeholder="留空表示本场景无背景音乐"
			@input="emit('update:music', ($event.target as HTMLInputElement).value)"
		/>

		<button class="perform-save" type="button" :disabled="saving" @click="emit('save')">
			{{ saving ? '保存中…' : '保存并热更新' }}
		</button>
		<div class="perform-status">{{ status }}</div>
	</div>
</template>

<script setup lang="ts">
// 演出模式面板：只接收当前节点与表单快照用于展示，所有编辑都通过 v-model 事件上抛，
// 保存与热更新编排仍留在 usePlayerPerform，组件自身不持有播放或保存逻辑。
defineProps<{
	sceneIndex: number
	sceneCount: number
	nodeId: string | number
	characters: any[]
	contentType: string
	contentText: string
	avatarId: string
	background: string
	music: string
	saving: boolean
	status: string
}>()

const emit = defineEmits<{
	(e: 'update:contentText', value: string): void
	(e: 'update:avatarId', value: string): void
	(e: 'update:background', value: string): void
	(e: 'update:music', value: string): void
	(e: 'save'): void
	(e: 'close'): void
}>()
</script>

<style scoped>
/* 演出模式编辑面板 */
.perform-panel {
  position: absolute;
  top: 170px;
  right: 16px;
  z-index: 40;
  width: 300px;
  max-height: calc(100vh - 260px);
  overflow-y: auto;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(18, 22, 26, 0.92);
  color: #e8ecef;
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
}

.perform-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
}

.perform-close {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.perform-pos {
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.perform-tip {
  margin: 6px 0 10px;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.55);
}

.perform-label {
  display: block;
  margin-top: 10px;
  margin-bottom: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
}

.perform-textarea,
.perform-input,
.perform-select {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 12px;
  font-family: inherit;
  outline: none;
}

.perform-textarea {
  resize: vertical;
  line-height: 1.5;
}

.perform-select option,
.perform-select optgroup {
  color: #1f2329;
  background: #fff;
}

.perform-save {
  width: 100%;
  margin-top: 14px;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: #2aa37b;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.perform-save:hover {
  opacity: 0.88;
}

.perform-save:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.perform-status {
  min-height: 16px;
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
}

@media (max-width: 768px) {
  .perform-panel {
    top: 166px;
    right: 10px;
    width: min(300px, calc(100vw - 20px));
    max-height: calc(100vh - 240px);
  }
}
</style>
