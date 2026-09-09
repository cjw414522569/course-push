import bcrypt from 'bcryptjs'
import { db } from './database.ts'
import { mondayOf, todayInTz } from '../services/dates.ts'

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      grade INTEGER NOT NULL DEFAULT 1,
      graduate_date TEXT NOT NULL DEFAULT '',
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      teacher TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      weekday INTEGER NOT NULL,
      start_period INTEGER NOT NULL,
      end_period INTEGER NOT NULL,
      weeks TEXT NOT NULL DEFAULT '',
      odd_even TEXT NOT NULL DEFAULT 'all',
      color TEXT NOT NULL DEFAULT '#409EFF',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_courses_user_weekday ON courses(user_id, weekday);
    CREATE TABLE IF NOT EXISTS class_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'small'
    );
    CREATE TABLE IF NOT EXISTS push_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'today',
      time TEXT NOT NULL DEFAULT '07:30',
      days TEXT NOT NULL DEFAULT '[]',
      cron_expr TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      send_empty INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON push_tasks(user_id);
    CREATE TABLE IF NOT EXISTS push_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 0,
      task_id INTEGER,
      task_name TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      short_code TEXT NOT NULL DEFAULT '',
      status INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '',
      response TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_user_created ON push_logs(user_id, created_at);
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys(user_id);
  `)

  // ---------- 旧库升级 ----------
  const tableCols = (t: string) => db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]

  // class_times：period 主键旧结构 → id 主键新结构
  {
    const cols = tableCols('class_times')
    if (cols.length > 0 && !cols.some((c) => c.name === 'id')) {
      db.exec(`
        ALTER TABLE class_times RENAME TO class_times_old;
        CREATE TABLE class_times (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          period INTEGER NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'small'
        );
        INSERT INTO class_times (period, start_time, end_time, kind)
          SELECT period, start_time, end_time, 'small' FROM class_times_old ORDER BY period;
        DROP TABLE class_times_old;
      `)
    }
  }

  // 单用户 → 多用户：courses / push_tasks 加 user_id（旧数据归到 admin=1）
  const addUserColumn = (table: string): void => {
    const cols = tableCols(table)
    if (cols.length > 0 && !cols.some((c) => c.name === 'user_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1`)
    }
  }
  addUserColumn('courses')
  addUserColumn('push_tasks')
  {
    const cols = tableCols('push_logs')
    if (cols.length > 0 && !cols.some((c) => c.name === 'user_id')) {
      db.exec('ALTER TABLE push_logs ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0')
    }
  }

  // users 加 disabled 列（管理员可停用账号）
  {
    const cols = tableCols('users')
    if (cols.length > 0 && !cols.some((c) => c.name === 'disabled')) {
      db.exec('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0')
    }
    if (cols.length > 0 && !cols.some((c) => c.name === 'grade')) {
      db.exec("ALTER TABLE users ADD COLUMN grade INTEGER NOT NULL DEFAULT 1")
    }
    if (cols.length > 0 && !cols.some((c) => c.name === 'graduate_date')) {
      db.exec("ALTER TABLE users ADD COLUMN graduate_date TEXT NOT NULL DEFAULT ''")
      // 存量用户按默认大一补毕业日期
      db.exec("UPDATE users SET graduate_date = '' || (CAST(strftime('%Y','now') AS INTEGER) + 3) || '-06-30' WHERE graduate_date = ''")
    }
  }

  // 旧全局 settings（key-value）→ 迁到 admin 的 user_settings，随后仅存全局配置
  {
    const hasOld = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get()
    if (hasOld) {
      const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
      if (rows.length > 0) {
        const merged = Object.fromEntries(rows.map((r) => [r.key, r.value]))
        db.prepare('INSERT INTO user_settings (user_id, data) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data')
          .run(1, JSON.stringify(merged))
      }
      db.exec('DROP TABLE settings')
    }
  }

  const now = new Date().toISOString()

  // 默认管理员 admin / admin123（首位注册者为管理员）
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    db.prepare('INSERT INTO users (username, password_hash, nickname, role, created_at) VALUES (?,?,?,?,?)')
      .run('admin', bcrypt.hashSync('admin123', 10), '管理员', 'admin', now)
  }

  // 默认节次时间（全局共享，11 节：白天 8 节 + 晚间 3 节）
  if (!db.prepare('SELECT period FROM class_times LIMIT 1').get()) {
    const ins = db.prepare('INSERT INTO class_times (period, start_time, end_time) VALUES (?,?,?)')
    const times = [
      ['08:00', '08:45'], ['08:55', '09:40'], ['10:00', '10:45'], ['10:55', '11:40'],
      ['14:00', '14:45'], ['14:55', '15:40'], ['16:00', '16:45'], ['16:55', '17:40'],
      ['19:00', '19:45'], ['19:55', '20:40'], ['20:50', '21:35'],
    ]
    times.forEach((t, i) => ins.run(i + 1, t[0], t[1]))
  }

  // admin 的用户设置（节次时间/午休已全局化，这里存学期与推送偏好；已存在则跳过）
  const semDefaults: Record<string, string> = {
    semester_start: mondayOf(todayInTz()),
    total_weeks: '20',
    noon_start: '12:00',
    noon_end: '14:00',
    default_channel: 'wechat',
    default_topic: '',
    push_template: 'markdown',
  }
  const existing = db.prepare('SELECT data FROM user_settings WHERE user_id = 1').get() as { data: string } | undefined
  if (!existing) {
    db.prepare('INSERT INTO user_settings (user_id, data) VALUES (?,?)').run(1, JSON.stringify(semDefaults))
  }

  // 预置三个示例任务（admin，默认停用）
  if (!db.prepare('SELECT id FROM push_tasks LIMIT 1').get()) {
    const ins = db.prepare(
      'INSERT INTO push_tasks (user_id, name, type, time, days, cron_expr, enabled, send_empty, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
    ins.run(1, '今日课表推送', 'today', '07:30', '[]', '30 7 * * *', 0, 0, now, now)
    ins.run(1, '明日课表推送', 'tomorrow', '21:00', '[]', '0 21 * * *', 0, 0, now, now)
    ins.run(1, '本周课表推送', 'week', '07:00', '[1]', '0 7 * * 1', 0, 0, now, now)
  }
}
