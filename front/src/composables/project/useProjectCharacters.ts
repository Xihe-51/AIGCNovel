/**
 * 角色库：角色列表与搜索、角色抽屉表单、立绘上传/默认立绘/删除、参数设置自动落库。
 *
 * 只与角色、立绘、角色名译文三类接口打交道；立绘抠图与差分层由 useProjectCutout /
 * ProjectLayerDialog 各自负责，这里只提供它们需要的列表引用与刷新入口。
 */
import { computed, getCurrentInstance, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
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
import type { AvatarType, Character, CharacterAvatar } from '@/api/character'
import { saveCharacterNameTranslation, TRANSLATION_LANGUAGES } from '@/api/translation'
import { BASE_URL } from '@/utils/request'
import defaultAvatarImg from '@/assets/default.jpg'
import { formatErrorMessage } from '@/utils/errorMessage'
import { confirmAction } from '@/utils/confirm'

/** 立绘表情类型：与后端 avatar_type 取值保持一致 */
export const avatarTypes: AvatarType[] = ['正常', '高兴', '生气', '悲伤', '惊讶', '其他']

/** 搜索框同时匹配姓名与描述；关键词为空表示不过滤 */
export function filterCharacters(list: Character[], keyword: string): Character[] {
  const query = keyword.trim()
  if (!query) return list
  return list.filter(character =>
    character.name.includes(query) || Boolean(character.description?.includes(query)),
  )
}

/** 新参数名取最小的未占用 param_N，避免删除参数后与已有参数重名 */
export function nextSettingKey(settings: Record<string, any> | undefined): string {
  const used = new Set(Object.keys(settings || {}))
  let index = 1
  while (used.has(`param_${index}`)) index += 1
  return `param_${index}`
}

/** 头像列：角色自带头像 > 默认立绘 > 占位图 */
export function resolveAvatarUrl(
  character: Pick<Character, 'character_id' | 'avatar_url'>,
  avatars: Pick<CharacterAvatar, 'character_id' | 'is_default' | 'image_url'>[],
  fallback: string,
): string {
  if (character.avatar_url) return BASE_URL + character.avatar_url
  const primary = avatars.find(avatar => avatar.character_id === character.character_id && avatar.is_default)
  if (primary?.image_url) return BASE_URL + primary.image_url
  return fallback
}

/** 新建角色的空表单：character_id 为 0 表示尚未落库 */
export function emptyCharacter(projectId: number): Character {
  return {
    character_id: 0,
    project_id: projectId,
    name: '',
    is_main: false,
    created_at: new Date().toISOString(),
  }
}

/** 添加立绘对话框的初始草稿 */
export function emptyAvatar(): Partial<CharacterAvatar> {
  return { avatar_type: '正常', costume: '', is_default: false }
}

export interface ProjectCharactersContext {
  projectId: () => number
}

export function useProjectCharacters(ctx: ProjectCharactersContext) {
  const characters = ref<Character[]>([])
  const characterAvatars = ref<CharacterAvatar[]>([])
  const currentCharacterAvatars = ref<CharacterAvatar[]>([])
  const characterSearch = ref('')
  const loadingCharacters = ref(false)

  /** 角色抽屉：isAdd 为真时是新建，抽屉内隐藏立绘与译名区 */
  const isAdd = ref(false)
  const characterDrawerVisible = ref(false)
  const currentCharacter = ref<Character | null>(null)
  const characterNameTranslations = ref<Record<string, string>>({})

  const avatarDialogVisible = ref(false)
  const newAvatar = ref<Partial<CharacterAvatar>>(emptyAvatar())
  const selectedFile = ref<File | null>(null)
  const previewImageUrl = ref('')
  const selectedAvatar = ref<CharacterAvatar | null>(null)

  const layerDialogVisible = ref(false)
  const layerTargetAvatar = ref<CharacterAvatar | null>(null)

  const settingsDialogVisible = ref(false)

  const filteredCharacters = computed(() => filterCharacters(characters.value, characterSearch.value))
  const totalAvatars = computed(() => characterAvatars.value.length)

  const settingsArray = computed({
    get(): { key: string; value: any }[] {
      const settings = currentCharacter.value?.settings
      if (!settings) return []
      return Object.entries(settings).map(([key, value]) => ({ key, value }))
    },
    set(rows: { key: string; value: any }[]) {
      if (!currentCharacter.value) return
      const settings: Record<string, any> = {}
      rows.forEach(row => { settings[row.key] = row.value })
      currentCharacter.value.settings = settings
    },
  })

  const fetchCharacterAvatars = async () => {
    const characterIds = characters.value.map(character => character.character_id)
    if (!characterIds.length) {
      characterAvatars.value = []
      return
    }
    try {
      characterAvatars.value = await getCharacterAvatarsBatch(characterIds)
    } catch (e) {
      console.warn('读取角色立绘失败:', e)
    }
  }

  const fetchCharacters = async (projectId: number = ctx.projectId()) => {
    loadingCharacters.value = true
    try {
      characters.value = await getCharacters(projectId)
      await fetchCharacterAvatars()
    } finally {
      loadingCharacters.value = false
    }
  }

  const syncCurrentCharacterAvatars = () => {
    if (!currentCharacter.value || isAdd.value) return
    const characterId = currentCharacter.value.character_id
    currentCharacterAvatars.value = characterAvatars.value.filter(avatar => avatar.character_id === characterId)
    if (layerTargetAvatar.value) {
      const avatarId = layerTargetAvatar.value.avatar_id
      layerTargetAvatar.value = currentCharacterAvatars.value.find(avatar => avatar.avatar_id === avatarId) || null
    }
  }

  /** 立绘增删改后重新拉角色（头像列跟着变）并同步抽屉里的立绘网格 */
  const refreshAfterAvatarChange = async () => {
    await fetchCharacters()
    syncCurrentCharacterAvatars()
  }

  const showAddCharacterDialog = () => {
    currentCharacter.value = emptyCharacter(ctx.projectId())
    characterNameTranslations.value = {}
    isAdd.value = true
    currentCharacterAvatars.value = []
    characterDrawerVisible.value = true
  }

  const editCharacter = (character: Character) => {
    currentCharacter.value = { ...character }
    characterNameTranslations.value = { ...(character.name_translations || {}) }
    isAdd.value = false
    characterDrawerVisible.value = true
    syncCurrentCharacterAvatars()
  }

  const createNewCharacter = async (character: Character) => {
    try {
      const payload: Omit<Character, 'character_id' | 'created_at'> = {
        project_id: character.project_id,
        name: character.name,
        name_translations: character.name_translations,
        avatar_url: character.avatar_url,
        age: character.age,
        description: character.description,
        settings: character.settings,
        is_main: character.is_main,
        voice_type: character.voice_type,
      }
      await createCharacter(payload)
      ElMessage.success('角色添加成功')
      characterDrawerVisible.value = false
      await fetchCharacters()
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('角色添加失败', e))
    }
  }

  const updateExistingCharacter = async (character: Character) => {
    try {
      const updated = await updateCharacter({ ...character })
      // 角色名译文：逐语言保存，空值由后端删除
      const translations: Record<string, string> = {}
      for (const lang of TRANSLATION_LANGUAGES) {
        const name = String(characterNameTranslations.value[lang.code] || '').trim()
        const saved = await saveCharacterNameTranslation(character.character_id, lang.code, name)
        if (saved?.name) translations[lang.code] = saved.name
      }
      const merged: Character = { ...(updated || character), name_translations: translations }
      const index = characters.value.findIndex(item => item.character_id === character.character_id)
      if (index === -1) characters.value.push(merged)
      else characters.value[index] = merged
      currentCharacter.value = { ...merged }
      ElMessage.success('角色更新成功')
      characterDrawerVisible.value = false
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('角色更新失败', e))
    }
  }

  const saveCharacter = async () => {
    const character = currentCharacter.value
    if (!character) return
    if (character.character_id === 0) await createNewCharacter(character)
    else await updateExistingCharacter(character)
  }

  const deleteCharacter = async (characterId: number) => {
    const confirmed = await confirmAction(
      '确定要删除这个角色吗？所有相关立绘和对话也将被删除。',
      { title: '警告' },
    )
    if (!confirmed) return
    try {
      await deleteCharacter_by_Id(characterId)
      characters.value = characters.value.filter(item => item.character_id !== characterId)
      characterAvatars.value = characterAvatars.value.filter(avatar => avatar.character_id !== characterId)
      ElMessage.success('角色删除成功')
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('角色删除失败', e))
    }
  }

  const showAddAvatarDialog = () => {
    if (!currentCharacter.value) return
    newAvatar.value = { ...emptyAvatar(), character_id: currentCharacter.value.character_id }
    avatarDialogVisible.value = true
  }

  const handleChange = (file: UploadFile) => {
    const raw = file.raw
    if (!raw) return
    if (previewImageUrl.value) URL.revokeObjectURL(previewImageUrl.value)
    selectedFile.value = raw
    previewImageUrl.value = URL.createObjectURL(raw)
  }

  const resetAvatarDraft = () => {
    if (previewImageUrl.value) URL.revokeObjectURL(previewImageUrl.value)
    previewImageUrl.value = ''
    selectedFile.value = null
    newAvatar.value = emptyAvatar()
  }

  const addAvatar = async () => {
    const character = currentCharacter.value
    const file = selectedFile.value
    if (!character || !file) return
    if (!newAvatar.value.costume) {
      ElMessage.warning('请填写服装描述')
      return
    }
    try {
      await uploadCharacterAvatar(
        file,
        character.project_id,
        character.character_id,
        (newAvatar.value.avatar_type as AvatarType) || '正常',
        newAvatar.value.costume,
        Boolean(newAvatar.value.is_default),
      )
      ElMessage.success('立绘添加成功')
      avatarDialogVisible.value = false
      characterDrawerVisible.value = false
      resetAvatarDraft()
      await refreshAfterAvatarChange()
    } catch {
      ElMessage.error('立绘上传失败，请重试')
    }
  }

  const selectAvatar = (avatar: CharacterAvatar) => {
    selectedAvatar.value = avatar
  }

  const setDefaultAvatar = async (avatar: CharacterAvatar) => {
    if (avatar.is_default) {
      ElMessage.warning('已为默认立绘')
      return
    }
    characterAvatars.value.forEach(item => {
      if (item.character_id === avatar.character_id) item.is_default = item.avatar_id === avatar.avatar_id
    })
    try {
      await updateCharacterAvatar({ avatar_id: avatar.avatar_id })
      ElMessage.success('默认立绘设置成功')
      await refreshAfterAvatarChange()
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('设置默认立绘失败', e))
      await fetchCharacterAvatars()
    }
  }

  const deleteAvatar = async (avatarId: number) => {
    const confirmed = await confirmAction('确定要删除这个立绘吗？', { title: '警告' })
    if (!confirmed) return
    try {
      await deleteCharacterAvatar(avatarId)
      if (selectedAvatar.value?.avatar_id === avatarId) selectedAvatar.value = null
      if (layerTargetAvatar.value?.avatar_id === avatarId) layerTargetAvatar.value = null
      await refreshAfterAvatarChange()
      ElMessage.success('立绘删除成功')
    } catch (e: any) {
      ElMessage.error(formatErrorMessage('立绘删除失败', e))
    }
  }

  /** 差分层增删后重新拉立绘，并把弹窗目标指到刷新后的对象 */
  const handleLayerChanged = async () => {
    await fetchCharacterAvatars()
    syncCurrentCharacterAvatars()
  }

  const openLayerDialog = (avatar: CharacterAvatar) => {
    layerTargetAvatar.value = avatar
    layerDialogVisible.value = true
  }

  const getAvatarUrl = (character: Pick<Character, 'character_id' | 'avatar_url'>) =>
    resolveAvatarUrl(character, characterAvatars.value, defaultAvatarImg)

  /** 立绘文件已丢失时退回默认头像，不再显示裂图 */
  const onAvatarImgError = (e: Event) => {
    const el = e.target as HTMLImageElement
    if (!el || el.dataset.fallbackApplied) return
    el.dataset.fallbackApplied = '1'
    el.src = defaultAvatarImg
  }

  // 参数设置改动后自动落库（600ms 防抖）
  let settingsSaveTimer: ReturnType<typeof setTimeout> | null = null
  const updateSettings = () => {
    const character = currentCharacter.value
    if (!character || !character.character_id) return
    if (settingsSaveTimer) clearTimeout(settingsSaveTimer)
    settingsSaveTimer = setTimeout(async () => {
      try {
        await updateCharacter({ ...character })
      } catch (e) {
        console.error('保存角色参数失败:', e)
        ElMessage.error('参数保存失败，请稍后重试')
      }
    }, 600)
  }

  /** 打开参数设置：传角色即切换编辑目标，不传则沿用当前抽屉里的角色 */
  const showSettingsDialog = (character?: Character) => {
    if (character) {
      currentCharacter.value = { ...character, settings: { ...(character.settings || {}) } }
    }
    if (!currentCharacter.value) return
    settingsDialogVisible.value = true
  }

  /** 参数表行是 computed 的临时快照，改动必须整表回写才能落到 settings 上 */
  const commitSettingsRow = (index: number, patch: Partial<{ key: string; value: any }>) => {
    const rows = settingsArray.value.map(row => ({ ...row }))
    const target = rows[index]
    if (!target) return
    if (patch.key !== undefined) target.key = patch.key
    if (patch.value !== undefined) target.value = patch.value
    settingsArray.value = rows
    updateSettings()
  }

  const renameSetting = (index: number, key: string) => {
    const rows = settingsArray.value
    const target = rows[index]
    if (!target) return
    const next = String(key ?? '').trim()
    if (!next || next === target.key) return
    if (rows.some((row, i) => i !== index && row.key === next)) {
      ElMessage.warning(`参数名「${next}」已存在`)
      return
    }
    commitSettingsRow(index, { key: next })
  }

  const updateSettingValue = (index: number, value: any) => {
    if (!settingsArray.value[index]) return
    commitSettingsRow(index, { value })
  }

  const addSetting = () => {
    if (!currentCharacter.value) return
    if (!currentCharacter.value.settings) currentCharacter.value.settings = {}
    currentCharacter.value.settings[nextSettingKey(currentCharacter.value.settings)] = ''
    updateSettings()
  }

  const removeSetting = (index: number) => {
    const settings = currentCharacter.value?.settings
    if (!settings) return
    const row = settingsArray.value[index]
    if (!row) return
    delete settings[row.key]
    updateSettings()
  }

  const dispose = () => {
    if (settingsSaveTimer) {
      clearTimeout(settingsSaveTimer)
      settingsSaveTimer = null
    }
    if (previewImageUrl.value) URL.revokeObjectURL(previewImageUrl.value)
  }

  // 单测里没有组件实例，只在真实组件 setup 中挂卸载清理
  if (getCurrentInstance()) onUnmounted(dispose)

  return {
    avatarTypes,
    characters,
    characterAvatars,
    currentCharacterAvatars,
    characterSearch,
    loadingCharacters,
    filteredCharacters,
    totalAvatars,
    isAdd,
    characterDrawerVisible,
    currentCharacter,
    characterNameTranslations,
    avatarDialogVisible,
    newAvatar,
    selectedFile,
    previewImageUrl,
    selectedAvatar,
    layerDialogVisible,
    layerTargetAvatar,
    settingsDialogVisible,
    settingsArray,
    fetchCharacters,
    fetchCharacterAvatars,
    syncCurrentCharacterAvatars,
    showAddCharacterDialog,
    editCharacter,
    saveCharacter,
    deleteCharacter,
    showAddAvatarDialog,
    handleChange,
    addAvatar,
    selectAvatar,
    setDefaultAvatar,
    deleteAvatar,
    openLayerDialog,
    handleLayerChanged,
    getAvatarUrl,
    onAvatarImgError,
    showSettingsDialog,
    addSetting,
    removeSetting,
    renameSetting,
    updateSettingValue,
    updateSettings,
    dispose,
  }
}
