import { beforeEach, describe, expect, it } from 'vitest'
import { usePlayerOwnership, readCurrentUserId } from '@/composables/player/usePlayerOwnership'

const base64url = (value: string) => btoa(value)
  .replace(/=+$/, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')

const makeToken = (payload: Record<string, any>) => [
  base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  base64url(JSON.stringify(payload)),
  'signature',
].join('.')

const createOwnership = (state = { releaseView: false, editQuery: false }) => usePlayerOwnership({
  isReleaseView: () => state.releaseView,
  isEditQuery: () => state.editQuery,
})

describe('usePlayerOwnership', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('未登录时不认作者，也没法进入演出模式', () => {
    const state = { releaseView: false, editQuery: true }
    const owner = createOwnership(state)
    owner.setProjectOwnerId(7)

    expect(owner.currentUserId).toBe('')
    expect(owner.isOwner.value).toBe(false)
    expect(owner.canPerform.value).toBe(false)
  })

  it('作者本人带 ?edit=1 预览时可以进入演出模式', () => {
    localStorage.setItem('token', makeToken({ identity: 7 }))
    const state = { releaseView: false, editQuery: true }
    const owner = createOwnership(state)
    owner.setProjectOwnerId(7)

    expect(owner.currentUserId).toBe('7')
    expect(owner.isOwner.value).toBe(true)
    expect(owner.canPerform.value).toBe(true)
  })

  it('作品作者未知时按非作者处理，拿到作者 id 后才开放', () => {
    localStorage.setItem('token', makeToken({ identity: '7' }))
    const owner = createOwnership({ releaseView: false, editQuery: true })

    expect(owner.isOwner.value).toBe(false)
    expect(owner.canPerform.value).toBe(false)

    owner.setProjectOwnerId('7')

    expect(owner.isOwner.value).toBe(true)
    expect(owner.canPerform.value).toBe(true)
  })

  it('非作者登录不会开放演出模式', () => {
    localStorage.setItem('token', makeToken({ identity: 9 }))
    const owner = createOwnership({ releaseView: false, editQuery: true })
    owner.setProjectOwnerId(7)

    expect(owner.isOwner.value).toBe(false)
    expect(owner.canPerform.value).toBe(false)
  })

  it('缺 ?edit=1 或处于发布视图时同样关闭演出模式', () => {
    localStorage.setItem('token', makeToken({ identity: 7 }))

    const noEdit = createOwnership({ releaseView: false, editQuery: false })
    noEdit.setProjectOwnerId(7)
    expect(noEdit.isOwner.value).toBe(true)
    expect(noEdit.canPerform.value).toBe(false)

    const release = createOwnership({ releaseView: true, editQuery: true })
    release.setProjectOwnerId(7)
    expect(release.canPerform.value).toBe(false)
  })

  it('令牌损坏或缺少 identity 时按未登录处理，不抛错', () => {
    localStorage.setItem('token', 'not-a-jwt')
    expect(readCurrentUserId()).toBe('')
    expect(() => createOwnership()).not.toThrow()

    localStorage.setItem('token', makeToken({ sub: 'abc' }))
    expect(readCurrentUserId()).toBe('')
  })

  it('作者 id 为 0 时不算作者', () => {
    localStorage.setItem('token', makeToken({ identity: 0 }))
    const owner = createOwnership({ releaseView: false, editQuery: true })
    owner.setProjectOwnerId(0)

    expect(owner.isOwner.value).toBe(false)
  })
})
