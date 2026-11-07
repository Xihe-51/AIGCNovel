/**
 * 静态网页发布包播放器入口。
 *
 * 与平台播放器复用同一个 ExportProject 组件，区别只有：
 * - 用 hash 路由，解压后放到任意静态目录都能直接打开
 * - story.js 提供全部只读数据，接口请求由 staticAdapter 接管
 * - 存档 / 已读 / 成就等玩家状态保存在浏览器 localStorage
 */
import { createApp, defineComponent, h } from 'vue'
import { RouterView, createRouter, createWebHashHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './assets/main.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import ExportProject from './views/ExportProject.vue'
import { enableStaticMode } from './utils/request'
import { installStaticAdapter } from './static/staticAdapter'
import type { StaticStory } from './static/staticAdapter'

declare global {
  interface Window {
    __AIGC_STATIC__?: boolean
    __AIGC_STATIC_STORY__?: StaticStory
  }
}

const showFatal = (message: string) => {
  const root = document.getElementById('app')
  if (!root) return
  const tip = document.createElement('div')
  tip.className = 'static-fatal'
  tip.textContent = message
  root.innerHTML = ''
  root.appendChild(tip)
}

const loadStory = () =>
  new Promise<StaticStory>((resolve, reject) => {
    if (window.__AIGC_STATIC_STORY__) {
      resolve(window.__AIGC_STATIC_STORY__)
      return
    }
    const script = document.createElement('script')
    script.src = './story.js'
    script.onload = () => {
      if (window.__AIGC_STATIC_STORY__) {
        resolve(window.__AIGC_STATIC_STORY__)
      } else {
        reject(new Error('story.js 中没有找到作品数据'))
      }
    }
    script.onerror = () => reject(new Error('无法读取 story.js'))
    document.head.appendChild(script)
  })

loadStory()
  .then((story) => {
    if (!story || !story.endpoints) {
      showFatal('作品数据不完整，请重新导出静态网页包。')
      return
    }

    enableStaticMode()
    installStaticAdapter(story)

    const pid = String(story.project_id)
    if (story.title) document.title = story.title

    const StaticHome = defineComponent({
      name: 'StaticHome',
      setup() {
        return () =>
          h('div', { class: 'static-home' }, [
            h('div', { class: 'static-home-card' }, [
              h('h1', null, story.title || '视觉小说'),
              h('p', null, '本作为独立网页版，阅读进度与存档保存在当前浏览器中。'),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => router.push(`/view/${pid}`),
                },
                '开始阅读'
              ),
            ]),
          ])
      },
    })

    const router = createRouter({
      history: createWebHashHistory(),
      routes: [
        { path: '/', redirect: `/view/${pid}` },
        {
          path: `/view/${pid}`,
          name: 'static-player',
          component: ExportProject,
          props: { projectId: pid },
        },
        { path: '/home', name: 'static-home', component: StaticHome },
        { path: '/:pathMatch(.*)*', redirect: `/view/${pid}` },
      ],
    })

    const app = createApp({
      render: () => h(RouterView),
    })
    for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
      app.component(key, component)
    }
    app.use(ElementPlus)
    app.use(router)
    app.mount('#app')
  })
  .catch((error: Error) => {
    showFatal(`静态播放器启动失败：${error.message}。请确认 story.js 与 player.html 位于同一目录。`)
  })
