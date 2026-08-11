import { describe, expect, it } from 'vitest'
import { parsePodcastFeed } from './rss'

describe('podcast RSS parser', () => {
  it('parses enclosure, transcript and mixed-language metadata', () => {
    const feed = parsePodcastFeed(
      `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>测试 Show</title><itunes:author>Alice</itunes:author><item><guid>ep-1</guid><title>Hello 世界</title><pubDate>Sat, 08 Aug 2026 00:00:00 GMT</pubDate><itunes:duration>01:02</itunes:duration><enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg"/><podcast:transcript url="https://cdn.example.com/ep.vtt" type="text/vtt" language="zh-CN"/></item></channel></rss>`,
      'https://feeds.example.com/show.xml'
    )
    expect(feed.source.title).toBe('测试 Show')
    expect(feed.episodes).toHaveLength(1)
    expect(feed.episodes[0].durationSeconds).toBe(62)
    expect(feed.episodes[0].transcriptReferences[0].type).toBe('text/vtt')
  })
})
