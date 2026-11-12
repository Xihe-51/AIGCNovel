import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createDirective, updateDirective } from '@/api/directive'
import { useSceneAssetDrop } from '@/composables/scene/useSceneAssetDrop'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

vi.mock('@/api/directive', () => ({
  createDirective: vi.fn(),
  updateDirective: vi.fn(),
}))

function createDrop(options: {
  dialogue?: any
  avatarLayers?: any[]
  backgroundUrl?: string
  musicUrl?: string
} = {}) {
  const projectId = ref<string | number>(7)
  const dialogue = ref<any>(options.dialogue === undefined ? { content_id: 101 } : options.dialogue)
  const layers = ref<any[]>(options.avatarLayers ?? [])
  const scene = ref<any>({
    background_url: options.backgroundUrl ?? '',
    music_url: options.musicUrl ?? '',
  })
  const stageUndoStack = ref<any[]>([])
  const dragOverBg = ref(false)
  const dragOverMusic = ref(false)
  const settingsBgFailed = ref(true)
  const musicPlaying = ref(true)
  const musicProgress = ref(42)
  const musicDuration = ref(180)

  const snapshotStageDirectives = vi.fn(() => {
    stageUndoStack.value.push({ at: Date.now() })
  })
  const markStageUndoApplied = vi.fn()
  const nextLayerOrder = vi.fn(() => 3)
  const findAvatarDirective = vi.fn((layerId: string) =>
    layerId === 'l1' ? { directive_id: 55, payload: { layer_name: '旧名', image_url: '/old.png', order: 2 } } : null
  )
  const loadPreviewDirectives = vi.fn().mockResolvedValue([])
  const refreshDirectiveList = vi.fn().mockResolvedValue([])
  const pushHistory = vi.fn()
  const markDirty = vi.fn()

  const api = useSceneAssetDrop({
    projectId,
    currentDialogue: computed(() => dialogue.value),
    avatarLayers: computed(() => layers.value),
    scene,
    stageUndoStack,
    dragOverBg,
    dragOverMusic,
    settingsBgFailed,
    musicPlaying,
    musicProgress,
    musicDuration,
    snapshotStageDirectives,
    markStageUndoApplied,
    nextLayerOrder,
    findAvatarDirective,
    loadPreviewDirectives,
    refreshDirectiveList,
    pushHistory,
    markDirty,
  })

  return {
    ...api,
    projectId,
    dialogue,
    layers,
    scene,
    stageUndoStack,
    dragOverBg,
    dragOverMusic,
    settingsBgFailed,
    musicPlaying,
    musicProgress,
    musicDuration,
    snapshotStageDirectives,
    markStageUndoApplied,
    nextLayerOrder,
    findAvatarDirective,
    loadPreviewDirectives,
    refreshDirectiveList,
    pushHistory,
    markDirty,
  }
}

function dragEvent(payload?: Record<string, string>, text?: string) {
  return {
    dataTransfer: {
      getData: (type: string) => {
        if (type === 'application/x-aigc-asset') return payload ? JSON.stringify(payload) : ''
        if (type === 'text/plain') return text || ''
        return ''
      },
    },
  } as unknown as DragEvent
}

function badDragEvent() {
  return {
    dataTransfer: {
      getData: (type: string) => {
        if (type === 'application/x-aigc-asset') return '{not json'
        return ''
      },
    },
  } as unknown as DragEvent
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createDirective).mockResolvedValue({} as any)
  vi.mocked(updateDirective).mockResolvedValue({} as any)
})

describe('useSceneAssetDrop / 素材类型判定', () => {
  it('isImageUrl 识别常见图片扩展名，忽略大小写与查询串', () => {
    const d = createDrop()
    expect(d.isImageUrl('/a/b.png')).toBe(true)
    expect(d.isImageUrl('https://x.com/c.JPEG?t=1')).toBe(true)
    expect(d.isImageUrl('/x.webp')).toBe(true)
    expect(d.isImageUrl('/x.mp3')).toBe(false)
    expect(d.isImageUrl('')).toBe(false)
    expect(d.isImageUrl(null)).toBe(false)
  })

  it('isAudioUrl 只认音频扩展名', () => {
    const d = createDrop()
    expect(d.isAudioUrl('/a.mp3')).toBe(true)
    expect(d.isAudioUrl('/a.WAV')).toBe(true)
    expect(d.isAudioUrl('/a.ogg?x=1')).toBe(true)
    expect(d.isAudioUrl('/a.png')).toBe(false)
    expect(d.isAudioUrl(undefined)).toBe(false)
  })
})

