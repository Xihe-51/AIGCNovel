/**
 * 舞台图层的纯几何/数值规则：入场自动站位、百分比钳制、属性条取值钳制。
 *
 * 抽成纯函数是为了让「新角色不重叠」「缩放不出界」这类约定有单测兜底，
 * 而不是散落在各个 async 动作里靠手测发现。
 */

/** 多角色入场候选站位，按视觉优先级排列（居中优先，其次左右对称） */
export const STAGE_ENTRY_XS = [50, 25, 75, 18, 82, 35, 65]

/** 两个站位横向相距小于该值即视为「已被占用」 */
export const STAGE_ENTRY_MIN_GAP = 9

/** 兜底站位，所有候选都被占用时使用 */
export const STAGE_ENTRY_FALLBACK_X = 50

/** 挑一个没被占用的 X 坐标；usedXs 只应包含可见图层的横坐标 */
export const pickFreeStageX = (usedXs: number[]): number => {
  const used = (usedXs || []).filter(v => Number.isFinite(v))
  for (const x of STAGE_ENTRY_XS) {
    if (!used.some(u => Math.abs(u - x) < STAGE_ENTRY_MIN_GAP)) return x
  }
  return STAGE_ENTRY_FALLBACK_X
}

/** 舞台坐标/不透明度等百分比一律钳在 0~100 */
export const clampStagePercent = (v: unknown): number =>
  Math.max(0, Math.min(100, Number(v) || 0))

const clampNumber = (v: unknown, min: number, max: number): number =>
  Math.max(min, Math.min(max, Number(v)))

export const clampScale = (v: unknown): number =>
  clampNumber(Number.isFinite(Number(v)) ? Number(v) : 1, 0.2, 3)

export const clampOpacity = (v: unknown): number => {
  const raw = v === undefined || v === null ? 1 : Number(v)
  return clampNumber(Number.isFinite(raw) ? raw : 1, 0, 1)
}

export const clampRotate = (v: unknown): number =>
  clampNumber(Number.isFinite(Number(v)) ? Number(v) : 0, -45, 45)

/** 属性条写库前统一钳制，避免脏值直接落进指令 payload */
export const buildAvatarTransformPatch = (input: {
  scale?: unknown
  opacity?: unknown
  rotate?: unknown
}): { scale: number; opacity: number; rotate: number } => ({
  scale: clampScale(input.scale),
  opacity: clampOpacity(input.opacity),
  rotate: clampRotate(input.rotate)
})
