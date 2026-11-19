export interface SceneNodeLike {
  content_id?: number | string | null
  order_num?: number | null
  content_text?: string | null
  character_id?: number | string | null
  scene_title?: string | null
  [key: string]: any
}

export interface SceneCharacterLike {
  character_id?: number | string | null
  name?: string | null
  [key: string]: any
}

export const NARRATOR_NAME = '旁白'
const UNKNOWN_CHARACTER = '未知角色'
const CHARACTERS_LOADING = '角色加载中'

export function getCharacterName(
  characters: SceneCharacterLike[] | null | undefined,
  characterId: number | string | null | undefined
): string {
  if (!characterId) return NARRATOR_NAME
  const list = characters || []
  if (list.length === 0) return CHARACTERS_LOADING
  const character = list.find(item => item.character_id === characterId)
  return character ? String(character.name ?? '') : UNKNOWN_CHARACTER
}

export function buildChoiceTargets(
  dialogues: SceneNodeLike[] | null | undefined,
  projectNodes: SceneNodeLike[] | null | undefined,
  selfContentId: number | string | null | undefined
): SceneNodeLike[] {
  const merged = new Map<number | string, SceneNodeLike>()
  for (const node of projectNodes || []) {
    if (node && node.content_id) merged.set(node.content_id, node)
  }
  for (const dialogue of dialogues || []) {
    if (dialogue && dialogue.content_id) {
      merged.set(dialogue.content_id, { ...merged.get(dialogue.content_id), ...dialogue })
    }
  }
  return Array.from(merged.values()).filter(
    node => node && node.content_id && node.content_id !== selfContentId
  )
}

export function formatChoiceTargetLabel(
  node: SceneNodeLike | null | undefined,
  speakerName: string | null | undefined
): string {
  if (!node) return ''
  const scenePart = node.scene_title ? `${node.scene_title} · ` : ''
  const name = speakerName || ''
  const text = String(node.content_text ?? '').replace(/\n/g, ' ').slice(0, 12)
  const who = name && name !== UNKNOWN_CHARACTER ? `${name}：` : ''
  return `${scenePart}#${node.order_num} ${who}${text}`
}

export function jumpTargetOf(
  jumpMap: Record<string, any> | null | undefined,
  contentId: number | string | null | undefined
): number | string {
  if (!contentId || !jumpMap) return ''
  const branch = jumpMap[contentId as string]
  return branch ? branch.target_content_id : ''
}

export function hasChoiceCondition(option: { cond_items?: any[] | null } | null | undefined): boolean {
  const items = option?.cond_items || []
  return items.some(item => item && item.variable)
}

export function hasNodeCondition(dialogue: { branch_condition?: any } | null | undefined): boolean {
  const condition = dialogue?.branch_condition
  if (!condition || typeof condition !== 'object') return false
  if (Array.isArray(condition.items)) return condition.items.some((item: any) => item && item.variable)
  return !!condition.variable
}

export function ensureDialogueEffects(
  dialogue: { _effects?: any[]; content_id?: number | string | null } | null | undefined,
  effectsMap: Record<string, any[]> | null | undefined
): any[] {
  if (!dialogue) return []
  if (!dialogue._effects) {
    const source = (effectsMap || {})[String(dialogue.content_id)] || []
    dialogue._effects = source.map((effect: any) => ({ ...effect }))
  }
  return dialogue._effects
}

export interface NodeConditionItem {
  variable: string
  op?: string
  value?: number | string | null
}

export interface NodeConditionPayload {
  mode: 'and' | 'or'
  items: { variable: string; op: string; value: number }[]
}

export function buildNodeConditionPayload(
  mode: string | null | undefined,
  items: NodeConditionItem[] | null | undefined
): NodeConditionPayload | null {
  const list = (items || [])
    .filter(item => item && item.variable)
    .map(item => ({
      variable: item.variable,
      op: item.op || '>=',
      value: Math.trunc(Number(item.value) || 0),
    }))
  if (!list.length) return null
  return { mode: mode === 'or' ? 'or' : 'and', items: list }
}

export function countTranslations(target: { translations?: Record<string, any> } | null | undefined): number {
  return target && target.translations ? Object.keys(target.translations).length : 0
}

export function languagesOfTranslations<T extends { code: string }>(
  target: { translations?: Record<string, any> } | null | undefined,
  languages: T[]
): T[] {
  const map = target && target.translations ? target.translations : {}
  return (languages || []).filter(language => !!map[language.code])
}
