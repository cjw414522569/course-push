import type { FastifyInstance } from 'fastify'
import { db } from '../db/database.ts'
import { ok, fail } from '../utils.ts'
import { getSetting } from '../services/userSettings.ts'
import { dayView, weekOf } from '../services/schedule.ts'
import { addDays, todayInTz } from '../services/dates.ts'
import { reloadAllTasks, scheduleTask, unschedule, runTask, runningJobCount } from '../services/scheduler.ts'
import type { TaskRow } from '../services/scheduler.ts'

interface TaskBody {
  name?: string
  type?: string
  time?: string
  days?: number[]
  enabled?: boolean
  send_empty?: boolean
}

/** 由 time + days 生成 5 段 cron；days 空则每天 */
function buildCron(time: string, days: number[]): { cron: string; error: string | null } {
  const m = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return { cron: '', error: '时间格式应为 HH:mm' }
  const h = +m[1]
  const min = +m[2]
  if (h < 0 || h > 23 || min < 0 || min > 59) return { cron: '', error: '时间不合法' }
  const ds = [...new Set(days.filter((d) => d >= 0 && d <= 7))].sort()
  const dayPart = ds.length === 0 || ds.length === 7 ? '*' : ds.join(',')
  return { cron: `${min} ${h} * * ${dayPart}`, error: null }
}

