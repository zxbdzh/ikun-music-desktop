import { describe, expect, it } from 'vitest'
import {
  MAX_ARTICLE_METADATA_BYTES,
  articleMetadataFromPodcast,
  encodeArticleMetadata,
  parseArticleMetadataJson,
  resolveArticleMetadataUrl,
  restorePodcastEntities,
} from './syncMetadata'

const source: LX.Podcast.Source = {
  id: 'source-1',
  title: 'Example Podcast',
  author: 'Example Author',
  description: 'Source description',
  artworkUrl: 'https://example.com/cover.jpg',
  feedUrl: 'https://example.com/feed.xml',
  categories: ['Technology', 'News'],
  subscribed: true,
  autoDownload: false,
  groupId: 'default_group',
  subscriptionOrder: 0,
  updatedAt: 1,
}

const episode: LX.Podcast.Episode = {
  id: 'episode-1',
  sourceId: source.id,
  guid: 'episode-guid-1',
  title: 'Example episode',
  description: 'Long-form article content',
  artworkUrl: 'https://example.com/episode.jpg',
  originalUrl: 'https://example.com/articles/episode-1',
  audioUrl: 'https://cdn.example.com/episode-1.mp3',
  publishedAt: Date.parse('2026-08-07T00:00:00.000Z'),
  durationSeconds: 1_800,
  transcriptReferences: [],
  chapters: [],
  updatedAt: 1,
}

describe('AurioClub article metadata', () => {
  it('round-trips a non-empty documented metadata object', () => {
    const raw = JSON.stringify({
      articleId: 'episode-1',
      title: 'Example episode',
      description: 'Episode summary',
      content: 'Full article body',
      url: 'https://example.com/articles/episode-1',
      image: 'https://example.com/episode.jpg',
      publishedAt: 'Fri, 07 Aug 2026 00:00:00 GMT',
      displayTime: 1_786_032_000,
      lang: 'zh',
      source: { name: 'Example Podcast', url: 'https://example.com/feed.xml' },
      tags: ['Technology', 'News'],
      audioUrl: 'https://cdn.example.com/episode-1.mp3',
      audioDuration: 1_800,
    })

    const parsed = parseArticleMetadataJson(raw, 'episode-1')

    expect(parsed).not.toBeNull()
    expect(parseArticleMetadataJson(encodeArticleMetadata(parsed!)!, 'episode-1')).toEqual(parsed)
  })

  it('serializes real Source and Episode fields for progress upload', () => {
    const metadata = articleMetadataFromPodcast(episode, source)

    expect(metadata).toMatchObject({
      articleId: episode.id,
      title: episode.title,
      content: episode.description,
      url: episode.originalUrl,
      image: episode.artworkUrl,
      displayTime: Math.floor(episode.publishedAt / 1_000),
      source: { name: source.title, url: source.feedUrl },
      tags: source.categories,
      audioUrl: episode.audioUrl,
      audioDuration: episode.durationSeconds,
    })
    expect(parseArticleMetadataJson(encodeArticleMetadata(metadata)!)).toEqual(metadata)
  })

  it('prefers the article URL and falls back to audio when it is absent or unsafe', () => {
    const article = parseArticleMetadataJson(JSON.stringify({
      articleId: 'article-1',
      title: 'Article',
      url: 'https://example.com/article-1',
      audioUrl: 'https://cdn.example.com/article-1.mp3',
    }))!
    const audioFallback = parseArticleMetadataJson(JSON.stringify({
      articleId: 'article-2',
      title: 'Audio fallback',
      url: 'javascript:alert(1)',
      audioUrl: 'https://cdn.example.com/article-2.mp3',
    }))!

    expect(resolveArticleMetadataUrl(article)).toBe('https://example.com/article-1')
    expect(resolveArticleMetadataUrl(audioFallback)).toBe(
      'https://cdn.example.com/article-2.mp3'
    )
  })

  it('safely rejects malformed, oversized, and mismatched metadata', () => {
    expect(parseArticleMetadataJson('{broken')).toBeNull()
    expect(parseArticleMetadataJson(JSON.stringify({
      articleId: 'episode-1',
      title: 'x'.repeat(MAX_ARTICLE_METADATA_BYTES),
    }))).toBeNull()
    expect(parseArticleMetadataJson(JSON.stringify({
      articleId: 'another-episode',
      title: 'Wrong association',
    }), 'episode-1')).toBeNull()
  })

  it('drops unsafe optional URLs without discarding valid audio metadata', () => {
    const parsed = parseArticleMetadataJson(JSON.stringify({
      articleId: 'episode-1',
      title: 'Example episode',
      url: 'https://user:password@example.com/article',
      image: 'file:///tmp/cover.png',
      source: { name: 'Unsafe source', url: 'ftp://example.com/feed.xml' },
      audioUrl: 'https://cdn.example.com/episode-1.mp3',
    }))

    expect(parsed).toEqual({
      articleId: 'episode-1',
      title: 'Example episode',
      audioUrl: 'https://cdn.example.com/episode-1.mp3',
    })
  })

  it('restores stable Source and Episode entities with the remote article id', () => {
    const metadata = parseArticleMetadataJson(JSON.stringify({
      articleId: 'remote-episode',
      title: 'Remote article',
      description: 'Summary',
      content: 'Full blog content',
      url: 'https://example.com/articles/remote-episode',
      image: 'https://example.com/remote.jpg',
      displayTime: 1_786_032_000,
      source: { name: 'Remote source', url: 'https://example.com/feed.xml' },
      tags: 'Blog',
      audioUrl: 'https://cdn.example.com/remote.mp3',
      audioDuration: 600,
    }), 'remote-episode')!

    const first = restorePodcastEntities(metadata, 1_786_032_100)
    const second = restorePodcastEntities(metadata, 1_786_032_200)

    expect(first.source.id).toBe(second.source.id)
    expect(first.episode).toMatchObject({
      id: 'remote-episode',
      sourceId: first.source.id,
      title: 'Remote article',
      description: 'Full blog content',
      originalUrl: 'https://example.com/articles/remote-episode',
      audioUrl: 'https://cdn.example.com/remote.mp3',
      publishedAt: 1_786_032_000_000,
      durationSeconds: 600,
    })
    expect(articleMetadataFromPodcast(first.episode, first.source).content)
      .toBe('Full blog content')
  })
})
