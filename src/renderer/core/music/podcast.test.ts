import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPodcastCommand } from '@renderer/utils/ipc'
import {
  activatePodcastEpisode,
  cancelPendingLyricRequest,
  getLyricInfo,
  getMusicUrl,
  startPodcastLyricRefresh,
} from './podcast'

vi.mock('@renderer/utils/ipc', () => ({
  sendPodcastCommand: vi.fn(),
}))

const transcript = (
  state: LX.Podcast.TranscriptState,
  revision: number,
  lines: LX.Podcast.TranscriptLine[] = []
): LX.Podcast.TranscriptDelta => ({
  protocolVersion: 2,
  contentId: 'episode-1',
  baseRevision: 0,
  revision,
  reset: true,
  state,
  isPartial: state !== 'ready',
  upsertLines: lines,
  deletedLineIds: [],
  speakers: [],
})

describe('podcast lyrics', () => {
  beforeEach(() => {
    vi.mocked(sendPodcastCommand).mockReset()
  })

  it('returns available partial lines without waiting for the whole episode', async () => {
    vi.mocked(sendPodcastCommand).mockResolvedValueOnce(
      transcript('preparing', 2, [
        {
          id: 'line-1',
          startMs: 1_000,
          endMs: 2_000,
          displayText: 'Hello podcast',
          words: [],
        },
      ])
    )

    const result = await getLyricInfo({ id: 'episode-1' } as LX.Music.MusicInfoPodcast)

    expect(result.lyric).toContain('[00:01.000]Hello podcast')
    expect(sendPodcastCommand).toHaveBeenCalledTimes(1)
  })

  it('marks an ungenerated gap instead of leaving the last old line active', async () => {
    vi.mocked(sendPodcastCommand).mockResolvedValueOnce(
      transcript('preparing', 9, [
        {
          id: 'line-before-gap',
          startMs: 57_680,
          endMs: 59_040,
          displayText: '很有幸福感的事呢',
          words: [],
        },
        {
          id: 'line-after-gap',
          startMs: 4_018_000,
          endMs: 4_022_360,
          displayText: '是让我想起我们之前嘉宾说的一句话',
          words: [],
        },
      ])
    )

    const result = await getLyricInfo({ id: 'episode-1' } as LX.Music.MusicInfoPodcast)

    expect(result.lyric).toContain('[00:59.041]当前片段正在生成')
    expect(result.lyric).toContain('[66:58.000]是让我想起')
  })

  it('stops polling when playback switches away from the episode', async () => {
    let resolvePreparing!: (value: LX.Podcast.TranscriptDelta) => void
    vi.mocked(sendPodcastCommand).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePreparing = resolve
        })
    )

    const request = getLyricInfo({ id: 'episode-1' } as LX.Music.MusicInfoPodcast)
    cancelPendingLyricRequest()
    resolvePreparing(transcript('preparing', 1))

    await expect(request).rejects.toThrow('superseded')
    expect(sendPodcastCommand).toHaveBeenCalledTimes(1)
  })

  it('publishes newly generated transcript revisions while the episode is playing', async () => {
    vi.useFakeTimers()
    vi.mocked(sendPodcastCommand).mockResolvedValueOnce(
      transcript('preparing', 10, [
        {
          id: 'new-line',
          startMs: 3_505_000,
          endMs: 3_508_000,
          displayText: '新生成的当前句子',
          words: [],
        },
      ])
    )
    const onUpdate = vi.fn()

    startPodcastLyricRefresh(
      { id: 'episode-1' } as LX.Music.MusicInfoPodcast,
      onUpdate,
      100
    )
    await vi.advanceTimersByTimeAsync(100)

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ lyric: expect.stringContaining('新生成的当前句子') })
    )
    cancelPendingLyricRequest()
    vi.useRealTimers()
  })
})

describe('podcast playback activation', () => {
  beforeEach(() => {
    vi.mocked(sendPodcastCommand).mockReset()
  })

  it('activates a restored podcast episode', async () => {
    const podcast = {
      id: 'episode-1',
      meta: { podcast: true },
    } as LX.Music.MusicInfoPodcast

    await expect(activatePodcastEpisode(podcast)).resolves.toBe(podcast)
    expect(sendPodcastCommand).toHaveBeenCalledWith({
      action: 'activate-episode',
      episodeId: 'episode-1',
    })
  })

  it('activates a podcast wrapped in download progress metadata', async () => {
    const podcast = {
      id: 'episode-2',
      meta: { podcast: true },
    } as LX.Music.MusicInfoPodcast
    const download = {
      progress: 50,
      metadata: { musicInfo: podcast },
    } as unknown as LX.Download.ListItem

    await expect(activatePodcastEpisode(download)).resolves.toBe(podcast)
    expect(sendPodcastCommand).toHaveBeenCalledWith({
      action: 'activate-episode',
      episodeId: 'episode-2',
    })
  })

  it('does not activate ordinary music', async () => {
    const music = {
      id: 'music-1',
      meta: {},
    } as LX.Music.MusicInfo

    await expect(activatePodcastEpisode(music)).resolves.toBeNull()
    expect(sendPodcastCommand).not.toHaveBeenCalled()
  })

  it('rejects a blog without audio before activating playback', async () => {
    const blog = {
      id: 'article-1',
      meta: { podcast: true, audioUrl: '' },
    } as LX.Music.MusicInfoPodcast

    await expect(getMusicUrl(blog)).rejects.toThrow('当前博客没有可播放的音频')
    expect(sendPodcastCommand).not.toHaveBeenCalled()
  })
})
