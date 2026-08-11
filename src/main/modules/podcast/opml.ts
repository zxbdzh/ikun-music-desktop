import { createHash } from 'node:crypto'
import { XMLBuilder, XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  htmlEntities: false,
})

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  suppressEmptyNode: true,
})

export const parseOpml = (xml: string): LX.Podcast.SubscriptionSnapshot => {
  if (xml.length > 5 * 1024 * 1024) throw new Error('OPML 文件超过 5 MB 限制')
  const document = parser.parse(xml) as Record<string, any>
  const outlines = asArray(document.opml?.body?.outline)
  const groups: LX.Podcast.SubscriptionGroup[] = []
  const sources: LX.Podcast.SubscriptionSource[] = []
  const defaultGroup = group('default_group', '默认', 0)

  outlines.forEach((outline, index) => {
    if (feedUrl(outline)) {
      if (!groups.some((item) => item.id === defaultGroup.id)) groups.push(defaultGroup)
      const source = opmlSource(outline, defaultGroup.id)
      if (source) sources.push(source)
      return
    }
    const name = attribute(outline, 'text') || attribute(outline, 'title')
    if (!name) return
    const value = group(
      attribute(outline, 'id') || stableId(`group:${name}`),
      name,
      index
    )
    groups.push(value)
    for (const child of asArray(outline.outline)) {
      const source = opmlSource(child, value.id)
      if (source) sources.push(source)
    }
  })

  if (!sources.length) throw new Error('OPML 中没有可导入的 RSS/HTTP 订阅源')
  if (!groups.length) groups.push(defaultGroup)
  return { groups, sources: uniqueSources(sources) }
}

export const buildOpml = (snapshot: LX.Podcast.SubscriptionSnapshot) => {
  const sourcesByGroup = new Map<string, LX.Podcast.SubscriptionSource[]>()
  for (const source of snapshot.sources) {
    const sources = sourcesByGroup.get(source.groupId) ?? []
    sources.push(source)
    sourcesByGroup.set(source.groupId, sources)
  }
  const outlines = snapshot.groups.map((group) => ({
    '@_text': group.name,
    '@_title': group.name,
    '@_id': group.id,
    outline: (sourcesByGroup.get(group.id) ?? []).map((source) => ({
      '@_type': source.type === 0 ? 'rss' : 'link',
      '@_text': source.label,
      '@_title': source.label,
      '@_xmlUrl': source.url,
      '@_id': source.id,
      ...(source.image ? { '@_image': source.image } : {}),
    })),
  }))
  const xml = builder.build({
    opml: {
      '@_version': '2.0',
      head: { title: 'IKUN Music 播客订阅' },
      body: { outline: outlines },
    },
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`
}

const opmlSource = (outline: Record<string, any>, groupId: string) => {
  const url = feedUrl(outline)
  if (!url) return null
  const label = attribute(outline, 'text') || attribute(outline, 'title') || url
  return {
    id: attribute(outline, 'id') || stableId(url),
    label,
    type: attribute(outline, 'type').toLowerCase() === 'link' ? 1 as const : 0 as const,
    url,
    groupId,
    image: httpUrl(attribute(outline, 'image')) || null,
  }
}

const uniqueSources = (sources: LX.Podcast.SubscriptionSource[]) => [
  ...new Map(sources.map((source) => [source.url, source])).values(),
]

const group = (id: string, name: string, sortOrder: number): LX.Podcast.SubscriptionGroup => ({
  id,
  name,
  isExpanded: true,
  sortOrder,
})

const feedUrl = (outline: Record<string, any>) =>
  httpUrl(attribute(outline, 'xmlUrl')) || httpUrl(attribute(outline, 'url'))

const attribute = (value: Record<string, any>, name: string) => {
  const raw = value?.[`@_${name}`]
  return typeof raw === 'string' ? raw.trim() : ''
}

const httpUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

const stableId = (value: string) => createHash('sha256').update(value).digest('hex')
const asArray = <T>(value: T | T[] | null | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value]
