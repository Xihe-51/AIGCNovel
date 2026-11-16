/**
 * 场景左栏的列表主体：加载、新建、复制、删除、拖拽排序、初始场景挑选。
 *
 * 批量操作（useSceneBatchOps）要用到 sortedScenes / savingOrder / clearDragState，
 * 所以这些状态在本 composable 统一持有，再注入给批量操作，避免两处各存一份序号；
 * 章节归属由 useSceneChapters 负责，这里只通过 reloadChapters 触发刷新。
 */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getScenes, createScene, updateScene, deleteScene, duplicateScene } from '@/api/scenes'
import type { Scene } from '@/api/scenes'
import { getProjectOutline } from '@/api/outline'
import { moveSceneInList, renumberScenes, sortScenesByOrder } from '@/utils/sceneList'

export const LAST_SCENE_PREFIX = 'aigc:create:lastScene:'

export interface SceneListPanelContext {
  projectId: Ref<string | number>
  /** 当前选中的场景，用于高亮与「删除后选中下一个」 */
  activeSceneId: () => string | number | undefined
  /** 批量模式下禁用拖拽排序 */
  batchMode: () => boolean
  reloadChapters: () => Promise<void>
  onSelect: (sceneId: string) => void
  onCreated: (sceneId: string) => void
  onDeleted: (sceneId: string) => void
}

/** 新场景的序号：取当前最大值 +1 */
export const nextSceneOrder = (scenes: Pick<Scene, 'order_num'>[]) =>
  scenes.length ? Math.max(...scenes.map(s => Number(s.order_num) || 0)) : 0

/** 鼠标在目标条目上半区就插到它前面，下半区插到它后面 */
export const isDropAfter = (
  clientY: number,
  rect?: { top: number; height: number } | null
) => (rect ? clientY > rect.top + rect.height / 2 : false)

/**
 * 打开项目时的初始场景：上次编辑的场景 → 第一个有内容的场景 → 第一个场景。
 * nodeCounts 传 null 表示还没拿到大纲，只按「上次编辑 → 第一个」决策。
 */
export const chooseInitialScene = <T extends { scene_id: number }>(
  list: T[],
  lastSceneId: string,
  nodeCounts?: Map<number, number> | null
): T | null => {
  if (!list.length) return null
  const last = lastSceneId ? list.find(s => String(s.scene_id) === lastSceneId) : null
  if (last) return last
  if (!nodeCounts) return list[0]
  return list.find(s => (nodeCounts.get(Number(s.scene_id)) || 0) > 0) || list[0]
}

