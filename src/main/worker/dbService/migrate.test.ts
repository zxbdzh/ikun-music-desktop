import { describe, expect, it, vi } from 'vitest'
import migrateDatabase, {
  migratePodcastEpisodeHistoryHidden,
  migratePodcastEpisodeOriginalUrl,
  migratePodcastLibraryIndexes,
  migratePodcastLongFormContent,
  migratePodcastSubscriptions,
  normalizePodcastSourceSchema,
} from './migrate'

const database = (options: {
  hasGroupTable?: boolean
  columns?: string[]
  episodeColumns?: string[]
  episodeStateColumns?: string[]
  version?: string
} = {}) => {
  const exec = vi.fn()
  const run = vi.fn()
  const prepare = vi.fn((sql: string) => {
    if (sql.includes('SELECT "field_value"')) {
      return { get: vi.fn(() => ({ field_value: options.version ?? '5' })) }
    }
    if (sql.includes('sqlite_master')) {
      return { get: vi.fn((_name?: string) => options.hasGroupTable ? { name: 'table' } : undefined) }
    }
    if (sql.includes('PRAGMA table_info(podcast_episode)')) {
      return { all: vi.fn(() => (options.episodeColumns ?? []).map((name) => ({ name }))) }
    }
    if (sql.includes('PRAGMA table_info(podcast_episode_state)')) {
      return {
        all: vi.fn(() => (options.episodeStateColumns ?? []).map((name) => ({ name }))),
      }
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

describe('podcast episode history visibility database migration', () => {
  it('adds hidden history storage to a v5 database', () => {
    const db = database({ episodeStateColumns: ['account_id', 'episode_id'] })

    migratePodcastEpisodeHistoryHidden(db.value)

    expect(db.exec).toHaveBeenCalledWith(
      'ALTER TABLE podcast_episode_state ADD COLUMN "history_hidden" INTEGER NOT NULL DEFAULT 0'
    )
  })

  it('is idempotent when hidden history storage already exists', () => {
    const db = database({
      episodeStateColumns: ['account_id', 'episode_id', 'history_hidden'],
    })

    migratePodcastEpisodeHistoryHidden(db.value)

    expect(db.exec).not.toHaveBeenCalled()
  })
})

describe('podcast long-form content database migration', () => {
  it('creates independent long-form content storage', () => {
    const db = database()

    migratePodcastLongFormContent(db.value)

    expect(db.exec.mock.calls.flat().join('\n')).toContain(
      'CREATE TABLE "podcast_long_form_content"'
    )
  })

  it('is idempotent when long-form storage already exists', () => {
    const db = database({ hasGroupTable: true })

    migratePodcastLongFormContent(db.value)

    expect(db.exec).not.toHaveBeenCalled()
  })
})

describe('podcast library index migration', () => {
  it('creates partial indexes for favorites and playback history', () => {
    const db = database()

    migratePodcastLibraryIndexes(db.value)

    const sql = db.exec.mock.calls.flat().join('\n')
    expect(sql).toContain('podcast_episode_state_favorites_library_idx')
    expect(sql).toContain('WHERE "is_favorite" = 1')
    expect(sql).toContain('podcast_episode_state_history_library_idx')
    expect(sql).toContain('"history_hidden" = 0')
  })
})

describe('database migration dispatch', () => {
  it('upgrades a v5 database to v8 with hidden history, long-form storage and indexes', () => {
    const db = database({
      version: '5',
      episodeStateColumns: ['account_id', 'episode_id'],
    })

    migrateDatabase(db.value)

    expect(db.exec).toHaveBeenCalledWith(
      'ALTER TABLE podcast_episode_state ADD COLUMN "history_hidden" INTEGER NOT NULL DEFAULT 0'
    )
    expect(db.exec.mock.calls.flat().join('\n')).toContain('podcast_long_form_content')
    expect(db.exec.mock.calls.flat().join('\n')).toContain(
      'podcast_episode_state_favorites_library_idx'
    )
    expect(db.run).toHaveBeenCalledWith({ name: 'version', value: '8' })
  })

  it('upgrades a v6 database to v8 with long-form storage and indexes', () => {
    const db = database({ version: '6' })

    migrateDatabase(db.value)

    expect(db.exec.mock.calls.flat().join('\n')).toContain('podcast_long_form_content')
    expect(db.exec.mock.calls.flat().join('\n')).toContain(
      'podcast_episode_state_history_library_idx'
    )
    expect(db.run).toHaveBeenCalledWith({ name: 'version', value: '8' })
  })

  it('upgrades a v7 database to v8 by adding only the library indexes', () => {
    const db = database({ version: '7' })

    migrateDatabase(db.value)

    const sql = db.exec.mock.calls.flat().join('\n')
    expect(sql).toContain('podcast_episode_state_favorites_library_idx')
    expect(sql).toContain('podcast_episode_state_history_library_idx')
    expect(sql).not.toContain('podcast_long_form_content')
    expect(db.run).toHaveBeenCalledWith({ name: 'version', value: '8' })
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
