const DEFAULT_GROUP_ID = 'default_group'

export interface SubscriptionGroupSnapshot {
  id: string
  name: string
  isExpanded?: boolean
  sortOrder?: number
}

export interface SubscriptionSourceSnapshot {
  id: string
  label: string
  type: 0 | 1
  url: string
  groupId: string
  image?: string | null
}

export interface SubscriptionSnapshot {
  groups: SubscriptionGroupSnapshot[]
  sources: SubscriptionSourceSnapshot[]
}

export const createSubscriptionSnapshot = (
  sources: LX.Podcast.Source[]
): SubscriptionSnapshot => ({
  groups: [{
    id: DEFAULT_GROUP_ID,
    name: '默认',
    isExpanded: true,
    sortOrder: 0,
  }],
  sources: sources
    .filter((source) => source.subscribed)
    .map((source) => ({
      id: source.id,
      label: source.title,
      type: 0,
      url: source.feedUrl,
      groupId: DEFAULT_GROUP_ID,
      image: source.artworkUrl || null,
    })),
})

export const serializeSubscriptionSnapshot = (sources: LX.Podcast.Source[]) =>
  JSON.stringify(createSubscriptionSnapshot(sources))

export const subscriptionIdentifiers = (value: unknown): string[] | null => {
  if (value == null) return null
  const parsed = parseJson(value)

  // Compatibility with snapshots written by early IKUN builds.
  if (Array.isArray(parsed)) return uniqueIdentifiers(parsed)

  const snapshot = asRecord(parsed)
  if (!Array.isArray(snapshot.sources) || !Array.isArray(snapshot.groups)) return null
  return uniqueIdentifiers(snapshot.sources)
}

const uniqueIdentifiers = (sources: unknown[]) => [
  ...new Set(sources.flatMap((raw) => {
    const direct = stringValue(raw)
    if (direct) return [direct]
    const source = asRecord(raw)
    return [
      stringValue(source.id),
      stringValue(source.url),
      stringValue(source.podcast_id),
      stringValue(source.feed_url),
    ].filter(Boolean)
  }).filter(Boolean)),
]

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {}

const stringValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''