export function useSceneListPanel(ctx: SceneListPanelContext) {
  const scenes = ref<Scene[]>([])
  const loading = ref(false)
  const creating = ref(false)
  const duplicating = ref(false)
  const error = ref<string | null>(null)

  const sortedScenes = computed(() => sortScenesByOrder(scenes.value))
  // 序号持久化进行中（左栏显示“保存中…”），批量删除后的重排也复用它
  const savingOrder = ref(false)

  const isActive = (id: number) => String(id) === String(ctx.activeSceneId() ?? '')

  // 背景图文件丢失时记录 scene_id，缩略图退回序号占位，避免裂图
  const brokenThumbs = ref<number[]>([])
  const markThumbBroken = (id: number) => {
    if (!brokenThumbs.value.includes(id)) brokenThumbs.value.push(id)
  }

  // ---- 拖拽排序 ----
  const dragId = ref<number | null>(null)
  const dragOverId = ref<number | null>(null)
  const dropAfter = ref(false)

  const clearDragState = () => {
    dragId.value = null
    dragOverId.value = null
    dropAfter.value = false
  }

  const onDragStart = (s: Scene, e: DragEvent) => {
    if (ctx.batchMode()) return
    dragId.value = s.scene_id
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      // Firefox 必须 setData 才会真正开始拖拽
      e.dataTransfer.setData('text/plain', String(s.scene_id))
    }
  }

  const onDragOver = (s: Scene, e: DragEvent) => {
    if (dragId.value === null || dragId.value === s.scene_id) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    const el = e.currentTarget as HTMLElement | null
    dropAfter.value = isDropAfter(e.clientY, el ? el.getBoundingClientRect() : null)
    dragOverId.value = s.scene_id
  }

  const onDragLeave = (s: Scene) => {
    if (dragOverId.value !== s.scene_id) return
    dragOverId.value = null
    dropAfter.value = false
  }

  const onDrop = async (target: Scene) => {
    if (ctx.batchMode()) return
    const fromId = dragId.value
    const after = dropAfter.value
    clearDragState()
    if (fromId === null) return

    // 先把新顺序落到本地，界面立即生效；再逐条持久化
    const list = moveSceneInList(sortedScenes.value, fromId, target.scene_id, after)
    if (!list) return
    scenes.value = list

    savingOrder.value = true
    try {
      await Promise.all(list.map(s => updateScene(s.scene_id, { order_num: s.order_num })))
    } catch (e) {
      console.error('保存场景顺序失败:', e)
      ElMessage.error('保存场景顺序失败，已恢复原顺序')
      await fetchScenes()
    } finally {
      savingOrder.value = false
    }
  }

  const readLastSceneId = () => {
    try {
      return localStorage.getItem(`${LAST_SCENE_PREFIX}${ctx.projectId.value}`) || ''
    } catch (e) {
      return ''
    }
  }

  const pickInitialScene = async () => {
    const list = sortedScenes.value
    if (!list.length) return null
    const lastSceneId = readLastSceneId()
    // 有上次编辑记录就不必再查大纲
    const remembered = chooseInitialScene(list, lastSceneId, null)
    if (remembered && String(remembered.scene_id) === lastSceneId) return remembered

    let nodeCounts: Map<number, number> | null = null
    try {
      const outline = await getProjectOutline(Number(ctx.projectId.value))
      const rows = [
        ...(outline.chapters || []).flatMap(ch => ch.scenes || []),
        ...(outline.ungrouped || []),
      ]
      nodeCounts = new Map(rows.map(r => [Number(r.scene_id), Number(r.node_count) || 0]))
    } catch (e) {
      console.warn('读取大纲选择初始场景失败:', e)
    }
    return chooseInitialScene(list, lastSceneId, nodeCounts)
  }

  const fetchScenes = async () => {
    if (!ctx.projectId.value) {
      error.value = '缺少项目ID，无法获取场景'
      return
    }
    loading.value = true
    error.value = null
    try {
      scenes.value = await getScenes(Number(ctx.projectId.value))
      // 章节归属随场景一起刷新（新建/复制/删除后分组保持正确）
      await ctx.reloadChapters()
      // 重新拉取后重置缺图标记，文件补回来后缩略图能自动恢复
      brokenThumbs.value = []
      // 没有任何选中项时：上次场景 → 第一个有内容的场景 → 第一个场景
      if (!ctx.activeSceneId() && sortedScenes.value.length) {
        const initial = await pickInitialScene()
        if (initial) ctx.onSelect(String(initial.scene_id))
      }
    } catch (e) {
      console.error('获取场景失败:', e)
      error.value = '场景加载失败'
      scenes.value = []
    } finally {
      loading.value = false
    }
  }

  const handleAdd = async () => {
    if (creating.value) return
    creating.value = true
    try {
      const maxOrder = nextSceneOrder(scenes.value)
      const created = await createScene({
        project_id: Number(ctx.projectId.value),
        title: `新场景 ${maxOrder + 1}`,
        description: '',
        background_url: '',
        music_url: '',
        order_num: maxOrder + 1,
      })
      scenes.value.push(created)
      ctx.onCreated(String(created.scene_id))
      ctx.onSelect(String(created.scene_id))
    } catch (e) {
      console.error('新建场景失败:', e)
      ElMessage.error('新建场景失败')
    } finally {
      creating.value = false
    }
  }

  const handleDuplicate = async (s: Scene) => {
    if (duplicating.value) return
    duplicating.value = true
    try {
      const created = await duplicateScene(s.scene_id)
      await fetchScenes()
      ctx.onCreated(String(created.scene_id))
      ctx.onSelect(String(created.scene_id))
      ElMessage.success('场景已复制（含对话、分支、演出）')
    } catch (e) {
      console.error('复制场景失败:', e)
      ElMessage.error('复制场景失败')
    } finally {
      duplicating.value = false
    }
  }

  const handleDelete = async (s: Scene) => {
    try {
      await ElMessageBox.confirm(
        `删除场景「${s.title || '未命名场景'}」？场景里的对话和分支会一起删除。`,
        '删除场景',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
      )
    } catch {
      return
    }

    try {
      await deleteScene(s.scene_id)
    } catch (e) {
      console.error('删除场景失败:', e)
      ElMessage.error('删除场景失败')
      return
    }

    const wasActive = isActive(s.scene_id)
    scenes.value = scenes.value.filter(x => x.scene_id !== s.scene_id)
    ctx.onDeleted(String(s.scene_id))

    // 剩下的场景重新连续编号，避免左栏出现 #2、#4 这种断档
    const { list: rest, changed } = renumberScenes(sortedScenes.value)
    if (changed.length) {
      savingOrder.value = true
      Promise.all(changed.map(x => updateScene(x.scene_id, { order_num: x.order_num })))
        .catch(e => console.error('重排场景序号失败:', e))
        .finally(() => { savingOrder.value = false })
    }

    if (wasActive) ctx.onSelect(rest.length ? String(rest[0].scene_id) : '')
    ElMessage.success('场景已删除')
  }

  return {
    scenes,
    loading,
    creating,
    duplicating,
    error,
    sortedScenes,
    savingOrder,
    isActive,
    brokenThumbs,
    markThumbBroken,
    dragId,
    dragOverId,
    dropAfter,
    clearDragState,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    readLastSceneId,
    pickInitialScene,
    fetchScenes,
    handleAdd,
    handleDuplicate,
    handleDelete,
  }
}
