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
