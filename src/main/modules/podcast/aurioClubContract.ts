export interface AurioClubUser {
  id: string
  email: string
  username: string
  points: number
  membership_tier: string
  is_premium: 0 | 1
  subscription_expires_at?: number | string | null
}

export interface AurioClubUserData {
  user: AurioClubUser
}

export interface AurioClubAuthSessionData {
  token: string
  user: AurioClubUser
}

export interface AurioClubLocalizedText {
  en?: string
  zh?: string
}

export interface AurioClubPodcast {
  id: number
  rss_url: string
  name: AurioClubLocalizedText
  name_json?: string
  description_json?: string
  hot_comment_json?: string
  host?: string
  rating?: number
  tags?: string[]
  cover_url?: string
  region?: string
  favorites_count?: number
  last_episode_at?: string | null
  total_episodes?: number
  created_at?: string
  updated_at?: string
  is_visible?: 0 | 1
  priority?: number
  description?: AurioClubLocalizedText
  hot_comment?: AurioClubLocalizedText
}

export interface AurioClubPopularSource {
  source: string
  total_duration: number
  view_count: number
}

export interface AurioClubItunesSearchResult {
  collectionName: string
  feedUrl: string
  wrapperType?: string
  kind?: string
  artistId?: number
  collectionId?: number
  trackId?: number
  artistName?: string
  trackName?: string
  collectionViewUrl?: string
  artworkUrl30?: string
  artworkUrl60?: string
  artworkUrl100?: string
  artworkUrl600?: string
  releaseDate?: string
  collectionExplicitness?: string
  trackExplicitness?: string
  trackCount?: number
  country?: string
  primaryGenreName?: string
  genres?: string[]
}

export interface AurioClubItunesSearchResponse {
  resultCount?: number
  results: AurioClubItunesSearchResult[]
}

export interface AurioClubSyncState {
  podcast_id: string
  server_updated_at: number
  position_seconds?: number | null
  is_finished?: 0 | 1 | null
  is_favorite?: 0 | 1 | null
  history_hidden?: 0 | 1 | null
  article_metadata_json?: string | null
}

export interface AurioClubSyncPreferences {
  server_updated_at: number
  subscriptions_json?: string | null
  app_settings_json?: string | null
}

export interface AurioClubSyncPullData {
  states: AurioClubSyncState[]
  preferences?: AurioClubSyncPreferences
  server_time: number
}

type Predicate = (value: unknown) => boolean

export const decodeAurioClubPodcasts = (value: unknown): AurioClubPodcast[] =>
  expectContract(value, isArrayOf(isPodcast), '播客目录')

export const decodeAurioClubPopularSources = (value: unknown): AurioClubPopularSource[] =>
  expectContract(value, isArrayOf(isPopularSource), '热门播客来源')

export const decodeAurioClubItunesSearch = (
  value: unknown
): AurioClubItunesSearchResponse =>
  expectContract(value, isItunesSearchResponse, 'iTunes 搜索结果')

export const decodeAurioClubAuthSession = (
  value: unknown
): AurioClubAuthSessionData =>
  expectContract(value, isAuthSessionData, '登录会话')

export const decodeAurioClubUserData = (value: unknown): AurioClubUserData =>
  expectContract(value, isUserData, '用户资料')

export const decodeAurioClubSyncPull = (value: unknown): AurioClubSyncPullData =>
  expectContract(value, isSyncPullData, '同步数据')

const expectContract = <T>(value: unknown, predicate: Predicate, name: string): T => {
  if (!predicate(value)) throw new Error(`${name}不符合响应契约`)
  return value as T
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isString = (value: unknown) => typeof value === 'string'
const isNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const isInteger = (value: unknown) => isNumber(value) && Number.isInteger(value)
const isFlag = (value: unknown) => value === 0 || value === 1
const isNullable = (value: unknown, predicate: Predicate) => value === null || predicate(value)
const isOptional = (value: unknown, predicate: Predicate) => value === undefined || predicate(value)
const isArrayOf = (predicate: Predicate) => (value: unknown) =>
  Array.isArray(value) && value.every(predicate)

const isLocalizedText = (value: unknown): value is AurioClubLocalizedText =>
  isRecord(value) &&
  isOptional(value.en, isString) &&
  isOptional(value.zh, isString)

const isUser = (value: unknown): value is AurioClubUser =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.email) &&
  isString(value.username) &&
  isNumber(value.points) &&
  isString(value.membership_tier) &&
  isFlag(value.is_premium) &&
  isOptional(
    value.subscription_expires_at,
    (item) => isNullable(item, (candidate) =>
      isInteger(candidate) || (isString(candidate) && /^\d+$/.test(candidate)))
  )

