import { dayView, weekOf, allTimes } from './schedule.ts'
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

/** 本周 html 表格：行=节次，列=星期；跨节课在起始节行显示（其余节显示续占标记） */
export function renderWeekHtml(userId: number, weekStartStr: string): string {
  const week = weekOf(userId, weekStartStr)
  const times = allTimes()
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => dayView(userId, addDays(weekStartStr, i)))
  // key: `${weekday}-${period}` → 该格涉及的课程（去重后）
  const byCell = new Map<string, CourseView[]>()
  for (const d of days) {
    for (const c of d.courses) {
      for (let p = c.start_period; p <= c.end_period; p++) {
        const key = `${d.weekday}-${p}`
        if (!byCell.has(key)) byCell.set(key, [])
        byCell.get(key)!.push(c)
      }
    }
  }
  const th = (s: string) => `<th style="${TH_STYLE}">${esc(s)}</th>`
  const head = `<tr>${th('节次')}${days.map((d) => th(`星期${WD_CN[d.weekday]}`)).join('')}</tr>`
  const body = times
    .map((t) => {
      const cells = days
        .map((d) => {
          const list = byCell.get(`${d.weekday}-${t.period}`) || []
          const unique = list.filter((c, i) => list.findIndex((x) => x.id === c.id) === i)
          const content = unique.length
            ? `<b>${esc(unique[0].name)}</b>${unique[0].location ? `<br/><span style="${SUB_STYLE}">${esc(unique[0].location)}</span>` : ''}`
            : '&nbsp;'
          return `<td style="${TD_STYLE}">${content}</td>`
        })
        .join('')
      return `<tr><td style="${PERIOD_TD_STYLE}">${t.period}<br/><span style="${SUB_STYLE}">${esc(t.start_time)}</span></td>${cells}</tr>`
    })
    .join('')
  return (
    `<h3>📅 本周课表 ｜ 第 ${week} 周（${weekStartStr} 起）</h3>` +
    `<table cellspacing="0" cellpadding="0" border="1" style="${TABLE_STYLE}">${head}${body}</table>`
  )
}

// ---------- 共享样式 ----------
const TABLE_STYLE = 'border-collapse:collapse;width:100%;font-size:13px'
const TH_STYLE = 'padding:6px 8px;background:#f5f7fa;white-space:nowrap'
const TD_STYLE = 'padding:6px 8px;vertical-align:top;min-width:60px'
const PERIOD_TD_STYLE = 'padding:6px 8px;background:#fafafa;white-space:nowrap;text-align:center;font-weight:600'
const SUB_STYLE = 'color:#888;font-size:12px'
