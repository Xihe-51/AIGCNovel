import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import {
  usePlayerTypewriter,
  typeIntervalOf,
  MIN_AUTO_DELAY_MS,
} from '../usePlayerTypewriter'

function createTypewriter(options: {
  text?: string
  speed?: number
  autoDelay?: number
  canAutoAdvance?: boolean
} = {}) {
  const fullText = ref(options.text ?? 'abc')
  const speed = ref(options.speed ?? 1)
  const autoDelay = ref(options.autoDelay ?? 1)
  const flags = { canAutoAdvance: options.canAutoAdvance ?? true }
  const onAdvance = vi.fn()
  const canAutoAdvance = vi.fn(() => flags.canAutoAdvance)
  const api = usePlayerTypewriter({
    getFullText: () => fullText.value,
    getSpeed: () => Number(speed.value),
    canAutoAdvance,
    getAutoDelay: () => Number(autoDelay.value),
    onAdvance,
  })
  return { ...api, fullText, speed, autoDelay, flags, canAutoAdvance, onAdvance }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('typeIntervalOf', () => {
  it('速度 1 对应 15ms', () => {
    expect(typeIntervalOf(1)).toBe(15)
  })

  it('速度 2 对应 30ms', () => {
    expect(typeIntervalOf(2)).toBe(30)
  })

  it('速度 3 与未知速度都回落到 60ms', () => {
    expect(typeIntervalOf(3)).toBe(60)
    expect(typeIntervalOf(9)).toBe(60)
  })

  it('速度 0 与非法值同样回落到 60ms', () => {
    expect(typeIntervalOf(0)).toBe(60)
    expect(Number.isNaN(typeIntervalOf(Number.NaN))).toBe(false)
    expect(typeIntervalOf(undefined as any)).toBe(60)
    expect(typeIntervalOf('2' as any)).toBe(30)
  })

  it('自动前进下限为 500ms', () => {
    expect(MIN_AUTO_DELAY_MS).toBe(500)
  })
})

describe('typeOut 逐字呈现', () => {
  it('空文本直接整句呈现并标记结束', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: '' })
    p.typeOut()
    expect(p.displayedText.value).toBe('')
    expect(p.isTyping.value).toBe(false)
  })

  it('速度为 0 时不做逐字动画', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: '你好世界', speed: 0 })
    p.typeOut()
    expect(p.displayedText.value).toBe('你好世界')
    expect(p.isTyping.value).toBe(false)
  })

  it('按速度逐字推进，到末尾自动结束', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: 'abcd', speed: 1 })
    p.typeOut()
    expect(p.displayedText.value).toBe('')
    expect(p.isTyping.value).toBe(true)

    vi.advanceTimersByTime(15)
    expect(p.displayedText.value).toBe('a')
    vi.advanceTimersByTime(15)
    expect(p.displayedText.value).toBe('ab')
    vi.advanceTimersByTime(15)
    expect(p.displayedText.value).toBe('abc')
    vi.advanceTimersByTime(15)
    expect(p.displayedText.value).toBe('abcd')
    expect(p.isTyping.value).toBe(false)
  })

  it('速度 2 使用 30ms 步长', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: 'abc', speed: 2 })
    p.typeOut()
    vi.advanceTimersByTime(29)
    expect(p.displayedText.value).toBe('')
    vi.advanceTimersByTime(1)
    expect(p.displayedText.value).toBe('a')
  })

  it('clearTyping 停表后文本不再前进', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: 'abcd', speed: 1 })
    p.typeOut()
    vi.advanceTimersByTime(15)
    expect(p.displayedText.value).toBe('a')

    p.clearTyping()
    vi.advanceTimersByTime(1000)
    expect(p.displayedText.value).toBe('a')
    expect(p.isTyping.value).toBe(true)
  })

  it('clearTyping 在没有计时器时是安全的', () => {
    vi.useFakeTimers()
    const p = createTypewriter()
    expect(() => p.clearTyping()).not.toThrow()
  })

  it('重复 typeOut 会重置进度而不是叠加计时器', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: 'abc', speed: 1 })
    p.typeOut()
    vi.advanceTimersByTime(15)
    expect(p.displayedText.value).toBe('a')

    p.typeOut()
    expect(p.displayedText.value).toBe('')
    vi.advanceTimersByTime(15)
    expect(p.displayedText.value).toBe('a')
    vi.advanceTimersByTime(15)
    expect(p.displayedText.value).toBe('ab')
  })

  it('finishTyping 立即补全整句并结束打字', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: 'abcdef', speed: 1 })
    p.typeOut()
    vi.advanceTimersByTime(15)
    p.finishTyping()
    expect(p.displayedText.value).toBe('abcdef')
    expect(p.isTyping.value).toBe(false)

    vi.advanceTimersByTime(1000)
    expect(p.displayedText.value).toBe('abcdef')
  })
})

