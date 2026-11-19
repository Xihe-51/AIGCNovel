import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  anyPanelVisible,
  closeFirstVisiblePanel,
  isEditableTarget,
  usePlayerKeyboard,
} from '@/composables/player/usePlayerKeyboard'

vi.mock('element-plus', () => ({
  ElMessage: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const createKeyboard = () => {
  const settings = ref(false)
  const gallery = ref(false)
  const history = ref(false)
  const ending = ref(false)

  const actions = {
    rollbackOneLine: vi.fn(),
    nextDialogue: vi.fn(),
    toggleHistoryDialogue: vi.fn(),
    toggleAutoPlay: vi.fn(),
  }
  const skipRead = ref(false)

  const api = usePlayerKeyboard({
    getEscPanels: () => [settings, gallery, history],
    getActivePanels: () => [settings, gallery, history, ending],
    ...actions,
    toggleSkipRead: () => {
      skipRead.value = !skipRead.value
      return skipRead.value
    },
    t: (key: string) => `t:${key}`,
  })

  return { api, settings, gallery, history, ending, skipRead, actions }
}

const keyEvent = (key: string, target: any = document.body) => {
  const event: any = { key, target, defaultPrevented: false }
  event.preventDefault = vi.fn(() => {
    event.defaultPrevented = true
  })
  return event as KeyboardEvent
}

describe('isEditableTarget', () => {
  it('输入类控件与可编辑区域视为可编辑目标', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('普通元素与空目标不拦截', () => {
    expect(isEditableTarget({ tagName: 'DIV' })).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
    expect(isEditableTarget(undefined)).toBe(false)
  })
})

describe('面板可见性工具', () => {
  it('任一面板展开即视为打开', () => {
    const a = ref(false)
    const b = ref(false)
    expect(anyPanelVisible([a, b])).toBe(false)
    b.value = true
    expect(anyPanelVisible([a, b])).toBe(true)
    expect(anyPanelVisible([])).toBe(false)
  })

  it('只关闭第一个展开的面板', () => {
    const a = ref(false)
    const b = ref(true)
    const c = ref(true)
    expect(closeFirstVisiblePanel([a, b, c])).toBe(true)
    expect(b.value).toBe(false)
    expect(c.value).toBe(true)
  })

  it('没有展开的面板时返回 false', () => {
    const a = ref(false)
    expect(closeFirstVisiblePanel([a])).toBe(false)
  })
})

describe('usePlayerKeyboard', () => {
  beforeEach(() => {
    vi.mocked(ElMessage.info).mockClear()
  })

  it('isPanelOpen 跟随面板状态', () => {
    const { api, gallery } = createKeyboard()
    expect(api.isPanelOpen()).toBe(false)
    gallery.value = true
    expect(api.isPanelOpen()).toBe(true)
  })

  it('Esc 按优先级关闭第一个面板并阻止默认行为', () => {
    const { api, settings, gallery } = createKeyboard()
    settings.value = true
    gallery.value = true
    const event = keyEvent('Escape')
    api.handleKeydown(event)
    expect(settings.value).toBe(false)
    expect(gallery.value).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('没有面板展开时 Esc 不阻止默认行为', () => {
    const { api } = createKeyboard()
    const event = keyEvent('Escape')
    api.handleKeydown(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('可编辑区域内忽略翻页类按键', () => {
    const { api, actions } = createKeyboard()
    api.handleKeydown(keyEvent('Enter', { tagName: 'INPUT' }))
    api.handleKeydown(keyEvent('ArrowLeft', { tagName: 'TEXTAREA' }))
    expect(actions.nextDialogue).not.toHaveBeenCalled()
    expect(actions.rollbackOneLine).not.toHaveBeenCalled()
  })

  it('← 回退到上一句', () => {
    const { api, actions } = createKeyboard()
    const event = keyEvent('ArrowLeft')
    api.handleKeydown(event)
    expect(actions.rollbackOneLine).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('面板打开时 ← 与继续键都不生效', () => {
    const { api, actions, settings } = createKeyboard()
    settings.value = true
    api.handleKeydown(keyEvent('ArrowLeft'))
    api.handleKeydown(keyEvent(' '))
    api.handleKeydown(keyEvent('Enter'))
    api.handleKeydown(keyEvent('ArrowRight'))
    expect(actions.rollbackOneLine).not.toHaveBeenCalled()
    expect(actions.nextDialogue).not.toHaveBeenCalled()
  })

  it('空格 / 回车 / → 继续对话', () => {
    const { api, actions } = createKeyboard()
    for (const key of [' ', 'Enter', 'ArrowRight']) {
      api.handleKeydown(keyEvent(key))
    }
    expect(actions.nextDialogue).toHaveBeenCalledTimes(3)
  })

  it('H 切换回想，大小写都识别', () => {
    const { api, actions } = createKeyboard()
    api.handleKeydown(keyEvent('h'))
    api.handleKeydown(keyEvent('H'))
    expect(actions.toggleHistoryDialogue).toHaveBeenCalledTimes(2)
  })

  it('S 切换跳过已读并提示，弹窗打开时也生效', () => {
    const { api, skipRead, settings } = createKeyboard()
    settings.value = true
    api.handleKeydown(keyEvent('s'))
    expect(skipRead.value).toBe(true)
    expect(ElMessage.info).toHaveBeenCalledWith('t:toast.skipOn')
    api.handleKeydown(keyEvent('S'))
    expect(skipRead.value).toBe(false)
    expect(ElMessage.info).toHaveBeenCalledWith('t:toast.skipOff')
  })

  it('A 切换自动播放，但面板打开时不响应', () => {
    const { api, actions, ending } = createKeyboard()
    api.handleKeydown(keyEvent('a'))
    expect(actions.toggleAutoPlay).toHaveBeenCalledTimes(1)
    ending.value = true
    api.handleKeydown(keyEvent('a'))
    expect(actions.toggleAutoPlay).toHaveBeenCalledTimes(1)
  })

  it('未映射按键不触发任何动作', () => {
    const { api, actions } = createKeyboard()
    api.handleKeydown(keyEvent('q'))
    expect(actions.nextDialogue).not.toHaveBeenCalled()
    expect(actions.rollbackOneLine).not.toHaveBeenCalled()
    expect(actions.toggleHistoryDialogue).not.toHaveBeenCalled()
    expect(actions.toggleAutoPlay).not.toHaveBeenCalled()
  })
})
