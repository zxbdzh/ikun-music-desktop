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
    const result = { resultCount: 1, results: [{ trackId: 1602959416 }] }
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
})
