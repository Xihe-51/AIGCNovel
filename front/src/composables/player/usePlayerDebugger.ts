/**
 * 播放器条件调试器：变量变化历史、条件断点、状态快照。
 *
 * 所有播放器状态通过 getter/setter 适配器注入，composable 只负责调试数据的
 * 记录、持久化与快照恢复，不直接持有播放位置或变量系统。
 */
import { nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'

export const DEBUG_HISTORY_LIMIT = 40
export const DEBUG_SNAPSHOT_LIMIT = 5

export interface PlayerDebuggerContext {
  projectId: () => number
  debugMode: () => boolean
  getCurrentDialogue: () => any
  getProjectVariables: () => any[]
  getVariableValues: () => Record<string, any>
  getSceneIndex: () => number
  getDialogueIndex: () => number
  getVisited: () => number[]
  evalSingleCondition: (condition: any) => boolean
  restoreVisited: (ids: any[] | null | undefined) => void
  clearLineSnapshots: () => void
  startTyping: () => void
  setAutoPlay: (value: boolean) => void
  setPanelVisible: (value: boolean) => void
  setSceneIndex: (value: number) => void
  setDialogueIndex: (value: number) => void
  setVariableValues: (value: Record<string, any>) => void
}

export function usePlayerDebugger(ctx: PlayerDebuggerContext) {
  const variableHistory = ref<any[]>([])
  const debugBreakpoint = ref<any>({ enabled: false, variable: '', op: '>=', value: 0 })
  const debugBreakpointHit = ref('')
  const debugSnapshots = ref<any[]>([])

  const pushVariableHistory = (label: string, from: any, to: any, reason: string) => {
    if (!ctx.debugMode()) return
    variableHistory.value = [{
      id: Date.now() + Math.random(),
      at: new Date().toLocaleTimeString(),
      label,
      from,
      to,
      reason,
    }, ...variableHistory.value].slice(0, DEBUG_HISTORY_LIMIT)
  }

  const checkDebugBreakpoint = () => {
    const bp = debugBreakpoint.value
    if (!ctx.debugMode() || !bp.enabled || !bp.variable) return
    const v = ctx.getProjectVariables().find((x: any) => x.name === bp.variable)
    if (!v) return
    const current = Number(ctx.getVariableValues()[v.name] ?? v.initial_value)
    const hit = ctx.evalSingleCondition({ variable: bp.variable, op: bp.op, value: bp.value })
    if (!hit) return
    const text = `#${ctx.getCurrentDialogue()?.content_id || '-'} ${v.label} ${bp.op} ${bp.value}（当前 ${current}）`
    debugBreakpointHit.value = text
    // 命中后自动关闭，避免每句都弹
    debugBreakpoint.value = { ...bp, enabled: false }
    ctx.setAutoPlay(false)
    ElMessage.warning('条件断点命中：' + text)
  }

  const debugSnapshotKey = () => `aigc:debugSnapshots:${ctx.projectId()}`

  const loadDebugSnapshots = () => {
    if (!ctx.debugMode()) return
    try {
      const raw = localStorage.getItem(debugSnapshotKey())
      const list = raw ? JSON.parse(raw) : []
      debugSnapshots.value = Array.isArray(list) ? list.slice(0, DEBUG_SNAPSHOT_LIMIT) : []
    } catch (e) {
      debugSnapshots.value = []
    }
  }

  const persistDebugSnapshots = () => {
    try {
      localStorage.setItem(debugSnapshotKey(), JSON.stringify(debugSnapshots.value))
    } catch (e) { /* ignore */ }
  }

  const saveDebugSnapshot = () => {
    if (!ctx.debugMode()) return
    const snap = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      node: ctx.getCurrentDialogue()?.content_id || null,
      sceneIndex: ctx.getSceneIndex(),
      dialogueIndex: ctx.getDialogueIndex(),
      variables: { ...ctx.getVariableValues() },
      visited: ctx.getVisited(),
    }
    debugSnapshots.value = [snap, ...debugSnapshots.value].slice(0, DEBUG_SNAPSHOT_LIMIT)
    persistDebugSnapshots()
    ElMessage.success('已保存状态快照')
  }

  const restoreDebugSnapshot = (snap: any) => {
    // 调试快照是任意时间点，恢复后旧的「上一句」快照不再可信
    ctx.clearLineSnapshots()
    ctx.setSceneIndex(snap.sceneIndex)
    ctx.setDialogueIndex(snap.dialogueIndex)
    ctx.setVariableValues({ ...(snap.variables || {}) })
    ctx.restoreVisited(snap.visited)
    ctx.setPanelVisible(true)
    nextTick(() => ctx.startTyping())
    ElMessage.success('已恢复快照')
  }

  const deleteDebugSnapshot = (id: any) => {
    debugSnapshots.value = debugSnapshots.value.filter((s: any) => s.id !== id)
    persistDebugSnapshots()
  }

  return {
    variableHistory,
    debugBreakpoint,
    debugBreakpointHit,
    debugSnapshots,
    pushVariableHistory,
    checkDebugBreakpoint,
    loadDebugSnapshots,
    saveDebugSnapshot,
    restoreDebugSnapshot,
    deleteDebugSnapshot,
  }
}
