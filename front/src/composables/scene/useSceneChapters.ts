/**
 * 场景左栏的章节（幕）管理与场景归属。
 *
 * 章节只影响左栏分组，不改变播放顺序；归属变更后只同步本地 chapterMap，
 * 不整表重新拉取，避免左侧列表闪烁。
 */
import { ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listChapters,
  createChapter,
  updateChapter,
  deleteChapter,
  assignSceneChapter,
} from '@/api/chapter'
import type { StoryChapter } from '@/api/chapter'

export interface SceneChaptersContext {
  projectId: Ref<string | number>
}

export function useSceneChapters(ctx: SceneChaptersContext) {
  const chapters = ref<StoryChapter[]>([])
  const chapterMap = ref<Record<number, number>>({})
  const dialogVisible = ref(false)
  const newTitle = ref('')
  // 大项目折叠分组，减少一次性渲染的场景条目
  const collapsedGroups = ref<string[]>([])

  const isCollapsed = (key: string) => collapsedGroups.value.includes(key)

  const toggleGroup = (key: string) => {
    const i = collapsedGroups.value.indexOf(key)
    if (i >= 0) collapsedGroups.value.splice(i, 1)
    else collapsedGroups.value.push(key)
  }

  const fetchChapters = async () => {
    if (!ctx.projectId.value) return
    try {
      const res = await listChapters(Number(ctx.projectId.value))
      chapters.value = (res.chapters || []).sort((a, b) => a.order_num - b.order_num)
      chapterMap.value = res.scene_map || {}
    } catch (e) {
      console.warn('读取章节失败:', e)
      chapters.value = []
      chapterMap.value = {}
    }
  }

  const openDialog = async () => {
    dialogVisible.value = true
    await fetchChapters()
  }

  const addChapter = async () => {
    const title = newTitle.value.trim()
    if (!title) {
      ElMessage.warning('请填写章节名')
      return
    }
    try {
      await createChapter(Number(ctx.projectId.value), title)
      newTitle.value = ''
      await fetchChapters()
      ElMessage.success('章节已创建')
    } catch (e: any) {
      ElMessage.error('创建章节失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
    }
  }

  const renameChapter = async (c: StoryChapter) => {
    const title = String(c.title || '').trim()
    if (!title) {
      ElMessage.warning('章节名不能为空')
      await fetchChapters()
      return
    }
    try {
      await updateChapter(Number(ctx.projectId.value), c.chapter_id, { title })
      ElMessage.success('章节已重命名')
    } catch (e: any) {
      ElMessage.error('重命名失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
      await fetchChapters()
    }
  }

  // 目标字数：0 表示不设目标；输入非法时回退为 0
  const saveTarget = async (c: StoryChapter) => {
    const target = Math.max(0, Number(c.target_words) || 0)
    c.target_words = target
    try {
      await updateChapter(Number(ctx.projectId.value), c.chapter_id, { target_words: target })
      ElMessage.success(target ? `目标已设为 ${target} 字` : '已取消目标字数')
    } catch (e: any) {
      ElMessage.error('保存目标失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
      await fetchChapters()
    }
  }

  const removeChapter = async (c: StoryChapter) => {
    try {
      await ElMessageBox.confirm(
        `删除章节「${c.title}」？该章节下的场景会回到「未分组」，场景本身不会删除。`,
        '删除章节',
        { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return
    }
    try {
      await deleteChapter(Number(ctx.projectId.value), c.chapter_id)
      await fetchChapters()
      ElMessage.success('章节已删除')
    } catch (e: any) {
      ElMessage.error('删除失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
    }
  }

  const assignChapter = async (sceneId: number, raw: string) => {
    const cid = raw ? Number(raw) : null
    try {
      await assignSceneChapter(Number(ctx.projectId.value), sceneId, cid)
      if (cid) {
        chapterMap.value = { ...chapterMap.value, [sceneId]: cid }
      } else {
        const next: Record<number, number> = { ...chapterMap.value }
        delete (next as any)[sceneId]
        chapterMap.value = next
      }
      ElMessage.success('场景归属已更新')
    } catch (err: any) {
      ElMessage.error('更新失败：' + (err?.response?.data?.message || err?.message || '未知错误'))
      await fetchChapters()
    }
  }

  // 归属下拉框只给出字符串值，这里转成 chapter_id
  const onAssignChange = (sceneId: number, e: Event) =>
    assignChapter(sceneId, (e.target as HTMLSelectElement).value)

  return {
    chapters,
    chapterMap,
    dialogVisible,
    newTitle,
    isCollapsed,
    toggleGroup,
    fetchChapters,
    openDialog,
    addChapter,
    renameChapter,
    saveTarget,
    removeChapter,
    onAssignChange,
  }
}
