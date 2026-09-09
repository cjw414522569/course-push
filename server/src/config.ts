import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const ROOT = path.resolve(__dirname, '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const DB_FILE = path.join(DATA_DIR, 'kebiao.db')
export const WEB_DIST = path.resolve(ROOT, '../web/dist')
export const PORT = Number(process.env.PORT || 3300)
export const HOST = process.env.HOST || '0.0.0.0'
export const TZ = 'Asia/Shanghai'

fs.mkdirSync(DATA_DIR, { recursive: true })

// 主密钥：首次启动自动生成，用于 token 加密与 JWT 派生。丢失将导致已存 token 无法解密。
function loadMasterKey(): Buffer {
  const file = path.join(DATA_DIR, 'master.key')
  if (fs.existsSync(file)) return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex')
  const key = crypto.randomBytes(32)
  fs.writeFileSync(file, key.toString('hex'))
  return key
}

export const MASTER_KEY = loadMasterKey()
export const JWT_SECRET = crypto
  .createHash('sha256')
  .update(Buffer.concat([MASTER_KEY, Buffer.from('jwt-secret')]))
  .digest('hex')