describe('自动前进排期', () => {
  it('打字结束后按设置间隔触发前进', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: 'ab', speed: 1, autoDelay: 1 })
    p.typeOut()
    vi.advanceTimersByTime(30)
    expect(p.isTyping.value).toBe(false)
    expect(p.onAdvance).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000 - 1)
    expect(p.onAdvance).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(p.onAdvance).toHaveBeenCalledTimes(1)
  })

  it('间隔小于下限时按 500ms 夹紧', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: '', autoDelay: 0 })
    p.typeOut()
    vi.advanceTimersByTime(MIN_AUTO_DELAY_MS - 1)
    expect(p.onAdvance).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(p.onAdvance).toHaveBeenCalledTimes(1)
  })

  it('间隔大于下限时按设置放大', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: '', autoDelay: 2 })
    p.typeOut()
    vi.advanceTimersByTime(1999)
    expect(p.onAdvance).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(p.onAdvance).toHaveBeenCalledTimes(1)
  })

  it('不满足自动前进条件时静默跳过', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: '', autoDelay: 1 })
    p.flags.canAutoAdvance = false
    p.scheduleAutoAdvance()
    vi.advanceTimersByTime(5000)
    expect(p.canAutoAdvance).toHaveBeenCalled()
    expect(p.onAdvance).not.toHaveBeenCalled()
  })

  it('条件恢复后能再次排期前进', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: '', autoDelay: 1 })
    p.flags.canAutoAdvance = false
    p.scheduleAutoAdvance()
    vi.advanceTimersByTime(600)
    expect(p.onAdvance).not.toHaveBeenCalled()

    p.flags.canAutoAdvance = true
    p.scheduleAutoAdvance()
    vi.advanceTimersByTime(1000)
    expect(p.onAdvance).toHaveBeenCalledTimes(1)
  })

  it('scheduleAutoAdvanceAfter 会清掉上一次的定时器', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: '' })
    p.scheduleAutoAdvanceAfter(1000)
    p.scheduleAutoAdvanceAfter(2000)

    vi.advanceTimersByTime(1000)
    expect(p.onAdvance).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(p.onAdvance).toHaveBeenCalledTimes(1)
  })

  it('scheduleAutoAdvanceAfter 对非法间隔按 0 处理', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: '' })
    p.scheduleAutoAdvanceAfter(Number.NaN)
    vi.advanceTimersByTime(0)
    expect(p.onAdvance).toHaveBeenCalledTimes(1)
  })

  it('clearAutoTimer 取消待触发的前进', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: '' })
    p.scheduleAutoAdvanceAfter(1000)
    p.clearAutoTimer()
    vi.advanceTimersByTime(5000)
    expect(p.onAdvance).not.toHaveBeenCalled()
  })
})

describe('disposeTypewriter 与外部状态', () => {
  it('一次性清掉打字与自动前进两个计时器', () => {
    vi.useFakeTimers()
    const p = createTypewriter({ text: 'abcd', speed: 1 })
    p.typeOut()
    vi.advanceTimersByTime(15)
    p.disposeTypewriter()

    vi.advanceTimersByTime(5000)
    expect(p.displayedText.value).toBe('a')
    expect(p.onAdvance).not.toHaveBeenCalled()
  })

  it('可复用外部传入的显示状态 ref', () => {
    const displayedText = ref('旧文本')
    const isTyping = ref(true)
    const api = usePlayerTypewriter(
      {
        getFullText: () => 'x',
        getSpeed: () => 0,
        canAutoAdvance: () => false,
        getAutoDelay: () => 1,
        onAdvance: () => {},
      },
      { displayedText, isTyping },
    )

    expect(api.displayedText).toBe(displayedText)
    expect(api.isTyping).toBe(isTyping)

    api.typeOut()
    expect(displayedText.value).toBe('x')
    expect(isTyping.value).toBe(false)
  })
})
