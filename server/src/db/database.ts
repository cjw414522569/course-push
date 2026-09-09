import { DatabaseSync } from 'node:sqlite'
import { DB_FILE } from '../config.ts'

export const db = new DatabaseSync(DB_FILE)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
