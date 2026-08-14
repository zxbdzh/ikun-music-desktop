import { getDB } from '../../db'

export const podcastSourcesGet = (): LX.Podcast.Source[] => {
  const rows = getDB()
    .prepare<[]>(`SELECT * FROM podcast_source ORDER BY subscribed DESC, title COLLATE NOCASE ASC`)
    .all() as SourceRow[]
  return rows.map(fromSourceRow)
}

export const podcastSourcesSave = (sources: LX.Podcast.Source[]) => {
  const db = getDB()
  const statement = db.prepare<[SourceRow]>(`
    INSERT INTO podcast_source (
      id, title, author, description, artwork_url, feed_url, categories_json,
      subscribed, auto_download, group_id, subscription_order, updated_at
    ) VALUES (
      @id, @title, @author, @description, @artwork_url, @feed_url, @categories_json,
      @subscribed, @auto_download, @group_id, @subscription_order, @updated_at
    ) ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      author=excluded.author,
      description=excluded.description,
      artwork_url=excluded.artwork_url,
      feed_url=excluded.feed_url,
      categories_json=excluded.categories_json,
      subscribed=excluded.subscribed,
      auto_download=excluded.auto_download,
      updated_at=excluded.updated_at
  `)
  db.transaction((items: LX.Podcast.Source[]) => {
    for (const source of items) statement.run(toSourceRow(source))
  })(sources)
}

export const podcastSourceSubscriptionSet = (
  id: string,
  subscribed: boolean,
  autoDownload: boolean
) => {
  getDB()
    .prepare<[number, number, number, string]>(`
      UPDATE podcast_source
      SET subscribed=?, auto_download=?, updated_at=?
      WHERE id=?
    `)
    .run(subscribed ? 1 : 0, autoDownload ? 1 : 0, Date.now(), id)
}

export const podcastSourceSubscriptionsReplace = (identifiers: string[]) => {
  const db = getDB()
  const values = [...new Set(identifiers.filter(Boolean))]
  db.transaction(() => {
    db.prepare(`UPDATE podcast_source SET subscribed=0, auto_download=0`).run()
    const subscribe = db.prepare<[number, string, string]>(`
      UPDATE podcast_source SET subscribed=1, updated_at=? WHERE id=? OR feed_url=?
    `)
    for (const value of values) subscribe.run(Date.now(), value, value)
  })()
}

export const podcastSubscriptionGroupsGet = (): LX.Podcast.SubscriptionGroup[] => {
  const rows = getDB()
    .prepare<[]>(`SELECT * FROM podcast_subscription_group ORDER BY sort_order, name COLLATE NOCASE`)
    .all() as SubscriptionGroupRow[]
  return rows.map(fromSubscriptionGroupRow)
}

export const podcastSubscriptionGroupSave = (group: LX.Podcast.SubscriptionGroup) => {
  getDB().prepare(`
    INSERT INTO podcast_subscription_group (id, name, is_expanded, sort_order)
    VALUES (@id, @name, @is_expanded, @sort_order)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      is_expanded=excluded.is_expanded,
      sort_order=excluded.sort_order
  `).run(toSubscriptionGroupRow(group))
}

export const podcastSubscriptionGroupDelete = (groupId: string) => {
  const db = getDB()
  db.transaction(() => {
    db.prepare(`UPDATE podcast_source SET group_id='default_group' WHERE group_id=?`).run(groupId)
    db.prepare(`DELETE FROM podcast_subscription_group WHERE id=? AND id!='default_group'`).run(groupId)
  })()
}

export const podcastSourceGroupSet = (sourceId: string, groupId: string) => {
  getDB().prepare(`UPDATE podcast_source SET group_id=?, updated_at=? WHERE id=?`)
    .run(groupId, Date.now(), sourceId)
}

