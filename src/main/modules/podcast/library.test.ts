import { describe, expect, it, vi } from 'vitest'
import { PodcastModule } from './module'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

const state = (value: Partial<LX.Podcast.EpisodeState> = {}): LX.Podcast.EpisodeState => ({
  accountId: 'account-1',
  episodeId: 'episode-1',
  positionSeconds: 120,
  isFinished: false,
  isFavorite: false,
  dirtyMask: 0,
  clientUpdatedAt: 10,
  serverUpdatedAt: 5,
  ...value,
})

const source: LX.Podcast.Source = {
  id: 'source-1',
  title: '测试节目',
  author: '测试作者',
  description: '',
  artworkUrl: '',
  feedUrl: 'https://example.com/feed.xml',
  categories: [],
  subscribed: true,
  autoDownload: false,
  groupId: 'default_group',
  subscriptionOrder: 0,
  updatedAt: 1,
}

const episode = (id: string): LX.Podcast.Episode => ({
  id,
  sourceId: source.id,
  guid: id,
  title: `单集 ${id}`,
  description: '',
  artworkUrl: '',
  audioUrl: `https://example.com/${id}.mp3`,
  publishedAt: 1,
  durationSeconds: 600,
  transcriptReferences: [],
  chapters: [],
  updatedAt: 1,
})

describe('podcast library', () => {
  it('preserves playback progress when changing favorite state', async () => {
    const module = new PodcastModule()
    ;(module as any).session = {
      account: { id: 'account-1', email: 'user@example.com', username: '用户' },
      syncEnabled: false,
      syncState: 'idle',
    }
    const current = state()
    const podcastEpisodeStateSave = vi.fn()
    global.lx = {
      worker: { dbService: {
        podcastEpisodeStateGet: vi.fn(async () => current),
        podcastEpisodeStateSave,
      } },
    } as unknown as typeof global.lx

    await expect((module as any).setFavorite(current.episodeId, true)).resolves.toMatchObject({
      positionSeconds: current.positionSeconds,
      isFinished: current.isFinished,
      isFavorite: true,
      dirtyMask: 3,
    })
    expect(podcastEpisodeStateSave).toHaveBeenCalledWith(expect.objectContaining({
      episodeId: current.episodeId,
      isFavorite: true,
    }))
  })

  it('returns only favorite items and orders the newest state first', async () => {
    const module = new PodcastModule()
    ;(module as any).session = { account: null, syncEnabled: false, syncState: 'local' }
    const states = [
      state({ accountId: 'local', episodeId: 'old', isFavorite: true, clientUpdatedAt: 10 }),
      state({ accountId: 'local', episodeId: 'new', isFavorite: true, clientUpdatedAt: 20 }),
      state({ accountId: 'local', episodeId: 'plain', isFavorite: false, clientUpdatedAt: 30 }),
    ]
    global.lx = {
      worker: { dbService: {
        podcastEpisodeStatesGet: vi.fn(async () => states),
        podcastEpisodeGet: vi.fn(async (id: string) => episode(id)),
        podcastSourcesGet: vi.fn(async () => [source]),
      } },
    } as unknown as typeof global.lx

    const result = await (module as any).library('favorites') as LX.Podcast.LibraryItem[]

    expect(result.map((item) => item.episode.id)).toEqual(['new', 'old'])
  })

  it('includes started and finished episodes in history', async () => {
    const module = new PodcastModule()
    ;(module as any).session = { account: null, syncEnabled: false, syncState: 'local' }
    const states = [
      state({ accountId: 'local', episodeId: 'started', positionSeconds: 30 }),
      state({ accountId: 'local', episodeId: 'finished', positionSeconds: 0, isFinished: true }),
      state({ accountId: 'local', episodeId: 'untouched', positionSeconds: 0, isFinished: false }),
    ]
    global.lx = {
      worker: { dbService: {
        podcastEpisodeStatesGet: vi.fn(async () => states),
        podcastEpisodeGet: vi.fn(async (id: string) => episode(id)),
        podcastSourcesGet: vi.fn(async () => [source]),
      } },
    } as unknown as typeof global.lx

    const result = await (module as any).library('history') as LX.Podcast.LibraryItem[]

    expect(result.map((item) => item.episode.id)).toEqual(['started', 'finished'])
  })
})
