import { describe, expect, it } from 'vitest'
import {
  isSceneEditorFieldTarget,
  resolveSceneEditorShortcut,
} from '@/composables/scene/useSceneEditorShortcuts'

const field = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable })
const body = field('DIV')

const key = (k: string, extra: Record<string, any> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  target: body,
  ...extra,
})

describe('isSceneEditorFieldTarget', () => {
  it('输入框与可编辑区域视为可编辑目标', () => {
    expect(isSceneEditorFieldTarget(field('INPUT'))).toBe(true)
    expect(isSceneEditorFieldTarget(field('TEXTAREA'))).toBe(true)
    expect(isSceneEditorFieldTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('普通节点与空目标不拦截', () => {
    expect(isSceneEditorFieldTarget(body)).toBe(false)
    expect(isSceneEditorFieldTarget(null)).toBe(false)
    expect(isSceneEditorFieldTarget(undefined)).toBe(false)
  })
})

describe('resolveSceneEditorShortcut', () => {
  it('没有 Ctrl/Cmd 时不触发任何动作', () => {
    expect(resolveSceneEditorShortcut(key('s'))).toBeNull()
    expect(resolveSceneEditorShortcut(key('z'))).toBeNull()
  })

  it('Ctrl/Cmd + S 保存，输入框内也生效', () => {
    expect(resolveSceneEditorShortcut(key('s', { ctrlKey: true }))).toBe('save')
    expect(resolveSceneEditorShortcut(key('S', { metaKey: true }))).toBe('save')
    expect(resolveSceneEditorShortcut(key('s', { ctrlKey: true, target: field('INPUT') }))).toBe('save')
  })

  it('Ctrl/Cmd + Z 撤销，Shift 组合与 Y 为重做', () => {
    expect(resolveSceneEditorShortcut(key('z', { ctrlKey: true }))).toBe('undo')
    expect(resolveSceneEditorShortcut(key('Z', { metaKey: true }))).toBe('undo')
    expect(resolveSceneEditorShortcut(key('z', { ctrlKey: true, shiftKey: true }))).toBe('redo')
    expect(resolveSceneEditorShortcut(key('y', { ctrlKey: true }))).toBe('redo')
  })

  it('输入框内的撤销/重做交给浏览器原生行为', () => {
    expect(resolveSceneEditorShortcut(key('z', { ctrlKey: true, target: field('INPUT') }))).toBeNull()
    expect(resolveSceneEditorShortcut(key('y', { ctrlKey: true, target: field('TEXTAREA') }))).toBeNull()
    expect(resolveSceneEditorShortcut(key('z', { ctrlKey: true, target: { tagName: 'DIV', isContentEditable: true } }))).toBeNull()
  })

  it('未约定的组合键不处理', () => {
    expect(resolveSceneEditorShortcut(key('a', { ctrlKey: true }))).toBeNull()
    expect(resolveSceneEditorShortcut(key('', { ctrlKey: true }))).toBeNull()
    expect(resolveSceneEditorShortcut(null as any)).toBeNull()
  })
})
