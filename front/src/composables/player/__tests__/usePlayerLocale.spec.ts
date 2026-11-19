import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { usePlayerLocale, pickTranslated, translationLanguage } from '../usePlayerLocale'

const createLocale = () => {
  const language = ref('zh-CN')
  const characters = ref<any[]>([])
  const scenes = ref<any[]>([])
  const branches = ref<any[]>([])
  const api = usePlayerLocale({
    getLanguage: () => language.value,
    getCharacters: () => characters.value,
    getScenes: () => scenes.value,
    getBranches: () => branches.value,
  })
  return { api, language, characters, scenes, branches }
}

describe('translationLanguage', () => {
  it('简体中文与空值不需要译文', () => {
    expect(translationLanguage('zh-CN')).toBe('')
    expect(translationLanguage('')).toBe('')
  })

  it('其他语言返回原语言码', () => {
    expect(translationLanguage('en-US')).toBe('en-US')
    expect(translationLanguage('ja-JP')).toBe('ja-JP')
  })
})

describe('pickTranslated', () => {
  it('有译文时返回译文', () => {
    expect(pickTranslated('Hello', '你好')).toBe('Hello')
  })

  it('译文为空白或缺失时回退原文', () => {
    expect(pickTranslated('   ', '你好')).toBe('你好')
    expect(pickTranslated(undefined, '你好')).toBe('你好')
    expect(pickTranslated(null, '你好')).toBe('你好')
  })

  it('译文与原文都为空时返回空串', () => {
    expect(pickTranslated('', '')).toBe('')
    expect(pickTranslated(undefined, undefined)).toBe('')
  })
})

describe('usePlayerLocale', () => {
  it('界面文案随语言切换，未知语言回退简体中文', () => {
    const { api, language } = createLocale()
    expect(api.t('common.confirm')).toBe('确定')

    language.value = 'xx-XX'
    expect(api.t('common.confirm')).toBe('确定')
  })

  it('界面文案支持占位符参数', () => {
    const { api } = createLocale()
    expect(api.t('common.confirm', { name: 'x' })).toBe('确定')
  })

  it('角色名在中文下用原名，空角色返回空串', () => {
    const { api } = createLocale()
    expect(api.localizedCharacterName({ name: '林瑶' })).toBe('林瑶')
    expect(api.localizedCharacterName(null)).toBe('')
  })

  it('角色名在非中文下优先译名，译名空白回退原名', () => {
    const { api, language } = createLocale()
    language.value = 'en-US'
    expect(api.localizedCharacterName({ name: '林瑶', name_translations: { 'en-US': 'Lin Yao' } })).toBe('Lin Yao')
    expect(api.localizedCharacterName({ name: '林瑶', name_translations: { 'en-US': '  ' } })).toBe('林瑶')
    expect(api.localizedCharacterName({ name: '林瑶' })).toBe('林瑶')
  })

  it('角色名映射按 character_id 输出当前语言名字', () => {
    const { api, language, characters } = createLocale()
    language.value = 'en-US'
    characters.value = [
      { character_id: 1, name: '林瑶', name_translations: { 'en-US': 'Lin Yao' } },
      { character_id: 2, name: '李暮尘' },
    ]
    expect(api.characterNames.value).toEqual({ 1: 'Lin Yao', 2: '李暮尘' })
  })

  it('台词文本优先译文，缺失时回退原文', () => {
    const { api, language } = createLocale()
    expect(api.localizedText(null)).toBe('')
    expect(api.localizedText({ content_text: '你来了' })).toBe('你来了')

    language.value = 'en-US'
    expect(api.localizedText({ content_text: '你来了', translations: { 'en-US': 'You came' } })).toBe('You came')
    expect(api.localizedText({ content_text: '你来了', translations: { 'en-US': '' } })).toBe('你来了')
    expect(api.localizedText({ content_text: '你来了' })).toBe('你来了')
  })

  it('场景标题译文会被 trim，标题缺失时回退原文', () => {
    const { api, language } = createLocale()
    expect(api.localizedSceneTitle(null)).toBe('')
    expect(api.localizedSceneTitle({ title: '序章' })).toBe('序章')

    language.value = 'en-US'
    expect(api.localizedSceneTitle({ title: '序章', translations: { 'en-US': { title: ' Prologue ' } } })).toBe('Prologue')
    expect(api.localizedSceneTitle({ title: '序章', translations: { 'en-US': { title: '  ' } } })).toBe('序章')
    expect(api.localizedSceneTitle({ title: '序章' })).toBe('序章')
  })

  it('按场景 ID 取标题时兼容数字与字符串 ID', () => {
    const { api, scenes } = createLocale()
    scenes.value = [{ scene_id: 3, title: '病房' }]
    expect(api.sceneTitleById(3)).toBe('病房')
    expect(api.sceneTitleById('3')).toBe('病房')
    expect(api.sceneTitleById(99)).toBe('')
  })

  it('选项文案优先译文，缺失时回退原文', () => {
    const { api, language } = createLocale()
    expect(api.localizedChoice(null)).toBe('')
    expect(api.localizedChoice({ choice_text: '逃跑' })).toBe('逃跑')

    language.value = 'en-US'
    expect(api.localizedChoice({ choice_text: '逃跑', translations: { 'en-US': 'Run away' } })).toBe('Run away')
    expect(api.localizedChoice({ choice_text: '逃跑' })).toBe('逃跑')
  })

  it('按分支 ID 取选项文案时兼容数字与字符串 ID', () => {
    const { api, branches } = createLocale()
    branches.value = [{ path_id: 7, choice_text: '留下' }]
    expect(api.choiceTextById(7)).toBe('留下')
    expect(api.choiceTextById('7')).toBe('留下')
    expect(api.choiceTextById(8)).toBe('')
  })

  it('回想场景名优先实时本地化，找不到时回退存档标题', () => {
    const { api, scenes } = createLocale()
    scenes.value = [{ scene_id: 2, title: '走廊' }]
    expect(api.historySceneTitle({ scene_id: 2, scene_title: '旧标题' })).toBe('走廊')
    expect(api.historySceneTitle({ scene_id: 99, scene_title: '旧标题' })).toBe('旧标题')
    expect(api.historySceneTitle({ scene_title: '旧标题' })).toBe('旧标题')
    expect(api.historySceneTitle(null)).toBe('')
  })

  it('回想选项优先按 path_id 本地化，找不到时回退存档文案', () => {
    const { api, branches } = createLocale()
    branches.value = [{ path_id: 5, choice_text: '回头' }]
    expect(api.historyChoiceText({ chosen_path_id: 5, chosen: '旧选项' })).toBe('回头')
    expect(api.historyChoiceText({ chosen_path_id: 99, chosen: '旧选项' })).toBe('旧选项')
    expect(api.historyChoiceText({ chosen: '旧选项' })).toBe('旧选项')
    expect(api.historyChoiceText(null)).toBe('')
  })
})
