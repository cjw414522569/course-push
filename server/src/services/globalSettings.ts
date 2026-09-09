import { db } from '../db/database.ts'

/** 全局系统设置（跨用户，仅管理员可改） */
export function getGlobal(key: string, def = ''): string {
  const row = db.prepare('SELECT value FROM global_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? def
}

export function setGlobal(key: string, value: string): void {
  db.prepare('INSERT INTO global_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}
