/**
 * 演出模式：作者预览态下直接改写当前台词 / 立绘 / 场景背景与 BGM，保存后热更新画面。
 *
 * 播放位置、场景列表、台词索引等外部状态通过适配器注入，composable 只负责
 * 表单快照、脏字段比对与保存编排，不直接持有剧情数据。
 */
import { nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { formatErrorMessage } from '@/utils/errorMessage'

/** 演出表单字段：台词 / 差分立绘 / 场景背景 / 场景 BGM */
export interface PlayerPerformContext {
  /** 作者预览态才允许演出编辑 */
  canPerform: () => boolean
  /** 当前台词 */
  getDialogue: () => any
  /** 当前场景 */
  getScene: () => any
  /** 按场景 ID 索引的台词表 */
  getDialogues: () => Record<string, any[]>
  setDialogues: (value: Record<string, any[]>) => void
  /** 完整回想列表 */
  getHistory: () => any[]
  setHistory: (value: any[]) => void
  /** 按台词 ID 索引的演出指令表 */
  getDirectives: () => Record<string | number, any[]>
  /** 场景列表 */
  getScenes: () => any[]
  setScenes: (value: any[]) => void
  /** 当前 BGM 播放器 */
  getBackgroundMusic: () => HTMLAudioElement | null
  isPlaying: () => boolean
  fadeBgmTo: (volume: number, duration: number) => void
  bgmTargetVolume: () => number
  /** 保留已读标记，避免热更新触发「跳过已读」 */
  markSkipRestoredLine: () => void
  startTyping: () => void
  saveDialogues: (payload: any) => Promise<any>
  updateScene: (sceneId: number, patch: any) => Promise<any>
  projectId: () => number
}

export function usePlayerPerform(ctx: PlayerPerformContext) {
  const performMode = ref(false)
  const performSaving = ref(false)
  const performText = ref('')
  const performAvatarId = ref('')
  const performBackground = ref('')
  const performMusic = ref('')
  const performStatus = ref('')

  const syncPerformForm = () => {
    const dlg = ctx.getDialogue()
    if (!dlg) return
    performText.value = dlg.content_text || ''
    performAvatarId.value = dlg.avatar_id ? String(dlg.avatar_id) : ''
    performBackground.value = ctx.getScene()?.background_url || ''
    performMusic.value = ctx.getScene()?.music_url || ''
    performStatus.value = ''
  }

  const togglePerformMode = () => {
    if (!ctx.canPerform()) return
    performMode.value = !performMode.value
    if (performMode.value) syncPerformForm()
  }

  // 场景 BGM 改动后立即重载：若当前节点有 music 演出指令，以指令为准不覆盖
  const reloadSceneMusic = () => {
    const audio = ctx.getBackgroundMusic()
    if (!audio) return
    if (!ctx.getScene()?.music_url) {
      audio.pause()
      audio.currentTime = 0
      return
    }
    if (!ctx.isPlaying()) return
    nextTick(() => {
      audio.volume = 0
      audio.play().then(() => ctx.fadeBgmTo(ctx.bgmTargetVolume(), 600)).catch(() => {})
    })
  }

  const savePerformEdit = async () => {
    const dlg = ctx.getDialogue()
    const scene = ctx.getScene()
    if (!dlg || !scene || performSaving.value) return
    const text = performText.value.trim()
    if (!text) {
      ElMessage.warning('台词不能为空')
      return
    }

    performSaving.value = true
    try {
      const updated = await ctx.saveDialogues({
        ...dlg,
        project_id: ctx.projectId(),
        scene_id: Number(scene.scene_id),
        content_text: text,
        avatar_id: dlg.content_type === '对话'
          ? (Number(performAvatarId.value) || null)
          : (dlg.avatar_id || null),
      })

      // 热更新当前场景的台词列表，不刷新页面
      const dialogues = ctx.getDialogues()
      const list = dialogues[scene.scene_id] || []
      const idx = list.findIndex(d => Number(d.content_id) === Number(dlg.content_id))
      if (idx >= 0) {
        const next = [...list]
        next[idx] = { ...next[idx], ...(updated || {}), content_text: text }
        ctx.setDialogues({ ...dialogues, [scene.scene_id]: next })
      }
      ctx.setHistory(ctx.getHistory().map(h =>
        Number(h.content_id) === Number(dlg.content_id) ? { ...h, content_text: text } : h
      ))

      // 场景背景 / BGM 按需写入
      const scenePatch: Record<string, any> = {}
      const bg = performBackground.value.trim()
      const music = performMusic.value.trim()
      if (bg !== (scene.background_url || '')) scenePatch.background_url = bg
      if (music !== (scene.music_url || '')) scenePatch.music_url = music
      if (Object.keys(scenePatch).length) {
        const savedScene = await ctx.updateScene(Number(scene.scene_id), scenePatch)
        const scenes = ctx.getScenes()
        const si = scenes.findIndex(s => Number(s.scene_id) === Number(scene.scene_id))
        if (si >= 0) {
          const next = [...scenes]
          next[si] = { ...next[si], ...scenePatch, ...(savedScene || {}) }
          ctx.setScenes(next)
        }
        if ('music_url' in scenePatch) {
          const hasMusicDirective = (ctx.getDirectives()[dlg.content_id] || [])
            .some(d => d.directive_type === 'music')
          if (!hasMusicDirective) reloadSceneMusic()
        }
      }

      performStatus.value = '已保存 · ' + new Date().toLocaleTimeString()
      // 编辑器里改完台词后立刻按新文本重新演出；不触发「跳过已读」
      ctx.markSkipRestoredLine()
      ctx.startTyping()
      ElMessage.success('已保存并热更新当前画面')
    } catch (e: any) {
      console.error('演出模式保存失败:', e)
      ElMessage.error(formatErrorMessage('保存失败', e))
    } finally {
      performSaving.value = false
    }
  }

  // 面板打开时跟随场景/节点切换同步表单
  // 用「多个 getter」而非「返回数组的 getter」：后者每次求值都会生成新数组，
  // 保存时 setDialogues 引发的任意依赖变化都会误触发，把刚写入的保存状态清空。
  watch(
    [() => ctx.getDialogue()?.content_id, () => ctx.getScene()?.scene_id],
    () => {
      if (performMode.value && ctx.canPerform()) syncPerformForm()
    }
  )

  return {
    performMode,
    performSaving,
    performText,
    performAvatarId,
    performBackground,
    performMusic,
    performStatus,
    syncPerformForm,
    togglePerformMode,
    reloadSceneMusic,
    savePerformEdit,
  }
}
