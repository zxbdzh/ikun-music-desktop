import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { createLongFormContent, summarizeLongFormContent } from './longFormContent'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  htmlEntities: false,
})

export interface ParsedFeed {
  source: LX.Podcast.Source
  episodes: LX.Podcast.Episode[]
  longFormContents: LX.Podcast.LongFormContentDocument[]
}

export const parsePodcastFeed = (xml: string, feedUrl: string): ParsedFeed => {
  if (xml.length > 10 * 1024 * 1024) throw new Error('Feed 超过 10 MB 限制')
  const doc = parser.parse(xml) as Record<string, any>
  return doc.rss ? parseRss(doc.rss.channel, feedUrl) : parseAtom(doc.feed, feedUrl)
}

const parseRss = (channel: any, feedUrl: string): ParsedFeed => {
  if (!channel || typeof channel !== 'object') throw new Error('RSS 缺少 channel')
  const sourceId = stableId(feedUrl)
  const artworkUrl = text(channel['itunes:image']?.['@_href']) || text(channel.image?.url)
  const source = createSource(sourceId, feedUrl, {
    title: text(channel.title),
    author: text(channel['itunes:author']) || text(channel.author),
    description: text(channel.description) || text(channel['itunes:summary']),
    artworkUrl,
    categories: collectCategories(channel['itunes:category']),
  })
  const parsed = asArray(channel.item).map((item) => parseRssEpisode(item, source, artworkUrl))
  return feedResult(source, parsed)
}

const parseAtom = (feed: any, feedUrl: string): ParsedFeed => {
  if (!feed || typeof feed !== 'object') throw new Error('Atom 缺少 feed')
  const sourceId = stableId(feedUrl)
  const source = createSource(sourceId, feedUrl, {
    title: text(feed.title),
    author: text(feed.author?.name),
    description: text(feed.subtitle),
    artworkUrl: text(feed.logo) || text(feed.icon),
    categories: asArray(feed.category).map((item) => text(item?.['@_term'])).filter(Boolean),
  })
  const parsed = asArray(feed.entry).map((entry) => {
    const links = asArray(entry.link)
    const enclosure = links.find((link) => link?.['@_rel'] === 'enclosure')
    const alternate = links.find((link) => {
      const rel = text(link?.['@_rel']).toLowerCase()
      return (!rel || rel === 'alternate') && text(link?.['@_href'])
    })
    const guid = text(entry.id) || text(enclosure?.['@_href']) || text(entry.title)
    const content = text(entry.content)
    const summary = text(entry.summary)
    const episode = createEpisode(source, guid, {
      title: text(entry.title),
      description: summary || summarizeLongFormContent(content),
      artworkUrl: source.artworkUrl,
      originalUrl: resolveHttpUrl(alternate?.['@_href'], feedUrl),
      audioUrl: text(enclosure?.['@_href']),
      publishedAt: parseDate(entry.published ?? entry.updated),
      durationSeconds: parseDuration(entry['itunes:duration']),
      transcriptReferences: [],
      chaptersUrl: undefined,
    })
    return {
      episode,
      longFormContent: createEpisodeLongFormContent(episode, content),
    }
  })
  return feedResult(source, parsed)
}

