import { describe, expect, it, vi } from 'vitest'
import { AurioClubClient } from './aurioClubClient'

describe('AurioClubClient request routing', () => {
  it('loads popular sources with the selected period and metric', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      code: 'SUCCESS',
      message: 'ok',
      trace_id: 'trace-1',
      data: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
    const client = new AurioClubClient({ coreBaseUrl: 'https://core.example/api/v1', fetcher })

    await client.popularSources(7, 'duration')

    expect(fetcher).toHaveBeenCalledWith(
      'https://core.example/api/v1/stats/popular-sources?days=7&sort=duration',
      expect.any(Object)
    )
  })

  it('falls back to the official iTunes Search API when the edge search fails', async () => {
    const result = {
      resultCount: 1,
      results: [{
        trackId: 1602959416,
        collectionName: '大小马聊科技',
        feedUrl: 'https://feeds.example/show.xml',
      }],
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Bad Gateway' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      ) as unknown as typeof fetch
    const client = new AurioClubClient({ edgeBaseUrl: 'https://edge.example', fetcher })

    await expect(client.searchItunes('大小马聊科技')).resolves.toEqual(result)
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://edge.example/api/itunes-search?term=%E5%A4%A7%E5%B0%8F%E9%A9%AC%E8%81%8A%E7%A7%91%E6%8A%80',
      expect.any(Object)
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://itunes.apple.com/search?term=%E5%A4%A7%E5%B0%8F%E9%A9%AC%E8%81%8A%E7%A7%91%E6%8A%80&media=podcast',
      expect.any(Object)
    )
  })

  it('routes RSS proxy requests through the core API', async () => {
    const fetcher = vi.fn(async () =>
      new Response('<rss><channel /></rss>', {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml' },
      })
    ) as unknown as typeof fetch
    const client = new AurioClubClient({
      coreBaseUrl: 'https://core.example/api/v1',
      edgeBaseUrl: 'https://edge.example',
      fetcher,
    })

    await client.proxyText('https://feeds.example/show.xml')

    expect(fetcher).toHaveBeenCalledWith(
      'https://core.example/api/v1/proxy?url=https%3A%2F%2Ffeeds.example%2Fshow.xml',
      expect.any(Object)
    )
  })

  it('routes public registration and password reset requests with API field names', async () => {
    const fetcher = vi.fn(async () => envelopeResponse({ token: 'token-1', user: userData }))
    const client = new AurioClubClient({
      coreBaseUrl: 'https://core.example/api/v1',
      fetcher: fetcher as unknown as typeof fetch,
    })

    await client.registerPassword('user@example.com', '123456', 'password-1')
    await client.resetPassword('user@example.com', '654321', 'password-2')

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://core.example/api/v1/auth/register-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          code: '123456',
          password: 'password-1',
        }),
      })
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://core.example/api/v1/auth/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          code: '654321',
          new_password: 'password-2',
        }),
      })
    )
  })

  it('routes authenticated profile, password, and device requests with a bearer token', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      envelopeResponse(String(input).endsWith('/auth/profile') ? { user: userData } : {})
    )
    const client = new AurioClubClient({
      coreBaseUrl: 'https://core.example/api/v1',
      getToken: async () => 'token-1',
      fetcher: fetcher as unknown as typeof fetch,
    })

    await client.updateProfile('AurioUser')
    await client.changePassword('password-1', 'password-2')
    await client.linkDevice('device-1', true)

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://core.example/api/v1/auth/profile',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ username: 'AurioUser' }) })
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://core.example/api/v1/auth/change-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ old_password: 'password-1', new_password: 'password-2' }),
      })
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      'https://core.example/api/v1/auth/link-device',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ device_id: 'device-1', migrate_guest_data: true }),
      })
    )
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1')
    }
  })

  it('accepts the empty 204 response returned by analytics tracking', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    const client = new AurioClubClient({
      coreBaseUrl: 'https://core.example/api/v1',
      fetcher: fetcher as unknown as typeof fetch,
    })
    const event: LX.Podcast.AnalyticsEvent = {
      d_id: 'device-1',
      u_id: null,
      s_id: 'session-1',
      p_form: 'desktop',
      v_name: '1.4.1',
      event: 'app_start',
      t_id: null,
      ts: 1_786_032_000_000,
      props: {},
    }

    await expect(client.track([event])).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledWith(
      'https://core.example/api/v1/track',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ batch: [event] }),
      })
    )
  })

  it('accepts minimal contract data, nullable sync fields, and unknown additions', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(envelopeResponse([{
        id: 1,
        rss_url: 'https://feeds.example/show.xml',
        name: { zh: '示例播客' },
        future_field: true,
      }]))
      .mockResolvedValueOnce(envelopeResponse({
        states: [{
          podcast_id: 'episode-1',
          server_updated_at: 1_786_032_000,
          position_seconds: null,
          is_finished: null,
          is_favorite: null,
          history_hidden: null,
          article_metadata_json: null,
          future_field: true,
        }],
        preferences: {
          server_updated_at: 1_786_032_000,
          subscriptions_json: null,
          app_settings_json: null,
          future_field: true,
        },
        server_time: 1_786_032_000,
        future_field: true,
      })) as unknown as typeof fetch
    const client = new AurioClubClient({
      coreBaseUrl: 'https://core.example/api/v1',
      getToken: async () => 'token-1',
      fetcher,
    })

    await expect(client.catalog()).resolves.toHaveLength(1)
    await expect(client.pull(0)).resolves.toMatchObject({
      states: [{ position_seconds: null }],
      preferences: { subscriptions_json: null },
    })
  })

  it('preserves non-empty article metadata and hidden-history sync fields', async () => {
    const articleMetadataJson = JSON.stringify({
      articleId: 'episode-1',
      title: 'Example episode',
      url: 'https://example.com/episodes/episode-1',
      audioUrl: 'https://cdn.example.com/episode-1.mp3',
    })
    const fetcher = vi.fn(async () => envelopeResponse({
      states: [{
        podcast_id: 'episode-1',
        server_updated_at: 1_786_032_000,
        history_hidden: 1,
        article_metadata_json: articleMetadataJson,
      }],
      server_time: 1_786_032_000,
    })) as unknown as typeof fetch
    const client = new AurioClubClient({
      coreBaseUrl: 'https://core.example/api/v1',
      getToken: async () => 'token-1',
      fetcher,
    })

    await expect(client.pull(0)).resolves.toMatchObject({
      states: [{
        history_hidden: 1,
        article_metadata_json: articleMetadataJson,
      }],
    })
  })

  it('rejects invalid envelope data with its trace ID', async () => {
    const fetcher = vi.fn(async () => envelopeResponse([{
      id: 1,
      rss_url: 'https://feeds.example/show.xml',
      name: 'invalid',
    }], 'trace-contract')) as unknown as typeof fetch
    const client = new AurioClubClient({
      coreBaseUrl: 'https://core.example/api/v1',
      fetcher,
    })

    await expect(client.catalog()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      traceId: 'trace-contract',
      status: 200,
    })
  })

  it.each([
    {
      name: 'popular sources',
      data: [{ source: '节目', total_duration: '3600', view_count: 1 }],
      invoke: (client: AurioClubClient) => client.popularSources(7, 'duration'),
    },
    {
      name: 'authentication sessions',
      data: { token: 'token-1', user: { ...userData, points: '0' } },
      invoke: (client: AurioClubClient) => client.loginPassword('user@example.com', 'password'),
    },
    {
      name: 'user profiles',
      data: { user: { ...userData, is_premium: 2 } },
      invoke: (client: AurioClubClient) => client.me(),
    },
    {
      name: 'sync pulls',
      data: { states: [], server_time: '1786032000' },
      invoke: (client: AurioClubClient) => client.pull(0),
    },
  ])('rejects invalid $name data without coercing wire types', async ({ data, invoke }) => {
    const fetcher = vi.fn(async () => envelopeResponse(data, 'trace-invalid'))
    const client = new AurioClubClient({
      coreBaseUrl: 'https://core.example/api/v1',
      getToken: async () => 'token-1',
      fetcher: fetcher as unknown as typeof fetch,
    })

    await expect(invoke(client)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      traceId: 'trace-invalid',
      status: 200,
    })
  })

  it.each([1_786_032_000, '1786032000', null])(
    'accepts the documented subscription expiration shape: %s',
    async (subscriptionExpiresAt) => {
      const data = {
        user: { ...userData, subscription_expires_at: subscriptionExpiresAt },
      }
      const fetcher = vi.fn(async () => envelopeResponse(data))
      const client = new AurioClubClient({
        coreBaseUrl: 'https://core.example/api/v1',
        getToken: async () => 'token-1',
        fetcher: fetcher as unknown as typeof fetch,
      })

      await expect(client.me()).resolves.toEqual(data)
    }
  )

  it('rejects invalid direct iTunes data after the official fallback', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [{}] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch
    const client = new AurioClubClient({ edgeBaseUrl: 'https://edge.example', fetcher })

    await expect(client.searchItunes('technology')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      traceId: '',
      status: 200,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

const userData = {
  id: 'user-1',
  email: 'user@example.com',
  username: 'AurioUser',
  points: 0,
  membership_tier: 'free',
  is_premium: 0,
} as const

const envelopeResponse = (data: unknown, traceId = 'trace-1') => new Response(JSON.stringify({
  success: true,
  code: 'SUCCESS',
  message: 'ok',
  trace_id: traceId,
  data,
}), { status: 200, headers: { 'Content-Type': 'application/json' } })
