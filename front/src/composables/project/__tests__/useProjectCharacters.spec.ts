import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  emptyAvatar,
  emptyCharacter,
  filterCharacters,
  nextSettingKey,
  resolveAvatarUrl,
  useProjectCharacters,
} from '@/composables/project/useProjectCharacters'
import {
  createCharacter,
  deleteCharacterAvatar,
  deleteCharacter_by_Id,
  getCharacterAvatarsBatch,
  getCharacters,
  updateCharacter,
  updateCharacterAvatar,
  uploadCharacterAvatar,
} from '@/api/character'
import type { Character, CharacterAvatar } from '@/api/character'
import { saveCharacterNameTranslation } from '@/api/translation'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

vi.mock('@/api/character', () => ({
  getCharacters: vi.fn(),
  getCharacterAvatarsBatch: vi.fn(),
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  deleteCharacter_by_Id: vi.fn(),
  uploadCharacterAvatar: vi.fn(),
  deleteCharacterAvatar: vi.fn(),
  updateCharacterAvatar: vi.fn(),
}))

vi.mock('@/api/translation', () => ({
  TRANSLATION_LANGUAGES: [
    { code: 'zh-TW', label: '繁體中文' },
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
  ],
  saveCharacterNameTranslation: vi.fn(),
}))

vi.mock('@/utils/request', () => ({
  default: {},
  BASE_URL: 'http://api.test',
}))

vi.mock('@/assets/default.jpg', () => ({ default: '/default.jpg' }))

