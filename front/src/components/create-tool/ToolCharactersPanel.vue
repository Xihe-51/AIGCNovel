<template>
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
					<img
						v-if="c.avatar_url && !brokenChars.includes(c.character_id)"
						:src="BASE_URL + c.avatar_url"
						alt=""
						loading="lazy"
						@error="markCharBroken(c.character_id)"
					/>
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

			<div v-if="openChar === c.character_id" class="tp-char-voice">
				<span class="tp-char-voice-label">默认音色</span>
				<select
					class="tp-char-voice-select"
					:value="c.voice_type || ''"
					title="批量配音时会优先使用该角色的音色"
					@change="onCharacterVoiceChange(c, $event)"
				>
					<option value="">未设置（用批量配音选择的音色）</option>
					<option v-for="v in voiceOptions" :key="v.value" :value="v.value">{{ v.label }}</option>
				</select>
			</div>

			<div v-if="openChar === c.character_id" class="tp-char-avatars">
				<div
					v-for="a in avatarsOf(c.character_id)"
					:key="a.avatar_id"
					class="tp-avatar"
					:title="a.avatar_type || '立绘'"
				>
					<img
						v-if="a.image_url && !brokenAvatars.includes(a.avatar_id)"
						:src="BASE_URL + a.image_url"
						alt=""
						loading="lazy"
						@error="markAvatarBroken(a.avatar_id)"
					/>
					<span v-else class="tp-avatar-missing">缺图</span>
					<span class="tp-avatar-type">{{ a.avatar_type || '立绘' }}</span>
					<span v-if="a.is_default" class="tp-avatar-default">默认</span>
					<div class="tp-avatar-acts">
						<button
							v-if="!a.is_default"
							type="button"
							class="tp-av-act"
							title="设为默认立绘"
							@click.stop="setDefaultAvatar(a)"
						>★</button>
						<button
							type="button"
							class="tp-av-act"
							title="删除这张立绘"
							@click.stop="removeAvatar(a)"
						>×</button>
					</div>
				</div>

				<button type="button" class="tp-avatar-add" @click="openUpload(c)">
					<span class="tp-avatar-add-icon">＋</span>
					<span class="tp-avatar-add-text">加立绘</span>
				</button>
			</div>
		</div>
	</div>

	<el-dialog v-model="uploadVisible" title="添加立绘" width="340px" append-to-body>
		<div class="tp-up-row">
			<div class="tp-up-label">角色</div>
			<div class="tp-up-value">{{ uploadChar?.name }}</div>
		</div>
		<div class="tp-up-row">
			<div class="tp-up-label">图片</div>
			<el-upload
				action="#"
				:auto-upload="false"
				:show-file-list="false"
				accept="image/*"
				:on-change="onPickAvatar"
			>
				<button type="button" class="tp-up-pick">
					{{ uploadFile ? uploadFile.name : '选择图片' }}
				</button>
			</el-upload>
		</div>
		<div class="tp-up-row">
			<div class="tp-up-label">表情</div>
			<el-select v-model="uploadType" size="small" style="width: 100%">
				<el-option v-for="t in avatarTypes" :key="t" :label="t" :value="t" />
			</el-select>
		</div>
		<div class="tp-up-row">
			<div class="tp-up-label">服装</div>
			<el-input v-model="uploadCostume" size="small" placeholder="可选，例如：校服" />
		</div>
		<div class="tp-up-row">
			<div class="tp-up-label">设为默认</div>
			<el-switch v-model="uploadDefault" size="small" />
		</div>
		<template #footer>
			<el-button size="small" @click="uploadVisible = false">取消</el-button>
			<el-button
				size="small"
				type="primary"
				:loading="uploading"
				:disabled="!uploadFile"
				@click="submitAvatar"
			>上传</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import {
	getCharacters,
	getCharacterAvatarsBatch,
	uploadCharacterAvatar,
	updateCharacterAvatar,
	updateCharacter,
	deleteCharacterAvatar
} from '@/api/character'
import type { Character, CharacterAvatar, AvatarType } from '@/api/character'
import { BASE_URL } from '@/utils/request'
import { formatErrorMessage } from '@/utils/errorMessage'

const props = defineProps<{ projectId: string | number }>()

const characters = ref<Character[]>([])
const avatars = ref<CharacterAvatar[]>([])
const loadingChars = ref(false)
const openChar = ref<number | null>(null)

// 素材文件丢失时的降级标记：头像退回文字、立绘显示「缺图」
const brokenChars = ref<number[]>([])
const brokenAvatars = ref<number[]>([])
const markCharBroken = (id: number) => {
	if (!brokenChars.value.includes(id)) brokenChars.value.push(id)
}
const markAvatarBroken = (id: number) => {
	if (!brokenAvatars.value.includes(id)) brokenAvatars.value.push(id)
}

