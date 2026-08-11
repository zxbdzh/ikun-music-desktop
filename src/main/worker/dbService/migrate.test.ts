import { describe, expect, it, vi } from 'vitest'
import { migratePodcastSubscriptions } from './migrate'

const database = (options: { hasGroupTable?: boolean; columns?: string[] } = {}) => {
  const exec = vi.fn()
  const run = vi.fn()
  const prepare = vi.fn((sql: string) => {
    if (sql.includes('sqlite_master')) {
      return { get: vi.fn(() => options.hasGroupTable ? { name: 'podcast_subscription_group' } : undefined) }
    }
    if (sql.includes('PRAGMA table_info')) {
      return { all: vi.fn(() => (options.columns ?? []).map((name) => ({ name }))) }
    }
    return { run }
  })
  return {
    value: {
      exec,
      prepare,
      transaction: (callback: () => void) => () => callback(),
    } as any,
    exec,
    run,
  }
}

describe('podcast subscription database migration', () => {
  it('creates group storage and adds membership columns to a v3 database', () => {
    const db = database({ columns: ['id', 'title'] })

    migratePodcastSubscriptions(db.value)

    expect(db.exec.mock.calls.flat().join('\n')).toContain('CREATE TABLE "podcast_subscription_group"')
    expect(db.exec).toHaveBeenCalledWith(expect.stringContaining('ADD COLUMN group_id'))
    expect(db.exec).toHaveBeenCalledWith(expect.stringContaining('ADD COLUMN subscription_order'))
    expect(db.run).toHaveBeenCalled()
  })

  it('is idempotent when the table and columns already exist', () => {
    const db = database({
      hasGroupTable: true,
      columns: ['id', 'group_id', 'subscription_order'],
    })

    migratePodcastSubscriptions(db.value)

    expect(db.exec).not.toHaveBeenCalled()
    expect(db.run).toHaveBeenCalled()
  })
})
