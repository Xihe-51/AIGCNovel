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
				<button type="button" class="dir-del" @click="emit('remove', d)">删除</button>
			</div>
		</div>

		<div class="dir-add-title">新增指令</div>
		<div class="dir-add">
			<el-select v-model="typeModel" size="small" class="dir-select-type">
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
					@change="characterChange"
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
						:title="avatarLabel(a)"
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
					:class="{ 'is-over': dirAssetOver, 'has-image': !!form.image_url }"
					@dragover.prevent="onAssetDragOver"
					@dragleave="dirAssetOver = false"
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
					:http-request="uploadRequest"
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
					:http-request="uploadRequest"
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
					:http-request="uploadRequest"
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

			<el-button size="small" type="primary" @click="emit('add')">添加</el-button>
		</div>

		<template #footer>
			<el-button @click="visibleModel = false">关闭</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { BASE_URL } from '@/utils/request'
import { layerNameOf } from '@/composables/player/usePlayerStage'

const props = defineProps<{
	visible: boolean
	targetLabel: string
	directives: any[]
	characters: any[]
	type: string
	form: Record<string, any>
	layerOptions: any[]
	characterAvatars: any[]
	uploading: boolean
	avatarLabel: (avatar: any) => string
	assetSrc: (url: string) => string
	assetFromEvent: (ev: Event) => any
	isImage: (url: string) => boolean
	characterChange: (id: any) => void
	uploadRequest: (options: any) => void
}>()

const emit = defineEmits<{
	(e: 'update:visible', value: boolean): void
	(e: 'update:type', value: string): void
	(e: 'add'): void
	(e: 'remove', directive: any): void
}>()

const visibleModel = computed({
	get: () => props.visible,
	set: (value: boolean) => emit('update:visible', value),
})

const typeModel = computed({
	get: () => props.type,
	set: (value: string) => emit('update:type', value),
})

const dirAssetOver = ref(false)

const directiveTypeLabel = (type: string) => ({
	avatar: '立绘',
	background: '背景',
	music: '音乐',
	sound: '音效',
	wait: '停顿',
	effect: '画面效果'
}[type] || type)

const directiveSummary = (d: any) => {
	const p = d.payload || {}
	if (d.directive_type === 'avatar') {
		const c = props.characters.find((x: any) => x.character_id === p.character_id)
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

const onAssetDragOver = (ev: DragEvent) => {
	const types = ev.dataTransfer?.types || []
	if (Array.from(types).includes('application/x-aigc-asset')) dirAssetOver.value = true
}

const onAssetDrop = (ev: DragEvent) => {
	dirAssetOver.value = false
	const asset = props.assetFromEvent(ev)
	if (!asset || !props.isImage(asset.url)) {
		ElMessage.warning('请拖入图片素材')
		return
	}
	props.form.image_url = asset.url
	// 素材直出层不绑角色，避免被角色默认立绘覆盖
	props.form.character_id = null
	props.form.avatar_id = null
	if (!props.form.layer_name) props.form.layer_name = (asset.label || '素材立绘').slice(0, 30)
	ElMessage.success('已填入素材图片，可继续调整位置')
}
</script>

<style scoped>
.dir-target {
  font-size: 12px;
  color: #8a6a76;
  background: #fffafc;
  border: 1px solid #f5e4ea;
  border-radius: 8px;
  padding: 8px 11px;
  margin-bottom: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dir-empty {
  font-size: 12px;
  color: #b99aa5;
  text-align: center;
  padding: 18px 8px;
  background: #fffdfe;
  border: 1px dashed #eddbe3;
  border-radius: 10px;
}

.dir-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.dir-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #f5e4ea;
  border-radius: 9px;
  background: #fff;
}

.dir-type {
  flex-shrink: 0;
  font-size: 10px;
  color: #c81f4a;
  background: #fdeef3;
  border: 1px solid #f6d6e2;
  border-radius: 6px;
  padding: 1px 7px;
}

.dir-summary {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #3d2b32;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dir-del {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #c98aa0;
  font-size: 11px;
  cursor: pointer;
}

.dir-del:hover { color: #d9534f; }

.dir-add-title {
  font-size: 12px;
  color: #8a6a76;
  margin: 16px 0 8px;
}

.dir-add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px dashed #eddbe3;
  border-radius: 10px;
  background: #fffdfe;
}

.dir-select-type { width: 96px; flex-shrink: 0; }
.dir-field { width: 120px; }
.dir-field-sm { width: 96px; }
.dir-field-wide { flex: 1; min-width: 150px; }

/* 立绘微调：X/Y 偏移、缩放、透明度、旋转 */
.dir-avatar-fine {
  display: flex;
  gap: 6px;
  width: 100%;
}

.dir-avatar-fine .el-input-number {
  width: 20%;
  min-width: 0;
}

/* 表情/姿势轮盘：横向缩略图，点选即切换立绘 */
.expr-wheel {
  display: flex;
  gap: 8px;
  width: 100%;
  overflow-x: auto;
  padding: 4px 2px 6px;
}

.expr-option {
  position: relative;
  flex: 0 0 auto;
  width: 66px;
  padding: 4px;
  border: 1px solid #f0dfe6;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.expr-option:hover {
  border-color: #f6b3cb;
  transform: translateY(-1px);
}

.expr-option.selected {
  border-color: #ff8fab;
  box-shadow: 0 0 0 2px rgba(255, 143, 171, 0.18);
}

.expr-option img {
  width: 54px;
  height: 64px;
  object-fit: contain;
  background: #faf6f8;
  border-radius: 6px;
}

.expr-name {
  font-size: 11px;
  color: #6b4a55;
}

.expr-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: 9px;
  line-height: 1;
  color: #fff;
  background: #ff8fab;
  padding: 2px 4px;
  border-radius: 6px;
}

.expr-empty {
  width: 100%;
  margin: 0;
  font-size: 11px;
  color: #b99aa5;
}

/* 素材直出：拖入图片作为独立立绘层 */
.dir-asset-drop {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px dashed #e8d3dd;
  border-radius: 8px;
  background: #fffdfe;
  font-size: 11px;
  color: #8a6a76;
}

.dir-asset-drop.is-over {
  border-color: #ff8fab;
  background: #fff6f8;
}

.dir-asset-drop img {
  width: 34px;
  height: 44px;
  object-fit: contain;
  background: #faf6f8;
  border-radius: 4px;
  flex: none;
}

.dir-asset-tip {
  flex: 1;
  line-height: 1.5;
}

.dir-asset-clear {
  flex: none;
  border: 1px solid #f6d6e2;
  background: #fff;
  color: #c81f4a;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}

/* 演出弹窗里的素材上传 */
.dir-upload { flex-shrink: 0; }
.dir-upload :deep(.el-upload) { display: inline-flex; }
.dir-preview {
  width: 44px;
  height: 30px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #f5e4ea;
  flex-shrink: 0;
}
</style>
