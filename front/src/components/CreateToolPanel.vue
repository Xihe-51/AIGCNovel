<template>
	<div class="tp-root">
		<div class="tp-tabs">
			<button
				v-for="t in tabs"
				:key="t.key"
				:class="['tp-tab', { 'is-active': tab === t.key }]"
				@click="tab = t.key"
			>
				{{ t.label }}
				<span v-if="t.badge" class="tp-badge">{{ t.badge }}</span>
			</button>
		</div>

		<div class="tp-body">
			<!-- 角色 -->
			<template v-if="tab === 'characters'">
				<div v-if="loadingChars" class="tp-state">加载中…</div>
				<div v-else-if="!characters.length" class="tp-state">
					还没有角色，先去项目信息页添加
				</div>
				<div v-else class="tp-list">
					<div
						v-for="c in characters"
						:key="c.character_id"
						class="tp-char"
					>
						<div class="tp-char-head" @click="toggleChar(c.character_id)">
							<div class="tp-char-avatar">
								<img v-if="c.avatar_url" :src="BASE_URL + c.avatar_url" alt="" loading="lazy" />
								<span v-else>{{ c.name.slice(0, 1) }}</span>
							</div>
							<div class="tp-char-meta">
								<div class="tp-char-name">
									{{ c.name }}
									<span v-if="c.is_main" class="tp-tag">主角</span>
								</div>
								<div class="tp-char-sub">
									{{ avatarCount(c.character_id) }} 张立绘
								</div>
							</div>
							<span class="tp-char-arrow">{{ openChar === c.character_id ? '−' : '+' }}</span>
						</div>

						<div v-if="openChar === c.character_id" class="tp-char-avatars">
							<div
								v-for="a in avatarsOf(c.character_id)"
								:key="a.avatar_id"
								class="tp-avatar"
								:title="a.avatar_type || '立绘'"
							>
								<img v-if="a.image_url" :src="BASE_URL + a.image_url" alt="" loading="lazy" />
								<span class="tp-avatar-type">{{ a.avatar_type || '立绘' }}</span>
							</div>
							<div v-if="!avatarsOf(c.character_id).length" class="tp-avatar-empty">
								暂无立绘
							</div>
						</div>
					</div>
				</div>
			</template>

			<!-- 变量 -->
			<template v-else-if="tab === 'variables'">
				<div v-if="loadingVars" class="tp-state">加载中…</div>
				<div v-else-if="!variables.length" class="tp-state">
					还没有变量，去项目信息页的「变量」里添加
				</div>
				<div v-else class="tp-list">
					<div v-for="v in variables" :key="v.variable_id" class="tp-var">
						<div class="tp-var-top">
							<span class="tp-var-label">{{ v.label }}</span>
							<span class="tp-var-init">初值 {{ v.initial_value }}</span>
						</div>
						<div class="tp-var-key">{{ v.name }}</div>
					</div>
				</div>
			</template>

			<!-- AI -->
			<template v-else-if="tab === 'ai'">
				<div class="tp-ai-note">AI 能力独立在「AI 工作台」，这里只放快捷入口。</div>
				<button class="tp-ai-btn" @click="goAi('text')">
					<span class="tp-ai-icon">文</span>
					<div>
						<div class="tp-ai-title">文本生成</div>
						<div class="tp-ai-sub">续写、改写、对白</div>
					</div>
				</button>
				<button class="tp-ai-btn" @click="goAi('image')">
					<span class="tp-ai-icon">图</span>
					<div>
						<div class="tp-ai-title">图像生成</div>
						<div class="tp-ai-sub">立绘、背景、CG</div>
					</div>
				</button>
				<button class="tp-ai-btn" @click="goAi('music')">
					<span class="tp-ai-icon">音</span>
					<div>
						<div class="tp-ai-title">音乐合成</div>
						<div class="tp-ai-sub">BGM 片段</div>
					</div>
				</button>
			</template>

			<!-- 演出 -->
			<template v-else>
				<div class="tp-ai-note">
					演出指令还没接上，列入下一批。当前场景的立绘与背景仍在中间的「场景设置」里改。
				</div>
				<div class="tp-soon">
					<div class="tp-soon-item">
						<span class="tp-soon-name">立绘位置与表情</span>
						<span class="tp-soon-tag">待做</span>
					</div>
					<div class="tp-soon-item">
						<span class="tp-soon-name">淡入淡出与转场</span>
						<span class="tp-soon-tag">待做</span>
					</div>
					<div class="tp-soon-item">
						<span class="tp-soon-name">音效插入</span>
						<span class="tp-soon-tag">待做</span>
					</div>
				</div>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, onMounted, watch } from 'vue'
	import { useRouter } from 'vue-router'
	import { getCharacters, getCharacterAvatarsBatch } from '@/api/character'
	import type { Character, CharacterAvatar } from '@/api/character'
	import { listVariables } from '@/api/variable'
	import type { ProjectVariable } from '@/api/variable'
	import { BASE_URL } from '@/utils/request'

	const props = defineProps<{
		projectId: string | number
	}>()

	const router = useRouter()

	const tabs = [
		{ key: 'characters', label: '角色', badge: '' },
		{ key: 'variables', label: '变量', badge: '' },
		{ key: 'ai', label: 'AI', badge: '' },
		{ key: 'effects', label: '演出', badge: '待做' }
	] as const

	const tab = ref<'characters' | 'variables' | 'ai' | 'effects'>('characters')

	const characters = ref<Character[]>([])
	const avatars = ref<CharacterAvatar[]>([])
	const variables = ref<ProjectVariable[]>([])
	const loadingChars = ref(false)
	const loadingVars = ref(false)
	const openChar = ref<number | null>(null)

	const avatarCount = (id: number) => avatars.value.filter(a => a.character_id === id).length
	const avatarsOf = (id: number) => avatars.value.filter(a => a.character_id === id)

	const toggleChar = (id: number) => {
		openChar.value = openChar.value === id ? null : id
	}

	const goAi = (section: string) => {
		router.push({ path: '/ai', query: { tab: section } })
	}

	const loadCharacters = async () => {
		if (!props.projectId) return
		loadingChars.value = true
		try {
			const list = await getCharacters(Number(props.projectId))
			characters.value = list || []
			const ids = characters.value.map(c => c.character_id)
			avatars.value = ids.length ? (await getCharacterAvatarsBatch(ids)) || [] : []
		} catch (e) {
			console.error('加载角色失败:', e)
			characters.value = []
			avatars.value = []
		} finally {
			loadingChars.value = false
		}
	}

	const loadVariables = async () => {
		if (!props.projectId) return
		loadingVars.value = true
		try {
			variables.value = (await listVariables(Number(props.projectId))) || []
		} catch (e) {
			console.error('加载变量失败:', e)
			variables.value = []
		} finally {
			loadingVars.value = false
		}
	}

	onMounted(() => {
		loadCharacters()
		loadVariables()
	})

	watch(() => props.projectId, () => {
		openChar.value = null
		loadCharacters()
		loadVariables()
	})
