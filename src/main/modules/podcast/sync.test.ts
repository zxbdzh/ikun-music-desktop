import { describe, expect, it, vi } from 'vitest'
import { PodcastModule } from './module'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

const account = { id: 'account-1', email: 'user@example.com', username: 'User' }

const source: LX.Podcast.Source = {
  id: 'source-1',
  title: 'Example Podcast',
  author: 'Example Author',
  description: 'Source description',
  artworkUrl: 'https://example.com/cover.jpg',
  feedUrl: 'https://example.com/feed.xml',
  categories: ['Technology'],
  subscribed: true,
  autoDownload: false,
  groupId: 'default_group',
  subscriptionOrder: 0,
  updatedAt: 1,
}

const episode: LX.Podcast.Episode = {
  id: 'episode-1',
  sourceId: source.id,
  guid: 'episode-guid-1',
  title: 'Example episode',
  description: 'Article summary',
  artworkUrl: 'https://example.com/episode.jpg',
  originalUrl: 'https://example.com/articles/episode-1',
  audioUrl: 'https://cdn.example.com/episode-1.mp3',
  publishedAt: Date.parse('2026-08-07T00:00:00.000Z'),
  durationSeconds: 1_800,
  transcriptReferences: [],
  chapters: [],
  updatedAt: 1,
}

const state = (value: Partial<LX.Podcast.EpisodeState> = {}): LX.Podcast.EpisodeState => ({
  accountId: account.id,
  episodeId: episode.id,
  positionSeconds: 120,
  isFinished: false,
  isFavorite: true,
  historyHidden: false,
  dirtyMask: 0,
  clientUpdatedAt: 1_786_032_010,
  serverUpdatedAt: 1_786_032_000,
  ...value,
})

const syncState = (): LX.Podcast.SyncState => ({
  accountId: account.id,
  watermark: 0,
  outbox: [],
  updatedAt: 0,
})

const createModule = (client: Record<string, unknown>) => {
  const module = new PodcastModule(client as any)
  ;(module as any).session = { account, syncEnabled: true, syncState: 'idle' }
  ;(module as any).deviceId = 'device-1'
  return module
}

