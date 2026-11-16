import { onMounted, onUnmounted } from 'vue'

/**
 * 首页背景随页面滚动做位移视差。
 * setup 阶段注册一次、卸载时移除，避免重复绑定滚动监听。
 */
export function useHomeBackground(selector = '.background') {
  let background: HTMLElement | null = null

  const handleScroll = () => {
    if (!background) return
    const scrollY = window.scrollY
    background.style.backgroundPosition =
      scrollY !== 0 ? `calc(50% + ${scrollY}px) calc(50% + ${scrollY}px)` : ''
  }

  onMounted(() => {
    background = document.querySelector(selector) as HTMLElement | null
    if (!background) return
    window.addEventListener('scroll', handleScroll, { passive: true })
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', handleScroll)
    background = null
  })
}
