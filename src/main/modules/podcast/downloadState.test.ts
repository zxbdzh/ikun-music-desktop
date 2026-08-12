import { describe, expect, it, vi } from 'vitest'
import type { AurioClubClient } from './aurioClubClient'
import { PodcastModule } from './module'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.4.5' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

describe('PodcastModule download state commands', () => {
  it('returns persisted states for unique episode ids and reports missing episodes', async () => {
    const module = preparedModule()
    const episode = testEpisode()
    const downloadState = vi.fn(async (value: LX.Podcast.Episode) => ({
      episodeId: value.id,
      isDownloaded: true,
    }))
    ;(module as any).storage = { downloadState }
    global.lx = {
      worker: {
        dbService: {
          podcastEpisodeGet: vi.fn(async (episodeId: string) =>
            episodeId === episode.id ? episode : null
          ),
        },
      },
    } as unknown as typeof global.lx

    await expect(module.execute({
      action: 'download-states',
      episodeIds: [episode.id, 'missing', episode.id],
    })).resolves.toEqual([
      { episodeId: episode.id, isDownloaded: true },
      { episodeId: 'missing', isDownloaded: false },
    ])
    expect(downloadState).toHaveBeenCalledOnce()
  })

  it('returns a downloaded state only after the file operation succeeds', async () => {
    const module = preparedModule()
    const episode = testEpisode()
    const downloadEpisode = vi.fn(async () => 'C:\\podcasts\\episode-1.mp3')
    ;(module as any).storage = { downloadEpisode }
    global.lx = {
      worker: {
        dbService: { podcastEpisodeGet: vi.fn(async () => episode) },
      },
    } as unknown as typeof global.lx

    await expect(module.execute({
      action: 'download-episode',
      episodeId: episode.id,
    })).resolves.toEqual({ episodeId: episode.id, isDownloaded: true })
    expect(downloadEpisode).toHaveBeenCalledWith(episode, 'download')
  })

  it('does not query storage or download when a blog has no audio URL', async () => {
    const module = preparedModule()
    const episode = testEpisode({ audioUrl: '' })
    const downloadState = vi.fn()
    const downloadEpisode = vi.fn()
    ;(module as any).storage = { downloadState, downloadEpisode }
    global.lx = {
      worker: {
        dbService: { podcastEpisodeGet: vi.fn(async () => episode) },
      },
    } as unknown as typeof global.lx

    await expect(module.execute({
      action: 'download-states',
      episodeIds: [episode.id],
    })).resolves.toEqual([{ episodeId: episode.id, isDownloaded: false }])
    await expect(module.execute({
      action: 'download-episode',
      episodeId: episode.id,
    })).rejects.toThrow('当前博客没有可下载的音频')
    expect(downloadState).not.toHaveBeenCalled()
    expect(downloadEpisode).not.toHaveBeenCalled()
  })
})

const preparedModule = () => {
  const module = new PodcastModule({} as AurioClubClient)
  ;(module as any).initialized = true
  return module
}

const testEpisode = (value: Partial<LX.Podcast.Episode> = {}): LX.Podcast.Episode => ({
  id: 'episode-1',
  sourceId: 'source-1',
  guid: 'guid-1',
  title: 'Episode 1',
  description: '',
  artworkUrl: '',
  audioUrl: 'https://cdn.example.com/episode-1.mp3',
  publishedAt: 0,
  durationSeconds: 60,
  transcriptReferences: [],
  chapters: [],
  updatedAt: 0,
  ...value,
})
