import { db } from '../db/database.ts'
import { todayInTz } from './dates.ts'

/** 级联删除单个用户及其全部数据（与管理员删除共用同一套 SQL） */
export function purgeUser(uid: number): void {
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM courses WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM push_tasks WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM push_logs WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM users WHERE id = ?').run(uid)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/** 毕业自动清理：删除 graduate_date 已到（毕业日当天 0 点起）的普通用户账户及全部数据。 */
export function purgeGraduatedUsers(): number {
  const today = todayInTz()
  const rows = db.prepare(
    "SELECT id, username, graduate_date FROM users WHERE graduate_date != '' AND graduate_date <= ? AND role != 'admin'",
  ).all(today) as { id: number; username: string; graduate_date: string }[]
  let n = 0
  for (const u of rows) {
    try {
      purgeUser(u.id)
      console.log(`[graduate-purge] 已删除毕业用户 ${u.username}（毕业日 ${u.graduate_date}）`)
      n++
    } catch (e) {
      console.error(`[graduate-purge] 删除 ${u.username} 失败:`, (e as Error).message)
    }
  }
  return n
}
