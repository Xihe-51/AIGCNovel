<template>
	<el-dialog
		v-model="visibleModel"
		title="演出指令"
		width="520px"
		append-to-body
		class="directive-dialog"
	>
		<div class="dir-target">当前节点：{{ targetLabel }}</div>

		<div v-if="!directives.length" class="dir-empty">
			还没有指令。立绘位置、背景切换、音效都可以在这里加。
		</div>
		<div v-else class="dir-list">
			<div v-for="d in directives" :key="d.directive_id" class="dir-row">
				<span class="dir-type">{{ directiveTypeLabel(d.directive_type) }}</span>
				<span class="dir-summary">{{ directiveSummary(d) }}</span>
				<button type="button" class="dir-del" :disabled="busy" @click="removeDirective(d)">删除</button>
			</div>
		</div>

		<div class="dir-add-title">新增指令</div>
		<div class="dir-add">
			<el-select v-model="type" size="small" class="dir-select-type">
				<el-option label="立绘" value="avatar" />
				<el-option label="背景" value="background" />
				<el-option label="音乐" value="music" />
				<el-option label="音效" value="sound" />
				<el-option label="停顿" value="wait" />
				<el-option label="画面效果" value="effect" />
			</el-select>

			<template v-if="type === 'avatar'">
				<el-select
					v-model="form.character_id"
					size="small"
					placeholder="角色"
					class="dir-field"
					@change="onCharacterChange"
				>
					<el-option v-for="c in characters" :key="c.character_id" :label="c.name" :value="c.character_id" />
				</el-select>

				<!-- 表情/姿势轮盘：点缩略图快速切换该角色的立绘 -->
				<div v-if="characterAvatars.length" class="expr-wheel">
					<button
						v-for="a in characterAvatars"
						:key="a.avatar_id"
						type="button"
						class="expr-option"
						:class="{ selected: form.avatar_id === a.avatar_id }"
						:title="avatarOptionLabel(a)"
						@click="form.avatar_id = a.avatar_id"
					>
						<img :src="BASE_URL + a.image_url" alt="" />
						<span class="expr-name">{{ a.avatar_type }}</span>
						<span v-if="a.layers && a.layers.length" class="expr-badge">{{ a.layers.length }}差分</span>
					</button>
				</div>
				<p v-else-if="form.character_id" class="expr-empty">该角色还没有立绘，请先去角色管理上传。</p>

				<!-- 素材直出：把素材库图片拖进来，不绑角色也能作为独立立绘层 -->
				<div
					class="dir-asset-drop"
					:class="{ 'is-over': assetOver, 'has-image': !!form.image_url }"
					@dragover.prevent="onAssetDragOver"
					@dragleave="assetOver = false"
					@drop.prevent="onAssetDrop"
				>
					<img v-if="form.image_url" :src="assetSrc(form.image_url)" alt="" />
					<span class="dir-asset-tip">
						{{ form.image_url ? '已选择素材图片（选择角色会清除）' : '也可把素材库图片拖到这里，作为独立立绘层' }}
					</span>
					<button
						v-if="form.image_url"
						type="button"
						class="dir-asset-clear"
						@click.prevent="form.image_url = ''"
					>清除</button>
				</div>

				<el-select v-model="form.layer_id" size="small" class="dir-field-sm">
					<el-option label="＋ 新建图层" value="__new__" />
					<el-option
						v-for="l in layerOptions"
						:key="l.layer_id"
						:label="`${l.label}（层级 ${l.order}）`"
						:value="l.layer_id"
					/>
				</el-select>
				<el-input
					v-if="form.layer_id === '__new__'"
					v-model="form.layer_name"
					size="small"
					class="dir-field-sm"
					placeholder="新图层名"
				/>
				<el-select v-model="form.action" size="small" class="dir-field-sm">
					<el-option label="显示" value="show" />
					<el-option label="隐藏" value="hide" />
				</el-select>
				<div class="dir-avatar-fine">
					<el-input-number v-model="form.x" :min="0" :max="100" :controls="false" size="small" placeholder="X%" title="图层中心 X（%）" />
					<el-input-number v-model="form.y" :min="0" :max="100" :controls="false" size="small" placeholder="Y%" title="图层底边 Y（%）" />
					<el-input-number v-model="form.scale" :min="0.2" :max="3" :step="0.1" :controls="false" size="small" placeholder="缩放" title="缩放倍数" />
					<el-input-number v-model="form.opacity" :min="0" :max="1" :step="0.1" :controls="false" size="small" placeholder="透明 0-1" title="不透明度" />
					<el-input-number v-model="form.rotate" :min="-45" :max="45" :controls="false" size="small" placeholder="旋转°" title="旋转角度" />
				</div>
			</template>

			<template v-else-if="type === 'background'">
				<img v-if="form.url" :src="BASE_URL + form.url" class="dir-preview" alt="背景预览" />
				<el-input v-model="form.url" size="small" placeholder="上传背景图，或直接填 /static/... 地址" class="dir-field-wide" />
				<el-upload
					class="dir-upload"
					:show-file-list="false"
					:http-request="upload"
					accept="image/*"
				>
					<el-button size="small" :loading="uploading">上传图片</el-button>
				</el-upload>
				<el-select v-model="form.layer" size="small" class="dir-field-sm">
					<el-option label="背景" value="background" />
					<el-option label="前景" value="foreground" />
				</el-select>
				<el-select v-model="form.transition" size="small" class="dir-field-sm">
					<el-option label="淡入淡出" value="fade" />
					<el-option label="硬切" value="cut" />
					<el-option label="黑场" value="black" />
				</el-select>
				<el-input-number v-model="form.bg_duration" :min="100" :step="100" size="small" class="dir-field-sm" />
			</template>

			<template v-else-if="type === 'music'">
				<el-input v-model="form.url" size="small" placeholder="上传 BGM，或直接填地址" class="dir-field-wide" />
				<el-upload
					class="dir-upload"
					:show-file-list="false"
					:http-request="upload"
					accept="audio/*"
				>
					<el-button size="small" :loading="uploading">上传音频</el-button>
				</el-upload>
				<el-select v-model="form.action" size="small" class="dir-field-sm">
					<el-option label="播放" value="play" />
					<el-option label="停止" value="stop" />
				</el-select>
			</template>

			<template v-else-if="type === 'sound'">
				<el-input v-model="form.url" size="small" placeholder="上传音效，或直接填地址" class="dir-field-wide" />
				<el-upload
					class="dir-upload"
					:show-file-list="false"
					:http-request="upload"
					accept="audio/*"
				>
					<el-button size="small" :loading="uploading">上传音频</el-button>
				</el-upload>
			</template>

			<template v-else-if="type === 'effect'">
				<el-select v-model="form.effect" size="small" class="dir-field-sm">
					<el-option label="闪光" value="flash" />
					<el-option label="震动" value="shake" />
					<el-option label="天气" value="weather" />
				</el-select>
				<template v-if="form.effect === 'flash'">
					<el-input v-model="form.color" size="small" placeholder="#ffffff" class="dir-field-sm" />
					<el-input-number v-model="form.duration" :min="100" :step="100" size="small" class="dir-field-sm" />
				</template>
				<template v-else-if="form.effect === 'shake'">
					<el-input-number v-model="form.intensity" :min="1" :max="9" size="small" class="dir-field-sm" />
					<el-input-number v-model="form.duration" :min="100" :step="100" size="small" class="dir-field-sm" />
				</template>
				<template v-else>
					<el-select v-model="form.weather" size="small" class="dir-field-sm">
						<el-option label="下雨" value="rain" />
						<el-option label="下雪" value="snow" />
						<el-option label="刮风" value="wind" />
					</el-select>
					<el-input-number v-model="form.duration" :min="500" :step="500" size="small" class="dir-field-sm" />
				</template>
			</template>

			<template v-else>
				<el-input v-model.number="form.ms" size="small" placeholder="毫秒" class="dir-field-sm" />
			</template>

			<el-button size="small" type="primary" :loading="busy" @click="addDirective">添加</el-button>
		</div>

		<template #footer>
			<el-button @click="visibleModel = false">关闭</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { BASE_URL } from '@/utils/request'
