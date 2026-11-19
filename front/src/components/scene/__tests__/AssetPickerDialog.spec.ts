import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AssetPickerDialog from '@/components/scene/AssetPickerDialog.vue'

const ITEMS = [
  { url: '/static/a.png', usage_count: 2 },
  { url: '/static/b.png', usage_count: 0 },
]

const EL_STUBS = {
  'el-dialog': {
    props: ['modelValue', 'title'],
    emits: ['update:modelValue'],
    template: '<div class="stub-dialog"><slot /><slot name="footer" /></div>',
  },
  'el-button': { template: '<button><slot /></button>' },
}

const mountDialog = (props: Record<string, any> = {}) => {
  const warnings: string[] = []
  const wrapper = mount(AssetPickerDialog, {
    props: {
      visible: true,
      kind: 'image',
      loading: false,
      items: ITEMS,
      baseUrl: 'http://localhost:8088',
      ...props,
    } as any,
    global: {
      stubs: EL_STUBS,
      config: {
        warnHandler: (message: string) => warnings.push(message),
      },
    },
  })
  return { wrapper, warnings }
}

describe('AssetPickerDialog', () => {
  it('省略 selectedUrl 时用空串兜底，不产生 props 校验告警', () => {
    const { wrapper, warnings } = mountDialog()

    expect(warnings.join(' | ')).toBe('')
    expect(wrapper.findAll('.asset-pick-item.is-selected')).toHaveLength(0)
  })

  it('selectedUrl 命中时只高亮对应素材', () => {
    const { wrapper } = mountDialog({ selectedUrl: '/static/b.png' })

    const selected = wrapper.findAll('.asset-pick-item.is-selected')
    expect(selected).toHaveLength(1)
    expect(selected[0].find('.asset-pick-url').text()).toBe('b.png')
  })

  it('点击素材抛出领域事件 select', async () => {
    const { wrapper } = mountDialog()

    await wrapper.findAll('.asset-pick-item')[0].trigger('click')

    const emitted = wrapper.emitted('select')
    expect(emitted).toHaveLength(1)
    expect((emitted![0][0] as any).url).toBe('/static/a.png')
  })

  it('加载中与空素材库各自给出提示', () => {
    expect(mountDialog({ loading: true }).wrapper.text()).toContain('正在读取素材')

    const empty = mountDialog({ items: [], kind: 'audio' }).wrapper
    expect(empty.text()).toContain('素材库里还没有可用的音频')
  })
})
