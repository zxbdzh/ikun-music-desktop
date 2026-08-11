import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDB } from '../../db'
import { podcastTranscriptGet, podcastTranscriptSpeakerReferenceGet } from './index'

vi.mock('../../db', () => ({
  getDB: vi.fn(),
}))

describe('podcastTranscriptGet', () => {
  const transcriptRow = vi.fn()
  const transcriptRows = vi.fn()

  beforeEach(() => {
    transcriptRow.mockReset()
    transcriptRows.mockReset()
    vi.mocked(getDB).mockReturnValue({
      prepare: vi.fn(() => ({ get: transcriptRow, all: transcriptRows })),
    } as unknown as ReturnType<typeof getDB>)
  })

  it('rejects a legacy transcript snapshot without protocol version 2', () => {
    transcriptRow.mockReturnValue({
      snapshot_json: JSON.stringify({
        contentId: 'episode-legacy',
        revision: 4,
        state: 'ready',
        source: 'asr',
        language: 'auto',
        isPartial: false,
        lines: [],
        speakers: [],
      }),
    })

    expect(podcastTranscriptGet('episode-legacy')).toBeNull()
  })

  it('returns a protocol version 2 transcript snapshot', () => {
    const snapshot = {
      protocolVersion: 2,
      contentId: 'episode-v2',
      revision: 5,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [],
      speakers: [],
    }
    transcriptRow.mockReturnValue({ snapshot_json: JSON.stringify(snapshot) })

    expect(podcastTranscriptGet('episode-v2')).toEqual(snapshot)
  })

  it('returns the latest valid historical snapshot with speaker labels', () => {
    const reference = {
      protocolVersion: 2,
      contentId: 'episode-v2',
      revision: 5,
      state: 'ready',
      source: 'asr',
      language: 'auto',
      isPartial: false,
      lines: [{
        id: 'line-1',
        startMs: 0,
        endMs: 1_000,
        displayText: 'hello',
        words: [],
        speakerId: 'speaker-1',
      }],
      speakers: [{ id: 'speaker-1', name: 'Host', origin: 'ai' }],
    }
    transcriptRows.mockReturnValue([
      { snapshot_json: '{invalid' },
      { snapshot_json: JSON.stringify({ ...reference, speakers: [] }) },
      { snapshot_json: JSON.stringify(reference) },
    ])

    expect(podcastTranscriptSpeakerReferenceGet('episode-v2')).toEqual(reference)
  })
})