export default async function taskRoutes(app: FastifyInstance): Promise<void> {
  const auth = { onRequest: [app.authenticate] }

  // 任务列表（当前用户）
  app.get('/api/tasks', auth, async (req) => {
    const uid = (req.user as { id: number }).id
    const rows = db.prepare('SELECT * FROM push_tasks WHERE user_id = ? ORDER BY id').all(uid) as unknown as TaskRow[]
    return ok(rows.map((r) => ({ ...r, days: JSON.parse(r.days || '[]'), enabled: !!r.enabled, send_empty: !!r.send_empty })))
  })

  // 新增任务
  app.post('/api/tasks', auth, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const b = (req.body || {}) as TaskBody
    if (!b.name || !b.name.trim()) return reply.code(400).send(fail('任务名称不能为空'))
    const type = b.type || ''
    if (!['today', 'tomorrow', 'week'].includes(type)) return reply.code(400).send(fail('任务类型不合法'))
    const { cron, error } = buildCron(b.time || '07:30', b.days || [])
    if (error) return reply.code(400).send(fail(error))
    const now = new Date().toISOString()
    const info = db.prepare(
      'INSERT INTO push_tasks (user_id, name, type, time, days, cron_expr, enabled, send_empty, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(uid, b.name.trim(), type, b.time || '07:30', JSON.stringify(b.days || []), cron, b.enabled === false ? 0 : 1, b.send_empty ? 1 : 0, now, now)
    const row = db.prepare('SELECT * FROM push_tasks WHERE id = ?').get(info.lastInsertRowid) as unknown as TaskRow
    scheduleTask(row)
    return ok({ id: Number(info.lastInsertRowid) })
  })

  // 修改任务（仅本人任务）
  app.put('/api/tasks/:id', auth, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT * FROM push_tasks WHERE id = ? AND user_id = ?').get(id, uid) as unknown as TaskRow | undefined
    if (!row) return reply.code(404).send(fail('任务不存在', 404))
    const b = (req.body || {}) as TaskBody
    const name = b.name?.trim() || row.name
    const type = b.type || row.type
    if (!['today', 'tomorrow', 'week'].includes(type)) return reply.code(400).send(fail('任务类型不合法'))
    const time = b.time || row.time
    const days = b.days ?? JSON.parse(row.days || '[]')
    const { cron, error } = buildCron(time, days)
    if (error) return reply.code(400).send(fail(error))
    const enabled = b.enabled === undefined ? row.enabled : b.enabled ? 1 : 0
    const sendEmpty = b.send_empty === undefined ? row.send_empty : b.send_empty ? 1 : 0
    db.prepare('UPDATE push_tasks SET name=?, type=?, time=?, days=?, cron_expr=?, enabled=?, send_empty=?, updated_at=? WHERE id=?')
      .run(name, type, time, JSON.stringify(days), cron, enabled, sendEmpty, new Date().toISOString(), id)
    const fresh = db.prepare('SELECT * FROM push_tasks WHERE id = ?').get(id) as unknown as TaskRow
    scheduleTask(fresh)
    return ok()
  })

  // 启用 / 停用（仅本人任务）
  app.put('/api/tasks/:id/toggle', auth, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT * FROM push_tasks WHERE id = ? AND user_id = ?').get(id, uid) as unknown as TaskRow | undefined
    if (!row) return reply.code(404).send(fail('任务不存在', 404))
    const enabled = row.enabled ? 0 : 1
    db.prepare('UPDATE push_tasks SET enabled=?, updated_at=? WHERE id=?').run(enabled, new Date().toISOString(), id)
    if (enabled) scheduleTask({ ...row, enabled })
    else unschedule(row.id)
    return ok({ enabled: !!enabled })
  })

  // 立即执行一次（仅本人任务）
  app.post('/api/tasks/:id/run', auth, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT * FROM push_tasks WHERE id = ? AND user_id = ?').get(id, uid) as unknown as TaskRow | undefined
    if (!row) return reply.code(404).send(fail('任务不存在', 404))
    runTask(row, true).catch((e) => console.error(`[manual ${id}]`, e))
    return ok({ message: '已触发，结果请查看推送日志' })
  })

  // 删除任务（仅本人任务）
  app.delete('/api/tasks/:id', auth, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT * FROM push_tasks WHERE id = ? AND user_id = ?').get(id, uid) as unknown as TaskRow | undefined
    if (!row) return reply.code(404).send(fail('任务不存在', 404))
    db.prepare('DELETE FROM push_tasks WHERE id = ?').run(id)
    unschedule(row.id)
    return ok()
  })
  // ---------- 推送日志（当前用户） ----------
  app.get('/api/logs', auth, async (req) => {
    const uid = (req.user as { id: number }).id
    const q = req.query as { page?: string; pageSize?: string }
    const page = Math.max(1, +(q.page || 1))
    const pageSize = Math.min(100, Math.max(1, +(q.pageSize || 20)))
    const total = (db.prepare('SELECT COUNT(*) AS n FROM push_logs WHERE user_id = ?').get(uid) as { n: number }).n
    const rows = db.prepare('SELECT * FROM push_logs WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?').all(uid, pageSize, (page - 1) * pageSize)
    return ok({ total, page, pageSize, list: rows })
  })

  app.delete('/api/logs', auth, async (req) => {
    const uid = (req.user as { id: number }).id
    db.prepare('DELETE FROM push_logs WHERE user_id = ?').run(uid)
    return ok()
  })

  // ---------- 仪表盘统计（当前用户） ----------
  app.get('/api/stats', auth, async (req) => {
    const uid = (req.user as { id: number }).id
    const today = todayInTz()
    const dv = dayView(uid, today)
    const tomorrow = dayView(uid, addDays(today, 1))
    const tokenConfigured = !!getSetting(uid, 'pushplus_token')
    const taskCount = db.prepare('SELECT COUNT(*) AS n FROM push_tasks WHERE user_id = ?').get(uid) as { n: number }
    const taskEnabled = db.prepare('SELECT COUNT(*) AS n FROM push_tasks WHERE user_id = ? AND enabled = 1').get(uid) as { n: number }
    const courseTotal = db.prepare('SELECT COUNT(*) AS n FROM courses WHERE user_id = ?').get(uid) as { n: number }
    const recentLogs = db.prepare('SELECT * FROM push_logs WHERE user_id = ? ORDER BY id DESC LIMIT 8').all(uid)
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const stat = (status: number) =>
      (db.prepare('SELECT COUNT(*) AS n FROM push_logs WHERE user_id = ? AND created_at >= ? AND status = ?').get(uid, since, status) as { n: number }).n
    return ok({
      today: { date: today, weekdayCn: dv.weekdayCn, week: weekOf(uid, today), courses: dv.courses },
      tomorrow_count: tomorrow.courses.length,
      course_total: courseTotal.n,
      token_configured: tokenConfigured,
      task_total: taskCount.n,
      task_enabled: taskEnabled.n,
      running_jobs: runningJobCount(),
      push_7d: { sent: stat(1), skipped: stat(2), failed: stat(3) },
      recent_logs: recentLogs,
    })
  })
}
