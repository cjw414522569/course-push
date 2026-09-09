import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { db } from '../db/database.ts'
import { ok, fail } from '../utils.ts'
import { encrypt, mask } from '../services/crypto.ts'
import { getSetting, setSetting, initUserSettings, invalidateSettingsCache } from '../services/userSettings.ts'
import { createApiKey, listApiKeys, setApiKeyEnabled, deleteApiKey } from '../services/apiKeys.ts'
import { registrationEnabled } from './admin.ts'
import { graduationDate } from '../services/dates.ts'

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // ---------- 登录 / 注册 ----------
  app.post('/api/auth/login', async (req, reply) => {
    const { username, password } = (req.body || {}) as { username?: string; password?: string }
    if (!username || !password) return reply.code(400).send(fail('用户名和密码不能为空'))
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      | { id: number; username: string; password_hash: string; nickname: string; role: string; disabled: number }
      | undefined
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return reply.code(401).send(fail('用户名或密码错误', 401))
    }
    if (user.disabled) return reply.code(403).send(fail('账号已被停用，请联系管理员', 403))
    const token = app.jwt.sign({ id: user.id, username: user.username, role: user.role }, { expiresIn: '7d' })
    return ok({ token, nickname: user.nickname, username: user.username, role: user.role })
  })

  app.post('/api/auth/register', async (req, reply) => {
    if (!registrationEnabled()) return reply.code(403).send(fail('管理员已关闭注册，请联系管理员开通账号', 403))
    const { username, password, nickname, grade } = (req.body || {}) as { username?: string; password?: string; nickname?: string; grade?: number }
    if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) return reply.code(400).send(fail('用户名 3-20 位，仅字母数字下划线'))
    if (!password || password.length < 6) return reply.code(400).send(fail('密码至少 6 位'))
    if (!grade || !Number.isInteger(grade) || grade < 1 || grade > 4) return reply.code(400).send(fail('请选择年级（大一至大四）'))
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (exists) return reply.code(409).send(fail('用户名已被占用'))
    const now = new Date().toISOString()
    const graduate = graduationDate(grade)
    const info = db.prepare('INSERT INTO users (username, password_hash, nickname, role, grade, graduate_date, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(username, bcrypt.hashSync(password, 10), (nickname || username).slice(0, 20), 'user', grade, graduate, now)
    const uid = Number(info.lastInsertRowid)
    initUserSettings(uid)
    const token = app.jwt.sign({ id: uid, username, role: 'user' }, { expiresIn: '7d' })
    return ok({ token, nickname: (nickname || username).slice(0, 20), username, role: 'user', graduate_date: graduate })
  })

  app.get('/api/auth/me', { onRequest: [app.authenticate] }, async (req) => {
    const u = req.user as { id: number; username: string; role: string }
    const row = db.prepare('SELECT nickname FROM users WHERE id = ?').get(u.id) as { nickname: string } | undefined
    return ok({ username: u.username, role: u.role, nickname: row?.nickname || u.username })
  })

  app.put('/api/auth/password', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { oldPassword, newPassword } = (req.body || {}) as { oldPassword?: string; newPassword?: string }
    if (!oldPassword || !newPassword || newPassword.length < 6) {
      return reply.code(400).send(fail('新密码至少 6 位'))
    }
    const u = req.user as { id: number }
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id) as { password_hash: string }
    if (!bcrypt.compareSync(oldPassword, row.password_hash)) return reply.code(400).send(fail('原密码错误'))
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), u.id)
    return ok()
  })

  // ---------- pushplus 设置（每用户） ----------
  app.get('/api/settings/pushplus', { onRequest: [app.authenticate] }, async (req) => {
    const uid = (req.user as { id: number }).id
    return ok({
      token_masked: mask(getSetting(uid, 'pushplus_token')),
      has_token: !!getSetting(uid, 'pushplus_token'),
      channel: getSetting(uid, 'default_channel', 'wechat'),
      topic: getSetting(uid, 'default_topic'),
      template: getSetting(uid, 'push_template', 'markdown'),
    })
  })

  app.put('/api/settings/pushplus', { onRequest: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const b = (req.body || {}) as { token?: string; channel?: string; topic?: string; template?: string }
    if (b.token !== undefined) {
      if (b.token === '') return reply.code(400).send(fail('token 不能为空'))
      setSetting(uid, 'pushplus_token', encrypt(b.token.trim()))
    }
    if (b.channel !== undefined) setSetting(uid, 'default_channel', b.channel)
    if (b.topic !== undefined) setSetting(uid, 'default_topic', b.topic.trim())
    if (b.template !== undefined) setSetting(uid, 'push_template', b.template)
    invalidateSettingsCache(uid)
    return ok()
  })

  // ---------- 学期设置（每用户） ----------
  app.get('/api/settings/semester', { onRequest: [app.authenticate] }, async (req) => {
    const uid = (req.user as { id: number }).id
    return ok({
      semester_start: getSetting(uid, 'semester_start'),
      total_weeks: Number(getSetting(uid, 'total_weeks', '20')),
      noon_start: getSetting(uid, 'noon_start', '12:00'),
      noon_end: getSetting(uid, 'noon_end', '14:00'),
      evening_start: getSetting(uid, 'evening_start', '18:00'),
    })
  })

  app.put('/api/settings/semester', { onRequest: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const b = (req.body || {}) as { semester_start?: string; total_weeks?: number; noon_start?: string; noon_end?: string; evening_start?: string }
    if (b.semester_start && !/^\d{4}-\d{2}-\d{2}$/.test(b.semester_start)) {
      return reply.code(400).send(fail('日期格式应为 YYYY-MM-DD'))
    }
    const timeOk = (s?: string) => s === undefined || /^\d{2}:\d{2}$/.test(s)
    if (!timeOk(b.noon_start) || !timeOk(b.noon_end) || !timeOk(b.evening_start)) return reply.code(400).send(fail('时间格式应为 HH:mm'))
    if (b.semester_start) setSetting(uid, 'semester_start', b.semester_start)
    if (b.total_weeks) setSetting(uid, 'total_weeks', String(b.total_weeks))
    if (b.noon_start !== undefined) setSetting(uid, 'noon_start', b.noon_start)
    if (b.noon_end !== undefined) setSetting(uid, 'noon_end', b.noon_end)
    if (b.evening_start !== undefined) setSetting(uid, 'evening_start', b.evening_start)
    invalidateSettingsCache(uid)
    return ok()
  })

  // ---------- API 密钥管理 ----------
  app.get('/api/keys', { onRequest: [app.authenticate] }, async (req) => {
    const uid = (req.user as { id: number }).id
    return ok(listApiKeys(uid))
  })

  app.post('/api/keys', { onRequest: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const { name } = (req.body || {}) as { name?: string }
    // 上限 10 把，防滥用
    const count = (db.prepare('SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ?').get(uid) as { n: number }).n
    if (count >= 10) return reply.code(400).send(fail('最多创建 10 个 API 密钥'))
    const created = createApiKey(uid, name || '')
    return ok(created) // { id, key } — key 明文仅此一次返回
  })

  app.put('/api/keys/:id/toggle', { onRequest: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const id = Number((req.params as { id: string }).id)
    const row = db.prepare('SELECT enabled FROM api_keys WHERE id = ? AND user_id = ?').get(id, uid) as { enabled: number } | undefined
    if (!row) return reply.code(404).send(fail('密钥不存在', 404))
    setApiKeyEnabled(uid, id, !row.enabled)
    return ok({ enabled: !row.enabled })
  })

  app.delete('/api/keys/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as { id: number }).id
    const id = Number((req.params as { id: string }).id)
    deleteApiKey(uid, id)
    return ok()
  })
}
