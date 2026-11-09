/**
 * 静态网页播放器的 Element Plus 按需注册。
 *
 * 播放器只用到少量组件，不能像主站那样 app.use(ElementPlus) 全量注册，
 * 否则静态包会白白多下载约 1MB 的未使用组件。
 * 样式仍使用 element-plus/dist/index.css，避免按需样式带来的视觉差异。
 */
import type { App } from 'vue'
import {
  ElButton,
  ElDialog,
  ElIcon,
  ElOption,
  ElSelect,
  ElSlider,
  ElSwitch,
  ElTag,
  ElTooltip,
} from 'element-plus'
import {
  CloseBold,
  DArrowRight,
  DataLine,
  DocumentAdd,
  EditPen,
  Hide,
  Picture,
  RefreshLeft,
  Search,
  Setting,
  SwitchButton,
  VideoPlay,
  View,
  WarningFilled,
} from '@element-plus/icons-vue'

const COMPONENTS = {
  ElButton,
  ElDialog,
  ElIcon,
  ElOption,
  ElSelect,
  ElSlider,
  ElSwitch,
  ElTag,
  ElTooltip,
}

const ICONS = {
  CloseBold,
  DArrowRight,
  DataLine,
  DocumentAdd,
  EditPen,
  Hide,
  Picture,
  RefreshLeft,
  Search,
  Setting,
  SwitchButton,
  VideoPlay,
  View,
  WarningFilled,
}

/** 只注册播放器实际使用的 Element Plus 组件与图标。 */
export function registerPlayerElementPlus(app: App): void {
  for (const [name, component] of Object.entries(COMPONENTS)) {
    app.component(name, component)
  }
  for (const [name, icon] of Object.entries(ICONS)) {
    app.component(name, icon)
  }
}
