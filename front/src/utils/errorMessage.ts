/**
 * 接口错误 → 一句可读文案。
 * 优先取后端约定的 response.data.message / error / detail，再退回 Error.message。
 */
export const DEFAULT_ERROR_MESSAGE = '未知错误'

const pick = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export function extractErrorMessage(
	error: unknown,
	fallback: string = DEFAULT_ERROR_MESSAGE
): string {
	if (typeof error === 'string') return pick(error) || fallback
	if (!error || typeof error !== 'object') return fallback
	const source = error as any
	return (
		pick(source.response?.data?.message) ||
		pick(source.response?.data?.error) ||
		pick(source.response?.data?.detail) ||
		pick(source.message) ||
		fallback
	)
}

/** 带前缀的提示，如 `保存失败：网络异常` */
export const formatErrorMessage = (
	label: string,
	error: unknown,
	fallback?: string
): string => `${label}：${extractErrorMessage(error, fallback)}`
