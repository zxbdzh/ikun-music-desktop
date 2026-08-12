// export const sql = `
//   CREATE TABLE "db_info" (
//     "id" INTEGER NOT NULL UNIQUE,
//     "field_name" TEXT,
//     "field_value" TEXT,
//     PRIMARY KEY("id" AUTOINCREMENT)
//   );

//   CREATE TABLE "my_list" (
//     "id" TEXT NOT NULL,
//     "name" TEXT NOT NULL,
//     "source" TEXT,
//     "sourceListId" TEXT,
//     "position" INTEGER NOT NULL,
//     "locationUpdateTime" INTEGER,
//     PRIMARY KEY("id")
//   );

//   CREATE TABLE "my_list_music_info" (
//     "id" TEXT NOT NULL,
//     "listId" TEXT NOT NULL,
//     "name" TEXT NOT NULL,
//     "singer" TEXT NOT NULL,
//     "source" TEXT NOT NULL,
//     "interval" TEXT,
//     "meta" TEXT NOT NULL,
//     UNIQUE("id","listId")
//   );
//   CREATE INDEX "index_my_list_music_info" ON "my_list_music_info" (
//     "id",
//     "listId"
//   );

//   CREATE TABLE "my_list_music_info_order" (
//     "listId" TEXT NOT NULL,
//     "musicInfoId" TEXT NOT NULL,
//     "order" INTEGER NOT NULL
//   );
//   CREATE INDEX "index_my_list_music_info_order" ON "my_list_music_info_order" (
//     "listId",
//     "musicInfoId"
//   );

//   CREATE TABLE "music_info_other_source" (
//     "source_id" TEXT NOT NULL,
//     "id" TEXT NOT NULL,
//     "source" TEXT NOT NULL,
//     "name" TEXT NOT NULL,
//     "singer" TEXT NOT NULL,
//     "meta" TEXT NOT NULL,
//     "order" INTEGER NOT NULL,
//     UNIQUE("source_id","id")
//   );
//   CREATE INDEX "index_music_info_other_source" ON "music_info_other_source" (
//     "source_id",
//     "id"
//   );

//   -- TODO  "meta" TEXT NOT NULL,
//   CREATE TABLE "lyric" (
//     "id" TEXT NOT NULL,
//     "source" TEXT NOT NULL,
//     "type" TEXT NOT NULL,
//     "text" TEXT NOT NULL
//   );

//   CREATE TABLE "music_url" (
//     "id" TEXT NOT NULL,
//     "url" TEXT NOT NULL
//   );

//   CREATE TABLE "download_list" (
//     "id" TEXT NOT NULL,
//     "isComplate" INTEGER NOT NULL,
//     "status" TEXT NOT NULL,
//     "statusText" TEXT NOT NULL,
//     "progress_downloaded" INTEGER NOT NULL,
//     "progress_total" INTEGER NOT NULL,
//     "url" TEXT,
//     "quality" TEXT NOT NULL,
//     "ext" TEXT NOT NULL,
//     "fileName" TEXT NOT NULL,
//     "filePath" TEXT NOT NULL,
//     "musicInfo" TEXT NOT NULL,
//     "position" INTEGER NOT NULL,
//     PRIMARY KEY("id")
//   );
// `

// export const tables = [
//   'table_db_info',
//   'table_my_list',
//   'table_my_list_music_info',
//   'index_index_my_list_music_info',
//   'table_my_list_music_info_order',
//   'index_index_my_list_music_info_order',
//   'table_music_info_other_source',
//   'index_index_music_info_other_source',
//   'table_lyric',
//   'table_music_url',
//   'table_download_list',
// ]

type Tables =
  | 'db_info'
  | 'my_list'
  | 'my_list_music_info'
  | 'index_my_list_music_info'
  | 'my_list_music_info_order'
  | 'index_my_list_music_info_order'
  | 'music_info_other_source'
  | 'index_music_info_other_source'
  | 'lyric'
  | 'music_url'
  | 'download_list'
  | 'dislike_list'
  | 'podcast_source'
  | 'podcast_subscription_group'
  | 'podcast_episode'
  | 'podcast_episode_state'
  | 'podcast_transcript'
  | 'podcast_long_form_content'
  | 'podcast_sync_state'

const tables = new Map<Tables, string>()

