import { afterEach, describe, expect, it, vi } from 'vitest'
import { PodcastAsrCancelledError } from './asr'
import { PodcastModule } from './module'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

afterEach(() => {
  vi.useRealTimers()
})

describe('PodcastModule transcript preparation', () => {
  it('returns missing without starting ASR automatically', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-1', transcriptReferences: [] }
    const prepare = vi.fn()
    ;(module as any).asr = { prepare }
    global.lx = {
      appSetting: { 'podcast.asrModel': 'small' },
      player_status: { progress: 0 },
      event_app: { player_status: vi.fn() },
      worker: {
        dbService: {
          podcastEpisodeGet: vi.fn(async () => episode),
          podcastTranscriptGet: vi.fn(async () => null),
        },
      },
    } as unknown as typeof global.lx

    const result = await module.transcript(episode.id)

    expect(result).toMatchObject({
      contentId: episode.id,
      protocolVersion: 2,
      revision: 0,
      state: 'missing',
      isPartial: false,
    })
    expect(prepare).not.toHaveBeenCalled()
  })

  it('returns the active transcript from memory without another database round trip', async () => {
    const module = new PodcastModule()
    const snapshot: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: 'episode-1',
      revision: 2,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [],
      speakers: [],
    }
    const podcastTranscriptGet = vi.fn(async () => {
      throw new Error('database should not be queried')
    })
    ;(module as any).currentEpisodeId = snapshot.contentId
    ;(module as any).currentTranscript = snapshot
    global.lx = {
      appSetting: { 'podcast.asrModel': 'small' },
      worker: { dbService: { podcastTranscriptGet } },
      event_app: { player_status: vi.fn() },
    } as unknown as typeof global.lx

    await expect(module.transcript(snapshot.contentId)).resolves.toMatchObject({
      contentId: snapshot.contentId,
      revision: snapshot.revision,
      state: 'ready',
    })
    expect(podcastTranscriptGet).not.toHaveBeenCalled()
  })

  it('migrates a stored ASR transcript to simplified Chinese with a new revision', async () => {
    const module = new PodcastModule()
    const snapshot: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: 'episode-traditional',
      revision: 153,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [{
        id: 'line-1',
        startMs: 80_520,
        endMs: 83_880,
        displayText: '就是大家都覺得AI是一個非常了不起的一個事',
        words: [],
      }],
      speakers: [],
    }
    const podcastTranscriptSave = vi.fn()
    global.lx = {
      appSetting: { 'podcast.asrModel': 'small' },
      worker: {
        dbService: {
          podcastTranscriptGet: vi.fn(async () => snapshot),
          podcastTranscriptSave,
        },
      },
      event_app: { player_status: vi.fn() },
    } as unknown as typeof global.lx

    const result = await module.transcript(snapshot.contentId, snapshot.revision)

    expect(result).toMatchObject({ revision: 154, reset: true })
    expect(result.upsertLines[0].displayText).toBe(
      '就是大家都觉得AI是一个非常了不起的一个事'
    )
    expect(podcastTranscriptSave).toHaveBeenCalledWith(
      'normalization:simplified-v1',
      expect.objectContaining({ revision: 154 }),
      true
    )
  })

  it('does not normalize and overwrite an in-progress ASR snapshot', async () => {
    const module = new PodcastModule()
    const snapshot: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: 'episode-active-asr',
      revision: 24,
      state: 'preparing',
      source: 'asr',
      language: 'auto',
      isPartial: true,
      lines: [{
        id: 'line-1',
        startMs: 0,
        endMs: 1_000,
        displayText: '這個測試',
        words: [],
      }],
      speakers: [],
      completedSegmentIndexes: [0],
    }
    const podcastTranscriptSave = vi.fn()
    ;(module as any).currentEpisodeId = snapshot.contentId
    ;(module as any).currentTranscript = snapshot
    global.lx = {
      appSetting: { 'podcast.asrModel': 'small' },
      worker: { dbService: { podcastTranscriptSave } },
      event_app: { player_status: vi.fn() },
    } as unknown as typeof global.lx

    const result = await module.transcript(snapshot.contentId)

    expect(result).toMatchObject({
      revision: snapshot.revision,
      state: 'preparing',
      upsertLines: [expect.objectContaining({ displayText: '這個測試' })],
    })
    expect(podcastTranscriptSave).not.toHaveBeenCalled()
  })

  it('starts segmented ASR manually and publishes detailed status', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-1', transcriptReferences: [] }
    const playerStatus = vi.fn()
    ;(module as any).currentEpisodeId = episode.id
    ;(module as any).asr = {
      prepare: vi.fn(async (_episode, onProgress) => {
        onProgress({ stage: 'preparing-model', modelState: 'downloading', progress: 0.5 })
        return {
          episode,
          segments: [
            { index: 0, startMs: 0, endMs: 30_000, recognitionStartMs: 0, recognitionEndMs: 30_000 },
          ],
          language: 'auto',
        }
      }),
      transcribeSegment: vi.fn(async () => [segmentLine(episode.id, 0)]),
    }
    ;(module as any).speakerDiarization = {
      diarize: vi.fn(async (_prepared, onProgress) => {
        onProgress({
          stage: 'diarizing',
          modelState: 'ready',
          progress: 1,
          executor: 'cpu',
          executorFallbackReason: 'DirectML provider 不可用',
          speakerCount: 1,
        })
        return {
          segments: [{ start: 0, end: 30, speaker: 7 }],
          executor: 'cpu',
          executorFallbackReason: 'DirectML provider 不可用',
        }
      }),
    }
    global.lx = {
      appSetting: { 'podcast.asrModel': 'small', 'podcast.asrLanguage': 'auto' },
      player_status: { progress: 0 },
      event_app: { player_status: playerStatus },
      worker: {
        dbService: {
          podcastEpisodeGet: vi.fn(async () => episode),
          podcastTranscriptGet: vi.fn(async () => null),
          podcastTranscriptSave: vi.fn(),
        },
      },
    } as unknown as typeof global.lx

    await expect(module.controlTranscription(episode.id, 'start')).resolves.toMatchObject({
      protocolVersion: 2,
      stage: 'queued',
    })
    await (module as any).asrJobs.get(episode.id).promise

    expect(module.getTranscriptionStatus(episode.id)).toMatchObject({
      transcriptState: 'ready',
      modelState: 'ready',
      stage: 'completed',
      progress: 1,
      completedSegments: 1,
      totalSegments: 1,
      speakerModelState: 'ready',
      executor: 'cpu',
      executorFallbackReason: 'DirectML provider 不可用',
      speakerCount: 1,
    })
    expect((module as any).currentTranscript).toMatchObject({
      lines: [expect.objectContaining({ speakerId: 'speaker-1' })],
      speakers: [{ id: 'speaker-1', name: '说话人 1', origin: 'local' }],
    })
    expect(playerStatus).toHaveBeenCalledWith({
      transcript: expect.objectContaining({ protocolVersion: 2, state: 'ready' }),
    })
  })

  it('runs automatic speaker identification through the shared ASR queue', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-auto-identify', sourceId: 'source-1', transcriptReferences: [] }
    const enqueue = vi.spyOn((module as any).asrQueue, 'enqueue')
    ;(module as any).currentEpisodeId = episode.id
    ;(module as any).aiApiKey = 'test-key'
    ;(module as any).asr = {
      prepare: vi.fn(async () => ({
        episode,
        segments: segments(1),
        language: 'auto',
      })),
      transcribeSegment: vi.fn(async () => [segmentLine(episode.id, 0)]),
    }
    const diarize = vi.fn(async (
      _prepared: unknown,
      _onProgress?: unknown,
      _signal?: AbortSignal,
      _expectedSpeakerCount?: number
    ) => ({
        segments: [{ start: 0, end: 30, speaker: 0 }],
        executor: 'cpu',
      }))
    const estimateSpeakerCount = vi.fn(async () => 2)
    ;(module as any).speakerDiarization = { diarize }
    ;(module as any).speakerIdentification = {
      estimateSpeakerCount,
      identify: vi.fn(async (_episode, snapshot) => snapshot),
    }
    global.lx = podcastGlobals(episode, null)
    Object.assign(global.lx.appSetting, {
      'podcast.aiEnabled': true,
      'podcast.aiBaseUrl': 'https://example.test/v1',
      'podcast.aiModel': 'test-model',
    })

    await module.controlTranscription(episode.id, 'start')
    await vi.waitFor(() => expect(module.getTranscriptionStatus(episode.id)?.stage).toBe('completed'))

    expect(enqueue.mock.calls.map(([id]) => id)).toContain(`${episode.id}:identify`)
    expect(estimateSpeakerCount).toHaveBeenCalledWith(
      episode,
      expect.any(Object),
      expect.any(Object),
      expect.any(AbortSignal),
      expect.objectContaining({ id: episode.sourceId })
    )
    expect(diarize.mock.calls[0]?.[3]).toBe(2)
  })

  it('re-runs diarization when AI estimates a different plausible speaker count', async () => {
    const module = new PodcastModule()
    const episode = {
      id: 'episode-speaker-count-changed',
      sourceId: 'source-1',
      transcriptReferences: [],
    }
    const snapshot: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: episode.id,
      revision: 9,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [
        { ...segmentLine(episode.id, 0), speakerId: 'speaker-1' },
        { ...segmentLine(episode.id, 1), speakerId: 'speaker-2' },
      ],
      speakers: [
        { id: 'speaker-1', name: '说话人 1', origin: 'local' },
        { id: 'speaker-2', name: '说话人 2', origin: 'local' },
      ],
    }
    const diarize = vi.fn(async (
      _prepared: unknown,
      _onProgress?: unknown,
      _signal?: AbortSignal,
      expectedSpeakerCount?: number
    ) => ({
      segments: [
        { start: 0, end: 20, speaker: 0 },
        { start: 20, end: 40, speaker: 1 },
        { start: 40, end: 60, speaker: 2 },
      ],
      executor: 'cpu',
      expectedSpeakerCount,
    }))
    ;(module as any).aiApiKey = 'test-key'
    ;(module as any).asr = { prepareAudio: vi.fn(async () => ({ episode })) }
    ;(module as any).speakerDiarization = { diarize }
    ;(module as any).speakerIdentification = {
      estimateSpeakerCount: vi.fn(async () => 3),
      identify: vi.fn(async (_episode, value) => value),
    }
    global.lx = podcastGlobals(episode, snapshot)
    Object.assign(global.lx.appSetting, {
      'podcast.aiEnabled': true,
      'podcast.aiBaseUrl': 'https://example.test/v1',
      'podcast.aiModel': 'test-model',
    })

    await (module as any).startSpeakerIdentification(episode.id)
    await vi.waitFor(() => expect(module.getTranscriptionStatus(episode.id)?.stage).toBe('completed'))

    expect(diarize).toHaveBeenCalled()
    expect(diarize.mock.calls[0]?.[3]).toBe(3)
  })

  it('re-runs diarization when a legacy transcript contains excessive speaker clusters', async () => {
    const module = new PodcastModule()
    const episode = {
      id: 'episode-excessive-speakers', sourceId: 'source-1', transcriptReferences: [],
    }
    const snapshot: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: episode.id,
      revision: 9,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [
        { ...segmentLine(episode.id, 0), speakerId: 'speaker-1' },
        { ...segmentLine(episode.id, 1), speakerId: 'speaker-2' },
      ],
      speakers: Array.from({ length: 64 }, (_, index) => ({
        id: `speaker-${index + 1}`,
        name: `说话人 ${index + 1}`,
        origin: 'local' as const,
      })),
    }
    const estimateSpeakerCount = vi.fn(async () => 2)
    const diarize = vi.fn(async (
      _prepared: unknown,
      _onProgress?: unknown,
      _signal?: AbortSignal,
      _expectedSpeakerCount?: number
    ) => ({
      segments: [
        { start: 0, end: 30, speaker: 0 },
        { start: 30, end: 60, speaker: 1 },
      ],
      executor: 'cpu',
    }))
    const identify = vi.fn(async (_episode, value) => value)
    ;(module as any).aiApiKey = 'test-key'
    ;(module as any).asr = { prepareAudio: vi.fn(async () => ({ episode })) }
    ;(module as any).speakerDiarization = { diarize }
    ;(module as any).speakerIdentification = { estimateSpeakerCount, identify }
    global.lx = podcastGlobals(episode, snapshot)
    Object.assign(global.lx.appSetting, {
      'podcast.aiEnabled': true,
      'podcast.aiBaseUrl': 'https://example.test/v1',
      'podcast.aiModel': 'test-model',
    })

    await (module as any).startSpeakerIdentification(episode.id)
    await vi.waitFor(() => expect(module.getTranscriptionStatus(episode.id)?.stage).toBe('completed'))

    expect(estimateSpeakerCount).toHaveBeenCalled()
    expect(diarize.mock.calls[0]?.[3]).toBe(2)
    expect(identify).toHaveBeenCalledWith(
      episode,
      expect.objectContaining({
        speakers: [
          { id: 'speaker-1', name: '说话人 1', origin: 'local' },
          { id: 'speaker-2', name: '说话人 2', origin: 'local' },
        ],
      }),
      expect.any(Object),
      expect.any(AbortSignal),
      expect.objectContaining({ id: episode.sourceId })
    )
  })

  it('runs diarization before manual AI identification when an old ASR transcript has no speakers', async () => {
    const module = new PodcastModule()
    const episode = {
      id: 'episode-manual-identify', sourceId: 'source-1', transcriptReferences: [],
    }
    const snapshot: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: episode.id,
      revision: 9,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [segmentLine(episode.id, 0)],
      speakers: [],
    }
    const enqueue = vi.spyOn((module as any).asrQueue, 'enqueue')
    const prepareAudio = vi.fn(async () => ({ episode }))
    const identify = vi.fn(async (_episode, value) => value)
    ;(module as any).aiApiKey = 'test-key'
    ;(module as any).asr = { prepareAudio }
    ;(module as any).speakerDiarization = {
      diarize: vi.fn(async () => ({
        segments: [{ start: 0, end: 30, speaker: 0 }],
        executor: 'cpu',
      })),
    }
    ;(module as any).speakerIdentification = {
      estimateSpeakerCount: vi.fn(async () => 2),
      identify,
    }
    global.lx = podcastGlobals(episode, snapshot)
    Object.assign(global.lx.appSetting, {
      'podcast.aiEnabled': true,
      'podcast.aiBaseUrl': 'https://example.test/v1',
      'podcast.aiModel': 'test-model',
    })

    await (module as any).startSpeakerIdentification(episode.id)
    await vi.waitFor(() => expect(module.getTranscriptionStatus(episode.id)?.stage).toBe('completed'))

    expect(prepareAudio).toHaveBeenCalledWith(episode, expect.any(Function), expect.any(AbortSignal))
    expect(enqueue.mock.calls.map(([id]) => id)).toEqual([
      `${episode.id}:estimate-speakers`,
      `${episode.id}:diarize`,
      `${episode.id}:identify`,
    ])
    expect(identify).toHaveBeenCalledWith(
      episode,
      expect.objectContaining({
        speakers: [{ id: 'speaker-1', name: '说话人 1', origin: 'local' }],
      }),
      expect.any(Object),
      expect.any(AbortSignal),
      expect.objectContaining({ id: episode.sourceId })
    )
  })

  it('keeps a ready transcript available when speaker diarization fails', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-speaker-failure', transcriptReferences: [] }
    const snapshot: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: episode.id,
      revision: 9,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [segmentLine(episode.id, 0)],
      speakers: [],
    }
    ;(module as any).aiApiKey = 'test-key'
    ;(module as any).asr = {
      prepareAudio: vi.fn(async (_episode, onProgress) => {
        onProgress({ stage: 'downloading-audio', progress: null })
        return { episode }
      }),
    }
    ;(module as any).speakerDiarization = {
      diarize: vi.fn(async (_prepared, onProgress) => {
        onProgress({
          stage: 'preparing-speaker-model',
          modelState: 'downloading',
          progress: 1,
        })
        throw new Error('说话人分割模型校验失败')
      }),
    }
    global.lx = podcastGlobals(episode, snapshot)
    Object.assign(global.lx.appSetting, {
      'podcast.aiEnabled': true,
      'podcast.aiBaseUrl': 'https://example.test/v1',
      'podcast.aiModel': 'test-model',
    })

    await (module as any).startSpeakerIdentification(episode.id)
    await vi.waitFor(() => expect(
      module.getTranscriptionStatus(episode.id)?.speakerError
    ).toBe('说话人分割模型校验失败'))

    expect(module.getTranscriptionStatus(episode.id)).toMatchObject({
      transcriptState: 'ready',
      revision: snapshot.revision,
      stage: 'completed',
      speakerError: '说话人分割模型校验失败',
    })
  })

  it('stops queued segment work after a failure and keeps the completed slices', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-failure', transcriptReferences: [] }
    const saved: LX.Podcast.TranscriptSnapshot[] = []
    const transcribeSegment = vi.fn(async (_prepared, segment) => {
      if (segment.index === 1) throw new Error('segment failed')
      return [segmentLine(episode.id, segment.index)]
    })
    ;(module as any).currentEpisodeId = episode.id
    ;(module as any).asr = {
      prepare: vi.fn(async () => ({
        episode,
        segments: segments(3),
        language: 'auto',
      })),
      transcribeSegment,
    }
    global.lx = podcastGlobals(episode, null, (snapshot) => saved.push(snapshot))

    await module.controlTranscription(episode.id, 'start')
    await vi.waitFor(() => expect(saved.at(-1)?.state).toBe('failed'))
    const result = saved.at(-1)!

    expect(transcribeSegment.mock.calls.map(([, segment]) => segment.index)).toEqual([0, 1])
    expect(result).toMatchObject({
      state: 'failed',
      completedSegmentIndexes: [0],
      lines: [expect.objectContaining({ id: `${episode.id}:segment-0:line-0` })],
    })
    expect(saved.at(-1)?.state).toBe('failed')
    expect(module.getTranscriptionStatus(episode.id)).toMatchObject({
      transcriptState: 'failed',
      completedSegments: 1,
      totalSegments: 3,
    })
  })

  it('retries only slices that were not completed by the failed ASR job', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-retry', transcriptReferences: [] }
    const stored: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: episode.id,
      revision: 4,
      state: 'failed',
      source: 'asr',
      language: 'auto',
      isPartial: true,
      lines: [segmentLine(episode.id, 0)],
      speakers: [],
      completedSegmentIndexes: [0],
      error: 'segment failed',
    }
    const transcribeSegment = vi.fn(async (_prepared, segment) => [
      segmentLine(episode.id, segment.index),
    ])
    const saved: LX.Podcast.TranscriptSnapshot[] = []
    ;(module as any).currentEpisodeId = episode.id
    ;(module as any).asr = {
      prepare: vi.fn(async () => ({
        episode,
        segments: segments(2),
        language: 'auto',
      })),
      transcribeSegment,
    }
    global.lx = podcastGlobals(episode, stored, (snapshot) => saved.push(snapshot))

    await module.controlTranscription(episode.id, 'retry')
    await vi.waitFor(() => expect(saved.at(-1)?.state).toBe('ready'))
    const result = saved.at(-1)!

    expect(transcribeSegment.mock.calls.map(([, segment]) => segment.index)).toEqual([1])
    expect(result).toMatchObject({
      state: 'ready',
      completedSegmentIndexes: [0, 1],
    })
    expect(result.lines.map((line) => line.id)).toEqual([
      `${episode.id}:segment-0:line-0`,
      `${episode.id}:segment-1:line-0`,
    ])
  })

  it('cancels a queued job before ASR starts', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-queued-cancel', transcriptReferences: [] }
    const saved: LX.Podcast.TranscriptSnapshot[] = []
    const prepare = vi.fn()
    let releaseBlocker!: () => void
    const blocker = new Promise<void>((resolve) => { releaseBlocker = resolve })
    ;(module as any).asr = { prepare }
    global.lx = podcastGlobals(episode, null, (snapshot) => saved.push(snapshot))
    const active = (module as any).asrQueue.enqueue('other:active', () => -1, () => blocker)

    await module.controlTranscription(episode.id, 'start')
    await vi.waitFor(() => expect((module as any).asrJobs.has(episode.id)).toBe(true))
    const job = (module as any).asrJobs.get(episode.id)

    await expect(module.controlTranscription(episode.id, 'cancel')).resolves.toMatchObject({
      stage: 'cancelled',
    })
    await job.promise
    releaseBlocker()
    await active

    expect(prepare).not.toHaveBeenCalled()
    expect(saved.at(-1)).toMatchObject({
      state: 'preparing',
      isPartial: true,
      interruptionReason: 'cancelled',
    })
    expect(module.getTranscriptionStatus(episode.id)).toMatchObject({ stage: 'cancelled' })
  })

  it('stops a running job, preserves completed slices, and treats repeated cancellation as idempotent', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-running-cancel', transcriptReferences: [] }
    const saved: LX.Podcast.TranscriptSnapshot[] = []
    const transcribeSegment = vi.fn(async (_prepared, segment, _onProgress, signal) => {
      if (segment.index === 0) return [segmentLine(episode.id, segment.index)]
      return new Promise<LX.Podcast.TranscriptLine[]>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new PodcastAsrCancelledError()), { once: true })
      })
    })
    ;(module as any).asr = {
      prepare: vi.fn(async () => ({ episode, segments: segments(2), language: 'auto' })),
      transcribeSegment,
    }
    global.lx = podcastGlobals(episode, null, (snapshot) => saved.push(snapshot))

    await module.controlTranscription(episode.id, 'start')
    await vi.waitFor(() => expect(module.getTranscriptionStatus(episode.id)?.currentSegment).toBe(2))
    const job = (module as any).asrJobs.get(episode.id)
    const firstCancellation = await module.controlTranscription(episode.id, 'cancel')
    expect(['cancelling', 'cancelled']).toContain(firstCancellation.stage)
    const repeatedCancellation = await module.controlTranscription(episode.id, 'cancel')
    expect(['cancelling', 'cancelled']).toContain(repeatedCancellation.stage)
    await job.promise

    expect(saved.at(-1)).toMatchObject({
      state: 'preparing',
      isPartial: true,
      interruptionReason: 'cancelled',
      completedSegmentIndexes: [0],
      lines: [expect.objectContaining({ id: `${episode.id}:segment-0:line-0` })],
    })
    expect(module.getTranscriptionStatus(episode.id)).toMatchObject({
      stage: 'cancelled',
      completedSegments: 1,
      totalSegments: 2,
    })
  })

  it('continues a cancelled transcript from the first incomplete slice', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-continue', transcriptReferences: [] }
    const stored: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: episode.id,
      revision: 3,
      state: 'preparing',
      source: 'asr',
      language: 'auto',
      isPartial: true,
      lines: [segmentLine(episode.id, 0)],
      speakers: [],
      completedSegmentIndexes: [0],
      interruptionReason: 'cancelled',
    }
    const saved: LX.Podcast.TranscriptSnapshot[] = []
    const transcribeSegment = vi.fn(async (_prepared, segment) => [
      segmentLine(episode.id, segment.index),
    ])
    ;(module as any).asr = {
      prepare: vi.fn(async () => ({ episode, segments: segments(2), language: 'auto' })),
      transcribeSegment,
    }
    global.lx = podcastGlobals(episode, stored, (snapshot) => saved.push(snapshot))

    await expect(module.controlTranscription(episode.id, 'start')).resolves.toMatchObject({
      stage: 'queued',
    })
    await vi.waitFor(() => expect(saved.at(-1)?.state).toBe('ready'))

    expect(transcribeSegment.mock.calls.map(([, segment]) => segment.index)).toEqual([1])
    expect(saved.at(-1)).toMatchObject({
      state: 'ready',
      isPartial: false,
      completedSegmentIndexes: [0, 1],
      interruptionReason: undefined,
    })
  })

  it('rebuilds missing word timings while preserving existing AI speaker labels', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-word-timing-upgrade', transcriptReferences: [] }
    const stored: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: episode.id,
      revision: 12,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [{
        ...segmentLine(episode.id, 0),
        speakerId: 'speaker-host',
      }],
      speakers: [{ id: 'speaker-host', name: 'Host', origin: 'ai' }],
      completedSegmentIndexes: [0],
    }
    const saved: LX.Podcast.TranscriptSnapshot[] = []
    const timedLine: LX.Podcast.TranscriptLine = {
      ...segmentLine(episode.id, 0),
      words: [{
        id: `${episode.id}:segment-0:line-0:word-0`,
        startIndex: 0,
        length: 7,
        startMs: 0,
        endMs: 1_000,
      }],
    }
    const transcribeSegment = vi.fn(async () => [timedLine])
    const diarize = vi.fn()
    ;(module as any).asr = {
      prepare: vi.fn(async () => ({ episode, segments: segments(1), language: 'auto' })),
      transcribeSegment,
    }
    ;(module as any).speakerDiarization = { diarize }
    global.lx = podcastGlobals(episode, stored, (snapshot) => saved.push(snapshot))

    await expect(module.controlTranscription(episode.id, 'restart')).resolves.toMatchObject({
      stage: 'queued',
    })
    await vi.waitFor(() => expect(saved.at(-1)?.state).toBe('ready'))

    expect(transcribeSegment).toHaveBeenCalledOnce()
    expect(diarize).not.toHaveBeenCalled()
    expect(saved[0]).toMatchObject({
      state: 'preparing',
      wordTimingUpgrade: true,
      lines: [expect.objectContaining({ speakerId: 'speaker-host' })],
      speakers: [{ id: 'speaker-host', name: 'Host', origin: 'ai' }],
    })
    expect(saved.some((snapshot) => snapshot.lines.some(
      (line) => line.words.length > 0 && line.speakerId === 'speaker-host'
    ))).toBe(true)
    expect(saved.at(-1)).toMatchObject({
      state: 'ready',
      wordTimingUpgrade: undefined,
      lines: [{
        speakerId: 'speaker-host',
        words: [expect.objectContaining({ startMs: 0, endMs: 1_000 })],
      }],
      speakers: [{ id: 'speaker-host', name: 'Host', origin: 'ai' }],
    })
  })

  it('recovers a speaker reference from history after an interrupted legacy timing upgrade', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-historical-speaker-reference', transcriptReferences: [] }
    const timedLine: LX.Podcast.TranscriptLine = {
      ...segmentLine(episode.id, 0),
      words: [{
        id: `${episode.id}:segment-0:line-0:word-0`,
        startIndex: 0,
        length: 7,
        startMs: 0,
        endMs: 1_000,
      }],
    }
    const interrupted: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: episode.id,
      revision: 18,
      state: 'preparing',
      source: 'asr',
      language: 'auto',
      isPartial: true,
      lines: [timedLine],
      speakers: [],
      completedSegmentIndexes: [0],
      interruptionReason: 'cancelled',
    }
    const historical: LX.Podcast.TranscriptSnapshot = {
      ...interrupted,
      revision: 12,
      state: 'ready',
      isPartial: false,
      lines: [{ ...segmentLine(episode.id, 0), speakerId: 'speaker-host' }],
      speakers: [{ id: 'speaker-host', name: 'Host', origin: 'ai' }],
      completedSegmentIndexes: [0],
      interruptionReason: undefined,
    }
    const saved: LX.Podcast.TranscriptSnapshot[] = []
    const diarize = vi.fn()
    const historicalReferenceGet = vi.fn(async () => historical)
    ;(module as any).asr = {
      prepare: vi.fn(async () => ({ episode, segments: segments(1), language: 'auto' })),
      transcribeSegment: vi.fn(async () => [timedLine]),
    }
    ;(module as any).speakerDiarization = { diarize }
    global.lx = podcastGlobals(episode, interrupted, (snapshot) => saved.push(snapshot))
    ;(global.lx.worker.dbService as any).podcastTranscriptSpeakerReferenceGet =
      historicalReferenceGet

    await module.controlTranscription(episode.id, 'restart')
    await vi.waitFor(() => expect(saved.at(-1)?.state).toBe('ready'))

    expect(historicalReferenceGet).toHaveBeenCalledWith(episode.id)
    expect(diarize).not.toHaveBeenCalled()
    expect(saved.at(-1)).toMatchObject({
      state: 'ready',
      lines: [expect.objectContaining({ speakerId: 'speaker-host' })],
      speakers: [{ id: 'speaker-host', name: 'Host', origin: 'ai' }],
    })
  })

  it('publishes a five-second heartbeat only after the queued job starts', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T09:00:00Z'))
    const module = new PodcastModule()
    const contentId = 'episode-heartbeat'
    const job = {
      promise: Promise.resolve({}),
      positionMs: 0,
      versionId: 'asr:test',
      failed: false,
      controller: new AbortController(),
      queuedAt: Date.now() - 10_000,
      cancelRequested: false,
      heartbeatTimer: undefined as ReturnType<typeof setInterval> | undefined,
    }
    ;(module as any).asrJobs.set(contentId, job)
    ;(module as any).publishTranscriptionStatus((module as any).createQueuedStatus(
      contentId,
      0,
      job.queuedAt
    ))

    expect(module.getTranscriptionStatus(contentId)?.startedAt).toBeUndefined()
    ;(module as any).startAsrHeartbeat(contentId, job)
    const startedAt = Date.now()
    expect(module.getTranscriptionStatus(contentId)).toMatchObject({
      startedAt,
      lastHeartbeatAt: startedAt,
    })

    vi.advanceTimersByTime(5_000)
    expect(module.getTranscriptionStatus(contentId)?.lastHeartbeatAt).toBe(startedAt + 5_000)
    clearInterval(job.heartbeatTimer!)
  })

  it('restores an interrupted preparing snapshot as resumable instead of actively queued', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-interrupted', transcriptReferences: [] }
    const stored: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: episode.id,
      revision: 2,
      state: 'preparing',
      source: 'asr',
      language: 'auto',
      isPartial: true,
      lines: [],
      speakers: [],
    }
    global.lx = podcastGlobals(episode, stored)

    await expect(module.controlTranscription(episode.id, 'cancel')).resolves.toMatchObject({
      transcriptState: 'preparing',
      stage: 'cancelled',
    })
  })

  it('reports a failure when preserving partial subtitles after cancellation fails', async () => {
    const module = new PodcastModule()
    const episode = { id: 'episode-cancel-save-failure', transcriptReferences: [] }
    ;(module as any).asr = {
      prepare: vi.fn(async () => ({ episode, segments: segments(1), language: 'auto' })),
      transcribeSegment: vi.fn(async (_prepared, _segment, _onProgress, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new PodcastAsrCancelledError()), { once: true })
        })
      ),
    }
    global.lx = podcastGlobals(episode, null)
    ;(global.lx.worker.dbService as any).podcastTranscriptSave = vi.fn(
      async (_versionId: string, snapshot: LX.Podcast.TranscriptSnapshot) => {
        if (snapshot.interruptionReason === 'cancelled') throw new Error('disk full')
      }
    )

    await module.controlTranscription(episode.id, 'start')
    await vi.waitFor(() => expect(module.getTranscriptionStatus(episode.id)?.currentSegment).toBe(1))
    const job = (module as any).asrJobs.get(episode.id)
    await module.controlTranscription(episode.id, 'cancel')
    await job.promise

    expect(module.getTranscriptionStatus(episode.id)).toMatchObject({
      transcriptState: 'failed',
      stage: 'failed',
      error: '中止转写后保存部分字幕失败：disk full',
    })
  })

  it('prioritizes the current slice, then the next two slices', () => {
    const module = new PodcastModule()
    ;(module as any).currentEpisodeId = 'episode-priority'

    expect((module as any).segmentPriority('episode-priority', 4, 120_000)).toBe(0)
    expect((module as any).segmentPriority('episode-priority', 5, 120_000)).toBe(1)
    expect((module as any).segmentPriority('episode-priority', 6, 120_000)).toBe(2)
    expect((module as any).segmentPriority('episode-priority', 7, 120_000)).toBe(103)
    expect((module as any).segmentPriority('episode-priority', 3, 120_000)).toBe(1_001)
  })

  it('rejects restarting a publisher transcript', async () => {
    const module = new PodcastModule()
    ;(module as any).currentEpisodeId = 'episode-1'
    const status = {
      protocolVersion: 2,
      contentId: 'episode-1',
      transcriptState: 'ready',
      transcriptSource: 'publisher',
      revision: 1,
      isPartial: false,
      model: null,
      modelState: 'not-required',
      stage: 'completed',
      progress: 1,
      updatedAt: Date.now(),
    } satisfies LX.Podcast.TranscriptionStatus
    ;(module as any).transcriptionStatus = status
    ;(module as any).transcriptionStatuses.set('episode-1', status)
    global.lx = {
      worker: { dbService: { podcastTranscriptGet: vi.fn(async () => null) } },
    } as unknown as typeof global.lx

    await expect(module.controlTranscription('episode-1', 'restart')).rejects.toThrow(
      'Only a local ASR transcript can be restarted'
    )
  })
})