describe('useSceneAssetDrop / 拖拽数据解析', () => {
  it('readAssetPayload 解析自定义素材载荷', () => {
    const d = createDrop()
    expect(d.readAssetPayload(dragEvent({ url: '/a.png', label: '立绘' }))).toEqual({ url: '/a.png', label: '立绘' })
  })

  it('readAssetPayload 对非法 JSON 与空载荷返回 null', () => {
    const d = createDrop()
    expect(d.readAssetPayload(badDragEvent())).toBeNull()
    expect(d.readAssetPayload(dragEvent())).toBeNull()
  })

  it('stageAssetPayload 优先读取自定义载荷并兼容 image_url 字段', () => {
    const d = createDrop()
    expect(d.stageAssetPayload(dragEvent({ image_url: '/a.png', title: '标题' })))
      .toEqual({ url: '/a.png', label: '标题' })
  })

  it('stageAssetPayload 回退到纯文本图片链接', () => {
    const d = createDrop()
    expect(d.stageAssetPayload(dragEvent(undefined, 'https://x.com/a.png'))).toEqual({ url: 'https://x.com/a.png', label: '' })
  })

  it('stageAssetPayload 对非图片纯文本返回 null', () => {
    const d = createDrop()
    expect(d.stageAssetPayload(dragEvent(undefined, 'https://x.com/a.mp3'))).toBeNull()
    expect(d.stageAssetPayload(badDragEvent())).toBeNull()
  })
})

