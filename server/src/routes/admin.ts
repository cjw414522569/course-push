import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { db } from '../db/database.ts'
import { ok, fail } from '../utils.ts'
import { getGlobal, setGlobal } from '../services/globalSettings.ts'
import { initUserSettings } from '../services/userSettings.ts'

interface UserRow {
  id: number
  username: string
  nickname: string
  role: string
  disabled: number
  created_at: string
}

/** 管理员守卫：authenticate 通过后再验角色 */
function adminGuard(req: { user?: { role?: string } }, reply: { code: (n: number) => { send: (b: unknown) => void } }): boolean {
  if (req.user?.role !== 'admin') {
    reply.code(403).send(fail('需要管理员权限', 403))
    return false
  }
  return true
}

export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  const admin = { onRequest: [app.authenticate] }

  // ---------- 注册开关 ----------
  app.get('/api/admin/registration', admin, async (req, reply) => {
    if (!adminGuard(req, reply)) return
    return ok({ enabled: getGlobal('registration_enabled', 'true') === 'true' })
  })

  app.put('/api/admin/registration', admin, async (req, reply) => {
    if (!adminGuard(req, reply)) return
    const b = (req.body || {}) as { enabled?: boolean }
    setGlobal('registration_enabled', b.enabled ? 'true' : 'false')
    return ok({ enabled: !!b.enabled })
  })

  // ---------- 用户管理 ----------
  app.get('/api/admin/users', admin, async (req, reply) => {
    if (!adminGuard(req, reply)) return
    const rows = db.prepare(
      `SELECT u.id, u.username, u.nickname, u.role, u.disabled, u.grade, u.graduate_date, u.created_at,
              (SELECT COUNT(*) FROM courses c WHERE c.user_id = u.id) AS course_count,
              (SELECT COUNT(*) FROM push_tasks t WHERE t.user_id = u.id) AS task_count,
              (SELECT COUNT(*) FROM api_keys k WHERE k.user_id = u.id) AS key_count
         FROM users u ORDER BY u.id`,
    ).all() as unknown as (UserRow & { course_count: number; task_count: number; key_count: number })[]
    return ok(rows)
  })

  // 修改用户：昵称 / 角色 / 停用
  app.put('/api/admin/users/:id', admin, async (req, reply) => {
    if (!adminGuard(req, reply)) return
    const me = req.user as { id: number }
    const id = Number((req.params as { id: string }).id)
    const row = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as { id: number; role: string } | undefined
    if (!row) return reply.code(404).send(fail('用户不存在', 404))
    const b = (req.body || {}) as { nickname?: string; role?: string; disabled?: boolean }

    // 防自锁：不能停用/降级自己
    if (id === me.id && (b.disabled === true || (b.role && b.role !== 'admin'))) {
      return reply.code(400).send(fail('不能停用或降级自己的账号'))
    }
    if (b.nickname !== undefined) db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(b.nickname.trim().slice(0, 20), id)
    if (b.role !== undefined) {
      if (!['admin', 'user'].includes(b.role)) return reply.code(400).send(fail('角色不合法'))
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, id)
    }
    if (b.disabled !== undefined) db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(b.disabled ? 1 : 0, id)
    return ok()
  })

  // 重置密码
  app.put('/api/admin/users/:id/password', admin, async (req, reply) => {
    if (!adminGuard(req, reply)) return
    const id = Number((req.params as { id: string }).id)
    const { newPassword } = (req.body || {}) as { newPassword?: string }
    if (!newPassword || newPassword.length < 6) return reply.code(400).send(fail('新密码至少 6 位'))
    const row = db.prepare('SELECT id FROM users WHERE id = ?').get(id)
    if (!row) return reply.code(404).send(fail('用户不存在', 404))
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), id)
    return ok()
  })

  // 删除用户（连同其全部业务数据；不能删自己和其他管理员需显式确认前端已做）
  app.delete('/api/admin/users/:id', admin, async (req, reply) => {
    if (!adminGuard(req, reply)) return
    const me = req.user as { id: number }
    const id = Number((req.params as { id: string }).id)
    if (id === me.id) return reply.code(400).send(fail('不能删除自己的账号'))
    const row = db.prepare('SELECT id FROM users WHERE id = ?').get(id)
    if (!row) return reply.code(404).send(fail('用户不存在', 404))
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM courses WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM push_tasks WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM push_logs WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM users WHERE id = ?').run(id)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    return ok()
  })
}

// 注册开关查询（auth 路由用）
export function registrationEnabled(): boolean {
  return getGlobal('registration_enabled', 'true') === 'true'
}
