import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import fastifyStatic from '@fastify/static'
import fs from 'node:fs'
import path from 'node:path'
import { PORT, HOST, JWT_SECRET, WEB_DIST } from './config.ts'
import { migrate } from './db/migrate.ts'
import { reloadAllTasks } from './services/scheduler.ts'
import { findUserByApiKey } from './services/apiKeys.ts'
import { db } from './db/database.ts'
import { purgeGraduatedUsers } from './services/graduate.ts'
import { Cron } from 'croner'
import authRoutes from './routes/auth.ts'
import courseRoutes from './routes/courses.ts'
import taskRoutes from './routes/tasks.ts'
import adminRoutes from './routes/admin.ts'
import { fail } from './utils.ts'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 })

// 宽松 JSON 解析：PUT/POST/DELETE 空 body 视为 {}，避免 FST_ERR_CTP_EMPTY_JSON_BODY
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  const text = body as string
  if (text === '' || text === undefined) return done(null, {})
  try { done(null, JSON.parse(text)) } catch (e) { done(e as Error) }
})

await app.register(cors, { origin: true })

app.register(jwt, { secret: JWT_SECRET })

app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  // 双通道：API 密钥（kb_ 前缀，X-API-Key 或 Bearer）优先，其次 JWT
  const authHeader = request.headers.authorization || ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const apiKey = (request.headers['x-api-key'] as string) || (bearer.startsWith('kb_') ? bearer : '')
  if (apiKey) {
    const uid = findUserByApiKey(apiKey)
    if (uid) {
      request.user = { id: uid, username: '', role: 'apikey' }
      return
    }
    // 带了 key 但无效 → 直接拒绝，不回退 JWT（避免失效 key 意外通过）
    return reply.code(401).send(fail('API 密钥无效或已停用', 401))
  }
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send(fail('登录已过期，请重新登录', 401))
  }
  // 停用检查：JWT 未过期但账号已被管理员停用 → 立即失效
  const u = request.user as { id: number }
  const row = db.prepare('SELECT disabled FROM users WHERE id = ?').get(u.id) as { disabled: number } | undefined
  if (!row || row.disabled) {
    return reply.code(403).send(fail('账号已被停用，请联系管理员', 403))
  }
})

await app.register(authRoutes)
await app.register(courseRoutes)
await app.register(taskRoutes)
await app.register(adminRoutes)

// 统一响应体
app.setErrorHandler((err: FastifyError, req, reply) => {
  app.log.error(err)
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500
  reply.code(status).send(fail(status === 500 ? '服务器内部错误' : err.message, status))
})

// 生产模式：托管前端构建产物（SPA 回退）
if (fs.existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false })
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api/')) return reply.code(404).send(fail('接口不存在', 404))
    return reply.type('text/html').send(fs.readFileSync(path.join(WEB_DIST, 'index.html')))
  })
}

await migrate()
reloadAllTasks()

// 毕业用户自动清理：启动时 + 每日 03:17
purgeGraduatedUsers()
new Cron('17 3 * * *', { timezone: 'Asia/Shanghai' }, () => { purgeGraduatedUsers() })

await app.listen({ port: PORT, host: HOST })
console.log(`✅ 课表推送平台已启动: http://localhost:${PORT}`)