export const podcastSubscriptionSnapshotReplace = (snapshot: LX.Podcast.SubscriptionSnapshot) => {
  const db = getDB()
  db.transaction(() => {
    db.prepare(`UPDATE podcast_source SET subscribed=0, auto_download=0`).run()
    db.prepare(`DELETE FROM podcast_subscription_group`).run()
    const saveGroup = db.prepare(`
      INSERT INTO podcast_subscription_group (id, name, is_expanded, sort_order)
      VALUES (@id, @name, @is_expanded, @sort_order)
    `)
    for (const group of snapshot.groups) saveGroup.run(toSubscriptionGroupRow(group))

    const findSource = db.prepare(`SELECT id FROM podcast_source WHERE id=? OR feed_url=? LIMIT 1`)
    const updateSource = db.prepare(`
      UPDATE podcast_source
      SET subscribed=1, group_id=?, subscription_order=?, updated_at=?
      WHERE id=?
    `)
    const insertSource = db.prepare(`
      INSERT INTO podcast_source (
        id, title, author, description, artwork_url, feed_url, categories_json,
        subscribed, auto_download, group_id, subscription_order, updated_at
      ) VALUES (?, ?, '', '', ?, ?, '[]', 1, 0, ?, ?, ?)
    `)
    snapshot.sources.forEach((source, index) => {
      const existing = findSource.get(source.id, source.url) as { id: string } | undefined
      if (existing) {
        updateSource.run(source.groupId, index, Date.now(), existing.id)
      } else {
        insertSource.run(
          source.id,
          source.label,
          source.image ?? '',
          source.url,
          source.groupId,
          index,
          Date.now()
        )
      }
    })
  })()
}

export const podcastEpisodesGet = (sourceId: string): LX.Podcast.Episode[] => {
  const rows = getDB()
    .prepare<[string]>(`SELECT * FROM podcast_episode WHERE source_id=? ORDER BY published_at DESC`)
    .all(sourceId) as EpisodeRow[]
  return rows.map(fromEpisodeRow)
}

export const podcastEpisodeGet = (id: string): LX.Podcast.Episode | null => {
  const row = getDB().prepare<[string]>(`SELECT * FROM podcast_episode WHERE id=?`).get(id) as
    | EpisodeRow
    | undefined
  return row ? fromEpisodeRow(row) : null
}

export const podcastEpisodesSave = (episodes: LX.Podcast.Episode[]) => {
  const db = getDB()
  const statement = db.prepare<[EpisodeRow]>(`
    INSERT INTO podcast_episode (
      id, source_id, guid, title, description, artwork_url, audio_url, published_at,
      duration_seconds, transcript_references_json, chapters_url, chapters_json, updated_at,
      original_url
    ) VALUES (
      @id, @source_id, @guid, @title, @description, @artwork_url, @audio_url, @published_at,
      @duration_seconds, @transcript_references_json, @chapters_url, @chapters_json, @updated_at,
      @original_url
    ) ON CONFLICT(id) DO UPDATE SET
      source_id=excluded.source_id,
      guid=excluded.guid,
      title=excluded.title,
      description=excluded.description,
      artwork_url=excluded.artwork_url,
      audio_url=excluded.audio_url,
      published_at=excluded.published_at,
      duration_seconds=excluded.duration_seconds,
      transcript_references_json=excluded.transcript_references_json,
      chapters_url=excluded.chapters_url,
      chapters_json=excluded.chapters_json,
      updated_at=excluded.updated_at,
      original_url=excluded.original_url
  `)
  db.transaction((items: LX.Podcast.Episode[]) => {
    for (const episode of items) statement.run(toEpisodeRow(episode))
  })(episodes)
}

export const podcastLongFormContentGet = (
  episodeId: string
): LX.Podcast.LongFormContentDocument | null => {
  const row = getDB()
    .prepare<[string]>(`SELECT document_json FROM podcast_long_form_content WHERE episode_id=?`)
    .get(episodeId) as { document_json: string } | undefined
  if (!row) return null
  try {
    const document = JSON.parse(row.document_json) as LX.Podcast.LongFormContentDocument
    return document.protocolVersion === 1 && document.contentId === episodeId ? document : null
  } catch {
    return null
  }
}

export const podcastLongFormContentsSave = (
  documents: LX.Podcast.LongFormContentDocument[]
) => {
  const db = getDB()
  const statement = db.prepare(`
    INSERT INTO podcast_long_form_content (episode_id, document_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(episode_id) DO UPDATE SET
      document_json=excluded.document_json,
      updated_at=excluded.updated_at
  `)
  db.transaction((items: LX.Podcast.LongFormContentDocument[]) => {
    for (const document of items) {
      statement.run(document.contentId, JSON.stringify(document), Date.now())
    }
  })(documents)
}

export const podcastEpisodeStateGet = (
  accountId: string,
  episodeId: string
): LX.Podcast.EpisodeState | null => {
  const row = getDB()
    .prepare<[string, string]>(
      `SELECT * FROM podcast_episode_state WHERE account_id=? AND episode_id=?`
    )
    .get(accountId, episodeId) as EpisodeStateRow | undefined
  return row ? fromEpisodeStateRow(row) : null
}

