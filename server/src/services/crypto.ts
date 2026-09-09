import crypto from 'node:crypto'
import { MASTER_KEY } from '../config.ts'

const ALGO = 'aes-256-gcm'

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, MASTER_KEY, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = crypto.createDecipheriv(ALGO, MASTER_KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/** 脱敏显示：保留前 4 后 4 */
export function mask(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '****'
  return value.slice(0, 4) + '****' + value.slice(-4)
}
