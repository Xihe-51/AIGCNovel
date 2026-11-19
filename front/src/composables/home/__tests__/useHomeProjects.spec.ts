import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import { confirmAction } from '@/utils/confirm'
import * as projectApi from '@/api/project'
import type { Project } from '@/api/project'
import { useHomeProjects } from '@/composables/home/useHomeProjects'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/utils/confirm', () => ({
  confirmAction: vi.fn(),
  confirmDanger: vi.fn(),
}))

vi.mock('@/api/project', () => ({
  getProjects: vi.fn(),
  getPublicProjects: vi.fn(),
  deleteProject: vi.fn(),
  importProject: vi.fn(),
}))

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

const makeProject = (projectId: number, title = `项目${projectId}`): Project => ({
  project_id: projectId,
  user_id: 1,
  title,
  genre: '奇幻',
  template_type: '线性叙事',
  word_count: 0,
  is_public: false,
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:00',
})

describe('useHomeProjects', () => {
  beforeEach(() => {
    vi.mocked(projectApi.getProjects).mockResolvedValue([])
    vi.mocked(projectApi.getPublicProjects).mockResolvedValue([])
    vi.mocked(projectApi.deleteProject).mockResolvedValue(undefined)
    vi.mocked(confirmAction).mockResolvedValue(false)
  })

  it('确认删除后从列表中移除该项目', async () => {
    const keep = makeProject(1, '保留')
    const removed = makeProject(2, '待删')
    vi.mocked(projectApi.getProjects).mockResolvedValue([keep, removed])
    vi.mocked(confirmAction).mockResolvedValue(true)

    const { projects, fetchProjects, confirmDelete } = useHomeProjects()
    await fetchProjects()
    expect(projects.value).toHaveLength(2)

    await confirmDelete(2)

    expect(projectApi.deleteProject).toHaveBeenCalledWith(2)
    expect(projects.value.map(p => p.project_id)).toEqual([1])
    expect(ElMessage.success).toHaveBeenCalledWith('项目已删除')
  })

  it('取消确认时不调用删除接口，列表保持不变', async () => {
    vi.mocked(projectApi.getProjects).mockResolvedValue([makeProject(1)])
    vi.mocked(confirmAction).mockResolvedValue(false)

    const { projects, fetchProjects, confirmDelete } = useHomeProjects()
    await fetchProjects()
    const snapshot = [...projects.value]

    await confirmDelete(1)

    expect(confirmAction).toHaveBeenCalled()
    expect(projectApi.deleteProject).not.toHaveBeenCalled()
    expect(projects.value).toEqual(snapshot)
  })

  it('删除失败时提示错误并重新拉取服务端列表', async () => {
    vi.mocked(projectApi.getProjects).mockResolvedValue([makeProject(1), makeProject(2)])
    vi.mocked(confirmAction).mockResolvedValue(true)
    vi.mocked(projectApi.deleteProject).mockRejectedValue(new Error('网络异常'))

    const { projects, fetchProjects, confirmDelete } = useHomeProjects()
    await fetchProjects()
    expect(projects.value).toHaveLength(2)

    vi.mocked(projectApi.getProjects).mockResolvedValue([makeProject(1)])
    vi.mocked(projectApi.getProjects).mockClear()

    await confirmDelete(2)
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('网络异常')
    expect(projectApi.getProjects).toHaveBeenCalledTimes(1)
    expect(projects.value.map(p => p.project_id)).toEqual([1])
  })
})
