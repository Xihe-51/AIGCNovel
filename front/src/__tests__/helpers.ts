/**
 * 在真实组件实例里运行 composable，让 onMounted / onBeforeUnmount / watch 正常工作。
 */
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

export function withSetup<T>(composable: () => T) {
  let result!: T
  const wrapper = mount(defineComponent({
    setup() {
      result = composable()
      return () => h('div')
    }
  }))
  return { result, wrapper }
}
