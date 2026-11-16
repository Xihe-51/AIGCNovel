import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { buildSceneUploadForm, useSceneUploads } from '@/composables/scene/useSceneUploads'
import { uploadSceneFile } from '@/api/scenes'
import { ElMessage } from 'element-plus'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/api/scenes', () => ({
  uploadSceneFile: vi.fn(),
}))

const uploadMock = vi.mocked(uploadSceneFile)
const successMock = vi.mocked(ElMessage.success)
const errorMock = vi.mocked(ElMessage.error)

const createUploads = (overrides: Record<string, any> = {}) => {
  const projectId = overrides.projectId ?? ref<string | number>(7)
  const scene = overrides.scene ?? ref<any>({ background_url: '', music_url: '' })
  const dialogues = overrides.dialogues ?? ref<any[]>([{ content_id: 1, voice_url: '' }, { content_id: 2 }])
  const uploads = useSceneUploads({ projectId, scene, dialogues })
  return { uploads, projectId, scene, dialogues }
}

const formEntries = (formData: FormData) =>
  Object.fromEntries(Array.from(formData.entries()).map(([k, v]) => [k, typeof v === 'string' ? v : 'file']))

describe('buildSceneUploadForm', () => {
  it('写入文件、项目 ID 与文件类型三个字段', () => {
    const file = new File(['x'], 'bg.png', { type: 'image/png' })
    const formData = buildSceneUploadForm(file, 7, 'image')

    expect(formEntries(formData)).toEqual({ file: 'file', project_id: '7', file_type: 'image' })
  })

  it('项目 ID 为空时回落空串', () => {
    const formData = buildSceneUploadForm(new File(['x'], 'a.mp3'), undefined, 'audio')

    expect(formEntries(formData).project_id).toBe('')
    expect(formEntries(formData).file_type).toBe('audio')
  })
})

describe('useSceneUploads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('背景图上传成功后写回 background_url 并回调 onSuccess', async () => {
    uploadMock.mockResolvedValueOnce({ success: true, data: { url: 'https://cdn/bg.png' } } as any)
    const { uploads, scene } = createUploads()
    const onSuccess = vi.fn()

    await uploads.handleBackgroundUpload({ file: new File(['x'], 'bg.png'), onSuccess })

    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(formEntries(uploadMock.mock.calls[0][0]).file_type).toBe('image')
    expect(scene.value.background_url).toBe('https://cdn/bg.png')
    expect(onSuccess).toHaveBeenCalledWith({ success: true, data: { url: 'https://cdn/bg.png' } })
    expect(successMock).toHaveBeenCalledWith('背景图上传成功')
    expect(errorMock).not.toHaveBeenCalled()
  })

  it('背景音乐上传写回 music_url 且 file_type 为 audio', async () => {
    uploadMock.mockResolvedValueOnce({ success: true, data: { url: 'https://cdn/bgm.mp3' } } as any)
    const { uploads, scene } = createUploads()

    await uploads.handleMusicUpload({ file: new File(['x'], 'bgm.mp3') })

    expect(formEntries(uploadMock.mock.calls[0][0]).file_type).toBe('audio')
    expect(scene.value.music_url).toBe('https://cdn/bgm.mp3')
    expect(successMock).toHaveBeenCalledWith('背景音乐上传成功')
  })

  it('语音上传写回对应台词且 file_type 为 voice', async () => {
    uploadMock.mockResolvedValueOnce({ success: true, data: { url: 'https://cdn/v.mp3' } } as any)
    const { uploads, dialogues } = createUploads()

    await uploads.handleVoiceUpload({ file: new File(['x'], 'v.mp3') }, 1)

    expect(formEntries(uploadMock.mock.calls[0][0]).file_type).toBe('voice')
    expect(dialogues.value[1].voice_url).toBe('https://cdn/v.mp3')
    expect(successMock).toHaveBeenCalledWith('语音上传成功')
  })

  it('接口返回 success=false 时走 onError 且不写回字段', async () => {
    uploadMock.mockResolvedValueOnce({ success: false, message: '文件过大' } as any)
    const { uploads, scene } = createUploads()
    const onError = vi.fn()
    const onSuccess = vi.fn()

    await uploads.handleBackgroundUpload({ file: new File(['x'], 'bg.png'), onError, onSuccess })

    expect(scene.value.background_url).toBe('')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(errorMock).toHaveBeenCalledWith('背景图上传失败：文件过大')
    expect(successMock).not.toHaveBeenCalled()
  })

  it('接口抛错时提示未知错误并回调 onError', async () => {
    uploadMock.mockRejectedValueOnce(new Error('网络中断'))
    const { uploads } = createUploads()
    const onError = vi.fn()

    await uploads.handleMusicUpload({ file: new File(['x'], 'bgm.mp3'), onError })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(errorMock).toHaveBeenCalledWith('背景音乐上传失败：网络中断')
  })

  it('未提供 onSuccess / onError 回调时不抛错', async () => {
    uploadMock.mockResolvedValueOnce({ success: true, data: { url: 'https://cdn/bg.png' } } as any)
    const { uploads } = createUploads()

    await expect(uploads.handleBackgroundUpload({ file: new File(['x'], 'bg.png') })).resolves.toBeUndefined()

    uploadMock.mockRejectedValueOnce(new Error('boom'))
    await expect(uploads.handleBackgroundUpload({ file: new File(['x'], 'bg.png') })).resolves.toBeUndefined()
  })

  it('台词索引越界时不写回也不崩', async () => {
    uploadMock.mockResolvedValueOnce({ success: true, data: { url: 'https://cdn/v.mp3' } } as any)
    const { uploads, dialogues } = createUploads()
    const before = JSON.parse(JSON.stringify(dialogues.value))

    await uploads.handleVoiceUpload({ file: new File(['x'], 'v.mp3') }, 99)

    expect(dialogues.value).toEqual(before)
    expect(successMock).toHaveBeenCalledWith('语音上传成功')
  })

  it('缺少 file 时表单结构不变，仍带项目与类型', async () => {
    uploadMock.mockResolvedValueOnce({ success: true, data: { url: 'u' } } as any)
    const { uploads } = createUploads()

    await uploads.handleVoiceUpload({}, 0)

    const entries = formEntries(uploadMock.mock.calls[0][0])
    expect(entries.project_id).toBe('7')
    expect(entries.file_type).toBe('voice')
  })

  it('项目 ID 为 0 时按原值提交', async () => {
    uploadMock.mockResolvedValueOnce({ success: true, data: { url: 'u' } } as any)
    const { uploads } = createUploads({ projectId: ref<string | number>(0) })

    await uploads.handleMusicUpload({ file: new File(['x'], 'bgm.mp3') })

    expect(formEntries(uploadMock.mock.calls[0][0]).project_id).toBe('0')
  })
})
