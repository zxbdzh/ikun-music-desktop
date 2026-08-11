import { describe, expect, it } from 'vitest'
import {
  createSubscriptionSnapshot,
  parseSubscriptionPreferences,
  serializeSubscriptionSnapshot,
  subscriptionIdentifiers,
} from './syncPreferences'

const source = (value: Partial<LX.Podcast.Source> = {}): LX.Podcast.Source => ({
  id: 'source-1',
  title: '示例播客',
  author: '作者',
  description: '',
  artworkUrl: 'https://example.com/cover.jpg',
  feedUrl: 'https://example.com/feed.xml',
  categories: [],
  subscribed: true,
  autoDownload: false,
  groupId: 'default_group',
  subscriptionOrder: 0,
  updatedAt: 1,
  ...value,
})

describe('podcast subscription preferences', () => {
  it('serializes the Apifox SubscriptionSnapshot contract', () => {
    expect(JSON.parse(serializeSubscriptionSnapshot([], [
      source(),
      source({ id: 'not-subscribed', subscribed: false }),
    ]))).toEqual({
      groups: [{ id: 'default_group', name: '默认', isExpanded: true, sortOrder: 0 }],
      sources: [{
        id: 'source-1',
        label: '示例播客',
        type: 0,
        url: 'https://example.com/feed.xml',
        groupId: 'default_group',
        image: 'https://example.com/cover.jpg',
      }],
    })
  })

  it('returns a reusable snapshot object for future group persistence', () => {
    expect(createSubscriptionSnapshot([], [source()]).groups[0]).toMatchObject({
      id: 'default_group',
      name: '默认',
    })
  })

  it('reads identifiers from a contract-compliant snapshot', () => {
    expect(subscriptionIdentifiers(JSON.stringify({
      groups: [{ id: 'default_group', name: '默认' }],
      sources: [{
        id: 'source-1',
        label: '示例播客',
        type: 0,
        url: 'https://example.com/feed.xml',
        groupId: 'default_group',
      }],
    }))).toEqual(['source-1', 'https://example.com/feed.xml'])
  })

  it('keeps groups and source membership when parsing a current snapshot', () => {
    expect(parseSubscriptionPreferences(JSON.stringify({
      groups: [{ id: 'group-1', name: '访谈', isExpanded: false, sortOrder: 2 }],
      sources: [{
        id: 'source-1',
        label: '节目',
        type: 0,
        url: 'https://example.com/feed.xml',
        groupId: 'group-1',
        image: null,
      }],
    }))).toEqual({
      groups: [{ id: 'group-1', name: '访谈', isExpanded: false, sortOrder: 2 }],
      sources: [{
        id: 'source-1',
        label: '节目',
        type: 0,
        url: 'https://example.com/feed.xml',
        groupId: 'group-1',
        image: null,
      }],
    })
  })

  it('migrates legacy arrays without losing object identifiers', () => {
    expect(subscriptionIdentifiers(JSON.stringify([
      'source-1',
      { id: 'source-2', feed_url: 'https://example.com/feed-2.xml' },
      'source-1',
    ]))).toEqual(['source-1', 'source-2', 'https://example.com/feed-2.xml'])
  })

  it('rejects malformed snapshots instead of clearing local subscriptions', () => {
    expect(subscriptionIdentifiers('{bad json')).toBeNull()
    expect(subscriptionIdentifiers(JSON.stringify({ sources: [] }))).toBeNull()
  })
})
