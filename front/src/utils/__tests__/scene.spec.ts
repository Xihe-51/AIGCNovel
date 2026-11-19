import { describe, expect, it } from 'vitest'
import {
  buildChoiceTargets,
  buildNodeConditionPayload,
  countTranslations,
  ensureDialogueEffects,
  formatChoiceTargetLabel,
  getCharacterName,
  hasChoiceCondition,
  hasNodeCondition,
  jumpTargetOf,
  languagesOfTranslations,
} from '../scene'

describe('getCharacterName', () => {
  const characters = [
    { character_id: 1, name: '林夏' },
    { character_id: 2, name: '顾川' },
  ]

  it('无角色 id 时返回旁白', () => {
    expect(getCharacterName(characters, null)).toBe('旁白')
    expect(getCharacterName(characters, undefined)).toBe('旁白')
    expect(getCharacterName(characters, 0)).toBe('旁白')
  })

  it('角色列表为空时提示加载中', () => {
    expect(getCharacterName([], 1)).toBe('角色加载中')
    expect(getCharacterName(null, 1)).toBe('角色加载中')
  })

  it('命中角色返回名字，未命中返回未知角色', () => {
    expect(getCharacterName(characters, 1)).toBe('林夏')
    expect(getCharacterName(characters, 9)).toBe('未知角色')
  })
})

describe('buildChoiceTargets', () => {
  it('合并项目节点与当前场景台词，后者覆盖前者同 id 字段', () => {
    const projectNodes = [
      { content_id: 1, content_text: '旧文本', order_num: 1 },
      { content_id: 2, content_text: '别处节点', order_num: 2 },
    ]
    const dialogues = [{ content_id: 1, content_text: '新文本' }]

    const result = buildChoiceTargets(dialogues, projectNodes, 99)

    expect(result).toHaveLength(2)
    expect(result[0].content_id).toBe(1)
    expect(result[0].content_text).toBe('新文本')
    expect(result[0].order_num).toBe(1)
  })

  it('排除自身、忽略无 content_id 的脏数据', () => {
    const projectNodes = [{ content_id: 1 }, { content_id: null }, { order_num: 3 }]
    const result = buildChoiceTargets([], projectNodes, 1)
    expect(result).toHaveLength(0)
  })

  it('空入参返回空数组', () => {
    expect(buildChoiceTargets(null, undefined, 1)).toEqual([])
  })
})

describe('formatChoiceTargetLabel', () => {
  it('拼场景名、序号、角色与截断文本', () => {
    const label = formatChoiceTargetLabel(
      { scene_title: '雨夜', order_num: 3, content_text: '第一行\n第二行内容很长很长' },
      '林夏'
    )
    expect(label).toBe('雨夜 · #3 林夏：第一行 第二行内容很长很')
  })

  it('未知角色与无场景名时省略对应片段', () => {
    const label = formatChoiceTargetLabel({ order_num: 1, content_text: '嗯' }, '未知角色')
    expect(label).toBe('#1 嗯')
  })

  it('节点为空返回空串', () => {
    expect(formatChoiceTargetLabel(null, '林夏')).toBe('')
  })
})

describe('jumpTargetOf', () => {
  it('命中分支返回目标 id', () => {
    expect(jumpTargetOf({ 7: { target_content_id: 12 } }, 7)).toBe(12)
  })

  it('未命中或入参缺失返回空串', () => {
    expect(jumpTargetOf({}, 7)).toBe('')
    expect(jumpTargetOf(null, 7)).toBe('')
    expect(jumpTargetOf({ 7: { target_content_id: 12 } }, null)).toBe('')
  })
})

describe('hasChoiceCondition', () => {
  it('任一条件填了变量即为真', () => {
    expect(hasChoiceCondition({ cond_items: [{ variable: '好感度' }] })).toBe(true)
  })

  it('空变量或无条件为假', () => {
    expect(hasChoiceCondition({ cond_items: [{ variable: '' }, {}] })).toBe(false)
    expect(hasChoiceCondition({})).toBe(false)
    expect(hasChoiceCondition(null)).toBe(false)
  })
})

