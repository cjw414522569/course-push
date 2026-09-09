import crypto from 'node:crypto'
import { db } from '../db/database.ts'

export interface ApiKeyRow {
  id: number
  user_id: number
  name: string
  key_hash: string
  key_prefix: string
  enabled: number
  last_used_at: string | null
  created_at: string
}

const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex')

/** 生成新密钥：kb_ + 40 位十六进制。仅此一次返回明文，库中只存哈希。 */
export function createApiKey(userId: number, name: string): { id: number; key: string } {
  const key = 'kb_' + crypto.randomBytes(20).toString('hex')
  const now = new Date().toISOString()
  const info = db.prepare(
    'INSERT INTO api_keys (user_id, name, key_hash, key_prefix, enabled, created_at) VALUES (?,?,?,?,1,?)',
  ).run(userId, name.trim() || '未命名密钥', sha256(key), key.slice(0, 8), now)
  return { id: Number(info.lastInsertRowid), key }
}

export function listApiKeys(userId: number): Omit<ApiKeyRow, 'key_hash'>[] {
  return db.prepare(
    'SELECT id, user_id, name, key_prefix, enabled, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY id DESC',
  ).all(userId) as unknown as Omit<ApiKeyRow, 'key_hash'>[]
}

export function setApiKeyEnabled(userId: number, id: number, enabled: boolean): void {
  db.prepare('UPDATE api_keys SET enabled = ? WHERE id = ? AND user_id = ?').run(enabled ? 1 : 0, id, userId)
}

export function deleteApiKey(userId: number, id: number): void {
  db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(id, userId)
}

/** 认证查找：命中返回 user_id 并刷新 last_used_at；用户被停用时同样拒绝 */
export function findUserByApiKey(key: string): number | null {
  if (!key.startsWith('kb_')) return null
  const row = db.prepare(
    'SELECT k.id, k.user_id, k.enabled, u.disabled AS user_disabled FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ?',
  ).get(sha256(key)) as { id: number; user_id: number; enabled: number; user_disabled: number } | undefined
  if (!row || !row.enabled || row.user_disabled) return null
  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id)
  return row.user_id
}
