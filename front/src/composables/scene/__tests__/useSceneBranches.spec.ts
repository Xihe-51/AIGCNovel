import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listBranches, createBranch, deleteBranch } from '@/api/branch'
import { saveBranchTranslation } from '@/api/translation'
import { uploadSceneFile } from '@/api/scenes'
import { createProjectVersion } from '@/api/version'
import { useSceneBranches } from '@/composables/scene/useSceneBranches'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/api/branch', () => ({
  listBranches: vi.fn(),
  createBranch: vi.fn(),
  deleteBranch: vi.fn(),
}))

vi.mock('@/api/translation', () => ({
  saveBranchTranslation: vi.fn(),
}))

vi.mock('@/api/scenes', () => ({
  uploadSceneFile: vi.fn(),
}))

vi.mock('@/api/version', () => ({
  createProjectVersion: vi.fn(),
}))

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function createBranches(options: {
  projectId?: any
  dialogues?: any[]
  projectNodes?: any[]
  characters?: Record<number, string>
} = {}) {
  const projectId = ref<any>(options.projectId ?? 7)
  const dialogues = ref<any[]>(options.dialogues ?? [])
  const projectNodes = ref<any[]>(options.projectNodes ?? [])
  const jumpMap = ref<Record<string, any>>({})
  const pushHistory = vi.fn()
  const markDirty = vi.fn()
  const names = options.characters ?? { 100: '林瑶' }
  const getCharacterName = vi.fn((id: any) => names[id] || '未知角色')

  const api = useSceneBranches({
    projectId,
    dialogues,
    projectNodes,
    jumpMap,
    pushHistory,
    markDirty,
    getCharacterName,
  })

  return { ...api, projectId, dialogues, projectNodes, jumpMap, pushHistory, markDirty, getCharacterName }
}

beforeEach(() => {
  vi.mocked(ElMessage.success).mockReset()
  vi.mocked(ElMessage.warning).mockReset()
  vi.mocked(ElMessage.error).mockReset()
  vi.mocked(listBranches).mockReset()
  vi.mocked(createBranch).mockReset()
  vi.mocked(deleteBranch).mockReset()
  vi.mocked(saveBranchTranslation).mockReset()
  vi.mocked(uploadSceneFile).mockReset()
  vi.mocked(createProjectVersion).mockReset()
  vi.mocked(createProjectVersion).mockResolvedValue({} as any)
  vi.mocked(saveBranchTranslation).mockResolvedValue({} as any)
  vi.mocked(deleteBranch).mockResolvedValue({} as any)
})

describe('useSceneBranches / 跳转目标列表', () => {
  it('合并项目节点与当前场景台词，并排除自己', () => {
    const b = createBranches({
      projectNodes: [{ content_id: 1, order_num: 1, content_text: '开场' }],
      dialogues: [
        { content_id: 2, order_num: 1, content_text: '本节点' },
        { content_id: 3, order_num: 2, content_text: '下一句' },
      ],
    })
    const list = b.choiceTargets(0)
    expect(list.map((n: any) => n.content_id)).toEqual([1, 3])
  })

  it('同 content_id 时以当前场景台词覆盖项目节点字段', () => {
    const b = createBranches({
      projectNodes: [{ content_id: 1, order_num: 1, content_text: '旧文案', scene_title: '第一幕' }],
      dialogues: [{ content_id: 1, order_num: 1, content_text: '新文案' }],
    })
    const [node] = b.choiceTargets(9)
    expect(node.content_text).toBe('新文案')
    expect(node.scene_title).toBe('第一幕')
  })

  it('重复 content_id 只保留一份', () => {
    const b = createBranches({
      projectNodes: [{ content_id: 1 }, { content_id: 1 }],
      dialogues: [],
    })
    expect(b.choiceTargets(0)).toHaveLength(1)
  })

  it('过滤掉没有 content_id 的节点（未保存）', () => {
    const b = createBranches({
      projectNodes: [{ content_id: null, content_text: '草稿' }],
      dialogues: [{ content_text: '草稿2' }, { content_id: 5 }],
    })
    expect(b.choiceTargets(0).map((n: any) => n.content_id)).toEqual([5])
  })
})

