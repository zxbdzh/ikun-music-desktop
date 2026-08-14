import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PodcastModule } from './module'
import { VOXRAIL_RETRY_WINDOW_MS, VoxrailError } from './voxrailClient'

const { safeStorage } = vi.hoisted(() => {
  const value = {
    available: true,
    isEncryptionAvailable: vi.fn(() => value.available),
    encryptString: vi.fn((plainText: string) => Buffer.from(`encrypted:${plainText}`)),
    decryptString: vi.fn((encrypted: Buffer) => encrypted.toString().replace(/^encrypted:/, '')),
  }
  return { safeStorage: value }
})

vi.mock('electron', () => ({
  app: { getVersion: () => '1.4.5' },
  safeStorage,
}))

afterEach(() => {
  vi.useRealTimers()
  safeStorage.available = true
  vi.clearAllMocks()
})

describe('PodcastModule cloud transcript lifecycle', () => {
  it('prefers publisher subtitles and never creates a Voxrail request', async () => {
    const proxyText = vi.fn(async () => (
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nPublisher line'
    ))
    const module = new PodcastModule({ proxyText } as any)
    const episode = podcastEpisode({
      transcriptReferences: [{ url: 'https://cdn.example/show.vtt', type: 'text/vtt' }],
    })
    const createRequest = vi.fn()
    ;(module as any).voxrail = { createRequest }
    global.lx = podcastGlobals({
      episode,
      stored: null,
    })

    const result = await module.transcript(episode.id)

    expect(result).toMatchObject({ state: 'ready', revision: 1 })
    expect(result.upsertLines[0].displayText).toBe('Publisher line')
    expect(proxyText).toHaveBeenCalledWith('https://cdn.example/show.vtt')
    expect(createRequest).not.toHaveBeenCalled()
  })

  it('uses an existing ready local transcript before Voxrail', async () => {
    const module = new PodcastModule()
    const episode = podcastEpisode()
    const stored = transcriptSnapshot({ source: 'asr', revision: 9 })
    const createRequest = vi.fn()
    ;(module as any).voxrail = { createRequest }
    global.lx = podcastGlobals({ episode, stored })

    const result = await module.transcript(episode.id)

    expect(result).toMatchObject({ state: 'ready', revision: 9 })
    expect(createRequest).not.toHaveBeenCalled()
  })

  it('creates and polls a Voxrail request when no ready transcript exists', async () => {
    vi.useFakeTimers()
    const module = new PodcastModule()
    const episode = podcastEpisode()
    const createRequest = vi.fn(async () => requestResponse('queued'))
    const getRequest = vi
      .fn()
      .mockResolvedValueOnce(requestResponse('running', undefined, {
        stage: 'transcribing',
        percent: 42,
        processedSeconds: 2520,
        totalSeconds: 6000,
      }))
      .mockResolvedValueOnce(requestResponse('completed', transcriptSnapshot({
        contentId: 'global-request-id',
        source: 'voxrail',
        revision: 12,
      })))
    ;(module as any).voxrail = { createRequest, getRequest }
    const saved: LX.Podcast.TranscriptSnapshot[] = []
    global.lx = podcastGlobals({ episode, stored: null, onSave: (snapshot) => saved.push(snapshot) })

    await module.transcript(episode.id)
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.waitFor(() => expect(module.getTranscriptionStatus(episode.id)).toMatchObject({
      stage: 'running',
      progress: 0.42,
      progressStage: 'transcribing',
      processedSeconds: 2520,
      totalSeconds: 6000,
    }))
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.waitFor(() => expect(saved).toHaveLength(1))

    expect(createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: episode.id }),
      'https://feeds.example/show.xml',
      expect.any(AbortSignal)
    )
    expect(getRequest).toHaveBeenCalledWith(REQUEST_ID, expect.any(AbortSignal))
    expect(saved[0]).toMatchObject({
      contentId: episode.id,
      source: 'voxrail',
      state: 'ready',
      revision: 12,
    })
    expect(module.getTranscriptionStatus(episode.id)).toMatchObject({
      transcriptSource: 'voxrail',
      stage: 'completed',
    })
  })

  it('submits Feed identity even when IKUN has no local audio URL', async () => {
    const module = new PodcastModule()
    const episode = podcastEpisode({ audioUrl: '' })
    const snapshot = transcriptSnapshot({ contentId: episode.id, source: 'voxrail' })
    const createRequest = vi.fn(async () => requestResponse('completed', snapshot))
    ;(module as any).voxrail = { createRequest }
    global.lx = podcastGlobals({ episode, stored: null })

    await expect((module as any).ensureVoxrailTranscript(episode.id)).resolves.toMatchObject({
      contentId: episode.id,
      source: 'voxrail',
      state: 'ready',
    })

    expect(createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: episode.id, guid: episode.guid, audioUrl: '' }),
      'https://feeds.example/show.xml',
      expect.any(AbortSignal)
    )
  })

  it('backs off a failed cloud request until the automatic retry window expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T00:00:00.000Z'))
    const module = new PodcastModule()
    const episode = podcastEpisode()
    const snapshot = transcriptSnapshot({ contentId: episode.id, source: 'voxrail' })
    const createRequest = vi.fn(async () => requestResponse('completed', snapshot))
    ;(module as any).voxrail = { createRequest }
    global.lx = podcastGlobals({ episode, stored: null })
    ;(module as any).transcriptionStatuses.set(episode.id, {
      protocolVersion: 2,
      contentId: episode.id,
      transcriptState: 'failed',
      transcriptSource: 'voxrail',
      revision: 0,
      isPartial: false,
      stage: 'failed',
      progress: null,
      updatedAt: Date.now(),
    })

    await expect((module as any).ensureVoxrailTranscript(episode.id)).resolves.toBeNull()
    expect(createRequest).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(VOXRAIL_RETRY_WINDOW_MS)
    await expect((module as any).ensureVoxrailTranscript(episode.id)).resolves.toMatchObject({
      contentId: episode.id,
      state: 'ready',
    })
    expect(createRequest).toHaveBeenCalledOnce()
  })

  it('retries a transient initial request failure before marking the job failed', async () => {
    vi.useFakeTimers()
    const module = new PodcastModule()
    const episode = podcastEpisode()
    const snapshot = transcriptSnapshot({ contentId: episode.id, source: 'voxrail' })
    const createRequest = vi
      .fn()
      .mockRejectedValueOnce(new VoxrailError('temporary outage', 'network_error', 0))
      .mockResolvedValueOnce(requestResponse('completed', snapshot))
    ;(module as any).voxrail = { createRequest }
    global.lx = podcastGlobals({ episode, stored: null })

    const result = (module as any).ensureVoxrailTranscript(episode.id)
    await vi.advanceTimersByTimeAsync(5_000)

    await expect(result).resolves.toMatchObject({ contentId: episode.id, state: 'ready' })
    expect(createRequest).toHaveBeenCalledTimes(2)
    expect(module.getTranscriptionStatus(episode.id)).toMatchObject({ stage: 'completed' })
  })

  it('returns a persisted final snapshot when completed polling repeats its revision', async () => {
    const module = new PodcastModule()
    const episode = podcastEpisode()
    const stored = transcriptSnapshot({ source: 'voxrail', revision: 12 })
    const response = requestResponse('completed', stored)
    const job = {
      controller: new AbortController(),
      queuedAt: 1,
      lastRevisionId: 'revision-final',
    }
    global.lx = podcastGlobals({ episode, stored })

    ;(module as any).voxrail = { createRequest: vi.fn(async () => response) }
    await expect(
      (module as any).runVoxrailJob(episode, 'https://feeds.example/show.xml', job)
    ).resolves.toMatchObject({ contentId: episode.id, revision: 12, state: 'ready' })
  })

  it('encrypts a saved Voxrail key and never returns the secret in config', async () => {
    const module = new PodcastModule()
    ;(module as any).initialized = true
    global.lx = podcastGlobals({ episode: podcastEpisode(), stored: null })
    const dataPath = await mkdtemp(path.join(os.tmpdir(), 'ikun-voxrail-test-'))
    global.lxDataPath = dataPath
    ;(module as any).transcriptionStatuses.set('episode-1', {
      protocolVersion: 2,
      contentId: 'episode-1',
      transcriptState: 'failed',
      transcriptSource: 'voxrail',
      revision: 0,
      isPartial: false,
      stage: 'failed',
      progress: null,
      updatedAt: Date.now(),
    })
    try {
      const config = await module.execute({
        action: 'voxrail-config-save',
        baseUrl: 'https://voxrail.example',
        accessKey: 'vr_secret',
      })

      expect(config).toEqual({
        baseUrl: 'https://voxrail.example/api/v1',
        hasAccessKey: true,
      })
      expect(config).not.toHaveProperty('accessKey')
      const serialized = await readFile(path.join(dataPath, 'podcast', 'session.json'), 'utf8')
      expect(serialized).not.toContain('vr_secret')
      expect(serialized).toContain(Buffer.from('encrypted:vr_secret').toString('base64'))
      expect(safeStorage.encryptString).toHaveBeenCalledWith('vr_secret')
      expect(module.getTranscriptionStatus('episode-1')).toBeNull()
      expect(global.lx.event_app.update_config).toHaveBeenCalledWith({
        'podcast.voxrailBaseUrl': 'https://voxrail.example/api/v1',
      })
    } finally {
      await rm(dataPath, { recursive: true, force: true })
    }
  })
})