export const podcastEpisodeStateSave = (state: LX.Podcast.EpisodeState) => {
  getDB()
    .prepare<[EpisodeStateRow]>(`
      INSERT INTO podcast_episode_state (
        account_id, episode_id, position_seconds, is_finished, is_favorite,
        dirty_mask, client_updated_at, server_updated_at, history_hidden
      ) VALUES (
        @account_id, @episode_id, @position_seconds, @is_finished, @is_favorite,
        @dirty_mask, @client_updated_at, @server_updated_at, @history_hidden
      ) ON CONFLICT(account_id, episode_id) DO UPDATE SET
        position_seconds=excluded.position_seconds,
        is_finished=excluded.is_finished,
        is_favorite=excluded.is_favorite,
        dirty_mask=excluded.dirty_mask,
        client_updated_at=excluded.client_updated_at,
        server_updated_at=excluded.server_updated_at,
        history_hidden=excluded.history_hidden
    `)
    .run(toEpisodeStateRow(state))
}

export const podcastEpisodeStatesGet = (
  accountId: string,
  dirtyOnly = false
): LX.Podcast.EpisodeState[] => {
  const rows = getDB()
    .prepare<[string]>(
      `SELECT * FROM podcast_episode_state WHERE account_id=?${dirtyOnly ? ' AND dirty_mask != 0' : ''}`
    )
    .all(accountId) as EpisodeStateRow[]
  return rows.map(fromEpisodeStateRow)
}

export const podcastLibraryPageGet = (
  accountId: string,
  kind: LX.Podcast.LibraryKind,
  cursor?: LX.Podcast.LibraryCursor,
  limit = 50
): LX.Podcast.LibraryPage => {
  if (!Number.isFinite(limit)) throw new Error('无效的资料库分页大小')
  if (cursor && (
    !Number.isFinite(cursor.clientUpdatedAt) ||
    cursor.clientUpdatedAt < 0 ||
    typeof cursor.episodeId !== 'string' ||
    !cursor.episodeId.trim()
  )) {
    throw new Error('无效的资料库分页游标')
  }
  const pageSize = Math.min(100, Math.max(1, Math.trunc(limit)))
  const cursorClause = cursor
    ? `AND (
        state.client_updated_at < @cursorUpdatedAt OR
        (state.client_updated_at = @cursorUpdatedAt AND state.episode_id < @cursorEpisodeId)
      )`
    : ''
  const stateClause = kind === 'favorites'
    ? 'state.is_favorite = 1'
    : 'state.history_hidden = 0 AND (state.position_seconds > 0 OR state.is_finished = 1)'
  const statement = getDB().prepare(`
    SELECT
      episode.id AS episode_id,
      episode.source_id AS episode_source_id,
      episode.title AS episode_title,
      episode.artwork_url AS episode_artwork_url,
      episode.original_url AS episode_original_url,
      episode.audio_url AS episode_audio_url,
      episode.published_at AS episode_published_at,
      episode.duration_seconds AS episode_duration_seconds,
      source.id AS source_id,
      source.title AS source_title,
      source.artwork_url AS source_artwork_url,
      state.account_id,
      state.position_seconds,
      state.is_finished,
      state.is_favorite,
      state.history_hidden,
      state.dirty_mask,
      state.client_updated_at,
      state.server_updated_at
    FROM podcast_episode_state AS state
    INNER JOIN podcast_episode AS episode ON episode.id = state.episode_id
    INNER JOIN podcast_source AS source ON source.id = episode.source_id
    WHERE state.account_id = @accountId
      AND ${stateClause}
      ${cursorClause}
    ORDER BY state.client_updated_at DESC, state.episode_id DESC
    LIMIT @fetchLimit
  `)
  const parameters = cursor
    ? {
        accountId,
        cursorUpdatedAt: cursor.clientUpdatedAt,
        cursorEpisodeId: cursor.episodeId,
        fetchLimit: pageSize + 1,
      }
    : { accountId, fetchLimit: pageSize + 1 }
  const rows = statement.all(parameters) as LibraryRow[]
  const pageRows = rows.slice(0, pageSize)
  const lastRow = pageRows.at(-1)

  return {
    items: pageRows.map(fromLibraryRow),
    nextCursor: rows.length > pageSize && lastRow
      ? {
          clientUpdatedAt: lastRow.client_updated_at,
          episodeId: lastRow.episode_id,
        }
      : null,
  }
}

