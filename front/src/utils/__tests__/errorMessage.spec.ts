import { describe, expect, it } from 'vitest'
import { DEFAULT_ERROR_MESSAGE, extractErrorMessage, formatErrorMessage } from '../errorMessage'

describe('extractErrorMessage', () => {
	it('空值一律退回默认文案', () => {
		expect(extractErrorMessage(null)).toBe(DEFAULT_ERROR_MESSAGE)
		expect(extractErrorMessage(undefined)).toBe(DEFAULT_ERROR_MESSAGE)
		expect(extractErrorMessage({})).toBe(DEFAULT_ERROR_MESSAGE)
		expect(extractErrorMessage(42)).toBe(DEFAULT_ERROR_MESSAGE)
	})

	it('字符串异常直接可用，空白退回默认文案', () => {
		expect(extractErrorMessage('网络异常')).toBe('网络异常')
		expect(extractErrorMessage('')).toBe(DEFAULT_ERROR_MESSAGE)
		expect(extractErrorMessage('   ')).toBe(DEFAULT_ERROR_MESSAGE)
	})

	it('Error 实例取 message', () => {
		expect(extractErrorMessage(new Error('boom'))).toBe('boom')
		expect(extractErrorMessage(new Error(''))).toBe(DEFAULT_ERROR_MESSAGE)
	})

	it('后端字段按 message → error → detail 的优先级取值', () => {
		expect(extractErrorMessage({ response: { data: { message: '服务器炸了' } } })).toBe('服务器炸了')
		expect(extractErrorMessage({ response: { data: { error: 'E1001' } } })).toBe('E1001')
		expect(extractErrorMessage({ response: { data: { detail: '无权限' } } })).toBe('无权限')
		expect(
			extractErrorMessage({
				message: 'Request failed',
				response: { data: { detail: '无权限' } },
			})
		).toBe('无权限')
	})

	it('非字符串字段被忽略，继续往下退', () => {
		expect(extractErrorMessage({ response: { data: { message: 500 } }, message: '兜底' })).toBe('兜底')
		expect(extractErrorMessage({ response: { data: { message: '  ' } }, message: '兜底' })).toBe(
			'兜底'
		)
		expect(extractErrorMessage({ response: null, message: '兜底' })).toBe('兜底')
	})

	it('三个后端字段同时存在时取 message', () => {
		expect(
			extractErrorMessage({
				response: { data: { message: '库存不足', error: 'E2001', detail: '无权限' } },
			})
		).toBe('库存不足')
	})

	it('取值时裁掉首尾空白', () => {
		expect(extractErrorMessage({ message: '  boom  ' })).toBe('boom')
		expect(extractErrorMessage({ response: { data: { detail: '\n 无权限 \t' } } })).toBe('无权限')
	})

	it('response.data 不是对象时安全跳过', () => {
		expect(
			extractErrorMessage({ response: { data: '<html>500</html>' }, message: '兜底' })
		).toBe('兜底')
		expect(extractErrorMessage({ response: { data: [] }, message: '兜底' })).toBe('兜底')
		expect(extractErrorMessage({ response: { data: null }, message: '兜底' })).toBe('兜底')
	})

	it('非预期的异常类型一律退回兜底', () => {
		expect(extractErrorMessage(false)).toBe(DEFAULT_ERROR_MESSAGE)
		expect(extractErrorMessage(0)).toBe(DEFAULT_ERROR_MESSAGE)
		expect(extractErrorMessage([])).toBe(DEFAULT_ERROR_MESSAGE)
		expect(extractErrorMessage(() => 'boom')).toBe(DEFAULT_ERROR_MESSAGE)
		expect(extractErrorMessage(new Date(0))).toBe(DEFAULT_ERROR_MESSAGE)
	})

	it('支持自定义兜底文案', () => {
		expect(extractErrorMessage(null, '读取失败')).toBe('读取失败')
		expect(extractErrorMessage('', '读取失败')).toBe('读取失败')
	})
})

describe('formatErrorMessage', () => {
	it('拼出「前缀：原因」', () => {
		expect(formatErrorMessage('保存失败', { response: { data: { message: '磁盘满了' } } })).toBe(
			'保存失败：磁盘满了'
		)
		expect(formatErrorMessage('巡检失败', null)).toBe('巡检失败：未知错误')
	})

	it('可指定兜底文案', () => {
		expect(formatErrorMessage('重排失败', new Error('超时'))).toBe('重排失败：超时')
		expect(formatErrorMessage('重排失败', {}, '网络错误')).toBe('重排失败：网络错误')
	})
})
