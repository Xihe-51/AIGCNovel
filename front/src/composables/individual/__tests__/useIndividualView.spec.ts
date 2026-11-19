import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useIndividualView } from '@/composables/individual/useIndividualView'
import {
  createAIModel,
  deleteAIModel,
  getUserInfo,
  getUserModels,
  getUserProjects,
  getUserStatistics,
  updateAIModel,
  updateUserInfo,
  uploadAvatar
} from '@/api/individual'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

vi.mock('@/utils/request', () => ({ BASE_URL: 'http://api.test' }))

vi.mock('@/api/individual', () => ({
  getUserInfo: vi.fn(),
  updateUserInfo: vi.fn(),
  uploadAvatar: vi.fn(),
  getUserModels: vi.fn(),
  getUserProjects: vi.fn(),
  getUserStatistics: vi.fn(),
  createAIModel: vi.fn(),
  updateAIModel: vi.fn(),
  deleteAIModel: vi.fn()
}))

const ok = (data: unknown) => ({ data: { code: 200, message: 'ok', data } }) as any

const makeUser = () =>
  ok({
    user_id: 1,
    username: '屿声',
    email: 'yu@example.com',
    phone: '13800000000',
    avatar_url: '/uploads/avatar/yu.png',
    created_at: '2024-03-05T10:20:30'
  })

const makeStats = () => ok({ project_count: 3, model_count: 2, total_word_count: 12000 })

const makeProjects = () =>
  ok({
    projects: [
      {
        project_id: 7,
        title: '雨夜列车',
        cover_url: '/uploads/cover/rain.jpg',
        genre: '悬疑',
        template_type: '线性叙事',
        word_count: 8000,
        updated_at: '2024-11-09T08:00:00'
      }
    ],
    total: 1,
    pages: 1,
    current_page: 1
  })

const makeModels = () =>
  ok({
    models: [{ model_id: 5, name: '温柔旁白', style_description: '低声线', type: 'text' }],
    total: 1,
    pages: 1,
    current_page: 1
  })

const primeLoaders = () => {
  vi.mocked(getUserInfo).mockResolvedValue(makeUser())
  vi.mocked(getUserStatistics).mockResolvedValue(makeStats())
  vi.mocked(getUserProjects).mockResolvedValue(makeProjects())
  vi.mocked(getUserModels).mockResolvedValue(makeModels())
}