tables.set(
  'db_info',
  `
  CREATE TABLE "db_info" (
    "id" INTEGER NOT NULL UNIQUE,
    "field_name" TEXT,
    "field_value" TEXT,
    PRIMARY KEY("id" AUTOINCREMENT)
  );
`
)
tables.set(
  'my_list',
  `
  CREATE TABLE "my_list" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "sourceListId" TEXT,
    "position" INTEGER NOT NULL,
    "locationUpdateTime" INTEGER,
    PRIMARY KEY("id")
  );
`
)
tables.set(
  'my_list_music_info',
  `
  CREATE TABLE "my_list_music_info" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "singer" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "interval" TEXT,
    "meta" TEXT NOT NULL,
    UNIQUE("id","listId")
  );
`
)
tables.set(
  'index_my_list_music_info',
  `
  CREATE INDEX "index_my_list_music_info" ON "my_list_music_info" (
    "id",
    "listId"
  );
`
)
tables.set(
  'my_list_music_info_order',
  `
  CREATE TABLE "my_list_music_info_order" (
    "listId" TEXT NOT NULL,
    "musicInfoId" TEXT NOT NULL,
    "order" INTEGER NOT NULL
  );
`
)
tables.set(
  'index_my_list_music_info_order',
  `
  CREATE INDEX "index_my_list_music_info_order" ON "my_list_music_info_order" (
    "listId",
    "musicInfoId"
  );
`
)
tables.set(
  'music_info_other_source',
  `
  CREATE TABLE "music_info_other_source" (
    "source_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "singer" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    UNIQUE("source_id","id")
  );
`
)
tables.set(
  'index_music_info_other_source',
  `
  CREATE INDEX "index_music_info_other_source" ON "music_info_other_source" (
    "source_id",
    "id"
  );
`
)
tables.set(
  'lyric',
  `
  -- TODO  "meta" TEXT NOT NULL,
  CREATE TABLE "lyric" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL
  );
`
)
tables.set(
  'music_url',
  `
  CREATE TABLE "music_url" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL
  );
`
)
tables.set(
  'download_list',
  `
  CREATE TABLE "download_list" (
    "id" TEXT NOT NULL,
    "isComplate" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "statusText" TEXT NOT NULL,
    "progress_downloaded" INTEGER NOT NULL,
    "progress_total" INTEGER NOT NULL,
    "url" TEXT,
    "quality" TEXT NOT NULL,
    "ext" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "musicInfo" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    PRIMARY KEY("id")
  );
`
)
tables.set(
  'dislike_list',
  `
  CREATE TABLE "dislike_list" (
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta" TEXT
  );
`
)

tables.set(
  'podcast_source',
  `
  CREATE TABLE "podcast_source" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "artwork_url" TEXT NOT NULL,
    "feed_url" TEXT NOT NULL,
    "categories_json" TEXT NOT NULL,
    "subscribed" INTEGER NOT NULL,
    "auto_download" INTEGER NOT NULL,
    "group_id" TEXT NOT NULL DEFAULT 'default_group',
    "subscription_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" INTEGER NOT NULL,
    PRIMARY KEY("id")
  );
`
)
tables.set(
  'podcast_subscription_group',
  `
  CREATE TABLE "podcast_subscription_group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_expanded" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    PRIMARY KEY("id")
  );
`
)

export const initialData = [
  `
  INSERT OR IGNORE INTO "podcast_subscription_group" ("id", "name", "is_expanded", "sort_order")
  VALUES ('default_group', '默认', 1, 0);
`,
]
tables.set(
  'podcast_episode',
  `
  CREATE TABLE "podcast_episode" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "artwork_url" TEXT NOT NULL,
    "audio_url" TEXT NOT NULL,
    "published_at" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "transcript_references_json" TEXT NOT NULL,
    "chapters_url" TEXT,
    "chapters_json" TEXT NOT NULL,
    "updated_at" INTEGER NOT NULL,
    "original_url" TEXT NOT NULL DEFAULT '',
    PRIMARY KEY("id")
  );
`
)
tables.set(
  'podcast_episode_state',
  `
  CREATE TABLE "podcast_episode_state" (
    "account_id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "position_seconds" REAL NOT NULL,
    "is_finished" INTEGER NOT NULL,
    "is_favorite" INTEGER NOT NULL,
    "dirty_mask" INTEGER NOT NULL,
    "client_updated_at" INTEGER NOT NULL,
    "server_updated_at" INTEGER NOT NULL,
    "history_hidden" INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY("account_id", "episode_id")
  );
`
)
tables.set(
  'podcast_transcript',
  `
  CREATE TABLE "podcast_transcript" (
    "episode_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "is_active" INTEGER NOT NULL,
    "snapshot_json" TEXT NOT NULL,
    "updated_at" INTEGER NOT NULL,
    PRIMARY KEY("episode_id", "version_id")
  );
`
)
tables.set(
  'podcast_long_form_content',
  `
  CREATE TABLE "podcast_long_form_content" (
    "episode_id" TEXT NOT NULL,
    "document_json" TEXT NOT NULL,
    "updated_at" INTEGER NOT NULL,
    PRIMARY KEY("episode_id")
  );
`
)
tables.set(
  'podcast_sync_state',
  `
  CREATE TABLE "podcast_sync_state" (
    "account_id" TEXT NOT NULL,
    "watermark" INTEGER NOT NULL,
    "outbox_json" TEXT NOT NULL,
    "updated_at" INTEGER NOT NULL,
    PRIMARY KEY("account_id")
  );
`
)

export default tables

export const DB_VERSION = '7'