describe('useSceneBranches / 跳转目标文案', () => {
  it('拼接场景名、序号、角色名与截断文案', () => {
    const b = createBranches()
    const label = b.choiceTargetLabel({
      scene_title: '第一幕',
      order_num: 3,
      character_id: 100,
      content_text: '这是一段很长的台词内容需要被截断',
    })
    expect(label).toBe('第一幕 · #3 林瑶：这是一段很长的台词内容需')
  })

  it('未知角色不带角色名前缀', () => {
    const b = createBranches()
    const label = b.choiceTargetLabel({ order_num: 2, character_id: 999, content_text: '旁白句' })
    expect(label).toBe('#2 旁白句')
  })

  it('换行替换成空格', () => {
    const b = createBranches()
    const label = b.choiceTargetLabel({ order_num: 1, character_id: 100, content_text: '上句\n下句' })
    expect(label).toContain('上句 下句')
  })
})

describe('useSceneBranches / 自动跳转映射', () => {
  it('没有 projectId 时清空映射且不发请求', async () => {
    const b = createBranches({ projectId: '' })
    b.jumpMap.value = { 1: { target_content_id: 2 } }
    await b.loadJumpMap()
    expect(b.jumpMap.value).toEqual({})
    expect(listBranches).not.toHaveBeenCalled()
  })

  it('每个起点只保留第一条分支', async () => {
    vi.mocked(listBranches).mockResolvedValue([
      { path_id: 1, source_content_id: 10, target_content_id: 20 },
      { path_id: 2, source_content_id: 10, target_content_id: 30 },
      { path_id: 3, source_content_id: 11, target_content_id: 21 },
    ] as any)
    const b = createBranches()
    await b.loadJumpMap()
    expect(b.jumpMap.value[10].path_id).toBe(1)
    expect(b.jumpMap.value[11].path_id).toBe(3)
  })

  it('读取失败时清空映射并告警', async () => {
    vi.mocked(listBranches).mockRejectedValue(new Error('boom'))
    const b = createBranches()
    b.jumpMap.value = { 1: { target_content_id: 2 } }
    await b.loadJumpMap()
    expect(b.jumpMap.value).toEqual({})
  })

  it('jumpTargetOf 无分支时返回空串', () => {
    const b = createBranches()
    expect(b.jumpTargetOf({ content_id: 88 })).toBe('')
    b.jumpMap.value = { 88: { target_content_id: 99 } }
    expect(b.jumpTargetOf({ content_id: 88 })).toBe(99)
  })
})

describe('useSceneBranches / 设置自动跳转', () => {
  it('先删除旧分支再新建，并刷新映射', async () => {
    vi.mocked(listBranches).mockResolvedValue([
      { path_id: 11, source_content_id: 1 },
      { path_id: 12, source_content_id: 2 },
    ] as any)
    vi.mocked(createBranch).mockResolvedValue({ path_id: 13 } as any)
    const b = createBranches()
    await b.setJumpTarget({ content_id: 1 }, 50)

    expect(deleteBranch).toHaveBeenCalledTimes(1)
    expect(deleteBranch).toHaveBeenCalledWith(11)
    expect(createBranch).toHaveBeenCalledWith(7, {
      source_content_id: 1,
      target_content_id: 50,
      choice_text: '',
      conditions: null,
    })
    expect(ElMessage.success).toHaveBeenCalledWith('已设置自动跳转')
  })

  it('清空目标时只删不建', async () => {
    vi.mocked(listBranches).mockResolvedValue([{ path_id: 11, source_content_id: 1 }] as any)
    const b = createBranches()
    await b.setJumpTarget({ content_id: 1 }, '')

    expect(deleteBranch).toHaveBeenCalledWith(11)
    expect(createBranch).not.toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('已取消自动跳转')
  })

  it('未保存的内容不发请求', async () => {
    const b = createBranches()
    await b.setJumpTarget({ content_id: null }, 50)
    expect(listBranches).not.toHaveBeenCalled()
  })

  it('失败时提示后端错误信息', async () => {
    vi.mocked(listBranches).mockRejectedValue({ response: { data: { message: '节点不存在' } } })
    const b = createBranches()
    await b.setJumpTarget({ content_id: 1 }, 50)
    expect(ElMessage.error).toHaveBeenCalledWith('设置跳转失败：节点不存在')
  })
})

describe('useSceneBranches / 切换内容类型', () => {
  it('切成「选择」时记录历史并懒加载分支', async () => {
    vi.mocked(listBranches).mockResolvedValue([] as any)
    const b = createBranches()
    const dialogue: any = { content_id: 1, content_type: '选择' }
    b.onContentTypeChange(dialogue)
    await flush()

    expect(b.pushHistory).toHaveBeenCalledTimes(1)
    expect(b.markDirty).toHaveBeenCalledTimes(1)
    expect(listBranches).toHaveBeenCalledWith(7)
    expect(dialogue._choices).toEqual([])
  })

  it('切成其它类型不发请求', async () => {
    const b = createBranches()
    const dialogue: any = { content_id: 1, content_type: '对话' }
    b.onContentTypeChange(dialogue)
    await flush()

    expect(b.pushHistory).toHaveBeenCalledTimes(1)
    expect(b.markDirty).toHaveBeenCalledTimes(1)
    expect(listBranches).not.toHaveBeenCalled()
  })
})