export const podcastEpisodeStatesMarkClean = (states: LX.Podcast.EpisodeState[]) => {
  const db = getDB()
  const statement = db.prepare<[string, string, number]>(`
    UPDATE podcast_episode_state SET dirty_mask=0
    WHERE account_id=? AND episode_id=? AND client_updated_at=?
  `)
  db.transaction((items: LX.Podcast.EpisodeState[]) => {
    for (const state of items) {
      statement.run(state.accountId, state.episodeId, state.clientUpdatedAt)
    }
  })(states)
}

export const podcastSyncStateGet = (accountId: string): LX.Podcast.SyncState => {
  const row = getDB()
    .prepare<[string]>(`SELECT * FROM podcast_sync_state WHERE account_id=?`)
    .get(accountId) as SyncStateRow | undefined
  return row
    ? {
        accountId: row.account_id,
        watermark: row.watermark,
        outbox: safeJson(row.outbox_json, []),
        updatedAt: row.updated_at,
      }
    : { accountId, watermark: 0, outbox: [], updatedAt: 0 }
}

export const podcastSyncStateSave = (state: LX.Podcast.SyncState) => {
  getDB()
    .prepare(`
      INSERT INTO podcast_sync_state (account_id, watermark, outbox_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        watermark=excluded.watermark,
        outbox_json=excluded.outbox_json,
        updated_at=excluded.updated_at
    `)
    .run(state.accountId, state.watermark, JSON.stringify(state.outbox), state.updatedAt)
}

export const podcastTranscriptGet = (episodeId: string): LX.Podcast.TranscriptSnapshot | null => {
  const row = getDB()
    .prepare<[string]>(`
      SELECT snapshot_json FROM podcast_transcript
      WHERE episode_id=? AND is_active=1
      ORDER BY updated_at DESC LIMIT 1
    `)
    .get(episodeId) as { snapshot_json: string } | undefined
  return row ? parseTranscriptSnapshot(row.snapshot_json) : null
}

export const podcastTranscriptSave = (
  versionId: string,
  snapshot: LX.Podcast.TranscriptSnapshot,
  active = true
) => {
  const db = getDB()
  db.transaction(() => {
    if (active) {
      db.prepare<[string]>(`UPDATE podcast_transcript SET is_active=0 WHERE episode_id=?`).run(
        snapshot.contentId
      )
    }
    db.prepare(`
      INSERT INTO podcast_transcript (
        episode_id, version_id, source, language, revision, state, is_active, snapshot_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(episode_id, version_id) DO UPDATE SET
        source=excluded.source,
        language=excluded.language,
        revision=excluded.revision,
        state=excluded.state,
        is_active=excluded.is_active,
        snapshot_json=excluded.snapshot_json,
        updated_at=excluded.updated_at
    `).run(
      snapshot.contentId,
      versionId,
      snapshot.source,
      snapshot.language,
      snapshot.revision,
      snapshot.state,
      active ? 1 : 0,
      JSON.stringify(snapshot),
      Date.now()
    )
  })()
}

const parseTranscriptSnapshot = (value: string): LX.Podcast.TranscriptSnapshot | null => {
  try {
    const snapshot = JSON.parse(value) as LX.Podcast.TranscriptSnapshot
    return snapshot.protocolVersion === 2 ? snapshot : null
  } catch {
    return null
  }
}

interface SourceRow {
  id: string
  title: string
  author: string
  description: string
  artwork_url: string
  feed_url: string
  categories_json: string
  subscribed: number
  auto_download: number
  group_id: string
  subscription_order: number
  updated_at: number
}

interface SubscriptionGroupRow {
  id: string
  name: string
  is_expanded: number
  sort_order: number
}

interface EpisodeRow {
  id: string
  source_id: string
  guid: string
  title: string
  description: string
  artwork_url: string
  audio_url: string
  published_at: number
  duration_seconds: number
  transcript_references_json: string
  chapters_url: string | null
  chapters_json: string
  updated_at: number
  original_url: string
}

interface EpisodeStateRow {
  account_id: string
  episode_id: string
  position_seconds: number
  is_finished: number
  is_favorite: number
  dirty_mask: number
  client_updated_at: number
  server_updated_at: number
  history_hidden: number
}

interface LibraryRow extends EpisodeStateRow {
  episode_id: string
  episode_source_id: string
  episode_title: string
  episode_artwork_url: string
  episode_original_url: string
  episode_audio_url: string
  episode_published_at: number
  episode_duration_seconds: number
  source_id: string
  source_title: string
  source_artwork_url: string
}

interface SyncStateRow {
  account_id: string
  watermark: number
  outbox_json: string
  updated_at: number
}

