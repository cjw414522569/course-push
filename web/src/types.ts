export interface LoginResult {
  token: string
  nickname: string
  username: string
  role: string
}

export interface Me {
  username: string
  role: string
  nickname: string
}

export interface Course {
  id: number
  name: string
  teacher: string
  location: string
  weekday: number // 1-7
  start_period: number
  end_period: number
  weeks: string
  odd_even: 'all' | 'odd' | 'even'
  color: string
  note: string
  created_at?: string
  updated_at?: string
}

export interface ClassTime {
  id: number
  period: number
  start_time: string
  end_time: string
  kind: 'big' | 'small' // big 大课(占两节) / small 小课
}

export interface CourseView extends Course {
  time_range: string
}

export interface DayView {
  date: string
  weekday: number
  weekdayCn: string
  week: number
  courses: CourseView[]
}

export interface WeekView {
  monday: string
  week: number
  days: DayView[]
}

export interface PushTask {
  id: number
  name: string
  type: 'today' | 'tomorrow' | 'week'
  time: string
  days: number[]
  cron_expr: string
  enabled: boolean
  send_empty: boolean
  created_at?: string
  updated_at?: string
}

export interface PushLog {
  id: number
  task_id: number | null
  task_name: string
  title: string
  short_code: string
  status: number // 1成功 2跳过 3失败
  error: string
  response: string
  created_at: string
}

export interface Stats {
  today: DayView
  tomorrow_count: number
  course_total: number
  token_configured: boolean
  task_total: number
  task_enabled: number
  running_jobs: number
  push_7d: { sent: number; skipped: number; failed: number }
  recent_logs: PushLog[]
}

export interface PushplusSettings {
  token_masked: string
  has_token: boolean
  channel: string
  topic: string
  template: string
}

export interface SemesterSettings {
  semester_start: string
  total_weeks: number
  noon_start: string
  noon_end: string
  evening_start: string
}

export interface ApiKey {
  id: number
  user_id: number
  name: string
  key_prefix: string
  enabled: boolean
  last_used_at: string | null
  created_at: string
}

export interface AdminUser {
  id: number
  username: string
  nickname: string
  role: 'admin' | 'user'
  disabled: boolean
  created_at: string
  course_count: number
  task_count: number
  key_count: number
}
