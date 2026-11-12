/**
 * 场景编辑器的分支编排：选择项与自动跳转。
 *
 * 两者共用 branch_paths 表，只是形态不同：
 * 1. 「选择」节点：一条内容挂多条分支，各带文案 / 配图 / 显示条件，用户点选后跳转。
 * 2. 非「选择」节点：最多一条空文案分支，作为自动跳转边。
 *
 * 保存策略统一为「先删该起点已有分支，再按界面现状重建」——
 * 界面是唯一事实来源，避免逐条 diff 带来的状态漂移。
 * 重建后 branch_paths 主键会变，因此需要把选项译文迁移到新分支上。
 */
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listBranches, createBranch, deleteBranch } from '@/api/branch'
import { saveBranchTranslation } from '@/api/translation'
import { uploadSceneFile } from '@/api/scenes'
import { createProjectVersion } from '@/api/version'

export interface SceneBranchesContext {
  projectId: Ref<string | number>
  dialogues: Ref<any[]>
  projectNodes: Ref<any[]>
  jumpMap: Ref<Record<string, any>>
  pushHistory: () => void
  markDirty: () => void
  getCharacterName: (characterId: any) => string
}

export interface ChoiceCondition {
  variable: string
  op: string
  value: any
}

export interface ChoiceEditorState {
  cond_mode: 'and' | 'or'
  cond_items: ChoiceCondition[]
}

const emptyCondition = (): ChoiceCondition => ({ variable: '', op: '>=', value: 0 })

const emptyChoiceState = (): ChoiceEditorState => ({
  cond_mode: 'and',
  cond_items: [emptyCondition()],
})

