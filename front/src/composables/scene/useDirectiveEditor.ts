import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listNodeDirectives, createDirective, deleteDirective } from '@/api/directive'
import { uploadSceneFile } from '@/api/scenes'
import { layerIdOf, layerNameOf, layerOrderOf, stageDefaultX } from '@/composables/player/usePlayerStage'
import { BASE_URL } from '@/utils/request'

/** 舞台立绘图层数量上限（前后端一致） */
export const MAX_AVATAR_LAYERS = 8

// 多角色入场自动站位：挑一个没被占用的 X 坐标
const STAGE_ENTRY_XS = [50, 25, 75, 18, 82, 35, 65]

const emptyForm = () => ({
	character_id: null,
	avatar_id: null,
	image_url: '',
	layer_id: '__new__',
	layer_name: '',
	action: 'show',
	x: 50,
	y: 100,
	scale: 1,
	opacity: 1,
	rotate: 0,
	url: '',
	ms: 500,
	layer: 'background',
	transition: 'fade',
	bg_duration: 400,
	effect: 'flash',
	color: '#ffffff',
	duration: 400,
	intensity: 5,
	weather: 'rain'
})

const cloneRows = (rows: any[]) => rows.map(row => ({
	directive_id: row.directive_id,
	directive_type: row.directive_type,
	order_num: row.order_num,
	payload: JSON.parse(JSON.stringify(row.payload || {}))
}))

/**
 * 演出指令编辑器：弹窗自己持有指令列表、新增表单与校验。
 * 父级只传上下文（项目/节点/角色），写完通过 changed 事件同步撤销栈与预览。
 */
