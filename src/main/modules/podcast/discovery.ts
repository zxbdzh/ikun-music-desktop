export const normalizePopularSources = (value: unknown): LX.Podcast.PopularSource[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    const item = asRecord(raw)
    const source = stringValue(item.source)
    if (!source) return []
    return [{
      source,
      totalDuration: nonNegativeNumber(item.total_duration),
      viewCount: nonNegativeNumber(item.view_count),
    }]
  })
}

const nonNegativeNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {}

const stringValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''