export function useSceneBranches(ctx: SceneBranchesContext) {
  const { projectId, dialogues, projectNodes, jumpMap, pushHistory, markDirty, getCharacterName } = ctx

  /** 可选跳转目标：项目内全部已保存节点（支持跨场景），并合并当前场景未刷新到的节点 */
  const choiceTargets = (selfIndex: number) => {
    const selfId = dialogues.value[selfIndex]?.content_id
    const map = new Map<any, any>()
    for (const n of (projectNodes.value || [])) {
      if (n.content_id) map.set(n.content_id, n)
    }
    for (const d of (dialogues.value || [])) {
      if (d.content_id) map.set(d.content_id, { ...map.get(d.content_id), ...d })
    }
    return Array.from(map.values()).filter(n => n.content_id && n.content_id !== selfId)
  }

  const choiceTargetLabel = (d: any) => {
    const scenePart = d.scene_title ? `${d.scene_title} · ` : ''
    const name = getCharacterName(d.character_id)
    const text = (d.content_text || '').replace(/\n/g, ' ').slice(0, 12)
    const who = name && name !== '未知角色' ? `${name}：` : ''
    return `${scenePart}#${d.order_num} ${who}${text}`
  }

  /* ===== 非「选择」节点：自动跳转 ===== */

  const loadJumpMap = async () => {
    jumpMap.value = {}
    if (!projectId.value) return
    try {
      const all = await listBranches(Number(projectId.value))
      const map: Record<string, any> = {}
      for (const b of (all || [])) {
        if (!map[b.source_content_id]) map[b.source_content_id] = b
      }
      jumpMap.value = map
    } catch (e) {
      console.warn('读取自动跳转失败:', e)
      jumpMap.value = {}
    }
  }

  const jumpTargetOf = (dialogue: any) => {
    const b = jumpMap.value[dialogue.content_id]
    return b ? b.target_content_id : ''
  }

  const setJumpTarget = async (dialogue: any, targetId: any) => {
    if (!dialogue.content_id || !projectId.value) return
    try {
      const all = await listBranches(Number(projectId.value))
      const old = (all || []).filter((b: any) => b.source_content_id === dialogue.content_id)
      for (const b of old) {
        await deleteBranch(b.path_id)
      }
      if (targetId) {
        await createBranch(Number(projectId.value), {
          source_content_id: dialogue.content_id,
          target_content_id: Number(targetId),
          choice_text: '',
          conditions: null,
        })
      }
      await loadJumpMap()
      ElMessage.success(targetId ? '已设置自动跳转' : '已取消自动跳转')
    } catch (e: any) {
      console.error('设置自动跳转失败:', e)
      ElMessage.error('设置跳转失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
    }
  }

  /* ===== 「选择」节点：分支选项 ===== */

  /** 切换类型时，若是「选择」则按需加载已有分支 */
  const onContentTypeChange = (dialogue: any) => {
    pushHistory()
    markDirty()
    if (dialogue.content_type === '选择') ensureChoices(dialogue)
  }

  /** 把 branch_paths.conditions（单条件或条件组）转成编辑器结构 */
  const parseChoiceConditions = (raw: any): ChoiceEditorState => {
    if (!raw || typeof raw !== 'object') return emptyChoiceState()
    if (Array.isArray(raw.items)) {
      const items = raw.items
        .filter((c: any) => c && typeof c === 'object')
        .map((c: any) => ({ variable: c.variable || '', op: c.op || '>=', value: c.value ?? 0 }))
      return {
        cond_mode: raw.mode === 'or' ? 'or' : 'and',
        cond_items: items.length ? items : [emptyCondition()],
      }
    }
    if (raw.variable) {
      return { cond_mode: 'and', cond_items: [{ variable: raw.variable, op: raw.op || '>=', value: raw.value ?? 0 }] }
    }
    return emptyChoiceState()
  }

  /** 懒加载某条内容的分支选项 */
  const ensureChoices = async (dialogue: any, force = false) => {
    if (dialogue._choices && !force) return
    dialogue._choices = []
    if (!dialogue.content_id || !projectId.value) return
    try {
      const all = await listBranches(projectId.value as number)
      dialogue._choices = (all || [])
        .filter((b: any) => b.source_content_id === dialogue.content_id)
        .map((b: any) => ({
          path_id: b.path_id,
          choice_text: b.choice_text || '',
          translations: b.translations || {},
          target_content_id: b.target_content_id,
          ...parseChoiceConditions(b.conditions),
        }))
    } catch (e) {
      console.warn('加载分支选项失败:', e)
    }
  }

  const addChoice = (dialogue: any) => {
    pushHistory()
    markDirty()
    if (!dialogue._choices) dialogue._choices = []
    dialogue._choices.push({
      choice_text: '',
      target_content_id: null,
      cond_mode: 'and',
      cond_items: [emptyCondition()],
    })
  }

  const addChoiceCondition = (dialogue: any, oi: number) => {
    pushHistory()
    markDirty()
    const opt = dialogue._choices?.[oi]
    if (!opt) return
    if (!Array.isArray(opt.cond_items)) opt.cond_items = []
    opt.cond_items.push(emptyCondition())
  }

  const removeChoiceCondition = (dialogue: any, oi: number, ci: number) => {
    pushHistory()
    markDirty()
    const opt = dialogue._choices?.[oi]
    if (!opt || !Array.isArray(opt.cond_items)) return
    opt.cond_items.splice(ci, 1)
    if (!opt.cond_items.length) {
      opt.cond_items.push(emptyCondition())
    }
  }

  const hasChoiceCondition = (opt: any) =>
    (opt.cond_items || []).some((c: any) => c && c.variable)

  const removeChoice = (dialogue: any, i: number) => {
    pushHistory()
    markDirty()
    dialogue._choices.splice(i, 1)
  }

  /** 选项配图：上传到当前项目素材目录，保存分支时写入 branch_paths.image_url */
  const handleChoiceImageUpload = async (options: any, opt: any) => {
    if (!projectId.value) {
      ElMessage.warning('项目信息加载中，请稍后再试')
      return
    }
    try {
      const formData = new FormData()
      formData.append('file', options.file)
      formData.append('project_id', String(projectId.value))
      formData.append('file_type', 'image')
      const response: any = await uploadSceneFile(formData)
      if (response?.success && response?.data?.url) {
        pushHistory()
        markDirty()
        opt.image_url = response.data.url
        options.onSuccess?.(response)
        ElMessage.success('选项配图已上传')
      } else {
        throw new Error(response?.message || '上传失败')
      }
    } catch (err: any) {
      console.error('选项配图上传失败:', err)
      ElMessage.error('上传失败：' + (err.message || '未知错误'))
      options.onError?.(err)
    }
  }

  const clearChoiceImage = (opt: any) => {
    pushHistory()
    markDirty()
    opt.image_url = ''
  }

  /**
   * 保存某条内容的分支选项到 branch_paths。
   * 策略：先删除该起点已有的分支，再按当前编辑结果重建 —— 保证界面与库内一致。
   */
  const saveChoices = async (dialogue: any, _index?: number) => {
    if (!dialogue.content_id) {
      ElMessage.warning('请先保存本条内容，再配置分支选项')
      return
    }
    if (!projectId.value) {
      ElMessage.warning('项目信息加载中，请稍后再试')
      return
    }

    const items = (dialogue._choices || [])
      .filter((c: any) => (c.choice_text || '').trim() && c.target_content_id)

    if (items.length === 0) {
      ElMessage.warning('请至少配置一个「有文案 + 有跳转目标」的选项')
      return
    }

    // 前端先做一轮友好校验，避免无谓请求
    const seen = new Set<any>()
    for (const it of items) {
      if (it.target_content_id === dialogue.content_id) {
        ElMessage.error('选项不能跳转到自己')
        return
      }
      if (seen.has(it.target_content_id)) {
        ElMessage.error('存在重复的跳转目标，请调整后再保存')
        return
      }
      for (const c of (it.cond_items || [])) {
        if (c.variable && !Number.isFinite(Number(c.value))) {
          ElMessage.error('显示条件的比较值必须是数字')
          return
        }
      }
      seen.add(it.target_content_id)
    }

    try {
      const all = await listBranches(projectId.value as number)
      const old = (all || []).filter((b: any) => b.source_content_id === dialogue.content_id)
      for (const b of old) {
        await deleteBranch(b.path_id)
      }
      for (const it of items) {
        const condItems = (it.cond_items || [])
          .filter((c: any) => c && c.variable)
          .map((c: any) => ({
            variable: c.variable,
            op: c.op || '>=',
            value: Math.trunc(Number(c.value)),
          }))
        const conditions = condItems.length
          ? { mode: it.cond_mode === 'or' ? 'or' : 'and', items: condItems }
          : null
        const created: any = await createBranch(projectId.value as number, {
          source_content_id: dialogue.content_id,
          target_content_id: it.target_content_id,
          choice_text: it.choice_text.trim(),
          image_url: it.image_url || '',
          conditions,
        })
        // 选项是先删后建，branch_paths 主键会变；把已有译文迁移到新分支上
        if (created?.path_id) {
          it.path_id = created.path_id
          for (const [lang, text] of Object.entries(it.translations || {})) {
            if (text && String(text).trim()) {
              try {
                await saveBranchTranslation(Number(created.path_id), lang, String(text))
              } catch (e) {
                console.warn('恢复选项译文失败:', e)
              }
            }
          }
        }
      }
      await ensureChoices(dialogue, true)
      ElMessage.success(`已保存 ${items.length} 个分支选项`)
      createProjectVersion(Number(projectId.value), '保存选项分支').catch(() => {})
    } catch (e: any) {
      console.error('保存分支失败:', e)
      ElMessage.error('保存分支失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
    }
  }

  return {
    choiceTargets,
    choiceTargetLabel,
    loadJumpMap,
    jumpTargetOf,
    setJumpTarget,
    onContentTypeChange,
    parseChoiceConditions,
    ensureChoices,
    addChoice,
    addChoiceCondition,
    removeChoiceCondition,
    hasChoiceCondition,
    removeChoice,
    handleChoiceImageUpload,
    clearChoiceImage,
    saveChoices,
  }
}
