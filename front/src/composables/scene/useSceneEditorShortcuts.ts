/**
 * 场景编辑器的全局快捷键与离场守卫。
 *
 * 这里只负责「窗口级事件的判定与分发」，具体动作由调用方注入：
 * 组件持有 dialogues / scene 的 dirty 状态与撤销栈，composable 不碰业务数据。
 *
 * 快捷键约定（与播放器一致）：
 * - Ctrl/Cmd + S：保存全部台词，输入框内也生效，避免误以为已保存；
 * - Ctrl/Cmd + Z：撤销，Shift + Ctrl/Cmd + Z 或 Ctrl/Cmd + Y：重做，输入框内交给浏览器原生行为。
 */
import { onBeforeUnmount, onMounted } from 'vue'

export type SceneEditorShortcut = 'save' | 'undo' | 'redo'

export interface SceneEditorShortcutEvent {
  key?: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  target?: any
}

/** 焦点是否落在可编辑控件里：输入框内的撤销/重做不接管。 */
export const isSceneEditorFieldTarget = (target: any): boolean => {
  const tag = (target && target.tagName) || ''
  return tag === 'INPUT' || tag === 'TEXTAREA' || !!(target && target.isContentEditable)
}

/** 键盘事件 → 编辑器动作；不匹配返回 null。纯函数，便于单测。 */
export const resolveSceneEditorShortcut = (ev: SceneEditorShortcutEvent): SceneEditorShortcut | null => {
  if (!ev || !(ev.ctrlKey || ev.metaKey)) return null
  const key = (ev.key || '').toLowerCase()
  if (key === 's') return 'save'
  if (isSceneEditorFieldTarget(ev.target)) return null
  if (key === 'z') return ev.shiftKey ? 'redo' : 'undo'
  if (key === 'y') return 'redo'
  return null
}

export interface SceneEditorShortcutsContext {
  /** 保存全部台词 */
  saveAll: () => void
  /** 保存中不重复触发保存 */
  isSaving: () => boolean
  undo: () => void
  redo: () => void
  /** 台词草稿是否有改动 */
  hasDialogueDirty: () => boolean
  /** 场景设置是否有改动 */
  hasSceneDirty: () => boolean
  /** 台词草稿落盘到本地 */
  saveDraft: () => void
  /** 场景设置静默保存 */
  persistScene: () => void
}

export function useSceneEditorShortcuts(ctx: SceneEditorShortcutsContext) {
  const onWindowKeydown = (ev: KeyboardEvent) => {
    const action = resolveSceneEditorShortcut(ev)
    if (!action) return
    ev.preventDefault()
    if (action === 'save') {
      if (!ctx.isSaving()) ctx.saveAll()
      return
    }
    if (action === 'undo') ctx.undo()
    else ctx.redo()
  }

  /** 刷新/关闭页面：场景设置优先落库，其次把台词草稿存到本地，避免静默丢失。 */
  const onBeforeUnload = (ev: BeforeUnloadEvent) => {
    if (ctx.hasSceneDirty()) {
      ctx.persistScene()
      ev.preventDefault()
      ev.returnValue = ''
      return
    }
    if (!ctx.hasDialogueDirty()) return
    ctx.saveDraft()
    ev.preventDefault()
    ev.returnValue = ''
  }

  onMounted(() => {
    window.addEventListener('keydown', onWindowKeydown)
    window.addEventListener('beforeunload', onBeforeUnload)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onWindowKeydown)
    window.removeEventListener('beforeunload', onBeforeUnload)
  })

  return { onWindowKeydown, onBeforeUnload }
}
