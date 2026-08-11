import { describe, expect, it } from 'vitest'
import { buildOpml, parseOpml } from './opml'

describe('podcast OPML', () => {
  it('imports nested groups and flat feeds', () => {
    const snapshot = parseOpml(`<?xml version="1.0"?>
      <opml version="2.0"><body>
        <outline text="技术">
          <outline type="rss" text="节目 A" xmlUrl="https://example.com/a.xml" />
        </outline>
        <outline type="rss" text="节目 B" xmlUrl="https://example.com/b.xml" />
      </body></opml>`)

    expect(snapshot.groups.map((group) => group.name)).toEqual(['技术', '默认'])
    expect(snapshot.sources).toHaveLength(2)
    expect(snapshot.sources[0]).toMatchObject({ label: '节目 A', groupId: snapshot.groups[0].id })
    expect(snapshot.sources[1]).toMatchObject({ label: '节目 B', groupId: 'default_group' })
  })

  it('round-trips the Apifox subscription snapshot fields', () => {
    const input: LX.Podcast.SubscriptionSnapshot = {
      groups: [{ id: 'group-1', name: '访谈', isExpanded: true, sortOrder: 0 }],
      sources: [{
        id: 'source-1',
        label: '节目 A',
        type: 0,
        url: 'https://example.com/feed.xml',
        groupId: 'group-1',
        image: 'https://example.com/cover.jpg',
      }],
    }

    expect(parseOpml(buildOpml(input))).toEqual(input)
  })

  it('rejects OPML without a usable feed URL', () => {
    expect(() => parseOpml('<opml><body><outline text="空分组" /></body></opml>'))
      .toThrow('没有可导入')
  })
})
