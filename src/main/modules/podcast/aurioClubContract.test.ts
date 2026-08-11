import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import type {
  AurioClubAuthSessionData,
  AurioClubItunesSearchResponse,
  AurioClubPodcast,
  AurioClubPopularSource,
  AurioClubSyncPullData,
  AurioClubUserData,
} from './aurioClubContract'
import { AurioClubClient } from './aurioClubClient'

const CORE_BASE_URL = 'https://core.example/api/v1'
const EDGE_BASE_URL = 'https://edge.example'

describe('AurioClubClient released endpoint contract', () => {
  it('routes all 18 released endpoints with the documented method, body, and auth mode', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith(`${EDGE_BASE_URL}/api/itunes-search`)) {
        return jsonResponse({ resultCount: 0, results: [] })
      }
      if (url.startsWith(`${CORE_BASE_URL}/proxy`)) {
        return new Response('<rss><channel /></rss>', {
          status: 200,
          headers: { 'Content-Type': 'application/rss+xml' },
        })
      }
      if (url === `${CORE_BASE_URL}/track`) return new Response(null, { status: 204 })
      return jsonResponse({
        success: true,
        code: 'SUCCESS',
        message: 'ok',
        trace_id: 'trace-contract',
        data: contractDataFor(url),
      })
    })
    const client = new AurioClubClient({
      coreBaseUrl: CORE_BASE_URL,
      edgeBaseUrl: EDGE_BASE_URL,
      getToken: async () => 'test-token',
      fetcher: fetcher as unknown as typeof fetch,
    })
    const event: LX.Podcast.AnalyticsEvent = {
      d_id: 'device-1',
      u_id: 'user-1',
      s_id: 'session-1',
      p_form: 'desktop',
      v_name: '1.4.5',
      event: 'podcast_play',
      t_id: 'episode-1',
      ts: 1_786_032_000_000,
      props: {},
    }
    const progress = {
      podcast_id: 'episode-1',
      user_id: 'user-1',
      device_id: 'device-1',
      client_updated_at: 1_786_032_000,
    }
    const batch = {
      user_id: 'user-1',
      device_id: 'device-1',
      items: [{ podcast_id: 'episode-1' }],
    }
    const preferences = {
      user_id: 'user-1',
      client_updated_at: 1_786_032_000,
      subscriptions_json: '{"groups":[],"sources":[]}',
    }

    await client.catalog()
    await client.popularSources(7, 'duration')
    await client.searchItunes('technology')
    await client.proxyText('https://feeds.example/show.xml')
    await client.sendCode('user@example.com')
    await client.loginPassword('user@example.com', 'password-1')
    await client.loginEmail('user@example.com', '123456')
    await client.registerPassword('user@example.com', '123456', 'password-1')
    await client.resetPassword('user@example.com', '123456', 'password-2')
    await client.me()
    await client.updateProfile('AurioUser')
    await client.changePassword('password-1', 'password-2')
    await client.linkDevice('device-1', true)
    await client.track([event])
    await client.pull(12.9)
    await client.pushProgress(progress)
    await client.pushProgressBatch(batch)
    await client.pushPreferences(preferences)

    expect(fetcher).toHaveBeenCalledTimes(18)
    expect(fetcher.mock.calls.map(([input, init]) => normalizeCall(input, init))).toEqual([
      request('GET', '/api/v1/podcasts'),
      request('GET', '/api/v1/stats/popular-sources?days=7&sort=duration'),
      request('GET', '/api/itunes-search?term=technology', undefined, EDGE_BASE_URL),
      request('GET', '/api/v1/proxy?url=https%3A%2F%2Ffeeds.example%2Fshow.xml'),
      request('POST', '/api/v1/auth/send-code', { email: 'user@example.com' }),
      request('POST', '/api/v1/auth/login-password', {
        email: 'user@example.com',
        password: 'password-1',
      }),
      request('POST', '/api/v1/auth/login-email', {
        email: 'user@example.com',
        code: '123456',
      }),
      request('POST', '/api/v1/auth/register-password', {
        email: 'user@example.com',
        code: '123456',
        password: 'password-1',
      }),
      request('POST', '/api/v1/auth/reset-password', {
        email: 'user@example.com',
        code: '123456',
        new_password: 'password-2',
      }),
      request('GET', '/api/v1/auth/me', undefined, CORE_BASE_URL, true),
      request('PUT', '/api/v1/auth/profile', { username: 'AurioUser' }, CORE_BASE_URL, true),
      request('POST', '/api/v1/auth/change-password', {
        old_password: 'password-1',
        new_password: 'password-2',
      }, CORE_BASE_URL, true),
      request('POST', '/api/v1/auth/link-device', {
        device_id: 'device-1',
        migrate_guest_data: true,
      }, CORE_BASE_URL, true),
      request('POST', '/api/v1/track', { batch: [event] }),
      request('GET', '/api/v1/sync/pull?since=12', undefined, CORE_BASE_URL, true),
      request('POST', '/api/v1/sync/progress', progress, CORE_BASE_URL, true),
      request('POST', '/api/v1/sync/progress/batch', batch, CORE_BASE_URL, true),
      request('POST', '/api/v1/sync/preferences', preferences, CORE_BASE_URL, true),
    ])
  })
})

