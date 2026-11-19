/**
 * 作品归属与作者预览权限：从登录令牌解出当前用户，再与作品作者比对。
 *
 * 只有「作者本人 + 未走发布视图 + 带 ?edit=1」三者同时成立才开放演出编辑，
 * 公开发布的玩家端不会渲染任何编辑入口。
 */
import { computed, ref } from 'vue'
import { jwtDecode } from 'jwt-decode'

const TOKEN_KEY = 'token'

/** 从登录令牌解出用户身份，缺失或损坏一律按未登录处理 */
export function readCurrentUserId(): string {
  try {
    const token = globalThis.localStorage?.getItem(TOKEN_KEY)
    if (!token) return ''
    const decoded = jwtDecode<{ identity?: string | number }>(token)
    return decoded?.identity ? String(decoded.identity) : ''
  } catch (e) {
    return ''
  }
}

export interface PlayerOwnershipContext {
  /** 发布视图（静态包或 ?release=1）：固定剥离编辑入口 */
  isReleaseView: () => boolean
  /** 预览地址是否带 ?edit=1 */
  isEditQuery: () => boolean
}

export function usePlayerOwnership(ctx: PlayerOwnershipContext) {
  const currentUserId = readCurrentUserId()
  const projectOwnerId = ref(0)

  const isOwner = computed(() =>
    !!currentUserId
    && projectOwnerId.value > 0
    && String(projectOwnerId.value) === currentUserId
  )

  const canPerform = computed(() =>
    !ctx.isReleaseView()
    && ctx.isEditQuery()
    && isOwner.value
  )

  const setProjectOwnerId = (value: any) => {
    projectOwnerId.value = Number(value) || 0
  }

  return { currentUserId, projectOwnerId, isOwner, canPerform, setProjectOwnerId }
}
