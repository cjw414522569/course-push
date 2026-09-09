import type { FastifyInstance } from 'fastify'
import { db } from '../db/database.ts'
import { ok, fail } from '../utils.ts'
import { allCourses, allTimes, dayView, weekOf } from '../services/schedule.ts'
import type { Course } from '../services/schedule.ts'
import { renderDay, renderDayHtml, renderWeek, renderWeekHtml } from '../services/render.ts'
import { addDays, mondayOf, todayInTz } from '../services/dates.ts'

type CourseBody = {
  name?: string
  teacher?: string
  location?: string
  weekday?: number
  start_period?: number
  end_period?: number
  weeks?: string
  odd_even?: string
  color?: string
  note?: string
}

function validCourse(b: CourseBody): string | null {
  if (!b.name || !b.name.trim()) return '课程名不能为空'
  if (!b.weekday || b.weekday < 1 || b.weekday > 7) return '星期应为 1-7'
  if (!b.start_period || !b.end_period || b.start_period < 1 || b.end_period > 20) return '节次不合法'
  if (b.end_period < b.start_period) return '结束节次不能早于开始节次'
  return null
}

/** 节次区间重叠检测：[s1,e1] 与 [s2,e2] 有交集 */
function overlaps(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS <= bE && bS <= aE
}

/** 某用户同星期节次冲突检查；excludeId 用于更新时排除自身 */
function conflictOn(userId: number, weekday: number, start: number, end: number, excludeId?: number): string | null {
  const rows = db.prepare('SELECT id, name, start_period, end_period FROM courses WHERE user_id = ? AND weekday = ?')
    .all(userId, weekday) as { id: number; name: string; start_period: number; end_period: number }[]
  const hit = rows.find((r) => r.id !== excludeId && overlaps(start, end, r.start_period, r.end_period))
  return hit ? `与「${hit.name}」时间冲突（第${hit.start_period}-${hit.end_period}节）` : null
}

