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
  historyHidden: false,
  dirtyMask: 0,
  clientUpdatedAt: 10,
  serverUpdatedAt: 5,
  ...value,
})

describe('podcast library', () => {
  it('preserves playback progress when changing favorite state', async () => {
    const module = new PodcastModule()
    ;(module as any).session = {
      account: { id: 'account-1', email: 'user@example.com', username: '用户' },
      syncEnabled: false,
      syncState: 'idle',
    }
    const current = state({ historyHidden: true })
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
      historyHidden: true,
      dirtyMask: 3,
    })
    expect(podcastEpisodeStateSave).toHaveBeenCalledWith(expect.objectContaining({
      episodeId: current.episodeId,
      isFavorite: true,
    }))
  })

  it('preserves favorite and hidden-history state when saving playback progress', async () => {
    const module = new PodcastModule()
    ;(module as any).session = {
      account: { id: 'account-1', email: 'user@example.com', username: '用户' },
      syncEnabled: false,
      syncState: 'idle',
    }
    const current = state({ isFavorite: true, historyHidden: true })
    const podcastEpisodeStateSave = vi.fn()
    global.lx = {
      worker: { dbService: {
        podcastEpisodeStateGet: vi.fn(async () => current),
        podcastEpisodeStateSave,
      } },
    } as unknown as typeof global.lx

    await expect((module as any).saveProgress(current.episodeId, 240, false)).resolves.toMatchObject({
      positionSeconds: 240,
      isFavorite: true,
      historyHidden: true,
      dirtyMask: 3,
    })
  })

  it('forwards the account, kind, cursor and page size to database pagination', async () => {
    const module = new PodcastModule()
    ;(module as any).session = {
      account: { id: 'account-1', email: 'user@example.com', username: '用户' },
      syncEnabled: false,
      syncState: 'idle',
    }
    const cursor = { clientUpdatedAt: 25, episodeId: 'episode-25' }
    const page: LX.Podcast.LibraryPage = {
      items: [],
      nextCursor: { clientUpdatedAt: 10, episodeId: 'episode-10' },
    }
    const podcastLibraryPageGet = vi.fn(async () => page)
    global.lx = {
      worker: { dbService: { podcastLibraryPageGet } },
    } as unknown as typeof global.lx

    const result = await (module as any).library('favorites', cursor, 25)

    expect(result).toBe(page)
    expect(podcastLibraryPageGet).toHaveBeenCalledWith('account-1', 'favorites', cursor, 25)
  })

  it('uses the local account and default page size when pagination is omitted', async () => {
    const module = new PodcastModule()
    ;(module as any).session = { account: null, syncEnabled: false, syncState: 'local' }
    const page: LX.Podcast.LibraryPage = { items: [], nextCursor: null }
    const podcastLibraryPageGet = vi.fn(async () => page)
    global.lx = {
      worker: { dbService: { podcastLibraryPageGet } },
    } as unknown as typeof global.lx

    await expect((module as any).library('history')).resolves.toBe(page)

    expect(podcastLibraryPageGet).toHaveBeenCalledWith('local', 'history', undefined, 50)
  })
})
