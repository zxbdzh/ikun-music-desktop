import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDB } from '../../db'
import {
  podcastEpisodeStateGet,
  podcastEpisodeStateSave,
  podcastTranscriptGet,
  podcastTranscriptSpeakerReferenceGet,
} from './index'

vi.mock('../../db', () => ({
  getDB: vi.fn(),
}))

describe('podcast episode state persistence', () => {
  it('stores hidden history as an integer flag', () => {
    const run = vi.fn((_row: unknown) => undefined)
    const prepare = vi.fn((_sql: string) => ({ run }))
    vi.mocked(getDB).mockReturnValue({ prepare } as unknown as ReturnType<typeof getDB>)

    podcastEpisodeStateSave({
      accountId: 'account-1',
      episodeId: 'episode-1',
      positionSeconds: 42,
      isFinished: false,
      isFavorite: true,
      historyHidden: true,
      dirtyMask: 3,
      clientUpdatedAt: 100,
      serverUpdatedAt: 90,
    })

    expect({ sql: prepare.mock.calls[0]?.[0], row: run.mock.calls[0]?.[0] }).toMatchObject({
      sql: expect.stringContaining('history_hidden'),
      row: { history_hidden: 1 },
    })
  })

  it('restores hidden history from an integer flag', () => {
    const get = vi.fn(() => ({
      account_id: 'account-1',
      episode_id: 'episode-1',
      position_seconds: 42,
      is_finished: 0,
      is_favorite: 1,
      history_hidden: 1,
      dirty_mask: 0,
      client_updated_at: 100,
      server_updated_at: 90,
    }))
    vi.mocked(getDB).mockReturnValue({
      prepare: vi.fn(() => ({ get })),
    } as unknown as ReturnType<typeof getDB>)

    expect(podcastEpisodeStateGet('account-1', 'episode-1')).toEqual({
      accountId: 'account-1',
      episodeId: 'episode-1',
      positionSeconds: 42,
      isFinished: false,
      isFavorite: true,
      historyHidden: true,
      dirtyMask: 0,
      clientUpdatedAt: 100,
      serverUpdatedAt: 90,
    })
  })
})

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