describe('PodcastModule long-form content lifecycle', () => {
  it('requests a Feed-resolved transcript when the local enclosure hint is missing', async () => {
    const module = new PodcastModule()
    const episode = podcastEpisode({ audioUrl: '', description: '' })
    const transcript = vi.spyOn(module, 'transcript').mockResolvedValue({} as any)
    global.lx = podcastGlobals({ episode, stored: null })

    await (module as any).activateEpisode(episode.id)

    expect(transcript).toHaveBeenCalledWith(episode.id)
  })

  it('publishes only long-form content for a blog without audio', async () => {
    const module = new PodcastModule()
    const playerStatus = vi.fn()
    const episode = podcastEpisode({
      id: 'article-1',
      title: 'Long article',
      audioUrl: '',
      durationSeconds: 600,
    })
    const document: LX.Podcast.LongFormContentDocument = {
      protocolVersion: 1,
      contentId: episode.id,
      revision: 1,
      title: episode.title,
      blocks: [{ id: 'block-1', kind: 'paragraph', text: 'Full article body' }],
      blockCount: 1,
      characterCount: 17,
      originalUrl: episode.originalUrl ?? null,
      audioUrl: null,
      shareUrl: episode.originalUrl ?? null,
    }
    global.lx = podcastGlobals({ episode, stored: null })
    global.lx.event_app.player_status = playerStatus
    ;(global.lx.worker.dbService as any).podcastLongFormContentGet = vi.fn(async () => document)

    await (module as any).activateEpisode(episode.id)

    expect(playerStatus).toHaveBeenCalledWith(expect.objectContaining({
      mediaKind: 'podcast',
      contentId: episode.id,
      transcript: null,
      duration: 0,
      longFormContent: expect.objectContaining({ contentId: episode.id }),
    }))
  })
})