// 火山 TTS 常用音色（与批量配音弹窗保持一致）
const voiceOptions = [
	{ value: 'BV001_streaming', label: '通用女声 · 童声偏亮' },
	{ value: 'BV002_streaming', label: '通用男声 · 沉稳' },
	{ value: 'BV700_streaming', label: '通用女声 · 知性' },
	{ value: 'BV705_streaming', label: '通用女声 · 活泼' },
	{ value: 'BV701_streaming', label: '通用男声 · 磁性' },
]

const onCharacterVoiceChange = async (c: Character, e: Event) => {
	const value = (e.target as HTMLSelectElement).value
	try {
		await updateCharacter({
			...c,
			project_id: Number(props.projectId),
			voice_type: value,
		})
		c.voice_type = value
		ElMessage.success(value ? '角色音色已更新' : '已清除角色音色')
	} catch (err: any) {
		ElMessage.error(formatErrorMessage('保存音色失败', err))
	}
}

const avatarCount = (id: number) => avatars.value.filter(a => a.character_id === id).length
// 默认立绘排在最前，作者一眼能找到
const avatarsOf = (id: number) => avatars.value
	.filter(a => a.character_id === id)
	.sort((a, b) => Number(b.is_default) - Number(a.is_default))

// ---- 立绘管理 ----
const avatarTypes: AvatarType[] = ['正常', '高兴', '生气', '悲伤', '惊讶', '其他']
const uploadVisible = ref(false)
const uploadChar = ref<Character | null>(null)
const uploadFile = ref<File | null>(null)
const uploadType = ref<AvatarType>('正常')
const uploadCostume = ref('')
const uploadDefault = ref(false)
const uploading = ref(false)

const openUpload = (c: Character) => {
	uploadChar.value = c
	uploadFile.value = null
	uploadType.value = '正常'
	uploadCostume.value = ''
	// 这个角色还没有任何立绘时，默认把新图设为默认立绘
	uploadDefault.value = avatarsOf(c.character_id).length === 0
	uploadVisible.value = true
}

const onPickAvatar = (file: UploadFile) => {
	if (file && file.raw) uploadFile.value = file.raw
}

const submitAvatar = async () => {
	if (!uploadFile.value || !uploadChar.value) return
	uploading.value = true
	try {
		await uploadCharacterAvatar(
			uploadFile.value,
			Number(props.projectId),
			uploadChar.value.character_id,
			uploadType.value,
			uploadCostume.value || undefined,
			uploadDefault.value
		)
		ElMessage.success('立绘已上传')
		uploadVisible.value = false
		await loadCharacters()
	} catch (e) {
		console.error('上传立绘失败:', e)
		ElMessage.error('立绘上传失败')
	} finally {
		uploading.value = false
	}
}

const setDefaultAvatar = async (a: CharacterAvatar) => {
	try {
		await updateCharacterAvatar({ avatar_id: a.avatar_id })
		avatars.value = avatars.value.map(x =>
			x.character_id === a.character_id
				? { ...x, is_default: x.avatar_id === a.avatar_id }
				: x
		)
		ElMessage.success('已设为默认立绘')
	} catch (e) {
		console.error('设置默认立绘失败:', e)
		ElMessage.error('设置失败')
	}
}

const removeAvatar = async (a: CharacterAvatar) => {
	try {
		await ElMessageBox.confirm('引用这张立绘的对话会失去图片，确定删除？', '删除立绘', {
			type: 'warning',
			confirmButtonText: '删除',
			cancelButtonText: '取消'
		})
	} catch {
		return
	}
	try {
		await deleteCharacterAvatar(a.avatar_id)
		avatars.value = avatars.value.filter(x => x.avatar_id !== a.avatar_id)
		ElMessage.success('已删除')
	} catch (e) {
		console.error('删除立绘失败:', e)
		ElMessage.error('删除失败')
	}
}

const toggleChar = (id: number) => {
	openChar.value = openChar.value === id ? null : id
}

const loadCharacters = async () => {
	if (!props.projectId) return
	loadingChars.value = true
	try {
		const list = await getCharacters(Number(props.projectId))
		characters.value = list || []
		const ids = characters.value.map(c => c.character_id)
		avatars.value = ids.length ? (await getCharacterAvatarsBatch(ids)) || [] : []
		// 重新拉取后重置缺图标记，文件补回来后能自动恢复
		brokenChars.value = []
		brokenAvatars.value = []
	} catch (e) {
		console.error('加载角色失败:', e)
		characters.value = []
		avatars.value = []
	} finally {
		loadingChars.value = false
	}
}

onMounted(loadCharacters)
watch(() => props.projectId, () => {
	openChar.value = null
	uploadVisible.value = false
	loadCharacters()
})
</script>