const makeCharacter = (overrides: Partial<Character> = {}): Character => ({
  character_id: 1,
  project_id: 7,
  name: '林瑶',
  is_main: true,
  description: '雨天转学的同班同学',
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeAvatar = (overrides: Partial<CharacterAvatar> = {}): CharacterAvatar => ({
  avatar_id: 11,
  character_id: 1,
  image_url: '/uploads/avatar/lin.jpg',
  avatar_type: '正常',
  costume: '校服',
  is_default: false,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeCtx = (overrides: Partial<Parameters<typeof useProjectCharacters>[0]> = {}) => ({
  projectId: () => 7,
  ...overrides,
})

describe('filterCharacters', () => {
  const list = [
    makeCharacter(),
    makeCharacter({ character_id: 2, name: '周野', description: '篮球队长' }),
  ]

  it('关键词为空时原样返回', () => {
    expect(filterCharacters(list, '')).toBe(list)
    expect(filterCharacters(list, '   ')).toBe(list)
  })

  it('命中姓名或描述', () => {
    expect(filterCharacters(list, '林').map(c => c.character_id)).toEqual([1])
    expect(filterCharacters(list, '篮球').map(c => c.character_id)).toEqual([2])
  })

  it('无命中时返回空列表', () => {
    expect(filterCharacters(list, '不存在的角色')).toEqual([])
  })
})

describe('nextSettingKey', () => {
  it('没有参数时从 param_1 起', () => {
    expect(nextSettingKey(undefined)).toBe('param_1')
    expect(nextSettingKey({})).toBe('param_1')
  })

  it('顺序占用时接在末尾', () => {
    expect(nextSettingKey({ param_1: '', param_2: '' })).toBe('param_3')
  })

  it('中间被删除时补最小空缺', () => {
    expect(nextSettingKey({ param_1: '', param_3: '' })).toBe('param_2')
  })

  it('忽略非 param_N 的自定义键', () => {
    expect(nextSettingKey({ 好感度: 3 })).toBe('param_1')
  })
})

describe('resolveAvatarUrl', () => {
  it('角色自带头像优先', () => {
    expect(resolveAvatarUrl(makeCharacter({ avatar_url: '/a.png' }), [makeAvatar({ is_default: true })], '/d.jpg')).toBe(
      'http://api.test/a.png',
    )
  })

  it('没有自带头像时取默认立绘', () => {
    expect(resolveAvatarUrl(makeCharacter(), [makeAvatar({ is_default: true })], '/d.jpg')).toBe(
      'http://api.test/uploads/avatar/lin.jpg',
    )
  })

  it('都没有时退回占位图', () => {
    expect(resolveAvatarUrl(makeCharacter(), [makeAvatar()], '/d.jpg')).toBe('/d.jpg')
  })
})

describe('emptyCharacter / emptyAvatar', () => {
  it('新建角色以 character_id=0 标记未落库', () => {
    const draft = emptyCharacter(7)
    expect(draft.character_id).toBe(0)
    expect(draft.project_id).toBe(7)
    expect(draft.is_main).toBe(false)
    expect(draft.name).toBe('')
  })

  it('立绘草稿默认表情为正常且非默认立绘', () => {
    expect(emptyAvatar()).toEqual({ avatar_type: '正常', costume: '', is_default: false })
  })
})

describe('useProjectCharacters', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(getCharacters).mockResolvedValue([])
    vi.mocked(getCharacterAvatarsBatch).mockResolvedValue([])
  })

  afterEach(() => {
    warnSpy.mockRestore()
    vi.useRealTimers()
  })

  it('读取角色后按 id 批量拉立绘', async () => {
    const rows = [makeCharacter(), makeCharacter({ character_id: 2, name: '周野' })]
    vi.mocked(getCharacters).mockResolvedValue(rows)
    vi.mocked(getCharacterAvatarsBatch).mockResolvedValue([makeAvatar()])

    const { characters, characterAvatars, loadingCharacters, fetchCharacters } = useProjectCharacters(makeCtx())
    await fetchCharacters()

    expect(getCharacters).toHaveBeenCalledWith(7)
    expect(getCharacterAvatarsBatch).toHaveBeenCalledWith([1, 2])
    expect(characters.value).toEqual(rows)
    expect(characterAvatars.value).toHaveLength(1)
    expect(loadingCharacters.value).toBe(false)
  })

  it('没有角色时清空立绘且不请求批量接口', async () => {
    const { characterAvatars, fetchCharacters } = useProjectCharacters(makeCtx())
    await fetchCharacters()

    expect(getCharacterAvatarsBatch).not.toHaveBeenCalled()
    expect(characterAvatars.value).toEqual([])
  })

  it('立绘批量读取失败时保留告警而不阻断角色列表', async () => {
    vi.mocked(getCharacters).mockResolvedValue([makeCharacter()])
    vi.mocked(getCharacterAvatarsBatch).mockRejectedValue(new Error('boom'))

    const { characters, fetchCharacters } = useProjectCharacters(makeCtx())
    await fetchCharacters()

    expect(characters.value).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('打开新建抽屉时给出空表单并清空立绘', () => {
    const state = useProjectCharacters(makeCtx())
    state.currentCharacterAvatars.value = [makeAvatar()]

    state.showAddCharacterDialog()

    expect(state.isAdd.value).toBe(true)
    expect(state.characterDrawerVisible.value).toBe(true)
    expect(state.currentCharacter.value?.character_id).toBe(0)
    expect(state.currentCharacter.value?.project_id).toBe(7)
    expect(state.currentCharacterAvatars.value).toEqual([])
    expect(state.characterNameTranslations.value).toEqual({})
  })

  it('编辑角色时复制行、译名并只显示该角色的立绘', () => {
    const state = useProjectCharacters(makeCtx())
    const row = makeCharacter({ name_translations: { en: 'Lin Yao' } })
    state.characterAvatars.value = [makeAvatar(), makeAvatar({ avatar_id: 12, character_id: 2 })]

    state.editCharacter(row)

    expect(state.isAdd.value).toBe(false)
    expect(state.currentCharacter.value).toEqual(row)
    expect(state.currentCharacter.value).not.toBe(row)
    expect(state.characterNameTranslations.value).toEqual({ en: 'Lin Yao' })
    expect(state.currentCharacterAvatars.value.map(a => a.avatar_id)).toEqual([11])
  })

  it('新建角色只提交可写字段并刷新列表', async () => {
    vi.mocked(createCharacter).mockResolvedValue(makeCharacter({ character_id: 5 }))
    const state = useProjectCharacters(makeCtx())
    state.showAddCharacterDialog()
    state.currentCharacter.value!.name = '新角色'

    await state.saveCharacter()

    const payload = vi.mocked(createCharacter).mock.calls[0][0]
    expect(payload).not.toHaveProperty('character_id')
    expect(payload).not.toHaveProperty('created_at')
    expect(payload.name).toBe('新角色')
    expect(ElMessage.success).toHaveBeenCalledWith('角色添加成功')
    expect(state.characterDrawerVisible.value).toBe(false)
    expect(getCharacters).toHaveBeenCalled()
  })

  it('新建失败时保留抽屉并提示后端消息', async () => {
    vi.mocked(createCharacter).mockRejectedValue({ response: { data: { message: '角色名重复' } } })
    const state = useProjectCharacters(makeCtx())
    state.showAddCharacterDialog()

    await state.saveCharacter()

    expect(ElMessage.error).toHaveBeenCalledWith('角色添加失败：角色名重复')
    expect(state.characterDrawerVisible.value).toBe(true)
  })

  it('编辑角色时逐语言保存译名并回填列表', async () => {
    vi.mocked(updateCharacter).mockResolvedValue(makeCharacter({ name: '林瑶瑶' }))
    vi.mocked(saveCharacterNameTranslation).mockImplementation(async (_id, language, name) =>
      name ? { language, name } as any : null as any,
    )
    const state = useProjectCharacters(makeCtx())
    state.characters.value = [makeCharacter()]
    state.editCharacter(makeCharacter())
    state.characterNameTranslations.value = { 'zh-TW': '林瑤', en: 'Lin Yao' }

    await state.saveCharacter()

    expect(saveCharacterNameTranslation).toHaveBeenCalledTimes(3)
    expect(state.characters.value[0].name).toBe('林瑶瑶')
    expect(state.characters.value[0].name_translations).toEqual({ 'zh-TW': '林瑤', en: 'Lin Yao' })
    expect(state.currentCharacter.value?.name).toBe('林瑶瑶')
    expect(state.characterDrawerVisible.value).toBe(false)
  })

  it('编辑失败时提示并保留抽屉', async () => {
    vi.mocked(updateCharacter).mockRejectedValue(new Error('网络断了'))
    const state = useProjectCharacters(makeCtx())
    state.editCharacter(makeCharacter())

    await state.saveCharacter()

    expect(ElMessage.error).toHaveBeenCalledWith('角色更新失败：网络断了')
    expect(state.characterDrawerVisible.value).toBe(true)
  })

  it('删除角色确认后同时清掉它的立绘', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    vi.mocked(deleteCharacter_by_Id).mockResolvedValue({ success: true, message: '', character_id: 1 })
    const state = useProjectCharacters(makeCtx())
    state.characters.value = [makeCharacter(), makeCharacter({ character_id: 2 })]
    state.characterAvatars.value = [makeAvatar(), makeAvatar({ avatar_id: 12, character_id: 2 })]

    await state.deleteCharacter(1)

    expect(deleteCharacter_by_Id).toHaveBeenCalledWith(1)
    expect(state.characters.value.map(c => c.character_id)).toEqual([2])
    expect(state.characterAvatars.value.map(a => a.avatar_id)).toEqual([12])
  })

  it('取消删除时不调用接口也不报错', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const state = useProjectCharacters(makeCtx())

    await state.deleteCharacter(1)

    expect(deleteCharacter_by_Id).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('添加立绘对话框带上当前角色 id', () => {
    const state = useProjectCharacters(makeCtx())
    state.editCharacter(makeCharacter({ character_id: 9 }))

    state.showAddAvatarDialog()

    expect(state.avatarDialogVisible.value).toBe(true)
    expect(state.newAvatar.value.character_id).toBe(9)
  })

  it('缺少服装描述时不上传', async () => {
    const state = useProjectCharacters(makeCtx())
    state.editCharacter(makeCharacter())
    state.showAddAvatarDialog()
    state.selectedFile.value = new File(['x'], 'a.png')

    await state.addAvatar()

    expect(ElMessage.warning).toHaveBeenCalledWith('请填写服装描述')
    expect(uploadCharacterAvatar).not.toHaveBeenCalled()
  })

  it('上传立绘成功后关闭抽屉、清空草稿并刷新', async () => {
    vi.mocked(uploadCharacterAvatar).mockResolvedValue({ message: 'ok', avatar_id: 20 })
    const state = useProjectCharacters(makeCtx())
    state.characters.value = [makeCharacter()]
    state.editCharacter(makeCharacter())
    state.showAddAvatarDialog()
    state.newAvatar.value = { ...state.newAvatar.value, costume: '校服', is_default: true }
    state.selectedFile.value = new File(['x'], 'a.png')

    await state.addAvatar()

    expect(uploadCharacterAvatar).toHaveBeenCalledWith(
      expect.any(File), 7, 1, '正常', '校服', true,
    )
    expect(state.avatarDialogVisible.value).toBe(false)
    expect(state.characterDrawerVisible.value).toBe(false)
    expect(state.selectedFile.value).toBeNull()
    expect(state.newAvatar.value.costume).toBe('')
    expect(getCharacters).toHaveBeenCalled()
  })

  it('上传立绘失败时提示重试', async () => {
    vi.mocked(uploadCharacterAvatar).mockRejectedValue(new Error('413'))
    const state = useProjectCharacters(makeCtx())
    state.editCharacter(makeCharacter())
    state.showAddAvatarDialog()
    state.newAvatar.value = { ...state.newAvatar.value, costume: '校服' }
    state.selectedFile.value = new File(['x'], 'a.png')

    await state.addAvatar()

    expect(ElMessage.error).toHaveBeenCalledWith('立绘上传失败，请重试')
    expect(state.avatarDialogVisible.value).toBe(true)
  })

  it('已是默认立绘时给出提示且不重复请求', async () => {
    const state = useProjectCharacters(makeCtx())

    await state.setDefaultAvatar(makeAvatar({ is_default: true }))

    expect(ElMessage.warning).toHaveBeenCalledWith('已为默认立绘')
    expect(updateCharacterAvatar).not.toHaveBeenCalled()
  })

  it('设为默认立绘时落库并刷新', async () => {
    vi.mocked(updateCharacterAvatar).mockResolvedValue(makeAvatar())
    vi.mocked(getCharacters).mockResolvedValue([makeCharacter()])
    vi.mocked(getCharacterAvatarsBatch).mockResolvedValue([makeAvatar({ avatar_id: 12, is_default: true })])
    const state = useProjectCharacters(makeCtx())
    state.characters.value = [makeCharacter()]
    state.characterAvatars.value = [makeAvatar(), makeAvatar({ avatar_id: 12 })]

    await state.setDefaultAvatar(state.characterAvatars.value[1])

    expect(updateCharacterAvatar).toHaveBeenCalledWith({ avatar_id: 12 })
    expect(state.characterAvatars.value.filter(a => a.is_default).map(a => a.avatar_id)).toEqual([12])
    expect(ElMessage.success).toHaveBeenCalledWith('默认立绘设置成功')
  })

  it('删除立绘后清空选中项并刷新', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
    vi.mocked(deleteCharacterAvatar).mockResolvedValue(undefined)
    const state = useProjectCharacters(makeCtx())
    state.characters.value = [makeCharacter()]
    state.selectedAvatar.value = makeAvatar()

    await state.deleteAvatar(11)

    expect(deleteCharacterAvatar).toHaveBeenCalledWith(11)
    expect(state.selectedAvatar.value).toBeNull()
    expect(getCharacters).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('立绘删除成功')
  })

  it('参数表按对象键值双向映射', () => {
    const state = useProjectCharacters(makeCtx())
    state.editCharacter(makeCharacter({ settings: { 好感度: 3 } }))

    expect(state.settingsArray.value).toEqual([{ key: '好感度', value: 3 }])

    state.settingsArray.value = [{ key: '好感度', value: 5 }, { key: 'param_1', value: 'x' }]

    expect(state.currentCharacter.value?.settings).toEqual({ 好感度: 5, param_1: 'x' })
  })

  it('添加参数用最小未占用键名，删除参数按行键移除', async () => {
    vi.useFakeTimers()
    vi.mocked(updateCharacter).mockResolvedValue(makeCharacter())
    const state = useProjectCharacters(makeCtx())
    state.editCharacter(makeCharacter({ settings: { param_1: '' } }))

    state.addSetting()
    expect(state.currentCharacter.value?.settings).toEqual({ param_1: '', param_2: '' })

    state.removeSetting(0)
    expect(state.currentCharacter.value?.settings).toEqual({ param_2: '' })

    await vi.advanceTimersByTimeAsync(600)
    expect(updateCharacter).toHaveBeenCalledTimes(1)
  })

  it('打开参数设置可切换目标角色，不传时沿用当前角色', () => {
    const state = useProjectCharacters(makeCtx())

    state.showSettingsDialog(makeCharacter({ character_id: 9, settings: { 好感度: 3 } }))

    expect(state.settingsDialogVisible.value).toBe(true)
    expect(state.currentCharacter.value?.character_id).toBe(9)
    expect(state.settingsArray.value).toEqual([{ key: '好感度', value: 3 }])

    state.settingsDialogVisible.value = false
    state.showSettingsDialog()

    expect(state.settingsDialogVisible.value).toBe(true)
    expect(state.currentCharacter.value?.character_id).toBe(9)
  })

  it('重命名参数与改值写回 settings 并合并为一次落库', async () => {
    vi.useFakeTimers()
    vi.mocked(updateCharacter).mockResolvedValue(makeCharacter())
    const state = useProjectCharacters(makeCtx())
    state.editCharacter(makeCharacter({ settings: { 好感度: 3 } }))

    state.renameSetting(0, ' 好感 ')
    state.updateSettingValue(0, 8)
    await vi.advanceTimersByTimeAsync(600)

    expect(state.currentCharacter.value?.settings).toEqual({ 好感: 8 })
    expect(updateCharacter).toHaveBeenCalledTimes(1)
  })

  it('重命名参数拒绝空值、同名与越界下标', () => {
    const state = useProjectCharacters(makeCtx())
    state.editCharacter(makeCharacter({ settings: { a: 1, b: 2 } }))

    state.renameSetting(0, '   ')
    expect(state.currentCharacter.value?.settings).toEqual({ a: 1, b: 2 })

    state.renameSetting(0, 'b')
    expect(state.currentCharacter.value?.settings).toEqual({ a: 1, b: 2 })
    expect(ElMessage.warning).toHaveBeenCalledWith('参数名「b」已存在')

    state.updateSettingValue(5, 'x')
    state.renameSetting(5, 'c')
    expect(state.currentCharacter.value?.settings).toEqual({ a: 1, b: 2 })
  })

  it('参数改动 600ms 后自动落库一次', async () => {
    vi.useFakeTimers()
    vi.mocked(updateCharacter).mockResolvedValue(makeCharacter())
    const state = useProjectCharacters(makeCtx())
    state.editCharacter(makeCharacter())

    state.updateSettings()
    state.updateSettings()
    await vi.advanceTimersByTimeAsync(600)

    expect(updateCharacter).toHaveBeenCalledTimes(1)
  })

  it('dispose 后参数保存定时器不再触发落库', async () => {
    vi.useFakeTimers()
    vi.mocked(updateCharacter).mockResolvedValue(makeCharacter())
    const state = useProjectCharacters(makeCtx())
    state.editCharacter(makeCharacter())

    state.updateSettings()
    state.dispose()
    await vi.advanceTimersByTimeAsync(600)

    expect(updateCharacter).not.toHaveBeenCalled()
  })

  it('头像地址按角色字段与默认立绘回退', () => {
    const state = useProjectCharacters(makeCtx())
    state.characterAvatars.value = [makeAvatar({ is_default: true })]

    expect(state.getAvatarUrl(makeCharacter())).toBe('http://api.test/uploads/avatar/lin.jpg')
    expect(state.getAvatarUrl(makeCharacter({ avatar_url: '/b.png' }))).toBe('http://api.test/b.png')
  })

  it('立绘加载失败只回退一次，避免循环报错', () => {
    const state = useProjectCharacters(makeCtx())
    const img = document.createElement('img')
    const event = { target: img } as unknown as Event

    state.onAvatarImgError(event)
    expect(img.src.endsWith('/default.jpg')).toBe(true)

    img.dataset.fallbackApplied = '1'
    img.src = '/broken.png'
    state.onAvatarImgError(event)
    expect(img.getAttribute('src')).toBe('/broken.png')
  })
})