const toSourceRow = (source: LX.Podcast.Source): SourceRow => ({
  id: source.id,
  title: source.title,
  author: source.author,
  description: source.description,
  artwork_url: source.artworkUrl,
  feed_url: source.feedUrl,
  categories_json: JSON.stringify(source.categories),
  subscribed: source.subscribed ? 1 : 0,
  auto_download: source.autoDownload ? 1 : 0,
  group_id: source.groupId,
  subscription_order: source.subscriptionOrder,
  updated_at: source.updatedAt,
})
const fromSourceRow = (row: SourceRow): LX.Podcast.Source => ({
  id: row.id,
  title: row.title,
  author: row.author,
  description: row.description,
  artworkUrl: row.artwork_url,
  feedUrl: row.feed_url,
  categories: safeJson(row.categories_json, []),
  subscribed: row.subscribed === 1,
  autoDownload: row.auto_download === 1,
  groupId: row.group_id,
  subscriptionOrder: row.subscription_order,
  updatedAt: row.updated_at,
})

const toSubscriptionGroupRow = (group: LX.Podcast.SubscriptionGroup): SubscriptionGroupRow => ({
  id: group.id,
  name: group.name,
  is_expanded: group.isExpanded ? 1 : 0,
  sort_order: group.sortOrder,
})

const fromSubscriptionGroupRow = (row: SubscriptionGroupRow): LX.Podcast.SubscriptionGroup => ({
  id: row.id,
  name: row.name,
  isExpanded: row.is_expanded === 1,
  sortOrder: row.sort_order,
})
const toEpisodeRow = (episode: LX.Podcast.Episode): EpisodeRow => ({
  id: episode.id,
  source_id: episode.sourceId,
  guid: episode.guid,
  title: episode.title,
  description: episode.description,
  artwork_url: episode.artworkUrl,
  audio_url: episode.audioUrl,
  published_at: episode.publishedAt,
  duration_seconds: episode.durationSeconds,
  transcript_references_json: JSON.stringify(episode.transcriptReferences),
  chapters_url: episode.chaptersUrl ?? null,
  chapters_json: JSON.stringify(episode.chapters),
  updated_at: episode.updatedAt,
  original_url: episode.originalUrl ?? '',
})
const fromEpisodeRow = (row: EpisodeRow): LX.Podcast.Episode => ({
  id: row.id,
  sourceId: row.source_id,
  guid: row.guid,
  title: row.title,
  description: row.description,
  artworkUrl: row.artwork_url,
  audioUrl: row.audio_url,
  publishedAt: row.published_at,
  durationSeconds: row.duration_seconds,
  transcriptReferences: safeJson(row.transcript_references_json, []),
  chaptersUrl: row.chapters_url ?? undefined,
  chapters: safeJson(row.chapters_json, []),
  updatedAt: row.updated_at,
  originalUrl: row.original_url || undefined,
})
const toEpisodeStateRow = (state: LX.Podcast.EpisodeState): EpisodeStateRow => ({
  account_id: state.accountId,
  episode_id: state.episodeId,
  position_seconds: state.positionSeconds,
  is_finished: state.isFinished ? 1 : 0,
  is_favorite: state.isFavorite ? 1 : 0,
  dirty_mask: state.dirtyMask,
  client_updated_at: state.clientUpdatedAt,
  server_updated_at: state.serverUpdatedAt,
  history_hidden: state.historyHidden ? 1 : 0,
})
const fromEpisodeStateRow = (row: EpisodeStateRow): LX.Podcast.EpisodeState => ({
  accountId: row.account_id,
  episodeId: row.episode_id,
  positionSeconds: row.position_seconds,
  isFinished: row.is_finished === 1,
  isFavorite: row.is_favorite === 1,
  historyHidden: row.history_hidden === 1,
  dirtyMask: row.dirty_mask,
  clientUpdatedAt: row.client_updated_at,
  serverUpdatedAt: row.server_updated_at,
})
const fromLibraryRow = (row: LibraryRow): LX.Podcast.LibraryItem => ({
  episode: {
    id: row.episode_id,
    sourceId: row.episode_source_id,
    title: row.episode_title,
    artworkUrl: row.episode_artwork_url,
    originalUrl: row.episode_original_url || undefined,
    audioUrl: row.episode_audio_url,
    publishedAt: row.episode_published_at,
    durationSeconds: row.episode_duration_seconds,
  },
  source: {
    id: row.source_id,
    title: row.source_title,
    artworkUrl: row.source_artwork_url,
  },
  state: fromEpisodeStateRow(row),
})
const safeJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