const isUserData = (value: unknown): value is AurioClubUserData =>
  isRecord(value) && isUser(value.user)

const isAuthSessionData = (value: unknown): value is AurioClubAuthSessionData =>
  isRecord(value) && isString(value.token) && isUser(value.user)

const isPodcast = (value: unknown): value is AurioClubPodcast =>
  isRecord(value) &&
  isInteger(value.id) &&
  isString(value.rss_url) &&
  isLocalizedText(value.name) &&
  isOptional(value.name_json, isString) &&
  isOptional(value.description_json, isString) &&
  isOptional(value.hot_comment_json, isString) &&
  isOptional(value.host, isString) &&
  isOptional(value.rating, isNumber) &&
  isOptional(value.tags, isArrayOf(isString)) &&
  isOptional(value.cover_url, isString) &&
  isOptional(value.region, isString) &&
  isOptional(value.favorites_count, isInteger) &&
  isOptional(value.last_episode_at, (item) => isNullable(item, isString)) &&
  isOptional(value.total_episodes, isInteger) &&
  isOptional(value.created_at, isString) &&
  isOptional(value.updated_at, isString) &&
  isOptional(value.is_visible, isFlag) &&
  isOptional(value.priority, isInteger) &&
  isOptional(value.description, isLocalizedText) &&
  isOptional(value.hot_comment, isLocalizedText)

const isPopularSource = (value: unknown): value is AurioClubPopularSource =>
  isRecord(value) &&
  isString(value.source) &&
  isNumber(value.total_duration) &&
  isNumber(value.view_count)

const isItunesSearchResult = (value: unknown): value is AurioClubItunesSearchResult =>
  isRecord(value) &&
  isString(value.collectionName) &&
  isString(value.feedUrl) &&
  [
    value.wrapperType,
    value.kind,
    value.artistName,
    value.trackName,
    value.collectionViewUrl,
    value.artworkUrl30,
    value.artworkUrl60,
    value.artworkUrl100,
    value.artworkUrl600,
    value.releaseDate,
    value.collectionExplicitness,
    value.trackExplicitness,
    value.country,
    value.primaryGenreName,
  ].every((item) => isOptional(item, isString)) &&
  [value.artistId, value.collectionId, value.trackId, value.trackCount]
    .every((item) => isOptional(item, isInteger)) &&
  isOptional(value.genres, isArrayOf(isString))

const isItunesSearchResponse = (value: unknown): value is AurioClubItunesSearchResponse =>
  isRecord(value) &&
  isOptional(value.resultCount, isInteger) &&
  isArrayOf(isItunesSearchResult)(value.results)

const isSyncState = (value: unknown): value is AurioClubSyncState =>
  isRecord(value) &&
  isString(value.podcast_id) &&
  isInteger(value.server_updated_at) &&
  isOptional(value.position_seconds, (item) => isNullable(item, isNumber)) &&
  isOptional(value.is_finished, (item) => isNullable(item, isFlag)) &&
  isOptional(value.is_favorite, (item) => isNullable(item, isFlag)) &&
  isOptional(value.history_hidden, (item) => isNullable(item, isFlag)) &&
  isOptional(value.article_metadata_json, (item) => isNullable(item, isString))

const isSyncPreferences = (value: unknown): value is AurioClubSyncPreferences =>
  isRecord(value) &&
  isInteger(value.server_updated_at) &&
  isOptional(value.subscriptions_json, (item) => isNullable(item, isString)) &&
  isOptional(value.app_settings_json, (item) => isNullable(item, isString))

const isSyncPullData = (value: unknown): value is AurioClubSyncPullData =>
  isRecord(value) &&
  isArrayOf(isSyncState)(value.states) &&
  isOptional(value.preferences, isSyncPreferences) &&
  isInteger(value.server_time)
