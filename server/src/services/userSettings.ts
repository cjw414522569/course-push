import { db } from '../db/database.ts'

export type UserSettings = Record<string, string>

const CACHE = new Map<number, UserSettings>()

export function getUserSettings(userId: number): UserSettings {
  const hit = CACHE.get(userId)
  if (hit) return hit
  const row = db.prepare('SELECT data FROM user_settings WHERE user_id = ?').get(userId) as { data: string } | undefined
  const data: UserSettings = row ? JSON.parse(row.data) : {}
  CACHE.set(userId, data)
  return data
}

export function getSetting(userId: number, key: string, def = ''): string {
  return getUserSettings(userId)[key] ?? def
}

export function setSetting(userId: number, key: string, value: string): void {
  const data = getUserSettings(userId)
  data[key] = value
  db.prepare('INSERT INTO user_settings (user_id, data) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data')
    .run(userId, JSON.stringify(data))
}

/** 新用户初始化默认设置 */
export function initUserSettings(userId: number): void {
  db.prepare('INSERT OR IGNORE INTO user_settings (user_id, data) VALUES (?,?)')
    .run(userId, JSON.stringify({
      semester_start: mondayOfNow(),
      total_weeks: '20',
      noon_start: '12:00',
      noon_end: '14:00',
      default_channel: 'wechat',
      default_topic: '',
      push_template: 'markdown',
    }))
}

function mondayOfNow(): string {
  const d = new Date()
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

/** settings 变更后清缓存（本进程内单实例，直接清即可） */
export function invalidateSettingsCache(userId: number): void {
  CACHE.delete(userId)
}
