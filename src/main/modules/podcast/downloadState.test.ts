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
})

const preparedModule = () => {
  const module = new PodcastModule({} as AurioClubClient)
  ;(module as any).initialized = true
  return module
}

const testEpisode = (): LX.Podcast.Episode => ({
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
})
