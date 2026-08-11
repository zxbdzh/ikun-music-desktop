import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PodcastStorage } from './storage'

let tempDir = ''

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
  tempDir = ''
})

describe('PodcastStorage download state', () => {
  it('restores a completed download from disk across storage instances', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ikun-podcast-storage-'))
    global.lx = {
      appSetting: {
        'podcast.downloadPath': tempDir,
        'podcast.cachePath': tempDir,
      },
    } as unknown as typeof global.lx
    const episode = testEpisode()
    await writeFile(path.join(tempDir, `${episode.id}.mp3`), 'audio')

    await expect(new PodcastStorage().downloadState(episode)).resolves.toEqual({
      episodeId: episode.id,
      isDownloaded: true,
    })
  })

  it('does not treat a partial file as a completed download', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ikun-podcast-storage-'))
    global.lx = {
      appSetting: {
        'podcast.downloadPath': tempDir,
        'podcast.cachePath': tempDir,
      },
    } as unknown as typeof global.lx
    const episode = testEpisode()
    await writeFile(path.join(tempDir, `${episode.id}.mp3.part`), 'partial')

    await expect(new PodcastStorage().downloadState(episode)).resolves.toEqual({
      episodeId: episode.id,
      isDownloaded: false,
    })
  })
})

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
