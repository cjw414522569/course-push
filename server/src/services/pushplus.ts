import { decrypt } from './crypto.ts'

const BASE = 'https://www.pushplus.plus'

export interface SendResult {
  ok: boolean
  shortCode: string
  error: string
  raw: string
}

export interface SendOptions {
  title: string
  content: string
  template?: string // html | txt | json | markdown
  channel?: string
  topic?: string
}

/** 调用 pushplus /send。接口为异步：code=200 仅代表入队，返回流水号 shortCode。 */
export async function send(encToken: string, opts: SendOptions): Promise<SendResult> {
  const token = decrypt(encToken)
  const body: Record<string, unknown> = {
    token,
    title: opts.title,
    content: opts.content,
    template: opts.template || 'markdown',
    channel: opts.channel || 'wechat',
  }
  if (opts.topic) body.topic = opts.topic

  try {
    const res = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const raw = await res.text()
    let json: { code?: number; msg?: string; data?: string } = {}
    try { json = JSON.parse(raw) } catch { /* 非 JSON 响应原样保留 */ }
    if (res.ok && json.code === 200) {
      return { ok: true, shortCode: json.data || '', error: '', raw }
    }
    return { ok: false, shortCode: '', error: json.msg || `HTTP ${res.status}`, raw }
  } catch (err) {
    return { ok: false, shortCode: '', error: (err as Error).message, raw: '' }
  }
}

export interface QueryResult {
  ok: boolean
  status: number // 0-未投递 1-发送中 2-已发送 3-发送失败
  errorMessage: string
}

/** 用 AccessKey 查询发送结果。 */
export async function querySendResult(accessKey: string, shortCode: string): Promise<QueryResult> {
  try {
    const res = await fetch(`${BASE}/api/open/message/sendMessageResult?shortCode=${encodeURIComponent(shortCode)}`, {
      headers: { 'access-key': accessKey },
      signal: AbortSignal.timeout(10_000),
    })
    const json = (await res.json()) as { code?: number; msg?: string; data?: { status?: number; errorMessage?: string } }
    if (res.ok && json.code === 200) {
      return { ok: true, status: json.data?.status ?? -1, errorMessage: json.data?.errorMessage || '' }
    }
    return { ok: false, status: -1, errorMessage: json.msg || `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, status: -1, errorMessage: (err as Error).message }
  }
}

/** 用 AccessKey 拉取用户信息（含明文 token），用于「一键获取 token」。 */
export async function getUserInfo(accessKey: string): Promise<{ ok: boolean; token?: string; nickName?: string; error?: string }> {
  try {
    const res = await fetch(`${BASE}/api/open/user/myInfo`, {
      headers: { 'access-key': accessKey },
      signal: AbortSignal.timeout(10_000),
    })
    const json = (await res.json()) as { code?: number; msg?: string; data?: { token?: string; nickName?: string } }
    if (res.ok && json.code === 200 && json.data?.token) {
      return { ok: true, token: json.data.token, nickName: json.data.nickName }
    }
    return { ok: false, error: json.msg || `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