export default async function courseRoutes(app: FastifyInstance): Promise<void> {
  // 全部课程（当前用户）
  app.get('/api/courses', { onRequest: [app.authenticate] }, async (req) => {
    return ok(allCourses((req.user as { id: number }).id))
  })

  // 新增
  app.post('/api/courses', { onRequest: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const b = (req.body || {}) as CourseBody
    const err = validCourse(b)
    if (err) return reply.code(400).send(fail(err))
    const conflict = conflictOn(uid, b.weekday!, b.start_period!, b.end_period!)
    if (conflict) return reply.code(409).send(fail(conflict, 409))
    const now = new Date().toISOString()
    const info = db.prepare(
      'INSERT INTO courses (user_id, name, teacher, location, weekday, start_period, end_period, weeks, odd_even, color, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      uid, b.name!.trim(), b.teacher || '', b.location || '', b.weekday!, b.start_period!, b.end_period!,
      b.weeks || '', b.odd_even || 'all', b.color || '#409EFF', b.note || '', now, now,
    )
    return ok({ id: Number(info.lastInsertRowid) })
  })

  // 修改（支持部分字段更新；仅本人课程可改）
  app.put('/api/courses/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(id, uid) as Course | undefined
    if (!row) return reply.code(404).send(fail('课程不存在', 404))
    const b = (req.body || {}) as CourseBody
    const m = {
      name: b.name?.trim() || row.name,
      teacher: b.teacher ?? row.teacher,
      location: b.location ?? row.location,
      weekday: b.weekday ?? row.weekday,
      start_period: b.start_period ?? row.start_period,
      end_period: b.end_period ?? row.end_period,
      weeks: b.weeks ?? row.weeks,
      odd_even: b.odd_even ?? row.odd_even,
      color: b.color ?? row.color,
      note: b.note ?? row.note,
    }
    const err = validCourse(m)
    if (err) return reply.code(400).send(fail(err))
    const conflict = conflictOn(uid, m.weekday!, m.start_period!, m.end_period!, row.id)
    if (conflict) return reply.code(409).send(fail(conflict, 409))
    db.prepare(
      'UPDATE courses SET name=?, teacher=?, location=?, weekday=?, start_period=?, end_period=?, weeks=?, odd_even=?, color=?, note=?, updated_at=? WHERE id=?',
    ).run(
      m.name, m.teacher, m.location, m.weekday, m.start_period, m.end_period,
      m.weeks, m.odd_even, m.color, m.note,
      new Date().toISOString(), id,
    )
    return ok()
  })

  // 删除（仅本人课程；目标不存在或不属于本人都返回 404）
  app.delete('/api/courses/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const { id } = req.params as { id: string }
    const info = db.prepare('DELETE FROM courses WHERE id = ? AND user_id = ?').run(id, uid)
    if (Number(info.changes) === 0) return reply.code(404).send(fail('课程不存在', 404))
    return ok()
  })

  // 节次时间（全局共享；读取开放，修改同样需登录）
  app.get('/api/times', { onRequest: [app.authenticate] }, async () => ok(allTimes()))

  app.put('/api/times', { onRequest: [app.authenticate] }, async (req, reply) => {
    const list = (req.body || []) as { id?: number; start_time?: string; end_time?: string; kind?: string }[]
    if (!Array.isArray(list) || list.length === 0) return reply.code(400).send(fail('节次列表不能为空'))
    if (list.length > 30) return reply.code(400).send(fail('节次最多 30 个'))
    const validate = (t: { start_time?: string; end_time?: string }) =>
      /^\d{2}:\d{2}$/.test(t.start_time || '') && /^\d{2}:\d{2}$/.test(t.end_time || '') && t.start_time! < t.end_time!
    for (const t of list) {
      if (!validate(t)) return reply.code(400).send(fail('时间格式应为 HH:mm，且开始早于结束'))
      if (t.kind !== undefined && !['big', 'small'].includes(t.kind)) return reply.code(400).send(fail('kind 应为 big 或 small'))
    }
    // node:sqlite 无 transaction() helper，手动事务保证整表保存原子性
    db.exec('BEGIN')
    try {
      const keepIds = list.filter((t) => t.id).map((t) => t.id!)
      if (keepIds.length > 0) {
        db.prepare('DELETE FROM class_times WHERE id NOT IN (' + keepIds.map(() => '?').join(',') + ')').run(...keepIds)
      } else {
        db.prepare('DELETE FROM class_times').run()
      }
      const upd = db.prepare('UPDATE class_times SET period=?, start_time=?, end_time=?, kind=? WHERE id=?')
      const ins = db.prepare('INSERT INTO class_times (period, start_time, end_time, kind) VALUES (?,?,?,?)')
      list.forEach((t, i) => {
        const period = i + 1
        const startTime = t.start_time!
        const endTime = t.end_time!
        const kind = t.kind === 'big' ? 'big' : 'small'
        if (t.id) upd.run(period, startTime, endTime, kind, t.id)
        else ins.run(period, startTime, endTime, kind)
      })
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    return ok(allTimes())
  })

  // ---------- 视图 / 预览（当前用户） ----------
  app.get('/api/view/day', { onRequest: [app.authenticate] }, async (req) => {
    const uid = (req.user as { id: number }).id
    const q = req.query as { date?: string }
    const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : todayInTz()
    return ok(dayView(uid, date))
  })

  app.get('/api/view/week', { onRequest: [app.authenticate] }, async (req) => {
    const uid = (req.user as { id: number }).id
    const q = req.query as { date?: string }
    const base = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : todayInTz()
    const monday = mondayOf(base)
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => dayView(uid, addDays(monday, i)))
    return ok({ monday, week: weekOf(uid, monday), days })
  })

  app.get('/api/preview', { onRequest: [app.authenticate] }, async (req) => {
    const uid = (req.user as { id: number }).id
    const q = req.query as { type?: string; template?: string }
    const template = q.template === 'html' ? 'html' : 'md'
    const type = q.type || 'today'
    let content: string
    let title: string
    if (type === 'tomorrow') {
      const d = addDays(todayInTz(), 1)
      title = `明日课表 · ${d}`
      content = template === 'html' ? renderDayHtml(uid, d) : renderDay(uid, d)
    } else if (type === 'week') {
      const m = mondayOf(todayInTz())
      title = `本周课表 · 第 ${weekOf(uid, m)} 周`
      content = template === 'html' ? renderWeekHtml(uid, m) : renderWeek(uid, m)
    } else {
      const d = todayInTz()
      title = `今日课表 · ${d}`
      content = template === 'html' ? renderDayHtml(uid, d) : renderDay(uid, d)
    }
    return ok({ title, content })
  })
}
