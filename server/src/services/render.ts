import { dayView, weekOf } from './schedule.ts'
import { addDays, WD_CN } from './dates.ts'
import type { CourseView } from './schedule.ts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function courseLine(c: CourseView, withTime: boolean): string {
  const parts = [
    `**${esc(c.name)}**`,
    esc(c.location || '未填地点'),
    withTime ? esc(c.time_range) : `第${c.start_period}-${c.end_period}节`,
  ]
  if (c.teacher) parts.push(esc(c.teacher))
  let line = parts.join(' ｜ ')
  if (c.note) line += `\n> ${esc(c.note)}`
  return line
}

/** 单日 markdown */
export function renderDay(userId: number, dateStr: string): string {
  const v = dayView(userId, dateStr)
  const head = `📅 ${v.date} 星期${v.weekdayCn} ｜ 第 ${v.week} 周`
  if (v.courses.length === 0) return `${head}\n\n今天没有课，好好休息～ 🎉`
  const lines = v.courses.map((c) => `- ${courseLine(c, true)}`)
  return `${head}\n\n${lines.join('\n')}`
}

/** 单日 html（微信渠道富文本） */
export function renderDayHtml(userId: number, dateStr: string): string {
  const v = dayView(userId, dateStr)
  const rows = v.courses
    .map(
      (c) =>
        `<tr><td style="padding:6px 10px;white-space:nowrap">${esc(c.time_range)}</td>` +
        `<td style="padding:6px 10px"><b>${esc(c.name)}</b>${c.note ? `<br/><span style="color:#888">${esc(c.note)}</span>` : ''}</td>` +
        `<td style="padding:6px 10px">${esc(c.location || '-')}</td>` +
        `<td style="padding:6px 10px">${esc(c.teacher || '-')}</td></tr>`,
    )
    .join('')
  const body = v.courses.length
    ? `<table cellspacing="0" cellpadding="0" border="1" style="border-collapse:collapse;width:100%"><tr style="background:#f5f7fa"><th style="padding:6px 10px">时间</th><th style="padding:6px 10px">课程</th><th style="padding:6px 10px">地点</th><th style="padding:6px 10px">教师</th></tr>${rows}</table>`
    : '<p>今天没有课，好好休息～ 🎉</p>'
  return `<h3>📅 ${esc(v.date)} 星期${v.weekdayCn} ｜ 第 ${v.week} 周</h3>${body}`
}

/** 本周 7 天 markdown，weekStartStr 为周一日期 */
export function renderWeek(userId: number, weekStartStr: string): string {
  const week = weekOf(userId, weekStartStr)
  const sections: string[] = [`📅 本周课表 ｜ 第 ${week} 周（${weekStartStr} 起）`]
  let cur = weekStartStr
  for (let i = 0; i < 7; i++) {
    const d = dayView(userId, cur)
    const title = `**星期${WD_CN[d.weekday]}**（${d.date}）`
    if (d.courses.length === 0) {
      sections.push(`\n${title}\n无课`)
    } else {
      const lines = d.courses.map((c) => `- ${courseLine(c, false)}`)
      sections.push(`\n${title}\n${lines.join('\n')}`)
    }
    cur = addDays(cur, 1)
  }
  return sections.join('\n')
}