import { layerNameOf } from '@/composables/player/usePlayerStage'
import { useDirectiveEditor } from '@/composables/scene/useDirectiveEditor'

const props = defineProps<{
	visible: boolean
	projectId: number
	contentId: number | null
	targetLabel: string
	characters: any[]
	defaultCharacterId: number | null
	defaultAvatarId: number | null
	assetNonce: number
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'changed', payload: { contentId: number; before: any[]; after: any[] }): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const projectId = computed(() => props.projectId)
const contentId = computed(() => props.contentId)
const characters = computed(() => props.characters)
const defaultCharacterId = computed(() => props.defaultCharacterId)
const defaultAvatarId = computed(() => props.defaultAvatarId)
const assetNonce = computed(() => props.assetNonce)

const {
	directives,
	type,
	form,
	uploading,
	assetSrc,
	layerOptions,
	characterAvatars,
	load,
	resetForm,
	onCharacterChange,
	upload,
	add,
	remove
} = useDirectiveEditor({ projectId, contentId, characters, defaultCharacterId, defaultAvatarId, assetNonce })

const busy = ref(false)
const assetOver = ref(false)

// 重新拉取当前节点的指令（父级撤销舞台操作后调用）
const reload = async () => {
	try {
		await load()
	} catch (e) {
		ElMessage.error('读取演出指令失败')
	}
}

watch(
	() => [props.visible, props.contentId] as const,
	async ([open, id], prev) => {
		if (!open || !id) return
		await reload()
		// 同一个节点重复打开时保留上次的表单，切换节点则重新初始化
		const prevId = prev ? prev[1] : null
		if (!prev || !prev[0] || String(prevId) !== String(id)) resetForm()
	},
	{ immediate: true }
)

