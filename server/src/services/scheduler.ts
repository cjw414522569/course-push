import { Cron } from 'croner'
import { db } from '../db/database.ts'
import { TZ } from '../config.ts'
import { send } from './pushplus.ts'
import { getSetting } from './userSettings.ts'
import { coursesOn, weekOf } from './schedule.ts'
import { renderDay, renderDayHtml, renderWeek, renderWeekHtml } from './render.ts'
import { todayInTz, addDays, mondayOf } from './dates.ts'

export interface TaskRow {
  id: number
  user_id: number
  name: string
  type: string // today | tomorrow | week
  time: string
  days: string
  cron_expr: string
  enabled: number
  send_empty: number
}

const jobs = new Map<number, Cron>()

/** 组装任务内容；返回 null 表示无课跳过 */
function buildContent(task: TaskRow): { title: string; content: string } | null {
  const uid = task.user_id
  const today = todayInTz()
  const template = getSetting(uid, 'push_template', 'markdown')
  switch (task.type) {
    case 'today': {
      const d = today
      if (!task.send_empty && coursesOn(uid, d).length === 0) return null
      return { title: `今日课表 · ${d}`, content: template === 'html' ? renderDayHtml(uid, d) : renderDay(uid, d) }
    }
    case 'tomorrow': {
      const d = addDays(today, 1)
      if (!task.send_empty && coursesOn(uid, d).length === 0) return null
      return { title: `明日课表 · ${d}`, content: template === 'html' ? renderDayHtml(uid, d) : renderDay(uid, d) }
    }
    case 'week': {
      const monday = mondayOf(today)
      if (!task.send_empty && !weekHasCourse(uid, monday)) return null
      return {
        title: `本周课表 · 第 ${weekOf(uid, monday)} 周`,
        content: template === 'html' ? renderWeekHtml(uid, monday) : renderWeek(uid, monday),
      }
    }
    default:
      return null
  }
}

function weekHasCourse(uid: number, monday: string): boolean {
  for (let i = 0; i < 7; i++) {
    if (coursesOn(uid, addDays(monday, i)).length > 0) return true
  }
  return false
}

async function runTask(task: TaskRow, manual = false): Promise<void> {
  const uid = task.user_id
  const now = new Date().toISOString()
  const template = getSetting(uid, 'push_template', 'markdown')
  const channel = getSetting(uid, 'default_channel', 'wechat')
  const topic = getSetting(uid, 'default_topic', '')
  const encToken = getSetting(uid, 'pushplus_token')

  const log = (title: string, shortCode: string, status: number, error: string, response: string) =>
    db.prepare(
      'INSERT INTO push_logs (user_id, task_id, task_name, title, short_code, status, error, response, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(uid, task.id, task.name, title, shortCode, status, error, response.slice(0, 2000), now, now)

  if (!encToken) {
    log('', '', 3, '未配置 pushplus token', '')
    return
  }

  const built = buildContent(task)
  if (!built) {
    log('', '', 2, manual ? '手动触发：无课，跳过' : '无课，跳过', '')
    return
  }

  const result = await send(encToken, {
    title: built.title,
    content: built.content,
    template,
    channel,
    topic: topic || undefined,
  })

  log(built.title, result.shortCode, result.ok ? 1 : 3, result.error, result.raw)
}

/** croner 兼容 5 段 cron：前面补秒位 */
function toCroner(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  return parts.length === 5 ? `0 ${expr.trim()}` : expr.trim()
}

export function scheduleTask(task: TaskRow): void {
  unschedule(task.id)
  if (!task.enabled) return
  try {
    const job = new Cron(toCroner(task.cron_expr), { timezone: TZ }, () => {
      runTask(task).catch((e) => console.error(`[task ${task.id}]`, e))
    })
    jobs.set(task.id, job)
  } catch (e) {
    console.error(`[schedule ${task.id}] invalid cron "${task.cron_expr}":`, (e as Error).message)
  }
}

export function unschedule(id: number): void {
  jobs.get(id)?.stop()
  jobs.delete(id)
}

export function reloadAllTasks(): void {
  for (const id of [...jobs.keys()]) unschedule(id)
  const rows = db.prepare('SELECT * FROM push_tasks WHERE enabled = 1').all() as unknown as TaskRow[]
  rows.forEach(scheduleTask)
}

export function runningJobCount(): number {
  return jobs.size
}

export { runTask }
