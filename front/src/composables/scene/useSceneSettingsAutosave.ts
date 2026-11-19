/**
 * 场景设置的脏标记与防抖自动保存（标题 / 描述 / 背景 / 音乐 / 剧情锁）。
 *
 * 快照只包含会被保存的字段，避免 order_num / created_at 之类误触发 dirty；
 * 自动保存期间又有新改动时会排队补一次，防止后一次请求覆盖前一次。
 */
import { ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { updateScene, setSceneLock } from '@/api/scenes'
import { createProjectVersion } from '@/api/version'
import { formatErrorMessage } from '@/utils/errorMessage'

export interface SceneSettingsAutosaveContext {
  sceneId: () => number | string
  scene: Ref<any>
  projectId: () => string
  getSceneReady: () => boolean
  /** 生成剧情锁载荷（由页面的 lockMode / lockItems 推导） */
  buildLock: () => any
  /** 保存成功后的通知，页面用来 emit('scene-updated') */
  onSaved: () => void
}

export function useSceneSettingsAutosave(ctx: SceneSettingsAutosaveContext) {
  const sceneDirty = ref(false)
  const sceneSaving = ref(false)
  let sceneSnapshot = ''
  let sceneSaveTimer: ReturnType<typeof setTimeout> | null = null
  let sceneSaveQueued = false

  // 快照只包含会被保存的字段，避免 order_num/created_at 之类误触发 dirty
  const sceneSnapshotOf = (sceneData = ctx.scene.value, lock = ctx.buildLock()) => JSON.stringify({
    title: sceneData?.title || '',
    description: sceneData?.description || '',
    background_url: sceneData?.background_url || '',
    music_url: sceneData?.music_url || '',
    lock: lock || null
  })

  const currentSceneSnapshot = () => sceneSnapshotOf()

  /** 加载完成后以当前内容为基线，清掉脏标记 */
  const resetSnapshot = () => {
    sceneSnapshot = currentSceneSnapshot()
    sceneDirty.value = false
  }

  /** 内容变化后重算脏标记，脏了才排队自动保存 */
  const refreshSceneDirty = () => {
    if (!ctx.getSceneReady()) return
    if (currentSceneSnapshot() === sceneSnapshot) {
      sceneDirty.value = false
      return
    }
    sceneDirty.value = true
    scheduleSceneSave()
  }

  const scheduleSceneSave = () => {
    if (sceneSaveTimer) clearTimeout(sceneSaveTimer)
    sceneSaveTimer = setTimeout(() => {
      if (sceneDirty.value) persistSceneSettings({ silent: true, version: false })
    }, 1200)
  }

  const cancelScheduledSave = () => {
    if (sceneSaveTimer) {
      clearTimeout(sceneSaveTimer)
      sceneSaveTimer = null
    }
  }

  const persistSceneSettings = async ({ silent = false, version = true } = {}) => {
    if (!ctx.sceneId() || !ctx.getSceneReady()) return
    if (sceneSaving.value) {
      // 自动保存期间又有新改动：等这次请求结束再补一次，避免覆盖
      if (silent) sceneSaveQueued = true
      else ElMessage.info('场景设置正在保存，请稍候')
      return
    }
    const payload = JSON.parse(JSON.stringify(ctx.scene.value || {}))
    const lock = ctx.buildLock()
    const payloadSnapshot = sceneSnapshotOf(payload, lock)
    sceneSaving.value = true
    try {
      await updateScene(Number(ctx.sceneId()), payload)
      const pid = ctx.projectId()
      if (pid) {
        await setSceneLock(Number(pid), Number(ctx.sceneId()), lock)
      }
      sceneSnapshot = payloadSnapshot
      // 请求期间用户可能又改了字段：只有当前值和刚保存的一致才算干净
      sceneDirty.value = currentSceneSnapshot() !== payloadSnapshot
      if (!silent) ElMessage.success('场景设置保存成功')
      if (version && pid) {
        createProjectVersion(Number(pid), '保存场景设置').catch(() => {})
      }
      ctx.onSaved()
      if (sceneDirty.value) scheduleSceneSave()
    } catch (err: any) {
      console.error('保存场景设置失败:', err)
      if (silent) ElMessage.warning('场景设置自动保存失败，请手动保存')
      else ElMessage.error(formatErrorMessage('保存场景设置失败', err))
    } finally {
      sceneSaving.value = false
      if (sceneSaveQueued) {
        sceneSaveQueued = false
        if (sceneDirty.value) persistSceneSettings({ silent: true, version: false })
      }
    }
  }

  const saveSceneSettings = () => {
    cancelScheduledSave()
    persistSceneSettings({ silent: false, version: true })
  }

  return {
    sceneDirty,
    sceneSaving,
    currentSceneSnapshot,
    resetSnapshot,
    refreshSceneDirty,
    scheduleSceneSave,
    cancelScheduledSave,
    persistSceneSettings,
    saveSceneSettings,
  }
}