</script>

<style scoped>
	.tp-root {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.tp-tabs {
		flex-shrink: 0;
		display: flex;
		gap: 2px;
		padding: 8px 10px 0;
		border-bottom: 1px solid #f5e4ea;
	}

	.tp-tab {
		flex: 1;
		padding: 7px 4px 9px;
		border: none;
		background: transparent;
		color: #a6828f;
		font-size: 12px;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		transition: color 0.15s, border-color 0.15s;
		white-space: nowrap;
	}

	.tp-tab:hover {
		color: #c81f4a;
	}

	.tp-tab.is-active {
		color: #c81f4a;
		font-weight: 600;
		border-bottom-color: #e8467c;
	}

	.tp-badge {
		margin-left: 3px;
		font-size: 9px;
		color: #c9a2ae;
		background: #f7edf1;
		padding: 0 4px;
		border-radius: 6px;
	}

	.tp-body {
		flex: 1;
		overflow-y: auto;
		padding: 10px;
	}

	.tp-state {
		padding: 22px 10px;
		text-align: center;
		font-size: 12px;
		color: #b99aa5;
		line-height: 1.6;
	}

	.tp-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	/* ---- 角色 ---- */
	.tp-char {
		border: 1px solid #f5e4ea;
		border-radius: 10px;
		background: #fff;
		overflow: hidden;
	}

	.tp-char-head {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 8px 9px;
		cursor: pointer;
	}

	.tp-char-head:hover {
		background: #fffafc;
	}

	.tp-char-avatar {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		overflow: hidden;
		background: #fdeef3;
		color: #c81f4a;
		font-size: 13px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.tp-char-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.tp-char-meta {
		flex: 1;
		min-width: 0;
	}

	.tp-char-name {
		font-size: 13px;
		color: #3d2b32;
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.tp-tag {
		font-size: 9px;
		color: #c81f4a;
		background: #fdeef3;
		border: 1px solid #f6d6e2;
		padding: 0 5px;
		border-radius: 6px;
	}

	.tp-char-sub {
		font-size: 11px;
		color: #b99aa5;
		margin-top: 1px;
	}

	.tp-char-arrow {
		color: #cfa9b6;
		font-size: 15px;
		width: 16px;
		text-align: center;
	}

	.tp-char-avatars {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px 9px 10px;
		background: #fffafc;
		border-top: 1px dashed #f5e4ea;
	}

	.tp-avatar {
		position: relative;
		width: 48px;
		height: 58px;
		border-radius: 7px;
		overflow: hidden;
		background: #f7edf1;
	}

	.tp-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.tp-avatar-type {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		font-size: 9px;
		color: #fff;
		background: rgba(61, 43, 50, 0.55);
		text-align: center;
		padding: 1px 0;
	}

	.tp-avatar-empty {
		font-size: 11px;
		color: #b99aa5;
	}

	/* ---- 变量 ---- */
	.tp-var {
		padding: 8px 10px;
		border: 1px solid #f5e4ea;
		border-radius: 10px;
		background: #fff;
	}

	.tp-var-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.tp-var-label {
		font-size: 13px;
		color: #3d2b32;
	}

	.tp-var-init {
		font-size: 11px;
		color: #c98aa0;
		flex-shrink: 0;
	}

	.tp-var-key {
		font-size: 11px;
		color: #b99aa5;
		margin-top: 2px;
		font-family: Consolas, Monaco, monospace;
	}

	/* ---- AI ---- */
	.tp-ai-note {
		font-size: 11px;
		color: #b99aa5;
		line-height: 1.6;
		margin: 2px 2px 10px;
	}

	.tp-ai-btn {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px;
		margin-bottom: 7px;
		border: 1px solid #f5e4ea;
		border-radius: 10px;
		background: #fff;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
	}

	.tp-ai-btn:hover {
		border-color: #f3a8bf;
		background: #fffafc;
	}

	.tp-ai-icon {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: #fdeef3;
		color: #c81f4a;
		font-size: 13px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.tp-ai-title {
		font-size: 13px;
		color: #3d2b32;
	}

	.tp-ai-sub {
		font-size: 11px;
		color: #b99aa5;
		margin-top: 1px;
	}

	/* ---- 演出 ---- */
	.tp-soon {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.tp-soon-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 9px 10px;
		border: 1px dashed #eddbe3;
		border-radius: 10px;
		background: #fffdfe;
	}

	.tp-soon-name {
		font-size: 12px;
		color: #8a6a76;
	}

	.tp-soon-tag {
		font-size: 10px;
		color: #b99aa5;
		background: #f7edf1;
		padding: 1px 6px;
		border-radius: 6px;
	}
</style>
