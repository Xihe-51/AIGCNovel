/**
 * 角色立绘抠图：单张/批量调用本地抠图服务，配合进度弹窗与结果回填。
 *
 * 只依赖角色与立绘列表，抠图结果写回列表并同步默认头像；
 * 进度条用「假进度 + 真结果」的方式，避免大图处理期间界面像卡死。
 */
import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'
import { ElLoading, ElMessage } from 'element-plus'
import { cutoutCharacterAvatar } from '@/api/character'
import { confirmAction } from '@/utils/confirm'

/** 立绘最小字段：页面列表里的 image_url 可能为空，抠图前会自行过滤 */
interface CutoutAvatar {
  avatar_id: number
  character_id: number
  image_url?: string
  avatar_type?: string
  costume?: string
  is_default?: boolean
}

export interface ProjectCutoutContext {
  /** 页面里的角色与立绘列表沿用宽泛类型，避免与后端字段可选性冲突 */
  characters: Ref<any[]>
  characterAvatars: Ref<any[]>
  currentCharacterAvatars: Ref<any[]>
  selectedAvatar: Ref<any>
}

export function useProjectCutout(ctx: ProjectCutoutContext) {
  const cutoutLoadingId = ref<number | null>(null)
  const cutoutBatchRunning = ref(false)
  const cutoutDialogVisible = ref(false)
  const cutoutTarget = ref<CutoutAvatar | null>(null)
  const cutoutPercent = ref(0)
  const cutoutStage = ref('')
  const cutoutStatus = ref<'running' | 'success' | 'error'>('running')
  const cutoutError = ref('')
  let cutoutTimer: ReturnType<typeof setInterval> | null = null
  let cutoutCloseTimer: ReturnType<typeof setTimeout> | null = null

  const stopCutoutTimer = () => {
    if (cutoutTimer) {
      clearInterval(cutoutTimer)
      cutoutTimer = null
    }
  }

  const clearCutoutCloseTimer = () => {
    if (cutoutCloseTimer) {
      clearTimeout(cutoutCloseTimer)
      cutoutCloseTimer = null
    }
  }

  const startCutoutTimer = () => {
    stopCutoutTimer()
    cutoutPercent.value = 4
    cutoutStage.value = '准备图片'
    cutoutTimer = setInterval(() => {
      if (cutoutStatus.value !== 'running') return
      const p = cutoutPercent.value
      let next = p
      if (p < 30) next = p + 4
      else if (p < 60) next = p + 2
      else if (p < 85) next = p + 1
      cutoutPercent.value = Math.min(85, next)
      cutoutStage.value = cutoutPercent.value < 15
        ? '准备图片'
        : cutoutPercent.value < 32
          ? '加载本地抠图模型'
          : cutoutPercent.value < 88
            ? '识别人物轮廓并去除背景'
            : '生成透明底图片'
    }, 450)
  }

  const cutoutErrorMessage = (e: any) => {
    const message = e?.response?.data?.message
    if (message) return message
    if (e?.code === 'ECONNABORTED') return '处理超时，请重试'
    if (!e?.response) return '无法连接后端服务，请确认后端已启动'
    if (e?.response?.status === 503) return '本地抠图模型暂不可用，请稍后重试'
    return '抠图失败，请重试'
  }

  const applyCutoutResult = (avatar: CutoutAvatar, data: { image_url: string; already_transparent?: boolean }) => {
    // PNG 覆盖会沿用原地址，加时间戳避免浏览器继续用缓存的旧图
    const displayUrl = data.already_transparent
      ? data.image_url
      : `${data.image_url}${data.image_url.includes('?') ? '&' : '?'}v=${Date.now()}`
    const target = ctx.characterAvatars.value.find(a => a.avatar_id === avatar.avatar_id)
    if (target) target.image_url = displayUrl
    if (ctx.selectedAvatar.value?.avatar_id === avatar.avatar_id) {
      ctx.selectedAvatar.value = { ...ctx.selectedAvatar.value, image_url: displayUrl }
    }
    if (avatar.is_default) {
      const ch = ctx.characters.value.find(c => c.character_id === avatar.character_id)
      if (ch) ch.avatar_url = displayUrl
    }
  }

  const runCutout = async (avatar: CutoutAvatar) => {
    const targetId = avatar.avatar_id
    cutoutTarget.value = avatar
    cutoutStatus.value = 'running'
    cutoutError.value = ''
    cutoutDialogVisible.value = true
    cutoutLoadingId.value = targetId
    clearCutoutCloseTimer()
    startCutoutTimer()

    try {
      const data = await cutoutCharacterAvatar(targetId)
      stopCutoutTimer()
      cutoutPercent.value = 100
      cutoutStatus.value = 'success'
      cutoutStage.value = data.already_transparent ? '这张立绘已经是透明背景' : '抠图完成'
      applyCutoutResult(avatar, data)
      ElMessage.success(data.already_transparent ? '已经是透明背景，无需再抠图' : '抠图完成，背景已透明')
      cutoutCloseTimer = setTimeout(() => {
        if (cutoutTarget.value?.avatar_id === targetId) cutoutDialogVisible.value = false
      }, 1200)
    } catch (e: any) {
      stopCutoutTimer()
      cutoutStatus.value = 'error'
      cutoutStage.value = '抠图失败'
      cutoutError.value = cutoutErrorMessage(e)
      ElMessage.error(cutoutError.value)
    } finally {
      cutoutLoadingId.value = null
    }
  }

  const cutoutAvatar = async (avatar: CutoutAvatar) => {
    if (cutoutBatchRunning.value) {
      ElMessage.warning('正在批量抠图，请稍候')
      return
    }
    if (cutoutLoadingId.value !== null) {
      ElMessage.warning('上一张立绘还在抠图，请稍候')
      return
    }
    const confirmed = await confirmAction(
      '会自动识别人物并去掉背景，生成透明底立绘。PNG 会直接覆盖原文件，其他格式会另存为 PNG。是否继续？',
      { title: '角色抠图', confirmButtonText: '开始抠图', type: 'info' },
    )
    if (!confirmed) return
    runCutout(avatar)
  }

  const retryCutout = () => {
    if (!cutoutTarget.value) return
    runCutout(cutoutTarget.value)
  }

  // 批量抠图：逐张处理当前角色的立绘，失败不影响后续
  const batchCutout = async () => {
    if (cutoutBatchRunning.value || cutoutLoadingId.value !== null) return
    const list = ctx.currentCharacterAvatars.value.filter(
      a => a.image_url && !/^https?:\/\//i.test(a.image_url)
    )
    if (!list.length) {
      ElMessage.warning('这个角色还没有可抠图的本地立绘')
      return
    }
    const confirmed = await confirmAction(
      `将依次处理 ${list.length} 张立绘：自动去掉背景并生成透明底 PNG，原 PNG 会被覆盖。是否继续？`,
      { title: '批量抠图', confirmButtonText: '开始', type: 'info' },
    )
    if (!confirmed) return

    cutoutBatchRunning.value = true
    const loading = ElLoading.service({
      lock: true,
      text: `批量抠图 0/${list.length}`,
      background: 'rgba(255, 255, 255, 0.7)',
    })
    let done = 0
    let skipped = 0
    let failed = 0
    try {
      for (let i = 0; i < list.length; i++) {
        const avatar = list[i]
        loading.setText(`批量抠图 ${i + 1}/${list.length}：${avatar.costume || avatar.avatar_type}`)
        try {
          const data = await cutoutCharacterAvatar(avatar.avatar_id)
          applyCutoutResult(avatar, data)
          data.already_transparent ? skipped++ : done++
        } catch (e) {
          failed++
          console.warn('批量抠图失败', avatar.avatar_id, e)
        }
      }
    } finally {
      loading.close()
      cutoutBatchRunning.value = false
    }

    const parts = [`处理 ${done} 张`]
    if (skipped) parts.push(`已是透明 ${skipped} 张`)
    if (failed) parts.push(`失败 ${failed} 张`)
    const text = `批量抠图完成：${parts.join('，')}`
    if (failed) ElMessage.warning(text)
    else ElMessage.success(text)
  }

  onUnmounted(() => {
    stopCutoutTimer()
    clearCutoutCloseTimer()
  })

  return {
    cutoutLoadingId,
    cutoutBatchRunning,
    cutoutDialogVisible,
    cutoutTarget,
    cutoutPercent,
    cutoutStage,
    cutoutStatus,
    cutoutError,
    stopCutoutTimer,
    cutoutAvatar,
    retryCutout,
    batchCutout,
  }
}