describe('AurioClub progress synchronization', () => {
  it('uploads real article/audio metadata and the hidden-history flag', async () => {
    const pushProgressBatch = vi.fn(async (_body: Record<string, unknown>) => undefined)
    const client = {
      pushProgressBatch,
      pull: vi.fn(async () => ({ states: [], server_time: 20 })),
    }
    const dirtyState = state({ dirtyMask: 3, historyHidden: true })
    const podcastEpisodeStatesMarkClean = vi.fn(async () => undefined)
    global.lx = { worker: { dbService: {
      podcastSyncStateGet: vi.fn(async () => syncState()),
      podcastEpisodeStatesGet: vi.fn(async () => [dirtyState]),
      podcastSourcesGet: vi.fn(async () => [source]),
      podcastEpisodeGet: vi.fn(async () => episode),
      podcastLongFormContentGet: vi.fn(async () => ({
        protocolVersion: 1,
        contentId: episode.id,
        revision: 1,
        title: episode.title,
        blocks: [{ id: 'block-1', kind: 'paragraph', text: 'Full article body' }],
        blockCount: 1,
        characterCount: 17,
        originalUrl: episode.originalUrl,
        audioUrl: episode.audioUrl,
        shareUrl: episode.originalUrl,
      })),
      podcastEpisodeStatesMarkClean,
      podcastSyncStateSave: vi.fn(async () => undefined),
    } } } as unknown as typeof global.lx

    await (createModule(client) as any).performSync()

    expect(pushProgressBatch).toHaveBeenCalledOnce()
    const body = pushProgressBatch.mock.calls[0][0] as any
    expect(body).toMatchObject({ user_id: account.id, device_id: 'device-1' })
    expect(body.items[0]).toMatchObject({
      podcast_id: episode.id,
      history_hidden: 1,
      position_seconds: dirtyState.positionSeconds,
      is_favorite: 1,
    })
    expect(JSON.parse(body.items[0].article_metadata_json)).toMatchObject({
      articleId: episode.id,
      title: episode.title,
      description: episode.description,
      content: 'Full article body',
      url: episode.originalUrl,
      audioUrl: episode.audioUrl,
      source: { name: source.title, url: source.feedUrl },
    })
    expect(podcastEpisodeStatesMarkClean).toHaveBeenCalledWith([dirtyState])
  })

  it('restores remote-only entities and hides them from history without hiding favorites', async () => {
    const sources: LX.Podcast.Source[] = []
    const episodes = new Map<string, LX.Podcast.Episode>()
    const states = new Map<string, LX.Podcast.EpisodeState>()
    const metadata = JSON.stringify({
      articleId: 'remote-article',
      title: 'Remote article',
      description: 'Summary',
      content: 'Long blog body',
      url: 'https://example.com/articles/remote-article',
      image: 'https://example.com/remote.jpg',
      displayTime: 1_786_032_000,
      source: { name: 'Remote Blog', url: 'https://example.com/feed.xml' },
      tags: ['Blog'],
      audioUrl: 'https://cdn.example.com/remote-article.mp3',
      audioDuration: 600,
    })
    const client = {
      pull: vi.fn(async () => ({
        states: [{
          podcast_id: 'remote-article',
          server_updated_at: 1_786_032_100,
          position_seconds: 300,
          is_finished: 0,
          is_favorite: 1,
          history_hidden: 1,
          article_metadata_json: metadata,
        }],
        server_time: 1_786_032_100,
      })),
    }
    const podcastSourcesSave = vi.fn(async (items: LX.Podcast.Source[]) => {
      sources.push(...items)
    })
    const podcastEpisodesSave = vi.fn(async (items: LX.Podcast.Episode[]) => {
      for (const item of items) episodes.set(item.id, item)
    })
    const podcastEpisodeStateSave = vi.fn(async (item: LX.Podcast.EpisodeState) => {
      states.set(item.episodeId, item)
    })
    const podcastLibraryPageGet = vi.fn(async (
      _accountId: string,
      kind: LX.Podcast.LibraryKind
    ): Promise<LX.Podcast.LibraryPage> => ({
      items: [...states.values()]
        .filter((item) => kind === 'favorites'
          ? item.isFavorite
          : !item.historyHidden && (item.positionSeconds > 0 || item.isFinished))
        .map((item) => ({
          episode: episodes.get(item.episodeId)!,
          source: sources.find((source) => source.id === episodes.get(item.episodeId)?.sourceId)!,
          state: item,
        })),
      nextCursor: null,
    }))
    global.lx = { worker: { dbService: {
      podcastSyncStateGet: vi.fn(async () => syncState()),
      podcastEpisodeStatesGet: vi.fn(async (_accountId: string, dirtyOnly = false) =>
        dirtyOnly ? [] : [...states.values()]),
      podcastEpisodeStateGet: vi.fn(async (_accountId: string, episodeId: string) =>
        states.get(episodeId) ?? null),
      podcastEpisodeStateSave,
      podcastSourcesGet: vi.fn(async () => sources),
      podcastSourcesSave,
      podcastEpisodeGet: vi.fn(async (episodeId: string) => episodes.get(episodeId) ?? null),
      podcastEpisodesSave,
      podcastLibraryPageGet,
      podcastLongFormContentsSave: vi.fn(async () => undefined),
      podcastSyncStateSave: vi.fn(async () => undefined),
    } } } as unknown as typeof global.lx
    const module = createModule(client)

    await (module as any).performSync()
    const favorites = await (module as any).library('favorites') as LX.Podcast.LibraryPage
    const history = await (module as any).library('history') as LX.Podcast.LibraryPage

    expect(podcastSourcesSave).toHaveBeenCalledOnce()
    expect(podcastEpisodesSave).toHaveBeenCalledOnce()
    expect(podcastEpisodeStateSave).toHaveBeenCalledWith(expect.objectContaining({
      episodeId: 'remote-article',
      historyHidden: true,
    }))
    expect(episodes.get('remote-article')).toMatchObject({
      description: 'Summary',
      originalUrl: 'https://example.com/articles/remote-article',
      audioUrl: 'https://cdn.example.com/remote-article.mp3',
    })
    expect(favorites.items.map((item) => item.episode.id)).toEqual(['remote-article'])
    expect(history.items).toEqual([])
  })

  it('restores missing entities before preserving a newer dirty local state', async () => {
    const localState = state({ episodeId: 'remote-article', dirtyMask: 3 })
    const podcastEpisodeStateSave = vi.fn(async () => undefined)
    const podcastSourcesSave = vi.fn(async () => undefined)
    const podcastEpisodesSave = vi.fn(async () => undefined)
    const client = {
      pull: vi.fn(async () => ({
        states: [{
          podcast_id: 'remote-article',
          server_updated_at: 10,
          is_favorite: 1,
          article_metadata_json: JSON.stringify({
            articleId: 'remote-article',
            title: 'Remote article',
            url: 'https://example.com/articles/remote-article',
          }),
        }],
        server_time: 10,
      })),
    }
    global.lx = { worker: { dbService: {
      podcastSyncStateGet: vi.fn(async () => syncState()),
      podcastEpisodeStatesGet: vi.fn(async () => []),
      podcastEpisodeStateGet: vi.fn(async () => localState),
      podcastEpisodeStateSave,
      podcastSourcesGet: vi.fn(async () => []),
      podcastSourcesSave,
      podcastEpisodeGet: vi.fn(async () => null),
      podcastEpisodesSave,
      podcastLongFormContentsSave: vi.fn(async () => undefined),
      podcastSyncStateSave: vi.fn(async () => undefined),
    } } } as unknown as typeof global.lx

    await (createModule(client) as any).performSync()

    expect(podcastSourcesSave).toHaveBeenCalledOnce()
    expect(podcastEpisodesSave).toHaveBeenCalledOnce()
    expect(podcastEpisodeStateSave).not.toHaveBeenCalled()
  })

  it('fills only missing article and audio URLs on an existing Episode', async () => {
    const existingEpisode = {
      ...episode,
      title: 'Complete local RSS title',
      description: 'Complete local RSS body',
      artworkUrl: 'https://example.com/local-cover.jpg',
      originalUrl: '',
      audioUrl: '',
    }
    const podcastEpisodesSave = vi.fn(async () => undefined)
    const client = {
      pull: vi.fn(async () => ({
        states: [{
          podcast_id: episode.id,
          server_updated_at: 20,
          article_metadata_json: JSON.stringify({
            articleId: episode.id,
            title: 'Remote title must not replace RSS',
            content: 'Remote body must not replace RSS',
            url: 'https://example.com/articles/recovered',
            image: 'https://example.com/remote-cover.jpg',
            audioUrl: 'https://cdn.example.com/recovered.mp3',
          }),
        }],
        server_time: 20,
      })),
    }
    global.lx = { worker: { dbService: {
      podcastSyncStateGet: vi.fn(async () => syncState()),
      podcastEpisodeStatesGet: vi.fn(async () => []),
      podcastEpisodeStateGet: vi.fn(async () => null),
      podcastEpisodeStateSave: vi.fn(async () => undefined),
      podcastSourcesGet: vi.fn(async () => [source]),
      podcastEpisodeGet: vi.fn(async () => existingEpisode),
      podcastLongFormContentGet: vi.fn(async () => null),
      podcastEpisodesSave,
      podcastLongFormContentsSave: vi.fn(async () => undefined),
      podcastSyncStateSave: vi.fn(async () => undefined),
    } } } as unknown as typeof global.lx

    await (createModule(client) as any).performSync()

    expect(podcastEpisodesSave).toHaveBeenCalledWith([{
      ...existingEpisode,
      originalUrl: 'https://example.com/articles/recovered',
      audioUrl: 'https://cdn.example.com/recovered.mp3',
    }])
  })

  it.each(['current', 'stale'] as const)(
    'does not overwrite a complete RSS Episode or the %s local state',
    async (conflict) => {
      const localState = state({
        dirtyMask: 0,
        serverUpdatedAt: conflict === 'stale' ? 20 : 0,
      })
      const podcastEpisodeStateSave = vi.fn(async () => undefined)
      const podcastEpisodesSave = vi.fn(async () => undefined)
      const podcastLongFormContentsSave = vi.fn(async () => undefined)
      const client = {
        pull: vi.fn(async () => ({
          states: [{
            podcast_id: episode.id,
            server_updated_at: 10,
            position_seconds: 999,
            article_metadata_json: JSON.stringify({
              articleId: episode.id,
              title: 'Remote title must not replace RSS',
              content: 'Remote body must not replace RSS',
              url: 'https://example.com/remote-article',
              audioUrl: 'https://cdn.example.com/remote.mp3',
            }),
          }],
          server_time: 10,
        })),
      }
      global.lx = { worker: { dbService: {
        podcastSyncStateGet: vi.fn(async () => syncState()),
        podcastEpisodeStatesGet: vi.fn(async () => []),
        podcastEpisodeStateGet: vi.fn(async () => localState),
        podcastEpisodeStateSave,
        podcastSourcesGet: vi.fn(async () => [source]),
        podcastEpisodeGet: vi.fn(async () => episode),
        podcastLongFormContentGet: vi.fn(async () => ({
          protocolVersion: 1,
          contentId: episode.id,
          revision: 1,
          title: episode.title,
          blocks: [{ id: 'block-1', kind: 'paragraph', text: 'Local RSS body' }],
          blockCount: 1,
          characterCount: 14,
          originalUrl: episode.originalUrl,
          audioUrl: episode.audioUrl,
          shareUrl: episode.originalUrl,
        })),
        podcastEpisodesSave,
        podcastLongFormContentsSave,
        podcastSyncStateSave: vi.fn(async () => undefined),
      } } } as unknown as typeof global.lx
      const module = createModule(client)
      if (conflict === 'current') (module as any).currentEpisodeId = episode.id

      await (module as any).performSync()

      expect(podcastEpisodesSave).not.toHaveBeenCalled()
      expect(podcastLongFormContentsSave).not.toHaveBeenCalled()
      expect(podcastEpisodeStateSave).not.toHaveBeenCalled()
    }
  )
})