describe('useIndividualView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loadUserData 填满用户、统计、项目与模型，并给头像补上 BASE_URL', async () => {
    primeLoaders()

    const view = useIndividualView()
    await view.loadUserData()

    expect(view.userInfo.value.username).toBe('屿声')
    expect(view.userInfo.value.avatar_url).toBe('http://api.test/uploads/avatar/yu.png')
    expect(view.statistics.value.project_count).toBe(3)
    expect(view.recentProjects.value).toHaveLength(1)
    expect(view.recentModels.value[0].name).toBe('温柔旁白')
    expect(view.editForm.value).toMatchObject({
      username: '屿声',
      email: 'yu@example.com',
      phone: '13800000000',
      password: ''
    })
    expect(getUserProjects).toHaveBeenCalledWith(1, 10)
  })

  it('loadUserData 取数失败时提示后端文案', async () => {
    vi.mocked(getUserInfo).mockRejectedValue({ response: { data: { message: '登录已过期' } } })

    const view = useIndividualView()
    await view.loadUserData()

    expect(ElMessage.error).toHaveBeenCalledWith('加载用户数据失败：登录已过期')
    expect(getUserStatistics).not.toHaveBeenCalled()
  })

  it('loadModels 失败时单独提示，不影响用户主体数据', async () => {
    vi.mocked(getUserModels).mockRejectedValue(new Error('boom'))

    const view = useIndividualView()
    await view.loadModels()

    expect(view.recentModels.value).toEqual([])
    expect(ElMessage.error).toHaveBeenCalledWith('加载模型列表失败：boom')
  })

  it('handleAvatarUpload 成功后刷新头像地址', async () => {
    vi.mocked(uploadAvatar).mockResolvedValue(ok({ avatar_url: 'http://cdn.test/new.png' }))

    const view = useIndividualView()
    await view.handleAvatarUpload({ file: { name: 'a.png' } as File })

    expect(view.userInfo.value.avatar_url).toBe('http://cdn.test/new.png')
    expect(ElMessage.success).toHaveBeenCalledWith('头像上传成功')
  })

  it('handleAvatarUpload 失败时提示错误', async () => {
    vi.mocked(uploadAvatar).mockRejectedValue({ response: { data: { detail: '文件过大' } } })

    const view = useIndividualView()
    await view.handleAvatarUpload({ file: { name: 'a.png' } as File })

    expect(ElMessage.error).toHaveBeenCalledWith('头像上传失败：文件过大')
  })

  it('beforeAvatarUpload 拦截非图片与超限文件', () => {
    const view = useIndividualView()
    const check = view.beforeAvatarUpload as (file: { type: string; size: number }) => boolean

    expect(check({ type: 'text/plain', size: 1024 })).toBe(false)
    expect(ElMessage.error).toHaveBeenCalledWith('只能上传图片文件!')

    expect(check({ type: 'image/png', size: 3 * 1024 * 1024 })).toBe(false)
    expect(ElMessage.error).toHaveBeenCalledWith('图片大小不能超过2MB!')

    expect(check({ type: 'image/png', size: 1024 })).toBe(true)
  })

  it('submitProfileUpdate 空密码不提交 password 字段', async () => {
    primeLoaders()
    vi.mocked(updateUserInfo).mockResolvedValue(ok(undefined))

    const view = useIndividualView()
    await view.submitProfileUpdate()

    expect(updateUserInfo).toHaveBeenCalledWith({
      username: '',
      email: '',
      phone: ''
    })
    expect(ElMessage.success).toHaveBeenCalledWith('个人信息更新成功')
    expect(getUserInfo).toHaveBeenCalledTimes(1)
  })

  it('submitProfileUpdate 失败时提示错误', async () => {
    vi.mocked(updateUserInfo).mockRejectedValue({ response: { data: { message: '邮箱已被占用' } } })

    const view = useIndividualView()
    await view.submitProfileUpdate()

    expect(ElMessage.error).toHaveBeenCalledWith('更新个人信息失败：邮箱已被占用')
  })

  it('submitCreate 成功后关闭弹窗、清空表单并刷新模型列表', async () => {
    vi.mocked(createAIModel).mockResolvedValue(ok({}))
    vi.mocked(getUserModels).mockResolvedValue(makeModels())

    const view = useIndividualView()
    view.createForm.value = {
      name: '冷峻旁白',
      style_description: '低音',
      type: 'audio',
      model_path: '/models/cold.bin'
    }
    view.showCreateDialog.value = true

    await view.submitCreate()

    expect(createAIModel).toHaveBeenCalledWith({
      name: '冷峻旁白',
      style_description: '低音',
      type: 'audio',
      model_path: '/models/cold.bin'
    })
    expect(view.showCreateDialog.value).toBe(false)
    expect(view.createForm.value).toEqual({
      name: '',
      style_description: '',
      type: '',
      model_path: ''
    })
    expect(getUserModels).toHaveBeenCalledTimes(1)
    expect(view.creating.value).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith('模型创建成功')
  })

  it('submitCreate 校验未通过时不发起请求', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const view = useIndividualView()
    view.createFormRef.value = {
      validate: vi.fn().mockRejectedValue({ name: true })
    } as any

    await view.submitCreate()

    expect(createAIModel).not.toHaveBeenCalled()
    expect(view.creating.value).toBe(false)

    errorSpy.mockRestore()
  })

  it('handleEdit 打开弹窗并复制模型草稿', () => {
    const view = useIndividualView()
    view.handleEdit({ model_id: 9, name: '清冷少年', style_description: '少年音', type: 'text' })

    expect(view.showEditDialog.value).toBe(true)
    expect(view.editingModel.value.model_id).toBe(9)
    expect(view.editingModel.value.name).toBe('清冷少年')
  })

  it('submitEdit 成功后关闭弹窗并刷新模型列表', async () => {
    vi.mocked(updateAIModel).mockResolvedValue(ok({}))
    vi.mocked(getUserModels).mockResolvedValue(makeModels())

    const view = useIndividualView()
    view.editingModel.value = {
      model_id: 9,
      name: '清冷少年',
      style_description: '少年音',
      type: 'text',
      model_path: '/models/boy.bin'
    }
    view.showEditDialog.value = true

    await view.submitEdit()

    expect(updateAIModel).toHaveBeenCalledWith(9, {
      name: '清冷少年',
      style_description: '少年音',
      type: 'text',
      model_path: '/models/boy.bin'
    })
    expect(view.showEditDialog.value).toBe(false)
    expect(getUserModels).toHaveBeenCalledTimes(1)
    expect(view.editing.value).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith('模型更新成功')
  })

  it('removeModel 确认后落库并刷新', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    vi.mocked(deleteAIModel).mockResolvedValue(ok(undefined))
    vi.mocked(getUserModels).mockResolvedValue(makeModels())

    const view = useIndividualView()
    await view.removeModel(5)

    expect(deleteAIModel).toHaveBeenCalledWith(5)
    expect(getUserModels).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith('模型删除成功')
  })

  it('removeModel 取消时静默退出，不落库也不报错', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')

    const view = useIndividualView()
    await view.removeModel(5)

    expect(deleteAIModel).not.toHaveBeenCalled()
    expect(getUserModels).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('removeModel 落库失败时提示错误', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    vi.mocked(deleteAIModel).mockRejectedValue({ response: { data: { message: '模型正在使用中' } } })

    const view = useIndividualView()
    await view.removeModel(5)

    expect(ElMessage.error).toHaveBeenCalledWith('删除失败：模型正在使用中')
  })
})
