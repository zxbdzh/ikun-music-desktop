import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  VOXRAIL_RETRY_WINDOW_MS,
  VoxrailClient,
  localizeVoxrailSnapshot,
  normalizeVoxrailBaseUrl,
} from './voxrailClient'

afterEach(() => vi.useRealTimers())

describe('VoxrailClient', () => {
  it('normalizes a service root and preserves a claimed API base URL', () => {
    expect(normalizeVoxrailBaseUrl('https://voxrail.example/')).toBe(
      'https://voxrail.example/api/v1'
    )
    expect(normalizeVoxrailBaseUrl('https://voxrail.example/api/v1')).toBe(
      'https://voxrail.example/api/v1'
    )
    expect(normalizeVoxrailBaseUrl('http://127.0.0.1:4100')).toBe('http://127.0.0.1:4100/api/v1')
  })

  it('requires HTTPS outside loopback development addresses', () => {
    expect(() => normalizeVoxrailBaseUrl('http://voxrail.example')).toThrow('HTTPS')
    expect(() => normalizeVoxrailBaseUrl('http://192.168.1.10:4100')).toThrow('HTTPS')
    expect(normalizeVoxrailBaseUrl('http://localhost:4100')).toBe('http://localhost:4100/api/v1')
  })

  it('reuses an idempotency key within one retry window and rotates it afterward', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T00:00:00.000Z'))
    const response = requestResponse('queued')
    const fetcher = vi.fn(async () => jsonResponse(response)) as any
    const client = new VoxrailClient({
      getBaseUrl: () => 'https://voxrail.example/api/v1',
      getAccessKey: () => 'vr_live_key',
      fetcher,
    })
    const episode = {
      id: 'episode-1',
      guid: 'guid-1',
      title: 'Episode one',
      publishedAt: 1_786_032_000_000,
      audioUrl: 'https://cdn.example/one.mp3',
    } as LX.Podcast.Episode

    await client.createRequest(episode, 'https://feeds.example/show.xml')
    await client.createRequest(episode, 'https://feeds.example/show.xml')
    await vi.advanceTimersByTimeAsync(VOXRAIL_RETRY_WINDOW_MS)
    await client.createRequest(episode, 'https://feeds.example/show.xml')

    const firstHeaders = new Headers(fetcher.mock.calls[0][1].headers)
    const secondHeaders = new Headers(fetcher.mock.calls[1][1].headers)
    const thirdHeaders = new Headers(fetcher.mock.calls[2][1].headers)
    expect(firstHeaders.get('Authorization')).toBe('Bearer vr_live_key')
    expect(firstHeaders.get('idempotency-key')).toBe(secondHeaders.get('idempotency-key'))
    expect(firstHeaders.get('idempotency-key')).not.toBe(thirdHeaders.get('idempotency-key'))
    expect(fetcher).toHaveBeenCalledWith(
      'https://voxrail.example/api/v1/transcription-requests',
      expect.objectContaining({ method: 'POST', redirect: 'error' })
    )
  })

  it('surfaces RFC problem details without exposing the key', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          detail: '该 Key 已到期',
          code: 'access_key_inactive',
        },
        401
      )
    ) as any
    const client = new VoxrailClient({
      getBaseUrl: () => 'https://voxrail.example/api/v1',
      getAccessKey: () => 'secret-key',
      fetcher,
    })

    await expect(client.quota()).rejects.toMatchObject({
      message: '该 Key 已到期',
      code: 'access_key_inactive',
      status: 401,
    })
  })

  it('decodes structured transcription progress', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ...requestResponse('running'),
        progress: {
          stage: 'transcribing',
          percent: 42,
          processedSeconds: 2520.5,
          totalSeconds: 6000,
        },
      })
    ) as any
    const client = new VoxrailClient({
      getBaseUrl: () => 'https://voxrail.example/api/v1',
      getAccessKey: () => 'vr_live_key',
      fetcher,
    })

    await expect(client.getRequest('120f40c2-7e1a-4f18-a6ab-8f63a388d657')).resolves.toMatchObject({
      status: 'running',
      progress: {
        stage: 'transcribing',
        percent: 42,
        processedSeconds: 2520.5,
        totalSeconds: 6000,
      },
    })
  })
})

describe('localizeVoxrailSnapshot', () => {
  it('maps the global content ID and keeps word timing', () => {
    const snapshot = localizeVoxrailSnapshot(
      {
        protocolVersion: 2,
        contentId: 'global-job-id',
        revision: 1002,
        state: 'ready',
        source: 'voxrail',
        language: 'zh',
        isPartial: false,
        lines: [
          {
            id: 'global-job-id:line:0',
            startMs: 0,
            endMs: 1000,
            displayText: '你好',
            words: [{ id: 'word-1', startIndex: 0, length: 2, startMs: 0, endMs: 800 }],
          },
        ],
        speakers: [],
      },
      'local-episode-id',
      7
    )

    expect(snapshot).toMatchObject({
      contentId: 'local-episode-id',
      revision: 1002,
      source: 'voxrail',
      lines: [{ words: [{ startIndex: 0, length: 2 }] }],
    })
  })

  it('rejects word ranges outside display text', () => {
    expect(() =>
      localizeVoxrailSnapshot(
        {
          protocolVersion: 2,
          revision: 1,
          state: 'ready',
          language: 'zh',
          isPartial: false,
          lines: [
            {
              startMs: 0,
              endMs: 1000,
              displayText: '你好',
              words: [{ startIndex: 1, length: 2, startMs: 0, endMs: 800 }],
            },
          ],
          speakers: [],
        },
        'episode-1'
      )
    ).toThrow('词级时间')
  })
})

const requestResponse = (status: string) => ({
  requestId: '120f40c2-7e1a-4f18-a6ab-8f63a388d657',
  status,
  cacheHit: false,
  joined: false,
  pollUrl:
    'https://voxrail.example/api/v1/transcription-requests/120f40c2-7e1a-4f18-a6ab-8f63a388d657',
  createdAt: '2026-08-13T00:00:00.000Z',
  completedAt: null,
  warnings: [],
})

const jsonResponse = (value: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => value,
})
