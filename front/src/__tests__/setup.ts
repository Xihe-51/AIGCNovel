/**
 * Vitest 全局准备：每个用例前清空 localStorage，避免播放器设置/撤销栈互相污染。
 */
import { beforeEach } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
})
