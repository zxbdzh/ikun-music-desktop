import { describe, expect, it, vi } from 'vitest'
import {
  migratePodcastEpisodeOriginalUrl,
  migratePodcastSubscriptions,
  normalizePodcastSourceSchema,
} from './migrate'

const database = (options: {
  hasGroupTable?: boolean
  columns?: string[]
  episodeColumns?: string[]
} = {}) => {
  const exec = vi.fn()
  const run = vi.fn()
  const prepare = vi.fn((sql: string) => {
    if (sql.includes('sqlite_master')) {
      return { get: vi.fn(() => options.hasGroupTable ? { name: 'podcast_subscription_group' } : undefined) }
    }
    if (sql.includes('PRAGMA table_info(podcast_episode)')) {
      return { all: vi.fn(() => (options.episodeColumns ?? []).map((name) => ({ name }))) }
    }
    if (sql.includes('PRAGMA table_info(podcast_source)')) {
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

describe('podcast episode URL database migration', () => {
  it('adds original URL storage to a v4 database', () => {
    const db = database({ episodeColumns: ['id', 'audio_url'] })

    migratePodcastEpisodeOriginalUrl(db.value)

    expect(db.exec).toHaveBeenCalledWith(expect.stringContaining('ADD COLUMN "original_url"'))
  })

  it('is idempotent when original URL storage already exists', () => {
    const db = database({ episodeColumns: ['id', 'audio_url', 'original_url'] })

    migratePodcastEpisodeOriginalUrl(db.value)

    expect(db.exec).not.toHaveBeenCalled()
  })
})

describe('podcast source schema normalization', () => {
  const canonicalColumns = [
    'id',
    'title',
    'author',
    'description',
    'artwork_url',
    'feed_url',
    'categories_json',
    'subscribed',
    'auto_download',
    'group_id',
    'subscription_order',
    'updated_at',
  ]

  it('rebuilds the v4 ALTER TABLE layout without dropping source data', () => {
    const legacyColumns = [
      ...canonicalColumns.filter((name) => !['group_id', 'subscription_order'].includes(name)),
      'group_id',
      'subscription_order',
    ]
    const db = database({ columns: legacyColumns })

    normalizePodcastSourceSchema(db.value)

    const sql = db.exec.mock.calls.flat().join('\n')
    expect(sql).toContain('RENAME TO "podcast_source_legacy"')
    expect(sql).toContain('CREATE TABLE "podcast_source"')
    expect(sql).toContain('INSERT INTO "podcast_source"')
    expect(sql).toContain('DROP TABLE "podcast_source_legacy"')
  })

  it('leaves a canonical source table unchanged', () => {
    const db = database({ columns: canonicalColumns })

    normalizePodcastSourceSchema(db.value)

    expect(db.exec).not.toHaveBeenCalled()
  })
})