describe('useSceneBranches / 条件解析', () => {
  it('条件组按 mode 保留 and/or', () => {
    const b = createBranches()
    expect(
      b.parseChoiceConditions({ mode: 'or', items: [{ variable: '好感', op: '>=', value: 5 }] })
    ).toEqual({ cond_mode: 'or', cond_items: [{ variable: '好感', op: '>=', value: 5 }] })
  })

  it('条件组为空时补一条空条件', () => {
    const b = createBranches()
    expect(b.parseChoiceConditions({ mode: 'and', items: [] })).toEqual({
      cond_mode: 'and',
      cond_items: [{ variable: '', op: '>=', value: 0 }],
    })
  })

  it('单条件结构转成单元素条件组', () => {
    const b = createBranches()
    expect(b.parseChoiceConditions({ variable: '金币', op: '<', value: 10 })).toEqual({
      cond_mode: 'and',
      cond_items: [{ variable: '金币', op: '<', value: 10 }],
    })
  })

  it('null / 非对象 / 无变量都回退默认空条件', () => {
    const b = createBranches()
    const expected = { cond_mode: 'and', cond_items: [{ variable: '', op: '>=', value: 0 }] }
    expect(b.parseChoiceConditions(null)).toEqual(expected)
    expect(b.parseChoiceConditions('x')).toEqual(expected)
    expect(b.parseChoiceConditions({})).toEqual(expected)
  })
})

describe('useSceneBranches / 加载分支选项', () => {
  it('已加载且未 force 时不重复请求', async () => {
    const b = createBranches()
    const dialogue: any = { content_id: 1, _choices: [{ choice_text: 'x' }] }
    await b.ensureChoices(dialogue)
    expect(listBranches).not.toHaveBeenCalled()
    expect(dialogue._choices).toHaveLength(1)
  })

  it('把 branch_paths 转成编辑器结构', async () => {
    vi.mocked(listBranches).mockResolvedValue([
      {
        path_id: 5,
        source_content_id: 1,
        choice_text: '离开',
        target_content_id: 9,
        translations: { en: 'Leave' },
        conditions: { variable: '好感', op: '>=', value: 3 },
      },
      { path_id: 6, source_content_id: 2, choice_text: '别的' },
    ] as any)
    const b = createBranches()
    const dialogue: any = { content_id: 1 }
    await b.ensureChoices(dialogue)

    expect(dialogue._choices).toEqual([
      {
        path_id: 5,
        choice_text: '离开',
        translations: { en: 'Leave' },
        target_content_id: 9,
        cond_mode: 'and',
        cond_items: [{ variable: '好感', op: '>=', value: 3 }],
      },
    ])
  })

  it('force 为 true 时重新拉取', async () => {
    vi.mocked(listBranches).mockResolvedValue([] as any)
    const b = createBranches()
    const dialogue: any = { content_id: 1, _choices: [{ choice_text: '旧' }] }
    await b.ensureChoices(dialogue, true)
    expect(listBranches).toHaveBeenCalledTimes(1)
    expect(dialogue._choices).toEqual([])
  })

  it('加载失败时保留空数组', async () => {
    vi.mocked(listBranches).mockRejectedValue(new Error('boom'))
    const b = createBranches()
    const dialogue: any = { content_id: 1 }
    await b.ensureChoices(dialogue)
    expect(dialogue._choices).toEqual([])
  })

  it('未保存内容直接置空不发请求', async () => {
    const b = createBranches()
    const dialogue: any = { content_id: null }
    await b.ensureChoices(dialogue)
    expect(dialogue._choices).toEqual([])
    expect(listBranches).not.toHaveBeenCalled()
  })
})