const REQUEST_ID = '120f40c2-7e1a-4f18-a6ab-8f63a388d657'

const podcastEpisode = (
  value: Partial<LX.Podcast.Episode> = {}
): LX.Podcast.Episode => ({
  id: 'episode-1',
  sourceId: 'source-1',
  guid: 'guid-1',
  title: 'Episode one',
  description: '',
  artworkUrl: '',
  originalUrl: 'https://example.com/episodes/1',
  audioUrl: 'https://cdn.example/episode.mp3',
  publishedAt: 1_786_032_000_000,
  durationSeconds: 1_800,
  transcriptReferences: [],
  chapters: [],
  updatedAt: 1,
  ...value,
})

const transcriptSnapshot = (
  value: Partial<LX.Podcast.TranscriptSnapshot> = {}
): LX.Podcast.TranscriptSnapshot => ({
  protocolVersion: 2,
  contentId: 'episode-1',
  revision: 1,
  state: 'ready',
  source: 'voxrail',
  language: 'zh',
  isPartial: false,
  lines: [{
    id: 'line-1',
    startMs: 0,
    endMs: 1_000,
    displayText: 'Cloud line',
    words: [],
  }],
  speakers: [],
  ...value,
})

const requestResponse = (
  status: 'queued' | 'running' | 'completed',
  snapshot?: LX.Podcast.TranscriptSnapshot,
  progress?: {
    stage: 'transcribing'
    percent: number
    processedSeconds: number
    totalSeconds: number
  }
) => ({
  requestId: REQUEST_ID,
  status,
  cacheHit: false,
  joined: false,
  pollUrl: `https://voxrail.example/api/v1/transcription-requests/${REQUEST_ID}`,
  createdAt: '2026-08-13T00:00:00.000Z',
  completedAt: status === 'completed' ? '2026-08-13T00:01:00.000Z' : null,
  warnings: [],
  ...(progress ? { progress } : {}),
  ...(snapshot ? {
    transcript: {
      revisionId: 'revision-final',
      kind: 'final' as const,
      language: 'zh',
      content: snapshot,
      plainText: 'Cloud line',
      durationSeconds: 60,
      warnings: [],
      createdAt: '2026-08-13T00:01:00.000Z',
    },
  } : {}),
})

const podcastGlobals = ({
  episode,
  stored,
  proxyText = '',
  onSave = () => undefined,
}: {
  episode: LX.Podcast.Episode
  stored: LX.Podcast.TranscriptSnapshot | null
  proxyText?: string
  onSave?: (snapshot: LX.Podcast.TranscriptSnapshot) => void
}) => ({
  appSetting: { 'podcast.voxrailBaseUrl': 'https://voxrail.example/api/v1' },
  player_status: { progress: 0 },
  event_app: { player_status: vi.fn(), update_config: vi.fn() },
  worker: {
    dbService: {
      podcastEpisodeGet: vi.fn(async () => episode),
      podcastSourcesGet: vi.fn(async () => [{
        id: episode.sourceId,
        title: 'Example show',
        author: 'Host',
        description: '',
        artworkUrl: '',
        feedUrl: 'https://feeds.example/show.xml',
        categories: [],
        subscribed: true,
        autoDownload: false,
        groupId: 'default_group',
        subscriptionOrder: 0,
        updatedAt: 1,
      }]),
      podcastTranscriptGet: vi.fn(async () => stored),
      podcastTranscriptSave: vi.fn(async (_versionId, snapshot) => onSave(snapshot)),
      podcastLongFormContentGet: vi.fn(async () => null),
      podcastLongFormContentsSave: vi.fn(),
    },
  },
  client: { proxyText: vi.fn(async () => proxyText) },
}) as unknown as typeof global.lx