export function useDirectiveEditor(options: {
	projectId: Ref<number>
	contentId: Ref<number | null>
	characters: Ref<any[]>
	defaultCharacterId: Ref<number | null>
	defaultAvatarId: Ref<number | null>
	assetNonce: Ref<number>
}) {
	const { projectId, contentId, characters, defaultCharacterId, defaultAvatarId, assetNonce } = options

	const directives = ref<any[]>([])
	const type = ref('avatar')
	const form = ref<any>(emptyForm())
	const uploading = ref(false)

	// 本地静态地址补 BASE_URL 与热重载时间戳，内联/外链保持原样
	const assetSrc = (url: string) => {
		if (!url) return ''
		const raw = String(url)
		if (/^(data:|blob:)/i.test(raw)) return raw
		if (/^https?:/i.test(raw)) return raw
		const base = raw.startsWith('/assets/') || raw.startsWith('/src/')
			? raw
			: (raw.startsWith('/') ? BASE_URL + raw : `${BASE_URL}/${raw}`)
		const sep = base.includes('?') ? '&' : '?'
		return `${base}${sep}v=${assetNonce.value}`
	}

	// 按前台→后台展示当前节点已有图层
	const layerOptions = computed(() => {
		const map = new Map<string, any>()
		for (const d of directives.value) {
			if (d.directive_type !== 'avatar') continue
			const p = d.payload || {}
			const layerId = layerIdOf(p)
			if (p.action === 'hide') {
				map.delete(layerId)
				continue
			}
			map.set(layerId, {
				layer_id: layerId,
				label: p.layer_name || layerNameOf(p),
				order: layerOrderOf(p),
				character_id: p.character_id ?? null
			})
		}
		return [...map.values()].sort((a, b) => b.order - a.order)
	})

	const characterAvatars = computed(() => {
		const id = form.value.character_id
		if (!id) return []
		const character = characters.value.find((c: any) => c.character_id === id)
		return (character?.avatars || []).slice()
	})

	const defaultAvatarIdOf = (characterId: number | null) => {
		if (!characterId) return null
		const character = characters.value.find((c: any) => c.character_id === characterId)
		const list = character?.avatars || []
		const def = list.find((a: any) => a.is_default) || list[0]
		return def ? def.avatar_id : null
	}

	const nextLayerOrder = () => (layerOptions.value.length
		? Math.max(...layerOptions.value.map(l => Number(l.order) || 0)) + 1
		: 0)

	const nextLayerName = () => `立绘 ${layerOptions.value.length + 1}`

	// 多角色入场自动站位：挑一个没被占用的 X 坐标
	const nextFreeStageX = () => {
		const used = directives.value
			.filter(d => d.directive_type === 'avatar')
			.map(d => d.payload || {})
			.filter(p => p.action !== 'hide' && p.visible !== false)
			.map(p => (p.coord === 'stage' ? Number(p.x) : stageDefaultX(layerIdOf(p))))
			.filter(v => Number.isFinite(v))
		for (const x of STAGE_ENTRY_XS) {
			if (!used.some(u => Math.abs(u - x) < 9)) return x
		}
		return 50
	}

	const load = async () => {
		if (!contentId.value) {
			directives.value = []
			return
		}
		directives.value = await listNodeDirectives(Number(projectId.value), Number(contentId.value))
	}

	// 打开弹窗时：先拉指令，再按当前台词初始化新增表单
	const resetForm = () => {
		const characterId = defaultCharacterId.value ?? null
		const matchedLayer = layerOptions.value.find(l => l.character_id === characterId)
		form.value = {
			...emptyForm(),
			character_id: characterId,
			avatar_id: defaultAvatarId.value ?? defaultAvatarIdOf(characterId),
			layer_id: matchedLayer ? matchedLayer.layer_id : '__new__',
			layer_name: matchedLayer ? matchedLayer.label : nextLayerName(),
			x: nextFreeStageX()
		}
		type.value = 'avatar'
	}

	const onCharacterChange = (characterId: number | null) => {
		form.value.avatar_id = defaultAvatarIdOf(characterId)
		// 选了角色就清掉素材直出图片，避免「角色立绘」和「素材图」同时挂在一层
		form.value.image_url = ''
		// 选中的既有图层若属于其他角色，自动切回「新建图层」，避免把两个人叠进同一层
		const layer = layerOptions.value.find(l => l.layer_id === form.value.layer_id)
		if (layer && layer.character_id && layer.character_id !== characterId) {
			form.value.layer_id = '__new__'
			form.value.layer_name = nextLayerName()
		}
	}

	const upload = async (uploadOptions: any) => {
		const fileType = type.value === 'background' ? 'image' : 'audio'
		uploading.value = true
		try {
			const formData = new FormData()
			formData.append('file', uploadOptions.file)
			formData.append('project_id', String(projectId.value))
			formData.append('file_type', fileType)
			const response = await uploadSceneFile(formData)
			if (response.success && response.data && response.data.url) {
				form.value.url = response.data.url
				ElMessage.success(type.value === 'background' ? '背景图上传成功' : '音频上传成功')
				uploadOptions.onSuccess && uploadOptions.onSuccess(response)
			} else {
				throw new Error((response && response.message) || '上传失败')
			}
		} catch (err: any) {
			console.error('演出素材上传失败:', err)
			ElMessage.error('上传失败: ' + (err.message || '未知错误'))
			uploadOptions.onError && uploadOptions.onError(err)
		} finally {
			uploading.value = false
		}
	}

	// 校验并拼出 payload；返回 null 表示校验未通过（已提示）
	const buildPayload = () => {
		const t = type.value
		const f = form.value
		if (t === 'avatar') {
			if (!f.character_id && !f.image_url) {
				ElMessage.warning('请选择角色，或拖入一张素材图片')
				return null
			}
			const isNewLayer = !f.layer_id || f.layer_id === '__new__'
			if (isNewLayer && layerOptions.value.length >= MAX_AVATAR_LAYERS) {
				ElMessage.warning(`最多 ${MAX_AVATAR_LAYERS} 个立绘图层`)
				return null
			}
			const layerId = isNewLayer
				? `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
				: f.layer_id
			const layerMeta = layerOptions.value.find(l => l.layer_id === layerId)
			const layerName = layerMeta?.label || f.layer_name?.trim() || nextLayerName()
			const order = layerMeta ? layerMeta.order : nextLayerOrder()
			const rawX = f.x === '' || f.x === null ? 50 : Number(f.x)
			const rawY = f.y === '' || f.y === null ? 100 : Number(f.y)
			return {
				layer_id: layerId,
				layer_name: layerName,
				order,
				character_id: f.character_id || null,
				avatar_id: f.image_url ? null : (f.avatar_id || null),
				image_url: f.image_url || null,
				action: f.action,
				coord: 'stage',
				x: Number.isFinite(rawX) ? Math.max(0, Math.min(100, rawX)) : 50,
				y: Number.isFinite(rawY) ? Math.max(0, Math.min(100, rawY)) : 100,
				scale: Number(f.scale) || 1,
				opacity: f.opacity === '' || f.opacity === null ? 1 : Number(f.opacity),
				rotate: Number(f.rotate) || 0
			}
		}
		if (t === 'background') {
			if (!f.url) {
				ElMessage.warning('请上传或填写背景图地址')
				return null
			}
			return {
				url: f.url,
				layer: f.layer || 'background',
				transition: f.transition || 'fade',
				duration_ms: Number(f.bg_duration) || 400
			}
		}
		if (t === 'music') {
			if (!f.url) {
				ElMessage.warning('请上传或填写音乐地址')
				return null
			}
			return { url: f.url, action: f.action, loop: true }
		}
		if (t === 'sound') {
			if (!f.url) {
				ElMessage.warning('请上传或填写音效地址')
				return null
			}
			return { url: f.url }
		}
		if (t === 'effect') {
			const effect = f.effect || 'flash'
			let duration = Number(f.duration) || 400
			// 天气默认持续更久，避免从闪光切过来时只有 400ms
			if (effect === 'weather' && duration < 1000) duration = 3000
			const payload: Record<string, any> = { effect, duration_ms: duration }
			if (effect === 'flash') payload.color = f.color || '#ffffff'
			if (effect === 'shake') payload.intensity = Number(f.intensity) || 5
			if (effect === 'weather') payload.weather = f.weather || 'rain'
			return payload
		}
		return { ms: Number(f.ms) || 500 }
	}

	// 新增一条指令；成功时返回变更前后的快照，供父级入撤销栈
	const add = async () => {
		if (!contentId.value) return null
		const payload = buildPayload()
		if (!payload) return null
		const before = cloneRows(directives.value)
		try {
			await createDirective(Number(projectId.value), {
				content_id: contentId.value,
				directive_type: type.value as any,
				payload
			})
			await load()
			ElMessage.success('已添加')
			return { before, after: cloneRows(directives.value) }
		} catch (e) {
			ElMessage.error('添加失败')
			return null
		}
	}

	const remove = async (directive: any) => {
		if (!contentId.value || !directive?.directive_id) return null
		const before = cloneRows(directives.value)
		try {
			await deleteDirective(Number(projectId.value), directive.directive_id)
			await load()
			return { before, after: cloneRows(directives.value) }
		} catch (e) {
			ElMessage.error('删除失败')
			return null
		}
	}

	return {
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
	}
}
