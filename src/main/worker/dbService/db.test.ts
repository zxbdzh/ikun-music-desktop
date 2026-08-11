import type Database from 'better-sqlite3'
import { describe, expect, test, vi } from 'vitest'
import { initTables } from './db'
import tables from './tables'
import verifyDB from './verifyDB'

describe('database initialization', () => {
  test('creates a verifiable schema with the default podcast group', () => {
    const exec = vi.fn()
    initTables({ exec } as unknown as Database.Database)

    const initializationSql = exec.mock.calls[0]?.[0] as string
    expect(initializationSql).toContain('INSERT OR IGNORE INTO "podcast_subscription_group"')
    expect(initializationSql).toContain("VALUES ('default_group', '默认', 1, 0)")

    const sqliteMasterRows = Array.from(tables.entries()).map(([name, sql]) => ({
      type: name.startsWith('index_') ? 'index' : 'table',
      name,
      tbl_name: name,
      sql: `${sql.split(';', 1)[0]};`,
    }))
    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => sqliteMasterRows),
      })),
    } as unknown as Database.Database

    expect(verifyDB(db)).toBe(true)
  })
})
