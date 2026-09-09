export const ok = (data: unknown = null) => ({ code: 0, message: 'ok', data })

export const fail = (message: string, code = 400) => ({ code, message, data: null })
