import { describe, expect, it } from 'vitest'
import { createTranscriptDelta, lineFromSegment, shouldRetryAsr } from './transcript'

describe('podcast transcript', () => {
  it('does not invent word timing when the source only supplies line timing', () => {
    const line = lineFromSegment('episode', 0, 1_000, 5_000, '今天 build a player。')
    expect(line.displayText).toBe('今天 build a player。')
    expect(line.words).toEqual([])
  })

  it('prefers real token timing when ASR supplies it', () => {
    const line = lineFromSegment('episode', 0, 1_000, 4_000, '今天 build', [
      { startMs: 1_100, endMs: 1_500, text: '今' },
      { startMs: 1_500, endMs: 1_900, text: '天' },
      { startMs: 2_200, endMs: 3_600, text: ' build' },
    ])

    expect(line.words.map(({ startIndex, length, startMs, endMs }) => ({ startIndex, length, startMs, endMs }))).toEqual([
      { startIndex: 0, length: 1, startMs: 1_100, endMs: 1_500 },
      { startIndex: 1, length: 1, startMs: 1_500, endMs: 1_900 },
      { startIndex: 3, length: 5, startMs: 2_200, endMs: 3_600 },
    ])
  })

  it('returns no lines when the caller already has the current revision', () => {
    const snapshot: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: 'episode',
      revision: 2,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [lineFromSegment('episode', 0, 0, 1_000, 'hello')],
      speakers: [],
    }
    expect(createTranscriptDelta(snapshot, 2).upsertLines).toEqual([])
  })

  it('creates an incremental delta from a known base revision', () => {
    const firstLine = lineFromSegment('episode', 'segment-0:line-0', 0, 1_000, 'hello')
    const base: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: 'episode',
      revision: 2,
      state: 'preparing',
      source: 'asr',
      language: 'auto',
      isPartial: true,
      lines: [firstLine],
      speakers: [],
    }
    const next = {
      ...base,
      revision: 3,
      lines: [...base.lines, lineFromSegment('episode', 'segment-1:line-0', 1_000, 2_000, 'world')],
    }

    expect(createTranscriptDelta(next, 2, base)).toMatchObject({
      protocolVersion: 2,
      baseRevision: 2,
      revision: 3,
      reset: false,
      upsertLines: [expect.objectContaining({ displayText: 'world' })],
    })
  })

  it('retries a failed local ASR snapshot on the next request', () => {
    const failed: LX.Podcast.TranscriptSnapshot = {
      protocolVersion: 2,
      contentId: 'episode',
      revision: 2,
      state: 'failed',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [],
      speakers: [],
      error: 'sidecar missing',
    }

    expect(shouldRetryAsr(failed)).toBe(true)
    expect(shouldRetryAsr({ ...failed, source: 'publisher' })).toBe(false)
    expect(shouldRetryAsr({ ...failed, state: 'ready' })).toBe(false)
  })
})
