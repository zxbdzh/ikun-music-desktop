import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDB } from '../../db'
import {
  podcastEpisodeStateGet,
  podcastEpisodeStateSave,
  podcastLibraryPageGet,
  podcastLongFormContentGet,
  podcastLongFormContentsSave,
  podcastTranscriptGet,
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

describe('podcast library pagination', () => {
  const libraryRow = (episodeId: string, clientUpdatedAt: number) => ({
    episode_id: episodeId,
    episode_source_id: 'source-1',
    episode_title: `Episode ${episodeId}`,
    episode_artwork_url: 'https://example.com/episode.jpg',
    episode_original_url: `https://example.com/articles/${episodeId}`,
    episode_audio_url: '',
    episode_published_at: 100,
    episode_duration_seconds: 0,
    source_id: 'source-1',
    source_title: 'Example source',
    source_artwork_url: 'https://example.com/source.jpg',
    account_id: 'account-1',
    position_seconds: 0,
    is_finished: 0,
    is_favorite: 1,
    history_hidden: 0,
    dirty_mask: 0,
    client_updated_at: clientUpdatedAt,
    server_updated_at: 0,
  })

  it('queries lightweight fields with limit plus one and returns a joint cursor', () => {
    const all = vi.fn(() => [
      libraryRow('episode-3', 300),
      libraryRow('episode-2', 200),
      libraryRow('episode-1', 100),
    ])
    const prepare = vi.fn((_sql: string) => ({ all }))
    vi.mocked(getDB).mockReturnValue({ prepare } as unknown as ReturnType<typeof getDB>)

    const result = podcastLibraryPageGet(
      'account-1',
      'favorites',
      { clientUpdatedAt: 400, episodeId: 'episode-4' },
      2
    )

    const sql = prepare.mock.calls[0]?.[0] ?? ''
    expect(sql).toContain('episode.title AS episode_title')
    expect(sql).not.toContain('episode.description')
    expect(sql).toContain('state.client_updated_at < @cursorUpdatedAt')
    expect(sql).toContain('state.episode_id < @cursorEpisodeId')
    expect(all).toHaveBeenCalledWith({
      accountId: 'account-1',
      cursorUpdatedAt: 400,
      cursorEpisodeId: 'episode-4',
      fetchLimit: 3,
    })
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          episode: {
            id: 'episode-3',
            sourceId: 'source-1',
            title: 'Episode episode-3',
            artworkUrl: 'https://example.com/episode.jpg',
            originalUrl: 'https://example.com/articles/episode-3',
            audioUrl: '',
            publishedAt: 100,
            durationSeconds: 0,
          },
        }),
        expect.objectContaining({ episode: expect.objectContaining({ id: 'episode-2' }) }),
      ],
      nextCursor: { clientUpdatedAt: 200, episodeId: 'episode-2' },
    })
  })

  it('rejects non-finite limits and malformed cursors before querying', () => {
    const prepare = vi.fn()
    vi.mocked(getDB).mockReturnValue({ prepare } as unknown as ReturnType<typeof getDB>)

    expect(() => podcastLibraryPageGet('account-1', 'history', undefined, Number.NaN))
      .toThrow('无效的资料库分页大小')
    expect(() => podcastLibraryPageGet(
      'account-1',
      'history',
      { clientUpdatedAt: Number.POSITIVE_INFINITY, episodeId: '' }
    )).toThrow('无效的资料库分页游标')
    expect(prepare).not.toHaveBeenCalled()
  })
})

describe('podcastTranscriptGet', () => {
  const transcriptRow = vi.fn()
  beforeEach(() => {
    transcriptRow.mockReset()
    vi.mocked(getDB).mockReturnValue({
      prepare: vi.fn(() => ({ get: transcriptRow })),
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

})

describe('podcast long-form content persistence', () => {
  it('stores and restores a protocol v1 document', () => {
    const run = vi.fn()
    const get = vi.fn(() => ({ document_json: JSON.stringify({
      protocolVersion: 1,
      contentId: 'episode-1',
      revision: 3,
      title: 'Article',
      blocks: [{ id: 'block-1', kind: 'paragraph', text: 'Body' }],
      blockCount: 1,
      characterCount: 4,
      originalUrl: null,
      audioUrl: null,
      shareUrl: null,
    }) }))
    vi.mocked(getDB).mockReturnValue({
      prepare: vi.fn((sql: string) => sql.includes('SELECT') ? { get } : { run }),
      transaction: (callback: (items: unknown[]) => void) => callback,
    } as unknown as ReturnType<typeof getDB>)

    const document = podcastLongFormContentGet('episode-1')!
    podcastLongFormContentsSave([document])

    expect(document.blocks[0].text).toBe('Body')
    expect(run).toHaveBeenCalledWith('episode-1', JSON.stringify(document), expect.any(Number))
  })
})
