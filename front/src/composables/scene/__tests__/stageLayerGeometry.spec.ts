import { describe, expect, it } from 'vitest'
import {
  STAGE_ENTRY_FALLBACK_X,
  STAGE_ENTRY_MIN_GAP,
  STAGE_ENTRY_XS,
  buildAvatarTransformPatch,
  clampOpacity,
  clampRotate,
  clampScale,
  clampStagePercent,
  pickFreeStageX,
} from '@/composables/scene/stageLayerGeometry'

describe('pickFreeStageX', () => {
  it('没有立绘时优先居中', () => {
    expect(pickFreeStageX([])).toBe(50)
  })

  it('居中已占用时选左侧', () => {
    expect(pickFreeStageX([50])).toBe(25)
  })

  it('居中与左侧都占用时选右侧', () => {
    expect(pickFreeStageX([50, 25])).toBe(75)
  })

  it('相距小于最小间距即视为占用', () => {
    expect(pickFreeStageX([50 - STAGE_ENTRY_MIN_GAP + 1])).toBe(25)
  })

  it('相距等于最小间距不算占用', () => {
    expect(pickFreeStageX([50 - STAGE_ENTRY_MIN_GAP])).toBe(50)
  })

  it('所有候选都被占用时回退到兜底站位', () => {
    expect(pickFreeStageX([...STAGE_ENTRY_XS])).toBe(STAGE_ENTRY_FALLBACK_X)
  })

  it('忽略非有限数值（立绘尚未定位）', () => {
    expect(pickFreeStageX([NaN, Infinity])).toBe(50)
  })
})

describe('clampStagePercent', () => {
  it('钳在 0~100', () => {
    expect(clampStagePercent(-20)).toBe(0)
    expect(clampStagePercent(140)).toBe(100)
    expect(clampStagePercent(37.5)).toBe(37.5)
  })

  it('非数值按 0 处理', () => {
    expect(clampStagePercent(undefined)).toBe(0)
    expect(clampStagePercent('abc')).toBe(0)
  })

  it('数字字符串按数值处理', () => {
    expect(clampStagePercent('42')).toBe(42)
  })
})

describe('clampScale / clampOpacity / clampRotate', () => {
  it('缩放钳在 0.2~3', () => {
    expect(clampScale(0.05)).toBe(0.2)
    expect(clampScale(9)).toBe(3)
    expect(clampScale(1.5)).toBe(1.5)
  })

  it('缩放缺省回落到 1', () => {
    expect(clampScale(undefined)).toBe(1)
    expect(clampScale('abc')).toBe(1)
  })

  it('不透明度钳在 0~1，null 视为 1', () => {
    expect(clampOpacity(-1)).toBe(0)
    expect(clampOpacity(2)).toBe(1)
    expect(clampOpacity(null)).toBe(1)
    expect(clampOpacity(0)).toBe(0)
  })

  it('旋转钳在 -45~45', () => {
    expect(clampRotate(-90)).toBe(-45)
    expect(clampRotate(90)).toBe(45)
    expect(clampRotate(undefined)).toBe(0)
  })
})

describe('buildAvatarTransformPatch', () => {
  it('一次性给出三个钳制后的值', () => {
    expect(buildAvatarTransformPatch({ scale: 9, opacity: 2, rotate: -90 }))
      .toEqual({ scale: 3, opacity: 1, rotate: -45 })
  })

  it('全部缺省时给出安全默认值', () => {
    expect(buildAvatarTransformPatch({})).toEqual({ scale: 1, opacity: 1, rotate: 0 })
  })
})