describe('useSceneBranches / 选项增删', () => {
  it('addChoice 追加一条带默认条件的空选项', () => {
    const b = createBranches()
    const dialogue: any = {}
    b.addChoice(dialogue)
    expect(dialogue._choices).toEqual([
      { choice_text: '', target_content_id: null, cond_mode: 'and', cond_items: [{ variable: '', op: '>=', value: 0 }] },
    ])
    expect(b.pushHistory).toHaveBeenCalledTimes(1)
    expect(b.markDirty).toHaveBeenCalledTimes(1)
  })

  it('addChoiceCondition 给指定选项追加空条件', () => {
    const b = createBranches()
    const dialogue: any = { _choices: [{ cond_mode: 'and', cond_items: [] }] }
    b.addChoiceCondition(dialogue, 0)
    expect(dialogue._choices[0].cond_items).toEqual([{ variable: '', op: '>=', value: 0 }])
    expect(b.markDirty).toHaveBeenCalledTimes(1)
  })

  it('removeChoiceCondition 删到空时补一条空条件', () => {
    const b = createBranches()
    const dialogue: any = { _choices: [{ cond_items: [{ variable: '好感', op: '>=', value: 1 }] }] }
    b.removeChoiceCondition(dialogue, 0, 0)
    expect(dialogue._choices[0].cond_items).toEqual([{ variable: '', op: '>=', value: 0 }])
  })

  it('removeChoiceCondition 越界时不报错', () => {
    const b = createBranches()
    const dialogue: any = { _choices: [] }
    expect(() => b.removeChoiceCondition(dialogue, 3, 0)).not.toThrow()
    expect(b.pushHistory).toHaveBeenCalledTimes(1)
  })

  it('hasChoiceCondition 只认填了变量名的条件', () => {
    const b = createBranches()
    expect(b.hasChoiceCondition({ cond_items: [{ variable: '', op: '>=', value: 0 }] })).toBe(false)
    expect(b.hasChoiceCondition({ cond_items: [{ variable: '好感' }] })).toBe(true)
    expect(b.hasChoiceCondition({})).toBe(false)
  })

  it('removeChoice 删除指定选项', () => {
    const b = createBranches()
    const dialogue: any = { _choices: [{ choice_text: 'a' }, { choice_text: 'b' }] }
    b.removeChoice(dialogue, 0)
    expect(dialogue._choices).toEqual([{ choice_text: 'b' }])
    expect(b.pushHistory).toHaveBeenCalledTimes(1)
  })
})

describe('useSceneBranches / 选项配图', () => {
  it('上传成功后写入 image_url 并回调 onSuccess', async () => {
    vi.mocked(uploadSceneFile).mockResolvedValue({ success: true, data: { url: '/img/a.png' } } as any)
    const b = createBranches()
    const opt: any = {}
    const options = { file: new File(['x'], 'a.png'), onSuccess: vi.fn(), onError: vi.fn() }
    await b.handleChoiceImageUpload(options, opt)

    expect(opt.image_url).toBe('/img/a.png')
    expect(options.onSuccess).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('选项配图已上传')
    expect(b.pushHistory).toHaveBeenCalledTimes(1)
    expect(b.markDirty).toHaveBeenCalledTimes(1)
  })

  it('没有 projectId 时提示且不上传', async () => {
    const b = createBranches({ projectId: '' })
    const options = { file: new File(['x'], 'a.png') }
    await b.handleChoiceImageUpload(options, {})
    expect(ElMessage.warning).toHaveBeenCalledWith('项目信息加载中，请稍后再试')
    expect(uploadSceneFile).not.toHaveBeenCalled()
  })

  it('上传返回失败时走 onError', async () => {
    vi.mocked(uploadSceneFile).mockResolvedValue({ success: false, message: '空间不足' } as any)
    const b = createBranches()
    const opt: any = {}
    const options = { file: new File(['x'], 'a.png'), onError: vi.fn() }
    await b.handleChoiceImageUpload(options, opt)

    expect(options.onError).toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalledWith('上传失败：空间不足')
    expect(opt.image_url).toBeUndefined()
  })

  it('clearChoiceImage 清空配图', () => {
    const b = createBranches()
    const opt: any = { image_url: '/img/a.png' }
    b.clearChoiceImage(opt)
    expect(opt.image_url).toBe('')
    expect(b.markDirty).toHaveBeenCalledTimes(1)
  })
})