const segments = (count: number) => Array.from({ length: count }, (_, index) => ({
  index,
  startMs: index * 30_000,
  endMs: (index + 1) * 30_000,
  recognitionStartMs: index * 30_000,
  recognitionEndMs: (index + 1) * 30_000,
}))

const segmentLine = (contentId: string, index: number): LX.Podcast.TranscriptLine => ({
  id: `${contentId}:segment-${index}:line-0`,
  startMs: index * 30_000,
  endMs: (index + 1) * 30_000,
  displayText: `segment ${index}`,
  words: [],
})

const podcastGlobals = (
  episode: { id: string; sourceId?: string; transcriptReferences: never[] },
  stored: LX.Podcast.TranscriptSnapshot | null,
  onSave: (snapshot: LX.Podcast.TranscriptSnapshot) => void = () => undefined
) => ({
  appSetting: { 'podcast.asrModel': 'small', 'podcast.asrLanguage': 'auto' },
  player_status: { progress: 0 },
  event_app: { player_status: vi.fn() },
  worker: {
    dbService: {
      podcastEpisodeGet: vi.fn(async () => episode),
      podcastSourcesGet: vi.fn(async () => [{
        id: episode.sourceId ?? 'source-1',
        title: '测试节目',
        author: '测试主播',
        description: '测试节目简介',
        artworkUrl: '',
        feedUrl: '',
        categories: [],
        subscribed: true,
        autoDownload: false,
        groupId: 'default_group',
        subscriptionOrder: 0,
        updatedAt: 0,
      }]),
      podcastTranscriptGet: vi.fn(async () => stored),
      podcastTranscriptSave: vi.fn(async (_versionId, snapshot) => onSave(snapshot)),
    },
  },
}) as unknown as typeof global.lx