describe('useSceneAssetDrop / 舞台直出', () => {
  it('当前台词未保存时给出提示且不建指令', async () => {
    const d = createDrop({ dialogue: { content_id: null } })
    await d.onStageAssetDrop({ url: '/a.png', label: '立绘', x: 30, y: 100 })
    expect(ElMessage.warning).toHaveBeenCalledWith('请先保存当前台词，再把素材拖到舞台')
    expect(createDirective).not.toHaveBeenCalled()
    expect(d.snapshotStageDirectives).not.toHaveBeenCalled()
  })

  it('图层数达到上限时拒绝新建', async () => {
    const layers = Array.from({ length: 8 }, (_, i) => ({ layer_id: `l${i}` }))
    const d = createDrop({ avatarLayers: layers })
    await d.onStageAssetDrop({ url: '/a.png', label: '立绘', x: 30, y: 100 })
    expect(ElMessage.warning).toHaveBeenCalledWith('最多 8 个立绘图层')
    expect(createDirective).not.toHaveBeenCalled()
  })

  it('成功后按舞台坐标创建立绘层并刷新链路', async () => {
    const d = createDrop()
    await d.onStageAssetDrop({ url: '/a.png', label: '素材立绘A', x: 12.5, y: 88 })

    expect(d.snapshotStageDirectives).toHaveBeenCalledTimes(1)
    const [pid, body] = vi.mocked(createDirective).mock.calls[0]
    expect(pid).toBe(7)
    expect(body.content_id).toBe(101)
    expect(body.directive_type).toBe('avatar')
    expect(body.payload).toMatchObject({
      image_url: '/a.png',
      layer_name: '素材立绘A',
      order: 3,
      action: 'show',
      coord: 'stage',
      x: 12.5,
      y: 88,
    })
    expect(body.payload.layer_id).toMatch(/^l/)
    expect(d.loadPreviewDirectives).toHaveBeenCalledWith(101)
    expect(d.refreshDirectiveList).toHaveBeenCalledTimes(1)
    expect(d.markStageUndoApplied).toHaveBeenCalledTimes(1)
    expect(d.stageUndoStack.value).toHaveLength(1)
    expect(ElMessage.success).toHaveBeenCalledWith('已用素材创建立绘层「素材立绘A」')
  })

  it('坐标越界会被夹到 0~100，标签过长截断到 30 字', async () => {
    const d = createDrop()
    const longLabel = '立'.repeat(40)
    await d.onStageAssetDrop({ url: '/a.png', label: longLabel, x: 200, y: -20 })

    const [, body] = vi.mocked(createDirective).mock.calls[0]
    expect(body.payload.x).toBe(100)
    expect(body.payload.y).toBe(0)
    expect(body.payload.layer_name).toHaveLength(30)
  })

  it('创建失败时回滚撤销栈并提示', async () => {
    const d = createDrop()
    vi.mocked(createDirective).mockRejectedValueOnce(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await d.onStageAssetDrop({ url: '/a.png', label: '立绘', x: 50, y: 50 })

    expect(d.stageUndoStack.value).toHaveLength(0)
    expect(ElMessage.error).toHaveBeenCalledWith('素材立绘层创建失败，请重试')
    expect(d.markStageUndoApplied).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('useSceneAssetDrop / 替换图层素材', () => {
  it('当前台词未保存时给出提示', async () => {
    const d = createDrop({ dialogue: { content_id: null } })
    await d.onAvatarReplaceAsset('l1', { url: '/new.png', label: '' })
    expect(ElMessage.warning).toHaveBeenCalledWith('请先保存当前台词，再替换图层素材')
    expect(updateDirective).not.toHaveBeenCalled()
  })

  it('图层没有立绘指令时给出提示', async () => {
    const d = createDrop()
    await d.onAvatarReplaceAsset('l404', { url: '/new.png', label: '' })
    expect(ElMessage.warning).toHaveBeenCalledWith('该图层还没有立绘指令，无法替换素材')
    expect(updateDirective).not.toHaveBeenCalled()
  })

  it('成功后保留原有 payload 并替换图片地址', async () => {
    const d = createDrop()
    await d.onAvatarReplaceAsset('l1', { url: '/new.png', label: '新素材' })

    expect(d.snapshotStageDirectives).toHaveBeenCalledTimes(1)
    const [pid, directiveId, body] = vi.mocked(updateDirective).mock.calls[0]
    expect(pid).toBe(7)
    expect(directiveId).toBe(55)
    expect(body.payload).toMatchObject({
      layer_id: 'l1',
      image_url: '/new.png',
      layer_name: '旧名',
      order: 2,
      action: 'show',
    })
    expect(d.loadPreviewDirectives).toHaveBeenCalledWith(101)
    expect(d.refreshDirectiveList).toHaveBeenCalledTimes(1)
    expect(d.markStageUndoApplied).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('图层素材已替换')
  })

  it('替换失败时回滚撤销栈', async () => {
    const d = createDrop()
    vi.mocked(updateDirective).mockRejectedValueOnce(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await d.onAvatarReplaceAsset('l1', { url: '/new.png', label: '' })

    expect(d.stageUndoStack.value).toHaveLength(0)
    expect(ElMessage.error).toHaveBeenCalledWith('替换图层素材失败，请重试')
    spy.mockRestore()
  })
})

describe('useSceneAssetDrop / 场景设置槽位', () => {
  it('非图片拖到背景槽位会被拒绝', () => {
    const d = createDrop()
    d.dragOverBg.value = true
    d.onBackgroundDrop(dragEvent({ url: '/a.mp3', asset_kind: 'audio' }))

    expect(d.dragOverBg.value).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalledWith('请拖入图片素材')
    expect(d.pushHistory).not.toHaveBeenCalled()
    expect(d.scene.value.background_url).toBe('')
  })

  it('图片拖入后写入背景并标记待保存', () => {
    const d = createDrop()
    d.dragOverBg.value = true
    d.onBackgroundDrop(dragEvent({ url: '/bg.png' }))

    expect(d.dragOverBg.value).toBe(false)
    expect(d.pushHistory).toHaveBeenCalledTimes(1)
    expect(d.markDirty).toHaveBeenCalledTimes(1)
    expect(d.scene.value.background_url).toBe('/bg.png')
    expect(d.settingsBgFailed.value).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith('已填入背景图，稍后自动保存')
  })

  it('扩展名缺失但载荷声明为图片时仍然接受', () => {
    const d = createDrop()
    d.onBackgroundDrop(dragEvent({ url: 'https://cdn.example.com/raw?id=1', asset_kind: 'image' }))
    expect(d.scene.value.background_url).toBe('https://cdn.example.com/raw?id=1')
    expect(d.pushHistory).toHaveBeenCalledTimes(1)
  })

  it('非音频拖到音乐槽位会被拒绝', () => {
    const d = createDrop()
    d.dragOverMusic.value = true
    d.onMusicDrop(dragEvent(undefined, '/bg.png'))

    expect(d.dragOverMusic.value).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalledWith('请拖入音频素材')
    expect(d.markDirty).not.toHaveBeenCalled()
    expect(d.scene.value.music_url).toBe('')
  })

  it('音频拖入后写入音乐地址并复位播放器', () => {
    const d = createDrop()
    d.dragOverMusic.value = true
    d.onMusicDrop(dragEvent({ url: '/bgm.mp3', asset_kind: 'audio' }))

    expect(d.dragOverMusic.value).toBe(false)
    expect(d.pushHistory).toHaveBeenCalledTimes(1)
    expect(d.markDirty).toHaveBeenCalledTimes(1)
    expect(d.scene.value.music_url).toBe('/bgm.mp3')
    expect(d.musicPlaying.value).toBe(false)
    expect(d.musicProgress.value).toBe(0)
    expect(d.musicDuration.value).toBe(0)
    expect(ElMessage.success).toHaveBeenCalledWith('已填入背景音乐，稍后自动保存')
  })
})
