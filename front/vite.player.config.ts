import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 静态网页发布包专用的播放器构建：
// - base 使用相对路径，压缩包解压到任意子目录都能直接打开
// - 入口是 player.html，不包含登录页/创作页
export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist-player',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: fileURLToPath(new URL('./player.html', import.meta.url)),
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('element-plus') || id.includes('@element-plus')) return 'element-plus'
          }
        }
      }
    }
  }
})
