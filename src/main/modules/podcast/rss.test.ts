import { describe, expect, it } from 'vitest'
import { parsePodcastFeed } from './rss'

describe('podcast RSS parser', () => {
  it('parses enclosure, transcript and mixed-language metadata', () => {
    const feed = parsePodcastFeed(
      `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>测试 Show</title><itunes:author>Alice</itunes:author><item><guid>ep-1</guid><title>Hello 世界</title><link>/episodes/ep-1</link><pubDate>Sat, 08 Aug 2026 00:00:00 GMT</pubDate><itunes:duration>01:02</itunes:duration><enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg"/><podcast:transcript url="https://cdn.example.com/ep.vtt" type="text/vtt" language="zh-CN"/></item></channel></rss>`,
      'https://feeds.example.com/show.xml'
    )
    expect(feed.source.title).toBe('测试 Show')
    expect(feed.episodes).toHaveLength(1)
    expect(feed.episodes[0].durationSeconds).toBe(62)
    expect(feed.episodes[0].transcriptReferences[0].type).toBe('text/vtt')
    expect(feed.episodes[0].originalUrl).toBe('https://feeds.example.com/episodes/ep-1')
  })

  it('uses the Atom alternate link instead of the enclosure URL', () => {
    const feed = parsePodcastFeed(
      `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Show</title><entry><id>episode-2</id><title>Second episode</title><link rel="enclosure" href="https://cdn.example.com/ep-2.mp3"/><link rel="alternate" href="../episodes/ep-2"/></entry></feed>`,
      'https://feeds.example.com/podcast/feed.xml'
    )

    expect(feed.episodes).toHaveLength(1)
    expect(feed.episodes[0].originalUrl).toBe('https://feeds.example.com/episodes/ep-2')
    expect(feed.episodes[0].audioUrl).toBe('https://cdn.example.com/ep-2.mp3')
  })

  it('uses an explicit RSS GUID permalink when the episode link is missing', () => {
    const feed = parsePodcastFeed(
      `<?xml version="1.0"?><rss><channel><title>GUID Show</title><item><guid isPermaLink="true">https://podcast.example.com/episodes/guid-1</guid><title>GUID episode</title><enclosure url="https://cdn.example.com/guid-1.mp3" type="audio/mpeg"/></item></channel></rss>`,
      'https://feeds.example.com/show.xml'
    )

    expect(feed.episodes).toHaveLength(1)
    expect(feed.episodes[0].originalUrl).toBe('https://podcast.example.com/episodes/guid-1')
  })

  it('uses an RSS GUID as a permalink when isPermaLink is omitted', () => {
    const feed = parsePodcastFeed(
      `<?xml version="1.0"?><rss><channel><title>GUID Show</title><item><guid>https://podcast.example.com/episodes/guid-default</guid><title>GUID episode</title><enclosure url="https://cdn.example.com/guid-default.mp3" type="audio/mpeg"/></item></channel></rss>`,
      'https://feeds.example.com/show.xml'
    )

    expect(feed.episodes[0].originalUrl).toBe(
      'https://podcast.example.com/episodes/guid-default'
    )
  })

  it('does not treat an opaque RSS GUID as a permalink', () => {
    const feed = parsePodcastFeed(
      `<?xml version="1.0"?><rss><channel><title>GUID Show</title><item><guid isPermaLink="false">https://podcast.example.com/episodes/guid-2</guid><title>GUID episode</title><enclosure url="https://cdn.example.com/guid-2.mp3" type="audio/mpeg"/></item></channel></rss>`,
      'https://feeds.example.com/show.xml'
    )

    expect(feed.episodes).toHaveLength(1)
    expect(feed.episodes[0].originalUrl).toBe('')
  })

  it('does not promote the enclosure fallback ID to an article URL', () => {
    const feed = parsePodcastFeed(
      `<?xml version="1.0"?><rss><channel><title>No GUID Show</title><item><title>No GUID episode</title><enclosure url="https://cdn.example.com/no-guid.mp3" type="audio/mpeg"/></item></channel></rss>`,
      'https://feeds.example.com/show.xml'
    )

    expect(feed.episodes[0].guid).toBe('https://cdn.example.com/no-guid.mp3')
    expect(feed.episodes[0].originalUrl).toBe('')
  })
})
