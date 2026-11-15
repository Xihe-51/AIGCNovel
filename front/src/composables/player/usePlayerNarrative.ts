/**
 * 叙事位置与派生：当前场景 / 当前台词 / 富文本 / 回想展示模型。
 *
 * 这里的三个 watch 都只跟随「播放位置」：场景切换记到达埋点、BGM 曲目解锁、
 * 调试模式下节点记为已走。埋点、解锁与记录的实现通过注入拿到，
 * composable 只负责在正确时机触发，不关心上报与接口细节。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { parseRichText, renderRichHtml } from '@/utils/richText'

export interface PlayerNarrativeContext {
  /** 作品 id（解锁曲目用） */
  projectId: () => number
  /** 场景列表 */
  getScenes: () => any[]
  /** 场景 id → 台词列表 */
  getAllDialogues: () => Record<string, any[]>
  /** 回想内容 */
  getHistory: () => any[]
  setHistory: (value: any[]) => void
  getLoading: () => boolean
  getError: () => any
  getDebugMode: () => boolean
  /** 逐字显示屏已达长度（富文本按此截断） */
  getDisplayedLength: () => number
  localizedText: (dialogue: any) => string
  getCharacterName: (characterId: number) => string
  historySceneTitle: (dialogue: any) => string
  historyChoiceText: (dialogue: any) => string
  buildHistoryDialogues: (
    scenes: any[],
    dialogues: Record<string, any[]>,
    sceneIndex: number,
    dialogueIndex: number,
  ) => any[]
  logCurrentScene: () => void
  markVisitedContent: (contentId: any) => void
  sceneHasDialogues: (sceneId: any) => boolean
  unlockMusic: (projectId: number, url: string) => Promise<any>
}

export function usePlayerNarrative(ctx: PlayerNarrativeContext) {
  const currentSceneIndex = ref(0)
  const currentDialogueIndex = ref(0)

  const currentScene = computed(() => ctx.getScenes()[currentSceneIndex.value] || {})

  const currentSceneDialogues = computed(() => (
    ctx.getAllDialogues()[currentScene.value.scene_id] || []
  ))

  const currentDialogue = computed(() => currentSceneDialogues.value[currentDialogueIndex.value])

  // 纯文本用于逐字显示，HTML 只暴露到当前已显示的长度
  const richContent = computed(() => parseRichText(ctx.localizedText(currentDialogue.value)))
  const displayedHtml = computed(() => renderRichHtml(richContent.value, ctx.getDisplayedLength()))

  // 场景切换时记录到达埋点（首个场景由加载完成后单独补记）
  watch(currentSceneIndex, () => {
    if (ctx.getLoading() || ctx.getError()) return
    nextTick(() => ctx.logCurrentScene())
  })

  // 进入使用某首 BGM 的场景时解锁曲目，同一首只上报一次
  const unlockedMusic = ref<string[]>([])
  watch(
    () => currentScene.value.music_url,
    (url) => {
      if (!url || ctx.getLoading() || !ctx.sceneHasDialogues(currentScene.value.scene_id)) return
      if (unlockedMusic.value.includes(url)) return
      unlockedMusic.value.push(url)
      ctx.unlockMusic(ctx.projectId(), url).catch(() => { /* 非作者或未登录时忽略 */ })
    },
    { immediate: true }
  )

  // 调试覆盖率：当前节点一展示即记为已走
  watch(
    () => currentDialogue.value?.content_id,
    (id) => {
      if (ctx.getDebugMode() && id) ctx.markVisitedContent(id)
    },
    { immediate: true }
  )

  // 历史回想浮层的展示模型（文本 / 作者 / 场景标题在此定稿，浮层组件只负责渲染）
  const historyItemViews = computed(() => ctx.getHistory().map((dialogue, index) => ({
    key: index,
    sceneTitle: ctx.historySceneTitle(dialogue),
    character: ctx.getCharacterName(dialogue.character_id),
    text: ctx.localizedText(dialogue),
    chosen: !!dialogue.chosen,
    choiceText: dialogue.chosen ? ctx.historyChoiceText(dialogue) : '',
  })))

  // 按当前进度重建回想（读档 / 重开 / 章节跳转后调用）
  const initHistoryDialogues = () => {
    ctx.setHistory(ctx.buildHistoryDialogues(
      ctx.getScenes(),
      ctx.getAllDialogues(),
      currentSceneIndex.value,
      currentDialogueIndex.value,
    ))
  }

  return {
    currentSceneIndex,
    currentDialogueIndex,
    currentScene,
    currentSceneDialogues,
    currentDialogue,
    richContent,
    displayedHtml,
    historyItemViews,
    initHistoryDialogues,
  }
}