const directiveTypeLabel = (value: string) => ({
	avatar: '立绘',
	background: '背景',
	music: '音乐',
	sound: '音效',
	wait: '停顿',
	effect: '画面效果'
} as Record<string, string>)[value] || value

const directiveSummary = (d: any) => {
	const p = d.payload || {}
	if (d.directive_type === 'avatar') {
		const c = characters.value.find((x: any) => x.character_id === p.character_id)
		const layerName = p.layer_name || layerNameOf(p)
		const base = `${c ? c.name : '角色'} · ${layerName} · ${p.action === 'hide' ? '隐藏' : '显示'}`
		const extra: string[] = []
		if (Number(p.scale) && Number(p.scale) !== 1) extra.push(`缩放 ${p.scale}`)
		if (p.opacity !== undefined && Number(p.opacity) < 1) extra.push(`透明 ${Math.round(Number(p.opacity) * 100)}%`)
		if (Number(p.rotate)) extra.push(`旋转 ${p.rotate}°`)
		if (Number(p.x) || Number(p.y)) extra.push(`偏移 ${p.x || 0}%,${p.y || 0}%`)
		return base + (extra.length ? ` · ${extra.join(' · ')}` : '')
	}
	if (d.directive_type === 'background') {
		const layer = p.layer === 'foreground' ? '前景' : '背景'
		const trans = ({ fade: '淡入淡出', cut: '硬切', black: '黑场' } as Record<string, string>)[p.transition] || '淡入淡出'
		return `${layer} · ${trans} · ${p.url || '（未填地址）'}`
	}
	if (d.directive_type === 'music') return `${p.action === 'stop' ? '停止' : '播放'} · ${p.url || '（未填）'}`
	if (d.directive_type === 'sound') return p.url || '（未填地址）'
	if (d.directive_type === 'wait') return `${p.ms || 0} 毫秒`
	if (d.directive_type === 'effect') {
		const map: Record<string, string> = {
			flash: `闪光 · ${p.color || '#ffffff'} · ${p.duration_ms || 400}ms`,
			shake: `震动 · 强度 ${p.intensity || 5} · ${p.duration_ms || 400}ms`,
			weather: `天气 · ${({ rain: '下雨', snow: '下雪', wind: '刮风' } as Record<string, string>)[p.weather] || p.weather || '下雨'} · ${p.duration_ms || 3000}ms`
		}
		return map[p.effect] || '（未设置）'
	}
	return ''
}

const avatarOptionLabel = (avatar: any) => {
	const layers = avatar?.layers || []
	return `${avatar?.avatar_type || '立绘'}${layers.length ? ` · ${layers.length} 个差分层` : ''}`
}

const isImageUrl = (url: string) => /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(String(url || ''))

const assetFromEvent = (ev: DragEvent) => {
	try {
		const raw = ev.dataTransfer?.getData('application/x-aigc-asset') || ''
		if (raw) {
			const data = JSON.parse(raw)
			const url = data?.url || data?.image_url || ''
			if (url) return { url, label: data?.label || data?.title || '' }
		}
		const text = ev.dataTransfer?.getData('text/plain') || ''
		if (text && isImageUrl(text)) return { url: text, label: '' }
	} catch (_) {
		/* 非素材拖拽数据 */
	}
	return null
}

const onAssetDragOver = (ev: DragEvent) => {
	const types = ev.dataTransfer?.types || []
	if (Array.from(types).includes('application/x-aigc-asset')) assetOver.value = true
}

const onAssetDrop = (ev: DragEvent) => {
	assetOver.value = false
	const asset = assetFromEvent(ev)
	if (!asset || !isImageUrl(asset.url)) {
		ElMessage.warning('请拖入图片素材')
		return
	}
	form.value.image_url = asset.url
	// 素材直出层不绑角色，避免被角色默认立绘覆盖
	form.value.character_id = null
	form.value.avatar_id = null
	if (!form.value.layer_name) form.value.layer_name = (asset.label || '素材立绘').slice(0, 30)
	ElMessage.success('已填入素材图片，可继续调整位置')
}

const addDirective = async () => {
	if (busy.value) return
	busy.value = true
	try {
		const result = await add()
		if (result && contentId.value) {
			emit('changed', { contentId: Number(contentId.value), ...result })
		}
	} finally {
		busy.value = false
	}
}

const removeDirective = async (directive: any) => {
	if (busy.value) return
	busy.value = true
	try {
		const result = await remove(directive)
		if (result && contentId.value) {
			emit('changed', { contentId: Number(contentId.value), ...result })
		}
	} finally {
		busy.value = false
	}
}

defineExpose({ reload })
</script>

<style scoped lang="scss" src="./directiveDialog.scss"></style>
