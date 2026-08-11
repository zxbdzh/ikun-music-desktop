const DEFAULT_GROUP: LX.Podcast.SubscriptionGroup = {
  id: 'default_group',
  name: '默认',
  isExpanded: true,
  sortOrder: 0,
}

export type ParsedSubscriptionPreferences = LX.Podcast.SubscriptionSnapshot | string[] | null

export const createSubscriptionSnapshot = (
  groups: LX.Podcast.SubscriptionGroup[],
  sources: LX.Podcast.Source[]
): LX.Podcast.SubscriptionSnapshot => {
  const normalizedGroups = groups.length ? groups : [DEFAULT_GROUP]
  const groupIds = new Set(normalizedGroups.map((group) => group.id))
  const fallbackGroupId = normalizedGroups[0].id
  return {
    groups: normalizedGroups.map((group) => ({ ...group })),
    sources: sources
      .filter((source) => source.subscribed)
      .sort((left, right) => left.subscriptionOrder - right.subscriptionOrder)
      .map((source) => ({
        id: source.id,
        label: source.title,
        type: 0,
        url: source.feedUrl,
        groupId: groupIds.has(source.groupId) ? source.groupId : fallbackGroupId,
        image: source.artworkUrl || null,
      })),
  }
}

export const serializeSubscriptionSnapshot = (
  groups: LX.Podcast.SubscriptionGroup[],
  sources: LX.Podcast.Source[]
) => JSON.stringify(createSubscriptionSnapshot(groups, sources))

export const parseSubscriptionPreferences = (value: unknown): ParsedSubscriptionPreferences => {
  if (value == null) return null
  const parsed = parseJson(value)
  if (Array.isArray(parsed)) return uniqueIdentifiers(parsed)

  const raw = asRecord(parsed)
  if (!Array.isArray(raw.sources) || !Array.isArray(raw.groups)) return null
  const groups = raw.groups.flatMap(normalizeGroup)
  const normalizedGroups = groups.length ? groups : [DEFAULT_GROUP]
  const groupIds = new Set(normalizedGroups.map((group) => group.id))
  const fallbackGroupId = normalizedGroups[0].id
  const sources = raw.sources.flatMap((value) => normalizeSource(value, groupIds, fallbackGroupId))
  return { groups: normalizedGroups, sources }
}

export const subscriptionIdentifiers = (value: unknown): string[] | null => {
  const parsed = parseSubscriptionPreferences(value)
  if (!parsed) return null
  return Array.isArray(parsed)
    ? parsed
    : uniqueIdentifiers(parsed.sources)
}

const normalizeGroup = (value: unknown): LX.Podcast.SubscriptionGroup[] => {
  const group = asRecord(value)
  const id = stringValue(group.id)
  const name = stringValue(group.name)
  if (!id || !name) return []
  return [{
    id,
    name,
    isExpanded: group.isExpanded !== false,
    sortOrder: finiteNumber(group.sortOrder, 0),
  }]
}

const normalizeSource = (
  value: unknown,
  groupIds: Set<string>,
  fallbackGroupId: string
): LX.Podcast.SubscriptionSource[] => {
  const source = asRecord(value)
  const id = stringValue(source.id)
  const label = stringValue(source.label)
  const url = stringValue(source.url)
  if (!id || !label || !isHttpUrl(url)) return []
  const requestedGroupId = stringValue(source.groupId)
  return [{
    id,
    label,
    type: source.type === 1 ? 1 : 0,
    url,
    groupId: groupIds.has(requestedGroupId) ? requestedGroupId : fallbackGroupId,
    image: isHttpUrl(source.image) ? stringValue(source.image) : null,
  }]
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

const finiteNumber = (value: unknown, fallback: number) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const isHttpUrl = (value: unknown) => {
  const text = stringValue(value)
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