describe('useSceneBranches / 保存分支', () => {
  it('内容未保存时提示', async () => {
    const b = createBranches()
    await b.saveChoices({ content_id: null, _choices: [] })
    expect(ElMessage.warning).toHaveBeenCalledWith('请先保存本条内容，再配置分支选项')
    expect(listBranches).not.toHaveBeenCalled()
  })

  it('没有 projectId 时提示', async () => {
    const b = createBranches({ projectId: '' })
    await b.saveChoices({ content_id: 1, _choices: [] })
    expect(ElMessage.warning).toHaveBeenCalledWith('项目信息加载中，请稍后再试')
  })

  it('没有完整选项（缺文案或缺目标）时提示', async () => {
    const b = createBranches()
    await b.saveChoices({
      content_id: 1,
      _choices: [
        { choice_text: '', target_content_id: 2 },
        { choice_text: '走', target_content_id: null },
      ],
    })
    expect(ElMessage.warning).toHaveBeenCalledWith('请至少配置一个「有文案 + 有跳转目标」的选项')
    expect(listBranches).not.toHaveBeenCalled()
  })

  it('拒绝跳转到自己', async () => {
    const b = createBranches()
    await b.saveChoices({ content_id: 1, _choices: [{ choice_text: '自环', target_content_id: 1 }] })
    expect(ElMessage.error).toHaveBeenCalledWith('选项不能跳转到自己')
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('拒绝重复的跳转目标', async () => {
    const b = createBranches()
    await b.saveChoices({
      content_id: 1,
      _choices: [
        { choice_text: 'a', target_content_id: 2 },
        { choice_text: 'b', target_content_id: 2 },
      ],
    })
    expect(ElMessage.error).toHaveBeenCalledWith('存在重复的跳转目标，请调整后再保存')
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('拒绝非数字的条件比较值', async () => {
    const b = createBranches()
    await b.saveChoices({
      content_id: 1,
      _choices: [
        {
          choice_text: 'a',
          target_content_id: 2,
          cond_items: [{ variable: '好感', op: '>=', value: 'abc' }],
        },
      ],
    })
    expect(ElMessage.error).toHaveBeenCalledWith('显示条件的比较值必须是数字')
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('先删后建，迁移译文并刷新列表', async () => {
    vi.mocked(listBranches)
      .mockResolvedValueOnce([
        { path_id: 11, source_content_id: 1 },
        { path_id: 12, source_content_id: 2 },
      ] as any)
      .mockResolvedValueOnce([{ path_id: 21, source_content_id: 1, choice_text: '走', target_content_id: 2 }] as any)
    vi.mocked(createBranch).mockResolvedValue({ path_id: 21 } as any)

    const b = createBranches()
    const dialogue: any = {
      content_id: 1,
      _choices: [
        {
          choice_text: ' 走 ',
          target_content_id: 2,
          image_url: '/img/a.png',
          translations: { en: 'Go', ja: '  ' },
          cond_mode: 'or',
          cond_items: [{ variable: '好感', op: '>=', value: '3.9' }],
        },
      ],
    }
    await b.saveChoices(dialogue, 0)

    expect(deleteBranch).toHaveBeenCalledTimes(1)
    expect(deleteBranch).toHaveBeenCalledWith(11)
    expect(createBranch).toHaveBeenCalledWith(7, {
      source_content_id: 1,
      target_content_id: 2,
      choice_text: '走',
      image_url: '/img/a.png',
      conditions: { mode: 'or', items: [{ variable: '好感', op: '>=', value: 3 }] },
    })
    expect(saveBranchTranslation).toHaveBeenCalledTimes(1)
    expect(saveBranchTranslation).toHaveBeenCalledWith(21, 'en', 'Go')
    expect(dialogue._choices[0].path_id).toBe(21)
    expect(ElMessage.success).toHaveBeenCalledWith('已保存 1 个分支选项')
    expect(createProjectVersion).toHaveBeenCalledWith(7, '保存选项分支')
  })

  it('没有条件时不写 conditions', async () => {
    vi.mocked(listBranches).mockResolvedValueOnce([] as any).mockResolvedValueOnce([] as any)
    vi.mocked(createBranch).mockResolvedValue({ path_id: 21 } as any)

    const b = createBranches()
    await b.saveChoices({
      content_id: 1,
      _choices: [
        { choice_text: '走', target_content_id: 2, cond_items: [{ variable: '', op: '>=', value: 0 }] },
      ],
    })

    expect(vi.mocked(createBranch).mock.calls[0][1].conditions).toBeNull()
  })

  it('删除或创建失败时提示错误', async () => {
    vi.mocked(listBranches).mockRejectedValue({ response: { data: { message: '分支被占用' } } })
    const b = createBranches()
    await b.saveChoices({ content_id: 1, _choices: [{ choice_text: '走', target_content_id: 2 }] })
    expect(ElMessage.error).toHaveBeenCalledWith('保存分支失败：分支被占用')
    expect(ElMessage.success).not.toHaveBeenCalled()
  })
})
