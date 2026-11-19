import { describe, expect, it } from 'vitest'
import { playerText } from '@/utils/playerI18n'
import { ZH_CN } from '@/utils/playerI18n/zh-CN'
import { ZH_TW } from '@/utils/playerI18n/zh-TW'
import { EN } from '@/utils/playerI18n/en'
import { JA } from '@/utils/playerI18n/ja'

describe('playerText 语言选择', () => {
  it('简体中文返回原文', () => {
    expect(playerText('zh-CN', 'common.confirm')).toBe('确定')
  })

  it('其他语言返回各自字典的文案', () => {
    expect(playerText('zh-TW', 'common.confirm')).toBe('確定')
    expect(playerText('en', 'common.confirm')).toBe('OK')
    expect(playerText('ja', 'common.confirm')).toBe('決定')
  })

  it('未登记的语言回退简体中文', () => {
    expect(playerText('fr', 'common.confirm')).toBe('确定')
    expect(playerText('', 'common.confirm')).toBe('确定')
  })

  it('语言代码区分大小写，大小写不符按未知语言处理', () => {
    expect(playerText('EN', 'common.confirm')).toBe('确定')
  })
})

describe('playerText 缺失键回退', () => {
  it('所有字典都没有的键回退键名本身', () => {
    expect(playerText('zh-CN', 'no.such.key')).toBe('no.such.key')
    expect(playerText('en', 'no.such.key')).toBe('no.such.key')
  })
})

describe('playerText 参数插值', () => {
  it('替换单个占位符', () => {
    expect(playerText('zh-CN', 'ending.nextPlaythrough', { n: 2 })).toBe('开始第 2 周目')
  })

  it('替换多个占位符', () => {
    expect(playerText('zh-CN', 'changelog.stats', { scenes: 3, nodes: 12 })).toBe('3 场景 · 12 节点')
    expect(playerText('zh-CN', 'chapters.readStats', { read: 4, total: 9 })).toBe('已读节点 4 / 9')
  })

  it('数字参数按字符串写入', () => {
    expect(playerText('en', 'save.slotN', { n: 0 })).toBe('Save 0')
  })

  it('不传参数时保留占位符原样', () => {
    expect(playerText('zh-CN', 'ending.nextPlaythrough')).toBe('开始第 {n} 周目')
  })

  it('未命中的参数不影响文案', () => {
    expect(playerText('zh-CN', 'ending.nextPlaythrough', { n: 3, unused: 'x' })).toBe('开始第 3 周目')
  })

  it('参数值里的 $ 等字符按字面量写入', () => {
    expect(playerText('zh-CN', 'chapters.jumpedToast', { title: '$&A' })).toBe('已跳转到「$&A」')
  })

  it('缺键时先回退键名，不再做插值', () => {
    expect(playerText('zh-CN', 'no.such.key', { n: 1 })).toBe('no.such.key')
  })
})

describe('字典完整性', () => {
  const baseKeys = Object.keys(ZH_CN)

  it('简体中文包含全部界面文案', () => {
    expect(baseKeys.length).toBe(145)
  })

  it.each([
    ['zh-TW', ZH_TW],
    ['en', EN],
    ['ja', JA],
  ])('%s 与简体中文的键完全一致', (_name, table) => {
    expect(Object.keys(table).sort()).toEqual([...baseKeys].sort())
  })
})
