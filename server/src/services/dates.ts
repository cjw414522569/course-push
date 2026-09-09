export const WD_CN = ['', '一', '二', '三', '四', '五', '六', '日']

/** 当前时区（默认东八区）的日期字符串 YYYY-MM-DD */
export function todayInTz(tz = 'Asia/Shanghai'): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(new Date())
}

/** ISO 时间戳转时区日期字符串 YYYY-MM-DD */
export function localDateStr(iso: string, tz = 'Asia/Shanghai'): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(new Date(iso))
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 星期几，1=周一 ... 7=周日 */
export function weekdayOf(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z')
  return ((d.getUTCDay() + 6) % 7) + 1
}

export function mondayOf(dateStr: string): string {
  return addDays(dateStr, -(weekdayOf(dateStr) - 1))
}

/**
 * 按注册时的年级推算毕业日期（大四学年末的 6 月 30 日）。
 * 学年以 7 月 1 日为界：7 月起视为新学年。大二(2) 在 2026-09 注册 → 入学 2025 → 毕业 2029-06-30。
 */
export function graduationDate(grade: number, now = todayInTz()): string {
  const year = +now.slice(0, 4)
  const month = +now.slice(5, 7)
  const schoolYearStart = month >= 7 ? year : year - 1 // 当前学年的起始年
  const enrollYear = schoolYearStart - (grade - 1)
  return `${enrollYear + 4}-06-30`
}
