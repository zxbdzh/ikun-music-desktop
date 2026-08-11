import type Database from 'better-sqlite3'
import tables, { DB_VERSION } from './tables'

// const migrateV1 = (db: Database.Database) => {
//   const sql = `
//     DROP TABLE "main"."download_list";

//     CREATE TABLE "download_list" (
//       "id" TEXT NOT NULL,
//       "isComplate" INTEGER NOT NULL,
//       "status" TEXT NOT NULL,
//       "statusText" TEXT NOT NULL,
//       "progress_downloaded" INTEGER NOT NULL,
//       "progress_total" INTEGER NOT NULL,
//       "url" TEXT,
//       "quality" TEXT NOT NULL,
//       "ext" TEXT NOT NULL,
//       "fileName" TEXT NOT NULL,
//       "filePath" TEXT NOT NULL,
//       "musicInfo" TEXT NOT NULL,
//       "position" INTEGER NOT NULL,
//       PRIMARY KEY("id")
//     );
//   `
//   db.exec(sql)
//   db.prepare('UPDATE "main"."db_info" SET "field_value"=@value WHERE "field_name"=@name').run({ name: 'version', value: '2' })
// }

const migrateV1 = (db: Database.Database) => {
  // 修复 v2.4.0 的默认数据库版本号不对的问题
  const existsTable = db
    .prepare("SELECT name FROM \"main\".sqlite_master WHERE type='table' AND name='dislike_list';")
    .get()
  if (!existsTable) {
    const sql = tables.get('dislike_list')!
    db.exec(sql)
  }
}

const migrateV2 = (db: Database.Database) => {
  const names = [
    'podcast_source',
    'podcast_episode',
    'podcast_episode_state',
    'podcast_transcript',
    'podcast_sync_state',
  ] as const
  db.transaction(() => {
    for (const name of names) {
      const exists = db
        .prepare("SELECT name FROM \"main\".sqlite_master WHERE type='table' AND name=?;")
        .get(name)
      if (!exists) db.exec(tables.get(name)!)
    }
  })()
}

export const migratePodcastSubscriptions = (db: Database.Database) => {
  db.transaction(() => {
    const groupTable = db
      .prepare("SELECT name FROM \"main\".sqlite_master WHERE type='table' AND name=?;")
      .get('podcast_subscription_group')
    if (!groupTable) db.exec(tables.get('podcast_subscription_group')!)

    const columns = db.prepare('PRAGMA table_info(podcast_source)').all() as Array<{ name: string }>
    const names = new Set(columns.map((column) => column.name))
    if (!names.has('group_id')) {
      db.exec("ALTER TABLE podcast_source ADD COLUMN group_id TEXT NOT NULL DEFAULT 'default_group'")
    }
    if (!names.has('subscription_order')) {
      db.exec('ALTER TABLE podcast_source ADD COLUMN subscription_order INTEGER NOT NULL DEFAULT 0')
    }
    db.prepare(`
      INSERT OR IGNORE INTO podcast_subscription_group (id, name, is_expanded, sort_order)
      VALUES ('default_group', '默认', 1, 0)
    `).run()
  })()
}

const podcastSourceColumns = [
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

export const normalizePodcastSourceSchema = (db: Database.Database) => {
  const columns = db.prepare('PRAGMA table_info(podcast_source)').all() as Array<{ name: string }>
  if (columns.map((column) => column.name).join('|') === podcastSourceColumns.join('|')) return

  db.transaction(() => {
    db.exec('ALTER TABLE "podcast_source" RENAME TO "podcast_source_legacy"')
    db.exec(tables.get('podcast_source')!)
    const columnsSql = podcastSourceColumns.map((name) => `"${name}"`).join(', ')
    db.exec(`
      INSERT INTO "podcast_source" (${columnsSql})
      SELECT ${columnsSql} FROM "podcast_source_legacy"
    `)
    db.exec('DROP TABLE "podcast_source_legacy"')
  })()
}

export const migratePodcastEpisodeOriginalUrl = (db: Database.Database) => {
  const columns = db.prepare('PRAGMA table_info(podcast_episode)').all() as Array<{ name: string }>
  if (columns.some((column) => column.name === 'original_url')) return
  db.exec('ALTER TABLE podcast_episode ADD COLUMN "original_url" TEXT NOT NULL DEFAULT \'\'')
}

export default (db: Database.Database) => {
  // PRAGMA user_version = x
  // console.log(db.prepare('PRAGMA user_version').get().user_version)
  // https://github.com/WiseLibs/better-sqlite3/issues/668#issuecomment-1145285728
  const version = (
    db
      .prepare<[string]>('SELECT "field_value" FROM "main"."db_info" WHERE "field_name" = ?')
      .get('version') as { field_value: string }
  ).field_value
  switch (version) {
    case '1':
      migrateV1(db)
      migrateV2(db)
      migratePodcastSubscriptions(db)
      normalizePodcastSourceSchema(db)
      migratePodcastEpisodeOriginalUrl(db)
      db.prepare('UPDATE "main"."db_info" SET "field_value"=@value WHERE "field_name"=@name').run({
        name: 'version',
        value: DB_VERSION,
      })
      break
    case '2':
      migrateV2(db)
      migratePodcastSubscriptions(db)
      normalizePodcastSourceSchema(db)
      migratePodcastEpisodeOriginalUrl(db)
      db.prepare('UPDATE "main"."db_info" SET "field_value"=@value WHERE "field_name"=@name').run({
        name: 'version',
        value: DB_VERSION,
      })
      break
    case '3':
      migratePodcastSubscriptions(db)
      normalizePodcastSourceSchema(db)
      migratePodcastEpisodeOriginalUrl(db)
      db.prepare('UPDATE "main"."db_info" SET "field_value"=@value WHERE "field_name"=@name').run({
        name: 'version',
        value: DB_VERSION,
      })
      break
    case '4':
      normalizePodcastSourceSchema(db)
      migratePodcastEpisodeOriginalUrl(db)
      db.prepare('UPDATE "main"."db_info" SET "field_value"=@value WHERE "field_name"=@name').run({
        name: 'version',
        value: DB_VERSION,
      })
      break
  }
}
