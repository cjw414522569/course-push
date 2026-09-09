import { db } from '../db/database.ts'
import { getSetting, setSetting } from './userSettings.ts'
import { todayInTz, addDays, weekdayOf, mondayOf } from './dates.ts'
import { WD_CN } from './dates.ts'

export interface Course {
  id: number
  user_id: number
  name: string
  teacher: string
  location: string
  weekday: number
  start_period: number
  end_period: number
  weeks: string
  odd_even: string
  color: string
  note: string
}

export interface ClassTime {
  id: number
  period: number
  start_time: string
  end_time: string
  kind: 'big' | 'small' // big 大课(占两节) / small 小课
}

/** 某用户某天的所有课程（不含节次周次过滤，按星期取） */
export function allCourses(userId: number): Course[] {
  return db.prepare('SELECT * FROM courses WHERE user_id = ? ORDER BY weekday, start_period').all(userId) as unknown as Course[]
}

export function allTimes(): ClassTime[] {
  return db.prepare('SELECT * FROM class_times ORDER BY period').all() as unknown as ClassTime[]
}

/** 解析周次描述 "1-8,10,12-16" 为集合 */
export function parseWeeks(desc: string): Set<number> {
  const set = new Set<number>()
  for (const part of desc.split(/[,，\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)-(\d+)$/)
    if (m) {
      for (let i = +m[1]; i <= +m[2]; i++) set.add(i)
    } else if (/^\d+$/.test(part)) {
      set.add(+part)
    }
  }
  return set
}

/** 某用户：计算某日期是学期第几周 */
export function weekOf(userId: number, dateStr: string): number {
  const start = getSetting(userId, 'semester_start') || mondayOf(todayInTz())
  const ms = 7 * 24 * 3600 * 1000
  return Math.floor((Date.parse(dateStr + 'T00:00:00Z') - Date.parse(mondayOf(start) + 'T00:00:00Z')) / ms) + 1
}

/** 某用户：过滤出某日期当天实际要上的课 */
export function coursesOn(userId: number, dateStr: string): Course[] {
  const week = weekOf(userId, dateStr)
  if (week < 1) return []
  const wd = weekdayOf(dateStr)
  return allCourses(userId).filter((c) => {
    if (c.weekday !== wd) return false
    if (c.odd_even === 'odd' && week % 2 === 0) return false
    if (c.odd_even === 'even' && week % 2 === 1) return false
    if (c.weeks) {
      const set = parseWeeks(c.weeks)
      if (set.size > 0 && !set.has(week)) return false
    }
    return true
  })
}

export interface CourseView extends Course {
  time_range: string
}

/** 某用户：组装某天的课表视图（带时间），按节次排序 */
export function dayView(userId: number, dateStr: string): { date: string; weekday: number; weekdayCn: string; week: number; courses: CourseView[] } {
  const times = allTimes()
  const timeMap = new Map(times.map((t) => [t.period, t]))
  const courses = coursesOn(userId, dateStr).map((c) => {
    const s = timeMap.get(c.start_period)
    const e = timeMap.get(c.end_period) || timeMap.get(c.start_period)
    return { ...c, time_range: s && e ? `${s.start_time}-${e.end_time}` : `第${c.start_period}-${c.end_period}节` }
  })
  courses.sort((a, b) => a.start_period - b.start_period)
  return { date: dateStr, weekday: weekdayOf(dateStr), weekdayCn: WD_CN[weekdayOf(dateStr)], week: weekOf(userId, dateStr), courses }
}