const parseRssEpisode = (
  item: any,
  source: LX.Podcast.Source,
  fallbackArtwork: string
): ParsedEpisode => {
  const enclosure = asArray(item.enclosure)[0] ?? {}
  const rssGuid = text(item.guid?.['#text'] ?? item.guid)
  const guid = rssGuid || text(enclosure['@_url']) || text(item.link)
  const guidPermalink = text(item.guid?.['@_isPermaLink']).toLowerCase() !== 'false'
    ? rssGuid
    : ''
  const transcriptReferences = asArray(item['podcast:transcript'])
    .map((ref): LX.Podcast.TranscriptReference | null => {
      const url = text(ref?.['@_url'] ?? ref?.['#text'] ?? ref)
      if (!url) return null
      return {
        url,
        type: text(ref?.['@_type']) || 'text/vtt',
        language: text(ref?.['@_language']) || undefined,
        rel: text(ref?.['@_rel']) || undefined,
      }
    })
    .filter((item): item is LX.Podcast.TranscriptReference => item != null)
  const chapters = item['podcast:chapters']
  const content = text(item['content:encoded'])
  const summary = text(item['itunes:summary']) || text(item.description)
  const episode = createEpisode(source, guid, {
    title: text(item.title),
    description: summary || summarizeLongFormContent(content),
    artworkUrl: text(item['itunes:image']?.['@_href']) || fallbackArtwork,
    originalUrl: resolveHttpUrl(item.link?.['@_href'] ?? item.link, source.feedUrl) ||
      resolveHttpUrl(guidPermalink, source.feedUrl),
    audioUrl: text(enclosure['@_url']),
    publishedAt: parseDate(item.pubDate),
    durationSeconds: parseDuration(item['itunes:duration']),
    transcriptReferences,
    chaptersUrl: text(chapters?.['@_url']) || undefined,
  })
  return {
    episode,
    longFormContent: createEpisodeLongFormContent(episode, content),
  }
}

interface ParsedEpisode {
  episode: LX.Podcast.Episode
  longFormContent: LX.Podcast.LongFormContentDocument | null
}

const feedResult = (source: LX.Podcast.Source, parsed: ParsedEpisode[]): ParsedFeed => {
  const available = parsed.filter(({ episode, longFormContent }) =>
    !!episode.audioUrl || (!!episode.originalUrl && longFormContent != null)
  )
  return {
    source,
    episodes: available.map(({ episode }) => episode),
    longFormContents: available
      .map(({ longFormContent }) => longFormContent)
      .filter((value): value is LX.Podcast.LongFormContentDocument => value != null),
  }
}

const createEpisodeLongFormContent = (
  episode: LX.Podcast.Episode,
  content: string
): LX.Podcast.LongFormContentDocument | null => createLongFormContent({
  contentId: episode.id,
  title: episode.title,
  content,
  originalUrl: episode.originalUrl,
  audioUrl: episode.audioUrl,
})

const createSource = (
  id: string,
  feedUrl: string,
  value: Pick<LX.Podcast.Source, 'title' | 'author' | 'description' | 'artworkUrl' | 'categories'>
): LX.Podcast.Source => ({
  id,
  feedUrl,
  ...value,
  subscribed: false,
  autoDownload: false,
  groupId: 'default_group',
  subscriptionOrder: 0,
  updatedAt: Date.now(),
})

const createEpisode = (
  source: LX.Podcast.Source,
  guid: string,
  value: Omit<
    LX.Podcast.Episode,
    'id' | 'sourceId' | 'guid' | 'chapters' | 'updatedAt'
  >
): LX.Podcast.Episode => ({
  id: stableId(`${source.id}|${guid}`),
  sourceId: source.id,
  guid,
  ...value,
  chapters: [],
  updatedAt: Date.now(),
})

const stableId = (value: string) => createHash('sha256').update(value).digest('hex')
const resolveHttpUrl = (value: unknown, baseUrl: string) => {
  const raw = text(value)
  if (!raw) return ''
  try {
    const url = new URL(raw, baseUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}
const asArray = <T>(value: T | T[] | undefined | null): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value]
const text = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  if (value && typeof value === 'object' && '#text' in value) return text((value as any)['#text'])
  return ''
}
const parseDate = (value: unknown) => {
  const timestamp = Date.parse(text(value))
  return Number.isFinite(timestamp) ? timestamp : 0
}
const parseDuration = (value: unknown) => {
  const raw = text(value)
  if (!raw) return 0
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw))
  const parts = raw.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return 0
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0))
}
const collectCategories = (value: unknown): string[] => {
  const result = new Set<string>()
  const visit = (item: any) => {
    if (!item) return
    const name = text(item['@_text'])
    if (name) result.add(name)
    asArray(item['itunes:category']).forEach(visit)
  }
  asArray(value).forEach(visit)
  return [...result]
}
