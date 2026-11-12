import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { checkProjectAssets } from '@/api/asset'
import { pickAssetItems, useSceneAssetPicker } from '@/composables/scene/useSceneAssetPicker'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/api/asset', () => ({
  checkProjectAssets: vi.fn(),
}))

const item = (over: Record<string, any> = {}): any => ({
  kind: 'scene_bg',
  kind_label: '场景背景',
  where: '场景',
  url: '/static/a.png',
  status: 'ok',
  usage_count: 1,
  ...over,
})

function createPicker(options: {
  projectId?: string | number
  sceneProjectId?: string | number
  backgroundUrl?: string
  musicUrl?: string
} = {}) {
  const projectId = ref<string | number>(options.projectId ?? 7)
  const scene = ref<any>({
    project_id: options.sceneProjectId ?? 7,
    background_url: options.backgroundUrl ?? '',
    music_url: options.musicUrl ?? '',
  })
  const settingsBgFailed = ref(true)
  const stopSettingsAudio = vi.fn()
  const picker = useSceneAssetPicker({ projectId, scene, settingsBgFailed, stopSettingsAudio })
  return { picker, projectId, scene, settingsBgFailed, stopSettingsAudio }
}

describe('pickAssetItems', () => {
  it('只保留 status 为 ok 的素材', () => {
    const result = pickAssetItems(
      [
        item({ url: '/a.png', status: 'ok' }),
        item({ url: '/b.png', status: 'missing' }),
        item({ url: '/c.png', status: 'external' }),
      ],
      'image'
    )
    expect(result.map((x) => x.url)).toEqual(['/a.png'])
  })

  it('按扩展名过滤图片与音频', () => {
    const items = [
      item({ url: '/a.png' }),
      item({ url: '/b.mp3' }),
      item({ url: '/c.txt' }),
      item({ url: '/d.jpeg?x=1' }),
      item({ url: '/e.wav' }),
    ]
    expect(pickAssetItems(items, 'image').map((x) => x.url)).toEqual(['/a.png', '/d.jpeg?x=1'])
    expect(pickAssetItems(items, 'audio').map((x) => x.url)).toEqual(['/b.mp3', '/e.wav'])
  })

  it('同址去重时保留 usage_count 更高的那条', () => {
    const result = pickAssetItems(
      [item({ url: '/a.png', usage_count: 2, where: '低' }), item({ url: '/a.png', usage_count: 9, where: '高' })],
      'image'
    )
    expect(result).toHaveLength(1)
    expect(result[0].where).toBe('高')
  })

  it('去重后按 usage_count 降序', () => {
    const result = pickAssetItems(
      [item({ url: '/a.png', usage_count: 1 }), item({ url: '/b.png', usage_count: 5 }), item({ url: '/c.png', usage_count: 3 })],
      'image'
    )
    expect(result.map((x) => x.url)).toEqual(['/b.png', '/c.png', '/a.png'])
  })

  it('空输入与缺失 usage_count 不报错', () => {
    expect(pickAssetItems(null, 'image')).toEqual([])
    expect(pickAssetItems(undefined, 'audio')).toEqual([])
    const result = pickAssetItems([item({ url: '/a.png', usage_count: undefined })], 'image')
    expect(result).toHaveLength(1)
  })
})

describe('useSceneAssetPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(checkProjectAssets as any).mockResolvedValue({ items: [item({ url: '/a.png', usage_count: 3 })] })
  })

  it('初始状态：对话框关闭、类型图片、无数据', () => {
    const { picker } = createPicker()
    expect(picker.assetPickerVisible.value).toBe(false)
    expect(picker.assetPickerKind.value).toBe('image')
    expect(picker.assetPickerLoading.value).toBe(false)
    expect(picker.assetPickerItems.value).toEqual([])
  })

  it('openAssetPicker 打开对话框并填充过滤后的素材', async () => {
    const { picker } = createPicker()
    const pending = picker.openAssetPicker('image')
    expect(picker.assetPickerVisible.value).toBe(true)
    expect(picker.assetPickerLoading.value).toBe(true)
    await pending
    expect(checkProjectAssets).toHaveBeenCalledWith(7)
    expect(picker.assetPickerLoading.value).toBe(false)
    expect(picker.assetPickerItems.value.map((x) => x.url)).toEqual(['/a.png'])
    expect(picker.assetPickerKind.value).toBe('image')
  })

  it('projectId 为空时回落到 scene.project_id', async () => {
    const { picker } = createPicker({ projectId: '', sceneProjectId: 42 })
    await picker.openAssetPicker('audio')
    expect(checkProjectAssets).toHaveBeenCalledWith(42)
  })

  it('读取失败时提示错误并结束 loading', async () => {
    ;(checkProjectAssets as any).mockRejectedValue(new Error('500 挂了'))
    const { picker } = createPicker()
    await picker.openAssetPicker('image')
    expect(ElMessage.error).toHaveBeenCalledWith('读取素材库失败：500 挂了')
    expect(picker.assetPickerLoading.value).toBe(false)
    expect(picker.assetPickerItems.value).toEqual([])
  })

  it('读取失败且无 message 时使用默认文案', async () => {
    ;(checkProjectAssets as any).mockRejectedValue({})
    const { picker } = createPicker()
    await picker.openAssetPicker('image')
    expect(ElMessage.error).toHaveBeenCalledWith('读取素材库失败：未知错误')
  })

  it('选图片：写入 background_url、复位失败标记、关闭对话框', async () => {
    const { picker, scene, settingsBgFailed } = createPicker()
    await picker.openAssetPicker('image')
    picker.useAssetFromLibrary({ url: '/static/bg.jpg' } as any)
    expect(scene.value.background_url).toBe('/static/bg.jpg')
    expect(settingsBgFailed.value).toBe(false)
    expect(picker.assetPickerVisible.value).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith('已填入素材，稍后自动保存')
  })

  it('选音频：先停试听再写入 music_url', async () => {
    const { picker, scene, stopSettingsAudio } = createPicker()
    await picker.openAssetPicker('audio')
    picker.useAssetFromLibrary({ url: '/static/bgm.mp3' } as any)
    expect(stopSettingsAudio).toHaveBeenCalledTimes(1)
    expect(scene.value.music_url).toBe('/static/bgm.mp3')
    expect(picker.assetPickerVisible.value).toBe(false)
  })

  it('传入空素材时不做任何改动', () => {
    const { picker, scene, settingsBgFailed, stopSettingsAudio } = createPicker()
    picker.useAssetFromLibrary(null)
    expect(scene.value.background_url).toBe('')
    expect(settingsBgFailed.value).toBe(true)
    expect(stopSettingsAudio).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })
})