describe('hasNodeCondition', () => {
  it('items 数组任一有变量即为真', () => {
    expect(hasNodeCondition({ branch_condition: { items: [{ variable: 'flag' }] } })).toBe(true)
  })

  it('单条件对象形式按 variable 判断', () => {
    expect(hasNodeCondition({ branch_condition: { variable: 'flag' } })).toBe(true)
    expect(hasNodeCondition({ branch_condition: { variable: '' } })).toBe(false)
  })

  it('缺省或非对象为假', () => {
    expect(hasNodeCondition({})).toBe(false)
    expect(hasNodeCondition({ branch_condition: 'flag' })).toBe(false)
    expect(hasNodeCondition(null)).toBe(false)
  })
})

describe('ensureDialogueEffects', () => {
  it('首次访问时从 effectsMap 深拷贝出本地草稿', () => {
    const source = [{ variable_id: 1, delta: 2 }]
    const dialogue: any = { content_id: 5 }
    const result = ensureDialogueEffects(dialogue, { 5: source })

    expect(result).toEqual([{ variable_id: 1, delta: 2 }])
    expect(result).not.toBe(source)
    expect(result[0]).not.toBe(source[0])
  })

  it('已有本地草稿时直接复用，不被 effectsMap 覆盖', () => {
    const dialogue: any = { content_id: 5, _effects: [{ variable_id: 2, delta: 9 }] }
    expect(ensureDialogueEffects(dialogue, { 5: [{ variable_id: 1, delta: 2 }] })).toBe(dialogue._effects)
  })

  it('effectsMap 缺失时得到空数组', () => {
    expect(ensureDialogueEffects({ content_id: 5 }, null)).toEqual([])
    expect(ensureDialogueEffects(null, {})).toEqual([])
  })
})

describe('countTranslations / languagesOfTranslations', () => {
  const languages = [
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
  ]

  it('统计译文条数', () => {
    expect(countTranslations({ translations: { en: 'a', ja: 'b' } })).toBe(2)
    expect(countTranslations({})).toBe(0)
    expect(countTranslations(null)).toBe(0)
  })

  it('按语言表顺序筛出已有译文', () => {
    const result = languagesOfTranslations({ translations: { ko: 'c', en: 'a' } }, languages)
    expect(result.map(item => item.code)).toEqual(['en', 'ko'])
  })

  it('无译文时返回空数组', () => {
    expect(languagesOfTranslations(null, languages)).toEqual([])
    expect(languagesOfTranslations({}, languages)).toEqual([])
  })
})

describe('buildNodeConditionPayload', () => {
  it('过滤空变量并截断数值', () => {
    const payload = buildNodeConditionPayload('and', [
      { variable: '好感度', op: '>=', value: 3.7 },
      { variable: '', op: '>=', value: 5 },
    ])
    expect(payload).toEqual({ mode: 'and', items: [{ variable: '好感度', op: '>=', value: 3 }] })
  })

  it('没有有效项时返回 null', () => {
    expect(buildNodeConditionPayload('and', [])).toBeNull()
    expect(buildNodeConditionPayload('or', null)).toBeNull()
    expect(buildNodeConditionPayload('or', [{ variable: '' }])).toBeNull()
  })

  it('mode 非 or 时归一为 and，op 缺省为 >=', () => {
    expect(buildNodeConditionPayload('or', [{ variable: '好感度' }])).toEqual({
      mode: 'or',
      items: [{ variable: '好感度', op: '>=', value: 0 }],
    })
    expect(buildNodeConditionPayload('weird', [{ variable: '好感度', value: 'abc' }])).toEqual({
      mode: 'and',
      items: [{ variable: '好感度', op: '>=', value: 0 }],
    })
  })
})
