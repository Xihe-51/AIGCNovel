import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// 必须在 element-plus 的 CSS 之后引入：main.css 里的 :root 主题变量要覆盖 Element 默认值
import './assets/main.css'
import App from './App.vue'
import router from './router'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import TechNavCircle from './components/TechNavCircle.vue'

const app = createApp(App)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus)
app.use(router)
app.component('TechNavCircle', TechNavCircle)
app.mount('#app')