describe('AurioClubClient response types', () => {
  it('exposes the documented structured response contracts', () => {
    expectTypeOf<ReturnType<AurioClubClient['catalog']>>()
      .toEqualTypeOf<Promise<AurioClubPodcast[]>>()
    expectTypeOf<ReturnType<AurioClubClient['popularSources']>>()
      .toEqualTypeOf<Promise<AurioClubPopularSource[]>>()
    expectTypeOf<ReturnType<AurioClubClient['searchItunes']>>()
      .toEqualTypeOf<Promise<AurioClubItunesSearchResponse>>()
    expectTypeOf<ReturnType<AurioClubClient['loginPassword']>>()
      .toEqualTypeOf<Promise<AurioClubAuthSessionData>>()
    expectTypeOf<ReturnType<AurioClubClient['loginEmail']>>()
      .toEqualTypeOf<Promise<AurioClubAuthSessionData>>()
    expectTypeOf<ReturnType<AurioClubClient['registerPassword']>>()
      .toEqualTypeOf<Promise<AurioClubAuthSessionData>>()
    expectTypeOf<ReturnType<AurioClubClient['me']>>()
      .toEqualTypeOf<Promise<AurioClubUserData>>()
    expectTypeOf<ReturnType<AurioClubClient['updateProfile']>>()
      .toEqualTypeOf<Promise<AurioClubUserData>>()
    expectTypeOf<ReturnType<AurioClubClient['pull']>>()
      .toEqualTypeOf<Promise<AurioClubSyncPullData>>()
  })
})

const normalizeCall = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input))
  return {
    method: init?.method ?? 'GET',
    origin: url.origin,
    path: `${url.pathname}${url.search}`,
    body: typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined,
    authenticated: new Headers(init?.headers).has('Authorization'),
  }
}

const request = (
  method: string,
  path: string,
  body?: unknown,
  origin = new URL(CORE_BASE_URL).origin,
  authenticated = false
) => ({ method, origin: new URL(origin).origin, path, body, authenticated })

const aurioUser = {
  id: 'user-1',
  email: 'user@example.com',
  username: 'AurioUser',
  points: 0,
  membership_tier: 'free',
  is_premium: 0,
} as const

const contractDataFor = (url: string): unknown => {
  if (url.endsWith('/podcasts') || url.includes('/stats/popular-sources')) return []
  if (
    url.endsWith('/auth/login-password') ||
    url.endsWith('/auth/login-email') ||
    url.endsWith('/auth/register-password')
  ) {
    return { token: 'test-token', user: aurioUser }
  }
  if (url.endsWith('/auth/me') || url.endsWith('/auth/profile')) return { user: aurioUser }
  if (url.includes('/sync/pull')) {
    return { states: [], server_time: 1_786_032_000 }
  }
  return {}
}

const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
})
