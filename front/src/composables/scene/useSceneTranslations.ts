/**
 * 场景编辑器的三处译文入口：逐句台词、场景标题/描述、选项文案。
 *
 * 只负责弹窗状态与保存调用；译文内容仍写回页面对应的 dialogue / scene / option 对象。
 */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  saveContentTranslation,
  saveSceneTranslation,
  saveBranchTranslation,
  TRANSLATION_LANGUAGES,
} from '@/api/translation'
import { countTranslations, languagesOfTranslations } from '@/utils/scene'

export interface SceneTranslationsContext {
  scene: Ref<any>
}

const errorMessage = (error: any) =>
  error?.response?.data?.message || error?.message || '未知错误'

export function useSceneTranslations(ctx: SceneTranslationsContext) {
  // ===== 逐句译文 =====
  const translationDialogVisible = ref(false)
  const translationSaving = ref(false)
  const translationTarget = ref<any>(null)

  const translationCount = (dialogue: any) => countTranslations(dialogue)

  const translatedLanguages = (dialogue: any) => languagesOfTranslations(dialogue, TRANSLATION_LANGUAGES)

  const openTranslationDialog = (dialogue: any) => {
    if (!dialogue || !dialogue.content_id) {
      ElMessage.warning('请先保存这条台词，再添加译文')
      return
    }
    translationTarget.value = dialogue
    translationDialogVisible.value = true
  }

  const saveTranslation = async ({ lang, text }: { lang: string; text: string }) => {
    if (!translationTarget.value?.content_id) return
    translationSaving.value = true
    try {
      const saved: any = await saveContentTranslation(
        Number(translationTarget.value.content_id),
        lang,
        text
      )
      const next = { ...(translationTarget.value.translations || {}) }
      if (saved?.text) next[saved.language] = saved.text
      else delete next[lang]
      translationTarget.value.translations = next
      translationDialogVisible.value = false
      ElMessage.success(saved?.text ? '译文已保存' : '译文已清除')
    } catch (error) {
      console.error('保存译文失败:', error)
      ElMessage.error('保存译文失败：' + errorMessage(error))
    } finally {
      translationSaving.value = false
    }
  }

  // ===== 场景标题/描述译文 =====
  const sceneTransVisible = ref(false)
  const sceneTransSaving = ref(false)

  const sceneTranslationCount = computed(() => {
    return Object.keys(ctx.scene.value.translations || {}).length
  })

  const translatedSceneLanguages = computed(() => {
    const map = ctx.scene.value.translations || {}
    return TRANSLATION_LANGUAGES.filter(lang => !!map[lang.code])
  })

  const openSceneTranslationDialog = () => {
    if (!ctx.scene.value.scene_id) {
      ElMessage.warning('场景尚未加载完成')
      return
    }
    sceneTransVisible.value = true
  }

  const saveSceneTranslations = async ({ lang, title, description }: { lang: string; title: string; description: string }) => {
    if (!ctx.scene.value.scene_id) return
    sceneTransSaving.value = true
    try {
      const saved: any = await saveSceneTranslation(
        Number(ctx.scene.value.scene_id),
        lang,
        title,
        description
      )
      const next = { ...(ctx.scene.value.translations || {}) }
      if (saved?.title || saved?.description) {
        next[saved.language] = { title: saved.title || '', description: saved.description || '' }
      } else {
        delete next[lang]
      }
      ctx.scene.value.translations = next
      sceneTransVisible.value = false
      ElMessage.success(saved?.title || saved?.description ? '场景译文已保存' : '场景译文已清除')
    } catch (error) {
      console.error('保存场景译文失败:', error)
      ElMessage.error('保存场景译文失败：' + errorMessage(error))
    } finally {
      sceneTransSaving.value = false
    }
  }

  // ===== 选项译文 =====
  const choiceTransVisible = ref(false)
  const choiceTransSaving = ref(false)
  const choiceTransTarget = ref<any>(null)

  const choiceTranslationCount = (opt: any) => {
    return opt && opt.translations ? Object.keys(opt.translations).length : 0
  }

  const openChoiceTranslationDialog = (opt: any) => {
    if (!opt?.path_id) {
      ElMessage.warning('请先保存这条选择节点的选项，再添加译文')
      return
    }
    choiceTransTarget.value = opt
    choiceTransVisible.value = true
  }

  const saveChoiceTranslation = async ({ lang, text }: { lang: string; text: string }) => {
    if (!choiceTransTarget.value?.path_id) return
    choiceTransSaving.value = true
    try {
      const saved: any = await saveBranchTranslation(
        Number(choiceTransTarget.value.path_id),
        lang,
        text
      )
      const next = { ...(choiceTransTarget.value.translations || {}) }
      if (saved?.text) next[saved.language] = saved.text
      else delete next[lang]
      choiceTransTarget.value.translations = next
      choiceTransVisible.value = false
      ElMessage.success(saved?.text ? '选项译文已保存' : '选项译文已清除')
    } catch (error) {
      console.error('保存选项译文失败:', error)
      ElMessage.error('保存选项译文失败：' + errorMessage(error))
    } finally {
      choiceTransSaving.value = false
    }
  }

  return {
    translationDialogVisible,
    translationSaving,
    translationTarget,
    translationCount,
    translatedLanguages,
    openTranslationDialog,
    saveTranslation,
    sceneTransVisible,
    sceneTransSaving,
    sceneTranslationCount,
    translatedSceneLanguages,
    openSceneTranslationDialog,
    saveSceneTranslations,
    choiceTransVisible,
    choiceTransSaving,
    choiceTransTarget,
    choiceTranslationCount,
    openChoiceTranslationDialog,
    saveChoiceTranslation,
  }
}
