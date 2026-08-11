import { createHash } from 'node:crypto'

export const MAX_ARTICLE_METADATA_BYTES = 1024 * 1024

export interface ArticleSource {
  name: string
  url: string
}

export interface ArticleMetadata {
  articleId: string
  title: string
  description?: string
  content?: string
  url?: string
  image?: string
  publishedAt?: string
  displayTime?: number
  lang?: string | null
  source?: ArticleSource
  tags?: string | string[]
  audioUrl?: string | null
  audioDuration?: number | null
}

export const parseArticleMetadataJson = (
  value: unknown,
  expectedArticleId?: string
): ArticleMetadata | null => {
  if (typeof value !== 'string' || !value || byteLength(value) > MAX_ARTICLE_METADATA_BYTES) {
    return null
  }
  try {
    return normalizeArticleMetadata(JSON.parse(value), expectedArticleId)
  } catch {
    return null
  }
}

export const encodeArticleMetadata = (value: ArticleMetadata): string | null => {
  const metadata = normalizeArticleMetadata(value)
  if (!metadata) return null
  try {
    const json = JSON.stringify(metadata)
    return byteLength(json) <= MAX_ARTICLE_METADATA_BYTES ? json : null
  } catch {
    return null
  }
}

export const articleMetadataFromPodcast = (
  episode: LX.Podcast.Episode,
  source?: LX.Podcast.Source
): ArticleMetadata => {
  const url = normalizeHttpUrl(episode.originalUrl)
  const image = normalizeHttpUrl(episode.artworkUrl) ?? normalizeHttpUrl(source?.artworkUrl)
  const audioUrl = normalizeHttpUrl(episode.audioUrl)
  const sourceUrl = normalizeHttpUrl(source?.feedUrl)
  const publishedAt = validTimestamp(episode.publishedAt)
    ? new Date(episode.publishedAt).toUTCString()
    : undefined
  const displayTime = validTimestamp(episode.publishedAt)
    ? Math.floor(episode.publishedAt / 1_000)
    : undefined
  const audioDuration = Number.isFinite(episode.durationSeconds) && episode.durationSeconds > 0
    ? episode.durationSeconds
    : null

  return {
    articleId: episode.id,
    title: episode.title.trim() || episode.id,
    ...(episode.description ? { content: episode.description } : {}),
    ...(url ? { url } : {}),
    ...(image ? { image } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(displayTime != null ? { displayTime } : {}),
    ...(source && sourceUrl
      ? { source: { name: source.title.trim() || source.id, url: sourceUrl } }
      : {}),
    ...(source?.categories.length ? { tags: [...source.categories] } : {}),
    audioUrl: audioUrl ?? null,
    audioDuration,
  }
}

export const restorePodcastEntities = (
  metadata: ArticleMetadata,
  serverUpdatedAt: number
): { source: LX.Podcast.Source; episode: LX.Podcast.Episode } => {
  const sourceUrl = metadata.source?.url ?? metadata.url ?? metadata.audioUrl ??
    'https://app.aurioclub.com/'
  const sourceId = stableId(sourceUrl)
  const updatedAt = Number.isFinite(serverUpdatedAt) && serverUpdatedAt > 0
    ? Math.floor(serverUpdatedAt * 1_000)
    : Date.now()
  const publishedAt = metadata.displayTime != null
    ? metadata.displayTime * 1_000
    : parsePublishedAt(metadata.publishedAt)
  const categories = Array.isArray(metadata.tags)
    ? metadata.tags
    : metadata.tags
      ? [metadata.tags]
      : []
  const sourceName = metadata.source?.name ?? hostnameLabel(sourceUrl) ?? 'AurioClub 同步内容'
  const description = metadata.content || metadata.description || ''
  const artworkUrl = metadata.image ?? ''

  const source: LX.Podcast.Source = {
    id: sourceId,
    title: sourceName,
    author: sourceName,
    description: metadata.description ?? '',
    artworkUrl,
    feedUrl: sourceUrl,
    categories,
    subscribed: false,
    autoDownload: false,
    groupId: 'default_group',
    subscriptionOrder: 0,
    updatedAt,
  }
  const episode: LX.Podcast.Episode = {
    id: metadata.articleId,
    sourceId,
    guid: metadata.articleId,
    title: metadata.title,
    description,
    artworkUrl,
    originalUrl: metadata.url ?? '',
    audioUrl: metadata.audioUrl ?? '',
    publishedAt,
    durationSeconds: metadata.audioDuration == null
      ? 0
      : Math.max(0, Math.round(metadata.audioDuration)),
    transcriptReferences: [],
    chapters: [],
    updatedAt,
  }
  return { source, episode }
}

export const resolveArticleMetadataUrl = (metadata: ArticleMetadata): string =>
  normalizeHttpUrl(metadata.url) ?? normalizeHttpUrl(metadata.audioUrl) ?? ''

const normalizeArticleMetadata = (
  value: unknown,
  expectedArticleId?: string
): ArticleMetadata | null => {
  const item = recordValue(value)
  if (!item) return null
  const articleId = requiredString(item.articleId)
  const title = requiredString(item.title)
  if (!articleId || !title || (expectedArticleId && articleId !== expectedArticleId)) return null

  const description = optionalString(item.description)
  const content = optionalString(item.content)
  const url = normalizeHttpUrl(item.url)
  const image = normalizeHttpUrl(item.image)
  const publishedAt = optionalString(item.publishedAt)
  const displayTime = nonNegativeInteger(item.displayTime)
  const lang = item.lang === null ? null : optionalString(item.lang)
  const source = normalizeArticleSource(item.source)
  const tags = normalizeTags(item.tags)
  const audioUrl = item.audioUrl === null ? null : normalizeHttpUrl(item.audioUrl)
  const audioDuration = item.audioDuration === null
    ? null
    : nonNegativeNumber(item.audioDuration)

  return {
    articleId,
    title,
    ...(description != null ? { description } : {}),
    ...(content != null ? { content } : {}),
    ...(url ? { url } : {}),
    ...(image ? { image } : {}),
    ...(publishedAt != null ? { publishedAt } : {}),
    ...(displayTime != null ? { displayTime } : {}),
    ...(lang !== undefined ? { lang } : {}),
    ...(source ? { source } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(audioUrl !== undefined ? { audioUrl } : {}),
    ...(audioDuration !== undefined ? { audioDuration } : {}),
  }
}

const normalizeArticleSource = (value: unknown): ArticleSource | undefined => {
  const item = recordValue(value)
  if (!item) return undefined
  const name = requiredString(item.name)
  const url = normalizeHttpUrl(item.url)
  return name && url ? { name, url } : undefined
}

const normalizeTags = (value: unknown): string | string[] | undefined => {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return undefined
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

const normalizeHttpUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
    return url.href
  } catch {
    return undefined
  }
}

const recordValue = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
const requiredString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null
const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined
const nonNegativeInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
const nonNegativeNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
const validTimestamp = (value: number): boolean => Number.isFinite(value) && value > 0
const parsePublishedAt = (value?: string): number => {
  const timestamp = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}
const stableId = (value: string) => createHash('sha256').update(value).digest('hex')
const byteLength = (value: string) => Buffer.byteLength(value, 'utf8')
const hostnameLabel = (value: string): string | null => {
  try {
    return new URL(value).hostname || null
  } catch {
    return null
  }
}
